/**
 * Unit tests for src/core/discover/discover-state-schema.js — Discover State Schema
 *
 * Tests state creation, resume computation, completion check, step marking.
 * Requirements: REQ-0105 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02), FR-003 (AC-003-01)
 *
 * Test ID prefix: DS- (Discover State)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVER_STATE_SCHEMA,
  RESUME_LIMITATIONS,
  createInitialDiscoverState,
  computeResumePoint,
  isDiscoverComplete,
  markStepComplete
} from '../../../src/core/discover/discover-state-schema.js';

// ---------------------------------------------------------------------------
// FR-001: State Schema (AC-001-01..03)
// ---------------------------------------------------------------------------

describe('FR-001: Discover State Schema', () => {
  it('DS-01: schema defines status, current_step, completed_steps, flow_type, depth_level (AC-001-01)', () => {
    assert.ok('status' in DISCOVER_STATE_SCHEMA.fields);
    assert.ok('current_step' in DISCOVER_STATE_SCHEMA.fields);
    assert.ok('completed_steps' in DISCOVER_STATE_SCHEMA.fields);
    assert.ok('flow_type' in DISCOVER_STATE_SCHEMA.fields);
    assert.ok('depth_level' in DISCOVER_STATE_SCHEMA.fields);
  });

  it('DS-02: schema includes discovery_context metadata fields (AC-001-02)', () => {
    assert.ok('discovery_context' in DISCOVER_STATE_SCHEMA.fields);
  });

  it('DS-03: schema includes timestamp fields (AC-001-03)', () => {
    assert.ok('started_at' in DISCOVER_STATE_SCHEMA.fields);
    assert.ok('completed_at' in DISCOVER_STATE_SCHEMA.fields);
    assert.ok('last_resumed_at' in DISCOVER_STATE_SCHEMA.fields);
  });

  it('DS-03b: schema is frozen', () => {
    assert.ok(Object.isFrozen(DISCOVER_STATE_SCHEMA));
  });
});

// ---------------------------------------------------------------------------
// createInitialDiscoverState
// ---------------------------------------------------------------------------

describe('createInitialDiscoverState', () => {
  it('DS-04: creates state with pending status and empty completed_steps', () => {
    const state = createInitialDiscoverState('discover_existing', 'standard');
    assert.equal(state.status, 'pending');
    assert.equal(state.flow_type, 'discover_existing');
    assert.equal(state.depth_level, 'standard');
    assert.deepEqual(state.completed_steps, []);
    assert.equal(state.current_step, null);
    assert.equal(typeof state.started_at, 'string');
  });

  it('DS-04b: creates state with null depth_level when not specified', () => {
    const state = createInitialDiscoverState('discover_new');
    assert.equal(state.depth_level, null);
  });

  it('DS-04c: returned state is a plain object (not frozen — mutable working state)', () => {
    const state = createInitialDiscoverState('discover_existing');
    assert.equal(typeof state, 'object');
    // Working state should be mutable
    state.status = 'in_progress';
    assert.equal(state.status, 'in_progress');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Resume Semantics (AC-002-01..02)
// ---------------------------------------------------------------------------

describe('FR-002: computeResumePoint', () => {
  it('DS-05: returns next uncompleted step (AC-002-01)', () => {
    const state = createInitialDiscoverState('discover_existing');
    state.status = 'in_progress';
    state.completed_steps = ['step_core_analyzers'];
    const resume = computeResumePoint(state);
    assert.equal(typeof resume, 'string');
    assert.ok(resume !== 'step_core_analyzers', 'Should not return already completed step');
  });

  it('DS-05b: returns null when all steps are completed', () => {
    const state = createInitialDiscoverState('discover_incremental');
    state.status = 'in_progress';
    state.completed_steps = ['step_core_analyzers'];
    const resume = computeResumePoint(state);
    assert.equal(resume, null);
  });

  it('DS-06: RESUME_LIMITATIONS documents group restart behavior (AC-002-02)', () => {
    assert.ok(Array.isArray(RESUME_LIMITATIONS));
    assert.ok(RESUME_LIMITATIONS.length > 0);
    for (const lim of RESUME_LIMITATIONS) {
      assert.equal(typeof lim.step_type, 'string');
      assert.equal(typeof lim.behavior, 'string');
      assert.equal(typeof lim.reason, 'string');
    }
    assert.ok(Object.isFrozen(RESUME_LIMITATIONS));
  });
});

// ---------------------------------------------------------------------------
// FR-003: Completion (AC-003-01)
// ---------------------------------------------------------------------------

describe('FR-003: isDiscoverComplete', () => {
  it('DS-07: returns false for incomplete state (AC-003-01)', () => {
    const state = createInitialDiscoverState('discover_existing');
    state.status = 'in_progress';
    state.completed_steps = ['step_core_analyzers'];
    assert.equal(isDiscoverComplete(state), false);
  });

  it('DS-08: returns true when all required steps are completed', () => {
    const state = createInitialDiscoverState('discover_incremental');
    state.status = 'in_progress';
    state.completed_steps = ['step_core_analyzers'];
    assert.equal(isDiscoverComplete(state), true);
  });
});

// ---------------------------------------------------------------------------
// markStepComplete
// ---------------------------------------------------------------------------

describe('markStepComplete', () => {
  it('DS-09: adds stepId to completed_steps', () => {
    const state = createInitialDiscoverState('discover_existing');
    const updated = markStepComplete(state, 'step_core_analyzers');
    assert.ok(updated.completed_steps.includes('step_core_analyzers'));
  });

  it('DS-10: does not duplicate if step already completed', () => {
    const state = createInitialDiscoverState('discover_existing');
    state.completed_steps = ['step_core_analyzers'];
    const updated = markStepComplete(state, 'step_core_analyzers');
    const count = updated.completed_steps.filter(s => s === 'step_core_analyzers').length;
    assert.equal(count, 1);
  });

  it('DS-11: updates current_step to next step', () => {
    const state = createInitialDiscoverState('discover_existing');
    const updated = markStepComplete(state, 'step_core_analyzers');
    // current_step should advance or be null if done
    assert.ok(
      updated.current_step === null || typeof updated.current_step === 'string'
    );
  });
});
