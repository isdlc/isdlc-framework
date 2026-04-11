#!/usr/bin/env node
/**
 * iSDLC Chat/Explore Read-Only Enforcer - PreToolUse[Write,Edit] Hook
 * =====================================================================
 * Blocks file writes and edits when Chat/Explore mode is active.
 * Allows writes to /tmp and state.json (state tracking is necessary).
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-04, AC-04a through AC-04g
 * Version: 1.0.0
 */

const {
    readStdin,
    readState,
    outputBlockResponse,
    debugLog,
    logHookEvent
} = require('./lib/common.cjs');

const path = require('path');
const os = require('os');

/**
 * Check if a file path is a temp directory path.
 * @param {string} filePath - The file path to check
 * @returns {boolean}
 */
function isTempPath(filePath) {
    if (!filePath) return false;
    const normalized = path.normalize(filePath);
    const tmpDir = os.tmpdir();
    return normalized.startsWith(tmpDir) ||
           normalized.startsWith('/tmp/') ||
           normalized.startsWith('/var/folders/') ||
           /[/\\]temp[/\\]/i.test(normalized) ||
           /[/\\]tmp[/\\]/i.test(normalized);
}

/**
 * Check if a file path is a state.json file.
 * @param {string} filePath - The file path to check
 * @returns {boolean}
 */
function isStateJson(filePath) {
    if (!filePath) return false;
    return /\.isdlc[/\\](?:projects[/\\][^/\\]+[/\\])?state\.json$/.test(filePath);
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
            process.exit(0);
        }

        // Only check Write and Edit tools
        if (input.tool_name !== 'Write' && input.tool_name !== 'Edit' && input.tool_name !== 'NotebookEdit') {
            process.exit(0);
        }

        // Read state to check explore mode
        const state = readState();
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            process.exit(0);
        }

        // Check if Chat/Explore mode is active
        if (!state.chat_explore_active) {
            process.exit(0);
        }

        debugLog('Chat/Explore mode is active, checking file path');

        // Get the target file path
        const filePath = (input.tool_input && (input.tool_input.file_path || input.tool_input.notebook_path)) || '';
        if (!filePath) {
            debugLog('No file path in tool input, allowing (fail-open)');
            process.exit(0);
        }

        // Allow writes to temp files
        if (isTempPath(filePath)) {
            debugLog('Temp file, allowing:', filePath);
            logHookEvent('explore-readonly-enforcer', 'allow', {
                reason: `Temp file allowed: ${filePath}`
            });
            process.exit(0);
        }

        // Allow writes to state.json
        if (isStateJson(filePath)) {
            debugLog('State.json write, allowing:', filePath);
            logHookEvent('explore-readonly-enforcer', 'allow', {
                reason: 'State.json write allowed during explore'
            });
            process.exit(0);
        }

        // Block: project file write during Chat/Explore mode
        logHookEvent('explore-readonly-enforcer', 'block', {
            reason: `Blocked ${input.tool_name} to ${filePath} during Chat/Explore mode`
        });

        outputBlockResponse(
            `CHAT/EXPLORE READ-ONLY: File writes are not permitted during ` +
            `Chat/Explore mode. This mode is for reading and exploring the ` +
            `codebase only.\n\n` +
            `Blocked: ${input.tool_name} to ${filePath}\n\n` +
            `To make changes, exit Chat/Explore mode first by ending the ` +
            `exploration session, then use /isdlc analyze followed by /isdlc build.`
        );
        process.exit(0);

    } catch (error) {
        debugLog('Error in explore-readonly-enforcer:', error.message);
        process.exit(0);
    }
}

main();
