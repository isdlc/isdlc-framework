/**
 * Tests for src/core/observability/orchestrator-hooks.js
 * REQ-0068: Orchestrator observability callbacks
 * Test ID prefix: OH-
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createObservabilityCallbacks } from '../../../src/core/observability/orchestrator-hooks.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createMockStateWriter(initialState = null) {
  let state = initialState || {
    active_workflow: { type: 'feature' },
    phases: { '06-implementation': { status: 'in_progress' } }
  };
  return {
    readState() { return state; },
    writeState(s) { state = s; },
    getState() { return state; }
  };
}

// ---------------------------------------------------------------------------
// OH-08: createObservabilityCallbacks
// ---------------------------------------------------------------------------

describe('createObservabilityCallbacks', () => {
  it('OH-08: returns object with three callback functions', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    assert.equal(typeof callbacks.onPhaseStart, 'function');
    assert.equal(typeof callbacks.onPhaseComplete, 'function');
    assert.equal(typeof callbacks.onError, 'function');
  });
});

// ---------------------------------------------------------------------------
// OH-01, OH-02: onPhaseStart
// ---------------------------------------------------------------------------

describe('onPhaseStart', () => {
  it('OH-01: appends sub_agent_log entry with status running', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    callbacks.onPhaseStart('06-implementation');

    const log = sw.getState().active_workflow.sub_agent_log;
    assert.ok(Array.isArray(log));
    assert.equal(log.length, 1);
    assert.equal(log[0].status, 'running');
    assert.equal(log[0].phase, '06-implementation');
  });

  it('OH-02: includes provider from constructor argument', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'codex');

    callbacks.onPhaseStart('05-test-strategy');

    const log = sw.getState().active_workflow.sub_agent_log;
    assert.equal(log[0].provider, 'codex');
  });
});

// ---------------------------------------------------------------------------
// OH-03, OH-04, OH-05, OH-10: onPhaseComplete
// ---------------------------------------------------------------------------

describe('onPhaseComplete', () => {
  it('OH-03: appends sub_agent_log entry with completed status and duration_ms', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    callbacks.onPhaseComplete('06-implementation', {
      status: 'completed',
      duration_ms: 45000
    });

    const log = sw.getState().active_workflow.sub_agent_log;
    assert.equal(log.length, 1);
    assert.equal(log[0].status, 'completed');
    assert.equal(log[0].duration_ms, 45000);
  });

  it('OH-04: writes provider field to phase state', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'codex');

    callbacks.onPhaseComplete('06-implementation', { status: 'completed' });

    assert.equal(sw.getState().phases['06-implementation'].provider, 'codex');
  });

  it('OH-05: appends to artifacts_produced if result contains file paths', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    callbacks.onPhaseComplete('06-implementation', {
      status: 'completed',
      files: ['src/core/observability/state-tracking.js', 'src/dashboard/server.js']
    });

    const artifacts = sw.getState().active_workflow.artifacts_produced;
    assert.ok(Array.isArray(artifacts));
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts[0].file_path, 'src/core/observability/state-tracking.js');
    assert.equal(artifacts[1].file_path, 'src/dashboard/server.js');
  });

  it('OH-10: handles null tokens_used without error', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'codex');

    callbacks.onPhaseComplete('06-implementation', {
      status: 'completed',
      tokens_used: null
    });

    const log = sw.getState().active_workflow.sub_agent_log;
    assert.equal(log[0].tokens_used, null);
  });
});

// ---------------------------------------------------------------------------
// OH-06, OH-07: onError
// ---------------------------------------------------------------------------

describe('onError', () => {
  it('OH-06: appends hook_events entry with action blocked', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    callbacks.onError('06-implementation', 'test coverage below 80%');

    const events = sw.getState().active_workflow.hook_events;
    assert.ok(Array.isArray(events));
    assert.equal(events.length, 1);
    assert.equal(events[0].action, 'blocked');
    assert.equal(events[0].reason, 'test coverage below 80%');
    assert.equal(events[0].phase, '06-implementation');
  });

  it('OH-07: appends sub_agent_log entry with status failed', () => {
    const sw = createMockStateWriter();
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    callbacks.onError('06-implementation', 'test failure');

    const log = sw.getState().active_workflow.sub_agent_log;
    const failedEntry = log.find(e => e.status === 'failed');
    assert.ok(failedEntry);
    assert.equal(failedEntry.phase, '06-implementation');
  });
});

// ---------------------------------------------------------------------------
// OH-09: stateWriter injection
// ---------------------------------------------------------------------------

describe('stateWriter injection', () => {
  it('OH-09: callbacks use provided stateWriter, not direct file I/O', () => {
    let writeCount = 0;
    const sw = {
      readState() {
        return {
          active_workflow: { type: 'feature' },
          phases: {}
        };
      },
      writeState() { writeCount++; }
    };

    const callbacks = createObservabilityCallbacks(sw, 'claude');
    callbacks.onPhaseStart('01-requirements');
    callbacks.onPhaseComplete('01-requirements', { status: 'completed' });
    callbacks.onError('01-requirements', 'test');

    assert.equal(writeCount, 3);
  });
});

// ---------------------------------------------------------------------------
// OH-11: custom workflow support
// ---------------------------------------------------------------------------

describe('custom workflow support', () => {
  it('OH-11: callbacks work with arbitrary phase keys', () => {
    const sw = createMockStateWriter({
      active_workflow: { type: 'custom-workflow' },
      phases: { 'custom-linting': { status: 'in_progress' } }
    });
    const callbacks = createObservabilityCallbacks(sw, 'claude');

    callbacks.onPhaseStart('custom-linting');
    callbacks.onPhaseComplete('custom-linting', { status: 'completed', duration_ms: 5000 });

    const log = sw.getState().active_workflow.sub_agent_log;
    assert.equal(log.length, 2);
    assert.equal(log[0].phase, 'custom-linting');
    assert.equal(log[1].phase, 'custom-linting');
    assert.equal(log[1].status, 'completed');
  });
});
