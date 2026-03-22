/**
 * Unit tests for src/core/orchestration/analyze.js
 *
 * Tests the provider-neutral analyze orchestrator: bug/feature classification,
 * roundtable conversation loop, confirmation FSM, and finalization chain.
 *
 * Requirements: REQ-0133 FR-001..FR-006
 * Test ID prefix: AZ- (Analyze)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createMockRuntime, createInteractiveRuntime } from './helpers/mock-runtime.js';
import { runAnalyze } from '../../../src/core/orchestration/analyze.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBugItem() {
  return {
    slug: 'BUG-0001-login-crash',
    description: 'Login page is broken and crashes with 500 error',
    flags: {},
    meta: { analysis_status: 'pending' }
  };
}

function makeFeatureItem() {
  return {
    slug: 'REQ-0100-new-dashboard',
    description: 'Add a new dashboard with analytics widgets',
    flags: {},
    meta: { analysis_status: 'pending' }
  };
}

function makeOptions() {
  return {
    projectRoot: '/tmp',
    sizing: 'standard',
    depth: 'standard'
  };
}

// ---------------------------------------------------------------------------
// FR-001: Analyze Execution
// ---------------------------------------------------------------------------

describe('FR-001: Analyze execution', () => {
  it('AZ-01: returns result with classification and artifacts', async () => {
    // Feature item goes through roundtable + confirmation
    const responses = [
      // Roundtable responses (topic coverage)
      'Here are the requirements for the dashboard...',
      'The architecture should use React components...',
      'Design uses card-based layout...',
      '__TOPICS_COMPLETE__',
      // Confirmation responses
      'accept',  // requirements
      'accept',  // architecture
      'accept'   // design
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    assert.ok(result, 'Should return a result');
    assert.ok(result.classification, 'Should have classification');
    assert.ok(result.confirmation_record, 'Should have confirmation record');
  });

  it('AZ-02: bug item completes with single interactive pass', async () => {
    const runtime = createInteractiveRuntime([
      'The bug occurs when users click login with empty password'
    ]);
    const result = await runAnalyze(runtime, makeBugItem(), makeOptions());

    assert.equal(result.classification, 'bug');
    assert.ok(runtime.calls.presentInteractive.length >= 1);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Entry Routing
// ---------------------------------------------------------------------------

describe('FR-002: Entry routing', () => {
  it('AZ-03: routes feature items to roundtable flow', async () => {
    const responses = [
      'requirements details...', 'architecture...', 'design...',
      '__TOPICS_COMPLETE__', 'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    assert.equal(result.classification, 'feature');
  });

  it('AZ-04: routes bug items to bug-gather flow', async () => {
    const runtime = createInteractiveRuntime(['bug details gathered']);
    const result = await runAnalyze(runtime, makeBugItem(), makeOptions());

    assert.equal(result.classification, 'bug');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Bug Classification
// ---------------------------------------------------------------------------

describe('FR-003: Bug classification', () => {
  it('AZ-05: classifies items with bug signals as bug', async () => {
    const runtime = createInteractiveRuntime(['bug details']);
    const bugItem = {
      slug: 'BUG-0002',
      description: 'Fix the broken authentication — error 500 on login',
      flags: {},
      meta: {}
    };
    const result = await runAnalyze(runtime, bugItem, makeOptions());

    assert.equal(result.classification, 'bug');
  });

  it('AZ-06: classifies items with feature signals as feature', async () => {
    const responses = [
      'req...', 'arch...', 'design...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const featureItem = {
      slug: 'REQ-0200',
      description: 'Create a new reporting module with charts and exports',
      flags: {},
      meta: {}
    };
    const result = await runAnalyze(runtime, featureItem, makeOptions());

    assert.equal(result.classification, 'feature');
  });

  it('AZ-07: ambiguous items default to feature', async () => {
    const responses = [
      'req...', 'arch...', 'design...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const ambiguousItem = {
      slug: 'REQ-0300',
      description: 'Update the user settings page',
      flags: {},
      meta: {}
    };
    const result = await runAnalyze(runtime, ambiguousItem, makeOptions());

    assert.equal(result.classification, 'feature');
  });
});

// ---------------------------------------------------------------------------
// FR-004: Roundtable Conversation
// ---------------------------------------------------------------------------

describe('FR-004: Roundtable conversation', () => {
  it('AZ-08: loops until topics are complete', async () => {
    const responses = [
      'first topic covered',
      'second topic covered',
      'third topic covered',
      '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    // Should have called presentInteractive multiple times for roundtable
    assert.ok(runtime.calls.presentInteractive.length >= 4,
      'Should loop through roundtable until topics complete');
  });

  it('AZ-09: tracks conversation history', async () => {
    const responses = [
      'topic 1', 'topic 2', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    assert.ok(result.conversation_history, 'Should have conversation history');
    assert.ok(result.conversation_history.length > 0, 'History should not be empty');
  });

  it('AZ-10: enforces max roundtable turns to prevent infinite loops', async () => {
    // Runtime that never returns __TOPICS_COMPLETE__
    let callCount = 0;
    const runtime = createMockRuntime({
      presentInteractive: async () => {
        callCount++;
        return 'still going...';
      }
    });
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    // Should terminate after max turns (not infinite)
    assert.ok(callCount <= 50, 'Should stop after max roundtable turns');
  });
});

// ---------------------------------------------------------------------------
// FR-005: Confirmation State Machine
// ---------------------------------------------------------------------------

describe('FR-005: Confirmation state machine', () => {
  it('AZ-11: presents confirmations sequentially: requirements -> architecture -> design', async () => {
    const prompts = [];
    let responseIndex = 0;
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createMockRuntime({
      presentInteractive: async (prompt) => {
        prompts.push(prompt);
        if (responseIndex < responses.length) {
          return responses[responseIndex++];
        }
        return 'accept';
      }
    });
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    // The confirmation prompts should include domain references
    assert.ok(result.confirmation_record, 'Should have confirmation record');
    const domains = result.confirmation_record.map(r => r.domain);
    assert.ok(domains.includes('requirements'));
    assert.ok(domains.includes('architecture'));
    assert.ok(domains.includes('design'));
  });

  it('AZ-12: accept advances to next domain', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    assert.equal(result.confirmation_record.length, 3);
    assert.ok(result.confirmation_record.every(r => r.outcome === 'accept'));
  });

  it('AZ-13: amend loops back to same domain', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'amend',     // amend requirements
      'revised requirements...',
      'accept',    // now accept requirements
      'accept',    // accept architecture
      'accept'     // accept design
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    // Should have at least one amend in history
    const reqRecords = result.confirmation_record.filter(r => r.domain === 'requirements');
    assert.ok(reqRecords.length >= 1, 'Should have requirements confirmation');
    // Final result should show all accepted
    const finalOutcomes = ['requirements', 'architecture', 'design'].map(d => {
      const recs = result.confirmation_record.filter(r => r.domain === d && r.outcome === 'accept');
      return recs.length > 0;
    });
    assert.ok(finalOutcomes.every(Boolean), 'All domains should be accepted eventually');
  });

  it('AZ-14: multiple amends on same domain handled correctly', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'amend', 'revision 1...',
      'amend', 'revision 2...',
      'accept',
      'accept',
      'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    // Should complete without error despite multiple amends
    assert.ok(result.confirmation_record.length >= 3);
  });
});

// ---------------------------------------------------------------------------
// FR-006: Finalization
// ---------------------------------------------------------------------------

describe('FR-006: Finalization', () => {
  it('AZ-15: finalization chain executes after all confirmations', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    assert.ok(result.finalization_status, 'Should have finalization status');
    assert.equal(result.finalization_status.completed, true);
  });

  it('AZ-16: finalization steps are tracked', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), makeOptions());

    assert.ok(result.finalization_status.steps, 'Should track finalization steps');
    assert.ok(result.finalization_status.steps.length > 0);
  });

  it('AZ-17: bug items also go through finalization', async () => {
    const runtime = createInteractiveRuntime(['bug details gathered']);
    const result = await runAnalyze(runtime, makeBugItem(), makeOptions());

    assert.ok(result.finalization_status, 'Bug items should also finalize');
    assert.equal(result.finalization_status.completed, true);
  });
});

// ---------------------------------------------------------------------------
// Edge Cases
// ---------------------------------------------------------------------------

describe('Analyze edge cases', () => {
  it('AZ-18: item with no description defaults to feature', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'accept', 'accept', 'accept'
    ];
    const runtime = createInteractiveRuntime(responses);
    const item = { slug: 'REQ-0400', description: '', flags: {}, meta: {} };
    const result = await runAnalyze(runtime, item, makeOptions());

    assert.equal(result.classification, 'feature');
  });

  it('AZ-19: options with trivial sizing shortcuts confirmation', async () => {
    const responses = [
      'req...', '__TOPICS_COMPLETE__',
      'accept' // trivial tier only needs one accept (FINALIZING directly)
    ];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeFeatureItem(), {
      ...makeOptions(),
      sizing: 'trivial'
    });

    assert.ok(result, 'Should complete with trivial sizing');
  });

  it('AZ-20: returns meta in result', async () => {
    const responses = ['bug details'];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeBugItem(), makeOptions());

    assert.ok(result.meta, 'Should include meta in result');
  });

  it('AZ-21: confirmation_record is always an array', async () => {
    const responses = ['bug details'];
    const runtime = createInteractiveRuntime(responses);
    const result = await runAnalyze(runtime, makeBugItem(), makeOptions());

    assert.ok(Array.isArray(result.confirmation_record));
  });
});
