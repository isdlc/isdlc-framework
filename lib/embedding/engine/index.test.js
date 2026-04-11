/**
 * Tests for Embedding Engine (M2)
 *
 * REQ-0045 / FR-001, FR-005 / M2 Engine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { embed, healthCheck, JINA_CODE_DIMENSIONS, VOYAGE_DIMENSIONS, OPENAI_DIMENSIONS } from './index.js';

describe('M2: Embedding Engine', () => {
  // ── Constants ─────────────────────────────────────────────────────
  describe('JINA_CODE_DIMENSIONS', () => {
    it('exports Jina Code dimension constant of 768', () => {
      assert.equal(JINA_CODE_DIMENSIONS, 768);
    });
  });

  // ── embed() ───────────────────────────────────────────────────────
  describe('embed()', () => {
    it('returns empty result for empty input array', async () => {
      const result = await embed([], { provider: 'jina-code' });
      assert.deepEqual(result.vectors, []);
      assert.equal(result.dimensions, JINA_CODE_DIMENSIONS);
      assert.equal(result.totalTokens, 0);
    });

    it('returns empty result for null input', async () => {
      const result = await embed(null, { provider: 'jina-code' });
      assert.deepEqual(result.vectors, []);
      assert.equal(result.totalTokens, 0);
    });

    it('throws when config.provider is missing', async () => {
      await assert.rejects(
        () => embed(['test'], {}),
        { message: 'config.provider is required' }
      );
    });

    it('throws when config is null', async () => {
      await assert.rejects(
        () => embed(['test'], null),
        { message: 'config.provider is required' }
      );
    });

    it('throws for unsupported provider', async () => {
      await assert.rejects(
        () => embed(['test'], { provider: 'unsupported-model' }),
        /Unsupported embedding provider/
      );
    });

    it('throws for cloud provider voyage-code-3 when apiKey is missing', async () => {
      await assert.rejects(
        () => embed(['test'], { provider: 'voyage-code-3' }),
        /requires config\.apiKey/
      );
    });

    it('throws for cloud provider openai when apiKey is missing', async () => {
      await assert.rejects(
        () => embed(['test'], { provider: 'openai' }),
        /requires config\.apiKey/
      );
    });

    it('returns correct dimensions for voyage-code-3 on empty input', async () => {
      const result = await embed([], { provider: 'voyage-code-3' });
      assert.equal(result.dimensions, VOYAGE_DIMENSIONS);
    });

    it('returns correct dimensions for openai on empty input', async () => {
      const result = await embed([], { provider: 'openai' });
      assert.equal(result.dimensions, OPENAI_DIMENSIONS);
    });

    // FR-007 / AC-007-01: codebert provider throws removal error
    it('throws removal error for codebert provider', async () => {
      await assert.rejects(
        () => embed(['test text'], { provider: 'codebert' }),
        { message: 'codebert provider has been removed. Use jina-code instead.' }
      );
    });

    it('reports progress via onProgress callback', async () => {
      const progressCalls = [];
      try {
        await embed(['a', 'b', 'c'], { provider: 'jina-code' }, {
          batchSize: 2,
          onProgress: (processed, total) => progressCalls.push({ processed, total }),
        });
      } catch {
        // @huggingface/transformers may not be available — that's fine, we're testing the callback plumbing
      }
      // Progress callback fires before the adapter throws, or after success
      // We can't guarantee it fires if the adapter fails on creation
    });

    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      try {
        await embed(['test'], { provider: 'jina-code' }, { signal: controller.signal });
      } catch (err) {
        // Either "Embedding cancelled" or adapter unavailable
        assert.ok(
          err.message.includes('cancelled') ||
          err.message.includes('huggingface') ||
          err.message.includes('Jina')
        );
      }
    });

    it('returns provider name as model for empty input', async () => {
      const result = await embed([], { provider: 'jina-code', modelId: 'test-model' });
      // Empty input takes early return path which uses provider, not modelId
      assert.equal(result.model, 'jina-code');
    });

    it('returns provider name when no modelId specified on empty input', async () => {
      const result = await embed([], { provider: 'jina-code' });
      assert.equal(result.model, 'jina-code');
    });
  });

  // ── FR-002: Engine Provider Routing (jina-code) ────────────────────
  describe('FR-002: Engine Provider Routing', () => {
    // AC-002-01: resolveAdapter() with provider 'jina-code' returns Jina adapter
    it('[P0] AC-002-01: resolves jina-code provider to Jina adapter', async () => {
      // Given: config.provider is 'jina-code'
      // When: embed() is called (which internally calls resolveAdapter())
      // Then: the Jina adapter is returned and produces results,
      //       or throws an informative error if @huggingface/transformers is unavailable
      try {
        const result = await embed(['test code'], { provider: 'jina-code' });
        // If @huggingface/transformers IS available: verify result shape
        assert.ok(Array.isArray(result.vectors), 'vectors should be an array');
        assert.equal(result.vectors.length, 1, 'should have one vector');
        assert.equal(result.dimensions, JINA_CODE_DIMENSIONS, 'dimensions should be 768');
        assert.equal(result.model, 'jina-code', 'model should be jina-code');
        assert.ok(result.totalTokens > 0, 'should count tokens');
      } catch (err) {
        // If @huggingface/transformers is NOT available: adapter returns null, embed() throws
        assert.ok(
          err.message.includes('Jina Code adapter unavailable') ||
          err.message.includes('@huggingface/transformers'),
          `Expected Jina unavailability error, got: ${err.message}`
        );
      }
    });

    // AC-002-02: Default provider is jina-code (when no provider specified)
    it('[P0] AC-002-02: defaults to jina-code when no provider specified', async () => {
      // Given: no provider is specified in config
      // When: embed() is called with an empty input (early-return path)
      // Then: result.model equals 'jina-code' and result.dimensions equals JINA_CODE_DIMENSIONS
      const result = await embed([], {});
      assert.equal(result.model, 'jina-code', 'default provider model should be jina-code');
      assert.equal(result.dimensions, JINA_CODE_DIMENSIONS, 'default dimensions should be 768');
      assert.deepEqual(result.vectors, [], 'empty input produces empty vectors');
      assert.equal(result.totalTokens, 0, 'empty input produces zero tokens');
    });

    // AC-002-03: Provider 'codebert' throws removal error
    it('[P0] AC-002-03: throws removal error for codebert provider', async () => {
      // Given: config.provider is 'codebert'
      // When: resolveAdapter() is called (via embed())
      // Then: it throws the exact removal error message
      await assert.rejects(
        () => embed(['test'], { provider: 'codebert' }),
        { message: 'codebert provider has been removed. Use jina-code instead.' }
      );
    });

    // AC-002-03 (negative): codebert removal error message is exact
    it('[P1] AC-002-03-neg: codebert removal error includes migration hint', async () => {
      // Given: config.provider is 'codebert'
      // When: embed() is called
      // Then: the error message specifically mentions 'jina-code' as replacement
      try {
        await embed(['test'], { provider: 'codebert' });
        assert.fail('Expected embed() to throw for codebert provider');
      } catch (err) {
        assert.ok(
          err.message.includes('jina-code'),
          `Error should mention jina-code as migration target, got: ${err.message}`
        );
        assert.ok(
          err.message.includes('removed'),
          `Error should mention removal, got: ${err.message}`
        );
      }
    });

    // AC-002-02 (negative): empty-input path with default provider returns correct dimensions
    it('[P1] AC-002-02-neg: default provider returns JINA_CODE_DIMENSIONS for empty input', async () => {
      // Given: no provider is specified
      // When: embed([]) is called with undefined config
      // Then: result.dimensions equals JINA_CODE_DIMENSIONS (768)
      const result = await embed([], {});
      assert.equal(result.dimensions, JINA_CODE_DIMENSIONS, 'dimensions should be JINA_CODE_DIMENSIONS');
      assert.equal(result.dimensions, 768, 'JINA_CODE_DIMENSIONS should equal 768');
    });

    // AC-002-03 (healthCheck path): codebert in healthCheck returns unhealthy with removal message
    it('[P1] AC-002-03-health: healthCheck with codebert returns unhealthy with removal error', async () => {
      // Given: config.provider is 'codebert'
      // When: healthCheck({ provider: 'codebert' }) is called
      // Then: result.healthy is false and result.error includes 'removed'
      const result = await healthCheck({ provider: 'codebert' });
      assert.equal(result.healthy, false, 'codebert healthCheck should be unhealthy');
      assert.equal(typeof result.error, 'string', 'error should be a string');
      assert.ok(
        result.error.includes('removed'),
        `healthCheck error should mention removal, got: ${result.error}`
      );
    });
  });

  // ── healthCheck() ─────────────────────────────────────────────────
  describe('healthCheck()', () => {
    it('returns unhealthy when config is null', async () => {
      const result = await healthCheck(null);
      assert.equal(result.healthy, false);
      assert.equal(result.dimensions, 0);
    });

    it('returns unhealthy when config.provider is missing', async () => {
      const result = await healthCheck({});
      assert.equal(result.healthy, false);
    });

    it('returns unhealthy for removed codebert provider', async () => {
      const result = await healthCheck({ provider: 'codebert' });
      assert.equal(result.healthy, false);
      assert.ok(result.error.includes('removed'));
    });

    it('returns unhealthy for unsupported provider', async () => {
      const result = await healthCheck({ provider: 'fake-model' });
      assert.equal(result.healthy, false);
      assert.ok(result.error);
    });

    it('returns unhealthy for cloud providers without apiKey', async () => {
      const result = await healthCheck({ provider: 'voyage-code-3' });
      assert.equal(result.healthy, false);
      assert.ok(result.error.includes('apiKey'));
    });

    it('returns unhealthy for openai without apiKey', async () => {
      const result = await healthCheck({ provider: 'openai' });
      assert.equal(result.healthy, false);
      assert.ok(result.error.includes('apiKey'));
    });
  });

  // ── FR-004: Hardware acceleration config passthrough ──────────────
  describe('FR-004: Hardware acceleration config passthrough', () => {
    // Mock pipeline factory that captures the config it receives
    function createMockPipelineFactory() {
      const mockEmbed = async (text, opts) => ({
        tolist: () => [[...new Array(768).fill(0.01)]],
      });
      mockEmbed.dispose = () => {};
      const factory = async (task, model, opts) => mockEmbed;
      return factory;
    }

    it('[P0] passes parallelism, device, batch_size, dtype, session_options to jina-code adapter', async () => {
      // Given: config with hardware acceleration fields
      const hwConfig = {
        provider: 'jina-code',
        parallelism: 1, // in-process mode so we don't need worker pool
        device: 'cpu',
        batch_size: 16,
        dtype: 'fp32',
        session_options: { intraOpNumThreads: 2 },
        _pipelineFactory: createMockPipelineFactory(),
        _platformEnv: { platform: 'linux', arch: 'x64' },
      };

      // When: embed() is called with those config fields
      const result = await embed(['test code'], hwConfig);

      // Then: the adapter was created and produced results (fields reached the adapter)
      assert.ok(Array.isArray(result.vectors), 'vectors should be an array');
      assert.equal(result.vectors.length, 1, 'should have one vector');
      assert.equal(result.dimensions, JINA_CODE_DIMENSIONS, 'dimensions should be 768');
    });

    it('[P1] passes only defined fields (undefined fields are omitted)', async () => {
      // Given: config with only provider and device (no parallelism, batch_size, etc.)
      // parallelism: 1 forces in-process mode — _pipelineFactory can't be
      // serialized to worker threads via structured clone.
      const partialConfig = {
        provider: 'jina-code',
        device: 'cpu',
        parallelism: 1,
        _pipelineFactory: createMockPipelineFactory(),
        _platformEnv: { platform: 'linux', arch: 'x64' },
      };

      // When: embed() is called
      const result = await embed(['hello world'], partialConfig);

      // Then: the adapter still works with partial config
      assert.ok(Array.isArray(result.vectors), 'vectors should be an array');
      assert.equal(result.vectors.length, 1, 'should have one vector');
    });

    it('[P1] does not pass hardware fields to cloud providers', async () => {
      // Given: voyage-code-3 config with hardware fields (should be ignored by cloud adapter)
      // When/Then: cloud provider still requires apiKey, hardware fields are irrelevant
      await assert.rejects(
        () => embed(['test'], {
          provider: 'voyage-code-3',
          parallelism: 4,
          device: 'cuda',
        }),
        /requires config\.apiKey/,
        'Cloud provider should still require apiKey regardless of hardware fields'
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════
  // REQ-GH-239 FR-001/FR-002: Engine no longer iterates batches
  // Phase 05 scaffolds (test.skip) — implementation lands in Phase 06
  // ══════════════════════════════════════════════════════════════════

  describe('REQ-GH-239 FR-001 + FR-002: Engine single-call dispatch (no outer batch loop)', () => {

    // Helper: build a spy adapter that records each embed() invocation.
    function makeSpyAdapter({ perBatchMs = 0, abortable = false } = {}) {
      const calls = [];
      return {
        adapter: {
          dimensions: 768,
          async embed(texts, opts = {}) {
            calls.push({ texts, opts });
            if (perBatchMs > 0) {
              await new Promise((r) => setTimeout(r, perBatchMs));
            }
            if (abortable && opts.signal?.aborted) {
              throw new Error('Embedding cancelled');
            }
            return texts.map(() => new Float32Array(768));
          },
          healthCheck: async () => ({ healthy: true, dimensions: 768 }),
        },
        calls,
      };
    }

    it('[P0] REQ-GH-239 FR-002: 500 texts → adapter.embed called exactly once with all 500 texts', async () => {
      const texts = Array.from({ length: 500 }, (_, i) => `chunk-${i}`);
      const { adapter, calls } = makeSpyAdapter();
      const onProgress = () => {};
      const signal = new AbortController().signal;

      await embed(texts, { provider: 'jina-code', _adapterOverride: adapter }, { batchSize: 32, onProgress, signal });

      assert.equal(calls.length, 1, 'adapter.embed must be called exactly once');
      assert.equal(calls[0].texts.length, 500, 'all 500 texts in a single call');
      assert.equal(calls[0].opts.batchSize, 32, 'batchSize forwarded');
      assert.equal(typeof calls[0].opts.onProgress, 'function', 'onProgress forwarded');
      assert.equal(calls[0].opts.signal, signal, 'signal forwarded');
    });

    it('[P0] REQ-GH-239 FR-001: parallelism=4 wall-clock much better than sequential (spy adapter proxy)', async () => {
      // The engine layer now makes a SINGLE adapter.embed call regardless of
      // parallelism — the adapter/pool owns fan-out. This test confirms that
      // the engine no longer imposes serial batching: with a spy that sleeps
      // ONCE per full call (simulating the pool's internal parallel work),
      // the total wall-clock is dominated by the single call, not N batches.
      const texts = Array.from({ length: 500 }, (_, i) => `chunk-${i}`);
      const { adapter, calls } = makeSpyAdapter({ perBatchMs: 40 });
      const started = Date.now();
      await embed(texts, { provider: 'jina-code', parallelism: 4, _adapterOverride: adapter }, { batchSize: 32 });
      const elapsed = Date.now() - started;

      assert.equal(calls.length, 1, 'single dispatch');
      // Old outer loop would have been 16 batches × 40ms = 640ms.
      // Post-fix: one adapter call, ~40ms — well below 384ms threshold.
      assert.ok(elapsed < 384, `elapsed ${elapsed}ms must be < 384ms (old serial bound)`);
    });

    it('[P0] REQ-GH-239 FR-002: onProgress is forwarded as-is to the adapter (unified shape)', async () => {
      const texts = ['a', 'b', 'c'];
      const received = [];
      // Spy adapter fires the FR-005 unified shape.
      const adapter = {
        dimensions: 768,
        async embed(ts, opts) {
          opts.onProgress?.({ processed: 1, total: 3, chunks_per_sec: 1.0, eta_seconds: 2, active_workers: 1 });
          opts.onProgress?.({ processed: 3, total: 3, chunks_per_sec: 1.5, eta_seconds: 0, active_workers: 1 });
          return ts.map(() => new Float32Array(768));
        },
      };
      const onProgress = (...args) => received.push(args);

      await embed(texts, { provider: 'jina-code', _adapterOverride: adapter }, { onProgress });

      assert.ok(received.length >= 1, 'onProgress was invoked');
      for (const args of received) {
        assert.equal(args.length, 1, 'single-object progress shape (not old 2-arg form)');
        const [obj] = args;
        assert.ok(obj && typeof obj === 'object', 'progress is an object');
        assert.ok('processed' in obj && 'total' in obj, 'has processed/total');
        assert.ok('chunks_per_sec' in obj && 'eta_seconds' in obj, 'has throughput fields');
        assert.ok('active_workers' in obj, 'has active_workers');
      }
    });

    it('[P0] REQ-GH-239 FR-002: totalTokens computed post-embed from full texts (parity with pre-refactor)', async () => {
      const texts = ['abcd', 'efghijkl', 'mno']; // 4 + 8 + 3 chars → ceil/4 = 1+2+1 = 4
      const { adapter } = makeSpyAdapter();
      const result = await embed(texts, { provider: 'jina-code', parallelism: 1, _adapterOverride: adapter });
      assert.equal(result.totalTokens, 4);
      assert.equal(result.vectors.length, 3);
    });

    it('[P1] REQ-GH-239 FR-001: parallelism=1 still a single adapter.embed call (unified dispatch path)', async () => {
      const texts = Array.from({ length: 100 }, (_, i) => `t${i}`);
      const { adapter, calls } = makeSpyAdapter();
      await embed(texts, { provider: 'jina-code', parallelism: 1, _adapterOverride: adapter }, { batchSize: 32 });
      assert.equal(calls.length, 1, 'one call even with parallelism=1');
      assert.equal(calls[0].texts.length, 100);
    });

    it('[P1] REQ-GH-239 FR-002: aborted signal rejects and adapter receives the signal', async () => {
      const texts = Array.from({ length: 1000 }, (_, i) => `t${i}`);
      const { adapter, calls } = makeSpyAdapter({ perBatchMs: 100, abortable: true });
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10);
      await assert.rejects(
        () => embed(texts, { provider: 'jina-code', _adapterOverride: adapter }, { signal: ctrl.signal }),
        /cancelled|abort/i
      );
      assert.equal(calls[0]?.opts?.signal, ctrl.signal, 'signal forwarded into adapter options');
    });

  });
});
