/**
 * Unit tests for src/core/discover/agent-groups.js — Agent Group Definitions
 *
 * Tests frozen group objects for all 7 discover agent groups.
 * Requirements: REQ-0103 FR-002 (AC-002-01..04), FR-003 (AC-003-01..03)
 *
 * Test ID prefix: AG- (Agent Groups)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CORE_ANALYZERS,
  POST_ANALYSIS,
  CONSTITUTION_SKILLS,
  NEW_PROJECT_CORE,
  NEW_PROJECT_PARTY,
  DEEP_STANDARD,
  DEEP_FULL
} from '../../../src/core/discover/agent-groups.js';

const ALL_GROUPS = [
  { name: 'CORE_ANALYZERS', group: CORE_ANALYZERS },
  { name: 'POST_ANALYSIS', group: POST_ANALYSIS },
  { name: 'CONSTITUTION_SKILLS', group: CONSTITUTION_SKILLS },
  { name: 'NEW_PROJECT_CORE', group: NEW_PROJECT_CORE },
  { name: 'NEW_PROJECT_PARTY', group: NEW_PROJECT_PARTY },
  { name: 'DEEP_STANDARD', group: DEEP_STANDARD },
  { name: 'DEEP_FULL', group: DEEP_FULL }
];

const REQUIRED_FIELDS = ['id', 'members', 'parallelism', 'required_for_modes'];

// ---------------------------------------------------------------------------
// FR-002: Agent Group Definitions (AC-002-01)
// ---------------------------------------------------------------------------

describe('FR-002: Agent Group Definitions', () => {
  it('AG-01: exactly 7 groups defined (AC-002-01)', () => {
    assert.equal(ALL_GROUPS.length, 7);
  });

  it('AG-02: core_analyzers has correct members (AC-002-03)', () => {
    assert.equal(CORE_ANALYZERS.id, 'core_analyzers');
    assert.deepEqual(CORE_ANALYZERS.members, [
      'architecture-analyzer', 'test-evaluator', 'data-model-analyzer', 'feature-mapper'
    ]);
    assert.equal(CORE_ANALYZERS.parallelism, 'parallel');
    assert.deepEqual(CORE_ANALYZERS.required_for_modes, [
      'discover_existing', 'discover_incremental', 'discover_deep'
    ]);
  });

  it('AG-03: post_analysis has correct members', () => {
    assert.equal(POST_ANALYSIS.id, 'post_analysis');
    assert.deepEqual(POST_ANALYSIS.members, [
      'characterization-test-generator', 'artifact-integration', 'atdd-bridge'
    ]);
    assert.equal(POST_ANALYSIS.parallelism, 'sequential');
    assert.deepEqual(POST_ANALYSIS.required_for_modes, [
      'discover_existing', 'discover_deep'
    ]);
  });

  it('AG-04: constitution_skills has correct members', () => {
    assert.equal(CONSTITUTION_SKILLS.id, 'constitution_skills');
    assert.deepEqual(CONSTITUTION_SKILLS.members, [
      'constitution-generator', 'skills-researcher'
    ]);
    assert.equal(CONSTITUTION_SKILLS.parallelism, 'sequential');
    assert.deepEqual(CONSTITUTION_SKILLS.required_for_modes, [
      'discover_existing', 'discover_new', 'discover_deep'
    ]);
  });

  it('AG-05: new_project_core has correct members', () => {
    assert.equal(NEW_PROJECT_CORE.id, 'new_project_core');
    assert.deepEqual(NEW_PROJECT_CORE.members, [
      'product-analyst', 'architecture-designer'
    ]);
    assert.equal(NEW_PROJECT_CORE.parallelism, 'sequential');
    assert.deepEqual(NEW_PROJECT_CORE.required_for_modes, ['discover_new']);
  });

  it('AG-06: new_project_party has correct members (AC-002-04)', () => {
    assert.equal(NEW_PROJECT_PARTY.id, 'new_project_party');
    assert.deepEqual(NEW_PROJECT_PARTY.members, [
      'domain-researcher', 'technical-scout', 'solution-architect-party',
      'security-advisor', 'devops-pragmatist', 'data-model-designer', 'test-strategist'
    ]);
    assert.equal(NEW_PROJECT_PARTY.parallelism, 'parallel');
    assert.deepEqual(NEW_PROJECT_PARTY.required_for_modes, ['discover_new']);
  });

  it('AG-07: deep_standard has correct members (AC-003-02)', () => {
    assert.equal(DEEP_STANDARD.id, 'deep_standard');
    assert.deepEqual(DEEP_STANDARD.members, [
      'security-auditor', 'technical-debt-auditor'
    ]);
    assert.equal(DEEP_STANDARD.parallelism, 'parallel');
    assert.deepEqual(DEEP_STANDARD.required_for_modes, ['discover_deep']);
    assert.equal(DEEP_STANDARD.depth_level, 'standard');
  });

  it('AG-08: deep_full has correct members (AC-003-03)', () => {
    assert.equal(DEEP_FULL.id, 'deep_full');
    assert.deepEqual(DEEP_FULL.members, [
      'performance-analyst', 'ops-readiness-reviewer'
    ]);
    assert.equal(DEEP_FULL.parallelism, 'parallel');
    assert.deepEqual(DEEP_FULL.required_for_modes, ['discover_deep']);
    assert.equal(DEEP_FULL.depth_level, 'full');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Field Schema (AC-002-02)
// ---------------------------------------------------------------------------

describe('FR-002: Agent Group Field Schema', () => {
  it('AG-09: every group has at least the required fields (AC-002-02)', () => {
    for (const { name, group } of ALL_GROUPS) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(field in group, `${name} missing field: ${field}`);
      }
    }
  });

  it('AG-10: parallelism is parallel or sequential for all groups (AC-002-02)', () => {
    const allowed = ['parallel', 'sequential'];
    for (const { name, group } of ALL_GROUPS) {
      assert.ok(
        allowed.includes(group.parallelism),
        `${name}.parallelism "${group.parallelism}" not in ${JSON.stringify(allowed)}`
      );
    }
  });

  it('AG-11: members field is a non-empty array of strings (AC-002-02)', () => {
    for (const { name, group } of ALL_GROUPS) {
      assert.ok(Array.isArray(group.members), `${name}.members should be array`);
      assert.ok(group.members.length > 0, `${name}.members should not be empty`);
      for (const m of group.members) {
        assert.equal(typeof m, 'string', `${name}.members should contain only strings`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe('Agent Group Immutability', () => {
  it('AG-12: all groups are frozen', () => {
    for (const { name, group } of ALL_GROUPS) {
      assert.ok(Object.isFrozen(group), `${name} should be frozen`);
    }
  });

  it('AG-13: frozen groups reject mutation', () => {
    assert.throws(
      () => { CORE_ANALYZERS.id = 'hacked'; },
      TypeError
    );
  });
});
