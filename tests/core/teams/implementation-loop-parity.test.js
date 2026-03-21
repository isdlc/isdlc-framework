/**
 * Integration / Parity tests for the Implementation Loop
 *
 * Full loop simulation exercising the entire Writer/Reviewer/Updater sequence
 * against fixture data. Validates that extracted core logic produces identical
 * state transitions as the current inline implementation.
 *
 * Requirements: FR-001 (AC-001-01, AC-001-02, AC-001-03),
 *               FR-002 (AC-002-01, AC-002-02, AC-002-03),
 *               FR-003 (AC-003-01),
 *               FR-004 (AC-004-01, AC-004-02)
 *
 * 30 test cases (PT-01 through PT-30).
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { ImplementationLoop } from '../../../src/core/teams/implementation-loop.js';
import { readState, writeState } from '../../../src/core/state/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures');
const parityDir = join(fixturesDir, 'parity-sequences');

// Load fixtures
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

// Minimal schema validator (same as in contracts.test.js)
function validateAgainstSchema(schema, data) {
  const errors = [];
  if (schema.type === 'object' && typeof data !== 'object') {
    errors.push(`Expected object, got ${typeof data}`);
    return { valid: false, errors };
  }
  if (schema.required) {
    for (const field of schema.required) {
      if (data[field] === undefined) {
        errors.push(`Missing required field: ${field}`);
      }
    }
  }
  if (schema.properties && typeof data === 'object') {
    for (const [key, constraint] of Object.entries(schema.properties)) {
      if (data[key] === undefined) continue;
      if (constraint.const !== undefined && data[key] !== constraint.const) {
        errors.push(`Field ${key}: expected const "${constraint.const}", got "${data[key]}"`);
      }
      if (constraint.type) {
        const jsType = Array.isArray(data[key]) ? 'array' : typeof data[key];
        if (constraint.type === 'integer') {
          if (typeof data[key] !== 'number' || !Number.isInteger(data[key])) {
            errors.push(`Field ${key}: expected integer, got ${data[key]}`);
          }
        } else if (constraint.type === 'array') {
          if (!Array.isArray(data[key])) {
            errors.push(`Field ${key}: expected array, got ${jsType}`);
          }
        } else if (jsType !== constraint.type) {
          errors.push(`Field ${key}: expected ${constraint.type}, got ${jsType}`);
        }
      }
      if (constraint.minimum !== undefined && data[key] < constraint.minimum) {
        errors.push(`Field ${key}: value ${data[key]} below minimum ${constraint.minimum}`);
      }
      if (constraint.maximum !== undefined && data[key] > constraint.maximum) {
        errors.push(`Field ${key}: value ${data[key]} above maximum ${constraint.maximum}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// Helper: run a full verdict sequence through the loop, initializing cycle_per_file as needed
function runVerdictSequence(loop, state, verdicts) {
  const results = [];
  for (const verdict of verdicts) {
    const fileInfo = loop.computeNextFile(state);
    if (!fileInfo) break;
    const filePath = fileInfo.file_path;
    if (!state.cycle_per_file[filePath]) {
      state.cycle_per_file[filePath] = 1;
    }
    const result = loop.processVerdict(state, verdict);
    results.push({ fileInfo, result });
    state = result.loopState;
  }
  return { state, results };
}

// Helper: temp project for state persistence tests
function createTempProject() {
  const dir = mkdtempSync(join(tmpdir(), 'isdlc-parity-'));
  mkdirSync(join(dir, '.isdlc'), { recursive: true });
  return dir;
}

function cleanupTemp(dir) {
  if (dir && existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ===========================================================================
// SECTION 1: Original 8 parity tests (PT-01 through PT-08)
// ===========================================================================

describe('Parity: full loop simulations', () => {
  it('PT-01: 3-file loop with all PASS on first review cycle', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(allPassSeq.files);
    const { state: finalState } = runVerdictSequence(loop, state, allPassSeq.verdicts_sequence);

    assert.ok(loop.isComplete(finalState), 'Loop should be complete');
    assert.deepStrictEqual(finalState.completed_files, allPassSeq.expected_completed_files);
  });

  it('PT-02: loop with REVISE then PASS (updater cycle)', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(reviseSeq.files);

    // First file: REVISE
    const file1 = loop.computeNextFile(state);
    state.cycle_per_file[file1.file_path] = 1;
    let result = loop.processVerdict(state, 'REVISE');
    assert.equal(result.action, 'update');
    state = result.loopState;

    // First file: PASS after update
    result = loop.processVerdict(state, 'PASS');
    assert.equal(result.action, 'next_file');
    state = result.loopState;

    // Second file: PASS
    const file2 = loop.computeNextFile(state);
    state.cycle_per_file[file2.file_path] = 1;
    result = loop.processVerdict(state, 'PASS');
    assert.equal(result.action, 'complete');
    state = result.loopState;

    assert.ok(loop.isComplete(state));
    assert.deepStrictEqual(state.completed_files, reviseSeq.expected_completed_files);
  });

  it('PT-03: max cycles exhausted returns fail action', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(maxCyclesSeq.files);

    const file = loop.computeNextFile(state);
    state.cycle_per_file[file.file_path] = 1;

    // Cycle 1: REVISE
    let result = loop.processVerdict(state, 'REVISE');
    assert.equal(result.action, 'update');
    state = result.loopState;

    // Cycle 2: REVISE
    result = loop.processVerdict(state, 'REVISE');
    assert.equal(result.action, 'update');
    state = result.loopState;

    // Cycle 3 (max): REVISE -> fail
    result = loop.processVerdict(state, 'REVISE');
    assert.equal(result.action, 'fail');

    assert.equal(loop.isComplete(state), false);
    assert.deepStrictEqual(state.completed_files, []);
  });

  it('PT-04: TDD ordering places test files before source files', () => {
    const loop = new ImplementationLoop(teamSpec);
    const files = [
      { path: 'src/auth.js', type: 'source', order: 1 },
      { path: 'tests/auth.test.js', type: 'test', order: 2 },
      { path: 'src/db.js', type: 'source', order: 3 },
      { path: 'tests/db.test.js', type: 'test', order: 4 }
    ];
    const state = loop.initFromPlan(files, { tdd_ordering: true });

    const order = state.files.map(f => f.type);
    assert.deepStrictEqual(order, ['test', 'source', 'test', 'source']);
  });
});

// ===========================================================================
// PT-05: State persistence round-trip (original)
// ===========================================================================

describe('Parity: state persistence', () => {
  let tempDir;
  after(() => cleanupTemp(tempDir));

  it('PT-05: state round-trip (write state, read, resume loop)', async () => {
    tempDir = createTempProject();

    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(allPassSeq.files);

    // Process first file
    const file1 = loop.computeNextFile(state);
    state.cycle_per_file[file1.file_path] = 1;
    const result = loop.processVerdict(state, 'PASS');
    state = result.loopState;

    // Persist
    await writeState(tempDir, { loop_state: state });

    // Read back
    const persisted = await readState(tempDir);
    const resumedState = persisted.loop_state;

    // Resume loop from persisted state
    const loop2 = new ImplementationLoop(teamSpec);
    const nextFile = loop2.computeNextFile(resumedState);
    assert.ok(nextFile, 'Should have next file after resuming');
    assert.equal(nextFile.file_number, 2, 'Should be on file 2');
    assert.equal(resumedState.completed_files.length, 1);
  });
});

// ===========================================================================
// PT-06: CJS bridge parity (original)
// ===========================================================================

describe('Parity: CJS bridge', () => {
  let tempDir;
  after(() => cleanupTemp(tempDir));

  it('PT-06: CJS bridge produces identical results to ESM direct', async () => {
    const teamsBridge = await import('../../../src/core/bridge/teams.cjs');
    const stateBridge = await import('../../../src/core/bridge/state.cjs');

    // Create loop via bridge
    const bridgeLoop = await teamsBridge.default.createImplementationLoop(teamSpec);
    const bridgeState = bridgeLoop.initFromPlan(allPassSeq.files);

    // Create loop via ESM direct
    const directLoop = new ImplementationLoop(teamSpec);
    const directState = directLoop.initFromPlan(allPassSeq.files);

    // Compare states
    assert.deepStrictEqual(bridgeState, directState);

    // Compare computeNextFile
    const bridgeNext = bridgeLoop.computeNextFile(bridgeState);
    const directNext = directLoop.computeNextFile(directState);
    assert.deepStrictEqual(bridgeNext, directNext);

    // Test state bridge
    tempDir = createTempProject();
    await stateBridge.default.writeState(tempDir, { test: 'bridge' });
    const readBack = await stateBridge.default.readState(tempDir);
    assert.deepStrictEqual(readBack, { test: 'bridge' });
  });
});

// ===========================================================================
// PT-07, PT-08: Contract schema validation (original)
// ===========================================================================

describe('Parity: contract schema validation', () => {
  it('PT-07: buildWriterContext output validates against writer-context schema', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(allPassSeq.files);
    const fileInfo = loop.computeNextFile(state);

    const ctx = loop.buildWriterContext(state, fileInfo);
    const result = validateAgainstSchema(writerSchema, ctx);
    assert.ok(result.valid, `Writer context should validate: ${result.errors.join(', ')}`);
  });

  it('PT-08: buildReviewContext output validates against review-context schema', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(allPassSeq.files);
    const fileInfo = loop.computeNextFile(state);

    const ctx = loop.buildReviewContext(state, fileInfo, 1);
    const result = validateAgainstSchema(reviewSchema, ctx);
    assert.ok(result.valid, `Review context should validate: ${result.errors.join(', ')}`);
  });
});

// ===========================================================================
// SECTION 2: NEW PARITY TESTS (PT-09 through PT-30)
// ===========================================================================

// ---------------------------------------------------------------------------
// Edge cases (PT-09, PT-10, PT-11)
// ---------------------------------------------------------------------------

describe('Parity: edge cases', () => {
  it('PT-09: empty file list produces immediate completion', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(emptyFilesSeq.files);

    // computeNextFile should return null immediately
    const nextFile = loop.computeNextFile(state);
    assert.equal(nextFile, null, 'No files to process');

    // isComplete should be true (0 of 0 files done)
    assert.ok(loop.isComplete(state), 'Empty loop is complete');
    assert.deepStrictEqual(state.completed_files, []);
    assert.equal(state.files.length, 0);
  });

  it('PT-10: single file PASS completes in one step', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(singleFileSeq.files);

    const fileInfo = loop.computeNextFile(state);
    assert.ok(fileInfo, 'Should have a file to process');
    assert.equal(fileInfo.file_number, 1);
    assert.equal(fileInfo.total, 1);
    assert.equal(fileInfo.file_path, 'src/config.js');

    state.cycle_per_file[fileInfo.file_path] = 1;
    const result = loop.processVerdict(state, 'PASS');
    assert.equal(result.action, 'complete', 'Single file PASS should complete');
    assert.ok(loop.isComplete(result.loopState));
    assert.deepStrictEqual(result.loopState.completed_files, singleFileSeq.expected_completed_files);
  });

  it('PT-11: 100-file list processes correctly (stress test)', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(largeFileSeq.files);

    assert.equal(state.files.length, 100, 'Should have 100 files');

    // Run all 100 PASS verdicts
    const { state: finalState } = runVerdictSequence(loop, state, largeFileSeq.verdicts_sequence);

    assert.ok(loop.isComplete(finalState), 'All 100 files should be complete');
    assert.equal(finalState.completed_files.length, 100);
    assert.deepStrictEqual(finalState.completed_files, largeFileSeq.expected_completed_files);

    // Verify file numbering was correct throughout
    const summary = loop.getSummary(finalState);
    assert.equal(summary.total_files, 100);
    assert.equal(summary.remaining_files, 0);
    assert.equal(summary.verdicts.length, 100);
  });
});

// ---------------------------------------------------------------------------
// TDD ordering verification (PT-12, PT-13, PT-14, PT-15)
// ---------------------------------------------------------------------------

describe('Parity: TDD ordering', () => {
  it('PT-12: 4-feature TDD ordering — every test precedes its source', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(tddOrderingSeq.files, { tdd_ordering: true });

    // Verify type ordering: test, source, test, source, ...
    const typeOrder = state.files.map(f => f.type);
    assert.deepStrictEqual(typeOrder, tddOrderingSeq.expected_types_order);

    // Verify file path ordering: each test file is immediately before its source
    const pathOrder = state.files.map(f => f.path);
    assert.deepStrictEqual(pathOrder, tddOrderingSeq.expected_tdd_order);

    // Verify that for each pair, the base names match
    for (let i = 0; i < state.files.length; i += 2) {
      const testFile = state.files[i];
      const sourceFile = state.files[i + 1];
      assert.equal(testFile.type, 'test', `Index ${i} should be test`);
      assert.equal(sourceFile.type, 'source', `Index ${i + 1} should be source`);

      // Extract base names and verify they match
      const testBase = testFile.path.split('/').pop().replace(/\.test\.(js|ts|cjs|mjs)$/, '');
      const sourceBase = sourceFile.path.split('/').pop().replace(/\.(js|ts|cjs|mjs)$/, '');
      assert.equal(testBase, sourceBase, `Pair at index ${i}: test "${testFile.path}" should match source "${sourceFile.path}"`);
    }
  });

  it('PT-13: TDD ordering with unpaired files appends them at end', () => {
    const loop = new ImplementationLoop(teamSpec);
    const files = [
      { path: 'src/auth.js', type: 'source', order: 1 },
      { path: 'tests/auth.test.js', type: 'test', order: 2 },
      { path: 'src/orphan.js', type: 'source', order: 3 },
      { path: 'tests/standalone.test.js', type: 'test', order: 4 }
    ];
    const state = loop.initFromPlan(files, { tdd_ordering: true });

    // auth pair should come first
    assert.equal(state.files[0].path, 'tests/auth.test.js');
    assert.equal(state.files[1].path, 'src/auth.js');

    // Unpaired test and source should follow
    const remaining = state.files.slice(2).map(f => f.path);
    assert.ok(remaining.includes('tests/standalone.test.js'), 'Unpaired test should be present');
    assert.ok(remaining.includes('src/orphan.js'), 'Unpaired source should be present');
  });

  it('PT-14: TDD ordering with all-test files (no sources) preserves order', () => {
    const loop = new ImplementationLoop(teamSpec);
    const files = [
      { path: 'tests/a.test.js', type: 'test', order: 1 },
      { path: 'tests/b.test.js', type: 'test', order: 2 },
      { path: 'tests/c.test.js', type: 'test', order: 3 }
    ];
    const state = loop.initFromPlan(files, { tdd_ordering: true });

    // All tests, no pairing possible — should keep original order
    const paths = state.files.map(f => f.path);
    assert.deepStrictEqual(paths, ['tests/a.test.js', 'tests/b.test.js', 'tests/c.test.js']);
  });

  it('PT-15: TDD ordering with all-source files (no tests) preserves order', () => {
    const loop = new ImplementationLoop(teamSpec);
    const files = [
      { path: 'src/x.js', type: 'source', order: 1 },
      { path: 'src/y.js', type: 'source', order: 2 },
      { path: 'src/z.js', type: 'source', order: 3 }
    ];
    const state = loop.initFromPlan(files, { tdd_ordering: true });

    // All sources, no pairing possible — should keep original order
    const paths = state.files.map(f => f.path);
    assert.deepStrictEqual(paths, ['src/x.js', 'src/y.js', 'src/z.js']);
  });
});

// ---------------------------------------------------------------------------
// Mixed verdict sequences (PT-16, PT-17)
// ---------------------------------------------------------------------------

describe('Parity: mixed verdict sequences', () => {
  it('PT-16: PASS-REVISE-PASS-REVISE-REVISE-PASS across 4 files', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(mixedVerdictsSeq.files);

    // Walk through the step-by-step sequence from the fixture
    for (const step of mixedVerdictsSeq.steps) {
      const fileInfo = loop.computeNextFile(state);
      assert.ok(fileInfo, `Should have a file for step: ${step.note}`);
      assert.equal(fileInfo.file_path, step.file, `File should be ${step.file} for step: ${step.note}`);

      if (!state.cycle_per_file[fileInfo.file_path]) {
        state.cycle_per_file[fileInfo.file_path] = 1;
      }

      const result = loop.processVerdict(state, step.verdict);
      assert.equal(result.action, step.expected_action, `Action should be "${step.expected_action}" for step: ${step.note}`);
      state = result.loopState;
    }

    assert.ok(loop.isComplete(state), 'Loop should be complete after all steps');
    assert.deepStrictEqual(state.completed_files, mixedVerdictsSeq.expected_completed_files);
  });

  it('PT-17: verdict history records every verdict in order', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(mixedVerdictsSeq.files);

    for (const step of mixedVerdictsSeq.steps) {
      const fileInfo = loop.computeNextFile(state);
      if (!state.cycle_per_file[fileInfo.file_path]) {
        state.cycle_per_file[fileInfo.file_path] = 1;
      }
      const result = loop.processVerdict(state, step.verdict);
      state = result.loopState;
    }

    // Verify total verdict count matches expected
    assert.equal(state.verdicts.length, mixedVerdictsSeq.expected_verdict_count,
      `Should have ${mixedVerdictsSeq.expected_verdict_count} verdicts`);

    // Verify the sequence of verdicts matches the steps
    const expectedVerdicts = mixedVerdictsSeq.steps.map(s => s.verdict);
    const actualVerdicts = state.verdicts.map(v => v.verdict);
    assert.deepStrictEqual(actualVerdicts, expectedVerdicts, 'Verdict sequence should match');

    // Verify each verdict references the correct file
    for (let i = 0; i < mixedVerdictsSeq.steps.length; i++) {
      assert.equal(state.verdicts[i].file, mixedVerdictsSeq.steps[i].file,
        `Verdict ${i} should reference file ${mixedVerdictsSeq.steps[i].file}`);
    }
  });
});

// ---------------------------------------------------------------------------
// Max cycles boundary (PT-18, PT-19, PT-20)
// ---------------------------------------------------------------------------

describe('Parity: max cycles boundary', () => {
  it('PT-18: one under max cycles (cycle 2 of 3) — REVISE returns update', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(maxCyclesBoundarySeq.files);

    const fileInfo = loop.computeNextFile(state);
    const filePath = fileInfo.file_path;

    // Set up to cycle 1 (one under max = cycle 2 after this REVISE)
    state.cycle_per_file[filePath] = 1;

    // First REVISE at cycle 1 -> should get update (advances to cycle 2)
    const result = loop.processVerdict(state, 'REVISE');
    assert.equal(result.action, 'update', 'REVISE at cycle 1 of 3 should return update');
    assert.equal(result.loopState.cycle_per_file[filePath], 2, 'Cycle should advance to 2');
  });

  it('PT-19: exactly at max cycles (cycle 3 of 3) — REVISE returns fail', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(maxCyclesBoundarySeq.files);

    const fileInfo = loop.computeNextFile(state);
    const filePath = fileInfo.file_path;

    // Set up to cycle 3 (at max)
    state.cycle_per_file[filePath] = 3;

    const result = loop.processVerdict(state, 'REVISE');
    assert.equal(result.action, 'fail', 'REVISE at cycle 3 of 3 should return fail');
  });

  it('PT-20: PASS at max cycle still succeeds (not blocked by cycle count)', () => {
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(maxCyclesBoundarySeq.files);

    const fileInfo = loop.computeNextFile(state);
    const filePath = fileInfo.file_path;

    // Set up to cycle 3 (at max) — but verdict is PASS, which should still work
    state.cycle_per_file[filePath] = 3;

    const result = loop.processVerdict(state, 'PASS');
    assert.equal(result.action, 'complete', 'PASS at max cycle should still complete');
    assert.ok(result.loopState.completed_files.includes(filePath));
  });
});

// ---------------------------------------------------------------------------
// Contract field completeness (PT-21, PT-22, PT-23, PT-24)
// ---------------------------------------------------------------------------

describe('Parity: contract field completeness', () => {
  it('PT-21: WRITER_CONTEXT has all 7 fields with correct types', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(allPassSeq.files, { tdd_ordering: true });
    const fileInfo = loop.computeNextFile(state);

    const ctx = loop.buildWriterContext(state, fileInfo);

    // Verify all fields exist
    assert.equal(ctx.mode, 'writer', 'mode must be "writer"');
    assert.equal(ctx.per_file_loop, true, 'per_file_loop must be true');
    assert.equal(typeof ctx.tdd_ordering, 'boolean', 'tdd_ordering must be boolean');
    assert.equal(ctx.tdd_ordering, true, 'tdd_ordering should reflect state');
    assert.equal(typeof ctx.file_number, 'number', 'file_number must be number');
    assert.ok(Number.isInteger(ctx.file_number), 'file_number must be integer');
    assert.equal(ctx.file_number, 1, 'First file should be 1');
    assert.equal(typeof ctx.total_files, 'number', 'total_files must be number');
    assert.ok(Number.isInteger(ctx.total_files), 'total_files must be integer');
    assert.equal(ctx.total_files, allPassSeq.files.length);
    assert.equal(typeof ctx.file_path, 'string', 'file_path must be string');
    assert.ok(Array.isArray(ctx.completed_files), 'completed_files must be array');
    assert.equal(ctx.completed_files.length, 0, 'No files completed yet');

    // Validate against schema for good measure
    const validation = validateAgainstSchema(writerSchema, ctx);
    assert.ok(validation.valid, `Schema validation: ${validation.errors.join(', ')}`);
  });

  it('PT-22: REVIEW_CONTEXT has all required fields with correct types', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(allPassSeq.files);
    const fileInfo = loop.computeNextFile(state);

    const ctx = loop.buildReviewContext(state, fileInfo, 2);

    assert.equal(typeof ctx.file_path, 'string', 'file_path must be string');
    assert.equal(ctx.file_path, fileInfo.file_path);
    assert.equal(typeof ctx.file_number, 'number', 'file_number must be number');
    assert.ok(Number.isInteger(ctx.file_number), 'file_number must be integer');
    assert.equal(ctx.file_number, 1);
    assert.equal(typeof ctx.cycle, 'number', 'cycle must be number');
    assert.ok(Number.isInteger(ctx.cycle), 'cycle must be integer');
    assert.equal(ctx.cycle, 2, 'Cycle should be 2');

    const validation = validateAgainstSchema(reviewSchema, ctx);
    assert.ok(validation.valid, `Schema validation: ${validation.errors.join(', ')}`);
  });

  it('PT-23: UPDATE_CONTEXT has all required fields including nested findings', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(reviseSeq.files);
    const fileInfo = loop.computeNextFile(state);
    state.cycle_per_file[fileInfo.file_path] = 2;

    const findings = reviseSeq.findings_for_revise;
    const ctx = loop.buildUpdateContext(state, fileInfo, findings);

    // Verify all required fields
    assert.equal(typeof ctx.file_path, 'string', 'file_path must be string');
    assert.equal(ctx.file_path, fileInfo.file_path);
    assert.equal(typeof ctx.cycle, 'number', 'cycle must be number');
    assert.ok(Number.isInteger(ctx.cycle), 'cycle must be integer');
    assert.equal(ctx.cycle, 2, 'Cycle should match state');
    assert.equal(ctx.reviewer_verdict, 'REVISE', 'reviewer_verdict must be REVISE');
    assert.equal(typeof ctx.findings, 'object', 'findings must be object');
    assert.ok(Array.isArray(ctx.findings.blocking), 'findings.blocking must be array');
    assert.ok(Array.isArray(ctx.findings.warning), 'findings.warning must be array');
    assert.equal(ctx.findings.blocking.length, 1, 'Should have 1 blocking finding');
    assert.equal(ctx.findings.warning.length, 1, 'Should have 1 warning finding');

    const validation = validateAgainstSchema(updateSchema, ctx);
    assert.ok(validation.valid, `Schema validation: ${validation.errors.join(', ')}`);
  });

  it('PT-24: UPDATE_CONTEXT cycle field matches current cycle_per_file value', () => {
    const loop = new ImplementationLoop(teamSpec);
    const state = loop.initFromPlan(allPassSeq.files);
    const fileInfo = loop.computeNextFile(state);

    // Simulate being on cycle 3
    state.cycle_per_file[fileInfo.file_path] = 3;

    const findings = { blocking: [], warning: [] };
    const ctx = loop.buildUpdateContext(state, fileInfo, findings);
    assert.equal(ctx.cycle, 3, 'UPDATE_CONTEXT cycle should match cycle_per_file');

    // Change to cycle 1 and verify
    state.cycle_per_file[fileInfo.file_path] = 1;
    const ctx2 = loop.buildUpdateContext(state, fileInfo, findings);
    assert.equal(ctx2.cycle, 1, 'UPDATE_CONTEXT cycle should track cycle_per_file changes');
  });
});

// ---------------------------------------------------------------------------
// State persistence round-trip (PT-25, PT-26, PT-27)
// ---------------------------------------------------------------------------

describe('Parity: state persistence round-trip (expanded)', () => {
  let tempDir;
  after(() => cleanupTemp(tempDir));

  it('PT-25: mid-loop state persists and resumes with identical behavior', async () => {
    tempDir = createTempProject();
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(mixedVerdictsSeq.files);

    // Process first two steps (PASS on file 1, REVISE on file 2)
    const step1FileInfo = loop.computeNextFile(state);
    state.cycle_per_file[step1FileInfo.file_path] = 1;
    let result = loop.processVerdict(state, 'PASS');
    state = result.loopState;

    const step2FileInfo = loop.computeNextFile(state);
    state.cycle_per_file[step2FileInfo.file_path] = 1;
    result = loop.processVerdict(state, 'REVISE');
    state = result.loopState;

    // Persist mid-loop
    await writeState(tempDir, { loop_state: state });

    // Read back and resume
    const persisted = await readState(tempDir);
    const resumedState = persisted.loop_state;
    const loop2 = new ImplementationLoop(teamSpec);

    // Verify we can continue exactly where we left off
    const nextFile = loop2.computeNextFile(resumedState);
    assert.equal(nextFile.file_path, 'src/b.js', 'Should still be on file b after resume');
    assert.equal(resumedState.completed_files.length, 1, 'One file should be completed');
    assert.equal(resumedState.completed_files[0], 'src/a.js');
    assert.equal(resumedState.cycle_per_file['src/b.js'], 2, 'File b should be on cycle 2');

    // Continue processing: PASS on file 2
    const result2 = loop2.processVerdict(resumedState, 'PASS');
    assert.equal(result2.action, 'next_file', 'Should advance to next file');
  });

  it('PT-26: state with verdicts history round-trips without data loss', async () => {
    tempDir = createTempProject();
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(allPassSeq.files);

    // Build up a verdict history
    const { state: finalState } = runVerdictSequence(loop, state, allPassSeq.verdicts_sequence);

    // Persist
    await writeState(tempDir, { loop_state: finalState });

    // Read back
    const persisted = await readState(tempDir);
    const restored = persisted.loop_state;

    // Every verdict in history should survive round-trip
    assert.equal(restored.verdicts.length, finalState.verdicts.length);
    assert.deepStrictEqual(restored.verdicts, finalState.verdicts);

    // All state fields should match
    assert.deepStrictEqual(restored.completed_files, finalState.completed_files);
    assert.equal(restored.current_file_index, finalState.current_file_index);
    assert.equal(restored.tdd_ordering, finalState.tdd_ordering);
  });

  it('PT-27: state with cycle_per_file round-trips correctly', async () => {
    tempDir = createTempProject();
    const loop = new ImplementationLoop(teamSpec);
    let state = loop.initFromPlan(reviseSeq.files);

    // Process with a REVISE to build cycle_per_file data
    const fileInfo = loop.computeNextFile(state);
    state.cycle_per_file[fileInfo.file_path] = 1;
    const result = loop.processVerdict(state, 'REVISE');
    state = result.loopState;

    assert.equal(state.cycle_per_file[fileInfo.file_path], 2, 'Cycle should be 2 before persist');

    // Persist and read back
    await writeState(tempDir, { loop_state: state });
    const persisted = await readState(tempDir);
    const restored = persisted.loop_state;

    assert.deepStrictEqual(restored.cycle_per_file, state.cycle_per_file);
    assert.equal(restored.cycle_per_file[fileInfo.file_path], 2, 'Cycle should be 2 after restore');
  });
});

// ---------------------------------------------------------------------------
// Bridge parity (PT-28, PT-29, PT-30)
// ---------------------------------------------------------------------------

describe('Parity: CJS bridge expanded', () => {
  it('PT-28: CJS bridge processVerdict produces same result as ESM direct', async () => {
    const teamsBridge = await import('../../../src/core/bridge/teams.cjs');

    // Create loops via both paths
    const bridgeLoop = await teamsBridge.default.createImplementationLoop(teamSpec);
    const directLoop = new ImplementationLoop(teamSpec);

    // Initialize both
    const bridgeState = bridgeLoop.initFromPlan(allPassSeq.files);
    const directState = directLoop.initFromPlan(allPassSeq.files);

    // Set up cycles identically
    const bridgeFile = bridgeLoop.computeNextFile(bridgeState);
    const directFile = directLoop.computeNextFile(directState);
    bridgeState.cycle_per_file[bridgeFile.file_path] = 1;
    directState.cycle_per_file[directFile.file_path] = 1;

    // Process a PASS verdict on both
    const bridgeResult = bridgeLoop.processVerdict(bridgeState, 'PASS');
    const directResult = directLoop.processVerdict(directState, 'PASS');

    assert.equal(bridgeResult.action, directResult.action, 'Actions should match');
    assert.deepStrictEqual(bridgeResult.loopState, directResult.loopState, 'Loop states should match');

    // Process a REVISE verdict on fresh loops
    const bridgeLoop2 = await teamsBridge.default.createImplementationLoop(teamSpec);
    const directLoop2 = new ImplementationLoop(teamSpec);
    const bs2 = bridgeLoop2.initFromPlan(allPassSeq.files);
    const ds2 = directLoop2.initFromPlan(allPassSeq.files);
    bs2.cycle_per_file[bridgeLoop2.computeNextFile(bs2).file_path] = 1;
    ds2.cycle_per_file[directLoop2.computeNextFile(ds2).file_path] = 1;

    const br2 = bridgeLoop2.processVerdict(bs2, 'REVISE');
    const dr2 = directLoop2.processVerdict(ds2, 'REVISE');
    assert.equal(br2.action, dr2.action);
    assert.deepStrictEqual(br2.loopState, dr2.loopState);
  });

  it('PT-29: CJS bridge buildWriterContext matches ESM direct output', async () => {
    const teamsBridge = await import('../../../src/core/bridge/teams.cjs');

    const bridgeLoop = await teamsBridge.default.createImplementationLoop(teamSpec);
    const directLoop = new ImplementationLoop(teamSpec);

    const bridgeState = bridgeLoop.initFromPlan(allPassSeq.files);
    const directState = directLoop.initFromPlan(allPassSeq.files);

    const bridgeFile = bridgeLoop.computeNextFile(bridgeState);
    const directFile = directLoop.computeNextFile(directState);

    const bridgeCtx = bridgeLoop.buildWriterContext(bridgeState, bridgeFile);
    const directCtx = directLoop.buildWriterContext(directState, directFile);

    assert.deepStrictEqual(bridgeCtx, directCtx, 'Writer contexts should be identical');

    // Also compare review contexts
    const bridgeReview = bridgeLoop.buildReviewContext(bridgeState, bridgeFile, 1);
    const directReview = directLoop.buildReviewContext(directState, directFile, 1);
    assert.deepStrictEqual(bridgeReview, directReview, 'Review contexts should be identical');

    // Also compare update contexts
    const findings = { blocking: [{ msg: 'test' }], warning: [] };
    bridgeState.cycle_per_file[bridgeFile.file_path] = 1;
    directState.cycle_per_file[directFile.file_path] = 1;
    const bridgeUpdate = bridgeLoop.buildUpdateContext(bridgeState, bridgeFile, findings);
    const directUpdate = directLoop.buildUpdateContext(directState, directFile, findings);
    assert.deepStrictEqual(bridgeUpdate, directUpdate, 'Update contexts should be identical');
  });

  it('PT-30: CJS bridge state write+read matches ESM direct', async () => {
    const stateBridge = await import('../../../src/core/bridge/state.cjs');

    const tempBridge = createTempProject();
    const tempDirect = createTempProject();

    try {
      const testState = {
        loop_state: {
          files: allPassSeq.files,
          current_file_index: 1,
          cycle_per_file: { 'tests/auth.test.js': 2 },
          max_cycles: 3,
          verdicts: [{ file: 'tests/auth.test.js', cycle: 1, verdict: 'REVISE' }],
          completed_files: [],
          tdd_ordering: false
        }
      };

      // Write via bridge
      await stateBridge.default.writeState(tempBridge, testState);
      const bridgeRead = await stateBridge.default.readState(tempBridge);

      // Write via ESM direct
      await writeState(tempDirect, testState);
      const directRead = await readState(tempDirect);

      // Both reads should produce identical objects
      assert.deepStrictEqual(bridgeRead, directRead, 'Bridge and direct state should be identical');
      assert.deepStrictEqual(bridgeRead, testState, 'Read-back should match original');
    } finally {
      cleanupTemp(tempBridge);
      cleanupTemp(tempDirect);
    }
  });
});
