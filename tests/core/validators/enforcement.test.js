/**
 * Tests for src/core/validators/enforcement.js
 * REQ-0088: Implement enforcement layering protocol
 *
 * Tests evidence production wrapping the gate-logic check().
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateAndProduceEvidence
} from '../../../src/core/validators/enforcement.js';

describe('validateAndProduceEvidence (REQ-0088)', () => {
  it('returns valid:true with evidence for passing checks', () => {
    // Context where all checks pass (no requirements)
    const checkpoint = 'gate-advancement';
    const context = {
      input: { tool_name: 'Task', tool_input: { prompt: 'advance to next phase', subagent_type: 'sdlc-orchestrator' } },
      state: {
        current_phase: '06-implementation',
        phases: { '06-implementation': {} }
      },
      requirements: { phase_requirements: {} }
    };

    const result = validateAndProduceEvidence(checkpoint, context);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(typeof result.evidence, 'object');
    assert.strictEqual(typeof result.timestamp, 'string');
    assert.strictEqual(result.checkpoint, checkpoint);
  });

  it('returns valid:false with evidence for blocking checks', () => {
    const checkpoint = 'gate-advancement';
    const context = {
      input: { tool_name: 'Task', tool_input: { prompt: 'advance to next phase', subagent_type: 'sdlc-orchestrator' } },
      state: {
        current_phase: '06-implementation',
        phases: {
          '06-implementation': {}
        }
      },
      requirements: {
        phase_requirements: {
          '06-implementation': {
            test_iteration: { enabled: true }
          }
        }
      }
    };

    const result = validateAndProduceEvidence(checkpoint, context);
    assert.strictEqual(result.valid, false);
    assert.ok(result.evidence.stopReason);
    assert.ok(result.evidence.stopReason.includes('GATE BLOCKED'));
    assert.strictEqual(result.checkpoint, checkpoint);
  });

  it('includes timestamp in ISO format', () => {
    const result = validateAndProduceEvidence('test-checkpoint', {
      input: { tool_name: 'Bash' },
      state: {},
      requirements: { phase_requirements: {} }
    });
    assert.ok(result.timestamp);
    // Verify it parses as a valid date
    const parsed = new Date(result.timestamp);
    assert.ok(!isNaN(parsed.getTime()));
  });

  it('handles missing context gracefully (fail-open)', () => {
    const result = validateAndProduceEvidence('test', {});
    assert.strictEqual(result.valid, true);
    assert.strictEqual(typeof result.evidence, 'object');
  });

  it('preserves evidence details from gate check', () => {
    const context = {
      input: { tool_name: 'Task', tool_input: { prompt: 'advance to next phase', subagent_type: 'sdlc-orchestrator' } },
      state: {
        current_phase: '06-implementation',
        phases: {
          '06-implementation': {}
        }
      },
      requirements: {
        phase_requirements: {
          '06-implementation': {
            constitutional_validation: { enabled: true }
          }
        }
      }
    };

    const result = validateAndProduceEvidence('gate', context);
    assert.strictEqual(result.valid, false);
    assert.ok(result.evidence.decision === 'block');
  });
});
