/**
 * Unit tests for src/core/orchestration/dual-track.js
 *
 * Tests the provider-neutral dual-track orchestrator: retry loop,
 * fan-out sub-orchestration trigger, and return shape.
 *
 * Requirements: REQ-0131 FR-001..FR-004
 * Test ID prefix: DT- (Dual-Track)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMockRuntime } from './helpers/mock-runtime.js';
import { runDualTrack } from '../../../src/core/orchestration/dual-track.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInstanceConfig(overrides = {}) {
  return {
    trackA: { agent: 'track-a-agent', prompt: 'Run Track A' },
    trackB: { agent: 'track-b-agent', prompt: 'Run Track B' },
    policies: {
      retry: { max_iterations: 10 },
      fan_out: { trigger_threshold: 50 }
    },
    ...overrides
  };
}

function makeContext(overrides = {}) {
  return { test_count: 10, ...overrides };
}

// ---------------------------------------------------------------------------
// FR-001: Dual-Track Execution
// ---------------------------------------------------------------------------

describe('FR-001: Dual-track execution', () => {
  it('DT-01: both tracks pass first try returns immediately', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-result`, duration_ms: 10, memberId: t.id
      }))
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.ok(result.trackA, 'Should have trackA result');
    assert.ok(result.trackB, 'Should have trackB result');
    assert.equal(result.iterations_used, 1);
  });

  it('DT-02: retries both tracks when Track A fails', async () => {
    let attempt = 0;
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => {
        attempt++;
        return tasks.map(t => ({
          status: (t.id === 'trackA' && attempt === 1) ? 'failed' : 'completed',
          output: `${t.id}-result-${attempt}`,
          duration_ms: 10,
          memberId: t.id,
          error: (t.id === 'trackA' && attempt === 1) ? 'track A failed' : undefined
        }));
      }
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.equal(result.iterations_used, 2);
    assert.equal(result.trackA.status, 'completed');
    assert.equal(result.trackB.status, 'completed');
  });

  it('DT-03: retries both tracks when Track B fails', async () => {
    let attempt = 0;
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => {
        attempt++;
        return tasks.map(t => ({
          status: (t.id === 'trackB' && attempt === 1) ? 'failed' : 'completed',
          output: `${t.id}-result-${attempt}`,
          duration_ms: 10,
          memberId: t.id,
          error: (t.id === 'trackB' && attempt === 1) ? 'track B failed' : undefined
        }));
      }
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.equal(result.iterations_used, 2);
    assert.equal(result.trackA.status, 'completed');
  });

  it('DT-04: both tracks fail triggers retry of both', async () => {
    let attempt = 0;
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => {
        attempt++;
        return tasks.map(t => ({
          status: attempt === 1 ? 'failed' : 'completed',
          output: `${t.id}-result-${attempt}`,
          duration_ms: 10,
          memberId: t.id,
          error: attempt === 1 ? 'both fail' : undefined
        }));
      }
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.equal(result.iterations_used, 2);
    assert.equal(result.trackA.status, 'completed');
    assert.equal(result.trackB.status, 'completed');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Max Iterations
// ---------------------------------------------------------------------------

describe('FR-002: Max iterations', () => {
  it('DT-05: returns failure after max iterations reached', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'failed', output: null, duration_ms: 5, memberId: t.id, error: 'always fails'
      }))
    });
    const config = makeInstanceConfig({
      policies: { retry: { max_iterations: 3 }, fan_out: { trigger_threshold: 50 } }
    });
    const result = await runDualTrack(runtime, config, makeContext());

    assert.equal(result.iterations_used, 3);
    assert.equal(result.trackA.status, 'failed');
  });

  it('DT-06: respects custom max_iterations value', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'failed', output: null, duration_ms: 5, memberId: t.id, error: 'fail'
      }))
    });
    const config = makeInstanceConfig({
      policies: { retry: { max_iterations: 1 }, fan_out: { trigger_threshold: 50 } }
    });
    const result = await runDualTrack(runtime, config, makeContext());

    assert.equal(result.iterations_used, 1);
  });

  it('DT-07: defaults to 10 max_iterations when not specified', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'failed', output: null, duration_ms: 5, memberId: t.id, error: 'fail'
      }))
    });
    const config = makeInstanceConfig();
    delete config.policies.retry.max_iterations;
    const result = await runDualTrack(runtime, config, makeContext());

    assert.equal(result.iterations_used, 10);
  });
});

// ---------------------------------------------------------------------------
// FR-003: Fan-Out Sub-Orchestration
// ---------------------------------------------------------------------------

describe('FR-003: Fan-out sub-orchestration', () => {
  it('DT-08: activates fan-out when test_count >= threshold', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-result`, duration_ms: 10, memberId: t.id
      }))
    });
    const config = makeInstanceConfig({
      policies: { retry: { max_iterations: 3 }, fan_out: { trigger_threshold: 5 } }
    });
    const result = await runDualTrack(runtime, config, makeContext({ test_count: 10 }));

    assert.equal(result.fan_out_used, true);
  });

  it('DT-09: does not activate fan-out when test_count < threshold', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-result`, duration_ms: 10, memberId: t.id
      }))
    });
    const config = makeInstanceConfig({
      policies: { retry: { max_iterations: 3 }, fan_out: { trigger_threshold: 100 } }
    });
    const result = await runDualTrack(runtime, config, makeContext({ test_count: 10 }));

    assert.equal(result.fan_out_used, false);
  });

  it('DT-10: fan-out triggers at exact threshold boundary', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: `${t.id}-result`, duration_ms: 10, memberId: t.id
      }))
    });
    const config = makeInstanceConfig({
      policies: { retry: { max_iterations: 3 }, fan_out: { trigger_threshold: 10 } }
    });
    const result = await runDualTrack(runtime, config, makeContext({ test_count: 10 }));

    assert.equal(result.fan_out_used, true);
  });
});

// ---------------------------------------------------------------------------
// FR-004: Return Shape
// ---------------------------------------------------------------------------

describe('FR-004: Return shape', () => {
  it('DT-11: returns trackA, trackB, iterations_used, fan_out_used', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: 'ok', duration_ms: 10, memberId: t.id
      }))
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.ok('trackA' in result, 'Should have trackA');
    assert.ok('trackB' in result, 'Should have trackB');
    assert.ok('iterations_used' in result, 'Should have iterations_used');
    assert.ok('fan_out_used' in result, 'Should have fan_out_used');
  });

  it('DT-12: fan_out_used is boolean', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: 'ok', duration_ms: 10, memberId: t.id
      }))
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.equal(typeof result.fan_out_used, 'boolean');
  });

  it('DT-13: iterations_used is positive integer', async () => {
    const runtime = createMockRuntime({
      executeParallel: async (tasks) => tasks.map(t => ({
        status: 'completed', output: 'ok', duration_ms: 10, memberId: t.id
      }))
    });
    const result = await runDualTrack(runtime, makeInstanceConfig(), makeContext());

    assert.ok(Number.isInteger(result.iterations_used));
    assert.ok(result.iterations_used >= 1);
  });
});
