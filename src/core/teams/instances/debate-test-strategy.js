/**
 * Team instance config: debate_test_strategy
 *
 * Debate pattern (Creator->Critic->Refiner) for Test Strategy phase.
 * Pure data, no runtime logic. Provider-neutral instance config.
 *
 * Requirements: REQ-0098 FR-001 (AC-001-04), FR-002 (AC-002-01),
 *               FR-003 (AC-003-01..02), FR-005 (AC-005-01)
 * @module src/core/teams/instances/debate-test-strategy
 */

export const debateTestStrategyInstance = Object.freeze({
  instance_id: 'debate_test_strategy',
  team_type: 'debate',
  phase: '05-test-strategy',
  members: Object.freeze([
    Object.freeze({
      role: 'creator',
      agent: 'test-design-engineer',
      task_context_instructions: 'Read TASK_CONTEXT, generate 1:1 test cases per Phase 06 task, write task-to-test table'
    }),
    Object.freeze({
      role: 'critic',
      agent: 'test-strategy-critic',
      task_context_instructions: 'Validate every Phase 06 task has a test case, check traces carried forward'
    }),
    Object.freeze({
      role: 'refiner',
      agent: 'test-strategy-refiner',
      task_context_instructions: 'Address Critic gaps, ensure traceability table complete'
    })
  ]),
  output_artifact: 'test-strategy.md',
  input_dependency: '04-design',
  max_rounds: 3
});
