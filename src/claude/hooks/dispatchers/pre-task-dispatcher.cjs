#!/usr/bin/env node
'use strict';

/** REQ-0022 FR-008: High-resolution timer with Date.now() fallback (ADR-0004) */
const _now = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? () => performance.now()
    : () => Date.now();

/**
 * iSDLC Pre-Task Dispatcher - PreToolUse[Task] Hook
 * ===================================================
 * Consolidates 9 PreToolUse[Task] hooks into 1 process for performance.
 * REQ-0010 Tier 1: Hook Dispatcher Consolidation
 *
 * Execution order (preserves current enforcement priority):
 *   1. iteration-corridor    - corridor enforcement (test/constitutional)
 *   2. skill-validator       - observe only, never blocks
 *   3. phase-loop-controller - progress tracking (phase in_progress check)
 *   4. plan-surfacer         - task plan existence check
 *   5. phase-sequence-guard  - phase ordering enforcement
 *   6. gate-blocker          - gate requirements + self-healing
 *   7. constitution-validator - constitutional compliance check
 *   8. test-adequacy-blocker - test coverage sufficiency (upgrade phases)
 *   9. blast-radius-validator - impact analysis coverage (feature Phase 06)
 *
 * Short-circuits on first { decision: 'block' }.
 * Writes state once after all hooks or after the blocking hook.
 *
 * NOTE: No global early-exit-if-no-active-workflow guard because
 * skill-validator runs regardless. Hooks with shouldActivate guards are
 * skipped when their conditions aren't met (REQ-0010 T3-B).
 *
 * Version: 1.3.0
 */

const {
    readStdin,
    readState,
    writeState,
    loadManifest,
    loadIterationRequirements,
    loadWorkflowDefinitions,
    outputBlockResponse,
    debugLog,
    checkPhaseTimeout,
    logHookEvent,
    PHASE_PREFIXES
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
const { check: iterationCorridorCheck } = require('../iteration-corridor.cjs');
const { check: skillValidatorCheck } = require('../skill-validator.cjs');
const { check: phaseLoopControllerCheck } = require('../phase-loop-controller.cjs');
const { check: planSurfacerCheck } = require('../plan-surfacer.cjs');
const { check: phaseSequenceGuardCheck } = require('../phase-sequence-guard.cjs');
const { check: gateBlockerCheck } = require('../gate-blocker.cjs');
const { check: constitutionValidatorCheck } = require('../constitution-validator.cjs');
const { check: testAdequacyBlockerCheck } = require('../test-adequacy-blocker.cjs');
const { check: blastRadiusValidatorCheck } = require('../blast-radius-validator.cjs');
const { check: traceabilityEnforcerCheck } = require('../traceability-enforcer.cjs');

/** @param {object} ctx @returns {boolean} */
const hasActiveWorkflow = (ctx) => !!ctx.state?.active_workflow;

/**
 * Hook execution order with optional activation guards.
 * If shouldActivate is defined and returns false, the hook is skipped.
 * @type {Array<{ name: string, check: function, shouldActivate?: function }>}
 */
const HOOKS = [
    { name: 'iteration-corridor',    check: iterationCorridorCheck,    shouldActivate: hasActiveWorkflow },
    { name: 'skill-validator',       check: skillValidatorCheck },
    { name: 'phase-loop-controller', check: phaseLoopControllerCheck, shouldActivate: hasActiveWorkflow },
    { name: 'plan-surfacer',         check: planSurfacerCheck,         shouldActivate: hasActiveWorkflow },
    { name: 'phase-sequence-guard',  check: phaseSequenceGuardCheck,  shouldActivate: hasActiveWorkflow },
    { name: 'gate-blocker',          check: gateBlockerCheck,          shouldActivate: hasActiveWorkflow },
    { name: 'constitution-validator', check: constitutionValidatorCheck, shouldActivate: hasActiveWorkflow },
    { name: 'test-adequacy-blocker', check: testAdequacyBlockerCheck, shouldActivate: (ctx) => {
        if (!ctx.state?.active_workflow) return false;
        const phase = ctx.state.active_workflow.current_phase || '';
        return phase.startsWith(PHASE_PREFIXES.UPGRADE);
    }},
    { name: 'blast-radius-validator', check: blastRadiusValidatorCheck, shouldActivate: (ctx) => {
        // CON-005: Feature workflows only
        if (!ctx.state?.active_workflow) return false;
        if (ctx.state.active_workflow.type !== 'feature') return false;
        // AC-001-06: Phase 06 implementation only
        const phase = ctx.state.active_workflow.current_phase || '';
        return phase === PHASE_PREFIXES.IMPLEMENTATION;
    }},
    { name: 'traceability-enforcer', check: traceabilityEnforcerCheck, shouldActivate: (ctx) => {
        // REQ-GH-223 FR-006: Feature workflows, implementation+ phases
        if (!ctx.state?.active_workflow) return false;
        if (ctx.state.active_workflow.type !== 'feature') return false;
        const phase = ctx.state.active_workflow.current_phase || '';
        return phase === PHASE_PREFIXES.IMPLEMENTATION || phase === '16-quality-loop';
    }}
];

const DISPATCHER_NAME = 'pre-task-dispatcher';

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

        // 2. Read state once (BUG 0.6 fix: default null to {} for safe context)
        const state = readState() || {};

        // 3. Load configs once (BUG 0.6 fix: default null to {} for safe context)
        const manifest = loadManifest() || {};
        const requirements = loadIterationRequirements() || {};
        const workflows = loadWorkflowDefinitions() || {};

        // 4. Build ctx
        const ctx = { input, state, manifest, requirements, workflows };

        // 4b. Phase timeout advisory check (fail-open, non-blocking)
        if (state?.active_workflow && requirements) {
            try {
                const timeout = checkPhaseTimeout(state, requirements);
                if (timeout.exceeded) {
                    console.error(`TIMEOUT WARNING: Phase '${timeout.phase}' has been active for ${timeout.elapsed} minutes (limit: ${timeout.limit}). Consider escalating to human review.`);
                    logHookEvent('pre-task-dispatcher', 'timeout_warning', {
                        phase: timeout.phase,
                        reason: `Phase active for ${timeout.elapsed}min, limit ${timeout.limit}min`
                    });
                    // BUG 0.12 fix: Emit structured degradation hint for downstream agents
                    try {
                        const hint = {
                            type: 'timeout_degradation',
                            phase: timeout.phase,
                            elapsed: timeout.elapsed,
                            limit: timeout.limit,
                            actions: [
                                'reduce_debate_rounds',
                                'reduce_parallelism',
                                'skip_optional_steps'
                            ]
                        };
                        console.error(`DEGRADATION_HINT: ${JSON.stringify(hint)}`);
                    } catch (hintErr) {
                        // Fail-open: hint generation errors must not block (AC-12d)
                        debugLog('pre-task-dispatcher: hint generation error:', hintErr.message);
                    }
                }
            } catch (e) {
                // Fail-open: timeout check errors should never block
                debugLog('pre-task-dispatcher: timeout check error:', e.message);
            }
        }

        // 5. Call hooks in order, short-circuit on first block
        let stateModified = false;
        const allStderr = [];
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

                if (result.decision === 'block') {
                    // Write state before blocking
                    if (stateModified && state) {
                        writeState(state);
                    }
                    // Output accumulated stderr
                    if (allStderr.length > 0) {
                        console.error(allStderr.join('\n'));
                    }
                    // Output block response
                    outputBlockResponse(result.stopReason);
                    // REQ-0022 FR-008: Dispatcher timing instrumentation
                    try {
                        const _elapsed = _now() - _dispatcherStart;
                        console.error(`DISPATCHER_TIMING: ${DISPATCHER_NAME} completed in ${_elapsed.toFixed(1)}ms (${_hooksRan} hooks)`);
                    } catch (_te) { /* fail-open */ }
                    process.exit(0);
                }
            } catch (e) {
                debugLog(`pre-task-dispatcher: ${hook.name} threw:`, e.message);
                // Fail-open: continue to next hook
            }
        }

        // 6. Write state once if modified
        if (stateModified && state) {
            writeState(state);
        }

        // Output accumulated stderr
        if (allStderr.length > 0) {
            console.error(allStderr.join('\n'));
        }

        // REQ-0022 FR-008: Dispatcher timing instrumentation
        try {
            const _elapsed = _now() - _dispatcherStart;
            console.error(`DISPATCHER_TIMING: ${DISPATCHER_NAME} completed in ${_elapsed.toFixed(1)}ms (${_hooksRan} hooks)`);
        } catch (_te) { /* fail-open */ }
        process.exit(0);
    } catch (e) {
        debugLog('pre-task-dispatcher error:', e.message);
        // REQ-0022 FR-008: Dispatcher timing instrumentation
        try {
            const _elapsed = _now() - _dispatcherStart;
            console.error(`DISPATCHER_TIMING: ${DISPATCHER_NAME} completed in ${_elapsed.toFixed(1)}ms (0 hooks)`);
        } catch (_te) { /* fail-open */ }
        process.exit(0);
    }
}

main();
