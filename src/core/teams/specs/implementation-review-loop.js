/**
 * Team spec: implementation_review_loop
 *
 * Sequential writer -> reviewer -> updater loop used by the
 * implementation phase (Phase 06). Pure data, no runtime logic.
 *
 * Requirements: FR-001 AC-001-01, FR-003 AC-003-01..04, FR-005 AC-005-01
 * @module src/core/teams/specs/implementation-review-loop
 */

export const implementationReviewLoopSpec = Object.freeze({
  team_type: 'implementation_review_loop',
  members: ['writer', 'reviewer', 'updater'],
  parallelism: 'sequential',
  merge_policy: 'last_wins',
  retry_policy: 'per_member',
  max_iterations: 3,
  state_owner: 'orchestrator',
  task_context: Object.freeze({
    writer: 'Read TASK_CONTEXT, execute tasks in dependency order, use test_mapping for TDD',
    reviewer: 'Validate each file against its task traces',
    updater: 'Fix issues flagged by reviewer (unchanged)'
  })
});
