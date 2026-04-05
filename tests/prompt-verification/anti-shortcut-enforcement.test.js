/**
 * Prompt Content Verification: Anti-Shortcut Enforcement (REQ-GH-235)
 *
 * Verifies rewritten roundtable-analyst.md contains the §14 anti-shortcut
 * contract as enforceable rules, not aspirational prose.
 *
 * Traces to: FR-007 (AC-007-01), FR-003 (AC-003-01, AC-003-04)
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

describe('REQ-GH-235 FR-007/FR-003: Anti-Shortcut Enforcement', () => {
  it('AC-003-01: forbids collapse from clarification to artifact generation', () => {
    const content = readPrompt();
    assert.match(
      content,
      /(no collapse|must not collapse|cannot shortcut).*(clarification|first question).*(artifact|generation)/is,
      'Contract must explicitly forbid clarification→artifact shortcut'
    );
  });

  it('AC-003-04: forbids artifact writes before staged confirmations', () => {
    const content = readPrompt();
    assert.match(
      content,
      /(no artifact writes|must not write artifacts|do not write).*(before|prior to).*(confirmation|finalize)/is,
      'Contract must explicitly forbid writes before confirmations'
    );
  });

  it('AC-003-04: names early exit as the only exception to no-write rule', () => {
    const content = readPrompt();
    assert.match(content, /early exit/i, 'Early exit exception must be explicitly named');
  });

  it('anti-shortcut rules appear in contract section, not buried', () => {
    const content = readPrompt();
    const firstQuarter = content.slice(0, Math.floor(content.length / 4));
    assert.match(
      firstQuarter,
      /(anti.shortcut|non.negotiable|behavior contract)/i,
      'Anti-shortcut rules must be declared in top-level contract (first quarter of prompt)'
    );
  });
});
