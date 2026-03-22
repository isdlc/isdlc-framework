/**
 * Projection Chain — 4-step trigger chain for post-discover refresh
 *
 * Defines the ordered chain: discover_complete -> skill_generation ->
 * context_delivery -> cache_rebuild. Steps 1-2 are provider-neutral,
 * steps 3-4 are provider-specific.
 *
 * Requirements: REQ-0107 FR-001 (AC-001-01..02), FR-002 (AC-002-01..02)
 * @module src/core/discover/projection-chain
 */

const PROJECTION_CHAIN = Object.freeze([
  Object.freeze({
    id: 'discover_complete',
    trigger_condition: 'All discover agent groups have completed successfully',
    action_type: 'emit_event',
    depends_on: Object.freeze([]),
    provider_specific: false
  }),
  Object.freeze({
    id: 'skill_generation',
    trigger_condition: 'discover_complete event received',
    action_type: 'generate_skills',
    depends_on: Object.freeze(['discover_complete']),
    provider_specific: false
  }),
  Object.freeze({
    id: 'context_delivery',
    trigger_condition: 'skill_generation completed',
    action_type: 'deliver_context',
    depends_on: Object.freeze(['skill_generation']),
    provider_specific: true
  }),
  Object.freeze({
    id: 'cache_rebuild',
    trigger_condition: 'context_delivery completed',
    action_type: 'rebuild_cache',
    depends_on: Object.freeze(['context_delivery']),
    provider_specific: true
  })
]);

/**
 * Get the full projection chain.
 * @returns {Readonly<Array>} Frozen array of chain steps
 */
export function getProjectionChain() {
  return PROJECTION_CHAIN;
}

/**
 * Get only provider-neutral steps (steps 1-2).
 * @returns {Array} Array of provider-neutral step objects
 */
export function getProviderNeutralSteps() {
  return PROJECTION_CHAIN.filter(s => !s.provider_specific);
}

/**
 * Get only provider-specific steps (steps 3-4).
 * @returns {Array} Array of provider-specific step objects
 */
export function getProviderSpecificSteps() {
  return PROJECTION_CHAIN.filter(s => s.provider_specific);
}
