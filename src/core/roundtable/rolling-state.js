/**
 * rolling-state.js — In-memory per-session rolling state for roundtable sessions.
 *
 * Maintains structured state updated by trailer + marker extractors with
 * trailer-wins conflict resolution (AC-003-03). Not persisted; meta.json
 * remains the persistent progress handle.
 *
 * @module rolling-state
 * @see rolling-state.schema.json
 * Traces: FR-003, AC-003-01, AC-003-02, AC-003-03, AC-003-04
 */

/**
 * Extract sub-task IDs from a state machine definition.
 * Handles both array-of-objects and object-keyed state definitions.
 *
 * @param {object} stateMachineDef - State machine definition with states
 * @returns {string[]} List of sub-task IDs found
 */
function extractSubTaskIds(stateMachineDef) {
  const ids = [];
  if (!stateMachineDef || !stateMachineDef.states) return ids;

  const states = stateMachineDef.states;
  const stateList = Array.isArray(states)
    ? states
    : Object.values(states);

  for (const state of stateList) {
    if (!state || !state.sub_tasks) continue;
    const tasks = state.sub_tasks.tasks || state.sub_tasks;
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        if (task && task.id) ids.push(task.id);
      }
    }
  }
  return ids;
}

/**
 * Create a new rolling state from a state machine definition.
 * Initializes all schema-driven fields to their defaults.
 *
 * @param {object} stateMachineDef - State machine definition (from definition-loader)
 * @returns {object} Initialized rolling state object
 * Traces: FR-003, AC-003-01
 */
export function create(stateMachineDef) {
  const subTaskIds = extractSubTaskIds(stateMachineDef);
  const subTaskCompletion = {};
  for (const id of subTaskIds) {
    subTaskCompletion[id] = false;
  }

  return {
    coverage_by_topic: {},
    scan_complete: false,
    scope_accepted: false,
    current_persona_rotation: ['maya', 'alex', 'jordan'],
    rendering_mode: 'bulleted',
    amendment_cycles: 0,
    participation_markers: {
      maya: false,
      alex: false,
      jordan: false
    },
    sub_task_completion: subTaskCompletion
  };
}

/**
 * Update rolling state with new data from trailer and/or marker extraction.
 * Trailer fields win on conflict with marker fields (AC-003-03).
 * If both trailer and markers are empty/null, state is unchanged (AC-003-04).
 *
 * @param {object} state - Current rolling state object
 * @param {object} updates - Object with optional `trailer` and `markers` fields
 * @param {object|null} [updates.trailer] - Parsed trailer fields (wins on conflict)
 * @param {object} [updates.markers] - Extracted marker fields
 * @returns {object} Updated rolling state (new object, original unchanged)
 * Traces: FR-003, AC-003-02, AC-003-03, AC-003-04
 */
export function update(state, updates) {
  if (!updates) return { ...state };

  const { trailer, markers } = updates;
  const hasTrailer = trailer != null && typeof trailer === 'object' && Object.keys(trailer).length > 0;
  const hasMarkers = markers != null && typeof markers === 'object' && Object.keys(markers).length > 0;

  // AC-003-04: both mechanisms fail -- state unchanged
  if (!hasTrailer && !hasMarkers) return { ...state };

  // Start with a deep-enough copy
  const next = {
    ...state,
    coverage_by_topic: { ...state.coverage_by_topic },
    participation_markers: { ...state.participation_markers },
    sub_task_completion: { ...state.sub_task_completion }
  };

  // Apply markers first (lower priority)
  if (hasMarkers) {
    applyFields(next, markers);
  }

  // Apply trailer second (wins on conflict, AC-003-03)
  if (hasTrailer) {
    applyTrailerFields(next, trailer);
  }

  return next;
}

/**
 * Apply generic marker fields to rolling state.
 * @param {object} state - Rolling state to mutate in place
 * @param {object} fields - Marker extraction fields
 */
function applyFields(state, fields) {
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'coverage_by_topic' && typeof value === 'object' && value !== null) {
      Object.assign(state.coverage_by_topic, value);
    } else if (key === 'participation_markers' && typeof value === 'object' && value !== null) {
      Object.assign(state.participation_markers, value);
    } else if (key === 'sub_task_completion' && typeof value === 'object' && value !== null) {
      Object.assign(state.sub_task_completion, value);
    } else if (key in state) {
      state[key] = value;
    }
  }
}

/**
 * Apply trailer fields to rolling state. Trailer uses a flattened key model
 * where sub_task + status map to sub_task_completion entries.
 * @param {object} state - Rolling state to mutate in place
 * @param {object} trailer - Parsed trailer object { state, sub_task, status, version }
 */
function applyTrailerFields(state, trailer) {
  // Direct field overrides from trailer
  for (const [key, value] of Object.entries(trailer)) {
    // sub_task + status are handled specially below
    if (key === 'sub_task' || key === 'status' || key === 'version' || key === 'state') continue;

    if (key === 'coverage_by_topic' && typeof value === 'object' && value !== null) {
      Object.assign(state.coverage_by_topic, value);
    } else if (key === 'participation_markers' && typeof value === 'object' && value !== null) {
      Object.assign(state.participation_markers, value);
    } else if (key === 'sub_task_completion' && typeof value === 'object' && value !== null) {
      Object.assign(state.sub_task_completion, value);
    } else if (key in state) {
      state[key] = value;
    }
  }

  // Map trailer sub_task + status to sub_task_completion
  if (trailer.sub_task && trailer.status) {
    const subTaskId = trailer.sub_task;
    if (trailer.status === 'complete') {
      state.sub_task_completion[subTaskId] = true;
      // Also set well-known boolean flags
      if (subTaskId === 'CODEBASE_SCAN' || subTaskId === 'codebase_scan') {
        state.scan_complete = true;
      }
    } else {
      // running or waiting -- ensure entry exists but don't mark complete
      if (!(subTaskId in state.sub_task_completion)) {
        state.sub_task_completion[subTaskId] = false;
      }
    }
  }

  // Direct boolean overrides from trailer (trailer wins)
  if ('scan_complete' in trailer) state.scan_complete = trailer.scan_complete;
  if ('scope_accepted' in trailer) state.scope_accepted = trailer.scope_accepted;
  if ('rendering_mode' in trailer) state.rendering_mode = trailer.rendering_mode;
  if ('amendment_cycles' in trailer) state.amendment_cycles = trailer.amendment_cycles;
}

/**
 * Return a deep copy of the rolling state for diagnostic logging.
 * Safe to serialize or compare without affecting the live state.
 *
 * @param {object} state - Current rolling state
 * @returns {object} Deep copy of the state
 * Traces: FR-003
 */
export function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}
