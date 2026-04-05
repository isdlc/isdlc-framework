#!/usr/bin/env node
/**
 * iSDLC Persona Extension Composer Validator - PreToolUse Hook
 * =============================================================
 * Validates promoted persona frontmatter schemas and detects insertion-point
 * conflicts when the analyze subagent is dispatched via Task.
 *
 * Fail-open: NEVER blocks. Emits WARN messages on stdout only.
 *
 * Traces to: FR-005 (AC-005-03, AC-005-05), FR-008 (AC-008-03)
 * Related: REQ-GH-235 Rewrite roundtable-analyst for consistent UX
 *
 * Matcher: PreToolUse with tool_name === "Task"
 * Context inputs (from stdin JSON):
 *   - tool_name: "Task"
 *   - tool_input: { subagent_type: "roundtable-analyst" | other }
 *   - context.persona_files: array of parsed persona frontmatter objects
 *
 * Validation rules:
 *   - role_type === "primary" requires: owns_state, template, inserts_at
 *   - owns_state must be non-empty string matching [a-z_]+
 *   - template must end with ".template.json"
 *   - inserts_at must match (before|after):(requirements|architecture|design|tasks)
 *   - rendering_contribution (optional) must be "ownership" or "rendering-only"
 *
 * Conflict detection:
 *   - Group primary personas by inserts_at value
 *   - If >1 persona targets same point: emit WARN with first-wins resolution
 *
 * Constitutional:
 *   - Article X: fail-open, never blocks (exit 0 always)
 *   - Article XIII: .cjs extension, CommonJS syntax
 *
 * Version: 1.0.0
 */

const { readStdin } = require('./lib/common.cjs');

const ANALYZE_AGENT_NAMES = new Set([
    'roundtable-analyst',
    'bug-roundtable-analyst'
]);

const INSERTS_AT_PATTERN = /^(before|after):(requirements|architecture|design|tasks)$/;
const OWNS_STATE_PATTERN = /^[a-z_]+$/;
const VALID_RENDERING_CONTRIBUTIONS = new Set(['ownership', 'rendering-only']);

/**
 * Validate a primary persona's required promotion fields.
 * Returns an array of missing/invalid field messages.
 *
 * @param {object} persona - parsed persona frontmatter object
 * @returns {string[]} array of validation messages (empty if valid)
 */
function validatePromotionFields(persona) {
    const issues = [];

    // Required fields for role_type: primary
    if (!persona.owns_state || typeof persona.owns_state !== 'string' || persona.owns_state.trim() === '') {
        issues.push('owns_state');
    } else if (!OWNS_STATE_PATTERN.test(persona.owns_state)) {
        issues.push('owns_state (must match [a-z_]+)');
    }

    if (!persona.template || typeof persona.template !== 'string' || persona.template.trim() === '') {
        issues.push('template');
    } else if (!persona.template.endsWith('.template.json')) {
        issues.push('template (must end with .template.json)');
    }

    if (!persona.inserts_at || typeof persona.inserts_at !== 'string' || persona.inserts_at.trim() === '') {
        issues.push('inserts_at');
    } else if (!INSERTS_AT_PATTERN.test(persona.inserts_at)) {
        issues.push('inserts_at (expected extension point format (before|after):(requirements|architecture|design|tasks))');
    }

    // Optional: rendering_contribution
    if (persona.rendering_contribution !== undefined && persona.rendering_contribution !== null) {
        if (!VALID_RENDERING_CONTRIBUTIONS.has(persona.rendering_contribution)) {
            issues.push('rendering_contribution (must be "ownership" or "rendering-only")');
        }
    }

    return issues;
}

/**
 * Detect insertion-point conflicts among primary personas.
 * First-declared wins. Returns array of conflict warning messages.
 *
 * @param {object[]} personas - array of primary personas with valid inserts_at
 * @returns {string[]} conflict warning messages
 */
function detectConflicts(personas) {
    const warnings = [];
    const byPoint = new Map();

    for (const persona of personas) {
        // Only consider personas with a well-formed inserts_at
        if (!persona.inserts_at || !INSERTS_AT_PATTERN.test(persona.inserts_at)) continue;

        const point = persona.inserts_at;
        if (!byPoint.has(point)) {
            byPoint.set(point, []);
        }
        byPoint.get(point).push(persona);
    }

    for (const [point, group] of byPoint.entries()) {
        if (group.length > 1) {
            const chosen = group[0].name || 'unnamed';
            const losers = group.slice(1).map(p => p.name || 'unnamed').join(', ');
            warnings.push(
                `WARN: Insertion conflict at '${point}': first-wins -> ${chosen} (displaced: ${losers})`
            );
        }
    }

    return warnings;
}

/**
 * Validate persona files and emit WARN messages to stdout.
 * Never throws; any parsing/validation errors are swallowed.
 *
 * @param {object[]} personaFiles - array of parsed persona frontmatter objects
 */
function validatePersonas(personaFiles) {
    if (!Array.isArray(personaFiles) || personaFiles.length === 0) return;

    const primaryPersonas = [];

    for (const persona of personaFiles) {
        if (!persona || typeof persona !== 'object') continue;
        if (persona.role_type !== 'primary') continue;

        primaryPersonas.push(persona);

        const issues = validatePromotionFields(persona);
        if (issues.length > 0) {
            const name = persona.name || 'unnamed';
            process.stdout.write(
                `WARN: Persona '${name}' missing required promotion fields: ${issues.join(', ')}\n`
            );
        }
    }

    // Conflict detection among primary personas with valid inserts_at
    const conflictWarnings = detectConflicts(primaryPersonas);
    for (const warning of conflictWarnings) {
        process.stdout.write(`${warning}\n`);
    }
}

async function main() {
    try {
        const inputStr = await readStdin();
        if (!inputStr || !inputStr.trim()) {
            process.exit(0);
        }

        let input;
        try {
            input = JSON.parse(inputStr);
        } catch (e) {
            // Malformed input: fail open, exit silently
            process.exit(0);
        }

        // Only apply to Task dispatches
        if (!input || input.tool_name !== 'Task') {
            process.exit(0);
        }

        // Only apply to analyze-roundtable agents
        const subagentType = input.tool_input && input.tool_input.subagent_type;
        if (!subagentType || !ANALYZE_AGENT_NAMES.has(subagentType)) {
            process.exit(0);
        }

        const context = input.context || {};
        const personaFiles = context.persona_files || [];

        validatePersonas(personaFiles);

        process.exit(0);
    } catch (error) {
        // Fail-open: never block, never exit non-zero
        process.exit(0);
    }
}

main();
