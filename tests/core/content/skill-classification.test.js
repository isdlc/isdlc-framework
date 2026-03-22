/**
 * Unit tests for src/core/content/skill-classification.js — Skill Content Classification
 *
 * Tests template, category portability, lookup.
 * Requirements: REQ-0100 FR-002 (AC-002-01..06), FR-003 (AC-003-01..03)
 *
 * Test ID prefix: SK- (Skill Classification)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getSkillSectionTemplate,
  getSkillClassification,
  getCategoryPortability,
  listCategories
} from '../../../src/core/content/skill-classification.js';

const EXPECTED_CATEGORY_COUNT = 17;

const EXPECTED_CATEGORIES = [
  'analysis-topics', 'architecture', 'design', 'development', 'devops',
  'discover', 'documentation', 'impact-analysis', 'operations',
  'orchestration', 'quick-scan', 'requirements', 'reverse-engineer',
  'security', 'testing', 'tracing', 'upgrade'
];

const STANDARD_SECTION_NAMES = [
  'frontmatter', 'purpose', 'when_to_use',
  'prerequisites', 'process_steps', 'output_format'
];

// ---------------------------------------------------------------------------
// FR-002: Standard Skill Sections
// ---------------------------------------------------------------------------

describe('Skill Classification: Section Template (FR-002)', () => {
  it('SK-01: getSkillSectionTemplate returns 6 standard sections (AC-002-01..06)', () => {
    const template = getSkillSectionTemplate();
    assert.equal(template.length, 6);
    const names = template.map(s => s.name);
    assert.deepEqual(names, STANDARD_SECTION_NAMES);
  });

  it('SK-01b: frontmatter is role_spec/full (AC-002-01)', () => {
    const template = getSkillSectionTemplate();
    const fm = template.find(s => s.name === 'frontmatter');
    assert.equal(fm.type, 'role_spec');
    assert.equal(fm.portability, 'full');
  });

  it('SK-01c: process_steps is mixed/partial (AC-002-04)', () => {
    const template = getSkillSectionTemplate();
    const ps = template.find(s => s.name === 'process_steps');
    assert.equal(ps.type, 'mixed');
    assert.equal(ps.portability, 'partial');
  });

  it('SK-01d: output_format is mixed/partial (AC-002-06)', () => {
    const template = getSkillSectionTemplate();
    const of = template.find(s => s.name === 'output_format');
    assert.equal(of.type, 'mixed');
    assert.equal(of.portability, 'partial');
  });

  it('SK-06: template sections are frozen', () => {
    const template = getSkillSectionTemplate();
    assert.ok(Object.isFrozen(template));
    for (const section of template) {
      assert.ok(Object.isFrozen(section));
    }
  });
});

// ---------------------------------------------------------------------------
// FR-003: Category Portability
// ---------------------------------------------------------------------------

describe('Skill Classification: Category Portability (FR-003)', () => {
  it('SK-05: listCategories returns exactly 17 categories', () => {
    const categories = listCategories();
    assert.equal(categories.length, EXPECTED_CATEGORY_COUNT);
    assert.deepEqual(categories.sort(), [...EXPECTED_CATEGORIES].sort());
  });

  it('SK-03: getCategoryPortability returns summary for each category (AC-003-01)', () => {
    for (const category of EXPECTED_CATEGORIES) {
      const summary = getCategoryPortability(category);
      assert.equal(typeof summary.full, 'number', `${category}.full should be a number`);
      assert.equal(typeof summary.partial, 'number', `${category}.partial should be a number`);
      assert.equal(typeof summary.none, 'number', `${category}.none should be a number`);
    }
  });

  it('SK-04: category portability percentages sum to ~100 (AC-003-01)', () => {
    for (const category of EXPECTED_CATEGORIES) {
      const summary = getCategoryPortability(category);
      const total = summary.full + summary.partial + summary.none;
      assert.ok(total >= 99 && total <= 101,
        `${category} percentages sum to ${total}, expected ~100`);
    }
  });

  it('SK-03b: getCategoryPortability throws for unknown category', () => {
    assert.throws(
      () => getCategoryPortability('nonexistent'),
      { message: /unknown category/i }
    );
  });
});

// ---------------------------------------------------------------------------
// FR-003: Skill Lookup
// ---------------------------------------------------------------------------

describe('Skill Classification: Skill Lookup (FR-003)', () => {
  it('SK-02: getSkillClassification returns sections for valid skill (AC-003-02)', () => {
    // Use a skill from the development category
    const sections = getSkillClassification('code-implementation');
    assert.ok(Array.isArray(sections));
    assert.equal(sections.length, 6);
    const names = sections.map(s => s.name);
    assert.deepEqual(names, STANDARD_SECTION_NAMES);
  });

  it('SK-07: getSkillClassification throws for unknown skill (AC-003-02)', () => {
    assert.throws(
      () => getSkillClassification('nonexistent-skill'),
      { message: /unknown skill/i }
    );
  });
});
