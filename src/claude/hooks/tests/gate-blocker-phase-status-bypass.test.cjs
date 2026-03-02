/**
 * TDD Tests: BUG 0.1 -- Dual phase-status tracking bypass in gate-blocker
 *
 * Tests that the gate-blocker does NOT short-circuit on
 * active_workflow.phase_status[phase] === 'completed' when
 * state.phases[phase] has unsatisfied iteration requirements.
 *
 * TDD RED: Tests TC-01a, TC-01b, TC-01e FAIL against current code
 * because gate-blocker.cjs lines 645-649 return early with 'allow'
 * based on phase_status, bypassing all five requirement checks.
 *
 * Tests TC-01c, TC-01d, TC-01f PASS (GREEN) -- they validate existing
 * happy-path behavior that should not change.
 *
 * Traces to: AC-01a through AC-01e, NFR-01, NFR-02, NFR-03
 * File under test: src/claude/hooks/gate-blocker.cjs
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { check } = require('../gate-blocker.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal input that triggers isGateAdvancementAttempt() to return true.
 * Uses a Task tool call with an orchestrator subagent and gate keyword.
 */
function makeGateAdvancementInput() {
    return {
        tool_name: 'Task',
        tool_input: {
            subagent_type: 'sdlc-orchestrator',
            prompt: 'Advance to next phase after gate check',
            description: 'Gate advancement request'
        }
    };
}

/**
 * Build a non-gate input (Read tool) -- should always be allowed.
 */
function makeNonGateInput() {
    return {
        tool_name: 'Read',
        tool_input: {
            file_path: '/some/file.txt'
        }
    };
}

/**
 * Build requirements config with constitutional_validation enabled for a phase.
 * This ensures the gate-blocker has something to check against.
 */
function makeRequirementsConfig(phase, overrides) {
    const baseReq = {
        constitutional_validation: {
            enabled: true,
            max_iterations: 5,
            articles: ['I', 'II', 'VII']
        },
        interactive_elicitation: {
            enabled: false
        },
        test_iteration: {
            enabled: false
        },
        agent_delegation_validation: {
            enabled: false
        },
        artifact_validation: {
            enabled: false
        }
    };

    return {
        phase_requirements: {
            [phase]: Object.assign(baseReq, overrides || {})
        }
    };
}

/**
 * Build requirements config with test_iteration enabled for a phase.
 */
function makeTestIterationRequirements(phase) {
    return {
        phase_requirements: {
            [phase]: {
                test_iteration: {
                    enabled: true
                },
                constitutional_validation: {
                    enabled: false
                },
                interactive_elicitation: {
                    enabled: false
                },
                agent_delegation_validation: {
                    enabled: false
                },
                artifact_validation: {
                    enabled: false
                }
            }
        }
    };
}

/**
 * Build requirements config with interactive_elicitation enabled for a phase.
 */
function makeElicitationRequirements(phase) {
    return {
        phase_requirements: {
            [phase]: {
                interactive_elicitation: {
                    enabled: true,
                    min_menu_interactions: 3,
                    required_final_selection: ['save', 'continue']
                },
                constitutional_validation: {
                    enabled: false
                },
                test_iteration: {
                    enabled: false
                },
                agent_delegation_validation: {
                    enabled: false
                },
                artifact_validation: {
                    enabled: false
                }
            }
        }
    };
}

/**
 * Build a ctx object for check().
 * @param {object} opts
 * @param {object} opts.input - Tool call input
 * @param {object} opts.state - state.json equivalent
 * @param {object} opts.requirements - iteration-requirements.json equivalent
 * @returns {object} ctx for check()
 */
function buildCtx({ input, state, requirements }) {
    return {
        input: input || makeGateAdvancementInput(),
        state: state || {},
        manifest: {},
        requirements: requirements || {},
        workflows: { workflows: {} }
    };
}

// ---------------------------------------------------------------------------
// Bug 0.1 Tests: Phase-status bypass
// ---------------------------------------------------------------------------

describe('BUG 0.1: gate-blocker phase_status bypass', () => {

    // TC-01a: Gate blocks when phase_status=completed but constitutional unsatisfied
    // TDD RED: Current code returns 'allow' due to early-return at line 646
    it('TC-01a [P0]: blocks when phase_status=completed but constitutional_validation unsatisfied (AC-01a, AC-01d)', () => {
        const phase = '05-test-strategy';
        const ctx = buildCtx({
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    type: 'fix',
                    current_phase: phase,
                    current_phase_index: 2,
                    phases: ['01-requirements', '02-tracing', phase],
                    phase_status: {
                        [phase]: 'completed'  // BUG: This triggers the early-return bypass
                    }
                },
                phases: {
                    [phase]: {
                        status: 'in_progress',
                        constitutional_validation: {
                            completed: false,        // NOT satisfied
                            status: 'in_progress',
                            iterations_used: 0,
                            max_iterations: 5
                        }
                    }
                }
            },
            requirements: makeRequirementsConfig(phase)
        });

        const result = check(ctx);

        // After fix: gate should BLOCK because constitutional_validation is not completed
        // BUG (current): gate returns 'allow' due to phase_status early-return
        assert.equal(
            result.decision,
            'block',
            'Gate must block when constitutional_validation is unsatisfied, ' +
            'even if active_workflow.phase_status says completed. ' +
            'BUG 0.1: lines 645-649 cause early-return with allow.'
        );
    });

    // TC-01b: Gate blocks when phase_status=completed but elicitation unsatisfied
    // TDD RED: Current code returns 'allow' due to early-return at line 646
    it('TC-01b [P0]: blocks when phase_status=completed but interactive_elicitation unsatisfied (AC-01a, AC-01d)', () => {
        const phase = '01-requirements';
        const ctx = buildCtx({
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    type: 'feature',
                    current_phase: phase,
                    current_phase_index: 0,
                    phases: [phase, '02-impact-analysis'],
                    phase_status: {
                        [phase]: 'completed'  // BUG: triggers bypass
                    }
                },
                phases: {
                    [phase]: {
                        status: 'in_progress',
                        iteration_requirements: {
                            interactive_elicitation: {
                                completed: false,   // NOT satisfied
                                menu_interactions: 1
                            }
                        }
                    }
                }
            },
            requirements: makeElicitationRequirements(phase)
        });

        const result = check(ctx);

        // After fix: gate should BLOCK because elicitation is not completed
        assert.equal(
            result.decision,
            'block',
            'Gate must block when interactive_elicitation is unsatisfied, ' +
            'even if active_workflow.phase_status says completed. ' +
            'BUG 0.1: early-return bypass at line 646.'
        );
    });

    // TC-01c: Gate allows when all state.phases requirements satisfied (no phase_status)
    // GREEN: This tests the normal happy path -- should pass with or without the bug
    it('TC-01c [P0]: allows when state.phases requirements are fully satisfied (AC-01b, AC-01c)', () => {
        const phase = '05-test-strategy';
        const ctx = buildCtx({
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    type: 'fix',
                    current_phase: phase,
                    current_phase_index: 2,
                    phases: ['01-requirements', '02-tracing', phase],
                    phase_status: {}  // No phase_status entry
                },
                phases: {
                    [phase]: {
                        status: 'completed',
                        constitutional_validation: {
                            completed: true,
                            status: 'compliant',
                            iterations_used: 1,
                            max_iterations: 5,
                            articles_checked: ['I', 'II', 'VII']
                        }
                    }
                }
            },
            requirements: makeRequirementsConfig(phase)
        });

        const result = check(ctx);

        // Gate should allow: all requirements satisfied
        assert.equal(
            result.decision,
            'allow',
            'Gate should allow when all state.phases requirements are satisfied'
        );
    });

    // TC-01d: Gate blocks when phase_status absent and requirements unsatisfied
    // GREEN: This tests the normal blocking path without the bypass
    it('TC-01d [P1]: blocks when phase_status absent and requirements unsatisfied (AC-01b)', () => {
        const phase = '05-test-strategy';
        const ctx = buildCtx({
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    type: 'fix',
                    current_phase: phase,
                    current_phase_index: 2,
                    phases: ['01-requirements', '02-tracing', phase],
                    phase_status: {}  // No phase_status entry -- bypass NOT triggered
                },
                phases: {
                    [phase]: {
                        status: 'in_progress',
                        constitutional_validation: {
                            completed: false,
                            status: 'in_progress',
                            iterations_used: 0,
                            max_iterations: 5
                        }
                    }
                }
            },
            requirements: makeRequirementsConfig(phase)
        });

        const result = check(ctx);

        // Gate should block: constitutional_validation not completed and no bypass
        assert.equal(
            result.decision,
            'block',
            'Gate should block when requirements unsatisfied and no phase_status bypass'
        );
    });

    // TC-01e: Gate blocks when phase_status=completed but test_iteration unsatisfied
    // TDD RED: Current code returns 'allow' due to early-return at line 646
    it('TC-01e [P0]: blocks when phase_status=completed but test_iteration unsatisfied (AC-01a, AC-01d)', () => {
        const phase = '06-implementation';
        const ctx = buildCtx({
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    type: 'feature',
                    current_phase: phase,
                    current_phase_index: 5,
                    phases: ['01-requirements', '02-impact-analysis', '03-architecture', '04-design', '05-test-strategy', phase],
                    phase_status: {
                        [phase]: 'completed'  // BUG: triggers bypass
                    }
                },
                phases: {
                    [phase]: {
                        status: 'in_progress',
                        iteration_requirements: {
                            test_iteration: {
                                completed: false,   // NOT satisfied
                                current_iteration: 1,
                                max_iterations: 10,
                                last_test_result: 'failed',
                                failures_count: 3
                            }
                        }
                    }
                }
            },
            requirements: makeTestIterationRequirements(phase)
        });

        const result = check(ctx);

        // After fix: gate should BLOCK because test_iteration is not completed
        assert.equal(
            result.decision,
            'block',
            'Gate must block when test_iteration is unsatisfied, ' +
            'even if active_workflow.phase_status says completed. ' +
            'BUG 0.1: early-return bypass at line 646.'
        );
    });

    // TC-01f: Non-gate-advancement input still allowed (regression)
    // GREEN: Always passes -- verifies non-gate inputs are not affected
    it('TC-01f [P1]: non-gate-advancement input is always allowed (AC-01e)', () => {
        const ctx = buildCtx({
            input: makeNonGateInput(),
            state: {
                iteration_enforcement: { enabled: true },
                active_workflow: {
                    type: 'fix',
                    current_phase: '05-test-strategy',
                    phases: ['01-requirements', '05-test-strategy']
                },
                phases: {}
            },
            requirements: makeRequirementsConfig('05-test-strategy')
        });

        const result = check(ctx);

        assert.equal(
            result.decision,
            'allow',
            'Non-gate-advancement input should always be allowed'
        );
    });
});
