/**
 * E2E tests for /isdlc status command
 * REQ-0068: Status command with -inline and -visual modes
 * Test ID prefix: SC-
 *
 * These tests validate the end-to-end flow: resolve identifier -> format -> output.
 * They test the CLI formatter and identifier resolution without invoking the full
 * isdlc command handler (which requires Claude agent delegation).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatWorkflowTrace, formatWorkflowSummary } from '../../src/core/observability/cli-formatter.js';

// ---------------------------------------------------------------------------
// Fixtures (simulating workflow_history entries)
// ---------------------------------------------------------------------------

function makeWorkflowHistory() {
  return [
    {
      slug: 'REQ-0064-search-indexing',
      source_id: 'GH-120',
      type: 'feature',
      status: 'completed',
      phase_snapshots: [
        { phase: '06-implementation', status: 'complete', wall_clock_minutes: 20, iterations_used: 2, provider: 'claude' }
      ]
    },
    {
      slug: 'REQ-0066-team-continuity-memory',
      source_id: 'GH-125',
      type: 'feature',
      status: 'completed',
      phase_snapshots: [
        { phase: '05-test-strategy', status: 'complete', wall_clock_minutes: 9, iterations_used: 1, provider: 'claude' },
        { phase: '06-implementation', status: 'complete', wall_clock_minutes: 28, iterations_used: 3, coverage_percent: 91.35, provider: 'codex' },
        { phase: '16-quality-loop', status: 'complete', wall_clock_minutes: 8, iterations_used: 1, provider: 'claude' },
        { phase: '08-code-review', status: 'complete', wall_clock_minutes: 4, iterations_used: 1, provider: 'claude' }
      ],
      sub_agent_log: [
        { agent: 'software-developer', phase: '06-implementation', duration_ms: 1440000, status: 'completed', provider: 'codex' }
      ],
      hook_events: [
        { hook: 'gate-blocker', action: 'blocked', phase: '06-implementation', reason: 'test coverage below 80%', resolution: 'fixed' }
      ],
      artifacts_produced: [
        { file_path: 'lib/memory.js', action: 'created' }
      ]
    },
    {
      slug: 'BUG-0055-fix-state-corruption',
      source_id: 'GH-130',
      type: 'fix',
      status: 'completed',
      phase_snapshots: [
        { phase: '06-implementation', status: 'complete', wall_clock_minutes: 12, iterations_used: 1, provider: 'claude' }
      ]
    }
  ];
}

// Simulate resolveItem: match by slug, source_id, or "last"
function resolveWorkflow(history, identifier) {
  if (identifier === 'last') {
    return history.length > 0 ? history[history.length - 1] : null;
  }
  return history.find(w =>
    w.slug === identifier ||
    w.source_id === identifier ||
    w.artifact_folder === identifier
  ) || null;
}

// ---------------------------------------------------------------------------
// SC-01: Resolve GitHub issue ID to workflow
// ---------------------------------------------------------------------------

describe('status -inline resolution', () => {
  it('SC-01: resolves GitHub issue ID to workflow', () => {
    const history = makeWorkflowHistory();
    const workflow = resolveWorkflow(history, 'GH-125');

    assert.ok(workflow);
    assert.equal(workflow.slug, 'REQ-0066-team-continuity-memory');

    const trace = formatWorkflowTrace(workflow);
    assert.ok(trace.includes('REQ-0066-team-continuity-memory'));
    assert.ok(trace.includes('feature'));
    assert.ok(trace.includes('Phase Timeline:'));
    assert.ok(trace.includes('[codex]'));
  });
});

// ---------------------------------------------------------------------------
// SC-02: Resolve "last" to most recent workflow
// ---------------------------------------------------------------------------

describe('status -inline last', () => {
  it('SC-02: returns most recent workflow', () => {
    const history = makeWorkflowHistory();
    const workflow = resolveWorkflow(history, 'last');

    assert.ok(workflow);
    assert.equal(workflow.slug, 'BUG-0055-fix-state-corruption');
    assert.equal(workflow.type, 'fix');

    const trace = formatWorkflowTrace(workflow);
    assert.ok(trace.includes('BUG-0055'));
    assert.ok(trace.includes('(fix)'));
  });
});

// ---------------------------------------------------------------------------
// SC-03: No matching workflow
// ---------------------------------------------------------------------------

describe('status with no match', () => {
  it('SC-03: displays no-match when identifier not found', () => {
    const history = makeWorkflowHistory();
    const workflow = resolveWorkflow(history, 'REQ-9999-nonexistent');

    assert.equal(workflow, null);

    // When no match, the status handler should show the summary instead
    const summary = formatWorkflowSummary(history, { max_entries: 5 });
    assert.ok(summary.includes('Recent Workflows:'));
    assert.ok(summary.includes('REQ-0066'));
    assert.ok(summary.includes('BUG-0055'));
  });
});
