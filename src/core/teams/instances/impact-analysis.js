/**
 * Team instance config: impact_analysis
 *
 * Fan-out pattern for Impact Analysis orchestration (M1/M2/M3 + M4 verifier).
 * Pure data, no runtime logic. Provider-neutral instance config.
 *
 * Requirements: REQ-0095 FR-001 (AC-001-01..03), FR-002 (AC-002-01),
 *               FR-003 (AC-003-01..02), FR-004 (AC-004-01)
 * @module src/core/teams/instances/impact-analysis
 */

export const impactAnalysisInstance = Object.freeze({
  instance_id: 'impact_analysis',
  team_type: 'fan_out',
  members: Object.freeze([
    Object.freeze({ id: 'M1', role: 'impact-analyzer', required: true }),
    Object.freeze({ id: 'M2', role: 'entry-point-finder', required: true }),
    Object.freeze({ id: 'M3', role: 'risk-assessor', required: true }),
    Object.freeze({ id: 'M4', role: 'cross-validation-verifier', required: false })
  ]),
  output_artifact: 'impact-analysis.md',
  input_dependency: '01-requirements',
  policies: Object.freeze({
    fail_open: Object.freeze({
      tier_1: 'skip_if_unavailable',
      tier_2: 'skip_if_task_fails',
      tier_3: 'skip_if_timeout'
    })
  }),
  scope_variants: Object.freeze(['feature', 'upgrade'])
});
