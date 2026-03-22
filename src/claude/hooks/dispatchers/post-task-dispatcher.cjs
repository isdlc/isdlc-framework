#!/usr/bin/env node
'use strict';

/** REQ-0022 FR-008: High-resolution timer with Date.now() fallback (ADR-0004) */
const _now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now()
    : () => Date.now();

/**
 * iSDLC Post-Task Dispatcher - PostToolUse[Task] Hook
 * =====================================================
 * Consolidates 6 PostToolUse[Task] hooks into 1 process for performance.
 * REQ-0010 Tier 1: Hook Dispatcher Consolidation
 *
 * All hooks run (no short-circuit -- PostToolUse is observational).
 *
 * Execution order:
 *   1. log-skill-usage           - writes skill_usage_log (state modification)
 *   2. menu-tracker              - writes menu/elicitation state (state modification)
 *   3. walkthrough-tracker       - stderr warnings only
 *   4. discover-menu-guard       - stderr warnings only
 *   5. phase-transition-enforcer - stderr warnings only
 *   6. menu-halt-enforcer        - stderr warnings only
 *
 * Writes state once after all hooks.
 * PostToolUse hooks receive tool_result in input.
 *
 * NOTE: No global early-exit-if-no-active-workflow guard because
 * log-skill-usage logs regardless. Hooks with shouldActivate guards are
 * skipped when their conditions aren't met (REQ-0010 T3-B).
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
const { check: logSkillUsageCheck } = require('../log-skill-usage.cjs');
const { check: menuTrackerCheck } = require('../menu-tracker.cjs');
const { check: walkthroughTrackerCheck } = require('../walkthrough-tracker.cjs');
const { check: discoverMenuGuardCheck } = require('../discover-menu-guard.cjs');
const { check: phaseTransitionEnforcerCheck } = require('../phase-transition-enforcer.cjs');
const { check: menuHaltEnforcerCheck } = require('../menu-halt-enforcer.cjs');

/** @param {object} ctx @returns {boolean} */
const hasActiveWorkflow = (ctx) => !!ctx.state?.active_workflow;

/**
 * Hook execution order with optional activation guards.
 * If shouldActivate is defined and returns false, the hook is skipped.
 * @type {Array<{ name: string, check: function, shouldActivate?: function }>}
 */
const HOOKS = [
    { name: 'log-skill-usage',           check: logSkillUsageCheck },
    { name: 'menu-tracker',              check: menuTrackerCheck,              shouldActivate: hasActiveWorkflow },
    { name: 'walkthrough-tracker',       check: walkthroughTrackerCheck,       shouldActivate: (ctx) => ctx.state?.active_workflow?.type === 'discover' },
    { name: 'discover-menu-guard',       check: discoverMenuGuardCheck,        shouldActivate: (ctx) => ctx.state?.active_workflow?.type === 'discover' },
    { name: 'phase-transition-enforcer', check: phaseTransitionEnforcerCheck,  shouldActivate: hasActiveWorkflow },
    { name: 'menu-halt-enforcer',        check: menuHaltEnforcerCheck,         shouldActivate: hasActiveWorkflow }
];

const DISPATCHER_NAME = 'post-task-dispatcher';

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
                debugLog(`post-task-dispatcher: ${hook.name} threw:`, e.message);
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
        debugLog('post-task-dispatcher error:', e.message);
        // REQ-0022 FR-008: Dispatcher timing instrumentation
        try {
            const _elapsed = _now() - _dispatcherStart;
            console.error(`DISPATCHER_TIMING: ${DISPATCHER_NAME} completed in ${_elapsed.toFixed(1)}ms (0 hooks)`);
        } catch (_te) { /* fail-open */ }
        process.exit(0);
    }
}

main();
