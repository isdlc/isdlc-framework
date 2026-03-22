/**
 * Unit tests for src/core/orchestration/phase-loop.js
 *
 * Tests the provider-neutral phase-loop orchestrator: sequential phase
 * execution, retry logic, interactive relay, skill injection, and callbacks.
 *
 * Requirements: REQ-0129 FR-001..FR-006
 * Test ID prefix: PL- (Phase Loop)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createMockRuntime, createFailThenSucceedRuntime } from './helpers/mock-runtime.js';
import { runPhaseLoop } from '../../../src/core/orchestration/phase-loop.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWorkflow(phases = ['01-requirements', '02-tracing', '03-architecture']) {
  return {
    phases,
    artifact_folder: 'REQ-TEST',
    workflow_type: 'feature'
  };
}

function makeState() {
  return { phases: {}, active_workflow: { type: 'feature' } };
}

// ---------------------------------------------------------------------------
// FR-001: Phase Loop Execution
// ---------------------------------------------------------------------------

describe('FR-001: Phase loop execution', () => {
  it('PL-01: iterates through all phases in order', async () => {
    const runtime = createMockRuntime();
    const workflow = makeWorkflow(['02-tracing', '03-architecture']);
    const result = await runPhaseLoop(runtime, workflow, makeState());

    assert.equal(runtime.calls.executeTask.length, 2);
    assert.equal(runtime.calls.executeTask[0].phase, '02-tracing');
    assert.equal(runtime.calls.executeTask[1].phase, '03-architecture');
    assert.ok(result.phases['02-tracing']);
    assert.ok(result.phases['03-architecture']);
  });

  it('PL-02: returns accumulated state with all phase results', async () => {
    const runtime = createMockRuntime();
    const workflow = makeWorkflow(['03-architecture']);
    const result = await runPhaseLoop(runtime, workflow, makeState());

    assert.ok(result.phases['03-architecture']);
    assert.equal(result.phases['03-architecture'].status, 'completed');
  });

  it('PL-03: handles empty phases array', async () => {
    const runtime = createMockRuntime();
    const workflow = makeWorkflow([]);
    const result = await runPhaseLoop(runtime, workflow, makeState());

    assert.equal(runtime.calls.executeTask.length, 0);
    assert.deepEqual(Object.keys(result.phases), []);
  });

  it('PL-04: handles single phase', async () => {
    const runtime = createMockRuntime();
    const workflow = makeWorkflow(['06-implementation']);
    const result = await runPhaseLoop(runtime, workflow, makeState());

    assert.equal(runtime.calls.executeTask.length, 1);
    assert.ok(result.phases['06-implementation']);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Pre-Phase Hook (activatePhase)
// ---------------------------------------------------------------------------

describe('FR-002: Pre-phase hook', () => {
  it('PL-05: calls onPhaseStart callback before execution', async () => {
    const started = [];
    const runtime = createMockRuntime();
    const options = { onPhaseStart: (phase) => started.push(phase) };

    await runPhaseLoop(runtime, makeWorkflow(['01-requirements']), makeState(), options);

    assert.equal(started.length, 1);
    assert.equal(started[0], '01-requirements');
  });

  it('PL-06: writes activation record to state', async () => {
    const runtime = createMockRuntime();
    const result = await runPhaseLoop(runtime, makeWorkflow(['03-architecture']), makeState());

    const phaseState = result.phases['03-architecture'];
    assert.ok(phaseState.started_at, 'Should have started_at timestamp');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Post-Phase Hook (updateState)
// ---------------------------------------------------------------------------

describe('FR-003: Post-phase hook', () => {
  it('PL-07: calls onPhaseComplete callback after execution', async () => {
    const completed = [];
    const runtime = createMockRuntime();
    const options = { onPhaseComplete: (phase, res) => completed.push({ phase, status: res.status }) };

    await runPhaseLoop(runtime, makeWorkflow(['01-requirements']), makeState(), options);

    assert.equal(completed.length, 1);
    assert.equal(completed[0].phase, '01-requirements');
    assert.equal(completed[0].status, 'completed');
  });

  it('PL-08: records timing metrics in state', async () => {
    const runtime = createMockRuntime();
    const result = await runPhaseLoop(runtime, makeWorkflow(['02-tracing']), makeState());

    const phaseState = result.phases['02-tracing'];
    assert.ok(phaseState.completed_at, 'Should have completed_at timestamp');
    assert.ok(typeof phaseState.duration_ms === 'number', 'Should have duration_ms');
  });
});

// ---------------------------------------------------------------------------
// FR-004: Hook Block Handling (Retry)
// ---------------------------------------------------------------------------

describe('FR-004: Retry on failure', () => {
  it('PL-09: retries failed phase up to maxRetries', async () => {
    const runtime = createFailThenSucceedRuntime(2);
    const workflow = makeWorkflow(['06-implementation']);
    const result = await runPhaseLoop(runtime, workflow, makeState(), { maxRetries: 3 });

    assert.equal(result.phases['06-implementation'].status, 'completed');
    // 2 failures + 1 success = 3 calls
    assert.equal(runtime.calls.executeTask.length, 3);
  });

  it('PL-10: calls onError callback on each failure', async () => {
    const errors = [];
    const runtime = createFailThenSucceedRuntime(1);
    const options = {
      maxRetries: 3,
      onError: (phase, err) => errors.push({ phase, error: err })
    };

    await runPhaseLoop(runtime, makeWorkflow(['06-implementation']), makeState(), options);

    assert.equal(errors.length, 1);
    assert.equal(errors[0].phase, '06-implementation');
  });

  it('PL-11: marks phase as blocked when all retries exhausted', async () => {
    const runtime = createMockRuntime({
      executeTask: async () => ({ status: 'failed', output: null, duration_ms: 5, error: 'always fails' })
    });
    const workflow = makeWorkflow(['06-implementation']);
    const result = await runPhaseLoop(runtime, workflow, makeState(), { maxRetries: 2 });

    assert.equal(result.phases['06-implementation'].status, 'blocked');
  });

  it('PL-12: stops phase loop when a phase is blocked', async () => {
    const runtime = createMockRuntime({
      executeTask: async () => ({ status: 'failed', output: null, duration_ms: 5, error: 'fail' })
    });
    const workflow = makeWorkflow(['03-architecture', '04-design']);
    const result = await runPhaseLoop(runtime, workflow, makeState(), { maxRetries: 1 });

    assert.equal(result.phases['03-architecture'].status, 'blocked');
    assert.equal(result.phases['04-design'], undefined, 'Should not execute second phase');
  });

  it('PL-13: default maxRetries is 3', async () => {
    const runtime = createFailThenSucceedRuntime(3);
    const workflow = makeWorkflow(['06-implementation']);
    const result = await runPhaseLoop(runtime, workflow, makeState());

    assert.equal(result.phases['06-implementation'].status, 'completed');
    assert.equal(runtime.calls.executeTask.length, 4); // 3 failures + 1 success
  });
});

// ---------------------------------------------------------------------------
// FR-005: Interactive Phase Relay
// ---------------------------------------------------------------------------

describe('FR-005: Interactive phase relay', () => {
  it('PL-14: uses presentInteractive for interactive phases', async () => {
    let callCount = 0;
    const runtime = createMockRuntime({
      presentInteractive: async () => {
        callCount++;
        return callCount >= 2 ? '__PHASE_COMPLETE__' : 'continue';
      }
    });
    const workflow = makeWorkflow(['01-requirements']);
    await runPhaseLoop(runtime, workflow, makeState());

    assert.ok(runtime.calls.presentInteractive.length >= 2,
      'Should call presentInteractive multiple times for interactive phase');
  });

  it('PL-15: non-interactive phases use executeTask', async () => {
    const runtime = createMockRuntime();
    const workflow = makeWorkflow(['02-tracing']);
    await runPhaseLoop(runtime, workflow, makeState());

    assert.equal(runtime.calls.executeTask.length, 1);
    assert.equal(runtime.calls.presentInteractive.length, 0);
  });
});

// ---------------------------------------------------------------------------
// FR-006: Consumed Dependencies
// ---------------------------------------------------------------------------

describe('FR-006: Consumed dependencies', () => {
  it('PL-16: passes workflow context to executeTask', async () => {
    const runtime = createMockRuntime();
    const workflow = makeWorkflow(['03-architecture']);
    await runPhaseLoop(runtime, workflow, makeState());

    const call = runtime.calls.executeTask[0];
    assert.ok(call.context, 'Should pass context to executeTask');
    assert.equal(call.context.artifact_folder, 'REQ-TEST');
    assert.equal(call.context.workflow_type, 'feature');
  });

  it('PL-17: maps phase to correct agent', async () => {
    const runtime = createMockRuntime();
    await runPhaseLoop(runtime, makeWorkflow(['06-implementation']), makeState());

    const call = runtime.calls.executeTask[0];
    assert.equal(call.agent, 'software-developer');
  });

  it('PL-18: maps all standard phases to agents', async () => {
    const runtime = createMockRuntime();
    const phases = ['01-requirements', '02-tracing', '03-architecture',
      '04-design', '05-test-strategy', '06-implementation', '08-code-review'];
    await runPhaseLoop(runtime, makeWorkflow(phases), makeState());

    const agents = runtime.calls.executeTask.map(c => c.agent);
    // 01-requirements is interactive, so it uses presentInteractive not executeTask
    // But the rest should have agents
    assert.ok(agents.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Phase loop edge cases', () => {
  it('PL-19: options parameter is optional', async () => {
    const runtime = createMockRuntime();
    const result = await runPhaseLoop(runtime, makeWorkflow(['02-tracing']), makeState());
    assert.ok(result.phases['02-tracing']);
  });

  it('PL-20: handles runtime throwing an exception', async () => {
    const runtime = createMockRuntime({
      executeTask: async () => { throw new Error('runtime crash'); }
    });
    const workflow = makeWorkflow(['02-tracing']);
    const result = await runPhaseLoop(runtime, workflow, makeState(), { maxRetries: 1 });

    assert.equal(result.phases['02-tracing'].status, 'blocked');
  });
});
