/**
 * Prompt Content Verification: Participation Gate (REQ-GH-235)
 *
 * Verifies the pre-confirmation participation gate rule: Maya scope +
 * Alex codebase evidence + Jordan design implication MUST occur before
 * PRESENTING_REQUIREMENTS. In silent mode, this is enforced via internal
 * semantic markers, not persona-name surface cues.
 *
 * Traces to: FR-007 (AC-007-06), FR-003 (AC-003-02)
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

describe('REQ-GH-235 FR-003/FR-007: Participation Gate', () => {
  it('AC-003-02: rule requires Maya scope before first confirmation', () => {
    const content = readPrompt();
    assert.match(content, /Maya[\s\S]{0,200}?scope/i, 'Maya scope contribution must be required');
  });

  it('AC-003-02: rule requires Alex codebase evidence before first confirmation', () => {
    const content = readPrompt();
    assert.match(content, /Alex[\s\S]{0,200}?(codebase|evidence)/i, 'Alex codebase evidence must be required');
  });

  it('AC-003-02: rule requires Jordan design implication before first confirmation', () => {
    const content = readPrompt();
    assert.match(content, /Jordan[\s\S]{0,200}?(design|implication)/i, 'Jordan design implication must be required');
  });

  it('AC-003-02: explicit count of 3 contributions required', () => {
    const content = readPrompt();
    assert.match(
      content,
      /(three|3)[\s\S]{0,200}?(primary|persona|contribution)/i,
      'Rule must explicitly call out 3 required contributions'
    );
  });

  it('AC-007-06: participation gate context is pre-first-confirmation', () => {
    const content = readPrompt();
    // Gate rule must appear in context referencing "before" first confirmation
    assert.match(
      content,
      /(before|prior to)[\s\S]{0,100}?(first confirmation|PRESENTING_REQUIREMENTS)/i,
      'Gate must be scoped to pre-first-confirmation'
    );
  });

  it('AC-004-03: silent mode uses internal-only enforcement (semantic markers)', () => {
    const content = readPrompt();
    assert.match(
      content,
      /silent[\s\S]{0,300}?internal.only/i,
      'Silent mode must enforce gate via internal-only semantic markers'
    );
  });
});
