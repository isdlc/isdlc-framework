/**
 * Parallel-Run Comparison Harness (REQ-GH-253, T039)
 *
 * Runs the same roundtable conversation through both the new state-machine-driven
 * path and the old prose-driven path, then diffs the outputs at a structural level.
 *
 * API:
 *   compareRun(workflowType, conversationInputs, options)
 *     -> { newPathOutput, oldPathOutput, divergences }
 *
 * Divergences are structural differences (states, templates, tools) — NOT
 * token-level text diffs. The harness itself does NOT execute real LLM calls;
 * it simulates turn progression based on state machine definitions and marker
 * fixtures.
 *
 * Traces: FR-008, AC-008-01, AC-008-02
 * @module tests/parallel-run/harness
 */

// ---------------------------------------------------------------------------
// Structural comparison helpers
// ---------------------------------------------------------------------------

/**
 * Compare two turn outputs and return a list of structural divergences.
 * Compares state, rendering_mode, template_used, personas_active, and
 * preferred_tools at each turn.
 *
 * @param {object|null} proseOutput - Output from the prose-driven path
 * @param {object|null} mechOutput  - Output from the state-machine-driven path
 * @returns {{ converged: boolean, divergences: Array<{field: string, prose: *, mechanism: *}>, fallback?: boolean, fallback_to?: string }}
 */
export function compareOutputs(proseOutput, mechOutput) {
  // Handle null mechanism output — fallback to prose (AC-008-02)
  if (mechOutput === null || mechOutput === undefined) {
    return {
      converged: false,
      divergences: [{ field: '_mechanism_output', prose: 'present', mechanism: 'null' }],
      fallback: true,
      fallback_to: 'prose',
    };
  }

  // Handle null prose output
  if (proseOutput === null || proseOutput === undefined) {
    return {
      converged: false,
      divergences: [{ field: '_prose_output', prose: 'null', mechanism: 'present' }],
      fallback: true,
      fallback_to: 'mechanism',
    };
  }

  const fields = [
    'state',
    'rendering_mode',
    'template_used',
    'personas_active',
    'preferred_tools',
    'sub_task',
  ];

  const divergences = [];

  for (const field of fields) {
    const proseVal = proseOutput[field];
    const mechVal = mechOutput[field];

    // Both undefined — skip
    if (proseVal === undefined && mechVal === undefined) continue;

    // Deep equality check for arrays and objects
    const proseStr = JSON.stringify(proseVal);
    const mechStr = JSON.stringify(mechVal);

    if (proseStr !== mechStr) {
      divergences.push({ field, prose: proseVal, mechanism: mechVal });
    }
  }

  return {
    converged: divergences.length === 0,
    divergences,
  };
}

/**
 * Detect divergences across a sequence of turn pairs.
 *
 * @param {Array<{prose: object, mechanism: object}>} turnPairs - Array of turn output pairs
 * @returns {{ totalTurns: number, convergedTurns: number, divergedTurns: number, perTurn: Array }}
 */
export function detectDivergence(turnPairs) {
  if (!Array.isArray(turnPairs) || turnPairs.length === 0) {
    return { totalTurns: 0, convergedTurns: 0, divergedTurns: 0, perTurn: [] };
  }

  const perTurn = turnPairs.map((pair, index) => {
    const result = compareOutputs(pair.prose, pair.mechanism);
    return { turn: index, ...result };
  });

  const convergedTurns = perTurn.filter(t => t.converged).length;

  return {
    totalTurns: turnPairs.length,
    convergedTurns,
    divergedTurns: turnPairs.length - convergedTurns,
    perTurn,
  };
}

/**
 * Produce a structured diagnostic log string from a comparison result.
 *
 * @param {{ converged: boolean, divergences: Array }} comparison - Single-turn comparison
 * @param {number} [turnIndex=0] - Turn index for labeling
 * @returns {string} Diagnostic log text
 */
export function logDiagnostics(comparison, turnIndex = 0) {
  if (!comparison) return `Turn ${turnIndex}: no comparison data`;

  if (comparison.converged) {
    return `Turn ${turnIndex}: CONVERGED (no divergences)`;
  }

  const lines = [`Turn ${turnIndex}: DIVERGED (${comparison.divergences.length} field(s))`];

  for (const d of comparison.divergences) {
    lines.push(`  - ${d.field}: prose=${JSON.stringify(d.prose)} mechanism=${JSON.stringify(d.mechanism)}`);
  }

  if (comparison.fallback) {
    lines.push(`  [FALLBACK] falling back to: ${comparison.fallback_to}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prose path simulation
// ---------------------------------------------------------------------------

/**
 * Simulate the old prose-driven path by extracting expected behavior from
 * marker fixtures. Returns a per-turn output array.
 *
 * The prose path simulation uses static fixtures that describe what the prose
 * protocol would produce at each conversation state.
 *
 * @param {string} workflowType - 'analyze' or 'bug-gather'
 * @param {Array<object>} conversationInputs - Simulated conversation turns
 * @param {object} [options] - Options
 * @param {object} [options.proseMarkers] - Map of state -> expected output markers
 * @returns {Array<object>} Per-turn outputs from the prose path
 */
function simulateProsePath(workflowType, conversationInputs, options = {}) {
  const markers = options.proseMarkers || {};
  const turns = [];

  // The prose path is a static fixture-based simulation.
  // Each input turn maps to expected prose output based on conversation progression.
  const stateProgression = options.stateProgression || [
    'CONVERSATION',
    'CONVERSATION',
    'PRESENTING_REQUIREMENTS',
    'PRESENTING_ARCHITECTURE',
    'PRESENTING_DESIGN',
    'FINALIZING',
  ];

  for (let i = 0; i < conversationInputs.length; i++) {
    const state = stateProgression[Math.min(i, stateProgression.length - 1)];
    const markerOutput = markers[state] || {};

    turns.push({
      state,
      rendering_mode: markerOutput.rendering_mode || 'bulleted_by_domain',
      template_used: markerOutput.template_used || null,
      personas_active: markerOutput.personas_active || ['Maya', 'Alex', 'Jordan'],
      preferred_tools: markerOutput.preferred_tools || [],
      sub_task: markerOutput.sub_task || null,
    });
  }

  return turns;
}

// ---------------------------------------------------------------------------
// State-machine path simulation
// ---------------------------------------------------------------------------

/**
 * Simulate the new state-machine-driven path by replaying turns through
 * the roundtable bridge. Does NOT execute real LLM calls.
 *
 * @param {string} workflowType - 'analyze' or 'bug-gather'
 * @param {Array<object>} conversationInputs - Simulated conversation turns
 * @param {object} [options] - Options
 * @param {object} [options.bridge] - Injected roundtable bridge (for testing)
 * @param {object} [options.rollingStateUpdates] - Per-turn rolling state patches
 * @returns {Promise<Array<object>>} Per-turn outputs from the state machine path
 */
async function simulateStateMachinePath(workflowType, conversationInputs, options = {}) {
  const bridge = options.bridge;
  if (!bridge) {
    // No bridge available — return null outputs to trigger fallback
    return conversationInputs.map(() => null);
  }

  // Initialize the roundtable
  const session = await bridge.initializeRoundtable(workflowType, 'CONVERSATION', options);
  if (!session) {
    return conversationInputs.map(() => null);
  }

  const { machine, rollingState: initialRollingState } = session;
  let rollingState = initialRollingState;
  const turns = [];

  for (let i = 0; i < conversationInputs.length; i++) {
    // Compose card for this turn
    const composed = await bridge.composeForTurn(machine, rollingState, {}, {});

    turns.push({
      state: composed.currentState,
      rendering_mode: composed.stateCard ? 'bulleted_by_domain' : null,
      template_used: composed.stateCard ? 'state-card' : null,
      personas_active: composed.stateCard ? ['Maya', 'Alex', 'Jordan'] : [],
      preferred_tools: [],
      sub_task: composed.activeSubTask || null,
    });

    // Apply rolling state updates if provided (simulates LLM turn output)
    const updates = options.rollingStateUpdates;
    if (updates && updates[i]) {
      const afterTurn = await bridge.processAfterTurn(machine, rollingState, updates[i]);
      rollingState = afterTurn.updatedState;
    }
  }

  return turns;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Run the same conversation through both paths and compare outputs.
 *
 * @param {string} workflowType - 'analyze' or 'bug-gather'
 * @param {Array<object>} conversationInputs - Array of simulated conversation turns
 * @param {object} [options] - Options
 * @param {object} [options.bridge] - Injected roundtable bridge module
 * @param {object} [options.proseMarkers] - Prose path marker fixtures
 * @param {Array<string>} [options.stateProgression] - Expected prose state progression
 * @param {object} [options.rollingStateUpdates] - Per-turn rolling state patches for mechanism path
 * @returns {Promise<{ newPathOutput: Array, oldPathOutput: Array, divergences: object }>}
 */
export async function compareRun(workflowType, conversationInputs, options = {}) {
  if (!workflowType || !Array.isArray(conversationInputs)) {
    return {
      newPathOutput: [],
      oldPathOutput: [],
      divergences: { totalTurns: 0, convergedTurns: 0, divergedTurns: 0, perTurn: [] },
    };
  }

  // Run both paths
  const oldPathOutput = simulateProsePath(workflowType, conversationInputs, options);
  const newPathOutput = await simulateStateMachinePath(workflowType, conversationInputs, options);

  // Build turn pairs for comparison
  const turnPairs = conversationInputs.map((_, i) => ({
    prose: oldPathOutput[i] || null,
    mechanism: newPathOutput[i] || null,
  }));

  const divergences = detectDivergence(turnPairs);

  return { newPathOutput, oldPathOutput, divergences };
}
