/**
 * Unit tests for src/core/skills/injection-planner.js -- Skill Injection Planner
 *
 * Tests computeInjectionPlan() for built-in skill resolution, external skill
 * resolution, precedence rules, and fail-open behavior.
 * Requirements: REQ-0126 (FR-001..FR-004)
 *
 * Test ID prefix: IP- (Injection Planner)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeInjectionPlan } from '../../../src/core/skills/injection-planner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

const fixtureManifest = join(FIXTURES, 'fixture-skills-manifest.json');
const fixtureExternal = join(FIXTURES, 'fixture-external-manifest.json');

// ---------------------------------------------------------------------------
// FR-001: Compute Injection Plan (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0126 FR-001: Compute Injection Plan', () => {
  // IP-01: computeInjectionPlan returns { builtIn, external, merged } arrays
  it('IP-01: returns { builtIn, external, merged } arrays (AC-001-01)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    });
    assert.ok(Array.isArray(plan.builtIn), 'builtIn should be an array');
    assert.ok(Array.isArray(plan.external), 'external should be an array');
    assert.ok(Array.isArray(plan.merged), 'merged should be an array');
  });

  // IP-02: Each merged entry has skillId, name, file, deliveryType, source
  it('IP-02: each merged entry has skillId, name, file, deliveryType, source (AC-001-02)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    });
    assert.ok(plan.merged.length > 0, 'merged should have entries');
    for (const entry of plan.merged) {
      assert.ok('skillId' in entry, 'entry should have skillId');
      assert.ok('name' in entry, 'entry should have name');
      assert.ok('file' in entry, 'entry should have file');
      assert.ok('deliveryType' in entry, 'entry should have deliveryType');
      assert.ok('source' in entry, 'entry should have source');
    }
  });
});

// ---------------------------------------------------------------------------
// FR-001: Fail-Open (Negative)
// ---------------------------------------------------------------------------

describe('REQ-0126 FR-001: Fail-Open Behavior', () => {
  // IP-03: Returns empty plan when skills manifest is missing
  it('IP-03: returns empty plan when skills manifest is missing (AC-001-03)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: '/nonexistent/skills-manifest.json',
      externalManifestPath: fixtureExternal
    });
    assert.ok(Array.isArray(plan.builtIn));
    assert.equal(plan.builtIn.length, 0);
    assert.ok(Array.isArray(plan.merged));
  });

  // IP-04: Returns empty plan when external manifest is missing
  it('IP-04: returns empty external when external manifest is missing (AC-001-03)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: '/nonexistent/external.json'
    });
    assert.ok(Array.isArray(plan.external));
    assert.equal(plan.external.length, 0);
    // builtIn should still work
    assert.ok(plan.builtIn.length > 0, 'builtIn should still resolve');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Built-In Skill Resolution (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0126 FR-002: Built-In Skill Resolution', () => {
  // IP-05: Reads ownership section and finds agent's skill list
  it('IP-05: reads ownership section and finds agent skill list (AC-002-01)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: '/nonexistent/external.json'
    });
    assert.equal(plan.builtIn.length, 3, 'test-agent has 3 skills in fixture');
    const skillIds = plan.builtIn.map(s => s.skillId);
    assert.ok(skillIds.includes('TEST-001'));
    assert.ok(skillIds.includes('TEST-002'));
    assert.ok(skillIds.includes('TEST-003'));
  });

  // IP-06: Maps skill IDs to SKILL.md paths from skill_lookup
  it('IP-06: maps skill IDs to SKILL.md paths (AC-002-02)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: '/nonexistent/external.json'
    });
    for (const entry of plan.builtIn) {
      assert.equal(entry.source, 'built_in');
      assert.equal(entry.deliveryType, 'reference', 'Built-in skills use reference delivery');
      // file should be a string (path) or null if not resolvable
      assert.ok(typeof entry.file === 'string' || entry.file === null,
        'file should be a string path or null');
    }
  });
});

// ---------------------------------------------------------------------------
// FR-003: External Skill Resolution (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0126 FR-003: External Skill Resolution', () => {
  // IP-07: Filters by phase/agent match + injection_mode=always
  it('IP-07: filters external skills by phase/agent + injection_mode=always (AC-003-01)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    });
    const extNames = plan.external.map(e => e.name);
    // external-skill-a matches phase + agent + always
    assert.ok(extNames.includes('external-skill-a'), 'Should include phase+agent+always match');
    // external-skill-d matches phase + agent + always
    assert.ok(extNames.includes('external-skill-d'), 'Should include phase+agent+always match');
    // external-skill-b matches agent but wrong phase (01-requirements, not 06-implementation)
    assert.ok(!extNames.includes('external-skill-b'), 'Should exclude wrong phase');
    // external-skill-c has injection_mode=manual
    assert.ok(!extNames.includes('external-skill-c'), 'Should exclude manual injection_mode');
  });

  // IP-08: Respects delivery_type from bindings
  it('IP-08: respects delivery_type from bindings (AC-003-02)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    });
    const skillA = plan.external.find(e => e.name === 'external-skill-a');
    assert.ok(skillA, 'external-skill-a should be present');
    assert.equal(skillA.deliveryType, 'context');

    const skillD = plan.external.find(e => e.name === 'external-skill-d');
    assert.ok(skillD, 'external-skill-d should be present');
    assert.equal(skillD.deliveryType, 'reference');
  });

  // IP-09: Content >10000 chars forces delivery_type to 'reference'
  it('IP-09: content >10000 chars forces deliveryType to reference (AC-003-03)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal,
      contentLengthOverrides: {
        'external-skill-a': 10001
      }
    });
    const skillA = plan.external.find(e => e.name === 'external-skill-a');
    assert.ok(skillA, 'external-skill-a should be present');
    assert.equal(skillA.deliveryType, 'reference',
      'Should force reference when content >10000 chars');
  });
});

// ---------------------------------------------------------------------------
// FR-003: External Boundary (Negative)
// ---------------------------------------------------------------------------

describe('REQ-0126 FR-003: Content Length Boundary', () => {
  // IP-10: Content at exactly 10000 chars keeps original delivery_type
  it('IP-10: content at exactly 10000 chars keeps original deliveryType (AC-003-03)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal,
      contentLengthOverrides: {
        'external-skill-a': 10000
      }
    });
    const skillA = plan.external.find(e => e.name === 'external-skill-a');
    assert.ok(skillA, 'external-skill-a should be present');
    assert.equal(skillA.deliveryType, 'context',
      'Should keep original deliveryType at exactly 10000 chars');
  });
});

// ---------------------------------------------------------------------------
// FR-004: Precedence Rules (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0126 FR-004: Precedence Rules', () => {
  // IP-11: Built-in skills appear before external in merged list
  it('IP-11: built-in skills appear before external in merged (AC-004-01)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    });
    // Find first external index and last built-in index
    let lastBuiltIn = -1;
    let firstExternal = plan.merged.length;
    plan.merged.forEach((entry, idx) => {
      if (entry.source === 'built_in' && idx > lastBuiltIn) lastBuiltIn = idx;
      if (entry.source === 'external' && idx < firstExternal) firstExternal = idx;
    });
    assert.ok(lastBuiltIn < firstExternal,
      'All built-in should come before all external in merged');
  });

  // IP-12: Phase-specific bindings take precedence over agent-wide bindings
  it('IP-12: phase-specific bindings take precedence over agent-wide (AC-004-02)', () => {
    const plan = computeInjectionPlan('feature', '06-implementation', 'test-agent', {
      manifestPath: fixtureManifest,
      externalManifestPath: fixtureExternal
    });
    // external-skill-a and external-skill-d are both phase-specific (06-implementation)
    // external-skill-b is agent-wide (different phase) and should be excluded
    const extNames = plan.external.map(e => e.name);
    assert.ok(!extNames.includes('external-skill-b'),
      'Agent-wide binding with wrong phase should be excluded');
  });
});
