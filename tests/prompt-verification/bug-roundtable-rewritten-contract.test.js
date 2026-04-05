/**
 * Prompt Content Verification: Bug Roundtable Rewritten Contract (REQ-GH-235)
 *
 * Verifies bug-roundtable-analyst.md follows the identical 12-section
 * behavior-first skeleton as roundtable-analyst.md, with bug-specific
 * confirmation states and template bindings.
 *
 * Traces to: FR-009 (AC-009-01, AC-009-02, AC-009-03, AC-009-04)
 * ATDD RED-state: scaffolds shipped in Phase 05 T001.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const BUG_ROUNDTABLE_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'bug-roundtable-analyst.md');

function readPrompt() {
  return readFileSync(BUG_ROUNDTABLE_PATH, 'utf8');
}

const BUG_STATE_BINDINGS = [
  { state: 'PRESENTING_BUG_SUMMARY', template: 'bug-summary.template.json' },
  { state: 'PRESENTING_ROOT_CAUSE', template: 'root-cause.template.json' },
  { state: 'PRESENTING_FIX_STRATEGY', template: 'fix-strategy.template.json' },
  { state: 'PRESENTING_TASKS', template: 'traceability.template.json' }
];

describe('REQ-GH-235 FR-009: Bug Roundtable Rewritten Contract', () => {
  it('AC-009-01: bug prompt follows 12-section behavior-first skeleton', () => {
    const content = readPrompt();
    const requiredSections = [
      'Purpose',
      'Behavior Contract',
      'Operating Model',
      'Persona Model',
      'Rendering Modes',
      'Conversation Rendering Rules',
      'State Machine',
      'Confirmation Contract',
      'Ask vs Infer',
      'Scope',
      'Early Exit',
      'Finalization'
    ];
    for (const section of requiredSections) {
      assert.match(content, new RegExp(section, 'i'), `Bug prompt must contain section: ${section}`);
    }
  });

  for (const { state, template } of BUG_STATE_BINDINGS) {
    it(`AC-009-03: ${state} binds ${template} inline`, () => {
      const content = readPrompt();
      const pattern = new RegExp(`${state}[\\s\\S]{0,500}?Template:\\s*${template.replace('.', '\\.')}`, 'i');
      assert.match(content, pattern, `${state} must bind ${template} inline`);
    });
  }

  it('AC-009-02: bug prompt declares same 3 rendering modes', () => {
    const content = readPrompt();
    assert.match(content, /\bbulleted\b/i);
    assert.match(content, /\bconversational\b/i);
    assert.match(content, /\bsilent\b/i);
  });

  it('AC-009-02: bug prompt declares persona extensibility model', () => {
    const content = readPrompt();
    assert.match(content, /role_type/i, 'Bug prompt must reference persona role_type schema');
    assert.match(content, /contributing/i, 'Bug prompt must declare contributing default');
  });

  it('AC-009-01: all 4 bug-specific states present in state machine', () => {
    const content = readPrompt();
    for (const { state } of BUG_STATE_BINDINGS) {
      assert.match(content, new RegExp(state), `Bug state ${state} must be present`);
    }
  });

  it('AC-009-04: bug prompt is materially smaller and layered vs pre-rewrite', () => {
    const content = readPrompt();
    const lineCount = content.split('\n').length;
    // Target from module-design.md: ~400-500 lines
    assert.ok(lineCount < 700, `Bug prompt should be layered and material smaller, found ${lineCount} lines`);
    assert.ok(lineCount > 200, `Bug prompt should not be stripped to a stub, found ${lineCount} lines`);
  });
});
