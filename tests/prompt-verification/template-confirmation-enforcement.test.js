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
    // Rewritten roundtable-analyst.md binds templates at the state-machine definitions (§7)
    // and in §8 Domain Confirmation Contracts. Each confirmation state names its template
    // inline and lists required sections with the instruction "do not add, reorder, or rename".
    assert.ok(content.includes('requirements.template.json'));
    assert.ok(content.includes('architecture.template.json'));
    assert.ok(content.includes('design.template.json'));
    assert.ok(content.includes('do not add, reorder, or rename'));
    // Each state definition contains state-local template bindings
    assert.ok(content.includes('Template:  requirements.template.json'));
    assert.ok(content.includes('Template:  architecture.template.json'));
    assert.ok(content.includes('Template:  design.template.json'));
  });

  it('requires assumptions and inferences as an explicit template section', () => {
    const content = readPrompt();
    assert.ok(content.includes('## Assumptions and Inferences'));
    // Rewritten prose states the summary templates include an explicit Assumptions and Inferences section
    assert.ok(
      content.includes('the summary templates include an') &&
      content.includes('`Assumptions and Inferences` section'),
      'Must document that summary templates include an explicit Assumptions and Inferences section'
    );
  });

  it('requires the tasks confirmation table plus assumptions and inferences section', () => {
    const content = readPrompt();
    // Rewritten §8.4 binds traceability.template.json to the state PRESENTING_TASKS on-screen rendering
    assert.ok(content.includes('traceability.template.json'));
    // Assumptions and Inferences is a required section in the tasks confirmation
    assert.ok(
      content.includes('`## Assumptions and Inferences` — explicit assumptions'),
      'Tasks confirmation must include Assumptions and Inferences section explicitly'
    );
  });

  it('binds the traceability summary to the exact 4-column traceability template', () => {
    const content = readPrompt();
    assert.ok(content.includes('| FR | Requirement | Design / Blast Radius | Related Tasks |'));
    // Rewritten §8.4 uses the phrasing "NEVER bullets. NEVER prose-only. NEVER a different table shape."
    assert.ok(
      content.includes('NEVER bullets') &&
      content.includes('NEVER prose-only') &&
      content.includes('NEVER a different table shape'),
      'Must ban bullets, prose-only, and different table shapes for tasks rendering'
    );
    // Rewritten §8.4 uses "Render as ASCII box table with row separators"
    assert.ok(
      content.includes('Render as ASCII box table with row separators') ||
      content.includes('Render as an ASCII box table with row separators'),
      'Must render traceability table as an ASCII box table with row separators'
    );
  });
});
