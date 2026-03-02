/**
 * TDD Tests: BUG 0.7 -- test-adequacy-blocker fires on wrong phases
 *
 * Tests that isUpgradeDelegation() and isUpgradePhaseActive() use the
 * correct '15-upgrade' prefix and do NOT match '16-quality-loop' or
 * the old '14-upgrade' prefix.
 *
 * TDD RED: These tests FAIL against current code because:
 * - isUpgradeDelegation() matches '16-' prefix (line 35) -> returns true for quality loop
 * - isUpgradeDelegation() matches '14-upgrade' prefix (line 36) -> returns true for old prefix
 * - isUpgradePhaseActive() matches '16-' prefix (line 62) -> returns true for quality loop
 *
 * Traces to: FR-02, AC-07a through AC-07f, NFR-01, NFR-02
 * File under test: src/claude/hooks/test-adequacy-blocker.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
    check,
    isUpgradeDelegation,
    isUpgradePhaseActive
} = require('../test-adequacy-blocker.cjs');

// ============================================================================
// BUG 0.7: Wrong phase detection tests
// ============================================================================

describe('BUG 0.7: test-adequacy-blocker phase detection', () => {

    // ==== isUpgradeDelegation tests ====

    // ---- AC-07a: isUpgradeDelegation MUST NOT return true for 16-quality-loop ----
    describe('AC-07a: isUpgradeDelegation rejects quality loop phases', () => {
        it('should return false for targetPhase 16-quality-loop', () => {
            const delegation = {
                isDelegation: true,
                targetPhase: '16-quality-loop',
                agentName: 'quality-loop-engineer'
            };
            const result = isUpgradeDelegation(delegation);
            assert.equal(result, false,
                'isUpgradeDelegation must NOT match 16-quality-loop');
        });

        it('should return false for any 16- prefixed phase', () => {
            const delegation = {
                isDelegation: true,
                targetPhase: '16-anything',
                agentName: 'some-agent'
            };
            const result = isUpgradeDelegation(delegation);
            assert.equal(result, false,
                'isUpgradeDelegation must NOT match any 16- prefix');
        });
    });

    // ---- AC-07b: isUpgradeDelegation MUST return true for 15-upgrade ----
    describe('AC-07b: isUpgradeDelegation matches 15-upgrade phases', () => {
        it('should return true for targetPhase 15-upgrade-plan', () => {
            const delegation = {
                isDelegation: true,
                targetPhase: '15-upgrade-plan',
                agentName: 'upgrade-engineer'
            };
            const result = isUpgradeDelegation(delegation);
            assert.equal(result, true,
                'isUpgradeDelegation must match 15-upgrade-plan');
        });

        it('should return true for targetPhase 15-upgrade-execute', () => {
            const delegation = {
                isDelegation: true,
                targetPhase: '15-upgrade-execute',
                agentName: 'upgrade-engineer'
            };
            const result = isUpgradeDelegation(delegation);
            assert.equal(result, true,
                'isUpgradeDelegation must match 15-upgrade-execute');
        });

        it('should return true when agentName includes upgrade', () => {
            const delegation = {
                isDelegation: true,
                targetPhase: 'some-phase',
                agentName: 'upgrade-engineer'
            };
            const result = isUpgradeDelegation(delegation);
            assert.equal(result, true,
                'isUpgradeDelegation must match agent name containing upgrade');
        });
    });

    // ---- AC-07a (extended): isUpgradeDelegation MUST NOT match old 14-upgrade prefix ----
    describe('AC-07a (extended): isUpgradeDelegation rejects old 14-upgrade prefix', () => {
        it('should return false for targetPhase 14-upgrade-plan (old prefix)', () => {
            const delegation = {
                isDelegation: true,
                targetPhase: '14-upgrade-plan',
                agentName: 'some-agent'
            };
            const result = isUpgradeDelegation(delegation);
            assert.equal(result, false,
                'isUpgradeDelegation must NOT match old 14-upgrade prefix');
        });
    });

    // ==== isUpgradePhaseActive tests ====

    // ---- AC-07c: isUpgradePhaseActive MUST NOT return true for 16-quality-loop ----
    describe('AC-07c: isUpgradePhaseActive rejects quality loop', () => {
        it('should return false when current phase is 16-quality-loop', () => {
            const state = {
                active_workflow: { current_phase: '16-quality-loop' }
            };
            const result = isUpgradePhaseActive(state);
            assert.equal(result, false,
                'isUpgradePhaseActive must NOT match 16-quality-loop');
        });
    });

    // ---- AC-07d: isUpgradePhaseActive MUST return true for 15-upgrade ----
    describe('AC-07d: isUpgradePhaseActive matches 15-upgrade phases', () => {
        it('should return true when current phase is 15-upgrade-plan', () => {
            const state = {
                active_workflow: { current_phase: '15-upgrade-plan' }
            };
            const result = isUpgradePhaseActive(state);
            assert.equal(result, true,
                'isUpgradePhaseActive must match 15-upgrade-plan');
        });

        it('should return true when current phase is 15-upgrade-execute', () => {
            const state = {
                active_workflow: { current_phase: '15-upgrade-execute' }
            };
            const result = isUpgradePhaseActive(state);
            assert.equal(result, true,
                'isUpgradePhaseActive must match 15-upgrade-execute');
        });
    });

    // ---- AC-07c (extended): isUpgradePhaseActive rejects old 14-upgrade prefix ----
    describe('AC-07c (extended): isUpgradePhaseActive rejects old 14-upgrade prefix', () => {
        it('should return false when current phase is 14-upgrade-plan', () => {
            const state = {
                active_workflow: { current_phase: '14-upgrade-plan' }
            };
            const result = isUpgradePhaseActive(state);
            assert.equal(result, false,
                'isUpgradePhaseActive must NOT match old 14-upgrade prefix');
        });
    });

    // ==== check() integration tests ====

    // ---- AC-07e: Dispatcher shouldActivate guard uses 15-upgrade prefix ----
    // NOTE: This is tested indirectly -- the dispatcher shouldActivate guard
    // at line 70-73 already uses '15-upgrade'. This test verifies the check()
    // function itself does not block quality loop delegations.

    describe('AC-07e: check() integration with correct phase filtering', () => {
        it('should allow quality loop delegation when called directly', () => {
            const ctx = {
                input: {
                    tool_name: 'Task',
                    tool_input: {
                        prompt: 'Delegate to quality-loop-engineer for Phase 16',
                        description: 'Run quality loop'
                    }
                },
                state: {
                    active_workflow: { current_phase: '16-quality-loop' },
                    discovery_context: {
                        coverage_summary: { total_tests: 0, unit_test_pct: 0 }
                    }
                },
                manifest: {},
                requirements: {},
                workflows: {}
            };
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'check() must allow quality loop delegation even with 0 tests');
        });
    });

    // ---- AC-07f: Quality loop delegations in feature/fix workflows MUST NOT trigger test adequacy ----
    describe('AC-07f: quality loop delegations do not trigger test adequacy checks', () => {
        it('should allow when feature workflow is in quality loop phase with no tests', () => {
            const ctx = {
                input: {
                    tool_name: 'Task',
                    tool_input: {
                        prompt: 'Execute quality loop for Phase 16 quality-loop-engineer',
                        description: 'Quality loop'
                    }
                },
                state: {
                    active_workflow: {
                        type: 'feature',
                        current_phase: '16-quality-loop'
                    },
                    discovery_context: {
                        coverage_summary: { total_tests: 0, unit_test_pct: 0 }
                    }
                },
                manifest: {},
                requirements: {},
                workflows: {}
            };
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Quality loop delegation must not be blocked by test adequacy');
        });
    });

    // ==== Regression tests ====

    describe('Regression: null/undefined inputs to isUpgradeDelegation', () => {
        it('should return false for null delegation', () => {
            assert.equal(isUpgradeDelegation(null), false);
        });

        it('should return false for non-delegation', () => {
            assert.equal(isUpgradeDelegation({ isDelegation: false }), false);
        });
    });

    describe('Regression: isUpgradePhaseActive with no active workflow', () => {
        it('should return false when no active_workflow', () => {
            assert.equal(isUpgradePhaseActive({}), false);
        });

        it('should return false when active_workflow has no current_phase', () => {
            assert.equal(isUpgradePhaseActive({ active_workflow: {} }), false);
        });
    });
});
