/**
 * Prompt Content Verification: Rendering Mode Invariants (REQ-GH-235)
 *
 * Verifies §5 Rendering Modes declares all three modes (bulleted, conversational,
 * silent) as first-class, early in the prompt, with shared invariants that
 * prevent mode changes from altering protocol semantics.
 *
 * Traces to: FR-007 (AC-007-04), FR-004 (AC-004-01, AC-004-02, AC-004-03)
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

describe('REQ-GH-235 FR-004/FR-007: Rendering Mode Invariants', () => {
  it('AC-004-01: all three modes defined (bulleted, conversational, silent)', () => {
    const content = readPrompt();
    assert.match(content, /\bbulleted\b/i);
    assert.match(content, /\bconversational\b/i);
    assert.match(content, /\bsilent\b/i);
  });

  it('AC-004-01: rendering modes section declared early (first half of prompt)', () => {
    const content = readPrompt();
    const firstHalf = content.slice(0, Math.floor(content.length / 2));
    assert.match(firstHalf, /Rendering Modes/i, '§5 Rendering Modes must be declared in first half of prompt');
  });

  it('AC-004-02: shared invariants section enumerated', () => {
    const content = readPrompt();
    assert.match(content, /(shared invariants|Shared Invariants)/);
  });

  it('AC-004-02: invariants cover confirmation order', () => {
    const content = readPrompt();
    assert.match(content, /confirmation order/i, 'Invariant: confirmation order must be locked');
  });

  it('AC-004-02: invariants cover Accept/Amend gating', () => {
    const content = readPrompt();
    assert.match(content, /Accept[\s\S]{0,50}?Amend[\s\S]{0,200}?gat/i);
  });

  it('AC-004-02: invariants cover template binding', () => {
    const content = readPrompt();
    assert.match(content, /template binding/i);
  });

  it('AC-004-02: invariants cover anti-shortcut behavior', () => {
    const content = readPrompt();
    assert.match(content, /anti.shortcut/i);
  });

  it('AC-004-02: invariants cover A&I (Assumptions and Inferences) handling', () => {
    const content = readPrompt();
    assert.match(content, /(A&I|Assumptions and Inferences|A and I)/);
  });

  it('AC-004-02: invariants cover write timing', () => {
    const content = readPrompt();
    assert.match(content, /write timing/i);
  });

  it('AC-004-02: invariants cover tier applicability', () => {
    const content = readPrompt();
    assert.match(content, /tier applicability/i);
  });

  it('AC-004-03: silent mode marks participation gates internal-only', () => {
    const content = readPrompt();
    assert.match(
      content,
      /silent[\s\S]{0,300}?internal.only/i,
      'Silent mode must mark participation gates as internal-only (no persona-name cues)'
    );
  });

  it('AC-004-03: silent mode suppresses persona-name surface cues', () => {
    const content = readPrompt();
    assert.match(
      content,
      /(no persona.name|without persona.name|suppress.{0,20}persona.name)/i,
      'Silent mode must explicitly suppress persona-name attributions'
    );
  });
});
