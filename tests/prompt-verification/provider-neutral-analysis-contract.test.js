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
    assert.ok(content.includes('## 0. Provider-Neutral Behavior Contract'));
    assert.ok(content.includes('### 0.5 Runtime Adapter Boundary'));
    assert.ok(content.includes('Runtime-specific transport details are adapter notes, not the behavior contract.'));
  });

  it('defines deterministic clarifying-question policy', () => {
    const content = readPrompt();
    assert.ok(content.includes('### 0.2 Clarifying Question Gate'));
    assert.ok(content.includes('Blocking uncertainty'));
    assert.ok(content.includes('Ask at most one primary clarifying question per exchange.'));
    assert.ok(content.includes('If multiple gaps exist, ask the one that unlocks the most downstream analysis.'));
  });

  it('keeps agent teams as dormant future design rather than active default behavior', () => {
    const content = readPrompt();
    assert.ok(content.includes('### 1.2 Agent Teams Mode (Dormant Future Design, Opt-In)'));
    assert.ok(content.includes('retained as a dormant future design'));
    assert.ok(content.includes('Current inline execution for both Claude-shaped and Codex-shaped runtimes should assume Single-Agent Mode'));
  });
});
