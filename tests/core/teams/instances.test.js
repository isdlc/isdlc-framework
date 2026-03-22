/**
 * Unit tests for src/core/teams/instances/ -- Team Instance Configs
 *
 * Tests frozen instance configs for impact analysis, tracing, and quality loop.
 * Requirements: REQ-0095 (FR-001..FR-004), REQ-0096 (FR-001..FR-003),
 *               REQ-0097 (FR-001..FR-004)
 *
 * Test ID prefix: TI- (Team Instance)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { impactAnalysisInstance } from '../../../src/core/teams/instances/impact-analysis.js';
import { tracingInstance } from '../../../src/core/teams/instances/tracing.js';
import { qualityLoopInstance } from '../../../src/core/teams/instances/quality-loop.js';

// ===========================================================================
// REQ-0095: Impact Analysis Instance Config
// ===========================================================================

// ---------------------------------------------------------------------------
// FR-001: Instance Config (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0095 FR-001: Impact Analysis Instance Config', () => {
  // TI-01: instance_id is 'impact_analysis'
  it('TI-01: instance_id is impact_analysis (AC-001-01)', () => {
    assert.equal(impactAnalysisInstance.instance_id, 'impact_analysis');
  });

  // TI-02: team_type is 'fan_out'
  it('TI-02: team_type is fan_out (AC-001-01)', () => {
    assert.equal(impactAnalysisInstance.team_type, 'fan_out');
  });

  // TI-03: Members array has M1-M4 with correct roles and required flags
  it('TI-03: members has M1-M4 with correct roles and required flags (AC-001-02)', () => {
    const members = impactAnalysisInstance.members;
    assert.equal(members.length, 4);

    assert.equal(members[0].id, 'M1');
    assert.equal(members[0].role, 'impact-analyzer');
    assert.equal(members[0].required, true);

    assert.equal(members[1].id, 'M2');
    assert.equal(members[1].role, 'entry-point-finder');
    assert.equal(members[1].required, true);

    assert.equal(members[2].id, 'M3');
    assert.equal(members[2].role, 'risk-assessor');
    assert.equal(members[2].required, true);

    assert.equal(members[3].id, 'M4');
    assert.equal(members[3].role, 'cross-validation-verifier');
    assert.equal(members[3].required, false);
  });

  // TI-04: output_artifact and input_dependency
  it('TI-04: output_artifact is impact-analysis.md, input_dependency is 01-requirements (AC-001-03)', () => {
    assert.equal(impactAnalysisInstance.output_artifact, 'impact-analysis.md');
    assert.equal(impactAnalysisInstance.input_dependency, '01-requirements');
  });
});

// ---------------------------------------------------------------------------
// FR-002: M4 Fail-Open Policy (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0095 FR-002: M4 Fail-Open Policy', () => {
  // TI-05: policies.fail_open has tier_1, tier_2, tier_3
  it('TI-05: fail_open policy has tier_1, tier_2, tier_3 (AC-002-01)', () => {
    const failOpen = impactAnalysisInstance.policies.fail_open;
    assert.ok(failOpen, 'policies.fail_open should exist');
    assert.equal(failOpen.tier_1, 'skip_if_unavailable');
    assert.equal(failOpen.tier_2, 'skip_if_task_fails');
    assert.equal(failOpen.tier_3, 'skip_if_timeout');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Output/Input Mapping (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0095 FR-003: Output/Input Mapping', () => {
  // TI-06: output_artifact is 'impact-analysis.md'
  it('TI-06: output_artifact is impact-analysis.md (AC-003-01)', () => {
    assert.equal(impactAnalysisInstance.output_artifact, 'impact-analysis.md');
  });

  // TI-07: input_dependency is '01-requirements'
  it('TI-07: input_dependency is 01-requirements (AC-003-02)', () => {
    assert.equal(impactAnalysisInstance.input_dependency, '01-requirements');
  });
});

// ---------------------------------------------------------------------------
// FR-004: Scope Variants (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0095 FR-004: Scope Variants', () => {
  // TI-08: scope_variants includes 'feature' and 'upgrade'
  it('TI-08: scope_variants includes feature and upgrade (AC-004-01)', () => {
    assert.ok(Array.isArray(impactAnalysisInstance.scope_variants));
    assert.ok(impactAnalysisInstance.scope_variants.includes('feature'));
    assert.ok(impactAnalysisInstance.scope_variants.includes('upgrade'));
  });
});

// ---------------------------------------------------------------------------
// Instance Immutability (Negative)
// ---------------------------------------------------------------------------

describe('REQ-0095: Impact Analysis Immutability', () => {
  // TI-09: Instance object is frozen
  it('TI-09: instance object is frozen (AC-001-01)', () => {
    assert.ok(Object.isFrozen(impactAnalysisInstance));
  });

  // TI-10: Mutation of property throws TypeError
  it('TI-10: mutation of property throws TypeError (AC-001-01)', () => {
    assert.throws(
      () => { impactAnalysisInstance.instance_id = 'hacked'; },
      TypeError,
      'Should throw TypeError when mutating frozen property'
    );
  });
});

// ===========================================================================
// REQ-0096: Tracing Instance Config
// ===========================================================================

// ---------------------------------------------------------------------------
// FR-001: Instance Config (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0096 FR-001: Tracing Instance Config', () => {
  // TI-11: instance_id is 'tracing', team_type is 'fan_out'
  it('TI-11: instance_id is tracing, team_type is fan_out (AC-001-01)', () => {
    assert.equal(tracingInstance.instance_id, 'tracing');
    assert.equal(tracingInstance.team_type, 'fan_out');
  });

  // TI-12: Members array has T1-T3 with correct roles and required flags
  it('TI-12: members has T1-T3 with correct roles and required flags (AC-001-02)', () => {
    const members = tracingInstance.members;
    assert.equal(members.length, 3);

    assert.equal(members[0].id, 'T1');
    assert.equal(members[0].role, 'symptom-analyzer');
    assert.equal(members[0].required, true);

    assert.equal(members[1].id, 'T2');
    assert.equal(members[1].role, 'execution-path-tracer');
    assert.equal(members[1].required, true);

    assert.equal(members[2].id, 'T3');
    assert.equal(members[2].role, 'root-cause-identifier');
    assert.equal(members[2].required, true);
  });

  // TI-13: output_artifact and input_dependency
  it('TI-13: output_artifact is trace-analysis.md, input_dependency is 01-requirements (AC-001-03)', () => {
    assert.equal(tracingInstance.output_artifact, 'trace-analysis.md');
    assert.equal(tracingInstance.input_dependency, '01-requirements');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Output/Input Mapping (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0096 FR-002: Output/Input Mapping', () => {
  // TI-14: output_artifact is 'trace-analysis.md'
  it('TI-14: output_artifact is trace-analysis.md (AC-002-01)', () => {
    assert.equal(tracingInstance.output_artifact, 'trace-analysis.md');
  });

  // TI-15: input_dependency is '01-requirements'
  it('TI-15: input_dependency is 01-requirements (AC-002-02)', () => {
    assert.equal(tracingInstance.input_dependency, '01-requirements');
  });
});

// ---------------------------------------------------------------------------
// FR-003: No Fail-Open (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0096 FR-003: No Fail-Open', () => {
  // TI-16: All 3 members have required: true
  it('TI-16: all 3 members have required true (AC-003-01)', () => {
    for (const member of tracingInstance.members) {
      assert.equal(member.required, true, `${member.id} should be required`);
    }
  });

  // TI-17: policies is empty object
  it('TI-17: policies is empty object (AC-003-02)', () => {
    assert.deepEqual(tracingInstance.policies, {});
  });
});

// ---------------------------------------------------------------------------
// Instance Immutability (Negative)
// ---------------------------------------------------------------------------

describe('REQ-0096: Tracing Immutability', () => {
  // TI-18: Instance object is frozen
  it('TI-18: instance object is frozen (AC-001-01)', () => {
    assert.ok(Object.isFrozen(tracingInstance));
  });
});

// ===========================================================================
// REQ-0097: Quality Loop Instance Config
// ===========================================================================

// ---------------------------------------------------------------------------
// FR-001: Instance Config (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0097 FR-001: Quality Loop Instance Config', () => {
  // TI-19: instance_id is 'quality_loop', team_type is 'dual_track'
  it('TI-19: instance_id is quality_loop, team_type is dual_track (AC-001-01)', () => {
    assert.equal(qualityLoopInstance.instance_id, 'quality_loop');
    assert.equal(qualityLoopInstance.team_type, 'dual_track');
  });

  // TI-20: Track A has checks QL-002 through QL-007
  it('TI-20: track_a has checks QL-002 through QL-007 (AC-001-02)', () => {
    const trackA = qualityLoopInstance.tracks.track_a;
    assert.ok(trackA, 'track_a should exist');
    assert.deepEqual(
      trackA.checks,
      ['QL-002', 'QL-003', 'QL-004', 'QL-005', 'QL-006', 'QL-007']
    );
  });

  // TI-21: Track B has checks QL-008, QL-009, QL-010
  it('TI-21: track_b has checks QL-008, QL-009, QL-010 (AC-001-03)', () => {
    const trackB = qualityLoopInstance.tracks.track_b;
    assert.ok(trackB, 'track_b should exist');
    assert.deepEqual(trackB.checks, ['QL-008', 'QL-009', 'QL-010']);
  });

  // TI-22: output_artifact and input_dependency
  it('TI-22: output_artifact is quality-report.md, input_dependency is 06-implementation (AC-001-04)', () => {
    assert.equal(qualityLoopInstance.output_artifact, 'quality-report.md');
    assert.equal(qualityLoopInstance.input_dependency, '06-implementation');
  });
});

// ---------------------------------------------------------------------------
// FR-002: Fan-Out Policy (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0097 FR-002: Fan-Out Policy', () => {
  // TI-23: Fan-out trigger threshold is 250
  it('TI-23: fan_out trigger threshold is 250 (AC-002-01)', () => {
    assert.equal(qualityLoopInstance.fan_out_policy.trigger_threshold, 250);
  });

  // TI-24: Max chunks is 8
  it('TI-24: max chunks is 8 (AC-002-02)', () => {
    assert.equal(qualityLoopInstance.fan_out_policy.max_chunks, 8);
  });

  // TI-25: Distribution strategy is 'round_robin'
  it('TI-25: distribution strategy is round_robin (AC-002-03)', () => {
    assert.equal(qualityLoopInstance.fan_out_policy.distribution, 'round_robin');
  });

  // TI-26: Fan-out applies to 'track_a' only
  it('TI-26: fan_out applies to track_a only (AC-002-04)', () => {
    assert.equal(qualityLoopInstance.fan_out_policy.applies_to, 'track_a');
  });
});

// ---------------------------------------------------------------------------
// FR-003: Scope Modes (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0097 FR-003: Scope Modes', () => {
  // TI-27: scope_modes includes 'FULL_SCOPE' and 'FINAL_SWEEP'
  it('TI-27: scope_modes includes FULL_SCOPE and FINAL_SWEEP (AC-003-01)', () => {
    assert.ok(Array.isArray(qualityLoopInstance.scope_modes));
    assert.ok(qualityLoopInstance.scope_modes.includes('FULL_SCOPE'));
    assert.ok(qualityLoopInstance.scope_modes.includes('FINAL_SWEEP'));
  });
});

// ---------------------------------------------------------------------------
// FR-004: Retry Policy (Positive)
// ---------------------------------------------------------------------------

describe('REQ-0097 FR-004: Retry Policy', () => {
  // TI-28: retry_both_on_failure is true
  it('TI-28: retry_both_on_failure is true (AC-004-01)', () => {
    assert.equal(qualityLoopInstance.retry_policy.retry_both_on_failure, true);
  });

  // TI-29: max_iterations is 10
  it('TI-29: max_iterations is 10 (AC-004-02)', () => {
    assert.equal(qualityLoopInstance.retry_policy.max_iterations, 10);
  });
});

// ---------------------------------------------------------------------------
// Instance Immutability (Negative)
// ---------------------------------------------------------------------------

describe('REQ-0097: Quality Loop Immutability', () => {
  // TI-30: Instance object is deeply frozen
  it('TI-30: instance object is frozen (AC-001-01)', () => {
    assert.ok(Object.isFrozen(qualityLoopInstance));
  });
});
