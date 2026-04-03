/**
 * Prompt Content Verification Tests: REQ-GH-220 Test-Generate Scaffold Derivation + Config
 *
 * These tests verify that:
 * - workflows.json has the task_dispatch config block
 * - isdlc.md test-generate handler references test.skip scaffolds for task generation
 * - software-developer.md has the mechanical mode fallback note
 *
 * Test runner: node:test (Article II)
 * Test approach: Read files, assert content patterns
 *
 * Traces to: REQ-GH-220-task-level-delegation-in-phase-loop-controller
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const WORKFLOWS_PATH = join(PROJECT_ROOT, 'src', 'isdlc', 'config', 'workflows.json');
const SOFTWARE_DEV_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', '05-software-developer.md');

const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

describe('workflows.json task_dispatch config (FR-004)', () => {

  // TST-01
  it('contains task_dispatch block with required fields (TST-01, AC-004-01, AC-004-02, AC-004-03)', () => {
    const config = JSON.parse(readFile(WORKFLOWS_PATH));
    assert.ok(config.task_dispatch, 'must have task_dispatch block');
    assert.equal(config.task_dispatch.enabled, true, 'must be enabled');
    assert.ok(Array.isArray(config.task_dispatch.phases), 'phases must be an array');
    assert.ok(config.task_dispatch.phases.includes('05-test-strategy'), 'must include 05-test-strategy');
    assert.ok(config.task_dispatch.phases.includes('06-implementation'), 'must include 06-implementation');
    assert.ok(typeof config.task_dispatch.max_retries_per_task === 'number', 'max_retries_per_task must be a number');
    assert.ok(typeof config.task_dispatch.parallel_within_tier === 'boolean', 'parallel_within_tier must be a boolean');
  });
});

describe('test-generate scaffold derivation (FR-006)', () => {

  // TST-02
  it('isdlc.md test-generate references test.skip scaffolds for task generation (TST-02, AC-006-01, AC-006-02)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('test.skip()') && content.includes('tests/characterization/'),
      'test-generate must reference test.skip scaffolds in tests/characterization/'
    );
    assert.ok(
      content.includes('task-level dispatch') || content.includes('REQ-GH-220'),
      'test-generate Phase 06 must reference task-level dispatch'
    );
  });
});

describe('software-developer.md mechanical mode fallback (FR-004)', () => {

  // TST-03
  it('has mechanical mode fallback note referencing GH-220 (TST-03, AC-004-04)', () => {
    const content = readFile(SOFTWARE_DEV_PATH);
    assert.ok(
      content.includes('GH-220') && content.includes('task-level dispatch'),
      'mechanical mode section must reference GH-220 task-level dispatch as primary mode'
    );
  });
});
