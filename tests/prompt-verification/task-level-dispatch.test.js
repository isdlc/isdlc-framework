/**
 * Prompt Content Verification Tests: REQ-GH-220 Task-Level Dispatch in Phase-Loop Controller
 *
 * These tests verify that isdlc.md contains the task-level dispatch protocol
 * (step 3d-check, step 3d-tasks) and that it references the core functions.
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-GH-220-task-level-delegation-in-phase-loop-controller
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');

const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

describe('Task-Level Dispatch Protocol (FR-001, FR-004)', () => {

  // TLD-01
  it('isdlc.md step 3d contains task-dispatch conditional (TLD-01, AC-004-03)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(content.includes('3d-check'), 'must contain step 3d-check');
    assert.ok(content.includes('shouldUseTaskDispatch'), 'must reference shouldUseTaskDispatch');
    assert.ok(content.includes('3d-tasks'), 'must contain step 3d-tasks');
    assert.ok(content.includes('3d-single'), 'must contain step 3d-single (fallback)');
  });

  // TLD-02
  it('isdlc.md step 3d-tasks specifies tier-by-tier iteration (TLD-02, AC-001-02)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(content.includes('assignTiers'), 'must reference assignTiers for tier computation');
    assert.ok(content.includes('For each tier'), 'must specify tier-by-tier iteration');
  });

  // TLD-03
  it('isdlc.md step 3d-tasks specifies parallel dispatch within tier (TLD-03, AC-003-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('Dispatch in parallel') || content.includes('parallel execution'),
      'must specify parallel dispatch within tier'
    );
  });

  // TLD-04
  it('isdlc.md step 3d-tasks includes per-task prompt template (TLD-04, AC-002-01, AC-002-04)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(content.includes('PRIOR COMPLETED FILES'), 'must include prior completed files in prompt');
    assert.ok(content.includes('TRACES'), 'must include traces in per-task prompt');
    assert.ok(content.includes('Implement ONLY the files listed above'), 'must scope agent to single task');
  });

  // TLD-05
  it('isdlc.md step 3d-tasks includes failure handling with escalation (TLD-05, AC-007-01, AC-007-02)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(content.includes('handleTaskFailure') || content.includes('retry counter'), 'must reference failure handling');
    assert.ok(content.includes('Retry') && content.includes('Skip') && content.includes('Cancel'), 'must include escalation options');
  });

  // TLD-06
  it('isdlc.md step 3d-tasks specifies TaskCreate per task for visibility (TLD-06, AC-008-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(content.includes('TaskCreate') && content.includes('3d-tasks'), 'must reference TaskCreate in task-level dispatch');
  });
});
