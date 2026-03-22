/**
 * Tests for src/core/observability/index.js
 * REQ-0092: Core observability module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  logEvent,
  trackMenuInteraction,
  trackWalkthrough,
  checkReviewReminder,
  detectPermissionAsking,
  detectMenuHaltViolation,
  extractPriorityResults,
  checkPriorityViolations
} from '../../../src/core/observability/index.js';

describe('logEvent', () => {
  it('should return a logged entry with timestamp, category, and event', () => {
    const result = logEvent('hook', 'block', { phase: '06-implementation' });
    assert.equal(result.logged, true);
    assert.equal(result.entry.category, 'hook');
    assert.equal(result.entry.event, 'block');
    assert.equal(result.entry.phase, '06-implementation');
    assert.ok(result.entry.timestamp);
  });

  it('should handle empty details', () => {
    const result = logEvent('workflow', 'start');
    assert.equal(result.logged, true);
    assert.equal(result.entry.category, 'workflow');
    assert.equal(result.entry.event, 'start');
  });
});

describe('trackMenuInteraction', () => {
  it('should increment menu_interactions on menu_presented', () => {
    const state = { menu_interactions: 2 };
    const { elicitState } = trackMenuInteraction({ menu_presented: true }, state);
    assert.equal(elicitState.menu_interactions, 3);
  });

  it('should record save selection and mark completed', () => {
    const state = { menu_interactions: 1, selections: [] };
    const { elicitState, outputMessage } = trackMenuInteraction(
      { selection: 'save' }, state
    );
    assert.equal(elicitState.completed, true);
    assert.equal(elicitState.final_selection, 'save');
    assert.ok(outputMessage.includes('COMPLETED'));
  });

  it('should record exit selection', () => {
    const state = { menu_interactions: 1, selections: [] };
    const { elicitState } = trackMenuInteraction(
      { selection: 'exit' }, state
    );
    assert.equal(elicitState.completed, true);
    assert.equal(elicitState.final_selection, 'exit');
  });

  it('should return unchanged state on null activity', () => {
    const state = { menu_interactions: 5 };
    const { elicitState } = trackMenuInteraction(null, state);
    assert.equal(elicitState.menu_interactions, 5);
  });

  it('should track step completion without duplicates', () => {
    const state = { steps_completed: ['step1'] };
    const activity = { step_completed: { name: 'step1', step: 1 } };
    const { elicitState } = trackMenuInteraction(activity, state);
    assert.equal(elicitState.steps_completed.length, 1);
  });
});

describe('trackWalkthrough', () => {
  it('should not warn when walkthrough is completed', () => {
    const state = { discovery_context: { walkthrough_completed: true } };
    const { shouldWarn } = trackWalkthrough(state);
    assert.equal(shouldWarn, false);
  });

  it('should warn when walkthrough is not completed', () => {
    const state = { discovery_context: { walkthrough_completed: false } };
    const { shouldWarn, message } = trackWalkthrough(state);
    assert.equal(shouldWarn, true);
    assert.ok(message.includes('walkthrough'));
  });

  it('should not warn when no state', () => {
    const { shouldWarn } = trackWalkthrough(null);
    assert.equal(shouldWarn, false);
  });
});

describe('checkReviewReminder', () => {
  it('should remind when review disabled and team > 1', () => {
    const state = { code_review: { enabled: false, team_size: 3 } };
    const { shouldRemind } = checkReviewReminder(state);
    assert.equal(shouldRemind, true);
  });

  it('should not remind when review enabled', () => {
    const state = { code_review: { enabled: true, team_size: 3 } };
    const { shouldRemind } = checkReviewReminder(state);
    assert.equal(shouldRemind, false);
  });

  it('should not remind when team is 1', () => {
    const state = { code_review: { enabled: false, team_size: 1 } };
    const { shouldRemind } = checkReviewReminder(state);
    assert.equal(shouldRemind, false);
  });
});

describe('detectPermissionAsking', () => {
  it('should detect "would you like to proceed"', () => {
    const { found } = detectPermissionAsking('Would you like to proceed?');
    assert.equal(found, true);
  });

  it('should not detect normal text', () => {
    const { found } = detectPermissionAsking('Running tests now');
    assert.equal(found, false);
  });

  it('should handle null input', () => {
    const { found } = detectPermissionAsking(null);
    assert.equal(found, false);
  });
});

describe('detectMenuHaltViolation', () => {
  it('should detect violation when significant text follows ARC menu', () => {
    const menu = '[A] Adjust\n[R] Refine\n[C] Continue with defaults\n';
    const extraText = 'x'.repeat(300);
    const { violation, menuType } = detectMenuHaltViolation(menu + extraText);
    assert.equal(violation, true);
    assert.equal(menuType, 'arc-menu');
  });

  it('should not flag short text after menu', () => {
    const menu = '[A] Adjust\n[R] Refine\n[C] Continue\nOK';
    const { violation } = detectMenuHaltViolation(menu);
    assert.equal(violation, false);
  });

  it('should handle null input', () => {
    const { violation } = detectMenuHaltViolation(null);
    assert.equal(violation, false);
  });
});

describe('extractPriorityResults', () => {
  it('should extract P0 pass counts', () => {
    const output = '[P0] test1 pass\n[P0] test2 pass\n[P1] test3 fail';
    const results = extractPriorityResults(output);
    assert.equal(results.p0Pass, 2);
    assert.equal(results.p1Fail, 1);
  });

  it('should return zeros for empty output', () => {
    const results = extractPriorityResults('');
    assert.equal(results.p0Pass, 0);
    assert.equal(results.p1Pass, 0);
  });
});

describe('checkPriorityViolations', () => {
  it('should detect P1 running while P0 failing', () => {
    const results = { p0Pass: 1, p0Fail: 1, p0Skip: 0, p1Pass: 1, p1Fail: 0, p1Skip: 0, p2Pass: 0, p2Fail: 0, p2Skip: 0, p3Pass: 0, p3Fail: 0, p3Skip: 0 };
    const violations = checkPriorityViolations(results);
    assert.ok(violations.length > 0);
    assert.ok(violations[0].includes('P1'));
  });

  it('should detect orphaned P0 skips', () => {
    const results = { p0Pass: 1, p0Fail: 0, p0Skip: 2, p1Pass: 0, p1Fail: 0, p1Skip: 0, p2Pass: 0, p2Fail: 0, p2Skip: 0, p3Pass: 0, p3Fail: 0, p3Skip: 0 };
    const violations = checkPriorityViolations(results);
    assert.ok(violations.some(v => v.includes('P0') && v.includes('skipped')));
  });

  it('should return empty when no violations', () => {
    const results = { p0Pass: 3, p0Fail: 0, p0Skip: 0, p1Pass: 2, p1Fail: 0, p1Skip: 0, p2Pass: 0, p2Fail: 0, p2Skip: 0, p3Pass: 0, p3Fail: 0, p3Skip: 0 };
    const violations = checkPriorityViolations(results);
    assert.equal(violations.length, 0);
  });
});
