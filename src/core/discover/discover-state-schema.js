/**
 * Discover State Schema — state structure, creation, resume, completion
 *
 * Defines the discover state fields and provides functions for state
 * management: create, resume computation, completion check, step marking.
 * Pure data schema + stateless helper functions.
 *
 * Requirements: REQ-0105 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02), FR-003 (AC-003-01)
 * @module src/core/discover/discover-state-schema
 */

import { DISCOVER_EXISTING, DISCOVER_NEW, DISCOVER_INCREMENTAL, DISCOVER_DEEP } from './modes.js';
import { EXISTING_WALKTHROUGH, NEW_WALKTHROUGH, DEEP_WALKTHROUGH } from './ux-flows.js';

// ---------------------------------------------------------------------------
// Schema Definition
// ---------------------------------------------------------------------------

/** Frozen schema defining all discover state fields with types and defaults */
export const DISCOVER_STATE_SCHEMA = Object.freeze({
  fields: Object.freeze({
    status: Object.freeze({ type: 'string', default: 'pending', enum: ['pending', 'in_progress', 'completed'] }),
    current_step: Object.freeze({ type: 'string', default: null, nullable: true }),
    completed_steps: Object.freeze({ type: 'array', default: [], items: 'string' }),
    flow_type: Object.freeze({ type: 'string', default: null }),
    depth_level: Object.freeze({ type: 'string', default: null, nullable: true }),
    discovery_context: Object.freeze({ type: 'object', default: null, nullable: true }),
    started_at: Object.freeze({ type: 'string', default: null, nullable: true }),
    completed_at: Object.freeze({ type: 'string', default: null, nullable: true }),
    last_resumed_at: Object.freeze({ type: 'string', default: null, nullable: true })
  })
});

// ---------------------------------------------------------------------------
// Resume Limitations
// ---------------------------------------------------------------------------

/** Known resume limitations — interrupted agent groups restart from beginning */
export const RESUME_LIMITATIONS = Object.freeze([
  Object.freeze({
    step_type: 'agent_group',
    behavior: 'restart_from_beginning',
    reason: 'Agent groups are atomic units; partial completion within a group is not tracked'
  }),
  Object.freeze({
    step_type: 'parallel_group',
    behavior: 'restart_all_members',
    reason: 'Parallel agent groups have no ordering guarantee; all members re-run on resume'
  })
]);

// ---------------------------------------------------------------------------
// Mode-to-walkthrough mapping
// ---------------------------------------------------------------------------

const WALKTHROUGH_MAP = {
  discover_existing: EXISTING_WALKTHROUGH,
  discover_new: NEW_WALKTHROUGH,
  discover_incremental: null, // incremental has a single step: core_analyzers
  discover_deep: DEEP_WALKTHROUGH
};

/**
 * Get required step IDs for a given flow type.
 * @param {string} flowType
 * @returns {string[]}
 */
function getRequiredSteps(flowType) {
  const wt = WALKTHROUGH_MAP[flowType];
  if (wt) {
    return wt.steps.filter(s => !s.optional).map(s => s.id);
  }
  // Incremental mode has a single implicit step
  if (flowType === 'discover_incremental') {
    return ['step_core_analyzers'];
  }
  return [];
}

/**
 * Get all step IDs (including optional) for a given flow type.
 * @param {string} flowType
 * @returns {string[]}
 */
function getAllSteps(flowType) {
  const wt = WALKTHROUGH_MAP[flowType];
  if (wt) {
    return wt.steps.map(s => s.id);
  }
  if (flowType === 'discover_incremental') {
    return ['step_core_analyzers'];
  }
  return [];
}

// ---------------------------------------------------------------------------
// State Functions
// ---------------------------------------------------------------------------

/**
 * Create an initial discover state for a given mode and optional depth.
 *
 * @param {string} mode - One of the discover mode IDs
 * @param {string|null} [depth=null] - Depth level (standard|full) or null
 * @returns {Object} Mutable state object
 */
export function createInitialDiscoverState(mode, depth = null) {
  return {
    status: 'pending',
    current_step: null,
    completed_steps: [],
    flow_type: mode,
    depth_level: depth || null,
    discovery_context: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    last_resumed_at: null
  };
}

/**
 * Compute the next step to resume from based on current state.
 *
 * @param {Object} state - Discover state object
 * @returns {string|null} Next uncompleted step ID, or null if all done
 */
export function computeResumePoint(state) {
  const allSteps = getAllSteps(state.flow_type);
  const completed = new Set(state.completed_steps);
  for (const stepId of allSteps) {
    if (!completed.has(stepId)) {
      return stepId;
    }
  }
  return null;
}

/**
 * Check whether all required steps for the mode are completed.
 *
 * @param {Object} state - Discover state object
 * @returns {boolean}
 */
export function isDiscoverComplete(state) {
  const required = getRequiredSteps(state.flow_type);
  const completed = new Set(state.completed_steps);
  return required.every(stepId => completed.has(stepId));
}

/**
 * Mark a step as complete and advance current_step.
 *
 * @param {Object} state - Discover state object (mutated in place and returned)
 * @param {string} stepId - Step ID to mark complete
 * @returns {Object} Updated state object
 */
export function markStepComplete(state, stepId) {
  if (!state.completed_steps.includes(stepId)) {
    state.completed_steps.push(stepId);
  }
  // Advance current_step to next uncompleted step
  state.current_step = computeResumePoint(state);
  return state;
}
