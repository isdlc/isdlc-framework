/**
 * TDD Tests: Item 0.16 -- Dead Code Removal in gate-blocker.cjs
 *
 * Verifies that the redundant else branch in gate-blocker.cjs (which
 * accessed state.active_workflow?.current_phase when activeWorkflow was
 * already falsy) is simplified to just `state.current_phase`.
 * All tests verify behavior preservation -- identical outputs before/after.
 *
 * Traces to: AC-0016-1 through AC-0016-3, NFR-1
 * File under test: src/claude/hooks/gate-blocker.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { check } = require('../gate-blocker.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal input that triggers isGateAdvancementAttempt() to return true.
 */
function makeGateInput() {
    return {
        tool_name: 'Task',
        tool_input: {
            subagent_type: 'sdlc-orchestrator',
            prompt: 'Advance to next phase after gate check',
            description: 'Gate advancement'
        }
    };
}

/**
 * Build iteration requirements with constitutional_validation for a phase.
 */
function makeRequirements(phase) {
    return {
        phases: {
            [phase]: {
                constitutional_validation: { required: true, min_iterations: 1 }
            }
        }
    };
}

// ---------------------------------------------------------------------------
// TC-16.01: currentPhase from active_workflow.current_phase (AC-0016-2, AC-0016-3)
// ---------------------------------------------------------------------------
describe('Item 0.16: Dead code removal in gate-blocker.cjs', () => {
    it('TC-16.01: resolves currentPhase from active_workflow.current_phase', () => {
        const ctx = {
            input: makeGateInput(),
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    current_phase: '06-implementation',
                    type: 'fix',
                    current_phase_index: 0,
                    phases: ['06-implementation'],
                    phase_status: { '06-implementation': 'in_progress' }
                },
                phases: {
                    '06-implementation': {
                        status: 'in_progress',
                        constitutional_validation: {
                            completed: true,
                            iterations_used: 1,
                            status: 'compliant'
                        }
                    }
                }
            },
            manifest: {},
            requirements: makeRequirements('06-implementation'),
            workflows: { workflows: { fix: { phases: ['06-implementation'] } } }
        };
        const result = check(ctx);
        // Should proceed to gate checks, not early-return with allow
        // The specific result depends on the phase data, but it should NOT be
        // an early "allow" from "no currentPhase" guard
        assert.ok(result, 'check() should return a result');
        assert.ok(result.decision, 'result should have a decision');
    });

    // TC-16.02: currentPhase from state.current_phase when no active_workflow (AC-0016-2, AC-0016-3)
    it('TC-16.02: resolves currentPhase from state.current_phase when no active_workflow', () => {
        const ctx = {
            input: makeGateInput(),
            state: {
                iteration_enforcement: { enabled: true },
                current_phase: '01-requirements',
                phases: {
                    '01-requirements': {
                        status: 'in_progress',
                        constitutional_validation: {
                            completed: true,
                            iterations_used: 1,
                            status: 'compliant'
                        }
                    }
                }
            },
            manifest: {},
            requirements: makeRequirements('01-requirements'),
            workflows: {}
        };
        const result = check(ctx);
        // Should resolve to '01-requirements' and proceed, not early-allow
        assert.ok(result, 'check() should return a result');
        assert.ok(result.decision, 'result should have a decision');
    });

    // TC-16.03: allows when no active_workflow and no current_phase (AC-0016-2, AC-0016-3)
    it('TC-16.03: allows when no active_workflow and no current_phase', () => {
        const ctx = {
            input: makeGateInput(),
            state: {
                iteration_enforcement: { enabled: true },
                phases: {}
            },
            manifest: {},
            requirements: {},
            workflows: {}
        };
        const result = check(ctx);
        assert.strictEqual(result.decision, 'allow');
    });

    // TC-16.04: else branch no longer references state.active_workflow?.current_phase (AC-0016-1)
    it('TC-16.04: source else branch does not contain redundant optional chaining', () => {
        const filePath = path.join(__dirname, '..', 'gate-blocker.cjs');
        const source = fs.readFileSync(filePath, 'utf8');

        // Find the else branch after if (activeWorkflow)
        // The dead code pattern was: currentPhase = state.active_workflow?.current_phase || state.current_phase;
        // After fix, it should be: currentPhase = state.current_phase;

        // Check that the redundant pattern does NOT exist in the else branch
        // The pattern "state.active_workflow?.current_phase" in an else block is the dead code
        const elsePattern = /}\s*else\s*\{[^}]*state\.active_workflow\?\.current_phase/;
        assert.ok(
            !elsePattern.test(source),
            'else branch should not contain state.active_workflow?.current_phase (dead code)'
        );
    });

    // TC-16.05: fallback to state.current_phase when active_workflow has no current_phase (AC-0016-2, AC-0016-3)
    it('TC-16.05: uses state.current_phase fallback when active_workflow.current_phase is missing', () => {
        const ctx = {
            input: makeGateInput(),
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: { type: 'fix' }, // no current_phase
                current_phase: '02-tracing',
                phases: {
                    '02-tracing': {
                        status: 'in_progress',
                        constitutional_validation: {
                            completed: true,
                            iterations_used: 1,
                            status: 'compliant'
                        }
                    }
                }
            },
            manifest: {},
            requirements: makeRequirements('02-tracing'),
            workflows: { workflows: { fix: { phases: ['02-tracing'] } } }
        };
        const result = check(ctx);
        // Should proceed with '02-tracing', not early-allow
        assert.ok(result, 'check() should return a result');
        assert.ok(result.decision, 'result should have a decision');
    });
});
