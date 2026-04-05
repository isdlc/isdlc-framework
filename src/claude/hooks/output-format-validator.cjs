#!/usr/bin/env node
/**
 * iSDLC Output Format Validator - PostToolUse[Write/Edit] Hook
 * =========================================================
 * Validates that known artifact files conform to expected schemas
 * when written or edited. Checks structure, not content.
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
 * Each validator returns { valid: boolean, missing: string[], guidance?: string }
 */
const ARTIFACT_VALIDATORS = {
    'user-stories.json': validateUserStories,
    'traceability-matrix.csv': validateTraceabilityMatrix,
    'test-strategy.md': validateTestStrategy,
    'requirements-spec.md': validateAgainstTemplate('requirements'),
    'architecture-overview.md': validateAgainstTemplate('architecture'),
    'module-design.md': validateAgainstTemplate('design'),
    'tasks.md': validateTasksMd
};

/**
 * ADR file pattern (adr-NNN-*.md or adr-*.md)
 */
const ADR_PATTERN = /adr-\d*.*\.md$/i;

// Template-validated artifacts: only fire when the file is inside
// docs/requirements/*/ to avoid false positives on docs/isdlc/tasks.md.
const TEMPLATE_ARTIFACT_PATTERNS = new Set([
    'traceability-matrix.csv', 'requirements-spec.md', 'architecture-overview.md', 'module-design.md', 'tasks.md'
]);

/**
 * Match a file path against known artifact patterns.
 * @param {string} filePath - The file path
 * @returns {string|null} Matched pattern name or null
 */
function matchArtifactPattern(filePath) {
    if (!filePath) return null;

    for (const pattern of Object.keys(ARTIFACT_VALIDATORS)) {
        // GH-234: template-backed artifacts only match inside docs/requirements/*/
        if (TEMPLATE_ARTIFACT_PATTERNS.has(pattern)) {
            if (filePath.includes('/docs/requirements/') && filePath.endsWith(pattern)) {
                return pattern;
            }
            continue;
        }
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

// ---------------------------------------------------------------------------
// Template-based validators (GH-234: strict template enforcement)
// ---------------------------------------------------------------------------

/**
 * Resolve the templates directory from project root.
 * @returns {string|null}
 */
function resolveTemplatesDir() {
    try {
        const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        const p = path.join(root, '.isdlc', 'config', 'templates');
        return fs.existsSync(p) ? p : null;
    } catch (e) {
        return null;
    }
}

/**
 * Normalize a template key or heading text for comparisons.
 * @param {string} value
 * @returns {string}
 */
function normalizeSectionName(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/[_-]+/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract markdown headings for a specific level.
 * @param {string} content
 * @param {number} level
 * @returns {string[]}
 */
function extractSectionHeadings(content, level) {
    const headings = [];
    const hashes = '#'.repeat(level);
    const pattern = new RegExp(`^${hashes}\\s+(?:\\d+\\.\\s*)?(.+?)$`, 'gm');
    let match;
    while ((match = pattern.exec(content)) !== null) {
        headings.push(normalizeSectionName(match[1]));
    }
    return headings;
}

/**
 * Extract the markdown body for each required phase.
 * @param {string} content
 * @returns {Map<string, string>}
 */
function extractPhaseBodies(content) {
    const phases = new Map();
    const matches = [...content.matchAll(/^##\s+Phase\s+(\w+):.*$/gm)];
    for (let i = 0; i < matches.length; i++) {
        const phase = matches[i][1];
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
        phases.set(phase, content.slice(start, end));
    }
    return phases;
}

function matchesTemplateSection(heading, templateKey) {
    return normalizeSectionName(heading) === normalizeSectionName(templateKey);
}

function parseMarkdownTableCells(line) {
    return String(line || '')
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(cell => cell.trim());
}

/**
 * Create a validator function for a given template domain.
 * Reads template JSON, extracts section_order, compares against H2 headings.
 * @param {string} domain - Template domain name (requirements, architecture, design)
 * @returns {function(string): { valid: boolean, missing: string[], guidance?: string }}
 */
function validateAgainstTemplate(domain) {
    return function(content) {
        const missing = [];

        const templatesDir = resolveTemplatesDir();
        if (!templatesDir) return { valid: true, missing: [] }; // fail-open

        const templatePath = path.join(templatesDir, `${domain}.template.json`);
        let template;
        try {
            if (!fs.existsSync(templatePath)) return { valid: true, missing: [] };
            template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
        } catch (e) {
            return { valid: true, missing: [] }; // fail-open
        }

        const sectionOrder = template.format && template.format.section_order;
        const requiredSections = template.format && template.format.required_sections;
        if (!sectionOrder || !Array.isArray(sectionOrder)) return { valid: true, missing: [] };

        const foundHeadings = extractSectionHeadings(content, 2);
        if (foundHeadings.length === 0) {
            missing.push('any section headings');
            return { valid: false, missing, guidance: `Expected sections in order: ${sectionOrder.join(' → ')}` };
        }

        const unexpected = foundHeadings.filter(heading =>
            !sectionOrder.some(section => matchesTemplateSection(heading, section))
        );
        if (unexpected.length > 0) {
            return {
                valid: false,
                missing: ['no extra sections'],
                guidance: `TEMPLATE DRIFT: Unexpected sections found: ${unexpected.join(', ')}. Expected section order: ${sectionOrder.join(' → ')}. Rewrite with sections in EXACTLY the specified order. Do not add extra sections, do not reorder, do not rename.`
            };
        }

        // Check required sections are present
        const required = requiredSections || sectionOrder;
        for (const section of required) {
            const found = foundHeadings.some(h => matchesTemplateSection(h, section));
            if (!found) missing.push(section.replace(/_/g, ' '));
        }

        if (missing.length > 0) {
            return {
                valid: false,
                missing,
                guidance: `TEMPLATE DRIFT: Missing required sections: ${missing.join(', ')}. Expected section order: ${sectionOrder.join(' → ')}. Read .isdlc/config/templates/${domain}.template.json and rewrite with sections in EXACTLY the specified order.`
            };
        }

        // Check order: map found headings to template indices
        const orderIndices = [];
        for (const heading of foundHeadings) {
            for (let i = 0; i < sectionOrder.length; i++) {
                if (matchesTemplateSection(heading, sectionOrder[i])) {
                    orderIndices.push(i);
                    break;
                }
            }
        }

        for (let i = 1; i < orderIndices.length; i++) {
            if (orderIndices[i] < orderIndices[i - 1]) {
                const expectedOrder = sectionOrder.join(' → ');
                missing.push('correct section order');
                return {
                    valid: false,
                    missing,
                    guidance: `TEMPLATE DRIFT: Sections are out of order. Expected: ${expectedOrder}. Rewrite with sections in EXACTLY the specified order. Do not add extra sections, do not reorder, do not rename.`
                };
            }
        }

        return { valid: true, missing: [] };
    };
}

/**
 * Validate traceability-matrix.csv against traceability template.
 * Enforces exact header order plus required post-table sections.
 * @param {string} content
 * @returns {{ valid: boolean, missing: string[], guidance?: string }}
 */
function validateTraceabilityMatrix(content) {
    const missing = [];

    const templatesDir = resolveTemplatesDir();
    if (!templatesDir) return { valid: true, missing: [] };

    const templatePath = path.join(templatesDir, 'traceability.template.json');
    let template;
    try {
        if (!fs.existsSync(templatePath)) return { valid: true, missing: [] };
        template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } catch (e) {
        return { valid: true, missing: [] };
    }

    if (!content || !content.trim()) {
        return {
            valid: false,
            missing: ['non-empty content'],
            guidance: 'TEMPLATE DRIFT: traceability-matrix.csv must contain the template-defined 4-column table and required post-table sections.'
        };
    }

    const expectedHeaders = (((template.format || {}).columns) || []).map(col => col.header);
    const requiredPostSections = (((template.format || {}).post_table_sections) || []);
    if (expectedHeaders.length === 0) return { valid: true, missing: [] };

    const lines = content.split('\n');
    const headerIndex = lines.findIndex(line => {
        const trimmed = line.trim();
        return trimmed.startsWith('|') && trimmed.endsWith('|');
    });

    if (headerIndex === -1) {
        return {
            valid: false,
            missing: ['traceability table header'],
            guidance: `TEMPLATE DRIFT: traceability-matrix.csv must start with the exact 4-column table header: ${expectedHeaders.join(' | ')}.`
        };
    }

    const foundHeaders = parseMarkdownTableCells(lines[headerIndex]);
    const normalizedFound = foundHeaders.map(normalizeSectionName);
    const normalizedExpected = expectedHeaders.map(normalizeSectionName);
    const sameHeaderCount = normalizedFound.length === normalizedExpected.length;
    const sameHeaderOrder = sameHeaderCount && normalizedExpected.every((header, index) => normalizedFound[index] === header);
    if (!sameHeaderOrder) {
        return {
            valid: false,
            missing: ['exact traceability table columns'],
            guidance: `TEMPLATE DRIFT: traceability-matrix.csv must use EXACTLY these columns in this order: ${expectedHeaders.join(' | ')}. Do not add, remove, rename, or reorder columns.`
        };
    }

    const separatorLine = lines[headerIndex + 1] || '';
    if (!/^\|\s*[-: ]+\|\s*[-:| ]+\|?\s*$/.test(separatorLine.trim())) {
        missing.push('markdown table separator row');
    }

    const foundHeadings = extractSectionHeadings(content, 2);
    const unexpectedSections = foundHeadings.filter(heading =>
        !requiredPostSections.some(section => matchesTemplateSection(heading, section))
    );
    if (unexpectedSections.length > 0) {
        return {
            valid: false,
            missing: ['no extra sections'],
            guidance: `TEMPLATE DRIFT: traceability-matrix.csv has unexpected sections: ${unexpectedSections.join(', ')}. Keep only the template-required post-table sections: ${requiredPostSections.join(', ')}.`
        };
    }

    for (const section of requiredPostSections) {
        if (!foundHeadings.some(h => matchesTemplateSection(h, section))) {
            missing.push(section.replace(/_/g, ' '));
        }
    }

    const tableEnd = headerIndex + 1;
    for (const section of requiredPostSections) {
        const sectionPattern = new RegExp(`^##\\s+(?:\\d+\\.\\s*)?${section.replace(/_/g, '[ _-]+')}$`, 'gim');
        const match = sectionPattern.exec(content);
        if (!match || match.index < tableEnd) {
            if (!missing.includes(section.replace(/_/g, ' '))) {
                missing.push(`${section.replace(/_/g, ' ')} after table`);
            }
        }
    }

    if (missing.length > 0) {
        return {
            valid: false,
            missing,
            guidance: `TEMPLATE DRIFT: traceability-matrix.csv is missing required structure: ${missing.join(', ')}. Read .isdlc/config/templates/traceability.template.json and keep the exact 4-column table plus the required post-table sections.`
        };
    }

    return { valid: true, missing: [] };
}

/**
 * Validate tasks.md against tasks template.
 * Checks required sections, required phases, and required task category grouping.
 * @param {string} content
 * @returns {{ valid: boolean, missing: string[], guidance?: string }}
 */
function validateTasksMd(content) {
    const missing = [];

    const templatesDir = resolveTemplatesDir();
    if (!templatesDir) return { valid: true, missing: [] };

    const templatePath = path.join(templatesDir, 'tasks.template.json');
    let template;
    try {
        if (!fs.existsSync(templatePath)) return { valid: true, missing: [] };
        template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } catch (e) {
        return { valid: true, missing: [] };
    }

    const requiredSections = template.format && template.format.required_sections;
    const h2Sections = extractSectionHeadings(content, 2);
    if (requiredSections) {
        for (const section of requiredSections) {
            if (!h2Sections.some(h => matchesTemplateSection(h, section))) {
                missing.push(section.replace(/_/g, ' '));
            }
        }
    }

    const allowedH2Sections = new Set((requiredSections || []).map(normalizeSectionName));
    const phaseBodies = extractPhaseBodies(content);
    const unexpectedSections = h2Sections.filter(section =>
        !allowedH2Sections.has(section) && !/^phase\s+\w+\b/.test(section)
    );
    if (unexpectedSections.length > 0) {
        return {
            valid: false,
            missing: ['no extra sections'],
            guidance: `TEMPLATE DRIFT: tasks.md has unexpected top-level sections: ${unexpectedSections.join(', ')}. Read .isdlc/config/templates/tasks.template.json and keep only the required sections plus the configured phase sections.`
        };
    }

    const requiredPhases = template.format && template.format.required_phases;
    if (requiredPhases) {
        for (const phase of requiredPhases) {
            if (!phaseBodies.has(phase)) {
                missing.push(`Phase ${phase} section`);
            }
        }
    }

    const requiredCategories = template.format && template.format.required_task_categories;
    if (requiredCategories) {
        for (const [phase, categories] of Object.entries(requiredCategories)) {
            const body = phaseBodies.get(phase);
            if (!body) continue;
            const foundCategories = extractSectionHeadings(body, 3);
            for (const category of categories) {
                if (!foundCategories.some(h => matchesTemplateSection(h, category))) {
                    missing.push(`Phase ${phase} category: ${category.replace(/_/g, ' ')}`);
                }
            }
        }
    }

    if (missing.length > 0) {
        return {
            valid: false,
            missing,
            guidance: `TEMPLATE DRIFT: tasks.md is missing required structure: ${missing.join(', ')}. Read .isdlc/config/templates/tasks.template.json for the expected structure. Required sections: ${(requiredSections || []).join(', ')}. Required phases: ${(requiredPhases || []).join(', ')}. Required task categories must appear as H3 headings inside each phase.`
        };
    }

    return { valid: true, missing: [] };
}

/**
 * Dispatcher-compatible check function.
 * NOTE: Reads the just-written or edited file from disk via fs.readFileSync.
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

        // GH-234: template-backed artifacts get loud corrective guidance; others get standard warning
        const isTemplateArtifact = ['traceability-matrix.csv', 'requirements-spec.md', 'architecture-overview.md', 'module-design.md', 'tasks.md'].includes(pattern);

        logHookEvent('output-format-validator', isTemplateArtifact ? 'template-drift' : 'warn', {
            reason: `${pattern} missing: ${result.missing.join(', ')}`
        });

        if (isTemplateArtifact && result.guidance) {
            const stderr =
                `TEMPLATE DRIFT DETECTED: ${filePath}\n\n` +
                `${result.guidance}\n\n` +
                `ACTION REQUIRED: Rewrite the file with the correct section order and required sections. ` +
                `Read .isdlc/config/templates/ for the expected structure. ` +
                `Use Write or Edit to produce template-compliant content.`;

            return { decision: 'allow', stderr };
        }

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
