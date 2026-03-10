#!/usr/bin/env node
'use strict';
/**
 * iSDLC State File Guard - PreToolUse[Bash] Dispatched Hook
 * ==========================================================
 * Blocks Bash commands that attempt to write directly to state.json,
 * bypassing the hook enforcement system.
 *
 * Detection logic:
 *   1. commandTargetsStateJson(command) — regex for .isdlc/...state.json
 *   2. isWriteCommand(command) — detects write operators/commands
 *   3. Only blocks when BOTH match (read-only like `cat state.json` is allowed)
 *
 * Performance budget: < 50ms (regex only, no I/O)
 * Fail-open: empty/missing input → allow
 *
 * Inline script body inspection (BUG-0016):
 *   - For node -e, python -c, ruby -e, perl -e: extract script body
 *   - Only treat as write if script body contains write operations
 *   - Read-only inline scripts are allowed through
 *
 * Command sanitization (BUG-0117):
 *   - Strip heredoc bodies before pattern matching to prevent false positives
 *     from commands whose arguments mention state.json (e.g., gh issue create)
 *   - Strip single-quoted string content to prevent arrow function => matching
 *   - Fix > redirect pattern to exclude => arrow functions
 *
 * Version: 1.2.0
 */

const {
    STATE_JSON_PATTERN,
    debugLog,
    logHookEvent
} = require('./lib/common.cjs');

/**
 * Pattern to detect state.json references in a bash command string.
 * Matches both forward and backward slashes, with optional quoting.
 * @type {RegExp}
 */
const STATE_JSON_CMD_PATTERN = /\.isdlc[/\\](?:projects[/\\][^/\\\s"']+[/\\])?state\.json/;

/**
 * Patterns that indicate a write operation in a bash command.
 * These are checked against the full command string.
 * Note: inline script patterns (node -e, python -c, etc.) are NOT here --
 * they are handled separately by isInlineScriptWrite() which inspects the
 * script body for actual write operations. (BUG-0016)
 * @type {RegExp[]}
 */
const WRITE_PATTERNS = [
    /(?<!=)(?<!-)>{1,2}\s*/,  // redirect: > or >> (exclude => and ->)
    /\btee\b/,        // tee command
    /\bwriteFileSync\b/,   // Node.js fs.writeFileSync (bare, outside node -e)
    /\bwriteFile\b/,       // Node.js fs.writeFile (bare, outside node -e)
    /\bsed\s+-i\b/,        // sed in-place
    /\bsed\s+--in-place\b/,
    /\bawk\s+-i\b/,        // awk in-place
];

/**
 * Patterns for inline script commands and their flag.
 * Each entry: [regex matching the interpreter+flag, flag to split on]
 * @type {Array<[RegExp, RegExp]>}
 */
const INLINE_SCRIPT_PATTERNS = [
    [/\bnode\s+-e\b/, /\bnode\s+-e\s+/],
    [/\bnode\s+--eval\b/, /\bnode\s+--eval\s+/],
    [/\bpython3?\s+-c\b/, /\bpython3?\s+-c\s+/],
    [/\bruby\s+-e\b/, /\bruby\s+-e\s+/],
    [/\bperl\s+-e\b/, /\bperl\s+-e\s+/],
];

/**
 * Patterns that indicate actual write operations inside an inline script body.
 * @type {RegExp[]}
 */
const INLINE_WRITE_INDICATORS = [
    /writeFileSync/,
    /writeFile/,
    /fs\.write\b/,
    /\.write\s*\(/,        // generic .write() call
    /open\s*\([^)]*['"][wa]['"]/,  // Python/Ruby open(..., 'w') or 'a'
];

/**
 * Check if an inline script command (node -e, python -c, etc.) contains
 * write operations in its script body.
 * Returns true if the command is an inline script with write operations.
 * Returns false if:
 *   - The command is not an inline script
 *   - The command is an inline script but the body is read-only
 * @param {string} command - The full bash command string
 * @returns {boolean}
 */
function isInlineScriptWrite(command) {
    for (const [detectPattern, splitPattern] of INLINE_SCRIPT_PATTERNS) {
        if (detectPattern.test(command)) {
            // Extract the script body (everything after the flag)
            const parts = command.split(splitPattern);
            const scriptBody = parts.length > 1 ? parts.slice(1).join(' ') : '';

            // Check if the script body contains any write indicators
            for (const writePattern of INLINE_WRITE_INDICATORS) {
                if (writePattern.test(scriptBody)) {
                    return true;
                }
            }
            // Inline script found but no write operations -- read-only
            return false;
        }
    }
    // Not an inline script command
    return false;
}

/**
 * Patterns for commands that move/copy files TO state.json.
 * These need the state.json reference to appear as the target (last arg).
 * @type {RegExp[]}
 */
const MOVE_COPY_PATTERNS = [
    /\bmv\b.*state\.json\s*$/,
    /\bcp\b.*state\.json\s*$/,
    /\binstall\b.*state\.json\s*$/,
];

/**
 * Sanitize a command string by stripping content that should not trigger
 * pattern matching: heredoc bodies and single-quoted string literals.
 * This prevents false positives from commands whose *arguments* mention
 * state.json or write operations (e.g., gh issue create --body "...state.json...").
 *
 * BUG-0117: Root cause of false positives on gh, curl, and similar commands
 * whose text arguments happen to contain state.json references.
 *
 * @param {string} command - The raw bash command string
 * @returns {string} - The command with argument content stripped
 */
function sanitizeCommand(command) {
    if (!command) return '';
    let result = command;

    // 1. Strip heredoc bodies: <<MARKER ... MARKER, <<'MARKER' ... MARKER, etc.
    //    The closing marker must appear on its own line (bash requirement).
    result = result.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g, '');

    // 2. Strip content of TOP-LEVEL single-quoted strings only.
    //    Single quotes inside double-quoted strings (e.g., node -e "require('fs')")
    //    are JavaScript/language literals, not shell quotes — must be preserved.
    //    Uses a character-level state machine to track shell quoting context.
    let sanitized = '';
    let inDouble = false;
    let inSingle = false;
    for (let i = 0; i < result.length; i++) {
        const ch = result[i];
        if (inSingle) {
            if (ch === "'") { inSingle = false; sanitized += "'"; }
            // Skip all content inside top-level single quotes
            continue;
        }
        if (inDouble) {
            if (ch === '\\' && i + 1 < result.length) {
                sanitized += ch + result[i + 1]; i++; continue;
            }
            if (ch === '"') { inDouble = false; }
            sanitized += ch;
            continue;
        }
        // Top level — not inside any quotes
        if (ch === "'") { inSingle = true; sanitized += "'"; continue; }
        if (ch === '"') { inDouble = true; sanitized += ch; continue; }
        sanitized += ch;
    }

    return sanitized;
}

/**
 * Check if a bash command references a state.json file.
 * @param {string} command - The bash command string
 * @returns {boolean}
 */
function commandTargetsStateJson(command) {
    if (!command) return false;
    return STATE_JSON_CMD_PATTERN.test(command);
}

/**
 * Check if a bash command contains write operations.
 * @param {string} command - The bash command string
 * @returns {boolean}
 */
function isWriteCommand(command) {
    if (!command) return false;

    // Check standard write patterns
    for (const pattern of WRITE_PATTERNS) {
        if (pattern.test(command)) return true;
    }

    // Check move/copy to state.json
    for (const pattern of MOVE_COPY_PATTERNS) {
        if (pattern.test(command)) return true;
    }

    // BUG-0016: Check inline script commands with body inspection
    if (isInlineScriptWrite(command)) return true;

    return false;
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: string, stopReason?: string }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        if (input.tool_name !== 'Bash') {
            return { decision: 'allow' };
        }

        const command = (input.tool_input && input.tool_input.command) || '';
        if (!command) {
            return { decision: 'allow' };
        }

        // BUG-0117: Sanitize command before checking — strip heredoc bodies
        // and single-quoted string content to prevent false positives from
        // commands whose arguments mention state.json or write operations.
        const sanitized = sanitizeCommand(command);

        // Both conditions must be true to block
        if (!commandTargetsStateJson(sanitized)) {
            return { decision: 'allow' };
        }

        if (!isWriteCommand(sanitized)) {
            // Read-only command targeting state.json is fine
            debugLog('state-file-guard: read-only state.json access allowed:', command);
            return { decision: 'allow' };
        }

        // Block: bash command is writing to state.json
        logHookEvent('state-file-guard', 'block', {
            reason: `Bash write to state.json blocked: ${command.substring(0, 100)}`
        });

        return {
            decision: 'block',
            stopReason:
                `BASH STATE GUARD: Direct writes to state.json via Bash are not permitted.\n\n` +
                `Blocked command: ${command.substring(0, 200)}\n\n` +
                `state.json is managed by iSDLC hooks and must only be modified through ` +
                `the Write or Edit tools (which are validated by state-write-validator).\n\n` +
                `If you need to update state, use the Write tool to write the complete ` +
                `state.json file, or use the Edit tool to modify specific fields.`
        };
    } catch (error) {
        debugLog('Error in state-file-guard:', error.message);
        return { decision: 'allow' };
    }
}

module.exports = { check, commandTargetsStateJson, isWriteCommand, isInlineScriptWrite, sanitizeCommand };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions, outputBlockResponse } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) { process.exit(0); }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) console.error(result.stderr);
            if (result.stdout) console.log(result.stdout);
            if (result.decision === 'block' && result.stopReason) {
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) { process.exit(0); }
    })();
}
