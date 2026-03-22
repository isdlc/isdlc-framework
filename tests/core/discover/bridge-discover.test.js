/**
 * Unit tests for src/core/bridge/discover.cjs — CJS Bridge for Discover
 *
 * Per Article XIII (Module System Consistency), CJS bridge tests verify
 * parity between CJS bridge and ESM exports.
 *
 * Requirements: REQ-0103..0107 (CJS bridge)
 *
 * Test ID prefix: DB- (Discover Bridge)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Bridge Exports
// ---------------------------------------------------------------------------

describe('CJS Bridge: discover.cjs exports', () => {
  it('DB-01: exports getDiscoverMode function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.getDiscoverMode, 'function');
  });

  it('DB-02: exports getAgentGroup function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.getAgentGroup, 'function');
  });

  it('DB-03: exports listDiscoverModes function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.listDiscoverModes, 'function');
  });

  it('DB-04: exports listAgentGroups function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.listAgentGroups, 'function');
  });

  it('DB-05: exports getMenu function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.getMenu, 'function');
  });

  it('DB-06: exports getWalkthrough function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.getWalkthrough, 'function');
  });

  it('DB-07: exports getDistillationConfig function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.getDistillationConfig, 'function');
  });

  it('DB-08: exports getProjectionChain function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.getProjectionChain, 'function');
  });

  it('DB-09: exports createInitialDiscoverState function', () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    assert.equal(typeof bridge.createInitialDiscoverState, 'function');
  });
});

// ---------------------------------------------------------------------------
// Bridge-ESM Parity
// ---------------------------------------------------------------------------

describe('CJS Bridge: parity with ESM', () => {
  it('DB-10: getDiscoverMode returns same data as ESM', async () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    const { getDiscoverMode } = await import('../../../src/core/discover/index.js');

    const bridgeResult = await bridge.getDiscoverMode('discover_existing');
    const esmResult = getDiscoverMode('discover_existing');
    assert.deepEqual(bridgeResult, esmResult);
  });

  it('DB-11: listDiscoverModes returns same data as ESM', async () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    const { listDiscoverModes } = await import('../../../src/core/discover/index.js');

    const bridgeResult = await bridge.listDiscoverModes();
    const esmResult = listDiscoverModes();
    assert.deepEqual(bridgeResult, esmResult);
  });

  it('DB-12: getAgentGroup returns same data as ESM', async () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    const { getAgentGroup } = await import('../../../src/core/discover/index.js');

    const bridgeResult = await bridge.getAgentGroup('core_analyzers');
    const esmResult = getAgentGroup('core_analyzers');
    assert.deepEqual(bridgeResult, esmResult);
  });

  it('DB-13: getProjectionChain returns same data as ESM', async () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    const { getProjectionChain } = await import('../../../src/core/discover/index.js');

    const bridgeResult = await bridge.getProjectionChain();
    const esmResult = getProjectionChain();
    assert.deepEqual(bridgeResult, esmResult);
  });

  it('DB-14: getDiscoverMode rejects on unknown mode', async () => {
    const bridge = require('../../../src/core/bridge/discover.cjs');
    await assert.rejects(
      () => bridge.getDiscoverMode('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });
});
