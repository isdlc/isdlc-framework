/**
 * Tests for V8 recovery_action exception in state-logic.cjs
 * Traces to: REQ-0051 FR-004, REQ-0052 FR-007
 * TC-V8-01 through TC-V8-12
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { checkPhaseFieldProtection } = require(path.join(__dirname, '..', 'lib', 'state-logic.cjs'));

const DUMMY_PATH = '/tmp/test/.isdlc/state.json';

function makeToolInput(content) {
    return { content: JSON.stringify(content) };
}

function baseDiskState() {
    return {
        active_workflow: {
            current_phase_index: 5,
            phase_status: {
                '01-requirements': 'completed',
                '02-impact-analysis': 'completed',
                '03-architecture': 'completed',
                '04-design': 'completed',
                '05-test-strategy': 'completed',
                '06-implementation': 'in_progress'
            }
        }
    };
}

describe('V8 recovery_action exception', () => {

    // --- 3.1 V8 Recovery Action for Retry ---

    // TC-V8-01: recovery_action type=retry allows status regression completed->in_progress
    it('TC-V8-01: retry allows completed->in_progress status regression', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '06-implementation': 'in_progress'
                },
                recovery_action: { type: 'retry', phase: '06-implementation', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '06-implementation': 'completed'
                }
            }
        };
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'Should not block with recovery_action type=retry');
    });

    // TC-V8-02: recovery_action type=retry allows completed->pending (recovery allows all status regression)
    it('TC-V8-02: retry allows completed->pending status regression', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '06-implementation': 'pending'
                },
                recovery_action: { type: 'retry', phase: '06-implementation', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '06-implementation': 'completed'
                }
            }
        };
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'Should not block with recovery_action type=retry');
    });

    // TC-V8-03: recovery_action type=retry does not affect phase_index (index stays same)
    it('TC-V8-03: retry with unchanged index is allowed', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '06-implementation': 'in_progress'
                },
                recovery_action: { type: 'retry', phase: '06-implementation', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'Should allow when index is unchanged');
    });

    // --- 3.2 V8 Recovery Action for Rollback ---

    // TC-V8-04: recovery_action type=rollback allows phase index regression
    it('TC-V8-04: rollback allows phase index regression', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 0,
                phase_status: {
                    '01-requirements': 'in_progress',
                    '06-implementation': 'pending'
                },
                recovery_action: { type: 'rollback', phase: '01-requirements', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'Should allow index regression with rollback recovery_action');
    });

    // TC-V8-05: recovery_action type=rollback allows completed->pending regression
    it('TC-V8-05: rollback allows completed->pending for multiple phases', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 0,
                phase_status: {
                    '01-requirements': 'in_progress',
                    '02-impact-analysis': 'pending',
                    '03-architecture': 'pending',
                    '04-design': 'pending',
                    '05-test-strategy': 'pending',
                    '06-implementation': 'pending'
                },
                recovery_action: { type: 'rollback', phase: '01-requirements', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'Should allow multiple status regressions with rollback');
    });

    // TC-V8-06: recovery_action type=rollback allows completed->in_progress for target
    it('TC-V8-06: rollback allows completed->in_progress for target phase', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 0,
                phase_status: {
                    '01-requirements': 'in_progress'
                },
                recovery_action: { type: 'rollback', phase: '01-requirements', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '01-requirements': 'completed'
                }
            }
        };
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'Should allow target phase completed->in_progress');
    });

    // --- 3.3 V8 Unchanged Behavior Without Recovery Action ---

    // TC-V8-07: no recovery_action blocks phase index regression
    it('TC-V8-07: blocks index regression without recovery_action', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 2,
                phase_status: {}
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.notEqual(result, null, 'Should return a block result');
        assert.equal(result.decision, 'block');
        assert.ok(result.stopReason.includes('Phase index regression'));
    });

    // TC-V8-08: no recovery_action blocks status completed->pending
    it('TC-V8-08: blocks completed->pending without recovery_action', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '03-architecture': 'pending'
                }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.notEqual(result, null, 'Should return a block result');
        assert.equal(result.decision, 'block');
        assert.ok(result.stopReason.includes('Phase status regression'));
    });

    // TC-V8-09: no recovery_action blocks completed->in_progress without supervised_review
    it('TC-V8-09: blocks completed->in_progress without recovery or supervised_review', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '03-architecture': 'in_progress'
                }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.notEqual(result, null, 'Should return a block result');
        assert.equal(result.decision, 'block');
    });

    // TC-V8-10: supervised_review redo exception still works (backward compat)
    it('TC-V8-10: supervised_review redo still allows completed->in_progress', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '03-architecture': 'in_progress'
                },
                supervised_review: {
                    status: 'redo_pending',
                    redo_count: 1
                }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.equal(result, null, 'supervised_review redo should still be allowed');
    });

    // TC-V8-11: recovery_action cleared state does not bypass V8
    it('TC-V8-11: absent recovery_action does not bypass V8', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '03-architecture': 'pending'
                }
                // no recovery_action — it was cleared after previous recovery
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.notEqual(result, null, 'Should block without recovery_action');
        assert.equal(result.decision, 'block');
    });

    // TC-V8-12: invalid recovery_action type does not bypass V8
    it('TC-V8-12: unknown recovery_action type does not bypass V8', () => {
        const incoming = {
            active_workflow: {
                current_phase_index: 5,
                phase_status: {
                    '03-architecture': 'pending'
                },
                recovery_action: { type: 'unknown', phase: '03-architecture', timestamp: '2026-03-08T12:00:00Z' }
            }
        };
        const disk = baseDiskState();
        const result = checkPhaseFieldProtection(DUMMY_PATH, makeToolInput(incoming), 'Write', disk);
        assert.notEqual(result, null, 'Should block with unknown recovery_action type');
        assert.equal(result.decision, 'block');
    });
});
