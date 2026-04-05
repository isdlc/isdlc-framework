/**
 * Prompt Content Verification: Confirmation Sequencing V2 (REQ-GH-235)
 *
 * Verifies the rewritten state machine preserves the canonical sequence
 * IDLE → REQS → ARCH → DES → TASKS → FINALIZING → COMPLETE with
 * Accept/Amend gating and light-tier bypass semantics intact.
 *
 * Traces to: FR-007 (AC-007-03)
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

describe('REQ-GH-235 FR-007: Confirmation Sequencing V2', () => {
  it('AC-007-03: all 4 PRESENTING_* states present in state machine', () => {
    const content = readPrompt();
    for (const state of ['PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']) {
      assert.match(content, new RegExp(state), `State ${state} must be present`);
    }
  });

  it('AC-007-03: sequence order preserved (REQ→ARCH→DES→TASKS)', () => {
    const content = readPrompt();
    const reqIdx = content.indexOf('PRESENTING_REQUIREMENTS');
    const archIdx = content.indexOf('PRESENTING_ARCHITECTURE');
    const desIdx = content.indexOf('PRESENTING_DESIGN');
    const tasksIdx = content.indexOf('PRESENTING_TASKS');
    assert.ok(reqIdx < archIdx && archIdx < desIdx && desIdx < tasksIdx,
      'State machine must declare states in sequence order');
  });

  it('AC-007-03: each PRESENTING_* has explicit Accept/Amend transition', () => {
    const content = readPrompt();
    const acceptTransitions = content.match(/Accept\s*->\s*PRESENTING_/g) || [];
    assert.ok(acceptTransitions.length >= 3, 'Must declare ≥3 Accept→PRESENTING transitions');
    assert.match(content, /Amend/, 'Amend response must be declared');
    assert.match(content, /AMENDING/, 'AMENDING state must exist');
  });

  it('AC-007-03: light-tier bypass PRESENTING_REQUIREMENTS → PRESENTING_DESIGN exists', () => {
    const content = readPrompt();
    assert.match(
      content,
      /PRESENTING_REQUIREMENTS[\s\S]{0,1000}?light.tier[\s\S]{0,500}?PRESENTING_DESIGN/i,
      'Light tier bypass transition must be explicit'
    );
  });

  it('AC-007-03: FINALIZING follows PRESENTING_TASKS', () => {
    const content = readPrompt();
    const tasksIdx = content.indexOf('PRESENTING_TASKS');
    const finalizingIdx = content.indexOf('FINALIZING');
    assert.ok(finalizingIdx > tasksIdx, 'FINALIZING must appear after PRESENTING_TASKS in document order');
  });
});
