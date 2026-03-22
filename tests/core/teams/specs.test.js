/**
 * Unit tests for src/core/teams/specs/ -- Team Spec Definitions
 *
 * Tests frozen spec objects for all 4 team types.
 * Requirements: FR-001 (AC-001-01..04), FR-003 (AC-003-01..04),
 *               FR-004 (AC-004-01..03), FR-005 (AC-005-01)
 *
 * Test ID prefix: TS- (Team Spec)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { implementationReviewLoopSpec } from '../../../src/core/teams/specs/implementation-review-loop.js';
import { fanOutSpec } from '../../../src/core/teams/specs/fan-out.js';
import { dualTrackSpec } from '../../../src/core/teams/specs/dual-track.js';
import { debateSpec } from '../../../src/core/teams/specs/debate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Required fields per FR-003 AC-003-01
const REQUIRED_FIELDS = [
  'team_type', 'members', 'parallelism',
  'merge_policy', 'retry_policy', 'max_iterations', 'state_owner'
];

const ALLOWED_PARALLELISM = ['sequential', 'full', 'dual_track'];

const ALL_SPECS = [
  { name: 'implementationReviewLoopSpec', spec: implementationReviewLoopSpec },
  { name: 'fanOutSpec', spec: fanOutSpec },
  { name: 'dualTrackSpec', spec: dualTrackSpec },
  { name: 'debateSpec', spec: debateSpec }
];

// ---------------------------------------------------------------------------
// FR-001: Team Spec Definitions (Positive)
// ---------------------------------------------------------------------------

describe('FR-001: Team Spec Definitions', () => {
  // TS-01: implementation_review_loop spec has correct field values
  it('TS-01: implementation_review_loop spec has correct field values (AC-001-01)', () => {
    assert.equal(implementationReviewLoopSpec.team_type, 'implementation_review_loop');
    assert.deepEqual(implementationReviewLoopSpec.members, ['writer', 'reviewer', 'updater']);
    assert.equal(implementationReviewLoopSpec.parallelism, 'sequential');
    assert.equal(implementationReviewLoopSpec.merge_policy, 'last_wins');
    assert.equal(implementationReviewLoopSpec.retry_policy, 'per_member');
    assert.equal(implementationReviewLoopSpec.max_iterations, 3);
    assert.equal(implementationReviewLoopSpec.state_owner, 'orchestrator');
  });

  // TS-02: fan_out spec has correct field values
  it('TS-02: fan_out spec has correct field values (AC-001-02)', () => {
    assert.equal(fanOutSpec.team_type, 'fan_out');
    assert.deepEqual(fanOutSpec.members, ['orchestrator', 'sub_agent']);
    assert.equal(fanOutSpec.parallelism, 'full');
    assert.equal(fanOutSpec.merge_policy, 'consolidate');
    assert.equal(fanOutSpec.retry_policy, 'fail_open');
    assert.equal(fanOutSpec.max_iterations, 1);
    assert.equal(fanOutSpec.state_owner, 'orchestrator');
  });

  // TS-03: dual_track spec has correct field values
  it('TS-03: dual_track spec has correct field values (AC-001-03)', () => {
    assert.equal(dualTrackSpec.team_type, 'dual_track');
    assert.deepEqual(dualTrackSpec.members, ['track_a', 'track_b']);
    assert.equal(dualTrackSpec.parallelism, 'full');
    assert.equal(dualTrackSpec.merge_policy, 'consolidate');
    assert.equal(dualTrackSpec.retry_policy, 'per_track');
    assert.equal(dualTrackSpec.max_iterations, 10);
    assert.equal(dualTrackSpec.state_owner, 'orchestrator');
  });

  // TS-04: debate spec has correct field values
  it('TS-04: debate spec has correct field values (AC-001-04)', () => {
    assert.equal(debateSpec.team_type, 'debate');
    assert.deepEqual(debateSpec.members, ['creator', 'critic', 'refiner']);
    assert.equal(debateSpec.parallelism, 'sequential');
    assert.equal(debateSpec.merge_policy, 'last_wins');
    assert.equal(debateSpec.retry_policy, 'per_round');
    assert.equal(debateSpec.max_iterations, 3);
    assert.equal(debateSpec.state_owner, 'orchestrator');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Spec Field Schema
// ---------------------------------------------------------------------------

describe('FR-003: Spec Field Schema', () => {
  // TS-05: Every spec has exactly the 7 required fields
  it('TS-05: every spec has exactly the 7 required fields (AC-003-01)', () => {
    for (const { name, spec } of ALL_SPECS) {
      const keys = Object.keys(spec).sort();
      const expected = [...REQUIRED_FIELDS].sort();
      assert.deepEqual(keys, expected, `${name} has unexpected fields`);
    }
  });

  // TS-06: members field is an array of strings for all specs
  it('TS-06: members field is an array of strings for all specs (AC-003-02)', () => {
    for (const { name, spec } of ALL_SPECS) {
      assert.ok(Array.isArray(spec.members), `${name}.members should be an array`);
      for (const member of spec.members) {
        assert.equal(typeof member, 'string', `${name}.members should contain only strings`);
      }
    }
  });

  // TS-07: parallelism field is one of the allowed values
  it('TS-07: parallelism field is one of the allowed values (AC-003-03)', () => {
    for (const { name, spec } of ALL_SPECS) {
      assert.ok(
        ALLOWED_PARALLELISM.includes(spec.parallelism),
        `${name}.parallelism "${spec.parallelism}" not in ${JSON.stringify(ALLOWED_PARALLELISM)}`
      );
    }
  });

  // TS-08: parallelism values map correctly to team types
  it('TS-08: parallelism values map correctly to team types (AC-003-03)', () => {
    assert.equal(implementationReviewLoopSpec.parallelism, 'sequential');
    assert.equal(fanOutSpec.parallelism, 'full');
    assert.equal(dualTrackSpec.parallelism, 'full');
    assert.equal(debateSpec.parallelism, 'sequential');
  });

  // TS-16: max_iterations field is a positive integer for all specs
  it('TS-16: max_iterations field is a positive integer for all specs (AC-003-01)', () => {
    for (const { name, spec } of ALL_SPECS) {
      assert.equal(typeof spec.max_iterations, 'number', `${name}.max_iterations should be a number`);
      assert.ok(Number.isInteger(spec.max_iterations), `${name}.max_iterations should be an integer`);
      assert.ok(spec.max_iterations > 0, `${name}.max_iterations should be positive`);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-005: Pure Data Objects
// ---------------------------------------------------------------------------

describe('FR-005: Pure Data Objects', () => {
  // TS-09: All specs are frozen (Object.isFrozen)
  it('TS-09: all specs are frozen (AC-003-04, AC-005-01)', () => {
    for (const { name, spec } of ALL_SPECS) {
      assert.ok(Object.isFrozen(spec), `${name} should be frozen`);
    }
  });

  // TS-10: Frozen specs reject property mutation
  it('TS-10: frozen specs reject property mutation (AC-005-01)', () => {
    // ESM modules run in strict mode, so assignment to frozen object throws TypeError
    assert.throws(
      () => { implementationReviewLoopSpec.team_type = 'hacked'; },
      TypeError,
      'Should throw TypeError when mutating frozen property'
    );
  });

  // TS-11: Frozen specs reject property addition
  it('TS-11: frozen specs reject property addition (AC-005-01)', () => {
    assert.throws(
      () => { implementationReviewLoopSpec.new_prop = 'added'; },
      TypeError,
      'Should throw TypeError when adding to frozen object'
    );
  });

  // TS-12: Spec files export only object literals (no classes, no functions)
  it('TS-12: spec files export only object literals (AC-005-01)', () => {
    for (const { name, spec } of ALL_SPECS) {
      assert.equal(typeof spec, 'object', `${name} export should be an object`);
      assert.notEqual(spec, null, `${name} export should not be null`);
      assert.ok(!Array.isArray(spec), `${name} export should not be an array`);
    }
  });
});

// ---------------------------------------------------------------------------
// FR-004: Backward Compatibility
// ---------------------------------------------------------------------------

describe('FR-004: Backward Compatibility', () => {
  // TS-13: implementation-loop.js still works (import + construct)
  it('TS-13: ImplementationLoop import still works (AC-004-01)', async () => {
    const { ImplementationLoop } = await import('../../../src/core/teams/implementation-loop.js');
    const loop = new ImplementationLoop({
      team_type: 'implementation_review_loop',
      members: ['writer', 'reviewer', 'updater'],
      max_iterations_per_file: 3
    });
    assert.ok(loop, 'ImplementationLoop should be constructable');
  });

  // TS-14: Contract JSON schemas still exist and are valid
  it('TS-14: contract JSON schemas still exist and parse (AC-004-02)', () => {
    const contractsDir = join(__dirname, '..', '..', '..', 'src', 'core', 'teams', 'contracts');
    const schemaNames = ['writer-context.json', 'review-context.json', 'update-context.json'];
    for (const name of schemaNames) {
      const content = readFileSync(join(contractsDir, name), 'utf-8');
      const schema = JSON.parse(content);
      assert.equal(schema.type, 'object', `${name} should be an object schema`);
      assert.ok(schema.properties, `${name} should have properties`);
    }
  });

  // TS-15: Existing teams.cjs bridge is unchanged (exports createImplementationLoop)
  it('TS-15: existing teams.cjs bridge exports createImplementationLoop (AC-004-03)', async () => {
    const bridge = await import('../../../src/core/bridge/teams.cjs');
    // CJS default export contains createImplementationLoop
    const mod = bridge.default || bridge;
    assert.equal(typeof mod.createImplementationLoop, 'function',
      'teams.cjs should export createImplementationLoop');
  });
});
