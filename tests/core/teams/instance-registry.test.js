/**
 * Unit tests for src/core/teams/instance-registry.js -- Team Instance Registry
 *
 * Tests getTeamInstance() lookup, listTeamInstances() enumeration,
 * and getTeamInstancesByPhase() filtering.
 * Requirements: REQ-0095, REQ-0096, REQ-0097 (shared registry)
 *
 * Test ID prefix: IR- (Instance Registry)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getTeamInstance,
  listTeamInstances,
  getTeamInstancesByPhase
} from '../../../src/core/teams/instance-registry.js';

import { impactAnalysisInstance } from '../../../src/core/teams/instances/impact-analysis.js';
import { tracingInstance } from '../../../src/core/teams/instances/tracing.js';
import { qualityLoopInstance } from '../../../src/core/teams/instances/quality-loop.js';

// ---------------------------------------------------------------------------
// getTeamInstance (Positive)
// ---------------------------------------------------------------------------

describe('Instance Registry: getTeamInstance()', () => {
  // IR-01: getTeamInstance('impact_analysis') returns correct frozen config
  it('IR-01: returns correct frozen config for impact_analysis (REQ-0095 FR-001)', () => {
    const instance = getTeamInstance('impact_analysis');
    assert.equal(instance.instance_id, 'impact_analysis');
    assert.equal(instance.team_type, 'fan_out');
    assert.ok(Object.isFrozen(instance));
  });

  // IR-02: getTeamInstance('tracing') returns correct frozen config
  it('IR-02: returns correct frozen config for tracing (REQ-0096 FR-001)', () => {
    const instance = getTeamInstance('tracing');
    assert.equal(instance.instance_id, 'tracing');
    assert.equal(instance.team_type, 'fan_out');
    assert.ok(Object.isFrozen(instance));
  });

  // IR-03: getTeamInstance('quality_loop') returns correct frozen config
  it('IR-03: returns correct frozen config for quality_loop (REQ-0097 FR-001)', () => {
    const instance = getTeamInstance('quality_loop');
    assert.equal(instance.instance_id, 'quality_loop');
    assert.equal(instance.team_type, 'dual_track');
    assert.ok(Object.isFrozen(instance));
  });
});

// ---------------------------------------------------------------------------
// getTeamInstance (Negative)
// ---------------------------------------------------------------------------

describe('Instance Registry: getTeamInstance() error handling', () => {
  // IR-04: Throws on unknown instance ID with available IDs in message
  it('IR-04: throws on unknown instance ID with available IDs in message (ERR-INSTANCE-001)', () => {
    assert.throws(
      () => getTeamInstance('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('impact_analysis'), 'Should list available IDs');
        assert.ok(err.message.includes('tracing'), 'Should list available IDs');
        assert.ok(err.message.includes('quality_loop'), 'Should list available IDs');
        return true;
      }
    );
  });

  // IR-05: Throws on null/undefined input
  it('IR-05: throws on null/undefined input (ERR-INSTANCE-001)', () => {
    assert.throws(() => getTeamInstance(null), Error);
    assert.throws(() => getTeamInstance(undefined), Error);
  });

  // IR-06: Throws on empty string
  it('IR-06: throws on empty string (ERR-INSTANCE-001)', () => {
    assert.throws(
      () => getTeamInstance(''),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('impact_analysis'), 'Should list available IDs');
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// listTeamInstances
// ---------------------------------------------------------------------------

describe('Instance Registry: listTeamInstances()', () => {
  // IR-07: Returns array of all 3 instance IDs
  it('IR-07: returns array of all 3 instance IDs', () => {
    const ids = listTeamInstances();
    assert.ok(Array.isArray(ids), 'Should return an array');
    assert.equal(ids.length, 3, 'Should have 3 instances');
    assert.ok(ids.includes('impact_analysis'));
    assert.ok(ids.includes('tracing'));
    assert.ok(ids.includes('quality_loop'));
  });
});

// ---------------------------------------------------------------------------
// getTeamInstancesByPhase
// ---------------------------------------------------------------------------

describe('Instance Registry: getTeamInstancesByPhase()', () => {
  // IR-08: Phase '01-requirements' returns impact_analysis and tracing instances
  it('IR-08: phase 01-requirements returns impact_analysis and tracing', () => {
    const instances = getTeamInstancesByPhase('01-requirements');
    assert.ok(Array.isArray(instances));
    const ids = instances.map(i => i.instance_id);
    assert.ok(ids.includes('impact_analysis'), 'Should include impact_analysis');
    assert.ok(ids.includes('tracing'), 'Should include tracing');
  });

  // IR-09: Phase '06-implementation' returns quality_loop instance
  it('IR-09: phase 06-implementation returns quality_loop', () => {
    const instances = getTeamInstancesByPhase('06-implementation');
    assert.ok(Array.isArray(instances));
    assert.equal(instances.length, 1);
    assert.equal(instances[0].instance_id, 'quality_loop');
  });

  // IR-10: Unknown phase returns empty array
  it('IR-10: unknown phase returns empty array', () => {
    const instances = getTeamInstancesByPhase('99-nonexistent');
    assert.ok(Array.isArray(instances));
    assert.equal(instances.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Registry-to-Instance Roundtrip (Integration)
// ---------------------------------------------------------------------------

describe('INT-001: Registry-to-Instance roundtrip', () => {
  // IR-11: Registry returns same frozen object references as direct imports
  it('IR-11: registry returns same frozen objects as direct imports', () => {
    assert.equal(getTeamInstance('impact_analysis'), impactAnalysisInstance,
      'Should be the exact same object reference');
    assert.equal(getTeamInstance('tracing'), tracingInstance,
      'Should be the exact same object reference');
    assert.equal(getTeamInstance('quality_loop'), qualityLoopInstance,
      'Should be the exact same object reference');
  });
});
