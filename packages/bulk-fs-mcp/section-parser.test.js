'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { findSection, spliceSection } = require('./section-parser.js');

// REQ-0048 / FR-003 — Section Parser Unit Tests

// -- Test Fixtures --
const singleSection = '# Title\n\n## Section One\n\nContent here.\n';
const multiSection = '# Title\n\n## Section One\n\nContent one.\n\n## Section Two\n\nContent two.\n\n## Section Three\n\nContent three.\n';
const nestedHeadings = '## Parent\n\nParent content.\n\n### Child\n\nChild content.\n\n## Sibling\n\nSibling content.\n';
const markerSection = '<!-- section: intro -->\n## Introduction\n\nIntro content.\n\n<!-- section: body -->\n## Body\n\nBody content.\n';
const emptySection = '## Empty\n\n## Next\n\nContent.\n';
const endOfFile = '## Last Section\n\nFinal content.';

describe('section-parser', () => {
  // --- Heading Match: Positive Tests ---

  // SP-01: findSection locates ## heading at level 2 (AC-003-02)
  it('SP-01: findSection locates ## heading at level 2', () => {
    const bounds = findSection(multiSection, '## Section One');
    assert.notEqual(bounds, null);
    assert.equal(bounds.level, 2);
    // Section starts at line after heading
    const lines = multiSection.split('\n');
    assert.equal(lines[bounds.start - 1], '## Section One');
  });

  // SP-02: findSection locates ### heading at level 3 (AC-003-02)
  it('SP-02: findSection locates ### heading at level 3', () => {
    const bounds = findSection(nestedHeadings, '### Child');
    assert.notEqual(bounds, null);
    assert.equal(bounds.level, 3);
  });

  // SP-03: findSection locates # heading at level 1 (AC-003-02)
  it('SP-03: findSection locates # heading at level 1', () => {
    const bounds = findSection(singleSection, '# Title');
    assert.notEqual(bounds, null);
    assert.equal(bounds.level, 1);
  });

  // SP-04: Section ends at next heading of equal level (AC-003-04)
  it('SP-04: section ends at next heading of equal level', () => {
    const content = '## A\nfoo\n## B\nbar';
    const bounds = findSection(content, '## A');
    assert.notEqual(bounds, null);
    const lines = content.split('\n');
    assert.equal(lines[bounds.end], '## B');
  });

  // SP-05: Section ends at next heading of higher level (AC-003-04)
  it('SP-05: section ends at next heading of higher level (lower number)', () => {
    const content = '## A\nfoo\n# B\nbar';
    const bounds = findSection(content, '## A');
    assert.notEqual(bounds, null);
    const lines = content.split('\n');
    assert.equal(lines[bounds.end], '# B');
  });

  // SP-06: Section includes sub-headings (AC-003-04)
  it('SP-06: section includes sub-headings (lower-level headings)', () => {
    const bounds = findSection(nestedHeadings, '## Parent');
    assert.notEqual(bounds, null);
    // Section should include ### Child and end at ## Sibling
    const lines = nestedHeadings.split('\n');
    assert.equal(lines[bounds.end], '## Sibling');
    // Verify ### Child is within bounds
    const childIndex = lines.indexOf('### Child');
    assert.ok(childIndex >= bounds.start && childIndex < bounds.end);
  });

  // SP-07: Section ends at EOF when no subsequent heading (AC-003-04)
  it('SP-07: section ends at EOF when no subsequent heading', () => {
    const bounds = findSection(endOfFile, '## Last Section');
    assert.notEqual(bounds, null);
    const lines = endOfFile.split('\n');
    assert.equal(bounds.end, lines.length);
  });

  // SP-08: findSection without heading prefix assumes level 2 (AC-003-02)
  it('SP-08: findSection without heading prefix assumes ## (level 2)', () => {
    const bounds = findSection(multiSection, 'Section One');
    assert.notEqual(bounds, null);
    assert.equal(bounds.level, 2);
  });

  // SP-09: spliceSection replaces content between bounds correctly (AC-003-04)
  it('SP-09: spliceSection replaces content between bounds correctly', () => {
    const bounds = findSection(multiSection, '## Section Two');
    assert.notEqual(bounds, null);
    const result = spliceSection(multiSection, bounds, 'Updated content.');
    assert.ok(result.includes('Updated content.'));
    assert.ok(result.includes('## Section Two'));
  });

  // SP-10: spliceSection preserves content before and after the section (AC-003-04)
  it('SP-10: spliceSection preserves content before and after section', () => {
    const bounds = findSection(multiSection, '## Section Two');
    assert.notEqual(bounds, null);
    const result = spliceSection(multiSection, bounds, 'Replaced.');
    assert.ok(result.includes('Content one.'));
    assert.ok(result.includes('Content three.'));
    assert.ok(result.includes('Replaced.'));
    assert.ok(!result.includes('Content two.'));
  });

  // --- Marker Match: Positive Tests ---

  // SP-11: findSection locates <!-- section: id --> marker (AC-003-03)
  it('SP-11: findSection locates marker comment', () => {
    const bounds = findSection(markerSection, 'intro', 'marker');
    assert.notEqual(bounds, null);
  });

  // SP-12: Marker match: section ends at next equal/higher heading (AC-003-03, AC-003-04)
  it('SP-12: marker match section ends at next equal/higher heading', () => {
    const content = '<!-- section: a -->\n## A\nfoo\n## B\nbar';
    const bounds = findSection(content, 'a', 'marker');
    assert.notEqual(bounds, null);
    const lines = content.split('\n');
    // Should end at ## B since it is equal-level heading after the marker's section
    assert.equal(lines[bounds.end], '## B');
  });

  // SP-13: Marker match: section ends at next marker (AC-003-03)
  it('SP-13: marker match section ends at next marker', () => {
    const content = '<!-- section: a -->\nfoo\n<!-- section: b -->\nbar';
    const bounds = findSection(content, 'a', 'marker');
    assert.notEqual(bounds, null);
    const lines = content.split('\n');
    assert.equal(lines[bounds.end], '<!-- section: b -->');
  });

  // --- Negative Tests ---

  // SP-14: findSection returns null when heading not found (AC-003-06)
  it('SP-14: returns null when heading not found', () => {
    const bounds = findSection(multiSection, '## Missing');
    assert.equal(bounds, null);
  });

  // SP-15: findSection returns null when marker not found (AC-003-06)
  it('SP-15: returns null when marker not found', () => {
    const bounds = findSection(markerSection, 'missing', 'marker');
    assert.equal(bounds, null);
  });

  // SP-16: findSection returns null for empty content (AC-003-06)
  it('SP-16: returns null for empty content', () => {
    const bounds = findSection('', '## A');
    assert.equal(bounds, null);
  });

  // SP-17: findSection with empty sectionId returns null (AC-003-06)
  it('SP-17: returns null for empty sectionId', () => {
    const bounds = findSection(multiSection, '');
    assert.equal(bounds, null);
  });

  // --- Boundary Tests ---

  // SP-18: Section at very start of document (AC-003-02)
  it('SP-18: section at document start (first line is heading)', () => {
    const content = '## A\nfoo\n## B\nbar';
    const bounds = findSection(content, '## A');
    assert.notEqual(bounds, null);
    assert.equal(bounds.start, 1); // line after heading
  });

  // SP-19: Section at very end of document, no trailing newline (AC-003-04)
  it('SP-19: section at document end, no trailing newline', () => {
    const content = '## A\nfoo\n## B\nbar';
    const bounds = findSection(content, '## B');
    assert.notEqual(bounds, null);
    const lines = content.split('\n');
    assert.equal(bounds.end, lines.length); // EOF
  });

  // SP-20: Multiple sections with same heading text -- matches first (AC-003-02)
  it('SP-20: duplicate headings matches first occurrence', () => {
    const content = '## A\nfoo\n## A\nbar';
    const bounds = findSection(content, '## A');
    assert.notEqual(bounds, null);
    assert.equal(bounds.start, 1); // first occurrence
    const lines = content.split('\n');
    // End should be at second ## A
    assert.equal(lines[bounds.end], '## A');
  });

  // SP-21: Section with empty body (AC-003-04)
  it('SP-21: section with empty body (heading followed by next heading)', () => {
    const bounds = findSection(emptySection, '## Empty');
    assert.notEqual(bounds, null);
    // Empty section means start === end (or just blank lines)
    assert.ok(bounds.end > bounds.start || bounds.start === bounds.end);
  });

  // SP-22: Heading with extra whitespace (AC-003-02)
  it('SP-22: heading with extra whitespace returns null (strict match)', () => {
    const content = '##  Foo\n\nContent.\n';
    const bounds = findSection(content, '## Foo');
    assert.equal(bounds, null);
  });
});
