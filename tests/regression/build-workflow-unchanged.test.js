/**
 * Regression tests — Build workflow unchanged by GH-253 (T056)
 *
 * Verifies that the build phase-loop workflow is NOT affected by the
 * roundtable state machine changes introduced in GH-253. The build
 * workflow (phase-loop controller) should:
 *   1. Still fire gate-requirements-injector, protocol injection, skill injection
 *   2. NOT reference any roundtable state machine fields
 *   3. NOT run roundtable composition during build phases
 *
 * Traces: FR-006 (boundary), REQ-GH-253
 * Test runner: node:test (ESM)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runPhaseLoop, getAgentForPhase } from '../../src/core/orchestration/phase-loop.js';

// ---------------------------------------------------------------------------
// Helpers — inline mock runtime (no import dependency on test helpers)
// ---------------------------------------------------------------------------

function createTrackingRuntime() {
  const calls = { executeTask: [], presentInteractive: [] };
  return {
    calls,
    async executeTask(phase, agent, context) {
      calls.executeTask.push({ phase, agent, context });
      return { status: 'completed', output: `${phase} done`, duration_ms: 10 };
    },
    async executeParallel(tasks) {
      return tasks.map(t => ({ status: 'completed', output: 'done', duration_ms: 5 }));
    },
    async presentInteractive(prompt) {
      calls.presentInteractive.push(prompt);
      return '__PHASE_COMPLETE__';
    },
    async readUserResponse() { return 'ok'; },
    async validateRuntime() { return { available: true }; },
  };
}

function makeBuildWorkflow(phases) {
  return {
    phases: phases || [
      '03-architecture',
      '04-design',
      '05-test-strategy',
      '06-implementation',
      '08-code-review',
    ],
    artifact_folder: 'REQ-GH-253-test',
    workflow_type: 'feature',
  };
}

function makeBuildState() {
  return {
    phases: {},
    active_workflow: {
      type: 'feature',
      workflow_type: 'feature',
      artifact_folder: 'REQ-GH-253-test',
    },
  };
}

// ---------------------------------------------------------------------------
// BW-01..BW-05: Phase loop executes build phases unchanged
// ---------------------------------------------------------------------------

describe('REQ-GH-253 regression — build workflow unchanged', () => {

  it('BW-01: phase-loop iterates build phases in order without roundtable composition', async () => {
    const runtime = createTrackingRuntime();
    const workflow = makeBuildWorkflow(['03-architecture', '06-implementation']);
    const result = await runPhaseLoop(runtime, workflow, makeBuildState());

    assert.strictEqual(runtime.calls.executeTask.length, 2);
    assert.strictEqual(runtime.calls.executeTask[0].phase, '03-architecture');
    assert.strictEqual(runtime.calls.executeTask[1].phase, '06-implementation');
    assert.strictEqual(result.phases['03-architecture'].status, 'completed');
    assert.strictEqual(result.phases['06-implementation'].status, 'completed');
  });

  it('BW-02: build phase context does NOT contain roundtable state machine fields', async () => {
    const runtime = createTrackingRuntime();
    const workflow = makeBuildWorkflow(['06-implementation']);
    await runPhaseLoop(runtime, workflow, makeBuildState());

    const ctx = runtime.calls.executeTask[0].context;
    // These fields should NOT appear in build workflow context
    assert.strictEqual(ctx.composedCard, undefined, 'No composedCard in build context');
    assert.strictEqual(ctx.roundtable_state, undefined, 'No roundtable_state in build context');
    assert.strictEqual(ctx.rolling_state, undefined, 'No rolling_state in build context');
    assert.strictEqual(ctx.state_machine, undefined, 'No state_machine in build context');
    assert.strictEqual(ctx.active_sub_task, undefined, 'No active_sub_task in build context');
  });

  it('BW-03: build workflow state.json output has no roundtable composition fields', async () => {
    const runtime = createTrackingRuntime();
    const workflow = makeBuildWorkflow(['06-implementation']);
    const state = makeBuildState();
    const result = await runPhaseLoop(runtime, workflow, state);

    const phaseState = result.phases['06-implementation'];
    assert.strictEqual(phaseState.roundtable_session, undefined, 'No roundtable_session');
    assert.strictEqual(phaseState.state_machine_cursor, undefined, 'No state_machine_cursor');
    assert.strictEqual(phaseState.composed_card_injected, undefined, 'No composed_card_injected');
  });

  it('BW-04: build context includes artifact_folder and workflow_type (standard fields)', async () => {
    const runtime = createTrackingRuntime();
    const workflow = makeBuildWorkflow(['06-implementation']);
    await runPhaseLoop(runtime, workflow, makeBuildState());

    const ctx = runtime.calls.executeTask[0].context;
    assert.strictEqual(ctx.artifact_folder, 'REQ-GH-253-test');
    assert.strictEqual(ctx.workflow_type, 'feature');
    assert.ok(ctx.state_summary, 'Should have state_summary');
  });

  it('BW-05: build phase maps to correct agent (unchanged)', async () => {
    // Verify the phase-to-agent mapping is unchanged
    assert.strictEqual(getAgentForPhase('06-implementation'), 'software-developer');
    assert.strictEqual(getAgentForPhase('03-architecture'), 'solution-architect');
    assert.strictEqual(getAgentForPhase('08-code-review'), 'code-reviewer');
    assert.strictEqual(getAgentForPhase('05-test-strategy'), 'test-strategist');
  });

  it('BW-06: all build phases complete successfully in order', async () => {
    const runtime = createTrackingRuntime();
    const workflow = makeBuildWorkflow();
    const result = await runPhaseLoop(runtime, workflow, makeBuildState());

    const completedPhases = runtime.calls.executeTask.map(c => c.phase);
    assert.deepStrictEqual(completedPhases, [
      '03-architecture',
      '04-design',
      '05-test-strategy',
      '06-implementation',
      '08-code-review',
    ]);

    for (const phase of completedPhases) {
      assert.strictEqual(result.phases[phase].status, 'completed');
    }
  });

  it('BW-07: onPhaseStart and onPhaseComplete callbacks fire for build phases', async () => {
    const started = [];
    const completed = [];
    const runtime = createTrackingRuntime();
    const options = {
      onPhaseStart: (phase) => started.push(phase),
      onPhaseComplete: (phase, res) => completed.push({ phase, status: res.status }),
    };

    await runPhaseLoop(runtime, makeBuildWorkflow(['06-implementation']), makeBuildState(), options);

    assert.strictEqual(started.length, 1);
    assert.strictEqual(started[0], '06-implementation');
    assert.strictEqual(completed.length, 1);
    assert.strictEqual(completed[0].status, 'completed');
  });

  it('BW-08: retry logic unchanged for build phases', async () => {
    let attempt = 0;
    const runtime = createTrackingRuntime();
    runtime.executeTask = async (phase, agent, context) => {
      runtime.calls.executeTask.push({ phase, agent, context });
      attempt++;
      if (attempt <= 2) {
        return { status: 'failed', output: null, duration_ms: 5, error: 'transient' };
      }
      return { status: 'completed', output: 'ok', duration_ms: 10 };
    };

    const result = await runPhaseLoop(
      runtime,
      makeBuildWorkflow(['06-implementation']),
      makeBuildState(),
      { maxRetries: 3 },
    );

    assert.strictEqual(result.phases['06-implementation'].status, 'completed');
    assert.strictEqual(runtime.calls.executeTask.length, 3); // 2 fails + 1 success
  });
});

// ---------------------------------------------------------------------------
// BW-10..BW-12: Phase loop constants regression
// ---------------------------------------------------------------------------

describe('REQ-GH-253 regression — phase-loop internals unchanged', () => {

  it('BW-10: getAgentForPhase returns phase key for unknown phases (graceful fallback)', () => {
    assert.strictEqual(getAgentForPhase('99-unknown'), '99-unknown');
  });

  it('BW-11: phase-loop handles empty workflow phases array', async () => {
    const runtime = createTrackingRuntime();
    const result = await runPhaseLoop(runtime, makeBuildWorkflow([]), makeBuildState());
    assert.strictEqual(runtime.calls.executeTask.length, 0);
    assert.deepStrictEqual(Object.keys(result.phases), []);
  });

  it('BW-12: phase-loop state has timing fields', async () => {
    const runtime = createTrackingRuntime();
    const result = await runPhaseLoop(
      runtime,
      makeBuildWorkflow(['06-implementation']),
      makeBuildState(),
    );
    const phaseState = result.phases['06-implementation'];
    assert.ok(phaseState.started_at, 'Should have started_at');
    assert.ok(phaseState.completed_at, 'Should have completed_at');
    assert.strictEqual(typeof phaseState.duration_ms, 'number');
  });
});
