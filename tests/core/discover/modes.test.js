/**
 * Unit tests for src/core/discover/modes.js — Discover Mode Definitions
 *
 * Tests frozen mode objects for all 4 discover modes.
 * Requirements: REQ-0103 FR-001 (AC-001-01..02), FR-004 (AC-004-01..03)
 *
 * Test ID prefix: DM- (Discover Modes)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVER_EXISTING,
  DISCOVER_NEW,
  DISCOVER_INCREMENTAL,
  DISCOVER_DEEP
} from '../../../src/core/discover/modes.js';

const ALL_MODES = [
  { name: 'DISCOVER_EXISTING', mode: DISCOVER_EXISTING },
  { name: 'DISCOVER_NEW', mode: DISCOVER_NEW },
  { name: 'DISCOVER_INCREMENTAL', mode: DISCOVER_INCREMENTAL },
  { name: 'DISCOVER_DEEP', mode: DISCOVER_DEEP }
];

const REQUIRED_FIELDS = ['id', 'agent_groups', 'depth_levels', 'applicable_when'];

// ---------------------------------------------------------------------------
// FR-001: Mode Definitions (AC-001-01)
// ---------------------------------------------------------------------------

describe('FR-001: Discover Mode Definitions', () => {
  it('DM-01: discover_existing has correct fields (AC-001-01)', () => {
    assert.equal(DISCOVER_EXISTING.id, 'discover_existing');
    assert.deepEqual(DISCOVER_EXISTING.agent_groups, [
      'core_analyzers', 'post_analysis', 'constitution_skills'
    ]);
    assert.deepEqual(DISCOVER_EXISTING.depth_levels, ['standard', 'full']);
    assert.equal(typeof DISCOVER_EXISTING.applicable_when, 'string');
  });

  it('DM-02: discover_new has correct fields (AC-001-01)', () => {
    assert.equal(DISCOVER_NEW.id, 'discover_new');
    assert.deepEqual(DISCOVER_NEW.agent_groups, [
      'new_project_core', 'constitution_skills'
    ]);
    assert.deepEqual(DISCOVER_NEW.depth_levels, []);
    assert.equal(typeof DISCOVER_NEW.applicable_when, 'string');
  });

  it('DM-03: discover_incremental has correct fields (AC-001-01)', () => {
    assert.equal(DISCOVER_INCREMENTAL.id, 'discover_incremental');
    assert.deepEqual(DISCOVER_INCREMENTAL.agent_groups, ['core_analyzers']);
    assert.deepEqual(DISCOVER_INCREMENTAL.depth_levels, []);
    assert.equal(typeof DISCOVER_INCREMENTAL.applicable_when, 'string');
  });

  it('DM-04: discover_deep has correct fields (AC-001-01)', () => {
    assert.equal(DISCOVER_DEEP.id, 'discover_deep');
    assert.deepEqual(DISCOVER_DEEP.agent_groups, [
      'core_analyzers', 'post_analysis', 'deep_standard', 'deep_full', 'constitution_skills'
    ]);
    assert.deepEqual(DISCOVER_DEEP.depth_levels, ['standard', 'full']);
    assert.equal(typeof DISCOVER_DEEP.applicable_when, 'string');
  });
});

// ---------------------------------------------------------------------------
// FR-001: Field Schema (AC-001-02)
// ---------------------------------------------------------------------------

describe('FR-001: Mode Field Schema', () => {
  it('DM-05: every mode has exactly the 4 required fields (AC-001-02)', () => {
    for (const { name, mode } of ALL_MODES) {
      const keys = Object.keys(mode).sort();
      const expected = [...REQUIRED_FIELDS].sort();
      assert.deepEqual(keys, expected, `${name} has unexpected fields`);
    }
  });

  it('DM-06: agent_groups field is an array of strings for all modes (AC-001-02)', () => {
    for (const { name, mode } of ALL_MODES) {
      assert.ok(Array.isArray(mode.agent_groups), `${name}.agent_groups should be array`);
      for (const g of mode.agent_groups) {
        assert.equal(typeof g, 'string', `${name}.agent_groups should contain only strings`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// FR-005: Frozen Objects
// ---------------------------------------------------------------------------

describe('FR-005: Mode Immutability', () => {
  it('DM-07: all modes are frozen (AC-001-02)', () => {
    for (const { name, mode } of ALL_MODES) {
      assert.ok(Object.isFrozen(mode), `${name} should be frozen`);
    }
  });

  it('DM-08: frozen modes reject property mutation', () => {
    assert.throws(
      () => { DISCOVER_EXISTING.id = 'hacked'; },
      TypeError
    );
  });

  it('DM-09: frozen modes reject property addition', () => {
    assert.throws(
      () => { DISCOVER_NEW.new_prop = 'added'; },
      TypeError
    );
  });
});
