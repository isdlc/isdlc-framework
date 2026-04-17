/**
 * Parallel-run bug-gather comparison tests (REQ-GH-253, T043)
 *
 * Creates 2 bug-gather conversation scenarios as test fixtures:
 *   (a) Simple bug with tracing delegation
 *   (b) Bug with amendment cycle
 *
 * Runs each through the parallel-run harness (tests/parallel-run/harness.js)
 * using a mock bridge that simulates the bug-gather state machine path.
 *
 * Asserts:
 *   - Zero critical divergences (states reached must match)
 *   - Acceptable divergences for tool preferences and card content
 *   - All divergences logged for diagnostic review
 *
 * These are deterministic tests using fixture data, NOT live LLM calls.
 *
 * Traces: T043, FR-008, AC-008-01
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareRun,
  compareOutputs,
  detectDivergence,
  logDiagnostics,
} from '../../tests/parallel-run/harness.js';

// ---------------------------------------------------------------------------
// Mock bridge factory — simulates the bug-gather state machine path
// ---------------------------------------------------------------------------

/**
 * Build a mock roundtable bridge that progresses through bug-gather states
 * according to a predetermined sequence, optionally with sub-tasks.
 *
 * @param {Array<{state: string, subTask: string|null}>} stateSequence
 *   - Per-turn state+subTask progression
 * @returns {object} Mock bridge with initializeRoundtable, composeForTurn, processAfterTurn
 */
function createMockBridge(stateSequence) {
  let turnIndex = 0;

  return {
    async initializeRoundtable(workflowType, _entryState, _options) {
      turnIndex = 0;
      // Verify this is called with 'bug-gather' workflow type
      assert.ok(
        workflowType === 'bug-gather' || workflowType === 'bug_gather',
        `expected bug-gather workflow type, got: ${workflowType}`
      );
      return {
        definition: { states: {}, workflow_type: 'bug_gather' },
        machine: {
          getCurrentState() {
            const entry = stateSequence[Math.min(turnIndex, stateSequence.length - 1)];
            return entry.state;
          },
          getActiveSubTask() {
            const entry = stateSequence[Math.min(turnIndex, stateSequence.length - 1)];
            return entry.subTask || null;
          },
          currentSubTask() {
            const entry = stateSequence[Math.min(turnIndex, stateSequence.length - 1)];
            return entry.subTask ? { id: entry.subTask } : null;
          },
          evaluateTransitions() {
            return { transitioned: false };
          },
        },
        rollingState: { sub_task_completion: {} },
      };
    },

    async composeForTurn(machine, _rollingState, _context, _manifestContext) {
      const state = machine.getCurrentState();
      const subTask = machine.getActiveSubTask();
      const stateCard = `--- STATE: ${state} ---\nRendering: bulleted_by_domain\n--- END STATE CARD ---`;

      turnIndex++;

      return {
        composedCard: stateCard,
        stateCard,
        taskCard: null,
        currentState: state,
        activeSubTask: subTask,
      };
    },

    async processAfterTurn(_machine, rollingState, _llmOutput) {
      return {
        updatedState: rollingState,
        transition: null,
        cleanOutput: '',
        trailer: null,
        markers: {},
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario fixtures
// ---------------------------------------------------------------------------

/**
 * Scenario A: Simple bug with tracing delegation
 * Turn 0: CONVERSATION (Maya opens with bug framing)
 * Turn 1: CONVERSATION (Alex codebase scan, Jordan fix implication)
 * Turn 2: CONVERSATION (more bug context)
 * Turn 3: PRESENTING_BUG_SUMMARY (participation gate satisfied)
 * Turn 4: PRESENTING_ROOT_CAUSE (after tracing delegation)
 * Turn 5: PRESENTING_FIX_STRATEGY
 * Turn 6: PRESENTING_TASKS
 */
const SCENARIO_A = {
  name: 'Simple bug with tracing delegation',
  inputs: [
    { type: 'user', text: 'The login page crashes when clicking submit with empty fields' },
    { type: 'user', text: 'It happens on Chrome and Firefox, started after last deploy' },
    { type: 'user', text: 'No error message shown, just a white screen' },
    { type: 'user', text: 'Accept the bug summary' },
    { type: 'user', text: 'Accept the root cause analysis' },
    { type: 'user', text: 'Accept the fix strategy' },
    { type: 'user', text: 'Accept the tasks' },
  ],
  // State progression for prose path simulation
  proseProgression: [
    'CONVERSATION',
    'CONVERSATION',
    'CONVERSATION',
    'PRESENTING_BUG_SUMMARY',
    'PRESENTING_ROOT_CAUSE',
    'PRESENTING_FIX_STRATEGY',
    'PRESENTING_TASKS',
  ],
  // State sequence for mechanism path
  mechanismSequence: [
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'CONVERSATION', subTask: 'CODEBASE_SCAN' },
    { state: 'CONVERSATION', subTask: 'SYMPTOM_ANALYSIS' },
    { state: 'PRESENTING_BUG_SUMMARY', subTask: null },
    { state: 'PRESENTING_ROOT_CAUSE', subTask: 'TRACING' },
    { state: 'PRESENTING_FIX_STRATEGY', subTask: null },
    { state: 'PRESENTING_TASKS', subTask: null },
  ],
};

/**
 * Scenario B: Bug with amendment cycle
 * Turn 0: CONVERSATION (Maya opens)
 * Turn 1: CONVERSATION (more context)
 * Turn 2: CONVERSATION (participation gate satisfied)
 * Turn 3: PRESENTING_BUG_SUMMARY (Maya presents)
 * Turn 4: CONVERSATION (user amends — back to conversation)
 * Turn 5: CONVERSATION (re-discuss)
 * Turn 6: PRESENTING_BUG_SUMMARY (re-present after amendment)
 * Turn 7: PRESENTING_ROOT_CAUSE
 */
const SCENARIO_B = {
  name: 'Bug with amendment cycle',
  inputs: [
    { type: 'user', text: 'API returns 500 on user profile endpoint' },
    { type: 'user', text: 'Only happens for users with special characters in their name' },
    { type: 'user', text: 'Started after the Unicode normalization update' },
    { type: 'user', text: 'Amend: actually it also affects the search endpoint' },
    { type: 'user', text: 'Yes, both endpoints use the same string sanitizer' },
    { type: 'user', text: 'The sanitizer strips diacritics incorrectly' },
    { type: 'user', text: 'Accept the updated bug summary' },
    { type: 'user', text: 'Accept the root cause' },
  ],
  proseProgression: [
    'CONVERSATION',
    'CONVERSATION',
    'CONVERSATION',
    'PRESENTING_BUG_SUMMARY',
    'CONVERSATION',              // Amendment restarts conversation
    'CONVERSATION',
    'PRESENTING_BUG_SUMMARY',    // Re-present after amendment
    'PRESENTING_ROOT_CAUSE',
  ],
  mechanismSequence: [
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'CONVERSATION', subTask: 'CODEBASE_SCAN' },
    { state: 'CONVERSATION', subTask: 'SYMPTOM_ANALYSIS' },
    { state: 'PRESENTING_BUG_SUMMARY', subTask: null },
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },   // Amend restarts
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'PRESENTING_BUG_SUMMARY', subTask: null },
    { state: 'PRESENTING_ROOT_CAUSE', subTask: 'TRACING' },
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify a divergence as critical or acceptable.
 * Critical: state mismatch (states reached don't match)
 * Acceptable: tool preferences, card content, sub_task differences
 *
 * @param {object} divergence - { field, prose, mechanism }
 * @returns {'critical' | 'acceptable'}
 */
function classifyDivergence(divergence) {
  if (divergence.field === 'state') return 'critical';
  return 'acceptable';
}

/**
 * Run a scenario and collect diagnostics.
 *
 * @param {object} scenario - Scenario fixture
 * @returns {Promise<{result: object, diagnostics: string[], criticalCount: number, acceptableCount: number}>}
 */
async function runScenario(scenario) {
  const bridge = createMockBridge(scenario.mechanismSequence);

  const result = await compareRun(
    'bug-gather',
    scenario.inputs,
    {
      bridge,
      stateProgression: scenario.proseProgression,
    },
  );

  const diagnostics = [];
  let criticalCount = 0;
  let acceptableCount = 0;

  for (const turnResult of result.divergences.perTurn) {
    diagnostics.push(logDiagnostics(turnResult, turnResult.turn));

    for (const div of turnResult.divergences) {
      const severity = classifyDivergence(div);
      if (severity === 'critical') criticalCount++;
      else acceptableCount++;
    }
  }

  return { result, diagnostics, criticalCount, acceptableCount };
}

// ---------------------------------------------------------------------------
// AC-01..AC-04: Scenario A — Simple bug with tracing
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T043 — Scenario A: Simple bug with tracing delegation', () => {
  it('AC-01: zero critical divergences (states match)', async () => {
    const { criticalCount } = await runScenario(SCENARIO_A);
    assert.strictEqual(criticalCount, 0, 'no critical divergences expected');
  });

  it('AC-02: all turns reach expected bug-gather states', async () => {
    const { result } = await runScenario(SCENARIO_A);
    // Prose path states
    assert.strictEqual(result.oldPathOutput[0].state, 'CONVERSATION');
    assert.strictEqual(result.oldPathOutput[1].state, 'CONVERSATION');
    assert.strictEqual(result.oldPathOutput[2].state, 'CONVERSATION');
    assert.strictEqual(result.oldPathOutput[3].state, 'PRESENTING_BUG_SUMMARY');
    assert.strictEqual(result.oldPathOutput[4].state, 'PRESENTING_ROOT_CAUSE');
    assert.strictEqual(result.oldPathOutput[5].state, 'PRESENTING_FIX_STRATEGY');
    assert.strictEqual(result.oldPathOutput[6].state, 'PRESENTING_TASKS');
    // Mechanism path states match
    assert.strictEqual(result.newPathOutput[0].state, 'CONVERSATION');
    assert.strictEqual(result.newPathOutput[3].state, 'PRESENTING_BUG_SUMMARY');
    assert.strictEqual(result.newPathOutput[4].state, 'PRESENTING_ROOT_CAUSE');
    assert.strictEqual(result.newPathOutput[5].state, 'PRESENTING_FIX_STRATEGY');
    assert.strictEqual(result.newPathOutput[6].state, 'PRESENTING_TASKS');
  });

  it('AC-03: mechanism path tracks TRACING sub-task at PRESENTING_ROOT_CAUSE', async () => {
    const { result } = await runScenario(SCENARIO_A);
    assert.strictEqual(result.newPathOutput[4].sub_task, 'TRACING');
    assert.strictEqual(result.oldPathOutput[4].sub_task, null);
  });

  it('AC-04: diagnostics produced for all 7 turns', async () => {
    const { diagnostics } = await runScenario(SCENARIO_A);
    assert.strictEqual(diagnostics.length, 7, 'one diagnostic per turn');
    for (const diag of diagnostics) {
      assert.ok(typeof diag === 'string' && diag.length > 0, 'diagnostic should be non-empty');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-10..AC-14: Scenario B — Bug with amendment cycle
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T043 — Scenario B: Bug with amendment cycle', () => {
  it('AC-10: zero critical divergences during amendment cycle', async () => {
    const { criticalCount } = await runScenario(SCENARIO_B);
    assert.strictEqual(criticalCount, 0, 'no critical divergences expected');
  });

  it('AC-11: both paths return to CONVERSATION after amendment', async () => {
    const { result } = await runScenario(SCENARIO_B);
    assert.strictEqual(result.oldPathOutput[4].state, 'CONVERSATION');
    assert.strictEqual(result.newPathOutput[4].state, 'CONVERSATION');
  });

  it('AC-12: both paths re-present BUG_SUMMARY after amendment', async () => {
    const { result } = await runScenario(SCENARIO_B);
    assert.strictEqual(result.oldPathOutput[6].state, 'PRESENTING_BUG_SUMMARY');
    assert.strictEqual(result.newPathOutput[6].state, 'PRESENTING_BUG_SUMMARY');
  });

  it('AC-13: states match at every turn across both paths', async () => {
    const { result } = await runScenario(SCENARIO_B);
    for (let i = 0; i < SCENARIO_B.inputs.length; i++) {
      assert.strictEqual(
        result.oldPathOutput[i].state,
        result.newPathOutput[i].state,
        `state mismatch at turn ${i}`,
      );
    }
  });

  it('AC-14: sub_task divergences are classified as acceptable', async () => {
    const { result } = await runScenario(SCENARIO_B);
    const subTaskDivergences = result.divergences.perTurn.flatMap(t =>
      t.divergences.filter(d => d.field === 'sub_task')
    );
    assert.ok(subTaskDivergences.length > 0, 'should have sub_task divergences');
    for (const d of subTaskDivergences) {
      assert.strictEqual(classifyDivergence(d), 'acceptable');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-20..AC-23: Cross-scenario structural validation
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T043 — Cross-scenario validation', () => {
  it('AC-20: both scenarios produce valid divergence reports', async () => {
    const scenarios = [SCENARIO_A, SCENARIO_B];
    for (const scenario of scenarios) {
      const { result } = await runScenario(scenario);
      assert.ok(result.divergences, `${scenario.name}: divergences should exist`);
      assert.strictEqual(result.divergences.totalTurns, scenario.inputs.length, `${scenario.name}: turn count should match`);
      assert.ok(Array.isArray(result.divergences.perTurn), `${scenario.name}: perTurn should be array`);
    }
  });

  it('AC-21: no scenario has state-level divergence', async () => {
    const scenarios = [SCENARIO_A, SCENARIO_B];
    for (const scenario of scenarios) {
      const { criticalCount } = await runScenario(scenario);
      assert.strictEqual(criticalCount, 0, `${scenario.name}: zero critical divergences expected`);
    }
  });

  it('AC-22: divergence count is deterministic (same input = same output)', async () => {
    const run1 = await runScenario(SCENARIO_A);
    const run2 = await runScenario(SCENARIO_A);
    assert.strictEqual(
      run1.result.divergences.divergedTurns,
      run2.result.divergences.divergedTurns,
      'diverged turn count should be deterministic',
    );
    assert.strictEqual(
      run1.result.divergences.convergedTurns,
      run2.result.divergences.convergedTurns,
      'converged turn count should be deterministic',
    );
  });

  it('AC-23: diagnostic log output is non-empty for all turns', async () => {
    const scenarios = [SCENARIO_A, SCENARIO_B];
    for (const scenario of scenarios) {
      const { diagnostics } = await runScenario(scenario);
      assert.strictEqual(diagnostics.length, scenario.inputs.length);
      for (const diag of diagnostics) {
        assert.ok(diag.length > 0, `${scenario.name}: diagnostic should be non-empty`);
      }
    }
  });
});
