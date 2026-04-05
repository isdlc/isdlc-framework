#!/usr/bin/env node
'use strict';

/**
 * iSDLC Tasks-as-Table Validator - PostToolUse Hook (REQ-GH-235)
 * ==============================================================
 * Validates that when the roundtable confirmation state is
 * PRESENTING_TASKS, the last assistant message contains a pipe-delimited
 * traceability table with the four required column headers
 * (FR | Requirement | Design/Blast Radius | Related Tasks).
 *
 * If the confirmation is rendered as bullets, prose, or a shorter table,
 * the hook emits a WARN message. It never blocks (fail-open per Article X).
 *
 * Traces to: FR-003 (AC-003-03), FR-008 (AC-008-03)
 *
 * Hook contract:
 *   stdin: JSON with { tool_name, tool_input, tool_response, transcript, context }
 *   stdout: empty (silent pass) OR "WARN: <reason>"
 *   exit code: 0 (fail-open)
 *
 * Version: 1.0.0
 */

// ---------------------------------------------------------------------------
// Read stdin (self-contained — avoids hard dependency on lib/common.cjs so
// the hook remains resilient if loaded in isolation)
// ---------------------------------------------------------------------------

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        try {
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', (chunk) => { data += chunk; });
            process.stdin.on('end', () => { resolve(data); });
            process.stdin.on('error', () => { resolve(''); });
        } catch (e) {
            resolve('');
        }
    });
}

// ---------------------------------------------------------------------------
// Table detection
// ---------------------------------------------------------------------------

/**
 * Required column header keywords (lowercased) that must all appear in a
 * single pipe-delimited header row with at least 4 columns.
 */
const REQUIRED_COLUMN_KEYWORDS = ['fr', 'requirement', 'design', 'task'];

/**
 * Scan the message for a markdown table header row that contains all four
 * required column keywords in order, with at least four pipe-delimited cells.
 *
 * @param {string} message - Last assistant message text
 * @returns {boolean} true when a valid 4-column traceability header is found
 */
function hasTraceabilityTable(message) {
    if (!message || typeof message !== 'string') return false;

    const lines = message.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        // Must look like a pipe-delimited row
        if (!trimmed.includes('|')) continue;

        // Split into cells, stripping leading/trailing pipes
        const cells = trimmed
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map(c => c.trim().toLowerCase())
            .filter(c => c.length > 0);

        if (cells.length < 4) continue;

        // Verify each required keyword appears in order across the first
        // four (or more) cells. We look for the keywords in sequence rather
        // than demanding an exact header string to allow harmless variations
        // ("Design / Blast Radius", "Related Tasks", etc.).
        let cursor = 0;
        let matched = 0;
        for (const keyword of REQUIRED_COLUMN_KEYWORDS) {
            let found = false;
            while (cursor < cells.length) {
                if (cells[cursor].includes(keyword)) {
                    found = true;
                    cursor += 1;
                    matched += 1;
                    break;
                }
                cursor += 1;
            }
            if (!found) break;
        }

        if (matched === REQUIRED_COLUMN_KEYWORDS.length) {
            return true;
        }
    }

    return false;
}

// ---------------------------------------------------------------------------
// Confirmation state extraction
// ---------------------------------------------------------------------------

/**
 * Extract the confirmation state from the hook input. Looks at
 * input.context.confirmation_state first, then common fallbacks.
 *
 * @param {object} input - Parsed stdin JSON
 * @returns {string|null}
 */
function extractConfirmationState(input) {
    if (!input || typeof input !== 'object') return null;
    const ctx = input.context;
    if (ctx && typeof ctx === 'object') {
        if (typeof ctx.confirmation_state === 'string') return ctx.confirmation_state;
        if (typeof ctx.confirmationState === 'string') return ctx.confirmationState;
    }
    if (typeof input.confirmation_state === 'string') return input.confirmation_state;
    return null;
}

/**
 * Extract the last assistant message from the hook input.
 *
 * @param {object} input - Parsed stdin JSON
 * @returns {string}
 */
function extractLastAssistantMessage(input) {
    if (!input || typeof input !== 'object') return '';
    const ctx = input.context;
    if (ctx && typeof ctx === 'object') {
        if (typeof ctx.last_assistant_message === 'string') return ctx.last_assistant_message;
        if (typeof ctx.lastAssistantMessage === 'string') return ctx.lastAssistantMessage;
    }
    if (typeof input.last_assistant_message === 'string') return input.last_assistant_message;
    return '';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    try {
        const raw = await readStdin();
        if (!raw || !raw.trim()) {
            process.exit(0);
        }

        let input;
        try {
            input = JSON.parse(raw);
        } catch (e) {
            // Malformed JSON — fail-open silently
            process.exit(0);
        }

        const state = extractConfirmationState(input);
        // Only enforce when we are specifically presenting tasks
        if (state !== 'PRESENTING_TASKS') {
            process.exit(0);
        }

        const message = extractLastAssistantMessage(input);
        if (!message || !message.trim()) {
            // Nothing to check — fail-open
            process.exit(0);
        }

        if (hasTraceabilityTable(message)) {
            // Valid 4-column traceability table present — silent pass
            process.exit(0);
        }

        // Violation: render warning, do not block
        process.stdout.write(
            'WARN: Tasks confirmation must render traceability table, not bullets/prose ' +
            '(expected a pipe-delimited header with FR | Requirement | Design/Blast Radius | Related Tasks).\n'
        );
        process.exit(0);

    } catch (error) {
        // Fail-open: any error allows the response through silently
        process.exit(0);
    }
}

// Only run when invoked directly (not when required for testing)
if (require.main === module) {
    main();
}

module.exports = {
    hasTraceabilityTable,
    extractConfirmationState,
    extractLastAssistantMessage
};
