/**
 * Unit tests for src/core/bridge/orchestration.cjs — CJS Bridge
 *
 * Per Article XIII (Module System Consistency), CJS bridge tests verify
 * that the bridge exposes the same functions and constants as the ESM module.
 *
 * Requirements: FR-007 (bridge), FR-008 (bridge), FR-001 (bridge)
 *
 * Test ID prefix: BO- (Bridge Orchestration)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Bridge Exports
// ---------------------------------------------------------------------------

describe('CJS Bridge: orchestration.cjs exports', () => {
  // BO-01: Bridge exports createProviderRuntime
  it('BO-01: exports createProviderRuntime function (FR-007 bridge)', () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    assert.equal(typeof bridge.createProviderRuntime, 'function');
  });

  // BO-02: Bridge exports validateProviderRuntime
  it('BO-02: exports validateProviderRuntime function (FR-008 bridge)', () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    assert.equal(typeof bridge.validateProviderRuntime, 'function');
  });

  // BO-03: Bridge exports getKnownProviders
  it('BO-03: exports getKnownProviders function (FR-007 bridge)', () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    assert.equal(typeof bridge.getKnownProviders, 'function');
  });

  // BO-04: Bridge exports PROVIDER_RUNTIME_INTERFACE
  it('BO-04: exports PROVIDER_RUNTIME_INTERFACE constant (FR-001 bridge)', async () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    const iface = await bridge.PROVIDER_RUNTIME_INTERFACE();
    assert.ok(iface !== undefined);
    assert.ok(typeof iface === 'object');
    assert.ok(Array.isArray(iface.methods));
  });

  // BO-05: Bridge exports TASK_RESULT_FIELDS
  it('BO-05: exports TASK_RESULT_FIELDS constant (FR-002 bridge)', async () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    const fields = await bridge.TASK_RESULT_FIELDS();
    assert.ok(Array.isArray(fields));
    assert.equal(fields.length, 4);
  });

  // BO-06: Bridge exports KNOWN_PROVIDERS
  it('BO-06: exports KNOWN_PROVIDERS constant (FR-007 bridge)', async () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    const providers = await bridge.KNOWN_PROVIDERS();
    assert.ok(Array.isArray(providers));
    assert.equal(providers.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Bridge Parity with ESM
// ---------------------------------------------------------------------------

describe('CJS Bridge: orchestration.cjs parity with ESM', () => {
  // BO-07: getKnownProviders returns same data as ESM
  it('BO-07: getKnownProviders matches ESM result (FR-007 parity)', async () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    const { getKnownProviders } = await import(
      '../../../src/core/orchestration/provider-runtime.js'
    );

    const bridgeResult = await bridge.getKnownProviders();
    const esmResult = getKnownProviders();

    assert.deepEqual(bridgeResult, esmResult);
  });

  // BO-08: validateProviderRuntime returns same result as ESM
  it('BO-08: validateProviderRuntime matches ESM result (FR-008 parity)', async () => {
    const bridge = require('../../../src/core/bridge/orchestration.cjs');
    const { validateProviderRuntime } = await import(
      '../../../src/core/orchestration/provider-runtime.js'
    );

    const mockRuntime = {
      executeTask: async () => {},
      executeParallel: async () => {},
      presentInteractive: async () => {},
      readUserResponse: async () => {},
      validateRuntime: async () => {}
    };

    const bridgeResult = await bridge.validateProviderRuntime(mockRuntime);
    const esmResult = validateProviderRuntime(mockRuntime);

    assert.deepEqual(bridgeResult, esmResult);
  });
});
