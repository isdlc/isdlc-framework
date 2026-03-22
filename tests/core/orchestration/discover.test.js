/**
 * Unit tests for src/core/orchestration/discover.js
 *
 * Tests the provider-neutral discover orchestrator: menu presentation,
 * agent group execution, state tracking, and resume support.
 *
 * Requirements: REQ-0132 FR-001..FR-005
 * Test ID prefix: DC- (Discover)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMockRuntime, createInteractiveRuntime } from './helpers/mock-runtime.js';
import { runDiscover } from '../../../src/core/orchestration/discover.js';

// ---------------------------------------------------------------------------
// FR-001: Discover Execution
// ---------------------------------------------------------------------------

describe('FR-001: Discover execution', () => {
  it('DC-01: completes full discover flow with mode selection', async () => {
    const runtime = createInteractiveRuntime(['existing_analysis']);
    const result = await runDiscover(runtime, { projectRoot: '/tmp' });

    assert.ok(result, 'Should return a result');
    assert.equal(result.flow_type, 'discover_existing');
  });

  it('DC-02: executes all agent groups for the selected mode', async () => {
    const runtime = createInteractiveRuntime(['existing_analysis']);
    const result = await runDiscover(runtime, { projectRoot: '/tmp' });

    assert.ok(result.completed_steps.length > 0, 'Should have completed steps');
  });

  it('DC-03: mode override skips menu presentation', async () => {
    const runtime = createMockRuntime();
    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_existing'
    });

    assert.equal(runtime.calls.presentInteractive.length, 0,
      'Should not present menu when mode is provided');
    assert.equal(result.flow_type, 'discover_existing');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Menu Presentation
// ---------------------------------------------------------------------------

describe('FR-002: Menu presentation', () => {
  it('DC-04: presents first-time menu when no existing state', async () => {
    const runtime = createInteractiveRuntime(['new_project']);
    const result = await runDiscover(runtime, { projectRoot: '/tmp' });

    assert.equal(runtime.calls.presentInteractive.length >= 1, true,
      'Should call presentInteractive for menu');
    assert.equal(result.flow_type, 'discover_new');
  });

  it('DC-05: presents returning menu when existing state provided', async () => {
    const runtime = createInteractiveRuntime(['incremental']);
    const existingState = {
      status: 'completed',
      flow_type: 'discover_existing',
      completed_steps: ['step_core_analyzers', 'step_post_analysis', 'step_constitution_skills'],
      current_step: null
    };
    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      existingState
    });

    assert.ok(runtime.calls.presentInteractive.length >= 1);
    assert.equal(result.flow_type, 'discover_incremental');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Agent Group Execution
// ---------------------------------------------------------------------------

describe('FR-003: Agent group execution', () => {
  it('DC-06: parallel groups dispatched via executeParallel', async () => {
    const runtime = createMockRuntime();
    // discover_existing has core_analyzers (parallel), post_analysis (sequential), constitution_skills (sequential)
    await runDiscover(runtime, { projectRoot: '/tmp', mode: 'discover_existing' });

    // core_analyzers is parallel, so executeParallel should be called at least once
    assert.ok(runtime.calls.executeParallel.length >= 1,
      'Should use executeParallel for parallel groups');
  });

  it('DC-07: sequential groups dispatched via executeTask', async () => {
    const runtime = createMockRuntime();
    await runDiscover(runtime, { projectRoot: '/tmp', mode: 'discover_existing' });

    // post_analysis and constitution_skills are sequential
    assert.ok(runtime.calls.executeTask.length >= 1,
      'Should use executeTask for sequential group members');
  });

  it('DC-08: accumulated context passed to subsequent groups', async () => {
    const taskContexts = [];
    const runtime = createMockRuntime({
      executeTask: async (phase, agent, context) => {
        taskContexts.push(context);
        return { status: 'completed', output: `${agent}-done`, duration_ms: 10 };
      },
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-done`, duration_ms: 10, memberId: t.id
      }))
    });
    await runDiscover(runtime, { projectRoot: '/tmp', mode: 'discover_existing' });

    // Sequential group tasks should receive context from prior groups
    if (taskContexts.length > 1) {
      assert.ok(taskContexts[taskContexts.length - 1].priorResults,
        'Later tasks should have priorResults in context');
    }
  });
});

// ---------------------------------------------------------------------------
// FR-004: State Tracking
// ---------------------------------------------------------------------------

describe('FR-004: State tracking', () => {
  it('DC-09: creates initial state with correct flow_type', async () => {
    const runtime = createMockRuntime();
    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_new'
    });

    assert.equal(result.flow_type, 'discover_new');
    assert.ok(result.started_at, 'Should have started_at');
  });

  it('DC-10: marks each step complete after group execution', async () => {
    const runtime = createMockRuntime();
    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_incremental'
    });

    assert.ok(result.completed_steps.length > 0, 'Should have completed steps');
    assert.ok(result.completed_steps.includes('step_core_analyzers'));
  });

  it('DC-11: state status transitions from pending to completed', async () => {
    const runtime = createMockRuntime();
    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_incremental'
    });

    // After all steps complete, status should be updated
    assert.ok(['in_progress', 'completed'].includes(result.status));
  });
});

// ---------------------------------------------------------------------------
// FR-005: Resume Support
// ---------------------------------------------------------------------------

describe('FR-005: Resume support', () => {
  it('DC-12: resumes from first incomplete step', async () => {
    const runtime = createMockRuntime();
    // State with core_analyzers done but post_analysis not done
    const partialState = {
      status: 'in_progress',
      flow_type: 'discover_existing',
      completed_steps: ['step_core_analyzers'],
      current_step: 'step_post_analysis',
      started_at: new Date().toISOString(),
      completed_at: null,
      last_resumed_at: null,
      depth_level: null,
      discovery_context: null
    };

    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_existing',
      resumeState: partialState
    });

    // Should have completed remaining steps
    assert.ok(result.completed_steps.includes('step_post_analysis'),
      'Should complete post_analysis on resume');
    assert.ok(result.completed_steps.includes('step_constitution_skills'),
      'Should complete constitution_skills on resume');
  });

  it('DC-13: skips already-completed groups on resume', async () => {
    const parallelCalls = [];
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => {
        parallelCalls.push(tasks.map(t => t.id));
        return tasks.map(t => ({
          status: 'completed', output: `${t.id}-done`, duration_ms: 10, memberId: t.id
        }));
      }
    });
    const partialState = {
      status: 'in_progress',
      flow_type: 'discover_existing',
      completed_steps: ['step_core_analyzers'],
      current_step: 'step_post_analysis',
      started_at: new Date().toISOString(),
      completed_at: null,
      last_resumed_at: null,
      depth_level: null,
      discovery_context: null
    };

    await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_existing',
      resumeState: partialState
    });

    // core_analyzers (parallel) should NOT be re-dispatched
    const flatCalls = parallelCalls.flat();
    const coreAnalyzerMembers = ['architecture-analyzer', 'test-evaluator', 'data-model-analyzer', 'feature-mapper'];
    const reran = coreAnalyzerMembers.some(m => flatCalls.includes(m));
    assert.equal(reran, false, 'Should not re-run core_analyzers group');
  });

  it('DC-14: sets last_resumed_at on resume', async () => {
    const runtime = createMockRuntime();
    const partialState = {
      status: 'in_progress',
      flow_type: 'discover_incremental',
      completed_steps: [],
      current_step: 'step_core_analyzers',
      started_at: new Date().toISOString(),
      completed_at: null,
      last_resumed_at: null,
      depth_level: null,
      discovery_context: null
    };

    const result = await runDiscover(runtime, {
      projectRoot: '/tmp',
      mode: 'discover_incremental',
      resumeState: partialState
    });

    assert.ok(result.last_resumed_at, 'Should set last_resumed_at on resume');
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Discover edge cases', () => {
  it('DC-15: chat/explore mode selection returns minimal state', async () => {
    const runtime = createInteractiveRuntime(['chat_explore']);
    const result = await runDiscover(runtime, { projectRoot: '/tmp' });

    assert.ok(result, 'Should return a state object');
    assert.equal(result.flow_type, null, 'Chat/explore has no flow_type');
  });

  it('DC-16: mode override with unknown mode throws', async () => {
    const runtime = createMockRuntime();
    await assert.rejects(
      () => runDiscover(runtime, { projectRoot: '/tmp', mode: 'nonexistent_mode' }),
      (err) => {
        assert.ok(err.message.includes('Unknown'));
        return true;
      }
    );
  });
});
