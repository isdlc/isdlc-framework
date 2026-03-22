/**
 * Unit tests for src/core/teams/registry.js -- Team Spec Registry
 *
 * Tests getTeamSpec() lookup and listTeamTypes() enumeration.
 * Requirements: FR-002 (AC-002-01..03), FR-005 (AC-005-02), INT-001
 *
 * Test ID prefix: TR- (Team Registry)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { getTeamSpec, listTeamTypes } from '../../../src/core/teams/registry.js';
import { implementationReviewLoopSpec } from '../../../src/core/teams/specs/implementation-review-loop.js';
import { fanOutSpec } from '../../../src/core/teams/specs/fan-out.js';
import { dualTrackSpec } from '../../../src/core/teams/specs/dual-track.js';
import { debateSpec } from '../../../src/core/teams/specs/debate.js';

// ---------------------------------------------------------------------------
// FR-002: Team Spec Registry (Positive)
// ---------------------------------------------------------------------------

describe('FR-002: getTeamSpec()', () => {
  // TR-01: getTeamSpec returns correct spec for 'implementation_review_loop'
  it('TR-01: returns correct spec for implementation_review_loop (AC-002-01)', () => {
    const spec = getTeamSpec('implementation_review_loop');
    assert.equal(spec.team_type, 'implementation_review_loop');
    assert.deepEqual(spec.members, ['writer', 'reviewer', 'updater']);
    assert.ok(Object.isFrozen(spec));
  });

  // TR-02: getTeamSpec returns correct spec for 'fan_out'
  it('TR-02: returns correct spec for fan_out (AC-002-01)', () => {
    const spec = getTeamSpec('fan_out');
    assert.equal(spec.team_type, 'fan_out');
    assert.deepEqual(spec.members, ['orchestrator', 'sub_agent']);
    assert.ok(Object.isFrozen(spec));
  });

  // TR-03: getTeamSpec returns correct spec for 'dual_track'
  it('TR-03: returns correct spec for dual_track (AC-002-01)', () => {
    const spec = getTeamSpec('dual_track');
    assert.equal(spec.team_type, 'dual_track');
    assert.deepEqual(spec.members, ['track_a', 'track_b']);
    assert.ok(Object.isFrozen(spec));
  });

  // TR-04: getTeamSpec returns correct spec for 'debate'
  it('TR-04: returns correct spec for debate (AC-002-01)', () => {
    const spec = getTeamSpec('debate');
    assert.equal(spec.team_type, 'debate');
    assert.deepEqual(spec.members, ['creator', 'critic', 'refiner']);
    assert.ok(Object.isFrozen(spec));
  });
});

// ---------------------------------------------------------------------------
// FR-002: Team Spec Registry (Negative)
// ---------------------------------------------------------------------------

describe('FR-002: getTeamSpec() error handling', () => {
  // TR-05: getTeamSpec throws on unknown type with helpful message
  it('TR-05: throws on unknown type with available types in message (AC-002-02)', () => {
    assert.throws(
      () => getTeamSpec('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('implementation_review_loop'), 'Should list available types');
        assert.ok(err.message.includes('fan_out'), 'Should list available types');
        assert.ok(err.message.includes('dual_track'), 'Should list available types');
        assert.ok(err.message.includes('debate'), 'Should list available types');
        return true;
      }
    );
  });

  // TR-06: getTeamSpec throws on null/undefined input
  it('TR-06: throws on null/undefined input (AC-002-02)', () => {
    assert.throws(() => getTeamSpec(null), Error);
    assert.throws(() => getTeamSpec(undefined), Error);
  });

  // TR-07: getTeamSpec throws on empty string
  it('TR-07: throws on empty string (AC-002-02)', () => {
    assert.throws(
      () => getTeamSpec(''),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('fan_out'), 'Should list available types');
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// FR-002: listTeamTypes
// ---------------------------------------------------------------------------

describe('FR-002: listTeamTypes()', () => {
  // TR-08: listTeamTypes returns all 4 team type strings
  it('TR-08: returns all 4 team type strings (AC-002-03)', () => {
    const types = listTeamTypes();
    assert.ok(Array.isArray(types), 'Should return an array');
    assert.equal(types.length, 4, 'Should have 4 types');
    assert.ok(types.includes('implementation_review_loop'));
    assert.ok(types.includes('fan_out'));
    assert.ok(types.includes('dual_track'));
    assert.ok(types.includes('debate'));
  });
});

// ---------------------------------------------------------------------------
// FR-005: No Dynamic Registration
// ---------------------------------------------------------------------------

describe('FR-005: Registry immutability', () => {
  // TR-09: Registry has no dynamic registration (catalog is fixed)
  it('TR-09: registry exports only getTeamSpec and listTeamTypes (AC-005-02)', async () => {
    const registry = await import('../../../src/core/teams/registry.js');
    const exportNames = Object.keys(registry).sort();
    assert.deepEqual(exportNames, ['getTeamSpec', 'listTeamTypes'],
      'Should only export getTeamSpec and listTeamTypes (no register/add/set)');
  });
});

// ---------------------------------------------------------------------------
// INT-001: Registry-to-Specs Roundtrip
// ---------------------------------------------------------------------------

describe('INT-001: Registry-to-Specs roundtrip', () => {
  // TR-10: All specs returned by registry match direct imports (strict equality)
  it('TR-10: registry returns same frozen objects as direct imports (INT-001)', () => {
    assert.equal(getTeamSpec('implementation_review_loop'), implementationReviewLoopSpec,
      'Should be the exact same object reference');
    assert.equal(getTeamSpec('fan_out'), fanOutSpec,
      'Should be the exact same object reference');
    assert.equal(getTeamSpec('dual_track'), dualTrackSpec,
      'Should be the exact same object reference');
    assert.equal(getTeamSpec('debate'), debateSpec,
      'Should be the exact same object reference');
  });
});
