/**
 * Prompt Content Verification Tests: REQ-GH-218 Tracing Delegation Adapter
 *
 * These tests verify that bug-roundtable-analyst.md correctly specifies
 * the tracing delegation with ANALYSIS_MODE, BUG_REPORT_PATH, and
 * DISCOVERY_CONTEXT.
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md file, assert content patterns
 *
 * Traces to: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const BUG_ROUNDTABLE_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'bug-roundtable-analyst.md');

let content;
function getContent() {
  if (!content) {
    content = readFileSync(BUG_ROUNDTABLE_PATH, 'utf-8');
  }
  return content;
}

describe('Tracing Delegation Adapter (FR-002)', () => {

  // TC-018
  it('includes ANALYSIS_MODE: true in tracing delegation (TC-018, AC-002-01)', () => {
    const text = getContent();
    assert.ok(
      text.includes('ANALYSIS_MODE: true'),
      'tracing delegation must include ANALYSIS_MODE: true'
    );
  });

  // TC-019
  it('passes BUG_REPORT_PATH in tracing delegation (TC-019, AC-002-01)', () => {
    const text = getContent();
    assert.ok(
      text.includes('BUG_REPORT_PATH'),
      'tracing delegation must include BUG_REPORT_PATH'
    );
  });

  // TC-020
  it('passes DISCOVERY_CONTEXT in tracing delegation (TC-020, AC-002-02)', () => {
    const text = getContent();
    assert.ok(
      text.includes('DISCOVERY_CONTEXT'),
      'tracing delegation must include DISCOVERY_CONTEXT'
    );
  });

  // TC-021
  it('specifies fail-open behavior for tracing failure (TC-021, AC-002-03)', () => {
    const text = getContent();
    assert.ok(
      text.toLowerCase().includes('fail-open') || text.includes('Fail-open') || text.includes('Article X'),
      'tracing delegation must specify fail-open on failure (Article X)'
    );
  });

  // TC-022
  it('references tracing-orchestrator for parallel T1/T2/T3 (TC-022, AC-002-02)', () => {
    const text = getContent();
    assert.ok(
      text.includes('tracing-orchestrator'),
      'must reference tracing-orchestrator'
    );
    assert.ok(
      text.includes('T1') && text.includes('T2') && text.includes('T3'),
      'must reference T1, T2, T3 sub-agents'
    );
  });
});
