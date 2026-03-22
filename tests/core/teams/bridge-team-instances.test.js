/**
 * Unit tests for src/core/bridge/team-instances.cjs -- CJS Bridge for Team Instances
 *
 * Per Article XIII (Module System Consistency), CJS bridge tests use
 * createRequire to test CJS bridges from ESM test runner.
 *
 * Requirements: REQ-0095, REQ-0096, REQ-0097 (shared bridge)
 *
 * Test ID prefix: IB- (Instance Bridge)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// CJS Bridge Tests
// ---------------------------------------------------------------------------

describe('CJS Bridge: team-instances.cjs', () => {
  // IB-01: CJS bridge exports getTeamInstance, listTeamInstances, getTeamInstancesByPhase
  it('IB-01: exports getTeamInstance, listTeamInstances, getTeamInstancesByPhase functions', () => {
    const bridge = require('../../../src/core/bridge/team-instances.cjs');
    assert.equal(typeof bridge.getTeamInstance, 'function',
      'Should export getTeamInstance');
    assert.equal(typeof bridge.listTeamInstances, 'function',
      'Should export listTeamInstances');
    assert.equal(typeof bridge.getTeamInstancesByPhase, 'function',
      'Should export getTeamInstancesByPhase');
  });

  // IB-02: getTeamInstance('impact_analysis') via bridge returns deep-equal data to ESM
  it('IB-02: getTeamInstance returns deep-equal data to ESM (Bridge parity)', async () => {
    const bridge = require('../../../src/core/bridge/team-instances.cjs');
    const { getTeamInstance } = await import('../../../src/core/teams/instance-registry.js');

    const bridgeResult = await bridge.getTeamInstance('impact_analysis');
    const esmResult = getTeamInstance('impact_analysis');

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return deep-equal results');
  });

  // IB-03: listTeamInstances() via bridge returns same array as ESM
  it('IB-03: listTeamInstances returns same array as ESM (Bridge parity)', async () => {
    const bridge = require('../../../src/core/bridge/team-instances.cjs');
    const { listTeamInstances } = await import('../../../src/core/teams/instance-registry.js');

    const bridgeResult = await bridge.listTeamInstances();
    const esmResult = listTeamInstances();

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return same instance list');
  });

  // IB-04: getTeamInstance('nonexistent') via bridge rejects with available IDs
  it('IB-04: getTeamInstance rejects on unknown ID with available IDs (Bridge error)', async () => {
    const bridge = require('../../../src/core/bridge/team-instances.cjs');
    await assert.rejects(
      () => bridge.getTeamInstance('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('impact_analysis'), 'Should list available IDs');
        return true;
      }
    );
  });

  // IB-05: getTeamInstancesByPhase via bridge returns same data as ESM
  it('IB-05: getTeamInstancesByPhase returns same data as ESM (Bridge parity)', async () => {
    const bridge = require('../../../src/core/bridge/team-instances.cjs');
    const { getTeamInstancesByPhase } = await import('../../../src/core/teams/instance-registry.js');

    const bridgeResult = await bridge.getTeamInstancesByPhase('01-requirements');
    const esmResult = getTeamInstancesByPhase('01-requirements');

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return same phase instances');
  });
});
