/**
 * Prompt Content Verification: Tasks Render as Table (REQ-GH-235)
 *
 * Verifies PRESENTING_TASKS confirmation contract in §8 requires the
 * on-screen rendering to be a traceability table (≥4 columns, pipe-delimited),
 * explicitly forbidding bullets and prose-only output.
 *
 * Traces to: FR-007 (AC-007-07), FR-003 (AC-003-03)
 * ATDD RED-state: scaffolds shipped in Phase 05 T001.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');

function readPrompt() {
  return readFileSync(ROUNDTABLE_ANALYST_PATH, 'utf8');
}

describe('REQ-GH-235 FR-003/FR-007: Tasks Render as Table', () => {
  it('AC-003-03: PRESENTING_TASKS contract requires traceability table rendering', () => {
    const content = readPrompt();
    assert.match(
      content,
      /PRESENTING_TASKS[\s\S]{0,1500}?(traceability table|render[s]?\s+as.{0,30}table)/i,
      'PRESENTING_TASKS contract must require table rendering'
    );
  });

  it('AC-003-03: 4-column traceability template header referenced', () => {
    const content = readPrompt();
    assert.match(
      content,
      /\|\s*FR\s*\|\s*Requirement\s*\|/,
      'Must reference 4-column traceability header template'
    );
  });

  it('AC-003-03: bullets explicitly forbidden for TASKS confirmation', () => {
    const content = readPrompt();
    assert.match(
      content,
      /PRESENTING_TASKS[\s\S]{0,2000}?(no bullets|never bullets|not bullets|not.{0,20}bullet)/i,
      'TASKS contract must forbid bullets'
    );
  });

  it('AC-003-03: prose-only output explicitly forbidden for TASKS', () => {
    const content = readPrompt();
    assert.match(
      content,
      /PRESENTING_TASKS[\s\S]{0,2000}?(no prose|never prose|not.{0,20}prose-only|prose-only.{0,20}forbidden)/i,
      'TASKS contract must forbid prose-only rendering'
    );
  });

  it('AC-007-07: rule uses table enforcement language not guidance', () => {
    const content = readPrompt();
    assert.match(
      content,
      /PRESENTING_TASKS[\s\S]{0,2000}?(MUST|must|required|never)/,
      'TASKS rendering rule must use contract language, not guidance'
    );
  });
});
