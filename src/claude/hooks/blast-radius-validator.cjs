#!/usr/bin/env node
/**
 * iSDLC Blast Radius Validator - PreToolUse Hook
 * ================================================
 * Validates that implementation branch covers all files identified in
 * impact-analysis.md. Blocks GATE-06 advancement when unaddressed files exist.
 * Fails open on all internal errors (Article X, NFR-002).
 *
 * Traces to: REQ-001, REQ-002, REQ-005, REQ-006, REQ-007
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
    debugLog,
    getProjectRoot,
    getTimestamp,
    logHookEvent
} = require('./lib/common.cjs');

// ---------------------------------------------------------------------------
// Constants -- Regex patterns for markdown table parsing (ADR-0002)
// ---------------------------------------------------------------------------

/**
 * Match any markdown table row containing a backtick-wrapped file path.
 * Captures: group 1 = file path
 * Traces to: REQ-006 AC-006-01, BUG-0055 FR-001 AC-001-02
 */
const FILE_ROW = /^\|.*`([^`]+)`.*\|/;

/**
 * Scan any column for change type keywords (case-insensitive).
 * Supports: CREATE, MODIFY, DELETE, NO CHANGE, New, Major modify, Minor modify.
 * Traces to: BUG-0055 FR-001 AC-001-04
 */
const CHANGE_TYPE_KEYWORDS = /\b(CREATE|MODIFY|DELETE|NEW|NO\s*CHANGE|MAJOR\s+MODIFY|MINOR\s+MODIFY)\b/i;

/**
 * @deprecated Retained for reference only. Replaced by FILE_ROW + CHANGE_TYPE_KEYWORDS
 * for flexible column-count support (BUG-0055).
 */
const IMPACT_TABLE_ROW = /^\|\s*`([^`]+)`\s*\|\s*(CREATE|MODIFY|DELETE|NO CHANGE)\s*\|/;

/**
 * Match blast-radius-coverage.md table rows.
 * Format: | `path` | CHANGE_TYPE | STATUS | notes... |
 * Captures: group 1 = file path, group 2 = coverage status, group 3 = notes
 * Traces to: REQ-001 AC-001-03, REQ-003 AC-003-04
 */
const COVERAGE_TABLE_ROW = /^\|\s*`([^`]+)`\s*\|\s*\w[\w\s]*\|\s*(covered|deferred|unaddressed)\s*\|\s*(.*?)\s*\|$/i;

// ---------------------------------------------------------------------------
// parseImpactAnalysis(content)
// ---------------------------------------------------------------------------

/**
 * Parse impact-analysis.md to extract affected file paths and change types.
 * Uses regex-based line-by-line matching on markdown table rows.
 *
 * @param {string} content - Raw markdown content of impact-analysis.md
 * @returns {Array<{ filePath: string, changeType: string }>|null}
 *   Array of affected files (deduplicated, NO CHANGE excluded),
 *   or null on parse error.
 *
 * Traces to: REQ-006 (all ACs), ADR-0002
 */
function parseImpactAnalysis(content) {
    if (content === null || content === undefined || typeof content !== 'string') return null;

    const seen = new Map(); // filePath -> changeType (dedup across sections)
    const lines = content.split('\n');

    for (const line of lines) {
        // BUG-0055: Use flexible two-step matching instead of fixed-column regex.
        // Step 1: Find any table row with a backtick-wrapped file path
        const fileMatch = line.match(FILE_ROW);
        if (!fileMatch) continue;

        const filePath = fileMatch[1].trim();

        // Step 2: Scan all columns for a change type keyword (case-insensitive)
        const typeMatch = line.match(CHANGE_TYPE_KEYWORDS);
        if (!typeMatch) continue;

        // Normalize the change type to uppercase canonical form
        const rawType = typeMatch[1].trim();
        const changeType = normalizeChangeType(rawType);

        // AC-006-04: Exclude NO CHANGE entries
        if (changeType === 'NO CHANGE') continue;

        // AC-006-02: Deduplicate (first occurrence wins)
        if (!seen.has(filePath)) {
            seen.set(filePath, changeType);
        }
    }

    // Convert Map to array
    const result = [];
    for (const [filePath, changeType] of seen) {
        result.push({ filePath, changeType });
    }

    return result;
}

/**
 * Normalize a raw change type string to its canonical uppercase form.
 * Maps synonyms: "New" -> "CREATE", "Major modify" -> "MODIFY", etc.
 * Traces to: BUG-0055 FR-001 AC-001-04
 *
 * @param {string} rawType - Raw change type from table cell
 * @returns {string} Normalized change type (CREATE, MODIFY, DELETE, NO CHANGE)
 */
function normalizeChangeType(rawType) {
    const upper = rawType.toUpperCase().trim();
    if (upper === 'NEW') return 'CREATE';
    if (upper === 'MAJOR MODIFY' || upper === 'MINOR MODIFY') return 'MODIFY';
    // Already canonical: CREATE, MODIFY, DELETE, NO CHANGE
    return upper;
}

// ---------------------------------------------------------------------------
// parseBlastRadiusCoverage(content)
// ---------------------------------------------------------------------------

/**
 * Parse blast-radius-coverage.md to extract deferred files with rationale.
 * Only files with Coverage Status = 'deferred' AND non-empty notes are returned.
 *
 * @param {string} content - Raw markdown content of blast-radius-coverage.md
 * @returns {Map<string, { status: string, notes: string }>}
 *   Map of filePath -> { status, notes } for deferred files.
 *   Returns empty Map on parse error or missing content.
 *
 * Traces to: REQ-001 AC-001-03, REQ-003 AC-003-04
 */
function parseBlastRadiusCoverage(content) {
    const result = new Map();
    if (!content || typeof content !== 'string') return result;

    const lines = content.split('\n');

    for (const line of lines) {
        const match = line.match(COVERAGE_TABLE_ROW);
        if (!match) continue;

        const filePath = match[1].trim();
        const status = match[2].trim().toLowerCase();
        const notes = match[3].trim();

        // AC-003-04: Only deferred with non-empty rationale
        if (status === 'deferred' && notes.length > 0) {
            result.set(filePath, { status, notes });
        }
    }

    return result;
}

// ---------------------------------------------------------------------------
// getModifiedFiles(projectRoot)
// ---------------------------------------------------------------------------

/**
 * Run git diff to get files modified on the current branch vs main.
 * Uses synchronous execution with timeout.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {Set<string>|null}
 *   Set of modified file paths (relative to repo root),
 *   or null on git command failure.
 *
 * Traces to: REQ-001 AC-001-02, ADR-0003, NFR-001, NFR-005
 */
function getModifiedFiles(projectRoot) {
    try {
        const result = execSync('git diff --name-only main...HEAD', {
            cwd: projectRoot,
            encoding: 'utf8',
            timeout: 5000, // 5s timeout (generous, typical < 200ms)
            stdio: ['pipe', 'pipe', 'pipe'] // Suppress stderr from git
        });

        const files = new Set(
            result
                .trim()
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
        );

        return files;
    } catch (error) {
        // Fail-open: git errors should never block
        debugLog('blast-radius-validator: git diff failed:', error.message);
        return null;
    }
}

// ---------------------------------------------------------------------------
// buildCoverageReport(affectedFiles, modifiedFiles, deferredFiles)
// ---------------------------------------------------------------------------

/**
 * Compare affected files against modified and deferred sets to classify each.
 *
 * @param {Array<{ filePath: string, changeType: string }>} affectedFiles
 * @param {Set<string>} modifiedFiles - From getModifiedFiles (git diff)
 * @param {Map<string, { status: string, notes: string }>} deferredFiles
 * @returns {{ total: number, covered: Array, deferred: Array, unaddressed: Array }}
 *
 * Traces to: REQ-001 AC-001-03
 */
function buildCoverageReport(affectedFiles, modifiedFiles, deferredFiles) {
    const covered = [];
    const deferred = [];
    const unaddressed = [];

    for (const file of affectedFiles) {
        if (modifiedFiles.has(file.filePath)) {
            // AC-001-03: File appears in git diff -> covered
            covered.push(file);
        } else if (deferredFiles.has(file.filePath)) {
            // AC-001-03: File has deferral rationale -> deferred
            const deferral = deferredFiles.get(file.filePath);
            deferred.push({ ...file, notes: deferral.notes });
        } else {
            // AC-001-03: Neither -> unaddressed
            unaddressed.push(file);
        }
    }

    return {
        total: affectedFiles.length,
        covered,
        deferred,
        unaddressed
    };
}

// ---------------------------------------------------------------------------
// formatBlockMessage(report)
// ---------------------------------------------------------------------------

/**
 * Format a human-readable block message listing unaddressed files.
 *
 * @param {{ total: number, covered: Array, deferred: Array, unaddressed: Array<{filePath, changeType}> }} report
 * @returns {string} Multi-line block message
 *
 * Traces to: REQ-005 AC-005-04
 */
function formatBlockMessage(report) {
    const header =
        `BLAST RADIUS COVERAGE INCOMPLETE: ${report.unaddressed.length} of ` +
        `${report.total} affected files are unaddressed.\n`;

    const fileList = report.unaddressed
        .map(f => `  - ${f.filePath} (expected: ${f.changeType})`)
        .join('\n');

    const summary =
        `\nCoverage: ${report.covered.length} covered, ` +
        `${report.deferred.length} deferred, ` +
        `${report.unaddressed.length} unaddressed\n`;

    const guidance =
        `\nTo resolve:\n` +
        `  1. Modify the unaddressed files as indicated by impact analysis, OR\n` +
        `  2. Add deferral rationale for each file in blast-radius-coverage.md:\n` +
        `     | \`file/path\` | CHANGE_TYPE | deferred | Rationale for deferral |\n` +
        `\nGenerate blast-radius-coverage.md with a complete checklist of all ` +
        `${report.total} affected files before advancing.`;

    return header + '\n' + fileList + summary + guidance;
}

// ---------------------------------------------------------------------------
// check(ctx) -- Dispatcher-compatible entry point
// ---------------------------------------------------------------------------

/**
 * Dispatcher-compatible check function.
 * Validates blast radius coverage: affected files from impact-analysis.md
 * must be either modified (git diff) or deferred (blast-radius-coverage.md).
 *
 * @param {object} ctx - Dispatcher context
 * @param {object} ctx.input - Parsed stdin JSON (tool call)
 * @param {object} ctx.state - Parsed state.json
 * @returns {{ decision: 'allow'|'block', stopReason?: string, stderr?: string, stdout?: string, stateModified: boolean }}
 *
 * Traces to: REQ-001, REQ-002, REQ-005, REQ-007 AC-007-01
 */
function check(ctx) {
    try {
        // Step 1: Validate context (E-SKIP-04, E-SKIP-05)
        if (!ctx || !ctx.input || !ctx.state) {
            return { decision: 'allow', stateModified: false };
        }

        // Step 2: Active workflow required (E-SKIP-01 -- defensive, shouldActivate handles this)
        if (!ctx.state.active_workflow) {
            return { decision: 'allow', stateModified: false };
        }

        // Step 3: Resolve artifact folder (E-DEGRADE-01)
        const artifactFolder = ctx.state.active_workflow.artifact_folder;
        if (!artifactFolder) {
            debugLog('blast-radius-validator: no artifact_folder in active workflow');
            return { decision: 'allow', stateModified: false };
        }

        const projectRoot = getProjectRoot();

        // Step 4: Read impact-analysis.md (E-DEGRADE-02, E-IO-01)
        const impactPath = path.join(projectRoot, 'docs', 'requirements', artifactFolder, 'impact-analysis.md');
        if (!fs.existsSync(impactPath)) {
            debugLog('blast-radius-validator: impact-analysis.md not found, skipping');
            return { decision: 'allow', stateModified: false };
        }

        let content;
        try {
            content = fs.readFileSync(impactPath, 'utf8');
        } catch (readErr) {
            return {
                decision: 'allow',
                stderr: `blast-radius-validator: error reading impact-analysis.md: ${readErr.message}`,
                stateModified: false
            };
        }

        // Step 5: Parse affected files (E-PARSE-01, A-ALLOW-02)
        const affectedFiles = parseImpactAnalysis(content);
        if (affectedFiles === null) {
            return {
                decision: 'allow',
                stderr: 'blast-radius-validator: parse error in impact-analysis.md (fail-open)',
                stateModified: false
            };
        }
        if (affectedFiles.length === 0) {
            // BUG-0055 FR-002: Zero-file guard — warn when substantial content
            // yields zero parsed files (possible format mismatch).
            // Threshold: 100 chars to avoid false alarms on stub files.
            // Traces to: FR-002 AC-002-01, AC-002-02, AC-002-03
            if (content.length > 100) {
                return {
                    decision: 'allow',
                    stderr: 'blast-radius-validator: impact-analysis.md has content but no affected files were parsed. Table format may not match expected pattern.',
                    stateModified: false
                };
            }
            return { decision: 'allow', stateModified: false };
        }

        // Step 6: Get modified files from git (E-GIT-01/02/03/04)
        const modifiedFiles = getModifiedFiles(projectRoot);
        if (modifiedFiles === null) {
            return {
                decision: 'allow',
                stderr: 'blast-radius-validator: git diff failed, skipping validation',
                stateModified: false
            };
        }

        // Step 7: Read blast-radius-coverage.md for deferred files
        const coveragePath = path.join(projectRoot, 'docs', 'requirements', artifactFolder, 'blast-radius-coverage.md');
        let deferredFiles = new Map();
        if (fs.existsSync(coveragePath)) {
            try {
                const coverageContent = fs.readFileSync(coveragePath, 'utf8');
                deferredFiles = parseBlastRadiusCoverage(coverageContent);
            } catch (readErr) {
                debugLog('blast-radius-validator: error reading blast-radius-coverage.md:', readErr.message);
                // Continue with empty deferral map (E-IO-02)
            }
        }

        // Step 8: Build coverage report
        const report = buildCoverageReport(affectedFiles, modifiedFiles, deferredFiles);

        debugLog(
            `blast-radius-validator: coverage result - total: ${report.total}, ` +
            `covered: ${report.covered.length}, deferred: ${report.deferred.length}, ` +
            `unaddressed: ${report.unaddressed.length}`
        );

        // Step 9: Decision (B-BLOCK-01, A-ALLOW-01)
        if (report.unaddressed.length === 0) {
            logHookEvent('blast-radius-validator', 'allow', {
                total: report.total,
                covered: report.covered.length,
                deferred: report.deferred.length,
                reason: 'All affected files addressed'
            });
            return { decision: 'allow', stateModified: false };
        } else {
            const stopReason = formatBlockMessage(report);
            logHookEvent('blast-radius-validator', 'block', {
                total: report.total,
                unaddressed: report.unaddressed.length,
                files: report.unaddressed.map(f => f.filePath),
                reason: 'Unaddressed files in blast radius'
            });
            return {
                decision: 'block',
                stopReason,
                stateModified: false
            };
        }
    } catch (error) {
        // Top-level fail-open: any uncaught exception -> allow (E-UNCAUGHT-01)
        debugLog('blast-radius-validator: unexpected error:', error.message);
        return { decision: 'allow', stateModified: false };
    }
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
    check,
    // Exported for unit testing only:
    parseImpactAnalysis,
    parseBlastRadiusCoverage,
    getModifiedFiles,
    buildCoverageReport,
    formatBlockMessage,
    normalizeChangeType
};

// ---------------------------------------------------------------------------
// Standalone execution
// ---------------------------------------------------------------------------

if (require.main === module) {
    const {
        readStdin,
        readState,
        loadManifest,
        loadIterationRequirements,
        loadWorkflowDefinitions,
        outputBlockResponse
    } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) {
                process.exit(0);
            }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) {
                console.error(result.stderr);
            }
            if (result.decision === 'block' && result.stopReason) {
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) {
            process.exit(0);
        }
    })();
}
