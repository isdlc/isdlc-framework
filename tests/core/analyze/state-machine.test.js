/**
 * Unit tests for src/core/analyze/state-machine.js — Roundtable FSM
 *
 * Tests STATES enum, EVENTS enum, transition table, and tier paths.
 * Requirements: REQ-0109 FR-001..004
 *
 * Test ID prefix: SM- (State Machine)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getStateMachine,
  getTransition,
  getTierPath
} from '../../../src/core/analyze/state-machine.js';

// ---------------------------------------------------------------------------
// FR-001: FSM Definition (AC-001-01..02)
// ---------------------------------------------------------------------------

describe('FR-001: FSM Definition', () => {
  it('SM-01: STATES enum has 8 members (AC-001-01)', () => {
    const { STATES } = getStateMachine();
    const keys = Object.keys(STATES);
    assert.equal(keys.length, 8);
  });

  it('SM-02: STATES contains exact expected values (AC-001-01)', () => {
    const { STATES } = getStateMachine();
    assert.equal(STATES.IDLE, 'IDLE');
    assert.equal(STATES.PRESENTING_REQUIREMENTS, 'PRESENTING_REQUIREMENTS');
    assert.equal(STATES.PRESENTING_ARCHITECTURE, 'PRESENTING_ARCHITECTURE');
    assert.equal(STATES.PRESENTING_DESIGN, 'PRESENTING_DESIGN');
    assert.equal(STATES.AMENDING, 'AMENDING');
    assert.equal(STATES.FINALIZING, 'FINALIZING');
    assert.equal(STATES.COMPLETE, 'COMPLETE');
  });

  it('SM-03: STATES is frozen (AC-001-02)', () => {
    const { STATES } = getStateMachine();
    assert.ok(Object.isFrozen(STATES));
  });

  it('SM-04: EVENTS enum has 3 members (AC-001-02)', () => {
    const { EVENTS } = getStateMachine();
    const keys = Object.keys(EVENTS);
    assert.equal(keys.length, 3);
  });

  it('SM-05: EVENTS contains accept, amend, finalize_complete (AC-001-02)', () => {
    const { EVENTS } = getStateMachine();
    assert.equal(EVENTS.ACCEPT, 'accept');
    assert.equal(EVENTS.AMEND, 'amend');
    assert.equal(EVENTS.FINALIZE_COMPLETE, 'finalize_complete');
  });

  it('SM-06: EVENTS is frozen', () => {
    const { EVENTS } = getStateMachine();
    assert.ok(Object.isFrozen(EVENTS));
  });
});

// ---------------------------------------------------------------------------
// FR-002: Transitions (AC-002-01..03)
// ---------------------------------------------------------------------------

describe('FR-002: Transitions', () => {
  it('SM-07: IDLE + accept -> PRESENTING_REQUIREMENTS (AC-002-01)', () => {
    assert.equal(getTransition('IDLE', 'accept'), 'PRESENTING_REQUIREMENTS');
  });

  it('SM-08: PRESENTING_REQUIREMENTS + accept -> PRESENTING_ARCHITECTURE', () => {
    assert.equal(getTransition('PRESENTING_REQUIREMENTS', 'accept'), 'PRESENTING_ARCHITECTURE');
  });

  it('SM-09: PRESENTING_ARCHITECTURE + accept -> PRESENTING_DESIGN', () => {
    assert.equal(getTransition('PRESENTING_ARCHITECTURE', 'accept'), 'PRESENTING_DESIGN');
  });

  it('SM-10: PRESENTING_DESIGN + accept -> PRESENTING_TASKS (REQ-GH-208)', () => {
    assert.equal(getTransition('PRESENTING_DESIGN', 'accept'), 'PRESENTING_TASKS');
  });

  it('SM-11: any PRESENTING + amend -> AMENDING (AC-002-01)', () => {
    assert.equal(getTransition('PRESENTING_REQUIREMENTS', 'amend'), 'AMENDING');
    assert.equal(getTransition('PRESENTING_ARCHITECTURE', 'amend'), 'AMENDING');
    assert.equal(getTransition('PRESENTING_DESIGN', 'amend'), 'AMENDING');
  });

  it('SM-12: AMENDING + accept -> null (runtime-resolved) (AC-002-01)', () => {
    assert.equal(getTransition('AMENDING', 'accept'), null);
  });

  it('SM-13: FINALIZING + finalize_complete -> COMPLETE (AC-002-01)', () => {
    assert.equal(getTransition('FINALIZING', 'finalize_complete'), 'COMPLETE');
  });

  it('SM-14: invalid state/event pair returns null (AC-002-03)', () => {
    assert.equal(getTransition('COMPLETE', 'accept'), null);
    assert.equal(getTransition('IDLE', 'amend'), null);
    assert.equal(getTransition('NONEXISTENT', 'accept'), null);
  });

  it('SM-15: transition table is frozen (AC-002-01)', () => {
    const { transitionTable } = getStateMachine();
    assert.ok(Object.isFrozen(transitionTable));
  });
});

// ---------------------------------------------------------------------------
// FR-003: Tier-Dependent Paths (AC-003-01..03)
// ---------------------------------------------------------------------------

describe('FR-003: Tier Paths', () => {
  it('SM-16: standard tier has 4 domains (AC-003-01, REQ-GH-208)', () => {
    const path = getTierPath('standard');
    assert.deepEqual(path, [
      'PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS'
    ]);
  });

  it('SM-17: light tier has 3 domains including tasks (AC-003-02)', () => {
    const path = getTierPath('light');
    assert.deepEqual(path, ['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']);
  });

  it('SM-18: trivial tier has 1 entry (AC-003-03)', () => {
    const path = getTierPath('trivial');
    assert.deepEqual(path, ['FINALIZING']);
  });

  it('SM-19: unknown tier returns null', () => {
    assert.equal(getTierPath('nonexistent'), null);
  });

  it('SM-20: tier paths are frozen', () => {
    const standard = getTierPath('standard');
    const light = getTierPath('light');
    const trivial = getTierPath('trivial');
    assert.ok(Object.isFrozen(standard));
    assert.ok(Object.isFrozen(light));
    assert.ok(Object.isFrozen(trivial));
  });
});

// ---------------------------------------------------------------------------
// REQ-GH-208: PRESENTING_TASKS State (FR-002 AC-002-01..05)
// ---------------------------------------------------------------------------

describe('REQ-GH-208: PRESENTING_TASKS state', () => {
  it('SM-21: STATES enum has 8 members after update (FR-002 AC-002-01)', () => {
    const { STATES } = getStateMachine();
    const keys = Object.keys(STATES);
    assert.equal(keys.length, 8);
  });

  it('SM-22: STATES contains PRESENTING_TASKS value (FR-002 AC-002-01)', () => {
    const { STATES } = getStateMachine();
    assert.equal(STATES.PRESENTING_TASKS, 'PRESENTING_TASKS');
  });

  it('SM-23: PRESENTING_DESIGN + accept -> PRESENTING_TASKS (FR-002 AC-002-01)', () => {
    assert.equal(getTransition('PRESENTING_DESIGN', 'accept'), 'PRESENTING_TASKS');
  });

  it('SM-24: PRESENTING_TASKS + accept -> FINALIZING (FR-002 AC-002-01, AC-002-03)', () => {
    assert.equal(getTransition('PRESENTING_TASKS', 'accept'), 'FINALIZING');
  });

  it('SM-25: PRESENTING_TASKS + amend -> AMENDING (FR-002 AC-002-04)', () => {
    assert.equal(getTransition('PRESENTING_TASKS', 'amend'), 'AMENDING');
  });

  it('SM-26: standard tier path includes PRESENTING_TASKS as 4th element (FR-002 AC-002-01, FR-005 AC-005-01)', () => {
    const path = getTierPath('standard');
    assert.deepEqual(path, [
      'PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS'
    ]);
  });

  it('SM-27: light tier path DOES include PRESENTING_TASKS (FR-002 AC-002-05)', () => {
    const path = getTierPath('light');
    assert.ok(path.includes('PRESENTING_TASKS'), 'Light tier should include PRESENTING_TASKS');
    assert.deepEqual(path, ['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']);
  });

  it('SM-28: trivial tier path unchanged — no PRESENTING_TASKS (FR-002 AC-002-05)', () => {
    const path = getTierPath('trivial');
    assert.deepEqual(path, ['FINALIZING']);
  });
});

// ---------------------------------------------------------------------------
// REQ-GH-212 T0015/T0025: Regression Guards for Light Tier PRESENTING_TASKS
// ---------------------------------------------------------------------------

describe('REQ-GH-212 T0025: Light Tier PRESENTING_TASKS Regression (FR-002, AC-002-01)', () => {
  it('SM-T15-01: light tier path includes PRESENTING_TASKS (AC-002-01)', () => {
    const path = getTierPath('light');
    assert.ok(path.includes('PRESENTING_TASKS'), 'Light tier must include PRESENTING_TASKS');
  });

  it('SM-T15-02: light tier path has exactly 3 entries (AC-002-01)', () => {
    const path = getTierPath('light');
    assert.equal(path.length, 3);
    assert.deepEqual(path, ['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']);
  });

  it('SM-T15-03: standard tier path still has 4 entries (unchanged, regression check) (AC-002-01)', () => {
    const path = getTierPath('standard');
    assert.equal(path.length, 4);
  });
});
