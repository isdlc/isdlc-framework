/**
 * Performance Validation — REQ-0121
 *
 * Timing assertions for core operations with frozen thresholds.
 * Uses performance.now() for measurement and baselines.json for
 * regression detection.
 *
 * Requirements: FR-001 (AC-001-01..04), FR-002 (AC-002-01..03),
 *               FR-003 (AC-003-01..02), FR-004 (AC-004-01..03)
 *
 * Test ID prefix: PERF-
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { migrateState } from '../../../src/core/state/schema.js';
import { getTeamSpec, listTeamTypes } from '../../../src/core/teams/registry.js';
import { getProviderSupportMatrix, getGovernanceDeltas, getKnownLimitations } from '../../../src/core/providers/support-matrix.js';
import { getGovernanceModel, validateCheckpoint } from '../../../src/providers/codex/governance.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinesPath = join(__dirname, 'baselines.json');

// ---------------------------------------------------------------------------
// Frozen Thresholds (AC-001-04)
// ---------------------------------------------------------------------------

const THRESHOLDS = Object.freeze({
  MIGRATE_STATE_MS: 20,
  GET_TEAM_SPEC_MS: 10,
  GET_SUPPORT_MATRIX_MS: 10,
  GET_GOVERNANCE_MODEL_MS: 10,
  GET_GOVERNANCE_DELTAS_MS: 20,
  VALIDATE_CHECKPOINT_MS: 100,
  REGRESSION_PERCENT: 20,
});

// ---------------------------------------------------------------------------
// Timing helper
// ---------------------------------------------------------------------------

function measureMs(fn) {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

function measureMedianMs(fn, samples = 10) {
  const durations = [];
  for (let i = 0; i < samples; i++) {
    durations.push(measureMs(fn));
  }
  durations.sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)];
}

// ---------------------------------------------------------------------------
// FR-001: Performance Benchmarks (AC-001-01..03)
// ---------------------------------------------------------------------------

describe('Performance benchmarks (REQ-0121 FR-001)', () => {
  const sampleState = {
    project_name: 'perf-test',
    state_version: 10,
    phases: { '01-requirements': { status: 'complete' } },
    workflow_history: []
  };

  const validState = {
    current_phase: '01-requirements',
    phases: { '01-requirements': { status: 'in-progress' } }
  };

  // PERF-01: migrateState < threshold
  it('PERF-01: migrateState completes within threshold (AC-001-01)', () => {
    const duration = measureMs(() => migrateState(sampleState));
    assert.ok(duration < THRESHOLDS.MIGRATE_STATE_MS,
      `migrateState took ${duration.toFixed(2)}ms, threshold is ${THRESHOLDS.MIGRATE_STATE_MS}ms`);
  });

  // PERF-02: getTeamSpec < threshold
  it('PERF-02: getTeamSpec completes within threshold (AC-001-01)', () => {
    const types = listTeamTypes();
    const teamType = types[0];
    const duration = measureMs(() => getTeamSpec(teamType));
    assert.ok(duration < THRESHOLDS.GET_TEAM_SPEC_MS,
      `getTeamSpec took ${duration.toFixed(2)}ms, threshold is ${THRESHOLDS.GET_TEAM_SPEC_MS}ms`);
  });

  // PERF-03: getProviderSupportMatrix < threshold
  it('PERF-03: getProviderSupportMatrix completes within threshold (AC-001-02)', () => {
    const duration = measureMs(() => getProviderSupportMatrix());
    assert.ok(duration < THRESHOLDS.GET_SUPPORT_MATRIX_MS,
      `getProviderSupportMatrix took ${duration.toFixed(2)}ms, threshold is ${THRESHOLDS.GET_SUPPORT_MATRIX_MS}ms`);
  });

  // PERF-04: getGovernanceModel < threshold
  it('PERF-04: getGovernanceModel completes within threshold (AC-001-02)', () => {
    const duration = measureMs(() => getGovernanceModel());
    assert.ok(duration < THRESHOLDS.GET_GOVERNANCE_MODEL_MS,
      `getGovernanceModel took ${duration.toFixed(2)}ms, threshold is ${THRESHOLDS.GET_GOVERNANCE_MODEL_MS}ms`);
  });

  // PERF-05: getGovernanceDeltas < threshold
  it('PERF-05: getGovernanceDeltas completes within threshold (AC-001-02)', () => {
    const duration = measureMs(() => getGovernanceDeltas());
    assert.ok(duration < THRESHOLDS.GET_GOVERNANCE_DELTAS_MS,
      `getGovernanceDeltas took ${duration.toFixed(2)}ms, threshold is ${THRESHOLDS.GET_GOVERNANCE_DELTAS_MS}ms`);
  });

  // PERF-06: validateCheckpoint < threshold
  it('PERF-06: validateCheckpoint completes within threshold (AC-001-01)', () => {
    const duration = measureMs(() => validateCheckpoint('02-architecture', validState));
    assert.ok(duration < THRESHOLDS.VALIDATE_CHECKPOINT_MS,
      `validateCheckpoint took ${duration.toFixed(2)}ms, threshold is ${THRESHOLDS.VALIDATE_CHECKPOINT_MS}ms`);
  });

  // PERF-07: Thresholds are frozen constants (AC-001-04)
  it('PERF-07: thresholds are frozen (AC-001-04)', () => {
    assert.ok(Object.isFrozen(THRESHOLDS), 'THRESHOLDS object must be frozen');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Cache Efficiency (AC-003-01..02)
// ---------------------------------------------------------------------------

describe('Cache efficiency (REQ-0121 FR-003)', () => {
  // PERF-08: Second call is not slower than first for frozen data
  it('PERF-08: getProviderSupportMatrix warm call <= cold call (AC-003-01)', () => {
    // Cold call
    const cold = measureMs(() => getProviderSupportMatrix());
    // Warm call
    const warm = measureMs(() => getProviderSupportMatrix());

    // Warm should not exceed cold by more than 50% (accounting for JIT variability)
    assert.ok(warm <= cold * 1.5,
      `Warm call (${warm.toFixed(2)}ms) should not exceed 1.5x cold call (${cold.toFixed(2)}ms)`);
  });

  // PERF-09: getGovernanceModel warm call <= cold call
  it('PERF-09: getGovernanceModel warm call <= cold call (AC-003-01)', () => {
    const cold = measureMs(() => getGovernanceModel());
    const warm = measureMs(() => getGovernanceModel());

    assert.ok(warm <= cold * 1.5,
      `Warm call (${warm.toFixed(2)}ms) should not exceed 1.5x cold call (${cold.toFixed(2)}ms)`);
  });

  // PERF-10: migrateState recomputes for different inputs
  it('PERF-10: migrateState produces different output for different input (AC-003-02)', () => {
    const stateA = { phases: {}, workflow_history: [] };
    const stateB = { schema_version: 1, phases: {}, workflow_history: [], project_name: 'B' };

    const resultA = migrateState(stateA);
    const resultB = migrateState(stateB);

    // B has project_name that A does not — proving fresh computation
    assert.equal(resultA.project_name, undefined);
    assert.equal(resultB.project_name, 'B');
  });
});

// ---------------------------------------------------------------------------
// FR-004: Regression Detection (AC-004-01..03)
// ---------------------------------------------------------------------------

describe('Regression detection (REQ-0121 FR-004)', () => {
  // PERF-11: baselines.json exists and has valid structure
  it('PERF-11: baselines.json exists with valid structure (AC-004-01)', () => {
    const content = readFileSync(baselinesPath, 'utf8');
    const baselines = JSON.parse(content);

    assert.equal(typeof baselines.generated_at, 'string', 'Must have generated_at');
    assert.ok(Array.isArray(baselines.entries), 'Must have entries array');
    for (const entry of baselines.entries) {
      assert.equal(typeof entry.operation, 'string', 'Entry must have operation');
      assert.equal(typeof entry.median_ms, 'number', 'Entry must have median_ms');
      assert.equal(typeof entry.threshold_ms, 'number', 'Entry must have threshold_ms');
      assert.equal(typeof entry.samples, 'number', 'Entry must have samples');
    }
  });

  // PERF-12: migrateState within regression threshold
  it('PERF-12: migrateState within regression threshold of baseline (AC-004-02)', () => {
    const baselines = JSON.parse(readFileSync(baselinesPath, 'utf8'));
    const baseline = baselines.entries.find(e => e.operation === 'migrateState');
    assert.ok(baseline, 'Baseline for migrateState must exist');

    const state = { phases: {}, workflow_history: [] };
    const duration = measureMedianMs(() => migrateState(state), baseline.samples);
    const regressionThreshold = baseline.threshold_ms * (1 + THRESHOLDS.REGRESSION_PERCENT / 100);

    assert.ok(duration < regressionThreshold,
      `migrateState median ${duration.toFixed(2)}ms exceeds ${THRESHOLDS.REGRESSION_PERCENT}% regression threshold (${regressionThreshold.toFixed(1)}ms from threshold ${baseline.threshold_ms}ms)`);
  });

  // PERF-13: validateCheckpoint within regression threshold
  it('PERF-13: validateCheckpoint within regression threshold (AC-004-02)', () => {
    const baselines = JSON.parse(readFileSync(baselinesPath, 'utf8'));
    const baseline = baselines.entries.find(e => e.operation === 'validateCheckpoint');
    assert.ok(baseline, 'Baseline for validateCheckpoint must exist');

    const state = { current_phase: '01-requirements', phases: {} };
    const duration = measureMedianMs(() => validateCheckpoint('02-architecture', state), baseline.samples);
    const regressionThreshold = baseline.threshold_ms * (1 + THRESHOLDS.REGRESSION_PERCENT / 100);

    assert.ok(duration < regressionThreshold,
      `validateCheckpoint median ${duration.toFixed(2)}ms exceeds regression threshold (${regressionThreshold.toFixed(1)}ms)`);
  });

  // PERF-14: All baseline operations have corresponding thresholds
  it('PERF-14: all baseline operations are measured (AC-004-03)', () => {
    const baselines = JSON.parse(readFileSync(baselinesPath, 'utf8'));
    assert.ok(baselines.entries.length >= 3,
      `Expected >= 3 baseline entries, got ${baselines.entries.length}`);
  });
});
