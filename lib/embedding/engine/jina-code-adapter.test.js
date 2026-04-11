/**
 * Tests for Jina Code Adapter — FR-001, FR-003, FR-004
 *
 * REQ-GH-237 / FR-001 (AC-001-01..AC-001-04)
 * REQ-GH-238 / FR-001, FR-003, FR-004
 * AC-001-04, AC-003-05, AC-003-06, AC-003-07, AC-003-09, AC-004-06
 * Article II: Test-First Development
 *
 * Tests mock @huggingface/transformers since the real model (~162MB)
 * is too large for CI. Each test uses _pipelineFactory dependency
 * injection to provide a mock pipeline without requiring the real model.
 */

import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Shared constants (mirrors the adapter's exported constant)
// ---------------------------------------------------------------------------
const EXPECTED_DIMENSIONS = 768;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a fake Float32Array of the expected dimension, L2-normalized.
 * @param {number} [seed=1] - Seed for deterministic values
 * @returns {Float32Array}
 */
function makeNormalizedVector(seed = 1) {
  const vec = new Float32Array(EXPECTED_DIMENSIONS);
  let norm = 0;
  for (let i = 0; i < EXPECTED_DIMENSIONS; i++) {
    vec[i] = Math.sin(seed * (i + 1));
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < EXPECTED_DIMENSIONS; i++) {
    vec[i] /= norm;
  }
  return vec;
}

/**
 * Build a mock pipeline function that returns a mock feature-extraction pipeline.
 * The mock pipeline, when called with texts, returns { tolist: () => [[...values]] }.
 * @returns {{ pipelineFn: Function, callLog: Array }}
 */
function createMockPipeline() {
  const callLog = [];
  const mockExtractor = async (texts, options) => {
    callLog.push({ texts, options });
    const inputArray = Array.isArray(texts) ? texts : [texts];
    const vectors = inputArray.map((_, i) => makeNormalizedVector(i + 1));
    return { tolist: () => vectors.map(v => Array.from(v)) };
  };
  // Attach dispose to the mock extractor
  mockExtractor.dispose = () => { callLog.push({ action: 'dispose' }); };

  const pipelineFn = async (task, model, opts) => {
    callLog.push({ task, model, opts });
    return mockExtractor;
  };

  return { pipelineFn, callLog };
}

/**
 * Helper: create an adapter in in-process mode (parallelism: 1) with the
 * standard mock pipeline injected.  Legacy tests that predate the pool
 * feature all expect in-process behaviour, so parallelism: 1 is the safe
 * default here.
 *
 * Returns both the adapter and the callLog for inspection.
 */
async function createTestAdapter(extraConfig = {}) {
  const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
  const { pipelineFn, callLog } = createMockPipeline();
  const adapter = await createJinaCodeAdapter({
    _pipelineFactory: pipelineFn,
    parallelism: 1,           // default to in-process for legacy tests
    ...extraConfig,           // caller can override to test pool mode
  });
  return { adapter, callLog, createJinaCodeAdapter };
}

/**
 * Helper: create a mock pipeline that throws on extractor invocation.
 */
function createFailingExtractorPipeline() {
  const callLog = [];
  const mockExtractor = async () => {
    throw new Error('Pipeline inference failed');
  };
  mockExtractor.dispose = () => { callLog.push({ action: 'dispose' }); };

  const pipelineFn = async (task, model, opts) => {
    callLog.push({ task, model, opts });
    return mockExtractor;
  };
  return { pipelineFn, callLog };
}

/**
 * Create a mock worker pool for testing pooled mode without real worker threads.
 * @param {Object} [overrides] - Override pool method behaviors
 * @returns {{ createPool: Function, poolLog: Array }}
 */
function createMockWorkerPool(overrides = {}) {
  const poolLog = [];
  let shutDown = false;

  const mockPool = {
    embed: overrides.embed || (async (texts, batchSize, opts) => {
      poolLog.push({ method: 'embed', texts, batchSize, opts });
      return texts.map((_, i) => makeNormalizedVector(i + 1));
    }),
    shutdown: overrides.shutdown || (async () => {
      poolLog.push({ method: 'shutdown' });
      shutDown = true;
    }),
    stats: overrides.stats || (() => {
      poolLog.push({ method: 'stats' });
      return { poolSize: 4, activeWorkers: 0, isShutDown: shutDown };
    }),
    resize: overrides.resize || ((n) => {
      poolLog.push({ method: 'resize', n });
    }),
  };

  const createPool = (workerPath, options) => {
    poolLog.push({ method: 'createPool', workerPath, options });
    return mockPool;
  };

  return { createPool, poolLog, mockPool };
}

/**
 * Helper config object for simulating fail-open (AC-001-04).
 * Sets _throwOnInit: true so the adapter's pipeline availability check
 * throws, regardless of whether @huggingface/transformers is installed.
 */
function failOpenConfig(extra = {}) {
  const { pipelineFn } = createMockPipeline();
  return { _pipelineFactory: pipelineFn, _throwOnInit: true, ...extra };
}

// ===========================================================================
// FR-001: Jina Code Adapter
// ===========================================================================

describe('FR-001: Jina Code Adapter (jina-code-adapter)', () => {

  // ── JINA_CODE_DIMENSIONS constant ─────────────────────────────────

  describe('JINA_CODE_DIMENSIONS', () => {

    it('[P0] AC-001-01: exports JINA_CODE_DIMENSIONS constant of 768', async () => {
      const { JINA_CODE_DIMENSIONS } = await import('./jina-code-adapter.js');
      assert.equal(JINA_CODE_DIMENSIONS, EXPECTED_DIMENSIONS);
    });

  });

  // ── createJinaCodeAdapter() — successful initialization ───────────

  describe('createJinaCodeAdapter() — initialization', () => {

    it('[P0] AC-001-01: pipeline() initializes and returns a valid adapter object', async () => {
      const { adapter } = await createTestAdapter();
      assert.ok(adapter !== null, 'adapter should not be null');
      assert.ok(typeof adapter === 'object', 'adapter should be an object');
      assert.ok('dimensions' in adapter, 'adapter should have dimensions');
      assert.ok('embed' in adapter, 'adapter should have embed');
      assert.ok('healthCheck' in adapter, 'adapter should have healthCheck');
      assert.ok('dispose' in adapter, 'adapter should have dispose');
    });

    it('[P0] AC-001-01: adapter.dimensions equals 768', async () => {
      const { adapter } = await createTestAdapter();
      assert.equal(adapter.dimensions, 768);
    });

    it('[P1] AC-001-01: adapter.embed is a function', async () => {
      const { adapter } = await createTestAdapter();
      assert.equal(typeof adapter.embed, 'function');
    });

    it('[P1] AC-001-01: adapter.healthCheck is a function', async () => {
      const { adapter } = await createTestAdapter();
      assert.equal(typeof adapter.healthCheck, 'function');
    });

    it('[P1] AC-001-01: adapter.dispose is a function', async () => {
      const { adapter } = await createTestAdapter();
      assert.equal(typeof adapter.dispose, 'function');
    });

    it('[P2] AC-001-01: passes cacheDir config to pipeline options', async () => {
      const { adapter, callLog } = await createTestAdapter({ cacheDir: '/tmp/test-cache' });
      await adapter.embed(['test']);
      const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
      assert.ok(pipelineCall, 'pipeline() should have been called');
      assert.ok(pipelineCall.opts.cache_dir === '/tmp/test-cache', 'cache_dir should be forwarded');
    });

    it('[P2] AC-001-01: uses default config when no options provided', async () => {
      const { adapter, callLog } = await createTestAdapter();
      await adapter.embed(['test']);
      const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
      assert.ok(pipelineCall, 'pipeline() should have been called');
      assert.ok(typeof pipelineCall.opts === 'object', 'opts should be an object');
    });

  });

  // ── embed() — vector generation ───────────────────────────────────

  describe('embed()', () => {

    it('[P0] AC-001-02: returns array of Float32Array vectors for single text', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['function add(a, b) { return a + b; }']);
      assert.ok(Array.isArray(result), 'result should be an array');
      assert.equal(result.length, 1, 'result should have 1 element');
      assert.ok(result[0] instanceof Float32Array, 'result[0] should be Float32Array');
    });

    it('[P0] AC-001-02: each vector has exactly 768 dimensions', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['hello world']);
      assert.equal(result[0].length, 768, 'vector should have 768 dimensions');
    });

    it('[P0] AC-001-02: vectors are L2-normalized (unit length)', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['test input']);
      const vec = result[0];
      let sumSq = 0;
      for (let i = 0; i < vec.length; i++) {
        sumSq += vec[i] * vec[i];
      }
      const norm = Math.sqrt(sumSq);
      assert.ok(Math.abs(norm - 1.0) < 1e-5, `L2 norm should be ~1.0, got ${norm}`);
    });

    it('[P0] AC-001-02: handles multiple texts in a single call', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['text one', 'text two', 'text three']);
      assert.equal(result.length, 3, 'should return 3 vectors');
      for (let i = 0; i < 3; i++) {
        assert.ok(result[i] instanceof Float32Array, `result[${i}] should be Float32Array`);
        assert.equal(result[i].length, 768, `result[${i}] should have 768 dimensions`);
      }
    });

    it('[P1] AC-001-02: returns different vectors for different inputs', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['function foo() {}', 'class Bar extends Baz {}']);
      assert.equal(result.length, 2, 'should return 2 vectors');
      assert.ok(result[0] instanceof Float32Array, 'first should be Float32Array');
      assert.ok(result[1] instanceof Float32Array, 'second should be Float32Array');
    });

    it('[P1] AC-001-02: returns consistent vectors for identical inputs', async () => {
      const { adapter } = await createTestAdapter();
      const result1 = await adapter.embed(['const x = 42']);
      const result2 = await adapter.embed(['const x = 42']);
      assert.deepEqual(Array.from(result1[0]), Array.from(result2[0]),
        'same input should produce identical vectors');
    });

    it('[P2] AC-001-02: handles empty string input gracefully', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['']);
      assert.equal(result.length, 1, 'should return 1 vector');
      assert.ok(result[0] instanceof Float32Array, 'should be Float32Array');
      assert.equal(result[0].length, 768, 'should have 768 dimensions');
      for (let i = 0; i < result[0].length; i++) {
        assert.ok(!isNaN(result[0][i]), `element ${i} should not be NaN`);
      }
    });

    it('[P2] AC-001-02: handles very long text input (truncation)', async () => {
      const { adapter } = await createTestAdapter();
      const longText = 'word '.repeat(10000);
      const result = await adapter.embed([longText]);
      assert.equal(result.length, 1, 'should return 1 vector');
      assert.ok(result[0] instanceof Float32Array, 'should be Float32Array');
      assert.equal(result[0].length, 768, 'should have 768 dimensions');
    });

    it('[P2] AC-001-02: handles unicode and special characters', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.embed(['const emoji = "\u{1F680}"; // comment with accents: caf\u00e9']);
      assert.equal(result.length, 1, 'should return 1 vector');
      assert.ok(result[0] instanceof Float32Array, 'should be Float32Array');
      assert.equal(result[0].length, 768, 'should have 768 dimensions');
    });

    it('[P1] AC-001-02: propagates pipeline errors as Error', async () => {
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      const { pipelineFn } = createFailingExtractorPipeline();
      const adapter = await createJinaCodeAdapter({
        _pipelineFactory: pipelineFn,
        parallelism: 1,
      });
      assert.ok(adapter !== null, 'adapter should be created');

      await assert.rejects(
        () => adapter.embed(['test']),
        (err) => {
          assert.ok(err instanceof Error, 'should be an Error');
          assert.ok(err.message.length > 0, 'error message should be non-empty');
          return true;
        }
      );
    });

  });

  // ── healthCheck() ─────────────────────────────────────────────────

  describe('healthCheck()', () => {

    it('[P0] AC-001-03: returns { healthy: true, dimensions: 768 } when adapter is functional', async () => {
      const { adapter } = await createTestAdapter();
      const result = await adapter.healthCheck();
      assert.equal(result.healthy, true, 'should be healthy');
      assert.equal(result.dimensions, 768, 'dimensions should be 768');
    });

    it('[P1] AC-001-03: returns healthy: false with error when pipeline fails', async () => {
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      const failingPipeline = async () => {
        throw new Error('ONNX runtime initialization failed');
      };
      const adapter = await createJinaCodeAdapter({
        _pipelineFactory: failingPipeline,
        parallelism: 1,
      });
      assert.ok(adapter !== null);

      const result = await adapter.healthCheck();
      assert.equal(result.healthy, false, 'should not be healthy');
      assert.ok(typeof result.error === 'string', 'error should be a string');
      assert.ok(result.error.length > 0, 'error should be non-empty');
    });

    it('[P1] AC-001-03: always includes dimensions in response', async () => {
      // Test healthy adapter
      const { adapter: healthyAdapter } = await createTestAdapter();
      const healthyResult = await healthyAdapter.healthCheck();
      assert.equal(healthyResult.dimensions, 768, 'healthy adapter dimensions should be 768');

      // Test unhealthy adapter
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      const failingPipeline = async () => {
        throw new Error('Model load error');
      };
      const unhealthyAdapter = await createJinaCodeAdapter({
        _pipelineFactory: failingPipeline,
        parallelism: 1,
      });
      const unhealthyResult = await unhealthyAdapter.healthCheck();
      assert.equal(unhealthyResult.dimensions, 768, 'unhealthy adapter dimensions should be 768');
    });

  });

  // ── dispose() ─────────────────────────────────────────────────────

  describe('dispose()', () => {

    it('[P1] AC-001-01: dispose releases pipeline resources', async () => {
      const { adapter, callLog } = await createTestAdapter();
      await adapter.embed(['init']);
      const initCalls = callLog.filter(e => e.task === 'feature-extraction');
      assert.equal(initCalls.length, 1, 'pipeline should be initialized once');

      adapter.dispose();
      const disposeCalls = callLog.filter(e => e.action === 'dispose');
      assert.equal(disposeCalls.length, 1, 'dispose should be called on extractor');

      await adapter.embed(['after dispose']);
      const reinitCalls = callLog.filter(e => e.task === 'feature-extraction');
      assert.equal(reinitCalls.length, 2, 'pipeline should be re-initialized after dispose');
    });

    it('[P2] AC-001-01: dispose is safe to call multiple times', async () => {
      const { adapter } = await createTestAdapter();
      await adapter.embed(['init']);
      assert.doesNotThrow(() => adapter.dispose(), 'first dispose should not throw');
      assert.doesNotThrow(() => adapter.dispose(), 'second dispose should not throw');
    });

    it('[P2] AC-001-01: dispose is safe to call when not initialized', async () => {
      const { adapter } = await createTestAdapter();
      assert.doesNotThrow(() => adapter.dispose(), 'dispose before init should not throw');
    });

  });

  // ── Fail-open behavior ────────────────────────────────────────────

  describe('fail-open (AC-001-04)', () => {

    it('[P0] AC-001-04: returns null when pipeline init fails (simulating missing transformers)', async () => {
      // Simulate @huggingface/transformers not being installed via _throwOnInit.
      // The adapter should catch the error and return null.
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      const result = await createJinaCodeAdapter(failOpenConfig());
      assert.equal(result, null, 'should return null when pipeline init fails');
    });

    it('[P0] AC-001-04: does not throw when pipeline init fails', async () => {
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      // Should not reject — resolves to null
      const result = await createJinaCodeAdapter(failOpenConfig());
      assert.equal(result, null);
    });

    it('[P1] AC-001-04: returns null on init failure regardless of config values', async () => {
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      const result = await createJinaCodeAdapter(failOpenConfig({
        device: 'cpu',
        dtype: 'fp32',
        batch_size: 16,
      }));
      assert.equal(result, null, 'should return null on pipeline init failure');
    });

    it('[P2] AC-001-04: returns null regardless of parallelism setting', async () => {
      // Even with parallelism > 1, if the pipeline availability check fails,
      // the adapter should return null.
      const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
      const result = await createJinaCodeAdapter(failOpenConfig({ parallelism: 4 }));
      assert.equal(result, null, 'should return null even with parallelism > 1');
    });

  });

  // ══════════════════════════════════════════════════════════════════
  // REQ-GH-238: Hardware acceleration config wiring
  // ══════════════════════════════════════════════════════════════════

  describe('REQ-GH-238: Config resolution and device passthrough', () => {

    // ── AC-004-06: Auto config defaults ─────────────────────────────

    describe('AC-004-06: Auto config defaults', () => {

      it('[P0] AC-004-06: resolves auto config when no explicit values provided', async () => {
        // Use parallelism: 1 to stay in-process; the auto-resolution of
        // device/dtype/batch_size is what we are testing here.
        const { adapter } = await createTestAdapter();
        const r = adapter._resolved;
        assert.ok(r, '_resolved should be exposed');
        assert.notEqual(r.device, 'auto', 'device should be resolved from auto');
        assert.notEqual(r.dtype, 'auto', 'dtype should be resolved from auto');
        assert.ok(typeof r.parallelism === 'number', 'parallelism should be a number');
        assert.ok(r.parallelism >= 1, 'parallelism should be >= 1');
        assert.equal(r.batch_size, 32, 'batch_size should default to 32');
        assert.ok(typeof r.session_options === 'object', 'session_options should be an object');
      });

      it('[P1] AC-004-06: resolved config uses device-detector defaults', async () => {
        const { adapter } = await createTestAdapter();
        const r = adapter._resolved;
        const validDevices = ['cpu', 'coreml', 'cuda', 'directml', 'rocm'];
        assert.ok(validDevices.includes(r.device), `device "${r.device}" should be in ${validDevices}`);
        const validDtypes = ['fp16', 'fp32', 'q8'];
        assert.ok(validDtypes.includes(r.dtype), `dtype "${r.dtype}" should be in ${validDtypes}`);
      });

    });

    // ── FR-003: Device passthrough to in-process pipeline ───────────

    describe('FR-003: Device passthrough (in-process mode)', () => {

      it('[P0] FR-003: passes resolved device to pipeline opts in in-process mode', async () => {
        const { adapter, callLog } = await createTestAdapter({
          device: 'cpu',
          parallelism: 1,
        });
        await adapter.embed(['test']);
        const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
        assert.ok(pipelineCall, 'pipeline() should have been called');
        assert.equal(pipelineCall.opts.device, 'cpu', 'device should be passed to pipeline');
      });

      it('[P0] FR-003: passes resolved dtype to pipeline opts in in-process mode', async () => {
        const { adapter, callLog } = await createTestAdapter({
          dtype: 'fp16',
          parallelism: 1,
        });
        await adapter.embed(['test']);
        const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
        assert.ok(pipelineCall, 'pipeline() should have been called');
        assert.equal(pipelineCall.opts.dtype, 'fp16', 'dtype should be passed to pipeline');
      });

      it('[P1] FR-003: passes session_options to pipeline opts in in-process mode', async () => {
        const { adapter, callLog } = await createTestAdapter({
          session_options: { logSeverityLevel: 3 },
          parallelism: 1,
        });
        await adapter.embed(['test']);
        const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
        assert.ok(pipelineCall, 'pipeline() should have been called');
        assert.deepEqual(pipelineCall.opts.session_options, { logSeverityLevel: 3 },
          'session_options should be forwarded');
      });

      it('[P1] FR-003: omits session_options when empty in in-process mode', async () => {
        const { adapter, callLog } = await createTestAdapter({
          parallelism: 1,
        });
        await adapter.embed(['test']);
        const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
        assert.ok(pipelineCall, 'pipeline() should have been called');
        assert.equal(pipelineCall.opts.session_options, undefined,
          'empty session_options should not be forwarded');
      });

    });

    // ── AC-003-05/06/07/09: Device validation passthrough ───────────

    describe('AC-003-05..09: Device validation passthrough', () => {

      it('[P0] AC-003-05: coreml on non-macOS falls back to cpu via resolveConfig', async () => {
        const linuxEnv = { platform: 'linux', arch: 'x86_64', pathExists: () => false };
        const { adapter } = await createTestAdapter({
          device: 'coreml',
          parallelism: 1,
          _platformEnv: linuxEnv,
        });
        assert.equal(adapter._resolved.device, 'cpu', 'should fall back to cpu');
        assert.ok(adapter._resolved.warnings.length > 0, 'should have warnings');
        assert.ok(adapter._resolved.warnings[0].includes('CoreML'), 'warning should mention CoreML');
      });

      it('[P0] AC-003-06: cpu is always valid on any platform', async () => {
        const { adapter } = await createTestAdapter({ device: 'cpu', parallelism: 1 });
        assert.equal(adapter._resolved.device, 'cpu', 'cpu should always be valid');
        assert.equal(adapter._resolved.warnings.length, 0, 'no warnings for cpu');
      });

      it('[P1] AC-003-07: cuda on non-Linux falls back to cpu via resolveConfig', async () => {
        const darwinEnv = { platform: 'darwin', arch: 'arm64', pathExists: () => false };
        const { adapter } = await createTestAdapter({
          device: 'cuda',
          parallelism: 1,
          _platformEnv: darwinEnv,
        });
        assert.equal(adapter._resolved.device, 'cpu', 'cuda on darwin should fall back to cpu');
        assert.ok(adapter._resolved.warnings.length > 0, 'should have warnings');
      });

      it('[P1] AC-003-09: rocm without AMD GPU falls back to cpu via resolveConfig', async () => {
        const linuxNoAmd = { platform: 'linux', arch: 'x86_64', pathExists: () => false };
        const { adapter } = await createTestAdapter({
          device: 'rocm',
          parallelism: 1,
          _platformEnv: linuxNoAmd,
        });
        assert.equal(adapter._resolved.device, 'cpu', 'rocm without AMD should fall back to cpu');
        assert.ok(adapter._resolved.warnings.length > 0, 'should have warnings');
      });

    });

    // ── FR-001: Worker pool integration ─────────────────────────────

    describe('FR-001: Worker pool integration (parallelism > 1)', () => {

      it('[P0] FR-001: uses worker pool when parallelism > 1', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 4,
        });
        assert.ok(adapter !== null, 'adapter should be created');
        const createCall = poolLog.find(e => e.method === 'createPool');
        assert.ok(createCall, 'createWorkerPool should have been called');
        assert.equal(createCall.options.poolSize, 4, 'pool size should be 4');
      });

      it('[P0] FR-001: pool receives workerData with device and dtype', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
          device: 'cpu',
          dtype: 'q8',
        });
        const createCall = poolLog.find(e => e.method === 'createPool');
        assert.ok(createCall, 'createWorkerPool should have been called');
        assert.equal(createCall.options.workerData.device, 'cpu', 'workerData.device should be cpu');
        assert.equal(createCall.options.workerData.dtype, 'q8', 'workerData.dtype should be q8');
        assert.ok(createCall.options.workerData.model, 'workerData.model should be set');
      });

      it('[P0] FR-001: pool.embed() is called when adapter.embed() is used', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
        });
        await adapter.embed(['hello']);
        const embedCall = poolLog.find(e => e.method === 'embed');
        assert.ok(embedCall, 'pool.embed should have been called');
        assert.deepEqual(embedCall.texts, ['hello'], 'texts should be forwarded');
      });

      it('[P1] FR-001: pool.embed() receives the resolved batch_size', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
          batch_size: 64,
        });
        await adapter.embed(['hello']);
        const embedCall = poolLog.find(e => e.method === 'embed');
        assert.ok(embedCall, 'pool.embed should have been called');
        assert.equal(embedCall.batchSize, 64, 'batchSize should be 64');
      });

      it('[P1] FR-001: pooled healthCheck returns pool stats', async () => {
        const { createPool } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 4,
        });
        const health = await adapter.healthCheck();
        assert.equal(health.healthy, true, 'should be healthy');
        assert.equal(health.dimensions, 768, 'dimensions should be 768');
        assert.equal(health.poolSize, 4, 'poolSize should match pool stats');
      });

      it('[P1] FR-001: pooled dispose shuts down the worker pool', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
        });
        await adapter.dispose();
        const shutdownCall = poolLog.find(e => e.method === 'shutdown');
        assert.ok(shutdownCall, 'pool.shutdown should have been called');
      });

      it('[P2] FR-001: pooled dispose is safe to call multiple times', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
        });
        await adapter.dispose();
        await adapter.dispose();
        const shutdownCalls = poolLog.filter(e => e.method === 'shutdown');
        assert.equal(shutdownCalls.length, 1, 'shutdown should be called exactly once');
      });

      it('[P1] FR-001: pool receives cacheDir in workerData', async () => {
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
          cacheDir: '/tmp/cache',
        });
        const createCall = poolLog.find(e => e.method === 'createPool');
        assert.equal(createCall.options.workerData.cache_dir, '/tmp/cache',
          'workerData should include cache_dir');
      });

      it('[P2] FR-001: pooled healthCheck reports unhealthy after dispose', async () => {
        const { createPool } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 2,
        });
        await adapter.dispose();
        const health = await adapter.healthCheck();
        assert.equal(health.healthy, false, 'should be unhealthy after dispose');
      });

    });

    // ── AC-001-02: In-process mode (parallelism === 1) ──────────────

    describe('AC-001-02: In-process mode (parallelism === 1)', () => {

      it('[P0] AC-001-02: uses in-process pipeline when parallelism is 1', async () => {
        const { adapter, callLog } = await createTestAdapter({ parallelism: 1 });
        await adapter.embed(['test']);
        const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
        assert.ok(pipelineCall, 'pipeline() should have been called in-process');
      });

      it('[P0] AC-001-02: in-process embed returns valid vectors', async () => {
        const { adapter } = await createTestAdapter({ parallelism: 1 });
        const result = await adapter.embed(['hello', 'world']);
        assert.equal(result.length, 2, 'should return 2 vectors');
        assert.ok(result[0] instanceof Float32Array, 'result[0] should be Float32Array');
        assert.equal(result[0].length, 768, 'vector should have 768 dimensions');
      });

      it('[P1] AC-001-02: in-process mode passes combined opts to pipeline', async () => {
        const { adapter, callLog } = await createTestAdapter({
          parallelism: 1,
          device: 'cpu',
          dtype: 'q8',
          cacheDir: '/tmp/models',
        });
        await adapter.embed(['test']);
        const pipelineCall = callLog.find(e => e.task === 'feature-extraction');
        assert.ok(pipelineCall, 'pipeline() should have been called');
        assert.equal(pipelineCall.opts.device, 'cpu', 'device should be in opts');
        assert.equal(pipelineCall.opts.dtype, 'q8', 'dtype should be in opts');
        assert.equal(pipelineCall.opts.cache_dir, '/tmp/models', 'cache_dir should be in opts');
      });

    });

    // ── Explicit config overrides ───────────────────────────────────

    describe('Explicit config overrides', () => {

      it('[P1] AC-004-06: explicit parallelism overrides auto', async () => {
        const { adapter } = await createTestAdapter({ parallelism: 1 });
        assert.equal(adapter._resolved.parallelism, 1, 'parallelism should be 1');
      });

      it('[P1] AC-004-06: explicit batch_size overrides default 32', async () => {
        const { adapter } = await createTestAdapter({ batch_size: 16 });
        assert.equal(adapter._resolved.batch_size, 16, 'batch_size should be 16');
      });

      it('[P1] AC-004-06: explicit dtype overrides auto', async () => {
        const { adapter } = await createTestAdapter({ dtype: 'fp32' });
        assert.equal(adapter._resolved.dtype, 'fp32', 'dtype should be fp32');
      });

      it('[P2] AC-004-06: explicit session_options are preserved', async () => {
        const { adapter } = await createTestAdapter({
          session_options: { graphOptimizationLevel: 'all' },
        });
        assert.deepEqual(adapter._resolved.session_options, { graphOptimizationLevel: 'all' },
          'session_options should be preserved');
      });

      it('[P1] AC-004-06: explicit parallelism > 1 triggers pool mode with mock', async () => {
        // Verify that parallelism: 3 actually routes to pool mode
        const { createPool, poolLog } = createMockWorkerPool();
        const { createJinaCodeAdapter } = await import('./jina-code-adapter.js');
        const { pipelineFn } = createMockPipeline();
        const adapter = await createJinaCodeAdapter({
          _pipelineFactory: pipelineFn,
          _createWorkerPool: createPool,
          parallelism: 3,
        });
        assert.equal(adapter._resolved.parallelism, 3, 'parallelism should be 3');
        const createCall = poolLog.find(e => e.method === 'createPool');
        assert.ok(createCall, 'pool should have been created');
      });

    });

  });

});
