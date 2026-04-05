import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');

function readPrompt() {
  return readFileSync(ROUNDTABLE_ANALYST_PATH, 'utf8');
}

describe('Provider-Neutral Analysis Contract', () => {
  it('defines a provider-neutral behavior contract separate from runtime adapter details', () => {
    const content = readPrompt();
    // Rewritten file establishes the behavior contract in §2 Behavior Contract (single source of truth)
    // and documents runtime-adapter boundary in §2.1 Stop/Wait Contract + Appendix B — Runtime Adapter Notes.
    assert.ok(content.includes('## §2. Behavior Contract'));
    assert.ok(content.includes('## Appendix B — Runtime Adapter Notes'));
    // Provider-neutral contract is explicitly documented
    assert.ok(
      content.includes('provider-neutral'),
      'Must document protocol as provider-neutral'
    );
    // Runtime adapters are adapter notes, not part of behavior contract
    assert.ok(
      content.includes('Runtime adapters may implement') ||
      content.includes('adapter notes'),
      'Must document adapter notes as separate from the behavior contract'
    );
  });

  it('defines deterministic clarifying-question policy', () => {
    const content = readPrompt();
    // Rewritten file: §9.1 Clarifying Question Gate
    assert.ok(content.includes('### 9.1 Clarifying Question Gate'));
    // Still defines Blocking/Non-blocking distinction
    assert.ok(content.includes('Blocking'));
    // At most one primary clarifying question per exchange
    assert.ok(
      content.includes('one') && content.includes('primary clarifying question per exchange'),
      'Must limit to one primary clarifying question per exchange'
    );
    // Ask the one that unlocks the most downstream analysis
    assert.ok(
      content.includes('unlocks the most downstream analysis'),
      'Must prioritize the gap that unlocks the most downstream analysis'
    );
  });

  it('keeps agent teams as dormant future design rather than active default behavior', () => {
    const content = readPrompt();
    // Rewritten file: Agent Teams is Appendix A, explicitly labelled as dormant future design.
    assert.ok(content.includes('## Appendix A — Agent Teams (Dormant Future Design)'));
    assert.ok(content.includes('retained as a dormant future design'));
    // Single-Agent mode is the default; inline execution for both Claude and Codex runtimes assumes Single-Agent Mode
    assert.ok(
      content.includes('Current inline execution for both Claude-shaped and Codex-shaped runtimes assumes Single-Agent Mode') ||
      content.includes('Single-Agent mode is the default'),
      'Must document Single-Agent Mode as the default inline-execution mode for both runtimes'
    );
  });
});
