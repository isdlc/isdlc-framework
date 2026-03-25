/**
 * Tests for checkTraceabilityRequirement in gate-logic
 * BUG-0057: Gate-blocker traceability verification (FR-008)
 * Integration tests for Claude hook traceability enforcement.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkTraceabilityRequirement } from '../../../src/core/validators/gate-logic.js';

// ---------------------------------------------------------------------------
// GLT-01..06: checkTraceabilityRequirement (FR-008, AC-008-01..05)
// ---------------------------------------------------------------------------

describe('checkTraceabilityRequirement', () => {
  it('GLT-01: traceability check passes -> satisfied: true', async () => {
    const phaseState = {};
    const phaseRequirements = {
      traceability_validation: {
        enabled: true,
        checks: ['requirements_to_tests']
      }
    };
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test requirement',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |'
    };
    const result = await checkTraceabilityRequirement(phaseState, phaseRequirements, inputs);
    assert.strictEqual(result.satisfied, true);
  });

  it('GLT-02: traceability check fails -> satisfied: false with structured reason', async () => {
    const phaseState = {};
    const phaseRequirements = {
      traceability_validation: {
        enabled: true,
        checks: ['requirements_to_tests']
      }
    };
    const inputs = {
      requirementsSpec: '- **AC-001-01**: First\n- **AC-001-02**: Second',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |'
    };
    const result = await checkTraceabilityRequirement(phaseState, phaseRequirements, inputs);
    assert.strictEqual(result.satisfied, false);
    assert.ok(result.reason.includes('AC-001-02'));
  });

  it('GLT-03: traceability disabled in config -> check skipped, satisfied: true', async () => {
    const phaseState = {};
    const phaseRequirements = {
      traceability_validation: { enabled: false }
    };
    const result = await checkTraceabilityRequirement(phaseState, phaseRequirements, {});
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.reason, 'not_required');
  });

  it('GLT-04: no traceability_validation in requirements -> satisfied: true', async () => {
    const phaseState = {};
    const phaseRequirements = {};
    const result = await checkTraceabilityRequirement(phaseState, phaseRequirements, {});
    assert.strictEqual(result.satisfied, true);
    assert.strictEqual(result.reason, 'not_required');
  });

  it('GLT-05: validator throws -> falls back gracefully, satisfied: true', async () => {
    const phaseState = {};
    const phaseRequirements = {
      traceability_validation: {
        enabled: true,
        checks: ['requirements_to_tests']
      }
    };
    // Pass undefined inputs to trigger potential errors
    const result = await checkTraceabilityRequirement(phaseState, phaseRequirements, undefined);
    assert.strictEqual(result.satisfied, true);
  });

  it('GLT-06: on pass: false, provides failure details for GATE BLOCKED message', async () => {
    const phaseState = {};
    const phaseRequirements = {
      traceability_validation: {
        enabled: true,
        checks: ['requirements_to_tests']
      }
    };
    const inputs = {
      requirementsSpec: '- **AC-001-01**: Test\n- **AC-002-01**: Missing',
      testStrategy: '| TV-01 | Test | positive | AC-001-01 | src/a.js |'
    };
    const result = await checkTraceabilityRequirement(phaseState, phaseRequirements, inputs);
    assert.strictEqual(result.satisfied, false);
    assert.ok(result.reason.length > 0);
    assert.ok(result.details !== undefined);
  });
});
