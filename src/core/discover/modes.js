/**
 * Discover Mode Definitions — 4 frozen mode configs
 *
 * Each mode specifies: id, agent_groups (ordered), depth_levels, applicable_when.
 * Pure data — no runtime logic.
 *
 * Requirements: REQ-0103 FR-001 (AC-001-01..02)
 * @module src/core/discover/modes
 */

/** @type {Readonly<{id: string, agent_groups: string[], depth_levels: string[], applicable_when: string}>} */
export const DISCOVER_EXISTING = Object.freeze({
  id: 'discover_existing',
  agent_groups: Object.freeze(['core_analyzers', 'post_analysis', 'constitution_skills']),
  depth_levels: Object.freeze(['standard', 'full']),
  applicable_when: 'Project has existing codebase with prior discovery state'
});

/** @type {Readonly<{id: string, agent_groups: string[], depth_levels: string[], applicable_when: string}>} */
export const DISCOVER_NEW = Object.freeze({
  id: 'discover_new',
  agent_groups: Object.freeze(['new_project_core', 'constitution_skills']),
  depth_levels: Object.freeze([]),
  applicable_when: 'New project with no prior discovery or codebase'
});

/** @type {Readonly<{id: string, agent_groups: string[], depth_levels: string[], applicable_when: string}>} */
export const DISCOVER_INCREMENTAL = Object.freeze({
  id: 'discover_incremental',
  agent_groups: Object.freeze(['core_analyzers']),
  depth_levels: Object.freeze([]),
  applicable_when: 'Returning project needing lightweight re-analysis of changes'
});

/** @type {Readonly<{id: string, agent_groups: string[], depth_levels: string[], applicable_when: string}>} */
export const DISCOVER_DEEP = Object.freeze({
  id: 'discover_deep',
  agent_groups: Object.freeze([
    'core_analyzers', 'post_analysis', 'deep_standard', 'deep_full', 'constitution_skills'
  ]),
  depth_levels: Object.freeze(['standard', 'full']),
  applicable_when: 'Returning project requesting comprehensive deep analysis'
});
