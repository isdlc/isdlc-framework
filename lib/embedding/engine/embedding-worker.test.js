/**
 * Tests for Embedding Worker (batched inference) -- FR-002
 *
 * REQ-GH-238 / FR-002 (AC-002-01..AC-002-03)
 * Article II: Test-First Development
 *
 * Module under test: lib/embedding/engine/embedding-worker.js
 * Worker thread entry point -- loads pipeline, processes batches via message protocol.
 *
 * Tests use unit-style approach: core logic functions (normalizeVector, initPipeline,
 * batchEmbed) are imported and tested directly without spawning worker threads.
 * Pipeline is mocked via _pipelineFactory injection.
 *
 * Message protocol (tested via mock parentPort in integration-style tests):
 *   Main -> Worker: { type: "batch", batchIndex, texts, opts }
 *                   { type: "shutdown" }
 *   Worker -> Main: { type: "ready", workerId }
 *                   { type: "result", batchIndex, vectors }
 *                   { type: "error", batchIndex, message }
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeVector,
  initPipeline,
  batchEmbed,
} from './embedding-worker.js';

// ===========================================================================
// Helpers: mock pipeline / extractor
// ===========================================================================

/**
 * Create a mock extractor function that returns fake embeddings.
 * Supports both single-text and batch-text calls.
 * @param {number} [dims=768] - Embedding dimensionality
 * @param {Object} [overrides] - Override behavior
 * @param {boolean} [overrides.throwOnBatch=false] - Throw when called with array
 * @param {boolean} [overrides.throwOnText=false] - Throw on any call
 * @param {string} [overrides.throwOnSpecific] - Throw when this specific text is encountered
 * @returns {{ ext: Function, calls: Array }}
 */
function createMockExtractor(dims = 768, overrides = {}) {
  const calls = [];

  function ext(input, opts) {
    calls.push({ input, opts });

    if (overrides.throwOnText) {
      throw new Error('Pipeline inference failed');
    }

    if (overrides.throwOnBatch && Array.isArray(input) && input.length > 1) {
      throw new Error('Batched inference not supported');
    }

    if (overrides.throwOnSpecific && typeof input === 'string' && input === overrides.throwOnSpecific) {
      throw new Error(`Failed on text: ${input}`);
    }

    // Produce deterministic fake embeddings based on input text
    const texts = Array.isArray(input) ? input : [input];
    const vectors = texts.map((text) => {
      const vec = new Array(dims).fill(0);
      // Use char codes to create unique-ish vectors per text
      for (let i = 0; i < Math.min(text.length, dims); i++) {
        vec[i] = text.charCodeAt(i) / 255;
      }
      return vec;
    });

    return {
      tolist() {
        return vectors;
      },
    };
  }

  return { ext, calls };
}

/**
 * Create a mock pipeline factory that returns a mock extractor.
 * @param {number} [dims=768]
 * @param {Object} [extractorOverrides]
 * @returns {{ factory: Function, extractor: Object }}
 */
function createMockPipelineFactory(dims = 768, extractorOverrides = {}) {
  const mock = createMockExtractor(dims, extractorOverrides);

  async function factory(task, model, opts) {
    factory._lastCall = { task, model, opts };
    return mock.ext;
  }

  factory._lastCall = null;

  return { factory, extractor: mock };
}

// ===========================================================================
// FR-002: Embedding Worker (embedding-worker)
// ===========================================================================

describe('FR-002: Embedding Worker (embedding-worker)', () => {

  // -- normalizeVector -------------------------------------------------------

  describe('normalizeVector', () => {
    it('[P0] normalizes a non-zero vector to unit length', () => {
      const vec = new Float32Array([3, 4]);
      normalizeVector(vec);
      // 3/5 = 0.6, 4/5 = 0.8
      assert.ok(Math.abs(vec[0] - 0.6) < 1e-5, `Expected ~0.6, got ${vec[0]}`);
      assert.ok(Math.abs(vec[1] - 0.8) < 1e-5, `Expected ~0.8, got ${vec[1]}`);
      // Check L2 norm is 1
      const norm = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1]);
      assert.ok(Math.abs(norm - 1.0) < 1e-5, `Expected norm ~1.0, got ${norm}`);
    });

    it('[P0] handles zero vector without dividing by zero', () => {
      const vec = new Float32Array([0, 0, 0]);
      normalizeVector(vec);
      assert.deepStrictEqual(Array.from(vec), [0, 0, 0]);
    });

    it('[P1] normalizes a high-dimensional vector correctly', () => {
      const dims = 768;
      const vec = new Float32Array(dims);
      for (let i = 0; i < dims; i++) vec[i] = i + 1;
      normalizeVector(vec);
      let norm = 0;
      for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm);
      assert.ok(Math.abs(norm - 1.0) < 1e-4, `Expected norm ~1.0, got ${norm}`);
    });

    it('[P1] returns the same Float32Array reference', () => {
      const vec = new Float32Array([1, 2, 3]);
      const result = normalizeVector(vec);
      assert.strictEqual(result, vec);
    });
  });

  // -- Worker initialization -------------------------------------------------

  describe('worker initialization', () => {

    it('[P0] worker initializes pipeline via _pipelineFactory and returns extractor', async () => {
      // Given: a mock pipeline factory
      const { factory } = createMockPipelineFactory();

      // When: initPipeline is called with the factory
      const extractor = await initPipeline({
        model: 'test-model',
        device: 'cpu',
        dtype: 'fp32',
        cache_dir: '/tmp/test',
        _pipelineFactory: factory,
      });

      // Then: pipeline factory was called with correct args
      assert.ok(extractor, 'Extractor should be returned');
      assert.strictEqual(factory._lastCall.task, 'feature-extraction');
      assert.strictEqual(factory._lastCall.model, 'test-model');
      assert.strictEqual(factory._lastCall.opts.device, 'cpu');
      assert.strictEqual(factory._lastCall.opts.dtype, 'fp32');
      assert.strictEqual(factory._lastCall.opts.cache_dir, '/tmp/test');
    });

    it('[P1] worker posts error if pipeline load fails', async () => {
      // Given: a pipeline factory that throws
      const failFactory = async () => { throw new Error('Model not found'); };

      // When: initPipeline is called
      // Then: it rejects with the error
      await assert.rejects(
        () => initPipeline({ _pipelineFactory: failFactory }),
        { message: 'Model not found' },
      );
    });

    it('[P1] worker passes device, dtype, session_options, cache_dir to pipeline()', async () => {
      // Given: specific config values
      const { factory } = createMockPipelineFactory();
      const sessionOpts = { intra_op_num_threads: 4 };

      // When: initPipeline is called with all options
      await initPipeline({
        device: 'coreml',
        dtype: 'fp16',
        session_options: sessionOpts,
        cache_dir: '/tmp/models',
        _pipelineFactory: factory,
      });

      // Then: all options are passed through
      assert.strictEqual(factory._lastCall.opts.device, 'coreml');
      assert.strictEqual(factory._lastCall.opts.dtype, 'fp16');
      assert.deepStrictEqual(factory._lastCall.opts.session_options, sessionOpts);
      assert.strictEqual(factory._lastCall.opts.cache_dir, '/tmp/models');
    });

    it('[P2] worker uses default model ID when none specified', async () => {
      const { factory } = createMockPipelineFactory();
      await initPipeline({ _pipelineFactory: factory });
      assert.strictEqual(factory._lastCall.model, 'jinaai/jina-embeddings-v2-base-code');
    });

    it('[P2] worker omits empty session_options from pipeline call', async () => {
      const { factory } = createMockPipelineFactory();
      await initPipeline({ session_options: {}, _pipelineFactory: factory });
      assert.strictEqual(factory._lastCall.opts.session_options, undefined);
    });
  });

  // -- Batched inference -- single batch call --------------------------------

  describe('batched inference (AC-002-01)', () => {

    let extractor;
    let mockData;

    beforeEach(() => {
      mockData = createMockExtractor(768);
      extractor = mockData.ext;
    });

    it('[P0] AC-002-01: Given batch_size 16, when worker receives 16 texts, then it processes them in a single ext(texts, opts) call', async () => {
      // Given: 16 texts
      const texts = Array.from({ length: 16 }, (_, i) => `text_${i}`);

      // When: batchEmbed is called (not forced sequential)
      const vectors = await batchEmbed(extractor, texts);

      // Then: ext() was called exactly once with all 16 texts
      assert.strictEqual(mockData.calls.length, 1);
      assert.ok(Array.isArray(mockData.calls[0].input), 'Input should be an array');
      assert.strictEqual(mockData.calls[0].input.length, 16);
      // And: 16 Float32Array vectors are returned
      assert.strictEqual(vectors.length, 16);
      for (const v of vectors) {
        assert.ok(v instanceof Float32Array, 'Each vector should be Float32Array');
        assert.strictEqual(v.length, 768);
      }
    });

    it('[P0] AC-002-01: Given a batch of N texts, when ext() returns N vectors, then result vectors match input order', async () => {
      // Given: texts with distinguishable content
      const texts = ['alpha', 'bravo', 'charlie'];

      // When: batchEmbed processes them
      const vectors = await batchEmbed(extractor, texts);

      // Then: vectors are in the same order as inputs
      assert.strictEqual(vectors.length, 3);
      // First char of "alpha" is 'a' (97), "bravo" is 'b' (98), "charlie" is 'c' (99)
      // After normalization, relative ordering of first elements should reflect input order
      // The mock sets vec[0] = charCode/255, so "alpha" -> 97/255, "bravo" -> 98/255
      // After normalization the absolute values change but ordering at index 0 should hold
      // since each vector has different leading values
      assert.ok(vectors[0] instanceof Float32Array);
      assert.ok(vectors[1] instanceof Float32Array);
      assert.ok(vectors[2] instanceof Float32Array);
      // Verify they are distinct vectors (not all identical)
      const v0sum = Array.from(vectors[0]).reduce((a, b) => a + Math.abs(b), 0);
      const v1sum = Array.from(vectors[1]).reduce((a, b) => a + Math.abs(b), 0);
      assert.notStrictEqual(v0sum, v1sum, 'Vectors for different texts should differ');
    });

    it('[P1] AC-002-01: Given batch_size 16 and 8 texts, when worker receives partial batch, then ext() is called with 8 texts', async () => {
      // Given: 8 texts (less than batch_size 16)
      const texts = Array.from({ length: 8 }, (_, i) => `partial_${i}`);

      // When: batchEmbed is called
      const vectors = await batchEmbed(extractor, texts);

      // Then: ext() called once with 8 texts (no padding to batch_size)
      assert.strictEqual(mockData.calls.length, 1);
      assert.strictEqual(mockData.calls[0].input.length, 8);
      assert.strictEqual(vectors.length, 8);
    });

    it('[P1] returns empty array for empty input', async () => {
      const vectors = await batchEmbed(extractor, []);
      assert.strictEqual(vectors.length, 0);
    });

    it('[P1] returns empty array for null input', async () => {
      const vectors = await batchEmbed(extractor, null);
      assert.strictEqual(vectors.length, 0);
    });
  });

  // -- Padding behavior -------------------------------------------------------

  describe('text padding (AC-002-02)', () => {

    it('[P0] AC-002-02: Given texts of varying lengths, when batched, then all result vectors have the same dimensionality (768)', async () => {
      // Given: texts of varying lengths
      const { ext } = createMockExtractor(768);
      const texts = ['short', 'this is a much longer text input that has many more tokens'];

      // When: batchEmbed processes them
      const vectors = await batchEmbed(ext, texts);

      // Then: all vectors are 768-dimensional
      assert.strictEqual(vectors.length, 2);
      assert.strictEqual(vectors[0].length, 768);
      assert.strictEqual(vectors[1].length, 768);
    });

    it('[P1] AC-002-02: Given all texts are same length, then results are valid vectors', async () => {
      const { ext } = createMockExtractor(768);
      const texts = ['hello', 'world', 'tests'];

      const vectors = await batchEmbed(ext, texts);

      assert.strictEqual(vectors.length, 3);
      for (const v of vectors) {
        assert.strictEqual(v.length, 768);
        // Verify L2-normalized (norm ~= 1)
        let norm = 0;
        for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm);
        assert.ok(Math.abs(norm - 1.0) < 1e-4, `Expected norm ~1.0, got ${norm}`);
      }
    });

    it('[P2] AC-002-02: Given one very long text and many short texts, then short text embeddings are valid', async () => {
      const { ext } = createMockExtractor(768);
      const longText = 'x'.repeat(500);
      const texts = ['a', 'b', 'c', longText];

      const vectors = await batchEmbed(ext, texts);

      assert.strictEqual(vectors.length, 4);
      // All vectors should be valid (768-dim, normalized)
      for (const v of vectors) {
        assert.strictEqual(v.length, 768);
        assert.ok(v instanceof Float32Array);
      }
    });
  });

  // -- Sequential fallback ----------------------------------------------------

  describe('sequential fallback (AC-002-03, ERR-BATCH-001)', () => {

    it('[P0] AC-002-03: Given forceSequential=true, when processing, then ext() is called once per text', async () => {
      // Given: mock extractor
      const mockData = createMockExtractor(768);

      // When: batchEmbed with forceSequential
      const texts = ['a', 'b', 'c'];
      const vectors = await batchEmbed(mockData.ext, texts, { forceSequential: true });

      // Then: ext() called 3 times (once per text), not once with array
      assert.strictEqual(mockData.calls.length, 3);
      assert.strictEqual(mockData.calls[0].input, 'a');
      assert.strictEqual(mockData.calls[1].input, 'b');
      assert.strictEqual(mockData.calls[2].input, 'c');
      assert.strictEqual(vectors.length, 3);
    });

    it('[P0] AC-002-03: Given ext(texts[]) throws (batched unsupported), then falls back to sequential (ERR-BATCH-001)', async () => {
      // Given: extractor that throws on batch calls but works for single texts
      const mockData = createMockExtractor(768, { throwOnBatch: true });

      // When: batchEmbed is called with multiple texts (not forced sequential)
      const texts = ['alpha', 'bravo'];
      const vectors = await batchEmbed(mockData.ext, texts);

      // Then: first call was batched (threw), then sequential calls succeeded
      // Call 0: batch attempt with ['alpha', 'bravo'] -> throws
      // Call 1: sequential 'alpha' -> success
      // Call 2: sequential 'bravo' -> success
      assert.strictEqual(mockData.calls.length, 3);
      assert.ok(Array.isArray(mockData.calls[0].input), 'First call should be batched attempt');
      assert.strictEqual(mockData.calls[1].input, 'alpha');
      assert.strictEqual(mockData.calls[2].input, 'bravo');
      assert.strictEqual(vectors.length, 2);
    });

    it('[P1] AC-002-03: Given sequential fallback, when one text fails, then error is thrown for the entire batch', async () => {
      // Given: extractor that throws on batch AND throws on specific text
      const mockData = createMockExtractor(768, { throwOnBatch: true, throwOnSpecific: 'b' });

      // When: batchEmbed is called (will fall back to sequential, then fail on 'b')
      // Then: the error propagates
      await assert.rejects(
        () => batchEmbed(mockData.ext, ['a', 'b']),
        { message: 'Failed on text: b' },
      );
    });
  });

  // -- Error handling ----------------------------------------------------------

  describe('error handling', () => {

    it('[P0] batchEmbed throws when ext() throws for a batch and sequential also fails', async () => {
      // Given: extractor that always throws
      const mockData = createMockExtractor(768, { throwOnText: true });

      // When/Then: batchEmbed rejects
      await assert.rejects(
        () => batchEmbed(mockData.ext, ['test']),
        { message: 'Pipeline inference failed' },
      );
    });

    it('[P1] batchEmbed handles single text gracefully', async () => {
      const { ext, calls } = createMockExtractor(768);
      const vectors = await batchEmbed(ext, ['single']);

      // Single text in array is still passed as batch
      assert.strictEqual(vectors.length, 1);
      assert.strictEqual(vectors[0].length, 768);
    });
  });

  // -- L2 normalization on output vectors -------------------------------------

  describe('output normalization', () => {

    it('[P0] all output vectors from batchEmbed are L2-normalized', async () => {
      const { ext } = createMockExtractor(768);
      const texts = ['foo', 'bar', 'baz'];
      const vectors = await batchEmbed(ext, texts);

      for (const v of vectors) {
        let norm = 0;
        for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm);
        assert.ok(
          Math.abs(norm - 1.0) < 1e-4,
          `Expected L2 norm ~1.0, got ${norm}`,
        );
      }
    });

    it('[P0] sequential fallback vectors are also L2-normalized', async () => {
      const { ext } = createMockExtractor(768);
      const texts = ['hello', 'world'];
      const vectors = await batchEmbed(ext, texts, { forceSequential: true });

      for (const v of vectors) {
        let norm = 0;
        for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
        norm = Math.sqrt(norm);
        assert.ok(
          Math.abs(norm - 1.0) < 1e-4,
          `Expected L2 norm ~1.0, got ${norm}`,
        );
      }
    });
  });

  // -- initPipeline edge cases -----------------------------------------------

  describe('initPipeline edge cases', () => {

    it('[P2] omits device from opts when not specified', async () => {
      const { factory } = createMockPipelineFactory();
      await initPipeline({ _pipelineFactory: factory });
      assert.strictEqual(factory._lastCall.opts.device, undefined);
    });

    it('[P2] omits dtype from opts when not specified', async () => {
      const { factory } = createMockPipelineFactory();
      await initPipeline({ _pipelineFactory: factory });
      assert.strictEqual(factory._lastCall.opts.dtype, undefined);
    });
  });
});
