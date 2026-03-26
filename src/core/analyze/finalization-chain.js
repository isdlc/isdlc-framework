/**
 * Analyze Finalization Chain — 6-step trigger chain for post-analyze finalization
 *
 * Frozen data structure modeling the chain from analyze-finalize.cjs.
 * Steps 1-3 sync, steps 4-6 async. Pure data — no runtime execution.
 *
 * Requirements: REQ-0112 FR-001 (AC-001-01..02), FR-002 (AC-002-01..03),
 *               FR-003 (AC-003-01..03), FR-004 (AC-004-01..03)
 * @module src/core/analyze/finalization-chain
 */

// ---------------------------------------------------------------------------
// FR-001: Finalization Chain (AC-001-01..02)
// ---------------------------------------------------------------------------

const finalizationChain = Object.freeze([
  Object.freeze({
    id: 'meta_status_update',
    order: 1,
    action: 'Update meta.json analysis_status to analyzed',
    depends_on: Object.freeze([]),
    provider_specific: false,
    fail_open: false,
    async: false
  }),
  Object.freeze({
    id: 'backlog_marker_update',
    order: 2,
    action: 'Update BACKLOG.md status marker for the item',
    depends_on: Object.freeze(['meta_status_update']),
    provider_specific: false,
    fail_open: false,
    async: false
  }),
  Object.freeze({
    id: 'github_sync',
    order: 3,
    action: 'Sync labels and comments to GitHub issue',
    depends_on: Object.freeze(['meta_status_update']),
    provider_specific: true,
    fail_open: true,
    async: false
  }),
  Object.freeze({
    id: 'sizing_computation',
    order: 4,
    action: 'Compute sizing estimate from requirements',
    depends_on: Object.freeze(['meta_status_update']),
    provider_specific: false,
    fail_open: true,
    async: true
  }),
  Object.freeze({
    id: 'memory_writeback',
    order: 5,
    action: 'Write session record to roundtable memory',
    depends_on: Object.freeze(['meta_status_update']),
    provider_specific: false,
    fail_open: true,
    async: true
  }),
  Object.freeze({
    id: 'async_enrichment',
    order: 6,
    action: 'Trigger embedding and vector index update',
    depends_on: Object.freeze(['memory_writeback']),
    provider_specific: false,
    fail_open: true,
    async: true
  }),
  // REQ-GH-208 FR-003: Write tasks.md to requirement folder if task breakdown was generated
  Object.freeze({
    id: 'task_breakdown_write',
    order: 7,
    action: 'Write tasks.md to requirement artifact folder (guarded: only when task_breakdown_generated)',
    depends_on: Object.freeze(['meta_status_update']),
    provider_specific: false,
    fail_open: true,
    async: false
  })
]);

// ---------------------------------------------------------------------------
// FR-004: Registry Functions (AC-004-01..03)
// ---------------------------------------------------------------------------

/**
 * Get the full finalization chain.
 * @returns {Readonly<Array>} Frozen array of 6 chain steps
 */
export function getFinalizationChain() {
  return finalizationChain;
}

/**
 * Get only provider-neutral steps (provider_specific === false).
 * @returns {Array} Array of provider-neutral step objects
 */
export function getProviderNeutralSteps() {
  return finalizationChain.filter(s => !s.provider_specific);
}

/**
 * Get only async steps (steps 4-6).
 * @returns {Array} Array of async step objects
 */
export function getAsyncSteps() {
  return finalizationChain.filter(s => s.async);
}
