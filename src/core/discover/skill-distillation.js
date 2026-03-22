/**
 * Skill Distillation Config — reconciliation rules and source priority
 *
 * Defines how project-specific skills are reconciled by source during
 * discover. Pure data — no runtime logic.
 *
 * Requirements: REQ-0106 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02)
 * @module src/core/discover/skill-distillation
 */

// ---------------------------------------------------------------------------
// Source Priority
// ---------------------------------------------------------------------------

/** Priority order: user > project > framework (AC-001-01) */
export const SOURCE_PRIORITY = Object.freeze(['user', 'project', 'framework']);

// ---------------------------------------------------------------------------
// Distillation Config
// ---------------------------------------------------------------------------

const DISTILLATION_CONFIG = Object.freeze({
  sources: Object.freeze(['user', 'project', 'framework']),
  priority_order: Object.freeze(['user', 'project', 'framework']),
  stale_action: 'warn',
  user_owned_fields: Object.freeze(['description', 'examples', 'tags', 'custom_config'])
});

// ---------------------------------------------------------------------------
// Reconciliation Rules
// ---------------------------------------------------------------------------

const RECONCILIATION_RULES = Object.freeze([
  Object.freeze({
    id: 'source_priority',
    description: 'When skills conflict, higher-priority source wins (user > project > framework)'
  }),
  Object.freeze({
    id: 'stale_detection',
    description: 'Skills from previous discovery not present in new results are flagged as stale'
  }),
  Object.freeze({
    id: 'user_owned_preservation',
    description: 'Skills with source=user are never auto-removed regardless of stale status'
  }),
  Object.freeze({
    id: 'merge_behavior',
    description: 'Non-conflicting fields from lower-priority sources are merged into the result'
  })
]);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Get the distillation configuration.
 * @returns {Readonly<Object>} Frozen config object
 */
export function getDistillationConfig() {
  return DISTILLATION_CONFIG;
}

/**
 * Get the reconciliation rules.
 * @returns {Readonly<Array>} Frozen array of rule objects
 */
export function getReconciliationRules() {
  return RECONCILIATION_RULES;
}
