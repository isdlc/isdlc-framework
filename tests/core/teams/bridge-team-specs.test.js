/**
 * Unit tests for src/core/bridge/team-specs.cjs -- CJS Bridge for Team Specs
 *
 * Per Article XIII (Module System Consistency), CJS bridge tests run from
 * the test directory without special temp-dir isolation since the bridge
 * is a simple async wrapper around the ESM registry.
 *
 * Requirements: FR-006 (AC-006-01, AC-006-03)
 *
 * Test ID prefix: TB- (Team Bridge)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// FR-006: CJS Bridge
// ---------------------------------------------------------------------------

describe('FR-006: CJS Bridge (team-specs.cjs)', () => {
  // TB-01: CJS bridge exports getTeamSpec and listTeamTypes
  it('TB-01: exports getTeamSpec and listTeamTypes functions (AC-006-01)', () => {
    const bridge = require('../../../src/core/bridge/team-specs.cjs');
    assert.equal(typeof bridge.getTeamSpec, 'function',
      'Should export getTeamSpec');
    assert.equal(typeof bridge.listTeamTypes, 'function',
      'Should export listTeamTypes');
  });

  // TB-02: CJS bridge getTeamSpec returns same data as ESM registry
  it('TB-02: getTeamSpec returns same data as ESM registry (AC-006-03)', async () => {
    const bridge = require('../../../src/core/bridge/team-specs.cjs');
    const { getTeamSpec } = await import('../../../src/core/teams/registry.js');

    const bridgeResult = await bridge.getTeamSpec('fan_out');
    const esmResult = getTeamSpec('fan_out');

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return deep-equal results');
  });

  // TB-03: CJS bridge listTeamTypes returns same array as ESM registry
  it('TB-03: listTeamTypes returns same array as ESM registry (AC-006-03)', async () => {
    const bridge = require('../../../src/core/bridge/team-specs.cjs');
    const { listTeamTypes } = await import('../../../src/core/teams/registry.js');

    const bridgeResult = await bridge.listTeamTypes();
    const esmResult = listTeamTypes();

    assert.deepEqual(bridgeResult, esmResult,
      'Bridge and ESM should return same type list');
  });

  // TB-04: CJS bridge getTeamSpec throws/rejects on unknown type
  it('TB-04: getTeamSpec rejects on unknown type (AC-006-01)', async () => {
    const bridge = require('../../../src/core/bridge/team-specs.cjs');
    await assert.rejects(
      () => bridge.getTeamSpec('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('fan_out'), 'Should list available types');
        return true;
      }
    );
  });
});
