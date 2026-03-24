/**
 * Tests for cache section injection in src/providers/codex/projection.js
 * REQ-0138: Codex Session Cache Re-priming + AGENTS.md Template
 *
 * Tests parseCacheSections helper and projectInstructions cache injection.
 * Uses fixture session-cache.md for realistic delimiter parsing.
 *
 * Test ID prefix: PRC-
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';

import {
  parseCacheSections,
  projectInstructions
} from '../../../src/providers/codex/projection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const fixtureDir = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// parseCacheSections
// ---------------------------------------------------------------------------

describe('parseCacheSections (REQ-0138 FR-007)', () => {
  // PRC-01: Parses all delimited sections from fixture
  it('PRC-01: parses CONSTITUTION, WORKFLOW_CONFIG, SKILL_INDEX, ITERATION_REQUIREMENTS (AC-007-02)', () => {
    const content = readFileSync(join(fixtureDir, 'session-cache.md'), 'utf-8');
    const sections = parseCacheSections(content);

    assert.ok('CONSTITUTION' in sections, 'Should parse CONSTITUTION section');
    assert.ok('WORKFLOW_CONFIG' in sections, 'Should parse WORKFLOW_CONFIG section');
    assert.ok('SKILL_INDEX' in sections, 'Should parse SKILL_INDEX section');
    assert.ok('ITERATION_REQUIREMENTS' in sections, 'Should parse ITERATION_REQUIREMENTS section');
  });

  // PRC-02: Section content is trimmed
  it('PRC-02: section content is trimmed (AC-007-02)', () => {
    const content = '<!-- SECTION: TEST -->\n  hello  \n<!-- /SECTION: TEST -->';
    const sections = parseCacheSections(content);
    assert.strictEqual(sections.TEST, 'hello');
  });

  // PRC-03: Returns empty object for no sections
  it('PRC-03: returns empty object when no delimiters found (AC-008-02)', () => {
    const sections = parseCacheSections('No sections here, just plain text.');
    assert.deepStrictEqual(sections, {});
  });

  // PRC-04: Handles empty string
  it('PRC-04: handles empty string input (AC-008-02)', () => {
    const sections = parseCacheSections('');
    assert.deepStrictEqual(sections, {});
  });

  // PRC-05: Handles multiple sections with content
  it('PRC-05: correctly extracts content between matching delimiters', () => {
    const content = [
      '<!-- SECTION: A -->',
      'Alpha content',
      '<!-- /SECTION: A -->',
      'gap text',
      '<!-- SECTION: B -->',
      'Beta content',
      '<!-- /SECTION: B -->'
    ].join('\n');

    const sections = parseCacheSections(content);
    assert.strictEqual(sections.A, 'Alpha content');
    assert.strictEqual(sections.B, 'Beta content');
  });

  // PRC-06: Ignores mismatched delimiters
  it('PRC-06: ignores mismatched opening/closing delimiters', () => {
    const content = '<!-- SECTION: X -->\nContent\n<!-- /SECTION: Y -->';
    const sections = parseCacheSections(content);
    // X opens but Y closes -- regex requires matching names, so X is not captured
    assert.ok(!('X' in sections), 'Should not capture mismatched section');
  });

  // PRC-07: Section names can contain underscores
  it('PRC-07: section names with underscores parse correctly', () => {
    const content = '<!-- SECTION: SKILL_INDEX -->\nskills here\n<!-- /SECTION: SKILL_INDEX -->';
    const sections = parseCacheSections(content);
    assert.strictEqual(sections.SKILL_INDEX, 'skills here');
  });

  // PRC-08: Fixture has expected section content
  it('PRC-08: fixture CONSTITUTION section contains article references', () => {
    const content = readFileSync(join(fixtureDir, 'session-cache.md'), 'utf-8');
    const sections = parseCacheSections(content);
    assert.ok(sections.CONSTITUTION.includes('Article I'), 'Should contain Article I');
  });
});

// ---------------------------------------------------------------------------
// projectInstructions cache injection
// ---------------------------------------------------------------------------

describe('projectInstructions cache injection (REQ-0138 FR-007)', () => {
  let tempDir;
  let projectDir;

  beforeEach(() => {
    tempDir = createTempDir();
    projectDir = join(tempDir, 'project');
    mkdirSync(join(projectDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => cleanupTempDir(tempDir));

  // PRC-09: Injects cache sections when file exists
  it('PRC-09: appends cache sections to content when session-cache.md exists (AC-007-01)', () => {
    // Copy fixture to project
    const fixtureSrc = readFileSync(join(fixtureDir, 'session-cache.md'), 'utf-8');
    writeFileSync(join(projectDir, '.isdlc', 'session-cache.md'), fixtureSrc, 'utf-8');

    const result = projectInstructions('06-implementation', '05-software-developer', {
      projectRoot: projectDir
    });

    assert.ok(result.content.includes('Article I'), 'Should inject CONSTITUTION content');
    assert.ok(result.content.includes('track: standard'), 'Should inject WORKFLOW_CONFIG content');
    assert.ok(result.content.includes('code-implementation'), 'Should inject SKILL_INDEX content');
    assert.ok(result.content.includes('max_iterations'), 'Should inject ITERATION_REQUIREMENTS content');
  });

  // PRC-10: Fail-open on missing file
  it('PRC-10: fail-open when session-cache.md does not exist (AC-008-01)', () => {
    // No cache file created
    const result = projectInstructions('06-implementation', '05-software-developer', {
      projectRoot: projectDir
    });

    assert.strictEqual(typeof result.content, 'string', 'Should still return content');
    assert.ok('metadata' in result, 'Should still have metadata');
    // No error thrown
  });

  // PRC-11: Fail-open on malformed content
  it('PRC-11: fail-open when session-cache.md is malformed (AC-008-02)', () => {
    writeFileSync(
      join(projectDir, '.isdlc', 'session-cache.md'),
      'This is not valid section-delimited content\n{broken: json: stuff}',
      'utf-8'
    );

    const result = projectInstructions('06-implementation', '05-software-developer', {
      projectRoot: projectDir
    });

    assert.strictEqual(typeof result.content, 'string', 'Should still return content');
    assert.ok('metadata' in result, 'Should still have metadata');
  });

  // PRC-12: Missing individual sections are skipped
  it('PRC-12: skips missing individual sections, includes present ones (AC-008-03)', () => {
    // Only CONSTITUTION section, others missing
    const partialCache = [
      '<!-- SECTION: CONSTITUTION -->',
      'Only constitution here',
      '<!-- /SECTION: CONSTITUTION -->'
    ].join('\n');
    writeFileSync(join(projectDir, '.isdlc', 'session-cache.md'), partialCache, 'utf-8');

    const result = projectInstructions('06-implementation', '05-software-developer', {
      projectRoot: projectDir
    });

    assert.ok(result.content.includes('Only constitution here'), 'Should inject available section');
    // Should not crash for missing sections
  });

  // PRC-13: No projectRoot option means no injection
  it('PRC-13: no cache injection when projectRoot is not provided', () => {
    const result = projectInstructions('06-implementation', '05-software-developer');
    // Should work fine without projectRoot, just no cache
    assert.strictEqual(typeof result.content, 'string');
    assert.ok('metadata' in result);
  });

  // PRC-14: Cache sections appear after assembled markdown
  it('PRC-14: cache sections are appended after the main assembled content (AC-007-04)', () => {
    const fixtureSrc = readFileSync(join(fixtureDir, 'session-cache.md'), 'utf-8');
    writeFileSync(join(projectDir, '.isdlc', 'session-cache.md'), fixtureSrc, 'utf-8');

    const result = projectInstructions('06-implementation', '05-software-developer', {
      projectRoot: projectDir
    });

    // The main content should come before cache sections
    const constitutionIdx = result.content.indexOf('## Cached: CONSTITUTION');
    assert.ok(constitutionIdx > 0, 'Cache sections should be appended (not at start)');
  });

  // PRC-15: metadata.cache_sections_injected field
  it('PRC-15: metadata reports which cache sections were injected', () => {
    const fixtureSrc = readFileSync(join(fixtureDir, 'session-cache.md'), 'utf-8');
    writeFileSync(join(projectDir, '.isdlc', 'session-cache.md'), fixtureSrc, 'utf-8');

    const result = projectInstructions('06-implementation', '05-software-developer', {
      projectRoot: projectDir
    });

    assert.ok(
      result.metadata.cache_sections_injected,
      'Should have cache_sections_injected in metadata'
    );
    assert.ok(Array.isArray(result.metadata.cache_sections_injected));
    assert.ok(result.metadata.cache_sections_injected.includes('CONSTITUTION'));
    assert.ok(result.metadata.cache_sections_injected.includes('WORKFLOW_CONFIG'));
    assert.ok(result.metadata.cache_sections_injected.includes('SKILL_INDEX'));
    assert.ok(result.metadata.cache_sections_injected.includes('ITERATION_REQUIREMENTS'));
  });
});
