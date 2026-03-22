/**
 * Unit tests for src/core/orchestration/provider-runtime.js
 *
 * Tests the ProviderRuntime interface contract: frozen constants,
 * factory function, runtime validation, and provider enumeration.
 *
 * Requirements: FR-001 (AC-001-01..02), FR-002 (AC-002-02),
 *   FR-007 (AC-007-01..03), FR-008 (AC-008-01..02)
 *
 * Test ID prefix: PR- (Provider Runtime)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROVIDER_RUNTIME_INTERFACE,
  TASK_RESULT_FIELDS,
  KNOWN_PROVIDERS,
  createProviderRuntime,
  validateProviderRuntime,
  getKnownProviders
} from '../../../src/core/orchestration/provider-runtime.js';

// ---------------------------------------------------------------------------
// Helper: create a valid mock runtime with all 5 required methods
// ---------------------------------------------------------------------------

function createMockRuntime(overrides = {}) {
  return {
    executeTask: async () => ({ status: 'success', output: '', duration_ms: 0 }),
    executeParallel: async () => [],
    presentInteractive: async () => '',
    readUserResponse: async () => '',
    validateRuntime: async () => ({ available: true }),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// FR-001: Interface Definition — PROVIDER_RUNTIME_INTERFACE
// ---------------------------------------------------------------------------

describe('FR-001: PROVIDER_RUNTIME_INTERFACE constant', () => {
  // PR-01: PROVIDER_RUNTIME_INTERFACE is frozen
  it('PR-01: is deeply frozen (AC-001-01)', () => {
    assert.ok(Object.isFrozen(PROVIDER_RUNTIME_INTERFACE),
      'PROVIDER_RUNTIME_INTERFACE must be frozen');
  });

  // PR-02: methods list contains all 5 required methods
  it('PR-02: methods list contains all 5 required methods (AC-001-01)', () => {
    const expected = [
      'executeTask',
      'executeParallel',
      'presentInteractive',
      'readUserResponse',
      'validateRuntime'
    ];
    assert.deepEqual(PROVIDER_RUNTIME_INTERFACE.methods, expected);
  });

  // PR-03: executeTask entry has correct params and returns
  it('PR-03: executeTask has params [phase, agent, context] and returns TaskResult (AC-001-02)', () => {
    const entry = PROVIDER_RUNTIME_INTERFACE.executeTask;
    assert.deepEqual(entry.params, ['phase', 'agent', 'context']);
    assert.equal(entry.returns, 'TaskResult');
  });

  // PR-04: executeParallel entry has correct params and returns
  it('PR-04: executeParallel has params [tasks] and returns TaskResult[] (AC-001-02)', () => {
    const entry = PROVIDER_RUNTIME_INTERFACE.executeParallel;
    assert.deepEqual(entry.params, ['tasks']);
    assert.equal(entry.returns, 'TaskResult[]');
  });

  // PR-05: presentInteractive entry has correct params and returns
  it('PR-05: presentInteractive has params [prompt] and returns string (AC-001-02)', () => {
    const entry = PROVIDER_RUNTIME_INTERFACE.presentInteractive;
    assert.deepEqual(entry.params, ['prompt']);
    assert.equal(entry.returns, 'string');
  });

  // PR-06: readUserResponse entry has correct params and returns
  it('PR-06: readUserResponse has params [options] and returns string (AC-001-02)', () => {
    const entry = PROVIDER_RUNTIME_INTERFACE.readUserResponse;
    assert.deepEqual(entry.params, ['options']);
    assert.equal(entry.returns, 'string');
  });

  // PR-07: validateRuntime entry has correct params and returns
  it('PR-07: validateRuntime has params [] and returns ValidationResult (AC-001-02)', () => {
    const entry = PROVIDER_RUNTIME_INTERFACE.validateRuntime;
    assert.deepEqual(entry.params, []);
    assert.equal(entry.returns, 'ValidationResult');
  });
});

// ---------------------------------------------------------------------------
// FR-002: TaskResult — TASK_RESULT_FIELDS
// ---------------------------------------------------------------------------

describe('FR-002: TASK_RESULT_FIELDS constant', () => {
  // PR-08: TASK_RESULT_FIELDS is frozen
  it('PR-08: is frozen (AC-002-02)', () => {
    assert.ok(Object.isFrozen(TASK_RESULT_FIELDS),
      'TASK_RESULT_FIELDS must be frozen');
  });

  // PR-09: contains the correct 4 fields
  it('PR-09: contains status, output, duration_ms, error (AC-002-02)', () => {
    assert.deepEqual(TASK_RESULT_FIELDS, ['status', 'output', 'duration_ms', 'error']);
  });
});

// ---------------------------------------------------------------------------
// FR-007: Known Providers — KNOWN_PROVIDERS
// ---------------------------------------------------------------------------

describe('FR-007: KNOWN_PROVIDERS constant', () => {
  // PR-10: KNOWN_PROVIDERS is frozen
  it('PR-10: is frozen (AC-007-02)', () => {
    assert.ok(Object.isFrozen(KNOWN_PROVIDERS),
      'KNOWN_PROVIDERS must be frozen');
  });

  // PR-11: contains claude, codex, antigravity
  it('PR-11: contains claude, codex, antigravity (AC-007-02)', () => {
    assert.ok(KNOWN_PROVIDERS.includes('claude'));
    assert.ok(KNOWN_PROVIDERS.includes('codex'));
    assert.ok(KNOWN_PROVIDERS.includes('antigravity'));
    assert.equal(KNOWN_PROVIDERS.length, 3);
  });
});

// ---------------------------------------------------------------------------
// FR-008: validateProviderRuntime()
// ---------------------------------------------------------------------------

describe('FR-008: validateProviderRuntime()', () => {
  // PR-12: Valid mock runtime returns { valid: true, missing: [] }
  it('PR-12: valid runtime with all 5 methods returns valid: true (AC-008-01)', () => {
    const runtime = createMockRuntime();
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, true);
    assert.deepEqual(result.missing, []);
  });

  // PR-13: Missing one method returns valid: false with correct missing
  it('PR-13: missing executeTask returns valid: false with missing list (AC-008-02)', () => {
    const runtime = createMockRuntime();
    delete runtime.executeTask;
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ['executeTask']);
  });

  // PR-14: Missing multiple methods returns all missing
  it('PR-14: missing multiple methods lists all of them (AC-008-02)', () => {
    const runtime = createMockRuntime();
    delete runtime.executeTask;
    delete runtime.presentInteractive;
    delete runtime.validateRuntime;
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 3);
    assert.ok(result.missing.includes('executeTask'));
    assert.ok(result.missing.includes('presentInteractive'));
    assert.ok(result.missing.includes('validateRuntime'));
  });

  // PR-15: null input returns valid: false, all 5 methods missing
  it('PR-15: null runtime returns valid: false, all methods missing (AC-008-01)', () => {
    const result = validateProviderRuntime(null);
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 5);
  });

  // PR-16: undefined input returns valid: false, all 5 methods missing
  it('PR-16: undefined runtime returns valid: false, all methods missing (AC-008-01)', () => {
    const result = validateProviderRuntime(undefined);
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 5);
  });

  // PR-17: Empty object returns valid: false, all 5 missing
  it('PR-17: empty object returns valid: false, all 5 missing (AC-008-02)', () => {
    const result = validateProviderRuntime({});
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 5);
    assert.deepEqual(result.missing, PROVIDER_RUNTIME_INTERFACE.methods);
  });

  // PR-18: Non-function values (strings) treated as missing
  it('PR-18: non-function values treated as missing methods (AC-008-01)', () => {
    const runtime = {
      executeTask: 'not a function',
      executeParallel: 42,
      presentInteractive: true,
      readUserResponse: {},
      validateRuntime: []
    };
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 5);
  });

  // PR-19: Mixed valid/invalid — correct missing list
  it('PR-19: mixed valid/invalid methods identifies only missing ones (AC-008-02)', () => {
    const runtime = {
      executeTask: async () => {},
      executeParallel: 'not a function',
      presentInteractive: async () => {},
      readUserResponse: null,
      validateRuntime: async () => {}
    };
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ['executeParallel', 'readUserResponse']);
  });

  // PR-20: Extra methods on runtime still valid
  it('PR-20: extra methods on runtime do not affect validity (AC-008-01)', () => {
    const runtime = createMockRuntime({ customMethod: () => {} });
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, true);
    assert.deepEqual(result.missing, []);
  });

  // PR-21: Partial runtime (3 of 5) reports 2 missing
  it('PR-21: partial runtime (3 of 5) reports exactly 2 missing (AC-008-02)', () => {
    const runtime = {
      executeTask: async () => {},
      executeParallel: async () => {},
      presentInteractive: async () => {}
      // readUserResponse and validateRuntime missing
    };
    const result = validateProviderRuntime(runtime);
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 2);
    assert.ok(result.missing.includes('readUserResponse'));
    assert.ok(result.missing.includes('validateRuntime'));
  });
});

// ---------------------------------------------------------------------------
// FR-007: createProviderRuntime()
// ---------------------------------------------------------------------------

describe('FR-007: createProviderRuntime()', () => {
  // PR-22: Unknown provider throws ERR-RUNTIME-001
  it('PR-22: unknown provider throws ERR-RUNTIME-001 (AC-007-02)', async () => {
    await assert.rejects(
      () => createProviderRuntime('nonexistent', {}),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('ERR-RUNTIME-001'),
          'Error should include ERR-RUNTIME-001 code');
        return true;
      }
    );
  });

  // PR-23: Error message lists available providers
  it('PR-23: error message lists available providers (AC-007-02)', async () => {
    await assert.rejects(
      () => createProviderRuntime('nonexistent', {}),
      (err) => {
        assert.ok(err.message.includes('claude'), 'Should list claude');
        assert.ok(err.message.includes('codex'), 'Should list codex');
        assert.ok(err.message.includes('antigravity'), 'Should list antigravity');
        return true;
      }
    );
  });

  // PR-24: Known provider with no module throws with helpful message
  it('PR-24: known provider with no runtime module throws helpful error (AC-007-01)', async () => {
    // No provider runtime.js files exist yet, so all known providers will fail import
    await assert.rejects(
      () => createProviderRuntime('claude', {}),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes('ERR-RUNTIME-001') || err.message.includes('runtime'),
          'Error should mention runtime loading failure'
        );
        return true;
      }
    );
  });

  // PR-25: Error code is ERR-RUNTIME-001 for unknown provider
  it('PR-25: error includes ERR-RUNTIME-001 code for unknown provider (AC-007-02)', async () => {
    await assert.rejects(
      () => createProviderRuntime('fake-provider', {}),
      (err) => {
        assert.ok(err.message.includes('ERR-RUNTIME-001'));
        return true;
      }
    );
  });

  // PR-26: null provider name throws ERR-RUNTIME-001
  it('PR-26: null provider name throws ERR-RUNTIME-001 (AC-007-02)', async () => {
    await assert.rejects(
      () => createProviderRuntime(null, {}),
      (err) => {
        assert.ok(err.message.includes('ERR-RUNTIME-001'));
        return true;
      }
    );
  });

  // PR-27: Empty string provider throws ERR-RUNTIME-001
  it('PR-27: empty string provider throws ERR-RUNTIME-001 (AC-007-02)', async () => {
    await assert.rejects(
      () => createProviderRuntime('', {}),
      (err) => {
        assert.ok(err.message.includes('ERR-RUNTIME-001'));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// FR-007: getKnownProviders()
// ---------------------------------------------------------------------------

describe('FR-007: getKnownProviders()', () => {
  // PR-28: Returns array of 3 providers
  it('PR-28: returns array of 3 providers (AC-007-02)', () => {
    const providers = getKnownProviders();
    assert.ok(Array.isArray(providers));
    assert.equal(providers.length, 3);
  });

  // PR-29: Returns a copy — mutation does not affect internal state
  it('PR-29: returns a copy — mutation does not affect internal state (defensive)', () => {
    const providers1 = getKnownProviders();
    providers1.push('custom');
    const providers2 = getKnownProviders();
    assert.equal(providers2.length, 3, 'Internal array should not be mutated');
    assert.ok(!providers2.includes('custom'));
  });

  // PR-30: Contains claude, codex, antigravity
  it('PR-30: contains claude, codex, antigravity (AC-007-02)', () => {
    const providers = getKnownProviders();
    assert.ok(providers.includes('claude'));
    assert.ok(providers.includes('codex'));
    assert.ok(providers.includes('antigravity'));
  });
});

// ---------------------------------------------------------------------------
// Module Exports
// ---------------------------------------------------------------------------

describe('Module exports', () => {
  // PR-31: Exports createProviderRuntime
  it('PR-31: exports createProviderRuntime function (AC-007-01)', async () => {
    const mod = await import('../../../src/core/orchestration/provider-runtime.js');
    assert.equal(typeof mod.createProviderRuntime, 'function');
  });

  // PR-32: Exports validateProviderRuntime
  it('PR-32: exports validateProviderRuntime function (AC-008-01)', async () => {
    const mod = await import('../../../src/core/orchestration/provider-runtime.js');
    assert.equal(typeof mod.validateProviderRuntime, 'function');
  });

  // PR-33: Exports getKnownProviders
  it('PR-33: exports getKnownProviders function (AC-007-02)', async () => {
    const mod = await import('../../../src/core/orchestration/provider-runtime.js');
    assert.equal(typeof mod.getKnownProviders, 'function');
  });

  // PR-34: Exports PROVIDER_RUNTIME_INTERFACE
  it('PR-34: exports PROVIDER_RUNTIME_INTERFACE constant (AC-001-01)', async () => {
    const mod = await import('../../../src/core/orchestration/provider-runtime.js');
    assert.ok(mod.PROVIDER_RUNTIME_INTERFACE !== undefined);
    assert.ok(typeof mod.PROVIDER_RUNTIME_INTERFACE === 'object');
  });

  // PR-35: Exports TASK_RESULT_FIELDS
  it('PR-35: exports TASK_RESULT_FIELDS constant (AC-002-02)', async () => {
    const mod = await import('../../../src/core/orchestration/provider-runtime.js');
    assert.ok(Array.isArray(mod.TASK_RESULT_FIELDS));
  });

  // PR-36: Exports KNOWN_PROVIDERS
  it('PR-36: exports KNOWN_PROVIDERS constant (AC-007-02)', async () => {
    const mod = await import('../../../src/core/orchestration/provider-runtime.js');
    assert.ok(Array.isArray(mod.KNOWN_PROVIDERS));
  });
});
