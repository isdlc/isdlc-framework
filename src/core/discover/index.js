/**
 * Discover Module — re-exports + top-level registry
 *
 * Aggregates all discover sub-modules and provides registry lookup
 * functions: getDiscoverMode(), getAgentGroup(), listDiscoverModes(),
 * listAgentGroups().
 *
 * Requirements: REQ-0103 FR-004 (AC-004-01..03)
 * @module src/core/discover/index
 */

// Re-export all sub-modules
export { DISCOVER_EXISTING, DISCOVER_NEW, DISCOVER_INCREMENTAL, DISCOVER_DEEP } from './modes.js';
export {
  CORE_ANALYZERS, POST_ANALYSIS, CONSTITUTION_SKILLS,
  NEW_PROJECT_CORE, NEW_PROJECT_PARTY, DEEP_STANDARD, DEEP_FULL
} from './agent-groups.js';
export {
  FIRST_TIME_MENU, RETURNING_MENU,
  EXISTING_WALKTHROUGH, NEW_WALKTHROUGH, DEEP_WALKTHROUGH,
  getMenu, getWalkthrough, listMenus
} from './ux-flows.js';
export {
  DISCOVER_STATE_SCHEMA, RESUME_LIMITATIONS,
  createInitialDiscoverState, computeResumePoint, isDiscoverComplete, markStepComplete
} from './discover-state-schema.js';
export { SOURCE_PRIORITY, getDistillationConfig, getReconciliationRules } from './skill-distillation.js';
export { getProjectionChain, getProviderNeutralSteps, getProviderSpecificSteps } from './projection-chain.js';

// ---------------------------------------------------------------------------
// Mode Registry
// ---------------------------------------------------------------------------

import { DISCOVER_EXISTING, DISCOVER_NEW, DISCOVER_INCREMENTAL, DISCOVER_DEEP } from './modes.js';
import {
  CORE_ANALYZERS, POST_ANALYSIS, CONSTITUTION_SKILLS,
  NEW_PROJECT_CORE, NEW_PROJECT_PARTY, DEEP_STANDARD, DEEP_FULL
} from './agent-groups.js';

/** @type {Map<string, Object>} */
const modeRegistry = new Map([
  ['discover_existing', DISCOVER_EXISTING],
  ['discover_new', DISCOVER_NEW],
  ['discover_incremental', DISCOVER_INCREMENTAL],
  ['discover_deep', DISCOVER_DEEP]
]);

/** @type {Map<string, Object>} */
const groupRegistry = new Map([
  ['core_analyzers', CORE_ANALYZERS],
  ['post_analysis', POST_ANALYSIS],
  ['constitution_skills', CONSTITUTION_SKILLS],
  ['new_project_core', NEW_PROJECT_CORE],
  ['new_project_party', NEW_PROJECT_PARTY],
  ['deep_standard', DEEP_STANDARD],
  ['deep_full', DEEP_FULL]
]);

/**
 * Get a discover mode by ID.
 * @param {string} modeId
 * @returns {Object} Frozen mode config
 * @throws {Error} If modeId is not registered
 */
export function getDiscoverMode(modeId) {
  const mode = modeRegistry.get(modeId);
  if (!mode) {
    const available = [...modeRegistry.keys()].join(', ');
    throw new Error(`Unknown discover mode: "${modeId}". Available: ${available}`);
  }
  return mode;
}

/**
 * Get an agent group by ID.
 * @param {string} groupId
 * @returns {Object} Frozen agent group config
 * @throws {Error} If groupId is not registered
 */
export function getAgentGroup(groupId) {
  const group = groupRegistry.get(groupId);
  if (!group) {
    const available = [...groupRegistry.keys()].join(', ');
    throw new Error(`Unknown agent group: "${groupId}". Available: ${available}`);
  }
  return group;
}

/**
 * List all registered discover mode IDs.
 * @returns {string[]}
 */
export function listDiscoverModes() {
  return [...modeRegistry.keys()];
}

/**
 * List all registered agent group IDs.
 * @returns {string[]}
 */
export function listAgentGroups() {
  return [...groupRegistry.keys()];
}
