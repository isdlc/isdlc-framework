import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');

function readPrompt() {
  return readFileSync(ROUNDTABLE_ANALYST_PATH, 'utf8');
}

describe('GH-234 template-bound confirmation prompt', () => {
  it('binds requirements, architecture, and design summaries to exact template sections', () => {
    const content = readPrompt();
    assert.ok(content.includes('Use EXACTLY these sections in this order from `requirements.template.json`'));
    assert.ok(content.includes('Use EXACTLY these sections in this order from `architecture.template.json`'));
    assert.ok(content.includes('Use EXACTLY these sections in this order from `design.template.json`'));
    assert.ok(content.includes('Do not add extra sections, do not reorder, do not rename.'));
  });

  it('requires assumptions and inferences as an explicit template section', () => {
    const content = readPrompt();
    assert.ok(content.includes('## Assumptions and Inferences'));
    assert.ok(content.includes('The summary templates now include an explicit `Assumptions and Inferences` section.'));
  });

  it('requires the tasks confirmation table plus assumptions and inferences section', () => {
    const content = readPrompt();
    assert.ok(content.includes('traceability.template.json` EXACTLY as written below'));
    assert.ok(content.includes('`## Assumptions and Inferences` — explicit assumptions and inferred execution constraints that affect the task plan'));
  });
});
