/**
 * Team spec: fan_out
 *
 * Parallel fan-out pattern used by Impact Analysis (M1/M2/M3)
 * and Tracing (T1/T2/T3). Pure data, no runtime logic.
 *
 * Requirements: FR-001 AC-001-02, FR-003 AC-003-01..04, FR-005 AC-005-01
 * @module src/core/teams/specs/fan-out
 */

export const fanOutSpec = Object.freeze({
  team_type: 'fan_out',
  members: ['orchestrator', 'sub_agent'],
  parallelism: 'full',
  merge_policy: 'consolidate',
  retry_policy: 'fail_open',
  max_iterations: 1,
  state_owner: 'orchestrator'
});
