/**
 * Unit tests for parallel-run comparison harness (REQ-GH-253, T039)
 *
 * Verifies the harness that runs prose protocol alongside state-machine
 * mechanism and compares outputs for convergence.
 *
 * Traces to: FR-008, AC-008-01, AC-008-02
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  compareOutputs,
  detectDivergence,
  logDiagnostics,
  compareRun,
} from '../../../../tests/parallel-run/harness.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONVERGED_PAIR = {
  prose_output: {
    state: 'PRESENTING_REQUIREMENTS',
    personas_active: ['Maya', 'Alex', 'Jordan'],
    rendering_mode: 'bulleted_by_domain',
    template_used: 'requirements.template.json',
  },
  mechanism_output: {
    state: 'PRESENTING_REQUIREMENTS',
    personas_active: ['Maya', 'Alex', 'Jordan'],
    rendering_mode: 'bulleted_by_domain',
    template_used: 'requirements.template.json',
  },
};

const DIVERGED_PAIR = {
  prose_output: {
    state: 'PRESENTING_REQUIREMENTS',
    rendering_mode: 'prose_paragraphs', // drifted
  },
  mechanism_output: {
    state: 'PRESENTING_REQUIREMENTS',
    rendering_mode: 'bulleted_by_domain',
  },
};

const MECHANISM_FAILURE = {
  prose_output: {
    state: 'PRESENTING_REQUIREMENTS',
    rendering_mode: 'bulleted_by_domain',
  },
  mechanism_output: null, // mechanism failed
};

// ---------------------------------------------------------------------------
// PR-01: Detect convergence (positive, AC-008-01)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 parallel-run harness — compareOutputs', () => {
  it('PR-01: reports convergence when prose and mechanism outputs match', () => {
    const result = compareOutputs(
      CONVERGED_PAIR.prose_output,
      CONVERGED_PAIR.mechanism_output,
    );
    assert.strictEqual(result.converged, true);
    assert.deepStrictEqual(result.divergences, []);
  });

  it('PR-02: detects divergence and produces diagnostic fields', () => {
    const result = compareOutputs(
      DIVERGED_PAIR.prose_output,
      DIVERGED_PAIR.mechanism_output,
    );
    assert.strictEqual(result.converged, false);
    assert.ok(result.divergences.some(d => d.field === 'rendering_mode'));
  });

  it('PR-03: reports fallback when mechanism output is null', () => {
    const result = compareOutputs(
      MECHANISM_FAILURE.prose_output,
      MECHANISM_FAILURE.mechanism_output,
    );
    assert.strictEqual(result.converged, false);
    assert.strictEqual(result.fallback, true);
    assert.strictEqual(result.fallback_to, 'prose');
  });

  it('PR-04: reports fallback when prose output is null', () => {
    const result = compareOutputs(null, { state: 'CONVERSATION' });
    assert.strictEqual(result.fallback, true);
    assert.strictEqual(result.fallback_to, 'mechanism');
  });

  it('PR-05: handles both outputs null', () => {
    const result = compareOutputs(null, null);
    assert.strictEqual(result.converged, false);
    assert.strictEqual(result.fallback, true);
  });

  it('PR-06: divergence entry includes field, prose, and mechanism values', () => {
    const result = compareOutputs(
      { state: 'A', rendering_mode: 'prose' },
      { state: 'A', rendering_mode: 'bulleted' },
    );
    const div = result.divergences.find(d => d.field === 'rendering_mode');
    assert.ok(div);
    assert.strictEqual(div.prose, 'prose');
    assert.strictEqual(div.mechanism, 'bulleted');
  });

  it('PR-07: treats matching arrays as converged', () => {
    const result = compareOutputs(
      { personas_active: ['Maya', 'Alex'] },
      { personas_active: ['Maya', 'Alex'] },
    );
    assert.strictEqual(result.converged, true);
  });

  it('PR-08: detects array order divergence', () => {
    const result = compareOutputs(
      { personas_active: ['Maya', 'Alex'] },
      { personas_active: ['Alex', 'Maya'] },
    );
    assert.strictEqual(result.converged, false);
  });
});

// ---------------------------------------------------------------------------
// PR-10..PR-14: detectDivergence multi-turn
// ---------------------------------------------------------------------------

describe('REQ-GH-253 parallel-run harness — detectDivergence', () => {
  it('PR-10: returns correct counts for all-converged turns', () => {
    const pairs = [
      { prose: { state: 'A' }, mechanism: { state: 'A' } },
      { prose: { state: 'B' }, mechanism: { state: 'B' } },
    ];
    const result = detectDivergence(pairs);
    assert.strictEqual(result.totalTurns, 2);
    assert.strictEqual(result.convergedTurns, 2);
    assert.strictEqual(result.divergedTurns, 0);
  });

  it('PR-11: returns correct counts for mixed turns', () => {
    const pairs = [
      { prose: { state: 'A' }, mechanism: { state: 'A' } },
      { prose: { state: 'B' }, mechanism: { state: 'C' } },
    ];
    const result = detectDivergence(pairs);
    assert.strictEqual(result.totalTurns, 2);
    assert.strictEqual(result.convergedTurns, 1);
    assert.strictEqual(result.divergedTurns, 1);
  });

  it('PR-12: handles empty input', () => {
    const result = detectDivergence([]);
    assert.strictEqual(result.totalTurns, 0);
  });

  it('PR-13: handles null input', () => {
    const result = detectDivergence(null);
    assert.strictEqual(result.totalTurns, 0);
  });

  it('PR-14: perTurn array matches input length', () => {
    const pairs = [
      { prose: { state: 'A' }, mechanism: { state: 'A' } },
      { prose: { state: 'B' }, mechanism: { state: 'B' } },
      { prose: { state: 'C' }, mechanism: { state: 'D' } },
    ];
    const result = detectDivergence(pairs);
    assert.strictEqual(result.perTurn.length, 3);
    assert.strictEqual(result.perTurn[0].turn, 0);
    assert.strictEqual(result.perTurn[2].turn, 2);
  });
});

// ---------------------------------------------------------------------------
// PR-20..PR-23: logDiagnostics
// ---------------------------------------------------------------------------

describe('REQ-GH-253 parallel-run harness — logDiagnostics', () => {
  it('PR-20: produces CONVERGED log for matching outputs', () => {
    const comparison = compareOutputs(
      CONVERGED_PAIR.prose_output,
      CONVERGED_PAIR.mechanism_output,
    );
    const log = logDiagnostics(comparison);
    assert.ok(log.includes('CONVERGED'));
  });

  it('PR-21: produces DIVERGED log with field names', () => {
    const comparison = compareOutputs(
      DIVERGED_PAIR.prose_output,
      DIVERGED_PAIR.mechanism_output,
    );
    const log = logDiagnostics(comparison);
    assert.ok(log.includes('DIVERGED'));
    assert.ok(log.includes('rendering_mode'));
  });

  it('PR-22: includes FALLBACK marker when mechanism is null', () => {
    const comparison = compareOutputs(
      MECHANISM_FAILURE.prose_output,
      MECHANISM_FAILURE.mechanism_output,
    );
    const log = logDiagnostics(comparison);
    assert.ok(log.includes('FALLBACK'));
    assert.ok(log.includes('prose'));
  });

  it('PR-23: handles null comparison gracefully', () => {
    const log = logDiagnostics(null, 5);
    assert.ok(log.includes('Turn 5'));
  });

  it('PR-24: includes turn index in output', () => {
    const comparison = compareOutputs({ state: 'A' }, { state: 'A' });
    const log = logDiagnostics(comparison, 3);
    assert.ok(log.includes('Turn 3'));
  });
});

// ---------------------------------------------------------------------------
// PR-30..PR-35: compareRun end-to-end
// ---------------------------------------------------------------------------

describe('REQ-GH-253 parallel-run harness — compareRun', () => {
  it('PR-30: returns newPathOutput, oldPathOutput, and divergences', async () => {
    // No bridge provided — mechanism path returns nulls, prose path returns fixtures
    const result = await compareRun('analyze', [
      { type: 'user', text: 'Hello' },
      { type: 'user', text: 'I want to add feature X' },
    ]);
    assert.ok(Array.isArray(result.newPathOutput));
    assert.ok(Array.isArray(result.oldPathOutput));
    assert.ok(result.divergences);
    assert.strictEqual(result.oldPathOutput.length, 2);
    assert.strictEqual(result.newPathOutput.length, 2);
  });

  it('PR-31: without bridge, mechanism output is all null (triggers fallback)', async () => {
    const result = await compareRun('analyze', [{ type: 'user', text: 'test' }]);
    assert.strictEqual(result.newPathOutput[0], null);
    assert.strictEqual(result.divergences.divergedTurns, 1);
  });

  it('PR-32: with mock bridge, produces mechanism outputs', async () => {
    const mockBridge = {
      async initializeRoundtable() {
        return {
          definition: { states: {} },
          machine: {
            getCurrentState: () => 'CONVERSATION',
            getActiveSubTask: () => 'SCOPE_FRAMING',
            currentSubTask: () => ({ id: 'SCOPE_FRAMING' }),
            evaluateTransitions: () => ({ transitioned: false }),
          },
          rollingState: { sub_task_completion: {} },
        };
      },
      async composeForTurn(machine) {
        return {
          composedCard: 'mock-card',
          stateCard: 'mock-state-card',
          taskCard: null,
          currentState: machine.getCurrentState(),
          activeSubTask: machine.getActiveSubTask(),
        };
      },
      async processAfterTurn(_m, rs) {
        return { updatedState: rs, transition: null, cleanOutput: '', trailer: null, markers: {} };
      },
    };

    const result = await compareRun(
      'analyze',
      [{ type: 'user', text: 'test' }],
      {
        bridge: mockBridge,
        stateProgression: ['CONVERSATION'],
      },
    );

    assert.ok(result.newPathOutput[0] !== null, 'mechanism should produce output');
    assert.strictEqual(result.newPathOutput[0].state, 'CONVERSATION');
    assert.strictEqual(result.newPathOutput[0].sub_task, 'SCOPE_FRAMING');
  });

  it('PR-33: handles invalid inputs gracefully', async () => {
    const result = await compareRun(null, null);
    assert.deepStrictEqual(result.newPathOutput, []);
    assert.deepStrictEqual(result.oldPathOutput, []);
  });

  it('PR-34: handles empty conversation inputs', async () => {
    const result = await compareRun('analyze', []);
    assert.strictEqual(result.divergences.totalTurns, 0);
  });

  it('PR-35: prose path uses custom stateProgression when provided', async () => {
    const result = await compareRun(
      'analyze',
      [{ type: 'user', text: 'a' }, { type: 'user', text: 'b' }],
      { stateProgression: ['PRESENTING_REQUIREMENTS', 'FINALIZING'] },
    );
    assert.strictEqual(result.oldPathOutput[0].state, 'PRESENTING_REQUIREMENTS');
    assert.strictEqual(result.oldPathOutput[1].state, 'FINALIZING');
  });

  it('PR-36: prose path uses custom proseMarkers when provided', async () => {
    const result = await compareRun(
      'analyze',
      [{ type: 'user', text: 'a' }],
      {
        stateProgression: ['PRESENTING_REQUIREMENTS'],
        proseMarkers: {
          PRESENTING_REQUIREMENTS: {
            rendering_mode: 'custom_mode',
            template_used: 'custom.template.json',
          },
        },
      },
    );
    assert.strictEqual(result.oldPathOutput[0].rendering_mode, 'custom_mode');
    assert.strictEqual(result.oldPathOutput[0].template_used, 'custom.template.json');
  });

  it('PR-37: divergences object has expected shape', async () => {
    const result = await compareRun('analyze', [{ type: 'user', text: 'a' }]);
    assert.ok('totalTurns' in result.divergences);
    assert.ok('convergedTurns' in result.divergences);
    assert.ok('divergedTurns' in result.divergences);
    assert.ok('perTurn' in result.divergences);
  });
});
