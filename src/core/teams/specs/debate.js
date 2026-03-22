/**
 * Team spec: debate
 *
 * Sequential debate pattern used by requirements/architecture/design/test-strategy
 * debate rounds (creator -> critic -> refiner). Pure data, no runtime logic.
 *
 * Requirements: FR-001 AC-001-04, FR-003 AC-003-01..04, FR-005 AC-005-01
 * @module src/core/teams/specs/debate
 */

export const debateSpec = Object.freeze({
  team_type: 'debate',
  members: ['creator', 'critic', 'refiner'],
  parallelism: 'sequential',
  merge_policy: 'last_wins',
  retry_policy: 'per_round',
  max_iterations: 3,
  state_owner: 'orchestrator'
});
