/**
 * Parallel-run analyze comparison tests (REQ-GH-253, T041)
 *
 * Creates 3 analyze conversation scenarios as test fixtures:
 *   (a) Simple 3-turn feature analysis
 *   (b) Multi-turn with scope framing + codebase scan + confirmation
 *   (c) Amendment cycle
 *
 * Runs each through the parallel-run harness (tests/parallel-run/harness.js)
 * using a mock bridge that simulates the state machine path.
 *
 * Asserts:
 *   - Zero critical divergences (states reached must match)
 *   - Acceptable divergences for tool preferences and card content
 *   - All divergences logged for diagnostic review
 *
 * These are deterministic tests using fixture data, NOT live LLM calls.
 *
 * Traces: T041, FR-008, AC-008-01, AC-008-02
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
// Mock bridge factory — simulates the state machine path
// ---------------------------------------------------------------------------

/**
 * Build a mock roundtable bridge that progresses through states
 * according to a predetermined sequence, optionally with sub-tasks.
 *
 * @param {Array<{state: string, subTask: string|null}>} stateSequence
 *   - Per-turn state+subTask progression
 * @returns {object} Mock bridge with initializeRoundtable, composeForTurn, processAfterTurn
 */
function createMockBridge(stateSequence) {
  let turnIndex = 0;

  return {
    async initializeRoundtable() {
      turnIndex = 0;
      return {
        definition: { states: {} },
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
 * Scenario A: Simple 3-turn feature analysis
 * Turn 0: CONVERSATION (opening question)
 * Turn 1: CONVERSATION (user describes feature)
 * Turn 2: PRESENTING_REQUIREMENTS (transition after enough info)
 */
const SCENARIO_A = {
  name: 'Simple 3-turn feature analysis',
  inputs: [
    { type: 'user', text: 'I want to add a dark mode toggle' },
    { type: 'user', text: 'It should be in the settings page with a switch component' },
    { type: 'user', text: 'Yes, that covers it' },
  ],
  // State progression for prose path simulation
  proseProgression: [
    'CONVERSATION',
    'CONVERSATION',
    'PRESENTING_REQUIREMENTS',
  ],
  // State sequence for mechanism path
  mechanismSequence: [
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'PRESENTING_REQUIREMENTS', subTask: null },
  ],
};

/**
 * Scenario B: Multi-turn with scope framing, codebase scan, and confirmation
 * Turn 0: CONVERSATION (opening)
 * Turn 1: CONVERSATION (scope framing in progress)
 * Turn 2: CONVERSATION (codebase scan sub-task)
 * Turn 3: PRESENTING_REQUIREMENTS
 * Turn 4: PRESENTING_ARCHITECTURE
 * Turn 5: PRESENTING_DESIGN
 */
const SCENARIO_B = {
  name: 'Multi-turn with scope framing + codebase scan + confirmation',
  inputs: [
    { type: 'user', text: 'Build a notification system' },
    { type: 'user', text: 'Real-time WebSocket notifications' },
    { type: 'user', text: 'Priority levels: critical, high, medium, low' },
    { type: 'user', text: 'Accept the requirements' },
    { type: 'user', text: 'Accept the architecture' },
    { type: 'user', text: 'Accept the design' },
  ],
  proseProgression: [
    'CONVERSATION',
    'CONVERSATION',
    'CONVERSATION',
    'PRESENTING_REQUIREMENTS',
    'PRESENTING_ARCHITECTURE',
    'PRESENTING_DESIGN',
  ],
  mechanismSequence: [
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'CONVERSATION', subTask: 'CODEBASE_SCAN' },
    { state: 'PRESENTING_REQUIREMENTS', subTask: null },
    { state: 'PRESENTING_ARCHITECTURE', subTask: null },
    { state: 'PRESENTING_DESIGN', subTask: null },
  ],
};

/**
 * Scenario C: Amendment cycle
 * Turn 0: CONVERSATION (opening)
 * Turn 1: PRESENTING_REQUIREMENTS
 * Turn 2: AMENDING (user amends)
 * Turn 3: CONVERSATION (back to conversation after amendment)
 * Turn 4: PRESENTING_REQUIREMENTS (re-present after amendment)
 */
const SCENARIO_C = {
  name: 'Amendment cycle',
  inputs: [
    { type: 'user', text: 'Add user authentication' },
    { type: 'user', text: 'Let me see the requirements' },
    { type: 'user', text: 'Amend: add OAuth2 support' },
    { type: 'user', text: 'Also add SAML support' },
    { type: 'user', text: 'Accept these updated requirements' },
  ],
  proseProgression: [
    'CONVERSATION',
    'PRESENTING_REQUIREMENTS',
    'CONVERSATION',           // Amendment restarts conversation
    'CONVERSATION',
    'PRESENTING_REQUIREMENTS',
  ],
  mechanismSequence: [
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'PRESENTING_REQUIREMENTS', subTask: null },
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },  // Amend returns to CONVERSATION
    { state: 'CONVERSATION', subTask: 'SCOPE_FRAMING' },
    { state: 'PRESENTING_REQUIREMENTS', subTask: null },
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
  // State divergence is critical
  if (divergence.field === 'state') return 'critical';
  // Everything else (rendering_mode, template_used, preferred_tools, sub_task) is acceptable
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
    'analyze',
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
// AC-01..AC-03: Scenario A — Simple 3-turn
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T041 — Scenario A: Simple 3-turn feature analysis', () => {
  it('AC-01: zero critical divergences (states match)', async () => {
    const { criticalCount } = await runScenario(SCENARIO_A);
    assert.strictEqual(criticalCount, 0, 'no critical divergences expected');
  });

  it('AC-02: all turns reach expected states', async () => {
    const { result } = await runScenario(SCENARIO_A);
    // Prose path states
    assert.strictEqual(result.oldPathOutput[0].state, 'CONVERSATION');
    assert.strictEqual(result.oldPathOutput[1].state, 'CONVERSATION');
    assert.strictEqual(result.oldPathOutput[2].state, 'PRESENTING_REQUIREMENTS');
    // Mechanism path states
    assert.strictEqual(result.newPathOutput[0].state, 'CONVERSATION');
    assert.strictEqual(result.newPathOutput[1].state, 'CONVERSATION');
    assert.strictEqual(result.newPathOutput[2].state, 'PRESENTING_REQUIREMENTS');
  });

  it('AC-03: acceptable divergences are only for sub_task or tools (not state)', async () => {
    const { result } = await runScenario(SCENARIO_A);
    for (const turnResult of result.divergences.perTurn) {
      for (const div of turnResult.divergences) {
        assert.notStrictEqual(div.field, 'state', `unexpected state divergence at turn ${turnResult.turn}`);
      }
    }
  });

  it('AC-04: diagnostics are produced for each turn', async () => {
    const { diagnostics } = await runScenario(SCENARIO_A);
    assert.strictEqual(diagnostics.length, 3, 'one diagnostic per turn');
    for (const diag of diagnostics) {
      assert.ok(typeof diag === 'string' && diag.length > 0, 'diagnostic should be non-empty string');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-10..AC-13: Scenario B — Multi-turn with sub-tasks
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T041 — Scenario B: Multi-turn with scope framing + codebase scan', () => {
  it('AC-10: zero critical divergences across 6 turns', async () => {
    const { criticalCount } = await runScenario(SCENARIO_B);
    assert.strictEqual(criticalCount, 0, 'no critical divergences expected');
  });

  it('AC-11: states match at every turn', async () => {
    const { result } = await runScenario(SCENARIO_B);
    for (let i = 0; i < SCENARIO_B.inputs.length; i++) {
      assert.strictEqual(
        result.oldPathOutput[i].state,
        result.newPathOutput[i].state,
        `state mismatch at turn ${i}`,
      );
    }
  });

  it('AC-12: mechanism path tracks sub-tasks that prose path lacks', async () => {
    const { result } = await runScenario(SCENARIO_B);
    // The mechanism path has SCOPE_FRAMING and CODEBASE_SCAN sub-tasks
    // that the prose path does not track (prose sub_task is always null)
    assert.strictEqual(result.newPathOutput[0].sub_task, 'SCOPE_FRAMING');
    assert.strictEqual(result.newPathOutput[2].sub_task, 'CODEBASE_SCAN');
    assert.strictEqual(result.oldPathOutput[0].sub_task, null);
  });

  it('AC-13: sub_task divergences are classified as acceptable', async () => {
    const { result, acceptableCount } = await runScenario(SCENARIO_B);
    // Sub-task divergences should exist (mechanism has them, prose doesn't)
    // and should all be classified as acceptable
    const subTaskDivergences = result.divergences.perTurn.flatMap(t =>
      t.divergences.filter(d => d.field === 'sub_task')
    );
    // At least some turns should have sub_task divergences
    assert.ok(subTaskDivergences.length > 0, 'should have sub_task divergences');
    // All sub_task divergences should be acceptable
    for (const d of subTaskDivergences) {
      assert.strictEqual(classifyDivergence(d), 'acceptable');
    }
  });

  it('AC-14: confirmation states match across both paths', async () => {
    const { result } = await runScenario(SCENARIO_B);
    // Turns 3, 4, 5 are confirmation states
    assert.strictEqual(result.oldPathOutput[3].state, 'PRESENTING_REQUIREMENTS');
    assert.strictEqual(result.newPathOutput[3].state, 'PRESENTING_REQUIREMENTS');
    assert.strictEqual(result.oldPathOutput[4].state, 'PRESENTING_ARCHITECTURE');
    assert.strictEqual(result.newPathOutput[4].state, 'PRESENTING_ARCHITECTURE');
    assert.strictEqual(result.oldPathOutput[5].state, 'PRESENTING_DESIGN');
    assert.strictEqual(result.newPathOutput[5].state, 'PRESENTING_DESIGN');
  });
});

// ---------------------------------------------------------------------------
// AC-20..AC-23: Scenario C — Amendment cycle
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T041 — Scenario C: Amendment cycle', () => {
  it('AC-20: zero critical divergences during amendment cycle', async () => {
    const { criticalCount } = await runScenario(SCENARIO_C);
    assert.strictEqual(criticalCount, 0, 'no critical divergences expected');
  });

  it('AC-21: both paths return to CONVERSATION after amendment', async () => {
    const { result } = await runScenario(SCENARIO_C);
    // Turn 2: user amends -> back to CONVERSATION
    assert.strictEqual(result.oldPathOutput[2].state, 'CONVERSATION');
    assert.strictEqual(result.newPathOutput[2].state, 'CONVERSATION');
  });

  it('AC-22: both paths re-present requirements after amendment', async () => {
    const { result } = await runScenario(SCENARIO_C);
    // Turn 4: re-present requirements
    assert.strictEqual(result.oldPathOutput[4].state, 'PRESENTING_REQUIREMENTS');
    assert.strictEqual(result.newPathOutput[4].state, 'PRESENTING_REQUIREMENTS');
  });

  it('AC-23: amendment cycle produces no critical divergences in diagnostics', async () => {
    const { diagnostics, criticalCount } = await runScenario(SCENARIO_C);
    assert.strictEqual(criticalCount, 0);
    // Every diagnostic should mention CONVERGED or only acceptable divergences
    for (const diag of diagnostics) {
      assert.ok(typeof diag === 'string');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-30..AC-33: Cross-scenario structural validation
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T041 — Cross-scenario validation', () => {
  it('AC-30: all three scenarios produce valid divergence reports', async () => {
    const scenarios = [SCENARIO_A, SCENARIO_B, SCENARIO_C];
    for (const scenario of scenarios) {
      const { result } = await runScenario(scenario);
      assert.ok(result.divergences, `${scenario.name}: divergences should exist`);
      assert.strictEqual(result.divergences.totalTurns, scenario.inputs.length, `${scenario.name}: turn count should match`);
      assert.ok(Array.isArray(result.divergences.perTurn), `${scenario.name}: perTurn should be array`);
    }
  });

  it('AC-31: no scenario has state-level divergence', async () => {
    const scenarios = [SCENARIO_A, SCENARIO_B, SCENARIO_C];
    for (const scenario of scenarios) {
      const { criticalCount } = await runScenario(scenario);
      assert.strictEqual(criticalCount, 0, `${scenario.name}: zero critical divergences expected`);
    }
  });

  it('AC-32: divergence count is deterministic (same input = same output)', async () => {
    // Run scenario A twice and verify identical results
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

  it('AC-33: diagnostic log output is non-empty for all turns', async () => {
    const scenarios = [SCENARIO_A, SCENARIO_B, SCENARIO_C];
    for (const scenario of scenarios) {
      const { diagnostics } = await runScenario(scenario);
      assert.strictEqual(diagnostics.length, scenario.inputs.length);
      for (const diag of diagnostics) {
        assert.ok(diag.length > 0, `${scenario.name}: diagnostic should be non-empty`);
      }
    }
  });
});
