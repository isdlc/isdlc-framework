/**
 * Unit tests for src/core/orchestration/fan-out.js
 *
 * Tests the provider-neutral fan-out orchestrator: parallel dispatch,
 * merge policies, fail-open handling, and return shape.
 *
 * Requirements: REQ-0130 FR-001..FR-004
 * Test ID prefix: FO- (Fan-Out)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMockRuntime } from './helpers/mock-runtime.js';
import { runFanOut } from '../../../src/core/orchestration/fan-out.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstanceConfig(overrides = {}) {
  return {
    members: [
      { id: 'agent-a', prompt: 'Do A', required: true },
      { id: 'agent-b', prompt: 'Do B', required: true }
    ],
    merge_policy: 'consolidate',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// FR-001: Fan-Out Execution
// ---------------------------------------------------------------------------

describe('FR-001: Fan-out execution', () => {
  it('FO-01: dispatches all members via executeParallel', async () => {
    const runtime = createMockRuntime();
    const config = makeInstanceConfig();
    await runFanOut(runtime, config, { shared: true });

    assert.equal(runtime.calls.executeParallel.length, 1);
    assert.equal(runtime.calls.executeParallel[0].tasks.length, 2);
  });

  it('FO-02: passes member config and shared context in each task', async () => {
    const runtime = createMockRuntime();
    const config = makeInstanceConfig();
    await runFanOut(runtime, config, { projectRoot: '/tmp' });

    const tasks = runtime.calls.executeParallel[0].tasks;
    assert.equal(tasks[0].id, 'agent-a');
    assert.ok(tasks[0].context.projectRoot, 'Should include shared context');
  });

  it('FO-03: returns results map keyed by member ID', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-output`, duration_ms: 10, memberId: t.id
      }))
    });
    const result = await runFanOut(runtime, makeInstanceConfig(), {});

    assert.ok(result.results instanceof Map);
    assert.ok(result.results.has('agent-a'));
    assert.ok(result.results.has('agent-b'));
  });
});

// ---------------------------------------------------------------------------
// FR-002: Merge Policies
// ---------------------------------------------------------------------------

describe('FR-002: Merge policies', () => {
  it('FO-04: consolidate merges all outputs with attribution', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-output`, duration_ms: 10, memberId: t.id
      }))
    });
    const config = makeInstanceConfig({ merge_policy: 'consolidate' });
    const result = await runFanOut(runtime, config, {});

    assert.ok(result.merged_output, 'Should have merged_output');
    assert.ok(Array.isArray(result.merged_output), 'Consolidated output should be an array');
    assert.equal(result.merged_output.length, 2);
    assert.equal(result.merged_output[0].memberId, 'agent-a');
  });

  it('FO-05: last_wins returns last successful result', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-output`, duration_ms: 10, memberId: t.id
      }))
    });
    const config = makeInstanceConfig({ merge_policy: 'last_wins' });
    const result = await runFanOut(runtime, config, {});

    assert.ok(result.merged_output, 'Should have merged_output');
    assert.equal(result.merged_output.memberId, 'agent-b', 'Last wins should take last result');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Fail-Open Handling
// ---------------------------------------------------------------------------

describe('FR-003: Fail-open handling', () => {
  it('FO-06: optional member failure does not block overall result', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: t.id === 'agent-b' ? 'failed' : 'completed',
        output: t.id === 'agent-b' ? null : `${t.id}-output`,
        duration_ms: 10,
        memberId: t.id,
        error: t.id === 'agent-b' ? 'agent-b failed' : undefined
      }))
    });
    const config = makeInstanceConfig({
      members: [
        { id: 'agent-a', prompt: 'Do A', required: true },
        { id: 'agent-b', prompt: 'Do B', required: false }
      ]
    });
    const result = await runFanOut(runtime, config, {});

    assert.ok(!result.error, 'Overall result should not be an error');
    assert.deepEqual(result.failed_members, ['agent-b']);
    assert.ok(result.merged_output, 'Should still have merged output from successful members');
  });

  it('FO-07: required member failure causes overall failure', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: t.id === 'agent-a' ? 'failed' : 'completed',
        output: t.id === 'agent-a' ? null : `${t.id}-output`,
        duration_ms: 10,
        memberId: t.id,
        error: t.id === 'agent-a' ? 'agent-a failed' : undefined
      }))
    });
    const config = makeInstanceConfig();
    const result = await runFanOut(runtime, config, {});

    assert.ok(result.error, 'Should indicate overall failure');
  });

  it('FO-08: failed optional members excluded from merge', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: t.id === 'agent-b' ? 'failed' : 'completed',
        output: t.id === 'agent-b' ? null : `${t.id}-output`,
        duration_ms: 10,
        memberId: t.id
      }))
    });
    const config = makeInstanceConfig({
      members: [
        { id: 'agent-a', prompt: 'Do A', required: true },
        { id: 'agent-b', prompt: 'Do B', required: false }
      ],
      merge_policy: 'consolidate'
    });
    const result = await runFanOut(runtime, config, {});

    assert.equal(result.merged_output.length, 1, 'Only successful members in merge');
    assert.equal(result.merged_output[0].memberId, 'agent-a');
  });
});

// ---------------------------------------------------------------------------
// FR-004: Return Shape
// ---------------------------------------------------------------------------

describe('FR-004: Return shape', () => {
  it('FO-09: returns results, merged_output, failed_members, duration_ms', async () => {
    const runtime = createMockRuntime();
    const result = await runFanOut(runtime, makeInstanceConfig(), {});

    assert.ok(result.results instanceof Map, 'results should be a Map');
    assert.ok('merged_output' in result, 'Should have merged_output');
    assert.ok(Array.isArray(result.failed_members), 'failed_members should be array');
    assert.ok(typeof result.duration_ms === 'number', 'duration_ms should be a number');
  });

  it('FO-10: duration_ms is non-negative', async () => {
    const runtime = createMockRuntime();
    const result = await runFanOut(runtime, makeInstanceConfig(), {});

    assert.ok(result.duration_ms >= 0);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Fan-out edge cases', () => {
  it('FO-11: empty members array returns empty results', async () => {
    const runtime = createMockRuntime({
      executeParallel: async () => []
    });
    const config = makeInstanceConfig({ members: [] });
    const result = await runFanOut(runtime, config, {});

    assert.equal(result.results.size, 0);
    assert.deepEqual(result.failed_members, []);
  });

  it('FO-12: single member works correctly', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: 'solo-output', duration_ms: 10, memberId: t.id
      }))
    });
    const config = makeInstanceConfig({
      members: [{ id: 'solo', prompt: 'Do solo', required: true }]
    });
    const result = await runFanOut(runtime, config, {});

    assert.equal(result.results.size, 1);
    assert.ok(result.results.has('solo'));
  });

  it('FO-13: all members optional and all fail returns empty merge', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'failed', output: null, duration_ms: 5, memberId: t.id, error: 'fail'
      }))
    });
    const config = makeInstanceConfig({
      members: [
        { id: 'a', prompt: 'A', required: false },
        { id: 'b', prompt: 'B', required: false }
      ]
    });
    const result = await runFanOut(runtime, config, {});

    assert.ok(!result.error, 'All optional failures should not be a fatal error');
    assert.deepEqual(result.failed_members, ['a', 'b']);
  });
});
