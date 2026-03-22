#!/usr/bin/env node
/**
 * iSDLC Output Format Validator - PostToolUse[Write] Hook
 * =========================================================
 * Validates that known artifact files conform to expected schemas
 * when written. Checks structure, not content.
 *
 * Performance budget: < 200ms
 * Fail-open: always (PostToolUse is observational only)
 *
 * Traces to: FR-06, AC-06a through AC-06g
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0090: Bridge-first delegation to core validators
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'validators.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Artifact validators keyed by file pattern.
 * Each validator returns { valid: boolean, missing: string[] }
 */
const ARTIFACT_VALIDATORS = {
    'user-stories.json': validateUserStories,
    'traceability-matrix.csv': validateTraceabilityMatrix,
    'test-strategy.md': validateTestStrategy
};

/**
 * ADR file pattern (adr-NNN-*.md or adr-*.md)
 */
const ADR_PATTERN = /adr-\d*.*\.md$/i;

/**
 * Match a file path against known artifact patterns.
 * @param {string} filePath - The file path
 * @returns {string|null} Matched pattern name or null
 */
function matchArtifactPattern(filePath) {
    if (!filePath) return null;

    for (const pattern of Object.keys(ARTIFACT_VALIDATORS)) {
        if (filePath.endsWith(pattern) || filePath.endsWith('/' + pattern)) {
            return pattern;
        }
    }

    if (ADR_PATTERN.test(filePath)) {
        return 'adr';
    }

    return null;
}

/**
 * Validate user-stories.json structure.
 * @param {string} content - File content
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateUserStories(content) {
    const missing = [];
    try {
        const data = JSON.parse(content);
        if (!data.stories || !Array.isArray(data.stories)) {
            missing.push('stories (array)');
            return { valid: false, missing };
        }
        if (data.stories.length === 0) {
            missing.push('stories (empty array)');
            return { valid: false, missing };
        }
        // Check first story for required fields
        const first = data.stories[0];
        if (!first.id) missing.push('stories[0].id');
        if (!first.title) missing.push('stories[0].title');
        if (!first.acceptance_criteria) missing.push('stories[0].acceptance_criteria');
    } catch (e) {
        missing.push('valid JSON');
    }
    return { valid: missing.length === 0, missing };
}

/**
 * Validate traceability-matrix.csv has required header columns.
 * @param {string} content - File content
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateTraceabilityMatrix(content) {
    const missing = [];
    if (!content || !content.trim()) {
        missing.push('non-empty content');
        return { valid: false, missing };
    }

    const firstLine = content.split('\n')[0].toLowerCase();
    const requiredColumns = ['id', 'requirement', 'test', 'status'];
    // Also accept alternate column names
    const alternates = {
        'id': ['id', 'fr', 'ac', 'story'],
        'requirement': ['requirement', 'req', 'fr', 'feature', 'us'],
        'test': ['test', 'test file', 'test_file', 'hook file', 'hook'],
        'status': ['status', 'hook type', 'hook_type', 'type', 'result']
    };

    for (const col of requiredColumns) {
        const alts = alternates[col] || [col];
        const found = alts.some(a => firstLine.includes(a));
        if (!found) {
            missing.push(`header column: ${col}`);
        }
    }

    return { valid: missing.length === 0, missing };
}

/**
 * Validate test-strategy.md has required sections.
 * @param {string} content - File content
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateTestStrategy(content) {
    const missing = [];
    if (!content || !content.trim()) {
        missing.push('non-empty content');
        return { valid: false, missing };
    }

    const lower = content.toLowerCase();
    const requiredSections = [
        { name: 'Scope', patterns: ['scope', '## scope', 'test scope'] },
        { name: 'Approach', patterns: ['approach', '## approach', 'test approach', 'strategy', '## strategy'] },
        { name: 'Entry/Exit Criteria', patterns: ['entry', 'exit', 'criteria', 'entry criteria', 'exit criteria'] }
    ];

    for (const section of requiredSections) {
        const found = section.patterns.some(p => lower.includes(p));
        if (!found) {
            missing.push(`section: ${section.name}`);
        }
    }

    return { valid: missing.length === 0, missing };
}

/**
 * Validate ADR file has required sections.
 * @param {string} content - File content
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateAdr(content) {
    const missing = [];
    if (!content || !content.trim()) {
        missing.push('non-empty content');
        return { valid: false, missing };
    }

    const lower = content.toLowerCase();
    const requiredSections = [
        { name: 'Status', patterns: ['status', '## status', '**status**'] },
        { name: 'Context', patterns: ['context', '## context', '**context**'] },
        { name: 'Decision', patterns: ['decision', '## decision', '**decision**'] },
        { name: 'Consequences', patterns: ['consequences', '## consequences', '**consequences**', 'rationale', '## rationale'] }
    ];

    for (const section of requiredSections) {
        const found = section.patterns.some(p => lower.includes(p));
        if (!found) {
            missing.push(`section: ${section.name}`);
        }
    }

    return { valid: missing.length === 0, missing };
}

/**
 * Dispatcher-compatible check function.
 * NOTE: Reads the just-written file from disk via fs.readFileSync.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stderr?: string }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Get the written file path
        const filePath = (input.tool_input && input.tool_input.file_path) || '';
        if (!filePath) {
            return { decision: 'allow' };
        }

        // Match against known artifact patterns
        const pattern = matchArtifactPattern(filePath);
        if (!pattern) {
            return { decision: 'allow' };
        }

        debugLog('Artifact pattern matched:', pattern, 'for', filePath);

        // Read the written file from disk
        let content;
        try {
            content = fs.readFileSync(filePath, 'utf8');
        } catch (e) {
            debugLog('Cannot read written file, skipping:', e.message);
            return { decision: 'allow' };
        }

        // Validate
        let result;
        if (pattern === 'adr') {
            result = validateAdr(content);
        } else {
            const validator = ARTIFACT_VALIDATORS[pattern];
            result = validator(content);
        }

        if (result.valid) {
            logHookEvent('output-format-validator', 'allow', {
                reason: `${pattern} validated successfully`
            });
            return { decision: 'allow' };
        }

        logHookEvent('output-format-validator', 'warn', {
            reason: `${pattern} missing: ${result.missing.join(', ')}`
        });

        const stderr =
            `ARTIFACT FORMAT WARNING: ${filePath}\n` +
            `Pattern: ${pattern}\n` +
            `Missing: ${result.missing.join(', ')}\n\n` +
            `The artifact may be incomplete. Check the expected format for ${pattern}.`;

        return { decision: 'allow', stderr };

    } catch (error) {
        debugLog('Error in output-format-validator:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');

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
            if (result.stdout) {
                console.log(result.stdout);
            }
            if (result.decision === 'block' && result.stopReason) {
                const { outputBlockResponse } = require('./lib/common.cjs');
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) {
            process.exit(0);
        }
    })();
}
