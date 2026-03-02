/**
 * Prompt Content Verification Tests: REQ-0019 Preparation Pipeline
 *
 * These tests verify that the 4 modified files contain the required content
 * patterns for the Phase A/B preparation pipeline feature.
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-0019-preparation-pipeline
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const TEMPLATE_PATH = join(PROJECT_ROOT, 'src', 'claude', 'CLAUDE.md.template');
const CLAUDE_MD_PATH = join(PROJECT_ROOT, 'CLAUDE.md');
const BACKLOG_PATH = join(PROJECT_ROOT, 'BACKLOG.md');
const HOOKS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks');
const PACKAGE_JSON_PATH = join(PROJECT_ROOT, 'package.json');

// Helper: read file content with caching
const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

// ============================================================================
// Test Group 1: Phase A Intake (FR-001)
// ============================================================================
describe('TG-01: Phase A Intake (FR-001)', () => {
  it('TC-01.1 [P0]: Phase A SCENARIO section exists in isdlc.md', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('phase a') && (lower.includes('preparation') || lower.includes('intake')),
      'isdlc.md must contain Phase A with Preparation or intake context'
    );
    // Verify it appears in a SCENARIO-like section
    assert.ok(
      content.includes('SCENARIO') || content.includes('## Phase A') || content.includes('### Phase A'),
      'Phase A must appear in a SCENARIO or section header'
    );
  });

  it('TC-01.2 [P0]: BACKLOG.md index entry format documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    // The isdlc.md must reference the index entry format with id, title, requirements link
    assert.ok(
      content.includes('requirements') && content.includes('docs/requirements/'),
      'isdlc.md must reference docs/requirements/ folder in index entry format'
    );
  });

  it('TC-01.3 [P1]: Slug derivation from description documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('slug') && (lower.includes('lowercase') || lower.includes('hyphen')),
      'isdlc.md must document slug derivation with lowercase/hyphens'
    );
  });

  it('TC-01.4 [P1]: Duplicate folder detection documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('already exists') || lower.includes('existing folder') || lower.includes('update it or skip'),
      'isdlc.md must document detecting existing requirements folder'
    );
  });
});

// ============================================================================
// Test Group 2: Phase A Deep Analysis (FR-002)
// ============================================================================
describe('TG-02: Phase A Deep Analysis (FR-002)', () => {
  it('TC-02.1 [P0]: Deep analysis offer documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('deep analysis') || lower.includes('deep-analysis'),
      'isdlc.md must contain deep analysis offer language'
    );
  });

  it('TC-02.2 [P1]: quick-scan.md artifact referenced', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('quick-scan.md'),
      'isdlc.md must reference quick-scan.md output artifact'
    );
  });

  it('TC-02.3 [P1]: requirements.md artifact referenced', () => {
    const content = readFile(ISDLC_MD_PATH);
    // Must reference requirements.md with FRs/ACs context
    assert.ok(
      content.includes('requirements.md'),
      'isdlc.md must reference requirements.md output artifact'
    );
  });

  it('TC-02.4 [P1]: Decline path documented (draft only)', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('draft.md') && lower.includes('meta.json'),
      'isdlc.md must document decline path producing only draft.md and meta.json'
    );
  });

  it('TC-02.5 [P0]: No state.json/hooks/branches in Phase A', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    // Find the Phase A section
    const phaseAStart = lower.indexOf('phase a');
    assert.ok(phaseAStart !== -1, 'Phase A section must exist');

    // The Phase A section must explicitly state no state.json, no hooks, no branches
    // Look for the explicit prohibition
    assert.ok(
      lower.includes('no state.json') || lower.includes('no state.json, no hooks') ||
      (lower.includes('phase a') && lower.includes('without') && lower.includes('state')),
      'Phase A must explicitly state no state.json interaction'
    );
  });
});

// ============================================================================
// Test Group 3: Source-Agnostic Intake (FR-003)
// ============================================================================
describe('TG-03: Source-Agnostic Intake (FR-003)', () => {
  it('TC-03.1 [P1]: Multiple source types documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(lower.includes('jira'), 'isdlc.md must reference Jira as an intake source');
    assert.ok(lower.includes('github'), 'isdlc.md must reference GitHub as an intake source');
    assert.ok(
      lower.includes('manual') || lower.includes('description'),
      'isdlc.md must reference manual intake'
    );
  });

  it('TC-03.3 [P1]: BACKLOG.md migration flow documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('migration') || lower.includes('migrate') ||
      (lower.includes('backlog') && lower.includes('inline') && lower.includes('requirements')),
      'isdlc.md must reference migration from inline spec to requirements folder'
    );
  });
});

// ============================================================================
// Test Group 4: Meta Tracking (FR-004)
// ============================================================================
describe('TG-04: Meta Tracking (FR-004)', () => {
  it('TC-04.1 [P0]: meta.json fields documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(content.includes('meta.json'), 'isdlc.md must reference meta.json');
    const lower = content.toLowerCase();
    assert.ok(lower.includes('source'), 'meta.json must document source field');
    assert.ok(lower.includes('slug'), 'meta.json must document slug field');
    assert.ok(lower.includes('created_at'), 'meta.json must document created_at field');
    assert.ok(lower.includes('phase_a_completed'), 'meta.json must document phase_a_completed field');
    assert.ok(lower.includes('codebase_hash'), 'meta.json must document codebase_hash field');
  });

  it('TC-04.2 [P1]: phase_a_completed toggling documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('phase_a_completed') &&
      (lower.includes('true') || lower.includes('false')),
      'isdlc.md must reference phase_a_completed being set to true on completion and false before'
    );
  });
});

// ============================================================================
// Test Group 5: Phase B Consumption (FR-005)
// ============================================================================
describe('TG-05: Phase B Consumption (FR-005)', () => {
  it('TC-05.1 [P0]: start action documented in isdlc.md', () => {
    const content = readFile(ISDLC_MD_PATH);
    // start must be a recognized action in the workflows or actions section
    assert.ok(
      content.includes('start') && content.includes('Phase B'),
      'isdlc.md must contain start as a recognized action linked to Phase B'
    );
  });

  it('TC-05.2 [P0]: Phase B starts at Phase 02', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      (lower.includes('skip') && (lower.includes('phase 00') || lower.includes('phase 01'))) ||
      (lower.includes('start') && lower.includes('phase 02')),
      'isdlc.md must reference skipping Phase 00/01 or starting from Phase 02 for prepared requirements'
    );
  });

  it('TC-05.3 [P1]: Missing requirements folder error', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('no prepared requirements') || lower.includes('not found') ||
      (lower.includes('missing') && lower.includes('requirements')),
      'isdlc.md must reference error for missing requirements folder'
    );
  });

  it('TC-05.4 [P1]: Incomplete preparation error', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('incomplete') || lower.includes('phase_a_completed'),
      'isdlc.md must reference blocking when phase_a_completed is false'
    );
  });

  it('TC-05.5 [P0]: Staleness detection documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('staleness') || lower.includes('stale'),
      'isdlc.md must reference staleness check'
    );
    assert.ok(
      lower.includes('codebase_hash'),
      'isdlc.md must reference codebase_hash for staleness detection'
    );
  });

  it('TC-05.6 [P1]: Staleness action menu (P/R/C)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('Proceed') && content.includes('Refresh') && content.includes('Cancel'),
      'isdlc.md must contain Proceed/Refresh/Cancel options for staleness'
    );
  });

  it('TC-05.7 [P1]: Requirements read path for Phase B', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('docs/requirements/') && content.includes('requirements.md'),
      'isdlc.md must reference reading from docs/requirements/{slug}/requirements.md'
    );
  });
});

// ============================================================================
// Test Group 6: Artifact Folder Unification (FR-006)
// ============================================================================
describe('TG-06: Artifact Folder Unification (FR-006)', () => {
  it('TC-06.1 [P1]: Phase B writes to same folder', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('phase b') && lower.includes('docs/requirements/'),
      'isdlc.md must reference writing Phase B artifacts to docs/requirements/{slug}/'
    );
  });
});

// ============================================================================
// Test Group 7: BACKLOG.md Restructure (FR-007)
// ============================================================================
describe('TG-07: BACKLOG.md Restructure (FR-007)', () => {
  it('TC-07.1 [P0]: BACKLOG.md has ## Open section', () => {
    const content = readFile(BACKLOG_PATH);
    assert.ok(content.includes('## Open'), 'BACKLOG.md must contain ## Open section header');
  });

  it('TC-07.2 [P0]: BACKLOG.md has ## Completed section', () => {
    const content = readFile(BACKLOG_PATH);
    assert.ok(content.includes('## Completed'), 'BACKLOG.md must contain ## Completed section header');
  });

  it('TC-07.3 [P0]: BACKLOG.md line count under 120', () => {
    const content = readFile(BACKLOG_PATH);
    const lines = content.split('\n');
    assert.ok(
      lines.length <= 120,
      `BACKLOG.md must have <= 120 lines, found ${lines.length}`
    );
  });

  it('TC-07.4 [P0]: Open items are one-line index entries', () => {
    const content = readFile(BACKLOG_PATH);
    const openSection = extractSection(content, '## Open', '## Completed');

    // Each item line (starting with "- ") should be self-contained on one line
    const lines = openSection.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip section headers, empty lines, and sub-section headers
      if (!line.startsWith('- ')) continue;

      // An item line must have an ID pattern and checkbox
      const hasCheckbox = line.includes('[ ]') || line.includes('[x]') || line.includes('[~]');
      assert.ok(
        hasCheckbox,
        `Open item line must have a checkbox: "${line.substring(0, 80)}..."`
      );
    }
  });

  it('TC-07.5 [P1]: Completed items have [x] checkbox', () => {
    const content = readFile(BACKLOG_PATH);
    const completedSection = extractSection(content, '## Completed', null);

    const itemLines = completedSection.split('\n').filter(l => l.startsWith('- '));
    assert.ok(itemLines.length > 0, 'Completed section must have items');
    for (const line of itemLines) {
      assert.ok(
        line.includes('[x]'),
        `Completed item must use [x] checkbox: "${line.substring(0, 80)}..."`
      );
    }
  });

  it('TC-07.6 [P0]: No multi-line inline specs remain', () => {
    const content = readFile(BACKLOG_PATH);
    const openSection = extractSection(content, '## Open', '## Completed');
    const lines = openSection.split('\n');

    // Look for paragraphs of freeform text (not item lines, not headers, not empty)
    // that are NOT indented sub-bullets starting with "  -"
    // and NOT section headers starting with "#"
    let consecutiveNonStructured = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') {
        consecutiveNonStructured = 0;
        continue;
      }
      // Structured content: item lines, section headers, sub-bullets
      if (trimmed.startsWith('- ') || trimmed.startsWith('# ') || trimmed.startsWith('> ')) {
        consecutiveNonStructured = 0;
        continue;
      }
      // Freeform paragraph text
      consecutiveNonStructured++;
      assert.ok(
        consecutiveNonStructured < 3,
        `Open section must not have inline spec paragraphs. Found consecutive non-structured lines near: "${trimmed.substring(0, 60)}"`
      );
    }
  });
});

// ============================================================================
// Test Group 8: Intent Detection in CLAUDE.md.template (FR-008)
// ============================================================================
describe('TG-08: Intent Detection in CLAUDE.md.template (FR-008)', () => {
  it('TC-08.1 [P0]: Intake intent pattern in template', () => {
    const content = readFile(TEMPLATE_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('add') && lower.includes('backlog'),
      'CLAUDE.md.template must contain intake-related signal: "add" + "backlog"'
    );
    // Specifically, the intent detection section should have intake-specific patterns
    assert.ok(
      lower.includes('intake') || lower.includes('import') || lower.includes('add to backlog'),
      'CLAUDE.md.template must contain intake routing pattern'
    );
  });

  it('TC-08.2 [P0]: Analyze intent pattern in template', () => {
    const content = readFile(TEMPLATE_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('analyze') || lower.includes('deep analysis') || lower.includes('prepare'),
      'CLAUDE.md.template must contain analyze-related signal words'
    );
  });

  it('TC-08.3 [P0]: Start intent pattern in template mapped to Phase B', () => {
    const content = readFile(TEMPLATE_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('start') && lower.includes('phase b'),
      'CLAUDE.md.template must contain "start" mapped to Phase B consumption'
    );
  });

  it('TC-08.4 [P1]: CLAUDE.md mirrors template patterns', () => {
    const claudeContent = readFile(CLAUDE_MD_PATH);
    const lower = claudeContent.toLowerCase();

    // CLAUDE.md must contain the same intake/analyze/start intent patterns
    assert.ok(
      lower.includes('intake') || (lower.includes('add') && lower.includes('backlog')),
      'Project CLAUDE.md must contain intake intent pattern'
    );
    assert.ok(
      lower.includes('analyze') || lower.includes('deep analysis'),
      'Project CLAUDE.md must contain analyze intent pattern'
    );
    assert.ok(
      lower.includes('start') && (lower.includes('phase b') || lower.includes('prepared requirements')),
      'Project CLAUDE.md must contain start/Phase B intent pattern'
    );
  });
});

// ============================================================================
// Test Group 9: NFR - Reliability (NFR-001)
// ============================================================================
describe('TG-09: NFR Reliability (NFR-001)', () => {
  it('TC-09.1 [P0]: Missing meta.json error documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('missing') && lower.includes('meta.json'),
      'isdlc.md must document error for missing meta.json'
    );
  });

  it('TC-09.2 [P1]: Malformed meta.json error documented', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('malformed') || lower.includes('corrupted') || lower.includes('cannot parse'),
      'isdlc.md must reference handling malformed/corrupted meta.json'
    );
  });

  it('TC-09.3 [P1]: Missing phase_a_completed treated as false', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('phase_a_completed') && (lower.includes('missing') || lower.includes('absent') || lower.includes('treat')),
      'isdlc.md must reference treating missing phase_a_completed as false'
    );
  });

  it('TC-09.5 [P1]: Missing requirements.md error', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('requirements.md') && (lower.includes('missing') || lower.includes('not exist')),
      'isdlc.md must reference error when requirements.md is missing despite meta completion'
    );
  });

  it('TC-09.6 [P1]: Error messages include file path and remediation', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    // Error messages should include path and remediation guidance
    assert.ok(
      lower.includes('remediation') || lower.includes('re-run') || lower.includes('run phase a'),
      'isdlc.md must reference remediation steps in error messages'
    );
    assert.ok(
      content.includes('docs/requirements/'),
      'Error messages must include specific file paths'
    );
  });
});

// ============================================================================
// Test Group 10: NFR - Zero Resource Contention (NFR-002)
// ============================================================================
describe('TG-10: NFR Zero Resource Contention (NFR-002)', () => {
  it('TC-10.1 [P0]: Phase A avoids state.json', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    // Phase A section must explicitly state no state.json
    assert.ok(
      lower.includes('no state.json') ||
      (lower.includes('phase a') && lower.includes('does not') && lower.includes('state')),
      'Phase A must explicitly prohibit state.json interaction'
    );
  });

  it('TC-10.2 [P1]: Phase A avoids .isdlc/ directory', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('no hooks') || lower.includes('no gates') ||
      (lower.includes('phase a') && lower.includes('.isdlc')),
      'Phase A must document no writes to .isdlc/ or no hooks/gates'
    );
  });

  it('TC-10.3 [P1]: Phase A avoids git branch operations', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('no branch') || lower.includes('no git branch') ||
      (lower.includes('phase a') && lower.includes('branch')),
      'Phase A must document no branch create/checkout'
    );
  });
});

// ============================================================================
// Test Group 11: NFR - Idempotent Intake (NFR-003)
// ============================================================================
describe('TG-11: NFR Idempotent Intake (NFR-003)', () => {
  it('TC-11.1 [P1]: Re-intake prompts user', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('already exists') || lower.includes('update it or skip') || lower.includes('existing folder'),
      'isdlc.md must reference detecting existing folder and asking update/skip'
    );
  });
});

// ============================================================================
// Test Group 12: NFR - Graceful Degradation (NFR-004)
// ============================================================================
describe('TG-12: NFR Graceful Degradation (NFR-004)', () => {
  it('TC-12.1 [P1]: Jira MCP unavailable fallback', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('jira') && (lower.includes('unavailable') || lower.includes('fallback')),
      'isdlc.md must reference fallback to manual intake when Jira MCP unavailable'
    );
  });

  it('TC-12.2 [P1]: GitHub CLI unavailable fallback', () => {
    const content = readFile(ISDLC_MD_PATH);
    const lower = content.toLowerCase();
    assert.ok(
      lower.includes('github') && (lower.includes('unavailable') || lower.includes('fallback') || lower.includes('not authenticated')),
      'isdlc.md must reference fallback to manual intake when gh unavailable'
    );
  });
});

// ============================================================================
// Test Group 14: Cross-File Consistency
// ============================================================================
describe('TG-14: Cross-File Consistency', () => {
  it('TC-14.1 [P1]: Phase A/B terminology consistent across files', () => {
    const isdlc = readFile(ISDLC_MD_PATH).toLowerCase();
    const template = readFile(TEMPLATE_PATH).toLowerCase();

    // Both files must use Phase A and Phase B terminology
    assert.ok(isdlc.includes('phase a'), 'isdlc.md must use "Phase A" terminology');
    assert.ok(isdlc.includes('phase b'), 'isdlc.md must use "Phase B" terminology');
    assert.ok(
      template.includes('phase a') || template.includes('phase b') ||
      template.includes('preparation') || template.includes('execution'),
      'CLAUDE.md.template must reference Phase A/B or Preparation/Execution'
    );
  });

  it('TC-14.2 [P1]: Requirements folder path consistent', () => {
    const isdlc = readFile(ISDLC_MD_PATH);
    const template = readFile(TEMPLATE_PATH);

    assert.ok(
      isdlc.includes('docs/requirements/'),
      'isdlc.md must reference docs/requirements/{slug}/ path'
    );
    assert.ok(
      template.includes('docs/requirements/'),
      'CLAUDE.md.template must reference docs/requirements/{slug}/ path'
    );
  });

  it('TC-14.3 [P0]: No new hooks added', () => {
    const hookFiles = readdirSync(HOOKS_DIR)
      .filter(f => f.endsWith('.cjs'));
    assert.equal(
      hookFiles.length, 28,
      `Hook directory must have exactly 28 .cjs files (no new hooks), found ${hookFiles.length}`
    );
  });

  it('TC-14.4 [P0]: No new dependencies added', () => {
    const pkgJson = JSON.parse(readFile(PACKAGE_JSON_PATH));
    const depCount = Object.keys(pkgJson.dependencies || {}).length;
    const devDepCount = Object.keys(pkgJson.devDependencies || {}).length;
    // Verify we didn't add new production deps (project currently has 4)
    assert.ok(
      depCount <= 4,
      `package.json dependencies must not grow unexpectedly, found ${depCount}`
    );
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract a section of content between two headers.
 * @param {string} content - Full file content
 * @param {string} startHeader - The starting section header (e.g., "## Open")
 * @param {string|null} endHeader - The ending section header, or null for EOF
 * @returns {string} The section content
 */
function extractSection(content, startHeader, endHeader) {
  const startIdx = content.indexOf(startHeader);
  if (startIdx === -1) return '';

  const afterStart = content.substring(startIdx + startHeader.length);
  if (!endHeader) return afterStart;

  const endIdx = afterStart.indexOf(endHeader);
  if (endIdx === -1) return afterStart;

  return afterStart.substring(0, endIdx);
}
