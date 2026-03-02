/**
 * Structural Validation Tests for Concurrent Roundtable Analysis
 *
 * Verifies file-level correctness of the concurrent analyze rearchitecture:
 * - New agent files exist (roundtable-lead.md, 3 persona files)
 * - Old agent file removed (roundtable-analyst.md)
 * - YAML frontmatter valid on all new files
 * - Required sections present in each file
 * - Topic directories and files exist with correct frontmatter
 * - isdlc.md dispatch updated to single dispatch
 * - No elaboration mode or menu system references in new files
 *
 * Traces: FR-008, FR-009, FR-014, FR-016, FR-017
 * Test IDs: SV-01 through SV-13
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Resolve project root (4 levels up from this test file)
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const AGENTS_DIR = path.join(PROJECT_ROOT, 'src', 'claude', 'agents');
const TOPICS_DIR = path.join(PROJECT_ROOT, 'src', 'claude', 'skills', 'analysis-topics');
const ISDLC_MD = path.join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');

// Helper: extract YAML frontmatter from a markdown file
function extractFrontmatter(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  // Simple YAML key-value parser (sufficient for our flat frontmatter)
  const yaml = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let currentArray = null;

  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      if (value.trim() === '' || value.trim() === '[]') {
        // Possibly an array or empty value
        if (value.trim() === '[]') {
          yaml[key] = [];
        } else {
          yaml[key] = '';
          currentKey = key;
          currentArray = [];
        }
      } else {
        // Strip quotes
        yaml[key] = value.replace(/^["']|["']$/g, '').trim();
        currentKey = null;
        currentArray = null;
      }
    } else if (currentKey && line.match(/^\s+-\s+/)) {
      // Array item
      const item = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '').trim();
      currentArray.push(item);
      yaml[currentKey] = currentArray;
    }
  }
  return yaml;
}

// Helper: check if file contains a section header (## or ###)
function hasSection(content, sectionName) {
  const regex = new RegExp(`^#{2,3}\\s+.*${sectionName}`, 'im');
  return regex.test(content);
}

// Helper: glob-like directory listing for .md files recursively
function findMdFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findMdFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Concurrent Analyze: Structural Validation', () => {

  // SV-01: New agent files exist
  // Traces: FR-008, AC-008-01, AC-008-02, AC-008-03, AC-008-04
  describe('SV-01: New agent files exist', () => {
    const expectedFiles = [
      'roundtable-lead.md',
      'persona-business-analyst.md',
      'persona-solutions-architect.md',
      'persona-system-designer.md'
    ];

    for (const file of expectedFiles) {
      it(`${file} exists and is non-empty`, () => {
        const filePath = path.join(AGENTS_DIR, file);
        assert.ok(fs.existsSync(filePath), `${file} does not exist in ${AGENTS_DIR}`);
        const stats = fs.statSync(filePath);
        assert.ok(stats.size > 100, `${file} is too small (${stats.size} bytes, expected > 100)`);
      });
    }
  });

  // SV-02: Old agent file removed
  // Traces: FR-008
  describe('SV-02: Old agent file removed', () => {
    it('roundtable-analyst.md does not exist', () => {
      const filePath = path.join(AGENTS_DIR, 'roundtable-analyst.md');
      assert.ok(!fs.existsSync(filePath),
        'roundtable-analyst.md still exists -- should be removed after persona file split');
    });
  });

  // SV-03: Lead file has valid YAML frontmatter
  // Traces: FR-008, AC-008-01
  describe('SV-03: Lead file has valid YAML frontmatter', () => {
    it('roundtable-lead.md has name=roundtable-lead and model=opus', () => {
      const filePath = path.join(AGENTS_DIR, 'roundtable-lead.md');
      assert.ok(fs.existsSync(filePath), 'roundtable-lead.md does not exist');
      const fm = extractFrontmatter(filePath);
      assert.ok(fm, 'No YAML frontmatter found in roundtable-lead.md');
      assert.equal(fm.name, 'roundtable-lead', `name field is '${fm.name}', expected 'roundtable-lead'`);
      assert.equal(fm.model, 'opus', `model field is '${fm.model}', expected 'opus'`);
    });
  });

  // SV-04: Persona files have valid YAML frontmatter
  // Traces: FR-008, AC-008-02, AC-008-03, AC-008-04
  describe('SV-04: Persona files have valid YAML frontmatter', () => {
    const personaFiles = [
      { file: 'persona-business-analyst.md', expectedName: 'persona-business-analyst' },
      { file: 'persona-solutions-architect.md', expectedName: 'persona-solutions-architect' },
      { file: 'persona-system-designer.md', expectedName: 'persona-system-designer' }
    ];

    for (const { file, expectedName } of personaFiles) {
      it(`${file} has correct name in frontmatter`, () => {
        const filePath = path.join(AGENTS_DIR, file);
        assert.ok(fs.existsSync(filePath), `${file} does not exist`);
        const fm = extractFrontmatter(filePath);
        assert.ok(fm, `No YAML frontmatter found in ${file}`);
        assert.equal(fm.name, expectedName, `name field is '${fm.name}', expected '${expectedName}'`);
        assert.ok(fm.model, `model field missing in ${file}`);
      });
    }
  });

  // SV-05: Lead file contains required sections
  // Traces: FR-001, FR-004, FR-005, AC-008-01
  describe('SV-05: Lead file contains required sections', () => {
    const requiredSections = [
      'Execution Mode',
      'Conversation Protocol',
      'Coverage Tracker',
      'Threshold',
      'Artifact Coordination',
      'Meta.json|Progress'
    ];

    it('roundtable-lead.md contains all required sections', () => {
      const filePath = path.join(AGENTS_DIR, 'roundtable-lead.md');
      assert.ok(fs.existsSync(filePath), 'roundtable-lead.md does not exist');
      const content = fs.readFileSync(filePath, 'utf8');

      for (const section of requiredSections) {
        // Support alternatives separated by |
        const alternatives = section.split('|');
        const found = alternatives.some(alt => hasSection(content, alt));
        assert.ok(found, `Required section '${section}' not found in roundtable-lead.md`);
      }
    });
  });

  // SV-06: Persona files are self-contained
  // Traces: FR-008, AC-008-05, AC-008-06
  describe('SV-06: Persona files are self-contained', () => {
    const personaFiles = [
      'persona-business-analyst.md',
      'persona-solutions-architect.md',
      'persona-system-designer.md'
    ];

    const requiredCategories = [
      'Identity',
      'Principle',
      'Voice|Communication|Style',
      'Artifact Responsibilit'
    ];

    for (const file of personaFiles) {
      it(`${file} contains Identity, Principles, Voice Rules, and Artifact Responsibilities`, () => {
        const filePath = path.join(AGENTS_DIR, file);
        assert.ok(fs.existsSync(filePath), `${file} does not exist`);
        const content = fs.readFileSync(filePath, 'utf8');

        for (const category of requiredCategories) {
          const alternatives = category.split('|');
          const found = alternatives.some(alt => hasSection(content, alt));
          assert.ok(found, `Required section category '${category}' not found in ${file}`);
        }
      });
    }
  });

  // SV-07: Topic directories exist
  // Traces: FR-009, AC-009-01
  describe('SV-07: Topic directories exist', () => {
    it('analysis-topics/ directory exists', () => {
      assert.ok(fs.existsSync(TOPICS_DIR),
        `Topic directory does not exist: ${TOPICS_DIR}`);
    });

    const expectedDirs = [
      'problem-discovery',
      'requirements',
      'technical-analysis',
      'architecture',
      'specification',
      'security'
    ];

    for (const dir of expectedDirs) {
      it(`${dir}/ subdirectory exists`, () => {
        const dirPath = path.join(TOPICS_DIR, dir);
        assert.ok(fs.existsSync(dirPath),
          `Topic subdirectory '${dir}' does not exist under analysis-topics/`);
      });
    }
  });

  // SV-08: Topic files have coverage_criteria frontmatter
  // Traces: FR-009, AC-009-03
  describe('SV-08: Topic files have coverage_criteria frontmatter', () => {
    it('all topic .md files include coverage_criteria in YAML frontmatter', () => {
      if (!fs.existsSync(TOPICS_DIR)) {
        assert.fail('analysis-topics/ directory does not exist');
        return;
      }

      const mdFiles = findMdFiles(TOPICS_DIR);
      assert.ok(mdFiles.length > 0, 'No .md files found in analysis-topics/');

      for (const filePath of mdFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        assert.ok(fmMatch,
          `No YAML frontmatter found in ${path.relative(PROJECT_ROOT, filePath)}`);
        assert.ok(fmMatch[1].includes('coverage_criteria'),
          `coverage_criteria missing from frontmatter in ${path.relative(PROJECT_ROOT, filePath)}`);
      }
    });
  });

  // SV-09: Security topic file exists
  // Traces: FR-009, AC-009-04
  describe('SV-09: Security topic file exists', () => {
    it('a security-related topic file exists in analysis-topics/', () => {
      if (!fs.existsSync(TOPICS_DIR)) {
        assert.fail('analysis-topics/ directory does not exist');
        return;
      }

      const securityDir = path.join(TOPICS_DIR, 'security');
      assert.ok(fs.existsSync(securityDir), 'security/ subdirectory does not exist');

      const mdFiles = findMdFiles(securityDir);
      assert.ok(mdFiles.length > 0, 'No .md files found in security/ topic directory');
    });
  });

  // SV-10: Phase sequencing metadata removed from topic files
  // Traces: FR-009, AC-009-05
  describe('SV-10: Phase sequencing metadata removed', () => {
    it('no topic file contains step_id or depends_on in frontmatter', () => {
      if (!fs.existsSync(TOPICS_DIR)) {
        assert.fail('analysis-topics/ directory does not exist');
        return;
      }

      const mdFiles = findMdFiles(TOPICS_DIR);
      assert.ok(mdFiles.length > 0, 'No .md files found in analysis-topics/');

      for (const filePath of mdFiles) {
        const content = fs.readFileSync(filePath, 'utf8');
        const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) continue; // No frontmatter = no step_id/depends_on

        const frontmatter = fmMatch[1];
        assert.ok(!frontmatter.includes('step_id:'),
          `step_id found in frontmatter of ${path.relative(PROJECT_ROOT, filePath)}`);
        assert.ok(!frontmatter.includes('depends_on:'),
          `depends_on found in frontmatter of ${path.relative(PROJECT_ROOT, filePath)}`);
      }
    });
  });

  // SV-11: isdlc.md contains single dispatch (not phase loop)
  // Traces: FR-014, AC-014-01, AC-014-02
  describe('SV-11: isdlc.md single dispatch', () => {
    it('isdlc.md references roundtable-lead for analyze dispatch', () => {
      assert.ok(fs.existsSync(ISDLC_MD), 'isdlc.md does not exist');
      const content = fs.readFileSync(ISDLC_MD, 'utf8');
      assert.ok(content.includes('roundtable-lead'),
        'isdlc.md does not reference roundtable-lead');
    });

    it('isdlc.md does not reference roundtable-analyst for dispatch', () => {
      const content = fs.readFileSync(ISDLC_MD, 'utf8');
      // The old roundtable-analyst should not be referenced for dispatching
      // Note: it may appear in comments or history references, so we check
      // specifically for the dispatch pattern
      const hasOldDispatch = /roundtable-analyst.*agent.*Task/i.test(content)
        || /Delegate to the.*roundtable-analyst/i.test(content);
      assert.ok(!hasOldDispatch,
        'isdlc.md still references roundtable-analyst for dispatching');
    });
  });

  // SV-12: No elaboration mode references
  // Traces: FR-016, AC-016-01, AC-016-02
  describe('SV-12: No elaboration mode references in new agent files', () => {
    const newFiles = [
      'roundtable-lead.md',
      'persona-business-analyst.md',
      'persona-solutions-architect.md',
      'persona-system-designer.md'
    ];

    const forbiddenPatterns = [
      /\[E\]/,
      /elaboration_config/i,
      /elaboration_handler/i,
      /synthesis_engine/i,
      /elaboration_state/i
    ];

    for (const file of newFiles) {
      it(`${file} contains no elaboration mode references`, () => {
        const filePath = path.join(AGENTS_DIR, file);
        if (!fs.existsSync(filePath)) {
          assert.fail(`${file} does not exist`);
          return;
        }
        const content = fs.readFileSync(filePath, 'utf8');

        for (const pattern of forbiddenPatterns) {
          assert.ok(!pattern.test(content),
            `Forbidden elaboration pattern ${pattern} found in ${file}`);
        }
      });
    }
  });

  // SV-13: No menu system references
  // Traces: FR-017, AC-017-01, AC-017-02
  describe('SV-13: No menu system references in new agent files', () => {
    const newFiles = [
      'roundtable-lead.md',
      'persona-business-analyst.md',
      'persona-solutions-architect.md',
      'persona-system-designer.md'
    ];

    const forbiddenPatterns = [
      /\[C\]\s/,
      /\[S\]\s/,
      /step boundary menu/i,
      /phase boundary menu/i
    ];

    for (const file of newFiles) {
      it(`${file} contains no menu system references`, () => {
        const filePath = path.join(AGENTS_DIR, file);
        if (!fs.existsSync(filePath)) {
          assert.fail(`${file} does not exist`);
          return;
        }
        const content = fs.readFileSync(filePath, 'utf8');

        for (const pattern of forbiddenPatterns) {
          assert.ok(!pattern.test(content),
            `Forbidden menu pattern ${pattern} found in ${file}`);
        }
      });
    }
  });
});
