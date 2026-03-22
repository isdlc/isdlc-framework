/**
 * Team spec: dual_track
 *
 * Dual-track pattern used by the Quality Loop (Track A / Track B).
 * Pure data, no runtime logic.
 *
 * Requirements: FR-001 AC-001-03, FR-003 AC-003-01..04, FR-005 AC-005-01
 * @module src/core/teams/specs/dual-track
 */

export const dualTrackSpec = Object.freeze({
  team_type: 'dual_track',
  members: ['track_a', 'track_b'],
  parallelism: 'full',
  merge_policy: 'consolidate',
  retry_policy: 'per_track',
  max_iterations: 10,
  state_owner: 'orchestrator'
});
