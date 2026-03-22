/**
 * Team instance config: tracing
 *
 * Fan-out pattern for Tracing orchestration (T1/T2/T3).
 * Pure data, no runtime logic. Provider-neutral instance config.
 *
 * Requirements: REQ-0096 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02),
 *               FR-003 (AC-003-01..02)
 * @module src/core/teams/instances/tracing
 */

export const tracingInstance = Object.freeze({
  instance_id: 'tracing',
  team_type: 'fan_out',
  members: Object.freeze([
    Object.freeze({ id: 'T1', role: 'symptom-analyzer', required: true }),
    Object.freeze({ id: 'T2', role: 'execution-path-tracer', required: true }),
    Object.freeze({ id: 'T3', role: 'root-cause-identifier', required: true })
  ]),
  output_artifact: 'trace-analysis.md',
  input_dependency: '01-requirements',
  policies: Object.freeze({})
});
