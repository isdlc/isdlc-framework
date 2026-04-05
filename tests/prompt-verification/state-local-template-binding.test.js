/**
 * Prompt Content Verification: State-Local Template Binding (REQ-GH-235)
 *
 * Verifies each PRESENTING_* state in §7 State Machine declares its
 * governing template inline (state-local), not via a centralized section.
 *
 * Traces to: FR-007 (AC-007-02), FR-002 (AC-002-01, AC-002-02, AC-002-03)
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

const PRESENTING_STATES = [
  { state: 'PRESENTING_REQUIREMENTS', template: 'requirements.template.json' },
  { state: 'PRESENTING_ARCHITECTURE', template: 'architecture.template.json' },
  { state: 'PRESENTING_DESIGN', template: 'design.template.json' },
  { state: 'PRESENTING_TASKS', template: 'traceability.template.json' }
];

describe('REQ-GH-235 FR-002/FR-007: State-Local Template Binding', () => {
  for (const { state, template } of PRESENTING_STATES) {
    it(`AC-002-01: ${state} binds ${template} inline`, () => {
      const content = readPrompt();
      const pattern = new RegExp(`${state}[\\s\\S]{0,500}?Template:\\s*${template.replace('.', '\\.')}`, 'i');
      assert.match(content, pattern, `${state} must name ${template} inline on a Template: line`);
    });
  }

  it('AC-002-02: on-screen PRESENTING_TASKS uses traceability.template.json', () => {
    const content = readPrompt();
    assert.match(
      content,
      /PRESENTING_TASKS[\s\S]{0,500}?traceability\.template\.json/,
      'PRESENTING_TASKS on-screen confirmation must bind traceability.template.json'
    );
  });

  it('AC-002-03: written tasks.md uses tasks.template.json (separate from on-screen)', () => {
    const content = readPrompt();
    assert.match(content, /tasks\.template\.json/, 'tasks.template.json reference required for written artifact');
    // Distinct from traceability.template.json used on-screen
    assert.match(
      content,
      /(written|finalize|tasks\.md)[\s\S]{0,200}?tasks\.template\.json/i,
      'tasks.template.json context must reference written tasks.md artifact'
    );
  });

  it('templates not centralized: no single Templates section lists all bindings', () => {
    const content = readPrompt();
    // State-local means no monolithic "## Templates" section that enumerates all 5 templates
    // Heuristic: reject if we find a section header that contains all 4 template names within 30 lines
    const templatesSectionMatch = content.match(/##\s+Templates[\s\S]{0,2000}/i);
    if (templatesSectionMatch) {
      const section = templatesSectionMatch[0];
      const refsInOneBlock =
        section.includes('requirements.template.json') &&
        section.includes('architecture.template.json') &&
        section.includes('design.template.json') &&
        section.includes('traceability.template.json');
      assert.equal(refsInOneBlock, false, 'Templates must be state-local, not centralized in one section');
    }
  });
});
