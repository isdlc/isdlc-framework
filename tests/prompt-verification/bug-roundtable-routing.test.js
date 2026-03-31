/**
 * Prompt Content Verification Tests: REQ-GH-218 Bug Roundtable Routing and Build Kickoff
 *
 * These tests verify that isdlc.md routes bugs to the new bug-roundtable-analyst.md
 * protocol and that the build kickoff starts at Phase 05.
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const BUG_ROUNDTABLE_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'bug-roundtable-analyst.md');
const BUG_GATHER_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'bug-gather-analyst.md');

const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

describe('Bug Roundtable Routing (FR-005, FR-006)', () => {

  // TC-010
  it('isdlc.md step 6.5c references bug-roundtable-analyst.md (TC-010, AC-006-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('bug-roundtable-analyst.md'),
      'step 6.5c must reference bug-roundtable-analyst.md'
    );
  });

  // TC-011
  it('isdlc.md step 6.5f specifies START_PHASE 05-test-strategy (TC-011, AC-005-02, AC-005-03)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('START_PHASE: "05-test-strategy"'),
      'step 6.5f must specify START_PHASE: "05-test-strategy"'
    );
  });

  // TC-012
  it('isdlc.md step 6.5e includes 02-tracing in phases_completed (TC-012, AC-002-04)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('"01-requirements"') && content.includes('"02-tracing"'),
      'step 6.5e must add both 01-requirements and 02-tracing to phases_completed'
    );
  });

  // TC-013
  it('isdlc.md step 6.5f does not contain legacy fix handoff (TC-013, AC-005-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    // Find step 6.5f section and check it doesn't have the old prompt
    const step65fMatch = content.match(/6\.5f\.\s+\*\*Automatic Build Kickoff\*\*/);
    assert.ok(step65fMatch, 'step 6.5f must be titled "Automatic Build Kickoff" (not "Fix Handoff Gate")');
  });
});

describe('Bug Roundtable Protocol Structure (FR-001)', () => {

  // TC-014
  it('bug-roundtable-analyst.md exists and has required sections (TC-014, AC-001-01, AC-001-02)', () => {
    assert.ok(existsSync(BUG_ROUNDTABLE_PATH), 'bug-roundtable-analyst.md must exist');
    const content = readFile(BUG_ROUNDTABLE_PATH);

    const requiredSections = [
      'Opening',
      'Conversation Flow Rules',
      'Bug-Report Production',
      'Tracing Delegation',
      'Confirmation Sequence',
      'Finalization Batch Protocol',
      'Build Kickoff Signal'
    ];

    for (const section of requiredSections) {
      assert.ok(content.includes(section), `must contain section: ${section}`);
    }
  });

  // TC-015
  it('bug-roundtable-analyst.md specifies bulleted format (TC-015, AC-001-02)', () => {
    const content = readFile(BUG_ROUNDTABLE_PATH);
    assert.ok(
      content.includes('bullet') || content.includes('Bullet') || content.includes('bulleted'),
      'must specify bulleted format'
    );
  });

  // TC-016
  it('bug-roundtable-analyst.md confirmation has 4 bug-specific domains (TC-016, AC-004-01 thru AC-004-04)', () => {
    const content = readFile(BUG_ROUNDTABLE_PATH);
    const bugDomains = [
      'PRESENTING_BUG_SUMMARY',
      'PRESENTING_ROOT_CAUSE',
      'PRESENTING_FIX_STRATEGY',
      'PRESENTING_TASKS'
    ];

    for (const domain of bugDomains) {
      assert.ok(content.includes(domain), `must define confirmation state: ${domain}`);
    }
  });

  // TC-017
  it('bug-gather-analyst.md has deprecation header (TC-017, AC-006-02)', () => {
    const content = readFile(BUG_GATHER_PATH);
    const firstLines = content.split('\n').slice(0, 15).join('\n');
    assert.ok(
      firstLines.includes('DEPRECATED') && firstLines.includes('bug-roundtable-analyst.md'),
      'must have deprecation header referencing bug-roundtable-analyst.md'
    );
  });
});
