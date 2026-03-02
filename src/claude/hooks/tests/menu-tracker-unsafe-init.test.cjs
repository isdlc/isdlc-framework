/**
 * TDD Tests: BUG 0.11 -- Menu tracker unsafe nested object initialization
 *
 * Tests that the menu tracker type-checks iteration_requirements before
 * accessing nested properties. If the value is not a plain object, it
 * must be reset to {}.
 *
 * TDD RED: These tests FAIL against current code because line 167 only
 * checks `if (!value)` which passes for truthy non-objects like true, 1,
 * "string". Line 172 then tries to access .interactive_elicitation on
 * these non-objects, causing undefined behavior or TypeError.
 *
 * Traces to: FR-03, AC-11a through AC-11d, NFR-01
 * File under test: src/claude/hooks/menu-tracker.cjs
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { check } = require('../menu-tracker.cjs');

/**
 * Build a minimal ctx that triggers the menu tracker's state update path.
 * The tool_result must contain enough menu patterns to trigger detection
 * (at least 2 MENU_PRESENTATION_PATTERNS).
 */
function makeMenuCtx(state) {
    return {
        input: {
            tool_name: 'Task',
            tool_result: '[A] Adjust  [R] Refine  [C] Continue\nYour choice: C',
            tool_input: {
                prompt: 'User selected [C] Continue'
            }
        },
        state: state,
        manifest: {},
        requirements: {},
        workflows: {}
    };
}

/**
 * Build a state object with a specific iteration_requirements value for phase 01.
 * @param {*} iterReqValue - The value to set for iteration_requirements
 */
function makeState(iterReqValue) {
    return {
        active_workflow: {
            type: 'feature',
            current_phase: '01-requirements'
        },
        current_phase: '01-requirements',
        phases: {
            '01-requirements': {
                status: 'in_progress',
                iteration_requirements: iterReqValue
            }
        }
    };
}

// ============================================================================
// BUG 0.11: Menu tracker unsafe nested init tests
// ============================================================================

describe('BUG 0.11: Menu tracker unsafe nested object initialization', () => {

    // ---- AC-11a: truthy non-object values reset to {} ----
    describe('AC-11a: resets truthy non-object iteration_requirements to {}', () => {
        it('should not throw when iteration_requirements is true', () => {
            const state = makeState(true);
            const ctx = makeMenuCtx(state);
            // Current bug: !true is false, so init is skipped.
            // Then .interactive_elicitation is accessed on boolean true -> undefined
            // Downstream access on undefined throws TypeError (caught by fail-open)
            // After fix: typeof check resets true to {}
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must not crash on boolean iteration_requirements');
            // After fix, state should be properly updated with menu interaction
            assert.equal(typeof state.phases['01-requirements'].iteration_requirements, 'object',
                'iteration_requirements must be reset to an object');
            assert.ok(state.phases['01-requirements'].iteration_requirements !== null,
                'iteration_requirements must not be null');
            // Verify the state was actually modified (stateModified = true)
            assert.equal(result.stateModified, true,
                'State should be marked as modified after menu tracking');
        });

        it('should not throw when iteration_requirements is a number', () => {
            const state = makeState(42);
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must not crash on numeric iteration_requirements');
            assert.equal(typeof state.phases['01-requirements'].iteration_requirements, 'object',
                'iteration_requirements must be reset to an object for number value');
            assert.equal(result.stateModified, true,
                'State should be marked as modified');
        });

        it('should not throw when iteration_requirements is a string', () => {
            const state = makeState('corrupted');
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must not crash on string iteration_requirements');
            assert.equal(typeof state.phases['01-requirements'].iteration_requirements, 'object',
                'iteration_requirements must be reset to an object for string value');
            assert.equal(result.stateModified, true,
                'State should be marked as modified');
        });
    });

    // ---- AC-11b: null/undefined values initialized to {} ----
    describe('AC-11b: initializes null/undefined iteration_requirements to {}', () => {
        it('should initialize null iteration_requirements to {}', () => {
            const state = makeState(null);
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must handle null iteration_requirements');
            assert.equal(typeof state.phases['01-requirements'].iteration_requirements, 'object',
                'null iteration_requirements must be initialized to {}');
            assert.equal(result.stateModified, true,
                'State should be marked as modified');
        });

        it('should initialize undefined iteration_requirements to {}', () => {
            const state = makeState(undefined);
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must handle undefined iteration_requirements');
            assert.equal(typeof state.phases['01-requirements'].iteration_requirements, 'object',
                'undefined iteration_requirements must be initialized to {}');
            assert.equal(result.stateModified, true,
                'State should be marked as modified');
        });
    });

    // ---- AC-11c: valid objects preserved unchanged ----
    describe('AC-11c: preserves valid object iteration_requirements', () => {
        it('should preserve existing empty object', () => {
            const state = makeState({});
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must handle valid empty object');
            assert.equal(typeof state.phases['01-requirements'].iteration_requirements, 'object',
                'Valid object must be preserved');
            assert.equal(result.stateModified, true,
                'State should be marked as modified');
        });

        it('should preserve existing object with data', () => {
            const existingData = {
                interactive_elicitation: {
                    required: true,
                    completed: false,
                    menu_interactions: 3,
                    selections: [{ selection: 'adjust', timestamp: '2026-02-15T10:00:00Z' }],
                    steps_completed: ['project_discovery']
                }
            };
            const state = makeState(existingData);
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must handle valid object with existing data');
            // The existing data should be preserved and extended (not replaced)
            const iterReq = state.phases['01-requirements'].iteration_requirements;
            assert.ok(iterReq.interactive_elicitation,
                'interactive_elicitation must still exist');
            assert.ok(iterReq.interactive_elicitation.menu_interactions >= 3,
                'Existing menu_interactions count must be preserved/incremented');
            assert.equal(result.stateModified, true,
                'State should be marked as modified');
        });
    });

    // ---- AC-11d: interactive_elicitation init logic unchanged ----
    describe('AC-11d: interactive_elicitation initialization logic unchanged', () => {
        it('should initialize interactive_elicitation when iteration_requirements is reset from corrupted value', () => {
            const state = makeState(true); // corrupted
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow');
            // After reset, iteration_requirements should be {} and interactive_elicitation
            // should be initialized by the existing logic (lines 172-182)
            const iterReq = state.phases['01-requirements'].iteration_requirements;
            assert.ok(iterReq.interactive_elicitation,
                'interactive_elicitation must be initialized after reset');
            assert.equal(typeof iterReq.interactive_elicitation.menu_interactions, 'number',
                'menu_interactions must be initialized as a number');
            assert.ok(iterReq.interactive_elicitation.menu_interactions >= 1,
                'At least one menu interaction must be recorded');
        });

        it('should not double-initialize interactive_elicitation for valid state', () => {
            const existingElicit = {
                interactive_elicitation: {
                    required: true,
                    completed: false,
                    menu_interactions: 5,
                    selections: [],
                    steps_completed: [],
                    started_at: '2026-02-15T09:00:00Z'
                }
            };
            const state = makeState(existingElicit);
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow');
            const elicit = state.phases['01-requirements'].iteration_requirements.interactive_elicitation;
            // started_at should be preserved (not overwritten)
            assert.equal(elicit.started_at, '2026-02-15T09:00:00Z',
                'Existing started_at must be preserved');
            // menu_interactions should be incremented by 1
            assert.equal(elicit.menu_interactions, 6,
                'menu_interactions must be incremented by 1 from existing value');
        });
    });

    // ==== Edge case: Array (truthy, typeof === 'object', but not plain object) ====
    describe('Edge case: Array value for iteration_requirements', () => {
        it('should reset array to {} since arrays are not valid iteration_requirements', () => {
            const state = makeState([1, 2, 3]);
            const ctx = makeMenuCtx(state);
            const result = check(ctx);
            assert.equal(result.decision, 'allow',
                'Must handle array iteration_requirements');
            const iterReq = state.phases['01-requirements'].iteration_requirements;
            // After fix, arrays should be reset to {} (Array.isArray guard)
            assert.ok(!Array.isArray(iterReq),
                'iteration_requirements must not remain an array');
            assert.equal(typeof iterReq, 'object',
                'iteration_requirements must be a plain object');
        });
    });
});
