/**
 * Unit tests for src/core/content/topic-classification.js — Topic Content Classification
 *
 * Tests all 6 topics, portability summary.
 * Requirements: REQ-0102 FR-001 (AC-001-01..02), FR-002 (AC-002-01..06), FR-003 (AC-003-01..02)
 *
 * Test ID prefix: TC- (Topic Classification)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTopicClassification,
  listClassifiedTopics,
  getTopicPortabilitySummary
} from '../../../src/core/content/topic-classification.js';

const EXPECTED_TOPICS = [
  'problem-discovery', 'technical-analysis', 'requirements-definition',
  'architecture', 'security', 'specification'
];

const EXPECTED_SECTION_NAMES = [
  'frontmatter', 'depth_guidance', 'analytical_knowledge',
  'validation_criteria', 'artifact_instructions', 'source_step_files'
];

// ---------------------------------------------------------------------------
// FR-001: Topic Classification Coverage
// ---------------------------------------------------------------------------

describe('Topic Classification: Coverage (FR-001)', () => {
  it('TC-01: listClassifiedTopics returns exactly 6 topic IDs (AC-001-01)', () => {
    const topics = listClassifiedTopics();
    assert.equal(topics.length, 6);
    assert.deepEqual(topics.sort(), [...EXPECTED_TOPICS].sort());
  });

  it('TC-06: getTopicClassification returns for valid topic (AC-003-02)', () => {
    const sections = getTopicClassification('architecture');
    assert.ok(Array.isArray(sections));
    assert.ok(sections.length > 0);
  });

  it('TC-07: getTopicClassification throws for unknown topic', () => {
    assert.throws(
      () => getTopicClassification('nonexistent-topic'),
      { message: /unknown topic/i }
    );
  });
});

// ---------------------------------------------------------------------------
// FR-002: Standard Topic Classifications
// ---------------------------------------------------------------------------

describe('Topic Classification: Standard Sections (FR-002)', () => {
  it('TC-02: each topic has 6 sections (AC-002-01..06)', () => {
    for (const topicId of EXPECTED_TOPICS) {
      const sections = getTopicClassification(topicId);
      assert.equal(sections.length, 6, `${topicId} should have 6 sections`);
      const names = sections.map(s => s.name);
      assert.deepEqual(names, EXPECTED_SECTION_NAMES,
        `${topicId} section names should match expected`);
    }
  });

  it('TC-03: first 5 sections are role_spec/full (AC-002-01..05)', () => {
    for (const topicId of EXPECTED_TOPICS) {
      const sections = getTopicClassification(topicId);
      for (let i = 0; i < 5; i++) {
        assert.equal(sections[i].type, 'role_spec',
          `${topicId}.${sections[i].name} type should be role_spec`);
        assert.equal(sections[i].portability, 'full',
          `${topicId}.${sections[i].name} portability should be full`);
      }
    }
  });

  it('TC-04: source_step_files classified as runtime_packaging/none (AC-002-06)', () => {
    for (const topicId of EXPECTED_TOPICS) {
      const sections = getTopicClassification(topicId);
      const ssf = sections.find(s => s.name === 'source_step_files');
      assert.ok(ssf, `${topicId} should have source_step_files`);
      assert.equal(ssf.type, 'runtime_packaging');
      assert.equal(ssf.portability, 'none');
    }
  });
});

// ---------------------------------------------------------------------------
// FR-003: Portability Summary
// ---------------------------------------------------------------------------

describe('Topic Classification: Portability Summary (FR-003)', () => {
  it('TC-05: getTopicPortabilitySummary shows >95% portable (AC-003-01)', () => {
    const summary = getTopicPortabilitySummary();
    assert.equal(typeof summary.full, 'number');
    assert.equal(typeof summary.partial, 'number');
    assert.equal(typeof summary.none, 'number');
    // >95% portable means full > 95
    assert.ok(summary.full > 95,
      `Expected >95% full portability, got ${summary.full}%`);
    const total = summary.full + summary.partial + summary.none;
    assert.ok(total >= 99 && total <= 101,
      `Percentages should sum to ~100, got ${total}`);
  });
});

// ---------------------------------------------------------------------------
// Frozen Data
// ---------------------------------------------------------------------------

describe('Topic Classification: Frozen Data', () => {
  it('TC-08: all classification entries are frozen', () => {
    for (const topicId of EXPECTED_TOPICS) {
      const sections = getTopicClassification(topicId);
      assert.ok(Object.isFrozen(sections), `${topicId} sections should be frozen`);
      for (const section of sections) {
        assert.ok(Object.isFrozen(section), `${topicId}.${section.name} should be frozen`);
      }
    }
  });
});
