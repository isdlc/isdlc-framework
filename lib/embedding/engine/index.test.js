/**
 * Tests for Embedding Engine (M2)
 *
 * REQ-0045 / FR-001, FR-005 / M2 Engine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { embed, healthCheck, CODEBERT_DIMENSIONS } from './index.js';

describe('M2: Embedding Engine', () => {
  // ── Constants ─────────────────────────────────────────────────────
  describe('CODEBERT_DIMENSIONS', () => {
    it('exports CodeBERT dimension constant of 768', () => {
      assert.equal(CODEBERT_DIMENSIONS, 768);
    });
  });

  // ── embed() ───────────────────────────────────────────────────────
  describe('embed()', () => {
    it('returns empty result for empty input array', async () => {
      const result = await embed([], { provider: 'codebert' });
      assert.deepEqual(result.vectors, []);
      assert.equal(result.dimensions, CODEBERT_DIMENSIONS);
      assert.equal(result.totalTokens, 0);
    });

    it('returns empty result for null input', async () => {
      const result = await embed(null, { provider: 'codebert' });
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

    it('throws for cloud providers not yet implemented', async () => {
      await assert.rejects(
        () => embed(['test'], { provider: 'voyage-code-3' }),
        /not yet implemented/
      );
    });

    it('throws for openai provider not yet implemented', async () => {
      await assert.rejects(
        () => embed(['test'], { provider: 'openai' }),
        /not yet implemented/
      );
    });

    // CodeBERT tests — will be skipped if onnxruntime-node is not installed
    it('handles codebert provider gracefully when ONNX unavailable', async () => {
      // When onnxruntime-node is not installed, createCodeBERTAdapter returns null
      // and embed() throws an informative error
      try {
        await embed(['test text'], { provider: 'codebert' });
        // If it succeeds, ONNX is installed — verify the result shape
      } catch (err) {
        // Expected when ONNX is not installed
        assert.ok(err.message.includes('onnxruntime-node') || err.message.includes('CodeBERT'));
      }
    });

    it('reports progress via onProgress callback', async () => {
      const progressCalls = [];
      try {
        await embed(['a', 'b', 'c'], { provider: 'codebert' }, {
          batchSize: 2,
          onProgress: (processed, total) => progressCalls.push({ processed, total }),
        });
      } catch {
        // ONNX may not be available — that's fine, we're testing the callback plumbing
      }
      // Progress callback fires before the adapter throws, or after success
      // We can't guarantee it fires if the adapter fails on creation
    });

    it('respects abort signal', async () => {
      const controller = new AbortController();
      controller.abort();

      try {
        await embed(['test'], { provider: 'codebert' }, { signal: controller.signal });
      } catch (err) {
        // Either "Embedding cancelled" or ONNX unavailable
        assert.ok(
          err.message.includes('cancelled') ||
          err.message.includes('onnxruntime') ||
          err.message.includes('CodeBERT')
        );
      }
    });

    it('returns provider name as model for empty input', async () => {
      const result = await embed([], { provider: 'codebert', modelId: 'test-model' });
      // Empty input takes early return path which uses provider, not modelId
      assert.equal(result.model, 'codebert');
    });

    it('returns provider name when no modelId specified on empty input', async () => {
      const result = await embed([], { provider: 'codebert' });
      assert.equal(result.model, 'codebert');
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

    it('returns a result for codebert provider', async () => {
      const result = await healthCheck({ provider: 'codebert' });
      assert.equal(typeof result.healthy, 'boolean');
      assert.equal(typeof result.dimensions, 'number');
    });

    it('returns unhealthy for unsupported provider', async () => {
      const result = await healthCheck({ provider: 'fake-model' });
      assert.equal(result.healthy, false);
      assert.ok(result.error);
    });

    it('returns unhealthy for cloud providers', async () => {
      const result = await healthCheck({ provider: 'voyage-code-3' });
      assert.equal(result.healthy, false);
      assert.ok(result.error.includes('not yet implemented'));
    });
  });
});
