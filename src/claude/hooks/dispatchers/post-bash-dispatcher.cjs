#!/usr/bin/env node
'use strict';

/** REQ-0022 FR-008: High-resolution timer with Date.now() fallback (ADR-0004) */
const _now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now()
    : () => Date.now();

/**
 * iSDLC Post-Bash Dispatcher - PostToolUse[Bash] Hook
 * =====================================================
 * Consolidates 3 PostToolUse[Bash] hooks into 1 process for performance.
 * REQ-0010 Tier 1: Hook Dispatcher Consolidation
 *
 * All hooks run (no short-circuit -- PostToolUse is observational).
 *
 * Execution order:
 *   1. test-watcher                  - writes iteration state, may output stdout guidance
 *   2. review-reminder               - may output stdout warning (git commit only)
 *   3. atdd-completeness-validator   - stderr warnings (ATDD priority violations)
 *
 * Writes state once after all hooks.
 *
 * Hooks with shouldActivate guards are skipped when their conditions
 * aren't met (REQ-0010 T3-B).
 *
 * Version: 1.1.0
 */

const {
    readStdin,
    readState,
    writeState,
    loadManifest,
    loadIterationRequirements,
    loadWorkflowDefinitions,
    debugLog
} = require('../lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0093: Bridge-first delegation to core checkpoint-router for routing
let _checkpointRouter;
function _getCheckpointRouter() {
    if (_checkpointRouter !== undefined) return _checkpointRouter;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', '..', 'core', 'bridge', 'checkpoint-router.cjs');
        if (fs.existsSync(bridgePath)) {
            _checkpointRouter = require(bridgePath);
        } else { _checkpointRouter = null; }
    } catch (e) { _checkpointRouter = null; }
    return _checkpointRouter;
}

// Import hook check functions
const { check: testWatcherCheck } = require('../test-watcher.cjs');
const { check: reviewReminderCheck } = require('../review-reminder.cjs');
const { check: atddCompletenessValidatorCheck } = require('../atdd-completeness-validator.cjs');

/** @param {object} ctx @returns {boolean} */
const hasActiveWorkflow = (ctx) => !!ctx.state?.active_workflow;

/**
 * Hook execution order with optional activation guards.
 * If shouldActivate is defined and returns false, the hook is skipped.
 * @type {Array<{ name: string, check: function, shouldActivate?: function }>}
 */
const HOOKS = [
    { name: 'test-watcher',                check: testWatcherCheck,                shouldActivate: hasActiveWorkflow },
    { name: 'review-reminder',             check: reviewReminderCheck,             shouldActivate: hasActiveWorkflow },
    { name: 'atdd-completeness-validator', check: atddCompletenessValidatorCheck, shouldActivate: (ctx) => !!ctx.state?.active_workflow?.options?.atdd_mode }
];

const DISPATCHER_NAME = 'post-bash-dispatcher';

async function main() {
    const _dispatcherStart = _now();
    try {
        // 1. Read stdin once
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

        // 2. Read state once
        const state = readState();

        // 3. Load configs once
        const manifest = loadManifest();
        const requirements = loadIterationRequirements();
        const workflows = loadWorkflowDefinitions();

        // 4. Build ctx
        const ctx = { input, state, manifest, requirements, workflows };

        // 5. Call all hooks (no short-circuit -- PostToolUse is observational)
        let stateModified = false;
        const allStderr = [];
        const allStdout = [];
        let _hooksRan = 0;

        for (const hook of HOOKS) {
            if (hook.shouldActivate && !hook.shouldActivate(ctx)) {
                continue; // skip inactive hook
            }
            _hooksRan++;
            try {
                const result = hook.check(ctx);
                if (result.stateModified) stateModified = true;
                if (result.stderr) allStderr.push(result.stderr);
                if (result.stdout) allStdout.push(result.stdout);
            } catch (e) {
                debugLog(`post-bash-dispatcher: ${hook.name} threw:`, e.message);
                // Fail-open: continue to next hook
            }
        }

        // 6. Write state once if modified
        if (stateModified && state) {
            writeState(state);
        }

        // Output accumulated stderr/stdout
        if (allStderr.length > 0) {
            console.error(allStderr.join('\n'));
        }
        if (allStdout.length > 0) {
            console.log(allStdout.join('\n'));
        }

        // REQ-0022 FR-008: Dispatcher timing instrumentation
        try {
            const _elapsed = _now() - _dispatcherStart;
            console.error(`DISPATCHER_TIMING: ${DISPATCHER_NAME} completed in ${_elapsed.toFixed(1)}ms (${_hooksRan} hooks)`);
        } catch (_te) { /* fail-open */ }
        process.exit(0);
    } catch (e) {
        debugLog('post-bash-dispatcher error:', e.message);
        // REQ-0022 FR-008: Dispatcher timing instrumentation
        try {
            const _elapsed = _now() - _dispatcherStart;
            console.error(`DISPATCHER_TIMING: ${DISPATCHER_NAME} completed in ${_elapsed.toFixed(1)}ms (0 hooks)`);
        } catch (_te) { /* fail-open */ }
        process.exit(0);
    }
}

main();
