/**
 * Tests for src/core/observability/cli-formatter.js
 * REQ-0068: CLI formatter for execution observability
 * Test ID prefix: CF-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatPhaseCompletion,
  formatWorkflowTrace,
  formatWorkflowSummary,
  parseObservabilityConfig
} from '../../../src/core/observability/cli-formatter.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePhaseState(overrides = {}) {
  return {
    phase: '06-implementation',
    timing: { wall_clock_minutes: 28, retries: 2 },
    coverage_percent: 91,
    provider: 'claude',
    ...overrides
  };
}

function makeWorkflowEntry(overrides = {}) {
  return {
    type: 'feature',
    slug: 'REQ-0066-team-continuity-memory',
    status: 'completed',
    git_branch: { name: 'feature/REQ-0066-team-continuity-memory' },
    phase_snapshots: [
      { phase: '05-test-strategy', status: 'complete', wall_clock_minutes: 9, iterations_used: 1, provider: 'claude' },
      { phase: '06-implementation', status: 'complete', wall_clock_minutes: 28, iterations_used: 3, coverage_percent: 91.35, provider: 'codex' },
      { phase: '16-quality-loop', status: 'complete', wall_clock_minutes: 8, iterations_used: 1, summary: 'all passing', provider: 'claude' },
      { phase: '08-code-review', status: 'complete', wall_clock_minutes: 4, iterations_used: 1, summary: 'APPROVED', provider: 'claude' }
    ],
    sub_agent_log: [
      { agent: 'software-developer', phase: '06-implementation', duration_ms: 1440000, status: 'completed', provider: 'codex' },
      { agent: 'implementation-reviewer', phase: '06-implementation', duration_ms: 120000, status: 'completed', provider: 'codex' }
    ],
    hook_events: [
      { hook: 'gate-blocker', action: 'blocked', phase: '06-implementation', reason: 'test coverage below 80%', resolution: 'fixed' }
    ],
    artifacts_produced: [
      { file_path: 'lib/memory.js', action: 'created' },
      { file_path: 'tests/lib/memory.test.js', action: 'created' }
    ],
    ...overrides
  };
}

function makeLegacyWorkflowEntry() {
  return {
    type: 'feature',
    slug: 'REQ-0050-legacy-feature',
    status: 'completed',
    phase_snapshots: [
      { phase: '06-implementation', status: 'complete', wall_clock_minutes: 15, iterations_used: 1 }
    ]
    // No sub_agent_log, hook_events, artifacts_produced, or provider fields
  };
}

// ---------------------------------------------------------------------------
// CF-01 through CF-07: formatPhaseCompletion
// ---------------------------------------------------------------------------

describe('formatPhaseCompletion', () => {
  it('CF-01: standard level includes phase name, duration, iterations', () => {
    const result = formatPhaseCompletion(makePhaseState(), { display_level: 'standard' });
    assert.ok(result.includes('06-implementation'));
    assert.ok(result.includes('28m'));
    assert.ok(result.includes('3 iter'));
  });

  it('CF-02: detailed level includes sub-agents, hook events, artifacts, provider', () => {
    const phaseState = makePhaseState({
      sub_agents: [{ agent: 'software-developer', duration_ms: 1440000, status: 'completed', provider: 'codex' }],
      hook_events: [{ hook: 'gate-blocker', action: 'blocked', phase: '06', reason: 'coverage' }],
      artifacts: [{ file_path: 'src/test.js', action: 'created' }]
    });
    const result = formatPhaseCompletion(phaseState, { display_level: 'detailed' });
    assert.ok(result.includes('[claude]'));
    assert.ok(result.includes('Sub-agents:'));
    assert.ok(result.includes('software-developer'));
    assert.ok(result.includes('Hook events:'));
    assert.ok(result.includes('Artifacts:'));
  });

  it('CF-03: minimal level returns empty string', () => {
    const result = formatPhaseCompletion(makePhaseState(), { display_level: 'minimal' });
    assert.equal(result, '');
  });

  it('CF-07: output identical regardless of provider value', () => {
    const claudeResult = formatPhaseCompletion(
      makePhaseState({ provider: 'claude' }), { display_level: 'standard' }
    );
    const codexResult = formatPhaseCompletion(
      makePhaseState({ provider: 'codex' }), { display_level: 'standard' }
    );
    // Standard level does not include provider, so output should be identical
    assert.equal(claudeResult, codexResult);
  });
});

// ---------------------------------------------------------------------------
// CF-04 through CF-06: parseObservabilityConfig
// ---------------------------------------------------------------------------

describe('parseObservabilityConfig', () => {
  it('CF-04: returns standard defaults when section missing', () => {
    const result = parseObservabilityConfig('# CLAUDE.md\n\nSome content.');
    assert.equal(result.display_level, 'standard');
    assert.equal(result.live_dashboard, false);
  });

  it('CF-05: parses display_level and live_dashboard from content', () => {
    const content = '## Observability\ndisplay_level: detailed\nlive_dashboard: true\n';
    const result = parseObservabilityConfig(content);
    assert.equal(result.display_level, 'detailed');
    assert.equal(result.live_dashboard, true);
  });

  it('CF-06: returns defaults on invalid values', () => {
    const content = '## Observability\ndisplay_level: verbose\nlive_dashboard: maybe\n';
    const result = parseObservabilityConfig(content);
    assert.equal(result.display_level, 'standard'); // invalid -> default
    assert.equal(result.live_dashboard, false); // non-"true" -> false
  });

  it('CF-04b: returns defaults when content is null', () => {
    const result = parseObservabilityConfig(null);
    assert.equal(result.display_level, 'standard');
    assert.equal(result.live_dashboard, false);
  });
});

// ---------------------------------------------------------------------------
// CF-08 through CF-14, CF-16: formatWorkflowTrace
// ---------------------------------------------------------------------------

describe('formatWorkflowTrace', () => {
  it('CF-08: renders phase timeline with timing, iterations, coverage', () => {
    const result = formatWorkflowTrace(makeWorkflowEntry());
    assert.ok(result.includes('Phase Timeline:'));
    assert.ok(result.includes('06-implementation'));
    assert.ok(result.includes('28m'));
    assert.ok(result.includes('3 iter'));
  });

  it('CF-09: renders sub-agent activity section', () => {
    const result = formatWorkflowTrace(makeWorkflowEntry());
    assert.ok(result.includes('Sub-Agent Activity:'));
    assert.ok(result.includes('software-developer'));
    assert.ok(result.includes('implementation-reviewer'));
  });

  it('CF-10: renders hook events section', () => {
    const result = formatWorkflowTrace(makeWorkflowEntry());
    assert.ok(result.includes('Hook Events: 1'));
    assert.ok(result.includes('gate-blocker'));
    assert.ok(result.includes('test coverage below 80%'));
  });

  it('CF-11: renders artifacts produced section', () => {
    const result = formatWorkflowTrace(makeWorkflowEntry());
    assert.ok(result.includes('Artifacts Produced: 2 files'));
    assert.ok(result.includes('lib/memory.js'));
  });

  it('CF-12: shows provider per phase row', () => {
    const result = formatWorkflowTrace(makeWorkflowEntry());
    assert.ok(result.includes('[codex]'));
    assert.ok(result.includes('[claude]'));
  });

  it('CF-13: shows "unknown" for missing provider field', () => {
    const result = formatWorkflowTrace(makeLegacyWorkflowEntry());
    assert.ok(result.includes('[unknown]'));
  });

  it('CF-14: degrades gracefully when sub_agent_log missing', () => {
    const result = formatWorkflowTrace(makeLegacyWorkflowEntry());
    // Should not throw and should not include Sub-Agent Activity
    assert.ok(!result.includes('Sub-Agent Activity:'));
    assert.ok(result.includes('Phase Timeline:'));
  });

  it('CF-16: displays custom workflow type name verbatim', () => {
    const entry = makeWorkflowEntry({ type: 'my-custom-audit' });
    const result = formatWorkflowTrace(entry);
    assert.ok(result.includes('(my-custom-audit)'));
  });
});

// ---------------------------------------------------------------------------
// CF-15: formatWorkflowSummary
// ---------------------------------------------------------------------------

describe('formatWorkflowSummary', () => {
  it('CF-15: renders last N workflows with status, duration, coverage', () => {
    const entries = [
      makeWorkflowEntry(),
      makeLegacyWorkflowEntry()
    ];
    const result = formatWorkflowSummary(entries, { max_entries: 5 });
    assert.ok(result.includes('Recent Workflows:'));
    assert.ok(result.includes('REQ-0066'));
    assert.ok(result.includes('REQ-0050'));
    assert.ok(result.includes('completed'));
  });

  it('CF-15b: returns message when no history', () => {
    const result = formatWorkflowSummary([]);
    assert.ok(result.includes('No workflow history found'));
  });
});
