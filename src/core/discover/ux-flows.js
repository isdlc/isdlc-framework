/**
 * Discover UX Flow Definitions — menus and walkthrough steps
 *
 * Frozen menu definitions (first-time and returning) and walkthrough
 * step sequences per discover mode. Pure data — no runtime logic.
 *
 * Requirements: REQ-0104 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02), FR-003 (AC-003-01)
 * @module src/core/discover/ux-flows
 */

// ---------------------------------------------------------------------------
// Menu Definitions
// ---------------------------------------------------------------------------

/** First-time user menu with 3 options */
export const FIRST_TIME_MENU = Object.freeze({
  id: 'first_time',
  options: Object.freeze([
    Object.freeze({
      id: 'new_project',
      label: 'New Project',
      description: 'Set up a brand new project with guided discovery',
      maps_to_mode: 'discover_new'
    }),
    Object.freeze({
      id: 'existing_analysis',
      label: 'Existing Codebase',
      description: 'Analyze an existing codebase and generate project context',
      maps_to_mode: 'discover_existing'
    }),
    Object.freeze({
      id: 'chat_explore',
      label: 'Chat / Explore',
      description: 'Skip discovery and start a freeform conversation',
      maps_to_mode: null
    })
  ])
});

/** Returning user menu with 4 options */
export const RETURNING_MENU = Object.freeze({
  id: 'returning',
  options: Object.freeze([
    Object.freeze({
      id: 'rerun',
      label: 'Re-run Discovery',
      description: 'Re-run full discovery from scratch',
      maps_to_mode: 'discover_existing'
    }),
    Object.freeze({
      id: 'incremental',
      label: 'Incremental Update',
      description: 'Quick re-analysis of recent changes only',
      maps_to_mode: 'discover_incremental'
    }),
    Object.freeze({
      id: 'deep',
      label: 'Deep Analysis',
      description: 'Comprehensive analysis including security and performance audits',
      maps_to_mode: 'discover_deep'
    }),
    Object.freeze({
      id: 'chat_explore',
      label: 'Chat / Explore',
      description: 'Skip discovery and start a freeform conversation',
      maps_to_mode: null
    })
  ])
});

// ---------------------------------------------------------------------------
// Walkthrough Definitions
// ---------------------------------------------------------------------------

/** Walkthrough for discover_existing mode */
export const EXISTING_WALKTHROUGH = Object.freeze({
  mode: 'discover_existing',
  steps: Object.freeze([
    Object.freeze({ id: 'step_core_analyzers', label: 'Analyze codebase', agent_group: 'core_analyzers', optional: false, review_gate: false }),
    Object.freeze({ id: 'step_post_analysis', label: 'Post-analysis processing', agent_group: 'post_analysis', optional: false, review_gate: true }),
    Object.freeze({ id: 'step_constitution_skills', label: 'Generate constitution and skills', agent_group: 'constitution_skills', optional: false, review_gate: false })
  ])
});

/** Walkthrough for discover_new mode */
export const NEW_WALKTHROUGH = Object.freeze({
  mode: 'discover_new',
  steps: Object.freeze([
    Object.freeze({ id: 'step_new_project_core', label: 'Product and architecture analysis', agent_group: 'new_project_core', optional: false, review_gate: true }),
    Object.freeze({ id: 'step_new_project_party', label: 'Domain expert party', agent_group: 'new_project_party', optional: true, review_gate: false }),
    Object.freeze({ id: 'step_constitution_skills', label: 'Generate constitution and skills', agent_group: 'constitution_skills', optional: false, review_gate: false })
  ])
});

/** Walkthrough for discover_deep mode */
export const DEEP_WALKTHROUGH = Object.freeze({
  mode: 'discover_deep',
  steps: Object.freeze([
    Object.freeze({ id: 'step_core_analyzers', label: 'Analyze codebase', agent_group: 'core_analyzers', optional: false, review_gate: false }),
    Object.freeze({ id: 'step_post_analysis', label: 'Post-analysis processing', agent_group: 'post_analysis', optional: false, review_gate: true }),
    Object.freeze({ id: 'step_deep_standard', label: 'Security and debt audit', agent_group: 'deep_standard', optional: false, review_gate: false }),
    Object.freeze({ id: 'step_deep_full', label: 'Performance and ops review', agent_group: 'deep_full', optional: true, review_gate: false }),
    Object.freeze({ id: 'step_constitution_skills', label: 'Generate constitution and skills', agent_group: 'constitution_skills', optional: false, review_gate: false })
  ])
});

// ---------------------------------------------------------------------------
// Registry Helpers
// ---------------------------------------------------------------------------

/** @type {Map<string, Object>} */
const menuRegistry = new Map([
  ['first_time', FIRST_TIME_MENU],
  ['returning', RETURNING_MENU]
]);

/** @type {Map<string, Object>} */
const walkthroughRegistry = new Map([
  ['discover_existing', EXISTING_WALKTHROUGH],
  ['discover_new', NEW_WALKTHROUGH],
  ['discover_deep', DEEP_WALKTHROUGH]
]);

/**
 * Get a menu by ID.
 * @param {string} menuId
 * @returns {Object} Frozen menu object
 * @throws {Error} If menuId is not registered
 */
export function getMenu(menuId) {
  const menu = menuRegistry.get(menuId);
  if (!menu) {
    const available = [...menuRegistry.keys()].join(', ');
    throw new Error(`Unknown menu: "${menuId}". Available: ${available}`);
  }
  return menu;
}

/**
 * Get a walkthrough by discover mode ID.
 * @param {string} modeId
 * @returns {Object} Frozen walkthrough object
 * @throws {Error} If modeId has no walkthrough
 */
export function getWalkthrough(modeId) {
  const wt = walkthroughRegistry.get(modeId);
  if (!wt) {
    const available = [...walkthroughRegistry.keys()].join(', ');
    throw new Error(`No walkthrough for mode: "${modeId}". Available: ${available}`);
  }
  return wt;
}

/**
 * List all registered menu IDs.
 * @returns {string[]}
 */
export function listMenus() {
  return [...menuRegistry.keys()];
}
