/**
 * Codex Adapter Parity Tests
 *
 * Verifies that the Codex adapter produces identical loop state, file ordering,
 * verdict routing, and contract shapes as the core ImplementationLoop used directly.
 *
 * Requirements: REQ-0078
 *   FR-001 (AC-001-01, AC-001-02, AC-001-03)
 *   FR-002 (AC-002-01, AC-002-02)
 *   FR-003 (AC-003-01, AC-003-02)
 *   FR-004 (AC-004-01, AC-004-02)
 *
 * Test cases: CP-01 through CP-12
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { ImplementationLoop } from '../../../src/core/teams/implementation-loop.js';
import { readState, writeState } from '../../../src/core/state/index.js';
import { runImplementationLoop, createVerdictDrivenSpawner } from '../../../../../isdlc-codex/codex-adapter/implementation-loop-runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');
const parityDir = join(fixturesDir, 'parity-sequences');

// Load fixtures (same as REQ-0077 parity tests)
const teamSpec = JSON.parse(readFileSync(join(fixturesDir, 'sample-team-spec.json'), 'utf-8'));
const allPassSeq = JSON.parse(readFileSync(join(parityDir, 'all-pass.json'), 'utf-8'));
const reviseSeq = JSON.parse(readFileSync(join(parityDir, 'revise-then-pass.json'), 'utf-8'));
const maxCyclesSeq = JSON.parse(readFileSync(join(parityDir, 'max-cycles-fail.json'), 'utf-8'));
const emptyFilesSeq = JSON.parse(readFileSync(join(parityDir, 'empty-files.json'), 'utf-8'));
const singleFileSeq = JSON.parse(readFileSync(join(parityDir, 'single-file-pass.json'), 'utf-8'));
const largeFileSeq = JSON.parse(readFileSync(join(parityDir, 'large-file-list.json'), 'utf-8'));
const tddOrderingSeq = JSON.parse(readFileSync(join(parityDir, 'tdd-ordering-4-features.json'), 'utf-8'));
const mixedVerdictsSeq = JSON.parse(readFileSync(join(parityDir, 'mixed-verdicts.json'), 'utf-8'));
const maxCyclesBoundarySeq = JSON.parse(readFileSync(join(parityDir, 'max-cycles-boundary.json'), 'utf-8'));

// Load contract schemas for validation
const writerSchema = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'src', 'core', 'teams', 'contracts', 'writer-context.json'), 'utf-8'));
const reviewSchema = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'src', 'core', 'teams', 'contracts', 'review-context.json'), 'utf-8'));
const updateSchema = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'src', 'core', 'teams', 'contracts', 'update-context.json'), 'utf-8'));

// Helper: run verdict sequence through core directly (reference path)
function runCoreDirectSequence(files, verdictSequence, options = {}) {
  const loop = new ImplementationLoop(teamSpec);
  let state = loop.initFromPlan(files, options);
  const verdicts = [...verdictSequence];

  while (!loop.isComplete(state) && verdicts.length > 0) {
    const fileInfo = loop.computeNextFile(state);
    if (!fileInfo) break;

    const filePath = fileInfo.file_path;
    if (!state.cycle_per_file[filePath]) {
      state.cycle_per_file[filePath] = 1;
    }

    const verdict = verdicts.shift();
    const result = loop.processVerdict(state, verdict);
    state = result.loopState;

    if (result.action === 'fail') break;
  }

  return {
    completed_files: [...state.completed_files],
    verdicts: [...state.verdicts],
    cycle_per_file: { ...state.cycle_per_file },
    current_file_index: state.current_file_index,
    is_complete: loop.isComplete(state),
    tdd_ordering: state.tdd_ordering,
    file_order: state.files.map(f => f.path)
  };
}

// Helper: temp project for state persistence tests
function createTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'isdlc-codex-parity-'));
  mkdirSync(join(dir, '.isdlc'), { recursive: true });
  return dir;
}

function cleanupTemp(dir) {
  if (dir && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// CP-01 through CP-09: Core Parity (one per fixture)
// ===========================================================================

describe('Codex Adapter Parity: fixture-driven comparisons', () => {

  it('CP-01: all-pass fixture — Codex adapter matches core direct (FR-001, AC-001-01)', async () => {
    const coreResult = runCoreDirectSequence(allPassSeq.files, allPassSeq.verdicts_sequence);

    const spawner = createVerdictDrivenSpawner(allPassSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, allPassSeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files,
      'Completed files must match between Codex and core');
    assert.deepStrictEqual(codexResult.verdicts, coreResult.verdicts,
      'Verdict history must match');
    assert.equal(codexResult.is_complete, coreResult.is_complete,
      'Completion status must match');
  });

  it('CP-02: revise-then-pass fixture — Codex matches core verdict routing (FR-001, AC-001-03)', async () => {
    const coreResult = runCoreDirectSequence(reviseSeq.files, reviseSeq.verdicts_sequence);

    const spawner = createVerdictDrivenSpawner(reviseSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, reviseSeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.deepStrictEqual(codexResult.verdicts, coreResult.verdicts);
    assert.deepStrictEqual(codexResult.cycle_per_file, coreResult.cycle_per_file,
      'Cycle counts must match');
  });

  it('CP-03: max-cycles-fail fixture — Codex handles fail action same as core (FR-003, AC-003-02)', async () => {
    const coreResult = runCoreDirectSequence(maxCyclesSeq.files, maxCyclesSeq.verdicts_sequence);

    const spawner = createVerdictDrivenSpawner(maxCyclesSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, maxCyclesSeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.equal(codexResult.completed_files.length, 0, 'No files should complete');
    assert.equal(codexResult.is_complete, false, 'Loop should not be complete');
    assert.deepStrictEqual(codexResult.verdicts, coreResult.verdicts);
  });

  it('CP-04: empty-files fixture — immediate completion parity (FR-002, AC-002-01)', async () => {
    const coreResult = runCoreDirectSequence(emptyFilesSeq.files, emptyFilesSeq.verdicts_sequence);

    const spawner = createVerdictDrivenSpawner(emptyFilesSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, emptyFilesSeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.equal(codexResult.is_complete, true);
    assert.equal(codexResult.completed_files.length, 0);
  });

  it('CP-05: single-file-pass fixture — trivial case parity (FR-003, AC-003-01)', async () => {
    const coreResult = runCoreDirectSequence(singleFileSeq.files, singleFileSeq.verdicts_sequence);

    const spawner = createVerdictDrivenSpawner(singleFileSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, singleFileSeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.deepStrictEqual(codexResult.completed_files, ['src/config.js']);
    assert.equal(codexResult.is_complete, true);
  });

  it('CP-06: large-file-list fixture — 100-file stress parity (FR-002, AC-002-01)', async () => {
    const coreResult = runCoreDirectSequence(largeFileSeq.files, largeFileSeq.verdicts_sequence);

    const spawner = createVerdictDrivenSpawner(largeFileSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, largeFileSeq.files, {}, spawner);

    assert.equal(codexResult.completed_files.length, 100);
    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.equal(codexResult.is_complete, true);
  });

  it('CP-07: tdd-ordering fixture — Codex respects test-before-source ordering (FR-002, AC-002-01)', async () => {
    const coreResult = runCoreDirectSequence(tddOrderingSeq.files, tddOrderingSeq.verdicts_sequence, { tdd_ordering: true });

    const spawner = createVerdictDrivenSpawner(tddOrderingSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, tddOrderingSeq.files, { tdd_ordering: true }, spawner);

    assert.deepStrictEqual(codexResult.file_order, coreResult.file_order,
      'TDD file ordering must match');
    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.equal(codexResult.tdd_ordering, true);
  });

  it('CP-08: mixed-verdicts fixture — complex verdict sequence parity (FR-003, AC-003-02)', async () => {
    // Build verdict sequence from steps
    const verdictSequence = mixedVerdictsSeq.steps.map(s => s.verdict);
    const coreResult = runCoreDirectSequence(mixedVerdictsSeq.files, verdictSequence);

    const spawner = createVerdictDrivenSpawner(verdictSequence);
    const codexResult = await runImplementationLoop(teamSpec, mixedVerdictsSeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.deepStrictEqual(codexResult.verdicts, coreResult.verdicts);
    assert.deepStrictEqual(codexResult.cycle_per_file, coreResult.cycle_per_file);
    assert.equal(codexResult.verdicts.length, mixedVerdictsSeq.expected_verdict_count);
  });

  it('CP-09: max-cycles-boundary fixture — boundary behavior parity (FR-002, AC-002-01)', async () => {
    // Test: REVISE at cycle 1 (should get update), then PASS
    const verdictSequence = ['REVISE', 'PASS'];
    const coreResult = runCoreDirectSequence(maxCyclesBoundarySeq.files, verdictSequence);

    const spawner = createVerdictDrivenSpawner(verdictSequence);
    const codexResult = await runImplementationLoop(teamSpec, maxCyclesBoundarySeq.files, {}, spawner);

    assert.deepStrictEqual(codexResult.completed_files, coreResult.completed_files);
    assert.deepStrictEqual(codexResult.verdicts, coreResult.verdicts);
    assert.deepStrictEqual(codexResult.cycle_per_file, coreResult.cycle_per_file);
  });
});

// ===========================================================================
// CP-10: Contract Shape Validation
// ===========================================================================

describe('Codex Adapter Parity: contract shape validation', () => {

  it('CP-10: spawnCodexAgent receives schema-conformant contexts (FR-001, AC-001-02)', async () => {
    const receivedContexts = { writer: [], reviewer: [], updater: [] };

    // Custom spawner that records contexts
    const recordingSpawner = async (role, context) => {
      receivedContexts[role].push(structuredClone(context));
      if (role === 'writer') {
        return { file_produced: context.file_path, content_summary: 'test content' };
      }
      if (role === 'reviewer') {
        return { verdict: 'REVISE', findings: { blocking: [{ category: 'test', description: 'fix' }], warning: [] } };
      }
      if (role === 'updater') {
        return { fixes_applied: ['fix1'], tests_passed: true };
      }
    };

    // Use revise-then-pass: triggers writer + reviewer + updater + reviewer
    // We need a spawner that returns REVISE first, then PASS, then PASS
    let callCount = 0;
    const verdicts = ['REVISE', 'PASS', 'PASS'];
    const shapeTester = async (role, context) => {
      receivedContexts[role].push(structuredClone(context));
      if (role === 'writer') {
        return { file_produced: context.file_path, content_summary: 'test content' };
      }
      if (role === 'reviewer') {
        const v = verdicts.shift();
        return { verdict: v, findings: { blocking: v === 'REVISE' ? [{ category: 'test', description: 'fix' }] : [], warning: [] } };
      }
      if (role === 'updater') {
        return { fixes_applied: ['fix1'], tests_passed: true };
      }
    };

    await runImplementationLoop(teamSpec, reviseSeq.files, {}, shapeTester);

    // Validate writer contexts against schema
    assert.ok(receivedContexts.writer.length >= 1, 'Writer should have been called');
    for (const ctx of receivedContexts.writer) {
      assert.equal(ctx.mode, 'writer', 'Writer context must have mode=writer');
      assert.equal(typeof ctx.file_path, 'string', 'Writer context must have file_path string');
      assert.equal(typeof ctx.file_number, 'number', 'Writer context must have file_number');
      assert.equal(typeof ctx.total_files, 'number', 'Writer context must have total_files');
      assert.ok(Array.isArray(ctx.completed_files), 'Writer context must have completed_files array');
    }

    // Validate reviewer contexts against schema
    assert.ok(receivedContexts.reviewer.length >= 1, 'Reviewer should have been called');
    for (const ctx of receivedContexts.reviewer) {
      assert.equal(typeof ctx.file_path, 'string', 'Review context must have file_path string');
      assert.equal(typeof ctx.file_number, 'number', 'Review context must have file_number');
      assert.equal(typeof ctx.cycle, 'number', 'Review context must have cycle');
      assert.ok(ctx.cycle >= 1, 'Review context cycle must be >= 1');
    }

    // Validate updater contexts against schema
    assert.ok(receivedContexts.updater.length >= 1, 'Updater should have been called for REVISE');
    for (const ctx of receivedContexts.updater) {
      assert.equal(typeof ctx.file_path, 'string', 'Update context must have file_path string');
      assert.equal(typeof ctx.cycle, 'number', 'Update context must have cycle');
      assert.equal(ctx.reviewer_verdict, 'REVISE', 'Update context must have reviewer_verdict=REVISE');
      assert.ok(typeof ctx.findings === 'object', 'Update context must have findings object');
      assert.ok(Array.isArray(ctx.findings.blocking), 'Update context findings must have blocking array');
      assert.ok(Array.isArray(ctx.findings.warning), 'Update context findings must have warning array');
    }
  });
});

// ===========================================================================
// CP-11: State Persistence Parity
// ===========================================================================

describe('Codex Adapter Parity: state persistence', () => {
  let tempDir;
  after(() => cleanupTemp(tempDir));

  it('CP-11: Codex loop state persists and resumes identically to core (FR-002, AC-002-02)', async () => {
    tempDir = createTempProject();

    // Run Codex adapter through all-pass fixture
    const spawner = createVerdictDrivenSpawner(allPassSeq.verdicts_sequence);
    const codexResult = await runImplementationLoop(teamSpec, allPassSeq.files, {}, spawner);

    // Persist Codex result state
    await writeState(tempDir, { loop_state: {
      completed_files: codexResult.completed_files,
      verdicts: codexResult.verdicts,
      cycle_per_file: codexResult.cycle_per_file,
      current_file_index: codexResult.current_file_index,
      is_complete: codexResult.is_complete
    }});

    // Read back
    const persisted = await readState(tempDir);
    const restored = persisted.loop_state;

    // Verify round-trip integrity
    assert.deepStrictEqual(restored.completed_files, codexResult.completed_files);
    assert.deepStrictEqual(restored.verdicts, codexResult.verdicts);
    assert.deepStrictEqual(restored.cycle_per_file, codexResult.cycle_per_file);
    assert.equal(restored.current_file_index, codexResult.current_file_index);
    assert.equal(restored.is_complete, codexResult.is_complete);

    // Also verify it matches core direct
    const coreResult = runCoreDirectSequence(allPassSeq.files, allPassSeq.verdicts_sequence);
    assert.deepStrictEqual(restored.completed_files, coreResult.completed_files);
  });
});

// ===========================================================================
// CP-12: Error Handling
// ===========================================================================

describe('Codex Adapter Parity: error handling', () => {

  it('CP-12a: invalid teamSpec propagates error from core', async () => {
    const spawner = createVerdictDrivenSpawner(['PASS']);
    await assert.rejects(
      () => runImplementationLoop({}, singleFileSeq.files, {}, spawner),
      /missing required field/i,
      'Should propagate teamSpec validation error from core'
    );
  });

  it('CP-12b: spawner failure propagates to caller', async () => {
    const failingSpawner = async () => { throw new Error('Codex agent spawn failed'); };
    await assert.rejects(
      () => runImplementationLoop(teamSpec, singleFileSeq.files, {}, failingSpawner),
      /Codex agent spawn failed/,
      'Should propagate spawner errors'
    );
  });

  it('CP-12c: invalid verdict from spawner propagates error from core', async () => {
    const badSpawner = async (role) => {
      if (role === 'writer') return { file_produced: 'test.js', content_summary: 'test' };
      if (role === 'reviewer') return { verdict: 'INVALID', findings: { blocking: [], warning: [] } };
      return {};
    };
    await assert.rejects(
      () => runImplementationLoop(teamSpec, singleFileSeq.files, {}, badSpawner),
      /Unknown verdict/i,
      'Should propagate invalid verdict error from core'
    );
  });
});
