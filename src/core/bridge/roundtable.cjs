/**
 * CJS Bridge for Roundtable State Machine Modules
 *
 * Exposes the ESM roundtable modules (definition-loader, state-machine,
 * composers, rolling-state, trailer-parser, markers) via a single async
 * CJS interface. The primary entry point is composeForTurn(), which does
 * all per-turn composition work in one call from the handler.
 *
 * Fail-safe: All error paths return safe defaults (Article X).
 * - ESM import failure -> null/fallback returns
 * - Any composition step failure -> skip that step, continue
 *
 * Traces: FR-001, FR-002, FR-003, FR-005, AC-002-01, AC-002-03
 * @module src/core/bridge/roundtable
 * @version 1.0.0
 */

'use strict';

// ---------------------------------------------------------------------------
// Lazy ESM module cache
// ---------------------------------------------------------------------------

let _definitionLoader = null;
let _stateMachine = null;
let _stateCardComposer = null;
let _taskCardComposer = null;
let _rollingState = null;
let _trailerParser = null;
let _markersIndex = null;

async function getDefinitionLoader() {
  if (_definitionLoader) return _definitionLoader;
  try {
    _definitionLoader = await import('../roundtable/definition-loader.js');
    return _definitionLoader;
  } catch { return null; }
}

async function getStateMachine() {
  if (_stateMachine) return _stateMachine;
  try {
    _stateMachine = await import('../roundtable/state-machine.js');
    return _stateMachine;
  } catch { return null; }
}

async function getStateCardComposer() {
  if (_stateCardComposer) return _stateCardComposer;
  try {
    _stateCardComposer = await import('../roundtable/state-card-composer.js');
    return _stateCardComposer;
  } catch { return null; }
}

async function getTaskCardComposer() {
  if (_taskCardComposer) return _taskCardComposer;
  try {
    _taskCardComposer = await import('../roundtable/task-card-composer.js');
    return _taskCardComposer;
  } catch { return null; }
}

async function getRollingState() {
  if (_rollingState) return _rollingState;
  try {
    _rollingState = await import('../roundtable/rolling-state.js');
    return _rollingState;
  } catch { return null; }
}

async function getTrailerParser() {
  if (_trailerParser) return _trailerParser;
  try {
    _trailerParser = await import('../roundtable/trailer-parser.js');
    return _trailerParser;
  } catch { return null; }
}

async function getMarkersIndex() {
  if (_markersIndex) return _markersIndex;
  try {
    _markersIndex = await import('../roundtable/markers/index.js');
    return _markersIndex;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Public API: Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize the roundtable state machine for a workflow session.
 *
 * Loads the composed definition (core + workflow), initializes the state
 * machine at the entry state, and creates the initial rolling state.
 * Returns all three objects needed for the per-turn loop.
 *
 * T040: Checks migration_mode from config — returns null if "prose"
 * (mechanism disabled, original behavior). "parallel" and "mechanism"
 * both proceed with initialization.
 *
 * Fail-open: returns null on any failure (Article X, AC-002-03).
 * The handler should fall through to the existing prose-driven protocol.
 *
 * @param {string} workflowType - 'analyze' or 'bug-gather'
 * @param {string} [entryState='CONVERSATION'] - State to start in
 * @param {object} [options] - Options for definition-loader
 * @param {string} [options.overrideDir] - User override directory
 * @param {string} [options.projectRoot] - Project root for config resolution
 * @returns {Promise<{definition: object, machine: object, rollingState: object}|null>}
 *
 * Traces: FR-002, AC-002-01, AC-002-03, T040
 */
async function initializeRoundtable(workflowType, entryState, options) {
  try {
    // T040: Check migration_mode — skip mechanism if "prose"
    try {
      const configBridge = require('./config.cjs');
      const projectRoot = (options && options.projectRoot) || null;
      const rtConfig = configBridge.getRoundtableConfig(projectRoot);
      if (rtConfig && rtConfig.migration_mode === 'prose') {
        // Mechanism disabled — return null so handler falls back to prose protocol
        return null;
      }
    } catch {
      // Config read failure — fail-open, proceed with mechanism (Article X)
    }

    const entry = entryState || 'CONVERSATION';

    const loader = await getDefinitionLoader();
    if (!loader || typeof loader.loadDefinition !== 'function') return null;

    const definition = loader.loadDefinition(workflowType, options || {});
    if (!definition) return null;

    const smMod = await getStateMachine();
    if (!smMod || typeof smMod.initialize !== 'function') return null;

    const machine = smMod.initialize(definition, entry);
    if (!machine) return null;

    const rsMod = await getRollingState();
    if (!rsMod || typeof rsMod.create !== 'function') return null;

    const rollingState = rsMod.create(definition);

    return { definition, machine, rollingState };
  } catch {
    // Fail-open (Article X): return null so handler falls back to prose protocol
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API: Per-Turn Composition
// ---------------------------------------------------------------------------

/**
 * Compose the affordance context for a single roundtable turn.
 *
 * This is the main per-turn entry point. It:
 * 1. Gets current state + active sub-task from the state machine
 * 2. Composes a state card for the current state
 * 3. If a sub-task is active, composes a task card
 * 4. Combines state card + task card into a single string
 *
 * Fail-open: returns { composedCard: null, stateCard: null, taskCard: null }
 * on any failure. The handler should skip injection for this turn.
 *
 * @param {object} machine - State machine instance from initializeRoundtable()
 * @param {object} rollingState - Current rolling state
 * @param {object} [context={}] - Runtime context for state card composition
 * @param {object} [manifestContext={}] - Context for task card skill resolution
 * @returns {Promise<{composedCard: string|null, stateCard: string|null, taskCard: string|null, currentState: string|null, activeSubTask: string|null}>}
 *
 * Traces: FR-001, AC-001-01, AC-001-02
 */
async function composeForTurn(machine, rollingState, context, manifestContext) {
  const empty = { composedCard: null, stateCard: null, taskCard: null, currentState: null, activeSubTask: null };

  try {
    if (!machine) return empty;

    const currentState = machine.getCurrentState();
    const activeSubTaskId = machine.getActiveSubTask();
    const activeSubTask = machine.currentSubTask();

    // Compose state card
    let stateCard = null;
    try {
      const sccMod = await getStateCardComposer();
      if (sccMod && typeof sccMod.composeStateCard === 'function') {
        stateCard = sccMod.composeStateCard(currentState, context || {});
      }
    } catch {
      // Skip state card composition for this turn (fail-open)
    }

    // Compose task card (only if a sub-task is active)
    let taskCard = null;
    if (activeSubTask) {
      try {
        const tccMod = await getTaskCardComposer();
        if (tccMod && typeof tccMod.composeTaskCard === 'function') {
          taskCard = tccMod.composeTaskCard(activeSubTask, manifestContext || {});
        }
      } catch {
        // Skip task card composition for this turn (fail-open)
      }
    }

    // Combine cards
    let composedCard = null;
    if (stateCard && taskCard) {
      composedCard = stateCard + '\n\n' + taskCard;
    } else if (stateCard) {
      composedCard = stateCard;
    } else if (taskCard) {
      composedCard = taskCard;
    }

    return {
      composedCard,
      stateCard,
      taskCard,
      currentState,
      activeSubTask: activeSubTaskId,
    };
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Public API: Post-Turn Processing
// ---------------------------------------------------------------------------

/**
 * Process LLM output after a roundtable turn.
 *
 * This handles:
 * 1. Parse trailer from LLM output (strip from user-visible output)
 * 2. Run marker extraction for active sub-task
 * 3. Update rolling state with trailer + marker results
 * 4. Evaluate state machine transitions
 *
 * Returns the updated rolling state, transition result, and cleaned output.
 *
 * Fail-open: on any step failure, skips that step and continues.
 * If both trailer parse and marker extraction fail, rolling state is
 * unchanged and no transition fires (AC-003-04).
 *
 * @param {object} machine - State machine instance
 * @param {object} rollingState - Current rolling state (will NOT be mutated)
 * @param {string} llmOutput - Raw LLM output text
 * @returns {Promise<{updatedState: object, transition: object|null, cleanOutput: string, trailer: object|null, markers: object}>}
 *
 * Traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04
 */
async function processAfterTurn(machine, rollingState, llmOutput) {
  const fallback = {
    updatedState: rollingState,
    transition: null,
    cleanOutput: llmOutput || '',
    trailer: null,
    markers: {},
  };

  try {
    if (!machine || !rollingState) return fallback;
    if (typeof llmOutput !== 'string') return fallback;

    // 1. Parse trailer
    let trailer = null;
    let cleanOutput = llmOutput;
    try {
      const tpMod = await getTrailerParser();
      if (tpMod) {
        if (typeof tpMod.parseTrailer === 'function') {
          trailer = tpMod.parseTrailer(llmOutput);
        }
        if (typeof tpMod.stripTrailer === 'function') {
          cleanOutput = tpMod.stripTrailer(llmOutput);
        }
      }
    } catch {
      // Trailer parse failed -- continue without trailer (AC-003-04)
    }

    // 2. Run marker extraction for active sub-task
    let markers = {};
    try {
      const activeSubTaskId = machine.getActiveSubTask();
      if (activeSubTaskId) {
        const mkMod = await getMarkersIndex();
        if (mkMod && typeof mkMod.dispatch === 'function') {
          markers = mkMod.dispatch(activeSubTaskId, llmOutput);
        }
      }
    } catch {
      // Marker extraction failed -- continue without markers (fail-open)
    }

    // 3. Update rolling state (trailer wins on conflict, AC-003-03)
    let updatedState = rollingState;
    try {
      const rsMod = await getRollingState();
      if (rsMod && typeof rsMod.update === 'function') {
        updatedState = rsMod.update(rollingState, { trailer, markers });
      }
    } catch {
      // State update failed -- keep original rolling state
    }

    // 4. Evaluate state machine transitions
    let transition = null;
    try {
      const result = machine.evaluateTransitions(updatedState);
      if (result && result.transitioned) {
        transition = result;
      } else if (result && result.subTaskChanged) {
        transition = result;
      }
    } catch {
      // Transition evaluation failed -- no transition fires
    }

    return {
      updatedState,
      transition,
      cleanOutput,
      trailer,
      markers,
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Public API: Utility
// ---------------------------------------------------------------------------

/**
 * Take a snapshot of the rolling state for diagnostic logging.
 *
 * @param {object} rollingState - Current rolling state
 * @returns {Promise<object>} Deep copy of the state
 */
async function snapshotState(rollingState) {
  try {
    const rsMod = await getRollingState();
    if (rsMod && typeof rsMod.snapshot === 'function') {
      return rsMod.snapshot(rollingState);
    }
    return JSON.parse(JSON.stringify(rollingState || {}));
  } catch {
    return {};
  }
}

/**
 * Reset the module cache (for testing only).
 * @private
 */
function _resetCache() {
  _definitionLoader = null;
  _stateMachine = null;
  _stateCardComposer = null;
  _taskCardComposer = null;
  _rollingState = null;
  _trailerParser = null;
  _markersIndex = null;
}

module.exports = {
  initializeRoundtable,
  composeForTurn,
  processAfterTurn,
  snapshotState,
  _resetCache,
};
