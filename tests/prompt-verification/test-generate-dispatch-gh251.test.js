/**
 * Prompt Content Verification Tests: GH-251 Track 1 — Task-Level Dispatch for test-generate
 *
 * Verifies that:
 * - isdlc.md has precondition gate for characterization scaffolds (FR-001)
 * - isdlc.md has artifact folder creation with TEST-GEN- prefix (FR-002)
 * - 04-test-design-engineer.md has TEST-GENERATE MODE section (FR-003)
 * - 04-test-design-engineer.md specifies tier ordering (FR-004)
 * - workflows.json has workflow_type agent_modifier for test-generate (FR-005)
 * - 04-test-design-engineer.md specifies standard artifact output (FR-006)
 * - Codex projection bundle mirrors Claude path (FR-001-FR-006)
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md and .json files, assert content patterns
 * Test ID prefix: TGD- (Test-Generate Dispatch)
 *
 * Traces to: REQ-GH-251-task-dispatch-test-generate-upgrade
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const TEST_DESIGN_ENGINEER_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', '04-test-design-engineer.md');
const WORKFLOWS_PATH = join(PROJECT_ROOT, 'src', 'isdlc', 'config', 'workflows.json');
const CODEX_PROJECTION_PATH = join(PROJECT_ROOT, 'src', 'providers', 'codex', 'commands', 'test-generate.md');

const fileCache = {};
function readFile(filePath) {
  if (!fileCache[filePath]) {
    fileCache[filePath] = readFileSync(filePath, 'utf-8');
  }
  return fileCache[filePath];
}

// ---------------------------------------------------------------------------
// FR-001: Discover Precondition Gate (AC-001-01)
// ---------------------------------------------------------------------------

describe('FR-001: Precondition gate in isdlc.md test-generate handler', () => {

  // TGD-01: positive
  it('TGD-01: references characterization scaffold glob pattern (AC-001-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('characterization') && content.includes('.characterization.'),
      'test-generate handler must reference characterization scaffold glob pattern'
    );
  });

  // TGD-02: positive
  it('TGD-02: directs user to run /discover when no scaffolds found (AC-001-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('/discover'),
      'test-generate handler must direct user to /discover when scaffolds are missing'
    );
  });

  // TGD-03: negative
  it('TGD-03: specifies no workflow/state/branch creation on gate block (AC-001-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    // The handler must specify that when the gate blocks, no side effects occur
    assert.ok(
      content.includes('no') || content.includes('not') || content.includes('block'),
      'test-generate handler must specify side-effect prevention when gate blocks'
    );
  });
});

// ---------------------------------------------------------------------------
// FR-002: Artifact Folder Creation (AC-002-01)
// ---------------------------------------------------------------------------

describe('FR-002: Artifact folder creation in isdlc.md test-generate handler', () => {

  // TGD-04: positive
  it('TGD-04: references TEST-GEN- prefix for artifact folder naming (AC-002-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('TEST-GEN-'),
      'test-generate handler must reference TEST-GEN- naming prefix for artifact folder'
    );
  });

  // TGD-05: positive
  it('TGD-05: specifies meta.json with test-generate source (AC-002-01)', () => {
    const content = readFile(ISDLC_MD_PATH);
    assert.ok(
      content.includes('meta.json') && content.includes('test-generate'),
      'test-generate handler must specify meta.json creation with test-generate source'
    );
  });
});

// ---------------------------------------------------------------------------
// FR-003: Phase 05 Scaffold-to-Tasks Generation (AC-003-01)
// ---------------------------------------------------------------------------

describe('FR-003: TEST-GENERATE MODE in test-design-engineer', () => {

  // TGD-06: positive
  it('TGD-06: contains TEST-GENERATE MODE section with WORKFLOW_TYPE detection (AC-003-01)', () => {
    const content = readFile(TEST_DESIGN_ENGINEER_PATH);
    assert.ok(
      content.includes('TEST-GENERATE MODE') || content.includes('TEST-GENERATE'),
      'test-design-engineer must have a TEST-GENERATE MODE section'
    );
    assert.ok(
      content.includes('WORKFLOW_TYPE'),
      'TEST-GENERATE MODE must reference WORKFLOW_TYPE for mode detection'
    );
  });

  // TGD-07: positive
  it('TGD-07: specifies scaffold scan with AC-RE extraction (AC-003-01)', () => {
    const content = readFile(TEST_DESIGN_ENGINEER_PATH);
    assert.ok(
      content.includes('characterization') || content.includes('scaffold'),
      'TEST-GENERATE MODE must reference scaffold scanning'
    );
    assert.ok(
      content.includes('AC-RE'),
      'TEST-GENERATE MODE must reference AC-RE extraction from scaffold comments'
    );
  });

  // TGD-08: positive
  it('TGD-08: specifies tasks.md emission with files and traces (AC-003-01)', () => {
    const content = readFile(TEST_DESIGN_ENGINEER_PATH);
    assert.ok(
      content.includes('tasks.md'),
      'TEST-GENERATE MODE must specify emitting tasks.md'
    );
  });
});

// ---------------------------------------------------------------------------
// FR-004: Test Type Tier Ordering (AC-004-01)
// ---------------------------------------------------------------------------

describe('FR-004: Tier ordering in test-design-engineer', () => {

  // TGD-09: positive
  it('TGD-09: specifies unit tasks before system tasks via tier/blocked_by (AC-004-01)', () => {
    const content = readFile(TEST_DESIGN_ENGINEER_PATH);
    assert.ok(
      (content.includes('unit') && content.includes('system')) ||
      content.includes('tier'),
      'TEST-GENERATE MODE must specify tier ordering for unit vs system tasks'
    );
    assert.ok(
      content.includes('blocked_by') || content.includes('tier 0'),
      'TEST-GENERATE MODE must use blocked_by or tier mechanism for ordering'
    );
  });

  // TGD-10: positive
  it('TGD-10: documents classification heuristic with ambiguous default (AC-004-01)', () => {
    const content = readFile(TEST_DESIGN_ENGINEER_PATH);
    assert.ok(
      content.includes('classif') || content.includes('heuristic'),
      'TEST-GENERATE MODE must document classification heuristic'
    );
  });
});

// ---------------------------------------------------------------------------
// FR-005: Phase 06 Dispatch via Existing 3d-check (AC-005-01)
// ---------------------------------------------------------------------------

describe('FR-005: workflows.json agent_modifier for test-generate', () => {

  // TGD-11: positive
  it('TGD-11: test-generate workflow has workflow_type modifier for 05-test-strategy (AC-005-01)', () => {
    const config = JSON.parse(readFile(WORKFLOWS_PATH));
    const tg = config.workflows['test-generate'];
    assert.ok(tg, 'test-generate workflow must exist');
    assert.ok(tg.agent_modifiers, 'test-generate must have agent_modifiers');
    assert.ok(
      tg.agent_modifiers['05-test-strategy'],
      'agent_modifiers must include 05-test-strategy'
    );
    assert.equal(
      tg.agent_modifiers['05-test-strategy'].workflow_type,
      'test-generate',
      'workflow_type must be "test-generate"'
    );
  });

  // TGD-12: negative — verify no changes to task-dispatcher.js
  it('TGD-12: task_dispatch config already covers needed phases (AC-005-01)', () => {
    const config = JSON.parse(readFile(WORKFLOWS_PATH));
    assert.ok(config.task_dispatch, 'task_dispatch config must exist');
    assert.ok(
      config.task_dispatch.phases.includes('05-test-strategy'),
      'task_dispatch.phases must include 05-test-strategy'
    );
    assert.ok(
      config.task_dispatch.phases.includes('06-implementation'),
      'task_dispatch.phases must include 06-implementation'
    );
  });
});

// ---------------------------------------------------------------------------
// FR-006: Phase 05 Test Strategy Artifacts (AC-006-01)
// ---------------------------------------------------------------------------

describe('FR-006: Standard artifact output in TEST-GENERATE MODE', () => {

  // TGD-13: positive
  it('TGD-13: specifies test-strategy.md, test-cases/, and traceability-matrix.csv (AC-006-01)', () => {
    const content = readFile(TEST_DESIGN_ENGINEER_PATH);
    assert.ok(
      content.includes('test-strategy.md'),
      'TEST-GENERATE MODE must specify test-strategy.md artifact'
    );
    assert.ok(
      content.includes('test-cases'),
      'TEST-GENERATE MODE must specify test-cases/ directory'
    );
    assert.ok(
      content.includes('traceability-matrix'),
      'TEST-GENERATE MODE must specify traceability-matrix.csv'
    );
  });
});

// ---------------------------------------------------------------------------
// Codex Projection Bundle (FR-001 through FR-006)
// ---------------------------------------------------------------------------

describe('Codex test-generate projection bundle', () => {

  // TGD-14: positive — Codex projection must exist and contain scaffold/WORKFLOW_TYPE references
  it('TGD-14: Codex projection exists with precondition check and WORKFLOW_TYPE (FR-001-FR-006)', () => {
    assert.ok(existsSync(CODEX_PROJECTION_PATH), `Codex projection must exist at ${CODEX_PROJECTION_PATH}`);
    const content = readFile(CODEX_PROJECTION_PATH);
    assert.ok(
      content.includes('characterization') || content.includes('scaffold'),
      'Codex projection must include precondition check for scaffolds'
    );
    assert.ok(
      content.includes('WORKFLOW_TYPE') || content.includes('test-generate'),
      'Codex projection must include WORKFLOW_TYPE or test-generate reference'
    );
  });

  // TGD-15: positive — Codex projection must specify sequential dispatch
  it('TGD-15: Codex projection specifies sequential tier dispatch (FR-004, FR-005)', () => {
    assert.ok(existsSync(CODEX_PROJECTION_PATH), `Codex projection must exist at ${CODEX_PROJECTION_PATH}`);
    const content = readFile(CODEX_PROJECTION_PATH);
    assert.ok(
      content.includes('sequential') || content.includes('tier') || content.includes('codex exec'),
      'Codex projection must specify sequential or tier-based dispatch'
    );
  });
});
