/**
 * Tests for src/core/observability/state-tracking.js
 * REQ-0068: State tracking extensions for execution observability
 * Test ID prefix: ST-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  appendSubAgentLog,
  appendHookEvent,
  appendArtifactProduced,
  getSubAgentLog,
  getHookEvents,
  getArtifactsProduced
} from '../../../src/core/observability/state-tracking.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeState(overrides = {}) {
  return {
    active_workflow: {
      type: 'feature',
      ...overrides
    }
  };
}

function makeSubAgentEntry(overrides = {}) {
  return {
    parent_agent: 'impact-analysis-orchestrator',
    agent: 'impact-analyzer',
    agent_id: 'task-123',
    phase: '02-impact-analysis',
    started_at: '2026-03-25T01:00:00.000Z',
    completed_at: null,
    status: 'running',
    duration_ms: null,
    tokens_used: null,
    provider: 'claude',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// ST-01 through ST-14: appendSubAgentLog
// ---------------------------------------------------------------------------

describe('appendSubAgentLog', () => {
  it('ST-01: appends entry with all required fields', () => {
    const state = makeState();
    const entry = makeSubAgentEntry();
    const result = appendSubAgentLog(state, entry);

    assert.equal(result.parent_agent, 'impact-analysis-orchestrator');
    assert.equal(result.agent, 'impact-analyzer');
    assert.equal(result.agent_id, 'task-123');
    assert.equal(result.phase, '02-impact-analysis');
    assert.equal(result.started_at, '2026-03-25T01:00:00.000Z');
    assert.equal(result.status, 'running');
    assert.equal(result.provider, 'claude');
    assert.equal(state.active_workflow.sub_agent_log.length, 1);
  });

  it('ST-02: initializes sub_agent_log array when missing', () => {
    const state = makeState();
    assert.equal(state.active_workflow.sub_agent_log, undefined);
    appendSubAgentLog(state, makeSubAgentEntry());
    assert.ok(Array.isArray(state.active_workflow.sub_agent_log));
    assert.equal(state.active_workflow.sub_agent_log.length, 1);
  });

  it('ST-03: appends multiple entries (update pattern)', () => {
    const state = makeState();
    appendSubAgentLog(state, makeSubAgentEntry({ status: 'running' }));
    appendSubAgentLog(state, makeSubAgentEntry({
      status: 'completed',
      completed_at: '2026-03-25T01:01:00.000Z',
      duration_ms: 60000
    }));
    assert.equal(state.active_workflow.sub_agent_log.length, 2);
    assert.equal(state.active_workflow.sub_agent_log[1].status, 'completed');
    assert.equal(state.active_workflow.sub_agent_log[1].duration_ms, 60000);
    assert.equal(state.active_workflow.sub_agent_log[1].completed_at, '2026-03-25T01:01:00.000Z');
  });

  it('ST-04: accepts null tokens_used without error (Codex)', () => {
    const state = makeState();
    const result = appendSubAgentLog(state, makeSubAgentEntry({ tokens_used: null, provider: 'codex' }));
    assert.equal(result.tokens_used, null);
    assert.equal(result.provider, 'codex');
  });

  it('ST-14: includes provider field from argument', () => {
    const state = makeState();
    const result = appendSubAgentLog(state, makeSubAgentEntry({ provider: 'antigravity' }));
    assert.equal(result.provider, 'antigravity');
  });
});

// ---------------------------------------------------------------------------
// ST-05 through ST-07: appendHookEvent
// ---------------------------------------------------------------------------

describe('appendHookEvent', () => {
  it('ST-05: appends entry with timestamp, hook, phase, action, reason', () => {
    const state = makeState();
    const result = appendHookEvent(state, {
      timestamp: '2026-03-25T01:00:00.000Z',
      hook: 'gate-blocker',
      phase: '06-implementation',
      action: 'blocked',
      reason: 'test coverage below 80%'
    });

    assert.equal(result.hook, 'gate-blocker');
    assert.equal(result.phase, '06-implementation');
    assert.equal(result.action, 'blocked');
    assert.equal(result.reason, 'test coverage below 80%');
    assert.equal(state.active_workflow.hook_events.length, 1);
  });

  it('ST-06: initializes hook_events array when missing', () => {
    const state = makeState();
    assert.equal(state.active_workflow.hook_events, undefined);
    appendHookEvent(state, { hook: 'test', phase: '01', action: 'blocked', reason: 'test' });
    assert.ok(Array.isArray(state.active_workflow.hook_events));
  });

  it('ST-07: includes provider field for multi-provider distinction', () => {
    const state = makeState();
    const result = appendHookEvent(state, {
      hook: 'governance-check',
      phase: '06-implementation',
      action: 'blocked',
      reason: 'coverage check failed',
      provider: 'codex'
    });
    assert.equal(result.provider, 'codex');
  });
});

// ---------------------------------------------------------------------------
// ST-08 through ST-09: appendArtifactProduced
// ---------------------------------------------------------------------------

describe('appendArtifactProduced', () => {
  it('ST-08: appends entry with timestamp, phase, file_path, action', () => {
    const state = makeState();
    const result = appendArtifactProduced(state, {
      timestamp: '2026-03-25T01:00:00.000Z',
      phase: '06-implementation',
      file_path: 'src/core/observability/state-tracking.js',
      action: 'created'
    });

    assert.equal(result.phase, '06-implementation');
    assert.equal(result.file_path, 'src/core/observability/state-tracking.js');
    assert.equal(result.action, 'created');
    assert.equal(state.active_workflow.artifacts_produced.length, 1);
  });

  it('ST-09: initializes artifacts_produced array when missing', () => {
    const state = makeState();
    assert.equal(state.active_workflow.artifacts_produced, undefined);
    appendArtifactProduced(state, { phase: '06', file_path: 'test.js', action: 'created' });
    assert.ok(Array.isArray(state.active_workflow.artifacts_produced));
  });
});

// ---------------------------------------------------------------------------
// ST-10 through ST-13: getter functions
// ---------------------------------------------------------------------------

describe('getSubAgentLog', () => {
  it('ST-10: returns empty array when sub_agent_log missing', () => {
    const state = makeState();
    assert.deepEqual(getSubAgentLog(state), []);
  });

  it('ST-11: returns array contents when present', () => {
    const state = makeState({ sub_agent_log: [{ agent: 'test' }] });
    const result = getSubAgentLog(state);
    assert.equal(result.length, 1);
    assert.equal(result[0].agent, 'test');
  });
});

describe('getHookEvents', () => {
  it('ST-12: returns empty array when hook_events missing', () => {
    const state = makeState();
    assert.deepEqual(getHookEvents(state), []);
  });
});

describe('getArtifactsProduced', () => {
  it('ST-13: returns empty array when artifacts_produced missing', () => {
    const state = makeState();
    assert.deepEqual(getArtifactsProduced(state), []);
  });
});
