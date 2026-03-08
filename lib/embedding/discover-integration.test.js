/**
 * Tests for Discovery-Triggered Embedding Generation
 *
 * REQ-0045 / FR-016 / AC-016-01 through AC-016-08 / M2 Engine
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDiscoverEmbeddings,
  upgradeToModulePartitioned,
  getEmbeddingStats,
  TRIGGER_MODES,
} from './discover-integration.js';

describe('FR-016: Discovery-Triggered Embedding Generation', () => {
  // ── TRIGGER_MODES ─────────────────────────────────────────────────
  describe('TRIGGER_MODES', () => {
    it('exports before, during, and after modes', () => {
      assert.ok(TRIGGER_MODES.includes('before'));
      assert.ok(TRIGGER_MODES.includes('during'));
      assert.ok(TRIGGER_MODES.includes('after'));
    });
  });

  // ── generateDiscoverEmbeddings() ──────────────────────────────────
  describe('generateDiscoverEmbeddings()', () => {
    it('throws when mode is invalid', async () => {
      await assert.rejects(
        () => generateDiscoverEmbeddings({ mode: 'invalid', projectRoot: '/tmp' }),
        /Invalid mode/
      );
    });

    it('throws when projectRoot is missing', async () => {
      await assert.rejects(
        () => generateDiscoverEmbeddings({ mode: 'before' }),
        /projectRoot is required/
      );
    });

    // AC-016-02: "Before" mode — flat embedding of entire codebase
    it('before mode generates flat embedding result', async () => {
      const mockChunker = async () => [
        { id: 'c1', content: 'chunk one', filePath: 'a.js', startLine: 1, endLine: 5, type: 'block', language: 'javascript', tokenCount: 10 },
        { id: 'c2', content: 'chunk two', filePath: 'b.js', startLine: 1, endLine: 3, type: 'block', language: 'javascript', tokenCount: 8 },
      ];

      const mockEmbed = async (texts) => texts.map(() => new Float32Array(768));

      const result = await generateDiscoverEmbeddings({
        mode: 'before',
        projectRoot: '/tmp/test-project',
        config: { provider: 'codebert', dimensions: 768 },
        _chunkFn: mockChunker,
        _embedFn: mockEmbed,
        _listFilesFn: async () => ['a.js', 'b.js'],
      });

      assert.equal(result.mode, 'before');
      assert.equal(result.partitioned, false);
      assert.ok(result.packages.length >= 1);
      assert.ok(result.stats.totalChunks >= 2);
      assert.ok(result.stats.totalFiles >= 2);
    });

    // AC-016-03: "During" mode — runs in parallel with analysis
    it('during mode returns async generator for parallel execution', async () => {
      const mockChunker = async () => [
        { id: 'c1', content: 'chunk', filePath: 'a.js', startLine: 1, endLine: 5, type: 'block', language: 'javascript', tokenCount: 10 },
      ];
      const mockEmbed = async (texts) => texts.map(() => new Float32Array(768));

      const result = await generateDiscoverEmbeddings({
        mode: 'during',
        projectRoot: '/tmp/test-project',
        config: { provider: 'codebert', dimensions: 768 },
        _chunkFn: mockChunker,
        _embedFn: mockEmbed,
        _listFilesFn: async () => ['a.js'],
      });

      assert.equal(result.mode, 'during');
      assert.equal(result.partitioned, false);
    });

    // AC-016-04: "After" mode — uses module boundaries
    it('after mode uses module boundaries for partitioned embeddings', async () => {
      const mockChunker = async () => [
        { id: 'c1', content: 'chunk', filePath: 'a.js', startLine: 1, endLine: 5, type: 'block', language: 'javascript', tokenCount: 10 },
      ];
      const mockEmbed = async (texts) => texts.map(() => new Float32Array(768));

      const modules = [
        { moduleId: 'mod-a', files: ['a.js'] },
        { moduleId: 'mod-b', files: ['b.js'] },
      ];

      const result = await generateDiscoverEmbeddings({
        mode: 'after',
        projectRoot: '/tmp/test-project',
        config: { provider: 'codebert', dimensions: 768 },
        modules,
        _chunkFn: mockChunker,
        _embedFn: mockEmbed,
        _listFilesFn: async () => ['a.js', 'b.js'],
      });

      assert.equal(result.mode, 'after');
      assert.equal(result.partitioned, true);
      assert.ok(result.packages.length >= 1);
    });

    // AC-016-05: User can choose trigger timing or skip
    it('returns skip result when mode is null/undefined', async () => {
      const result = await generateDiscoverEmbeddings({
        mode: null,
        projectRoot: '/tmp/test-project',
        config: { provider: 'codebert' },
      });

      assert.equal(result.skipped, true);
    });

    it('calls onProgress callback during generation', async () => {
      const progressCalls = [];
      const mockChunker = async () => [
        { id: 'c1', content: 'chunk', filePath: 'a.js', startLine: 1, endLine: 5, type: 'block', language: 'javascript', tokenCount: 10 },
      ];
      const mockEmbed = async (texts) => texts.map(() => new Float32Array(768));

      await generateDiscoverEmbeddings({
        mode: 'before',
        projectRoot: '/tmp/test-project',
        config: { provider: 'codebert', dimensions: 768 },
        onProgress: (msg) => progressCalls.push(msg),
        _chunkFn: mockChunker,
        _embedFn: mockEmbed,
        _listFilesFn: async () => ['a.js'],
      });

      assert.ok(progressCalls.length >= 1, 'onProgress should be called');
    });
  });

  // ── upgradeToModulePartitioned() ──────────────────────────────────
  describe('upgradeToModulePartitioned()', () => {
    // AC-016-06: "Before" can upgrade to module-partitioned without full re-gen
    it('re-partitions flat embedding into per-module packages', async () => {
      const flatResult = {
        packages: [{
          moduleId: 'flat-all',
          chunks: [
            { id: 'c1', content: 'chunk one', filePath: 'a.js' },
            { id: 'c2', content: 'chunk two', filePath: 'b.js' },
          ],
          vectors: [new Float32Array(768), new Float32Array(768)],
        }],
      };

      const modules = [
        { moduleId: 'mod-a', files: ['a.js'] },
        { moduleId: 'mod-b', files: ['b.js'] },
      ];

      const result = await upgradeToModulePartitioned(flatResult, modules, {
        provider: 'codebert',
        dimensions: 768,
      });

      assert.ok(result.packages.length >= 2, `Expected >= 2 packages, got ${result.packages.length}`);
      assert.equal(result.partitioned, true);
    });

    it('handles modules with no matching files', async () => {
      const flatResult = {
        packages: [{
          moduleId: 'flat-all',
          chunks: [
            { id: 'c1', content: 'chunk', filePath: 'a.js' },
          ],
          vectors: [new Float32Array(768)],
        }],
      };

      const modules = [
        { moduleId: 'mod-a', files: ['a.js'] },
        { moduleId: 'mod-empty', files: ['z.js'] },
      ];

      const result = await upgradeToModulePartitioned(flatResult, modules, {
        provider: 'codebert',
        dimensions: 768,
      });

      // mod-a should have chunks, mod-empty should be empty or absent
      const modA = result.packages.find(p => p.moduleId === 'mod-a');
      assert.ok(modA, 'mod-a should exist');
      assert.ok(modA.chunks.length >= 1);
    });

    it('throws when flatResult is invalid', async () => {
      await assert.rejects(
        () => upgradeToModulePartitioned(null, [], {}),
        /flatResult is required/
      );
    });
  });

  // ── getEmbeddingStats() ────────────────────────────────────────────
  describe('getEmbeddingStats()', () => {
    // AC-016-08: Discovery report includes embedding stats
    it('returns stats object with required fields', () => {
      const result = {
        packages: [
          { moduleId: 'mod-a', chunks: [{}, {}], vectors: [new Float32Array(1), new Float32Array(1)] },
          { moduleId: 'mod-b', chunks: [{}], vectors: [new Float32Array(1)] },
        ],
        stats: {
          totalFiles: 5,
          timeTakenMs: 1500,
        },
      };

      const stats = getEmbeddingStats(result);

      assert.equal(stats.totalChunks, 3);
      assert.equal(stats.totalFiles, 5);
      assert.equal(stats.packageCount, 2);
      assert.equal(stats.timeTakenMs, 1500);
    });

    it('handles empty result', () => {
      const stats = getEmbeddingStats({ packages: [], stats: {} });

      assert.equal(stats.totalChunks, 0);
      assert.equal(stats.packageCount, 0);
    });

    it('handles null input gracefully', () => {
      const stats = getEmbeddingStats(null);

      assert.equal(stats.totalChunks, 0);
      assert.equal(stats.packageCount, 0);
    });
  });
});
