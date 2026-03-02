/**
 * TDD Tests: Item 0.14 -- Standardize Null-Check Patterns to Optional Chaining
 *
 * Verifies that replacing verbose &&-chain patterns with optional chaining (?.)
 * produces identical behavior for all null/undefined/present cases.
 * All tests verify behavior preservation -- identical outputs before/after.
 *
 * Traces to: AC-0014-1 through AC-0014-5, NFR-1
 * File under test: test-adequacy-blocker.cjs, state-write-validator.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// TC-14.01..05: test-adequacy-blocker null-check behavior preservation
// ---------------------------------------------------------------------------
describe('Item 0.14: test-adequacy-blocker null-check consistency', () => {
    const { isUpgradePhaseActive, check } = require('../test-adequacy-blocker.cjs');
    const { detectPhaseDelegation } = require('../lib/common.cjs');

    // TC-14.01: isUpgradePhaseActive with null active_workflow (AC-0014-3, AC-0014-5)
    it('TC-14.01: isUpgradePhaseActive returns false when active_workflow is null', () => {
        assert.strictEqual(isUpgradePhaseActive({ active_workflow: null }), false);
    });

    // TC-14.02: isUpgradePhaseActive with undefined active_workflow (AC-0014-3, AC-0014-5)
    it('TC-14.02: isUpgradePhaseActive returns false when active_workflow is undefined', () => {
        assert.strictEqual(isUpgradePhaseActive({}), false);
    });

    // TC-14.03: isUpgradePhaseActive with present active_workflow (AC-0014-3, AC-0014-5)
    it('TC-14.03: isUpgradePhaseActive returns true when upgrade phase is present', () => {
        assert.strictEqual(
            isUpgradePhaseActive({ active_workflow: { current_phase: '15-upgrade-v2' } }),
            true
        );
    });

    // TC-14.04: coverage check with null discovery_context (AC-0014-3, AC-0014-5)
    it('TC-14.04: check() allows when discovery_context is null (fail-open)', () => {
        const ctx = {
            input: {
                tool_name: 'Task',
                tool_input: {
                    subagent_type: 'upgrade-engineer',
                    prompt: 'Run upgrade',
                    description: 'Upgrade packages'
                }
            },
            state: { discovery_context: null },
            manifest: null,
            requirements: {},
            workflows: {}
        };
        const result = check(ctx);
        assert.strictEqual(result.decision, 'allow');
    });

    // TC-14.05: coverage check with present discovery_context (AC-0014-3, AC-0014-5)
    it('TC-14.05: check() allows when coverage is adequate', () => {
        const ctx = {
            input: {
                tool_name: 'Task',
                tool_input: {
                    subagent_type: 'upgrade-engineer',
                    prompt: 'Run upgrade',
                    description: 'Upgrade packages'
                }
            },
            state: {
                discovery_context: {
                    coverage_summary: { total_tests: 100, unit_test_pct: 80 }
                }
            },
            manifest: null,
            requirements: {},
            workflows: {}
        };
        const result = check(ctx);
        assert.strictEqual(result.decision, 'allow');
    });
});

// ---------------------------------------------------------------------------
// TC-14.06..10: state-write-validator null-check behavior preservation
// ---------------------------------------------------------------------------
describe('Item 0.14: state-write-validator null-check consistency', () => {
    const { check } = require('../state-write-validator.cjs');

    // TC-14.06: validatePhaseIntegrity with null iteration_requirements (AC-0014-4, AC-0014-5)
    it('TC-14.06: validatePhase produces no V2/V3 warnings when iteration_requirements is null', () => {
        // Build a Write tool event to state.json with phase data that has null iteration_requirements
        const stateContent = JSON.stringify({
            state_version: 1,
            phases: {
                '01-requirements': {
                    status: 'completed',
                    iteration_requirements: null
                }
            }
        });
        const ctx = {
            input: {
                tool_name: 'Write',
                tool_input: {
                    file_path: '/project/.isdlc/state.json',
                    content: stateContent
                }
            },
            state: {},
            manifest: {},
            requirements: {},
            workflows: {}
        };
        const result = check(ctx);
        // Should allow (no warnings about elicitation/test_iteration since those paths are null)
        assert.strictEqual(result.decision, 'allow');
    });

    // TC-14.07: validatePhaseIntegrity with present interactive_elicitation (AC-0014-4, AC-0014-5)
    it('TC-14.07: validatePhase produces no V2 warning when elicitation is valid', () => {
        const stateContent = JSON.stringify({
            state_version: 1,
            phases: {
                '01-requirements': {
                    status: 'completed',
                    iteration_requirements: {
                        interactive_elicitation: { completed: true, menu_interactions: 3 }
                    }
                }
            }
        });
        const ctx = {
            input: {
                tool_name: 'Write',
                tool_input: {
                    file_path: '/project/.isdlc/state.json',
                    content: stateContent
                }
            },
            state: {},
            manifest: {},
            requirements: {},
            workflows: {}
        };
        const result = check(ctx);
        assert.strictEqual(result.decision, 'allow');
    });

    // TC-14.08: checkVersionLock with null active_workflow in incoming state (AC-0014-4, AC-0014-5)
    it('TC-14.08: check allows when incoming active_workflow is null', () => {
        const stateContent = JSON.stringify({
            state_version: 1,
            active_workflow: null,
            phases: {}
        });
        const ctx = {
            input: {
                tool_name: 'Write',
                tool_input: {
                    file_path: '/project/.isdlc/state.json',
                    content: stateContent
                }
            },
            state: {},
            manifest: {},
            requirements: {},
            workflows: {}
        };
        const result = check(ctx);
        assert.strictEqual(result.decision, 'allow');
    });

    // TC-14.09: Source file uses optional chaining patterns (AC-0014-4)
    it('TC-14.09: state-write-validator source uses optional chaining for iteration_requirements', () => {
        const filePath = path.join(__dirname, '..', 'state-write-validator.cjs');
        const source = fs.readFileSync(filePath, 'utf8');

        // After refactoring, the &&-chain patterns for iteration_requirements
        // should be replaced with optional chaining
        const hasOptionalChaining =
            source.includes('iteration_requirements?.interactive_elicitation') ||
            source.includes('iteration_requirements?.test_iteration');

        assert.ok(
            hasOptionalChaining,
            'state-write-validator should use optional chaining for iteration_requirements access'
        );
    });

    // TC-14.10: Source file uses optional chaining for test-adequacy-blocker (AC-0014-3)
    it('TC-14.10: test-adequacy-blocker source uses optional chaining', () => {
        const filePath = path.join(__dirname, '..', 'test-adequacy-blocker.cjs');
        const source = fs.readFileSync(filePath, 'utf8');

        // After refactoring, the &&-chain for active_workflow.current_phase
        // should use optional chaining, and discovery_context.coverage_summary too
        const hasOptionalChaining =
            source.includes('active_workflow?.current_phase') ||
            source.includes('discovery_context?.coverage_summary');

        assert.ok(
            hasOptionalChaining,
            'test-adequacy-blocker should use optional chaining for null-safe property access'
        );
    });
});
