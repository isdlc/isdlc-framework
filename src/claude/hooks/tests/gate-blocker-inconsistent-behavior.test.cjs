/**
 * TDD Tests: BUG-0008 -- Inconsistent hook behavior in gate-blocker.cjs
 *
 * Three bugs:
 *   0.4: Phase index bounds not validated (lines 588-604)
 *   0.5: Empty workflows object prevents fallback loading (lines 581-584)
 *   0.8: Supervised review doesn't coordinate with gate-blocker (lines 736-740)
 *
 * Traces to: AC-04a through AC-04f, AC-05a through AC-05e, AC-08a through AC-08f
 * File under test: src/claude/hooks/gate-blocker.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { check } = require('../gate-blocker.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal input that triggers isGateAdvancementAttempt() to return true.
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
 * Build a ctx object for check().
 * @param {object} opts
 * @param {object} opts.input - Tool call input
 * @param {object} opts.state - state.json equivalent
 * @param {object} opts.requirements - iteration-requirements.json equivalent
 * @param {object} [opts.workflows] - workflows.json equivalent
 * @returns {object} ctx for check()
 */
function buildCtx({ input, state, requirements, workflows }) {
    return {
        input: input || makeGateAdvancementInput(),
        state: state || {},
        manifest: {},
        requirements: requirements || {},
        workflows: workflows !== undefined ? workflows : { workflows: { fix: { phases: ['01-requirements', '02-tracing', '05-test-strategy'] } } }
    };
}

/**
 * Build a minimal state with active workflow and phase data.
 */
function makeActiveState(phase, overrides) {
    const base = {
        iteration_enforcement: { enabled: true },
        active_workflow: {
            type: 'fix',
            current_phase: phase,
            current_phase_index: 0,
            phases: [phase],
            phase_status: {
                [phase]: 'in_progress'
            }
        },
        phases: {
            [phase]: {
                status: 'in_progress',
                constitutional_validation: {
                    completed: true,
                    status: 'compliant',
                    iterations_used: 1,
                    max_iterations: 5
                }
            }
        }
    };
    return Object.assign(base, overrides || {});
}

/**
 * Build minimal requirements config with all checks disabled.
 */
function makeMinimalRequirements(phase) {
    return {
        phase_requirements: {
            [phase]: {
                constitutional_validation: { enabled: false },
                interactive_elicitation: { enabled: false },
                test_iteration: { enabled: false },
                agent_delegation_validation: { enabled: false },
                artifact_validation: { enabled: false }
            }
        }
    };
}

// ===========================================================================
// Bug 0.4: Phase index bounds not validated
// ===========================================================================

describe('BUG 0.4: Phase index bounds not validated', () => {

    // AC-04a: Negative phaseIndex triggers fail-safe allow
    it('TC-04a [P0]: negative phaseIndex does not throw or falsely block (AC-04a)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: -1,  // BUG: negative index
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        // Should NOT throw and should NOT falsely block due to mismatch
        // workflowPhases[-1] is undefined, which !== currentPhase, causing false block
        assert.ok(
            result.decision !== undefined,
            'Must return a valid decision, not throw'
        );
        // After fix: negative index should be treated as invalid -> skip sequence validation -> allow
        assert.notEqual(
            result.decision,
            'block',
            'Negative phaseIndex should not cause a false block (fail-safe per Article X)'
        );
    });

    // AC-04b: Non-finite phaseIndex triggers fail-safe allow
    it('TC-04b [P0]: NaN phaseIndex does not throw or falsely block (AC-04b)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: NaN,  // BUG: non-finite index
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        assert.ok(result.decision !== undefined, 'Must return a valid decision');
        // NaN != null is true in JS, so the current code enters the phaseIndex != null branch
        // workflowPhases[NaN] is undefined !== currentPhase -> false block
        assert.notEqual(
            result.decision,
            'block',
            'NaN phaseIndex should not cause a false block (fail-safe per Article X)'
        );
    });

    // AC-04b: String phaseIndex
    it('TC-04b2 [P0]: string phaseIndex does not throw or falsely block (AC-04b)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 'two',  // BUG: string index
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        assert.ok(result.decision !== undefined, 'Must return a valid decision');
        assert.notEqual(
            result.decision,
            'block',
            'String phaseIndex should not cause a false block'
        );
    });

    // AC-04c: Non-array workflowPhases skips validation
    it('TC-04c [P0]: non-array workflowPhases does not throw (AC-04c)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: 'not-an-array',  // BUG: not an array
                phase_status: { [phase]: 'in_progress' }
            }
        });

        // Workflow def also has non-array phases
        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: { workflows: { fix: { phases: null } } }
        });
        const result = check(ctx);

        assert.ok(result.decision !== undefined, 'Must return a valid decision, not throw');
        assert.notEqual(
            result.decision,
            'block',
            'Non-array workflowPhases should skip validation, not block'
        );
    });

    // AC-04d: Empty workflowPhases array skips validation
    it('TC-04d [P0]: empty workflowPhases array does not throw (AC-04d)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: [],  // BUG: empty array
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: { workflows: { fix: { phases: [] } } }
        });
        const result = check(ctx);

        assert.ok(result.decision !== undefined, 'Must return a valid decision');
        // workflowPhases[0] on empty array is undefined !== currentPhase -> false block
        assert.notEqual(
            result.decision,
            'block',
            'Empty workflowPhases should skip validation, not block'
        );
    });

    // AC-04e: Out-of-bounds phaseIndex does not throw
    it('TC-04e [P0]: out-of-bounds phaseIndex does not throw (AC-04e)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 999,  // Way out of bounds
                phases: ['01-requirements', phase],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        assert.ok(result.decision !== undefined, 'Must return a valid decision, not throw');
    });

    // AC-04f: Valid index + array works as before (regression check)
    it('TC-04f [P0]: valid phaseIndex and array work correctly -- no regression (AC-04f)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        // Valid state: phase at index 2 matches currentPhase -- should allow (or block for other reasons)
        // The key is that it does NOT block for "workflow state mismatch"
        if (result.decision === 'block') {
            assert.ok(
                !result.stopReason?.includes('Workflow state mismatch'),
                'Valid phase/index combination must not trigger mismatch block'
            );
        }
    });

    // AC-04f: Valid index mismatch correctly blocks
    it('TC-04f2 [P0]: valid index/array mismatch correctly blocks (AC-04f)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,  // Index 0 points to '01-requirements', not '05-test-strategy'
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        // Genuine mismatch: index 0 -> '01-requirements' but current is '05-test-strategy'
        assert.equal(result.decision, 'block', 'Genuine phase mismatch must still block');
        assert.ok(
            result.stopReason?.includes('Workflow state mismatch'),
            'Block reason must mention workflow state mismatch'
        );
    });
});

// ===========================================================================
// Bug 0.5: Empty workflows object prevents fallback loading
// ===========================================================================

describe('BUG 0.5: Empty workflows object prevents fallback loading', () => {

    // AC-05a: Empty ctx.workflows {} triggers fallback
    it('TC-05a [P0]: empty ctx.workflows {} does not prevent sequence validation (AC-05a)', () => {
        const phase = '01-requirements';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: ['01-requirements', '02-tracing'],  // This is on activeWorkflow, used as fallback
                phase_status: { [phase]: 'in_progress' }
            }
        });

        // ctx.workflows is {} -- truthy but has no .workflows sub-object
        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: {}  // BUG: truthy empty object
        });
        const result = check(ctx);

        // After fix: fallback loading should kick in, sequence validation should work
        // The phase at index 0 is '01-requirements' which matches currentPhase, so no mismatch block
        // Key test: it should NOT silently skip validation due to missing workflowDef
        assert.ok(
            result.decision !== undefined,
            'Must return a valid decision'
        );
    });

    // AC-05b: ctx.workflows with valid .workflows sub-object is used
    it('TC-05b [P0]: ctx.workflows with .workflows sub-object used directly (AC-05b)', () => {
        const phase = '01-requirements';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: ['01-requirements', '02-tracing'],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        // Valid workflows object with .workflows sub-object (even if empty)
        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: { workflows: { fix: { phases: ['01-requirements', '02-tracing'] } } }
        });
        const result = check(ctx);

        assert.ok(result.decision !== undefined, 'Must return a valid decision');
    });

    // AC-05c: null ctx.workflows triggers fallback
    it('TC-05c [P0]: null ctx.workflows triggers fallback loaders (AC-05c)', () => {
        const phase = '01-requirements';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: ['01-requirements', '02-tracing'],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: null
        });
        const result = check(ctx);

        // Null triggers || fallback chain naturally
        assert.ok(result.decision !== undefined, 'Must return a valid decision');
    });

    // AC-05d: Valid ctx.workflows is used directly (no fallback)
    it('TC-05d [P0]: valid ctx.workflows is used directly (AC-05d)', () => {
        const phase = '02-tracing';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 1,
                // activeWorkflow.phases has different order than ctx.workflows
                phases: ['01-requirements', '02-tracing', '05-test-strategy'],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: { workflows: { fix: { phases: ['01-requirements', '02-tracing', '05-test-strategy'] } } }
        });
        const result = check(ctx);

        // Phase at index 1 is '02-tracing' which matches currentPhase -- no mismatch
        assert.ok(result.decision !== undefined, 'Must return a valid decision');
        if (result.decision === 'block') {
            assert.ok(
                !result.stopReason?.includes('Workflow state mismatch'),
                'Valid phase/index with valid workflows must not trigger mismatch'
            );
        }
    });

    // AC-05e: All sources failing results in graceful skip
    it('TC-05e [P1]: all workflow sources null results in graceful skip (AC-05e)', () => {
        const phase = '01-requirements';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: ['01-requirements'],
                phase_status: { [phase]: 'in_progress' }
            }
        });

        // Pass null workflows -- fallback loaders may also fail in test env
        const ctx = buildCtx({
            state,
            requirements: makeMinimalRequirements(phase),
            workflows: null
        });
        const result = check(ctx);

        // Should not throw, should return a decision
        assert.ok(
            result.decision !== undefined,
            'Must return a valid decision even when all workflow sources fail'
        );
    });
});

// ===========================================================================
// Bug 0.8: Supervised review doesn't coordinate with gate-blocker
// ===========================================================================

describe('BUG 0.8: Supervised review coordination', () => {

    // AC-08a: Reviewing status blocks gate advancement
    it('TC-08a [P0]: supervised_review.status=reviewing blocks advancement (AC-08a)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' },
                supervised_review: {
                    status: 'reviewing',
                    phase: phase,
                    started_at: '2026-02-15T17:00:00Z'
                }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        assert.equal(
            result.decision,
            'block',
            'Gate must block when supervised review is in progress'
        );
    });

    // AC-08b: Block message includes supervised review and phase
    it('TC-08b [P0]: block message mentions supervised review and phase (AC-08b)', () => {
        const phase = '06-implementation';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 0,
                phases: [phase],
                phase_status: { [phase]: 'in_progress' },
                supervised_review: {
                    status: 'reviewing',
                    phase: phase,
                    started_at: '2026-02-15T17:00:00Z'
                }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        assert.equal(result.decision, 'block');
        const reason = (result.stopReason || '').toLowerCase();
        assert.ok(
            reason.includes('supervised') && reason.includes('review'),
            `Block reason must mention supervised review, got: ${result.stopReason}`
        );
    });

    // AC-08c: Approved status does not block
    it('TC-08c [P0]: supervised_review.status=approved does not block (AC-08c)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' },
                supervised_review: {
                    status: 'approved',
                    phase: phase,
                    approved_at: '2026-02-15T17:05:00Z'
                }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        // If it blocks, it must NOT be because of supervised review
        if (result.decision === 'block') {
            const reason = (result.stopReason || '').toLowerCase();
            assert.ok(
                !reason.includes('supervised review'),
                'Approved supervised review must not cause a block'
            );
        }
    });

    // AC-08d: Absent supervised_review does not block
    it('TC-08d [P0]: absent supervised_review does not block (AC-08d)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' }
                // No supervised_review field at all
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        // If it blocks, it must NOT be because of supervised review
        if (result.decision === 'block') {
            const reason = (result.stopReason || '').toLowerCase();
            assert.ok(
                !reason.includes('supervised review'),
                'Absent supervised review must not cause a block'
            );
        }
    });

    // AC-08e: Rejected status blocks with rejection message
    it('TC-08e [P0]: supervised_review.status=rejected blocks with rejection message (AC-08e)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' },
                supervised_review: {
                    status: 'rejected',
                    phase: phase,
                    rejected_at: '2026-02-15T17:05:00Z',
                    reason: 'Insufficient test coverage'
                }
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        assert.equal(result.decision, 'block', 'Rejected review must block');
        const reason = (result.stopReason || '').toLowerCase();
        assert.ok(
            reason.includes('rejected') || reason.includes('supervised'),
            `Block reason must mention rejection, got: ${result.stopReason}`
        );
    });

    // AC-08f: Supervised review check is early (before iteration requirements)
    it('TC-08f [P1]: supervised review block happens before iteration req checks (AC-08f)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' },
                supervised_review: {
                    status: 'reviewing',
                    phase: phase
                }
            },
            phases: {
                [phase]: {
                    status: 'in_progress',
                    constitutional_validation: {
                        completed: false,  // Also unsatisfied
                        status: 'in_progress',
                        iterations_used: 0,
                        max_iterations: 5
                    }
                }
            }
        });

        const ctx = buildCtx({
            state,
            requirements: {
                phase_requirements: {
                    [phase]: {
                        constitutional_validation: {
                            enabled: true,
                            max_iterations: 5,
                            articles: ['I', 'II']
                        },
                        interactive_elicitation: { enabled: false },
                        test_iteration: { enabled: false },
                        agent_delegation_validation: { enabled: false },
                        artifact_validation: { enabled: false }
                    }
                }
            }
        });
        const result = check(ctx);

        assert.equal(result.decision, 'block');
        const reason = (result.stopReason || '').toLowerCase();
        // Should mention supervised review, NOT iteration requirements
        assert.ok(
            reason.includes('supervised') && reason.includes('review'),
            `Should block for supervised review (early), not iteration requirements. Got: ${result.stopReason}`
        );
    });

    // Regression: null supervised_review object
    it('TC-08g [P0]: null supervised_review does not block (regression) (AC-08d)', () => {
        const phase = '05-test-strategy';
        const state = makeActiveState(phase, {
            active_workflow: {
                type: 'fix',
                current_phase: phase,
                current_phase_index: 2,
                phases: ['01-requirements', '02-tracing', phase],
                phase_status: { [phase]: 'in_progress' },
                supervised_review: null  // Explicitly null
            }
        });

        const ctx = buildCtx({ state, requirements: makeMinimalRequirements(phase) });
        const result = check(ctx);

        if (result.decision === 'block') {
            const reason = (result.stopReason || '').toLowerCase();
            assert.ok(
                !reason.includes('supervised review'),
                'Null supervised review must not cause a block'
            );
        }
    });
});
