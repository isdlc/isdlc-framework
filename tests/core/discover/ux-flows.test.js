/**
 * Unit tests for src/core/discover/ux-flows.js — Discover UX Flow Definitions
 *
 * Tests menu definitions and walkthrough step sequences.
 * Requirements: REQ-0104 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02), FR-003 (AC-003-01)
 *
 * Test ID prefix: UX- (UX Flows)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  FIRST_TIME_MENU,
  RETURNING_MENU,
  EXISTING_WALKTHROUGH,
  NEW_WALKTHROUGH,
  DEEP_WALKTHROUGH,
  getMenu,
  getWalkthrough,
  listMenus
} from '../../../src/core/discover/ux-flows.js';

// ---------------------------------------------------------------------------
// FR-001: Menu Definitions (AC-001-01..03)
// ---------------------------------------------------------------------------

describe('FR-001: Menu Definitions', () => {
  it('UX-01: first_time_menu has 3 options (AC-001-01)', () => {
    assert.equal(FIRST_TIME_MENU.id, 'first_time');
    assert.equal(FIRST_TIME_MENU.options.length, 3);
    const ids = FIRST_TIME_MENU.options.map(o => o.id);
    assert.ok(ids.includes('new_project'));
    assert.ok(ids.includes('existing_analysis'));
    assert.ok(ids.includes('chat_explore'));
  });

  it('UX-02: returning_menu has 4 options (AC-001-02)', () => {
    assert.equal(RETURNING_MENU.id, 'returning');
    assert.equal(RETURNING_MENU.options.length, 4);
    const ids = RETURNING_MENU.options.map(o => o.id);
    assert.ok(ids.includes('rerun'));
    assert.ok(ids.includes('incremental'));
    assert.ok(ids.includes('deep'));
    assert.ok(ids.includes('chat_explore'));
  });

  it('UX-03: each menu option has id, label, description, maps_to_mode (AC-001-03)', () => {
    const allOptions = [...FIRST_TIME_MENU.options, ...RETURNING_MENU.options];
    for (const opt of allOptions) {
      assert.equal(typeof opt.id, 'string', `option ${opt.id} missing id`);
      assert.equal(typeof opt.label, 'string', `option ${opt.id} missing label`);
      assert.equal(typeof opt.description, 'string', `option ${opt.id} missing description`);
      assert.ok('maps_to_mode' in opt, `option ${opt.id} missing maps_to_mode`);
    }
  });

  it('UX-04: chat_explore maps_to_mode is null (AC-003-01)', () => {
    const ftExplore = FIRST_TIME_MENU.options.find(o => o.id === 'chat_explore');
    const retExplore = RETURNING_MENU.options.find(o => o.id === 'chat_explore');
    assert.equal(ftExplore.maps_to_mode, null);
    assert.equal(retExplore.maps_to_mode, null);
  });
});

// ---------------------------------------------------------------------------
// FR-002: Walkthrough Steps (AC-002-01..02)
// ---------------------------------------------------------------------------

describe('FR-002: Walkthrough Definitions', () => {
  it('UX-05: existing walkthrough has ordered steps (AC-002-01)', () => {
    assert.ok(Array.isArray(EXISTING_WALKTHROUGH.steps));
    assert.ok(EXISTING_WALKTHROUGH.steps.length > 0);
    assert.equal(EXISTING_WALKTHROUGH.mode, 'discover_existing');
  });

  it('UX-06: new walkthrough has ordered steps (AC-002-01)', () => {
    assert.ok(Array.isArray(NEW_WALKTHROUGH.steps));
    assert.ok(NEW_WALKTHROUGH.steps.length > 0);
    assert.equal(NEW_WALKTHROUGH.mode, 'discover_new');
  });

  it('UX-07: deep walkthrough has ordered steps (AC-002-01)', () => {
    assert.ok(Array.isArray(DEEP_WALKTHROUGH.steps));
    assert.ok(DEEP_WALKTHROUGH.steps.length > 0);
    assert.equal(DEEP_WALKTHROUGH.mode, 'discover_deep');
  });

  it('UX-08: each step has required fields (AC-002-02)', () => {
    const allSteps = [
      ...EXISTING_WALKTHROUGH.steps,
      ...NEW_WALKTHROUGH.steps,
      ...DEEP_WALKTHROUGH.steps
    ];
    for (const step of allSteps) {
      assert.equal(typeof step.id, 'string', `step missing id`);
      assert.equal(typeof step.label, 'string', `step ${step.id} missing label`);
      assert.equal(typeof step.agent_group, 'string', `step ${step.id} missing agent_group`);
      assert.equal(typeof step.optional, 'boolean', `step ${step.id} missing optional`);
      assert.equal(typeof step.review_gate, 'boolean', `step ${step.id} missing review_gate`);
    }
  });
});

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

describe('UX Flow Helpers', () => {
  it('UX-09: getMenu returns correct menu by id', () => {
    const ft = getMenu('first_time');
    assert.equal(ft.id, 'first_time');
    const ret = getMenu('returning');
    assert.equal(ret.id, 'returning');
  });

  it('UX-10: getMenu throws on unknown id', () => {
    assert.throws(
      () => getMenu('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('first_time'));
        return true;
      }
    );
  });

  it('UX-11: getWalkthrough returns correct walkthrough by mode', () => {
    const wt = getWalkthrough('discover_existing');
    assert.equal(wt.mode, 'discover_existing');
  });

  it('UX-12: getWalkthrough throws on unknown mode', () => {
    assert.throws(
      () => getWalkthrough('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });

  it('UX-13: listMenus returns all menu ids', () => {
    const ids = listMenus();
    assert.ok(Array.isArray(ids));
    assert.ok(ids.includes('first_time'));
    assert.ok(ids.includes('returning'));
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('UX Flow Immutability', () => {
  it('UX-14: menus are frozen', () => {
    assert.ok(Object.isFrozen(FIRST_TIME_MENU));
    assert.ok(Object.isFrozen(RETURNING_MENU));
  });

  it('UX-15: walkthroughs are frozen', () => {
    assert.ok(Object.isFrozen(EXISTING_WALKTHROUGH));
    assert.ok(Object.isFrozen(NEW_WALKTHROUGH));
    assert.ok(Object.isFrozen(DEEP_WALKTHROUGH));
  });

  it('UX-16: frozen menus reject mutation', () => {
    assert.throws(
      () => { FIRST_TIME_MENU.id = 'hacked'; },
      TypeError
    );
  });
});
