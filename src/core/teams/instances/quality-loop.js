/**
 * Team instance config: quality_loop
 *
 * Dual-track pattern for Quality Loop orchestration (Track A: testing,
 * Track B: QA) with optional fan-out for Track A when test count exceeds
 * threshold. Provider-neutral instance config.
 *
 * Requirements: REQ-0097 FR-001 (AC-001-01..04), FR-002 (AC-002-01..04),
 *               FR-003 (AC-003-01), FR-004 (AC-004-01..02)
 * @module src/core/teams/instances/quality-loop
 */

export const qualityLoopInstance = Object.freeze({
  instance_id: 'quality_loop',
  team_type: 'dual_track',
  tracks: Object.freeze({
    track_a: Object.freeze({
      checks: Object.freeze(['QL-002', 'QL-003', 'QL-004', 'QL-005', 'QL-006', 'QL-007'])
    }),
    track_b: Object.freeze({
      checks: Object.freeze(['QL-008', 'QL-009', 'QL-010'])
    })
  }),
  output_artifact: 'quality-report.md',
  input_dependency: '06-implementation',
  fan_out_policy: Object.freeze({
    trigger_threshold: 250,
    max_chunks: 8,
    distribution: 'round_robin',
    applies_to: 'track_a'
  }),
  scope_modes: Object.freeze(['FULL_SCOPE', 'FINAL_SWEEP']),
  retry_policy: Object.freeze({
    retry_both_on_failure: true,
    max_iterations: 10
  })
});
