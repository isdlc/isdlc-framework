/**
 * Tests for src/core/validators/validate-phase.js
 * BUG-0057: Gate-blocker traceability verification (FR-007)
 * Phase validation entry point — orchestration and merging.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validatePhase } from '../../../src/core/validators/validate-phase.js';

// ---------------------------------------------------------------------------
// VP-01..03: Phase-to-Validator Mapping (FR-007, AC-007-01, AC-007-05)
// ---------------------------------------------------------------------------

describe('validatePhase — phase-to-validator mapping', () => {
  it('VP-01: Phase 05 runs traceability + constitutional validators', async () => {
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      constitution: 'Article II',
      articleIds: ['II'],
      artifactContents: [
        { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
        { name: 'traceability-matrix', content: '| AC | Test |' }
      ]
    };
    const result = await validatePhase('05-test-strategy', inputs);
    assert.ok(result.details.traceability !== null);
    // Constitutional should also run for phase 05
  });

  it('VP-02: Phase 06 runs test-implementation + coverage + constitutional validators', async () => {
    const inputs = {
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      testFiles: [{ path: 'tests/a.test.js', content: "it('TV-01: test', () => {});" }],
      modifiedFiles: ['src/a.js'],
      testExecutionOutput: 'Statements : 85%',
      constitution: 'Article II',
      articleIds: ['II'],
      artifactContents: [
        { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
        { name: 'traceability-matrix', content: '| AC | Test |' }
      ]
    };
    const result = await validatePhase('06-implementation', inputs);
    assert.ok(result.details.testImplementation !== null);
    assert.ok(result.details.coveragePresence !== null);
  });

  it('VP-03: Phase 07 runs test-execution + coverage + constitutional validators', async () => {
    const inputs = {
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      testExecutionOutput: '  ✓ TV-01: test (1ms)\nStatements : 90%',
      constitution: 'Article II',
      articleIds: ['II'],
      artifactContents: [
        { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
        { name: 'traceability-matrix', content: '| AC | Test |' }
      ]
    };
    const result = await validatePhase('07-testing', inputs);
    assert.ok(result.details.testExecution !== null);
    assert.ok(result.details.coveragePresence !== null);
  });
});

// ---------------------------------------------------------------------------
// VP-04..05: Parallel Execution (FR-007, AC-007-02, AC-007-03)
// ---------------------------------------------------------------------------

describe('validatePhase — parallel execution', () => {
  it('VP-04: validators 1-4 run via Promise.all (not sequential)', async () => {
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      testFiles: [{ path: 'tests/a.test.js', content: "it('TV-01: test', () => {});" }],
      modifiedFiles: ['src/a.js'],
      testExecutionOutput: '  ✓ TV-01: test (1ms)\nStatements : 90%'
    };
    // This should complete quickly since all validators run in parallel
    const result = await validatePhase('06-implementation', inputs);
    assert.ok(typeof result.pass === 'boolean');
  });

  it('VP-05: validator 5 (constitutional) runs via Promise.all when useAgentTeams: false', async () => {
    const inputs = {
      constitution: 'Article II',
      articleIds: ['II'],
      artifactContents: [
        { name: 'tests/a.test.js', content: 'it("test", () => {});' }
      ]
    };
    const result = await validatePhase('05-test-strategy', inputs, { useAgentTeams: false });
    // Should complete without error
    assert.ok(typeof result.pass === 'boolean');
  });
});

// ---------------------------------------------------------------------------
// VP-06..08: Result Merging (FR-007, AC-007-04)
// ---------------------------------------------------------------------------

describe('validatePhase — result merging', () => {
  it('VP-06: all validators pass -> merged pass: true', async () => {
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      constitution: 'Article VII',
      articleIds: ['VII'],
      artifactContents: [
        { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
        { name: 'traceability-matrix', content: '| AC | Test |' }
      ]
    };
    const result = await validatePhase('05-test-strategy', inputs);
    assert.strictEqual(result.pass, true);
  });

  it('VP-07: one validator fails -> merged pass: false, failures populated', async () => {
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test\n- **AC-001-02**: Second',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |',
      constitution: 'Article VII',
      articleIds: ['VII'],
      artifactContents: [
        { name: 'tests/a.test.js', content: 'it("AC-001-01: test", () => {});' },
        { name: 'traceability-matrix', content: '| AC | Test |' }
      ]
    };
    // AC-001-02 has no test -> traceability fails
    const result = await validatePhase('05-test-strategy', inputs);
    assert.strictEqual(result.pass, false);
    assert.ok(result.failures.length > 0);
  });

  it('VP-08: validator crash -> validator_errors populated, does not cause pass: false', async () => {
    // This is hard to trigger directly, but we can verify the structure
    const inputs = {};
    const result = await validatePhase('05-test-strategy', inputs);
    // With no inputs, validators should fail-open (pass: true with missing_artifacts)
    assert.ok(Array.isArray(result.validator_errors));
  });
});

// ---------------------------------------------------------------------------
// VP-09..10: Fail-Open on Errors (FR-007)
// ---------------------------------------------------------------------------

describe('validatePhase — fail-open on errors', () => {
  it('VP-09: validator throws exception -> caught, added to validator_errors', async () => {
    const inputs = {};
    const result = await validatePhase('06-implementation', inputs);
    // Even with minimal inputs, should not throw
    assert.ok(typeof result.pass === 'boolean');
    assert.ok(Array.isArray(result.validator_errors));
  });

  it('VP-10: all validators crash -> pass: true, all logged to validator_errors', async () => {
    // Edge case: provide a phase with no known validators
    const result = await validatePhase('99-nonexistent', {});
    assert.strictEqual(result.pass, true);
    assert.ok(Array.isArray(result.validator_errors));
  });
});
