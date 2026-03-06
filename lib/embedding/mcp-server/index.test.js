/**
 * Tests for MCP Server (FR-003, FR-004, FR-008, M7)
 *
 * REQ-0045 / FR-003, FR-004, FR-008 / M7 MCP Server
 * Covers: store-manager, orchestrator, server, package security, cosine similarity
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { buildPackage } from '../package/builder.js';
import { encrypt } from '../package/encryption.js';
import { loadRegistry } from '../registry/index.js';
import { cosineSimilarity, findNearest, createStoreManager } from './store-manager.js';
import { classifyQuery, mergeResults, applyTokenBudget, createOrchestrator, hashToVector } from './orchestrator.js';
import { createServer } from './server.js';

// ── Test data helpers ─────────────────────────────────────────
function sampleChunks(n = 5) {
  return Array.from({ length: n }, (_, i) => ({
    id: `chunk-${i}`,
    content: `function example${i}() { return ${i}; }`,
    filePath: `src/example${i}.js`,
    startLine: i * 10 + 1,
    endLine: i * 10 + 5,
    type: 'function',
    language: 'javascript',
    tokenCount: 20,
    signatures: [],
  }));
}

function sampleVectors(n = 5, dims = 4) {
  return Array.from({ length: n }, (_, i) => {
    const v = new Float32Array(dims);
    // Deterministic — each vector has a 1.0 in a different position
    v[i % dims] = 1.0;
    return v;
  });
}

const sampleMeta = {
  moduleId: 'test-mod',
  version: '1.0.0',
  model: 'codebert',
  dimensions: 4,
};

async function buildTestPackage(tempDir, moduleId, chunks, vectors, options = {}) {
  const outDir = join(tempDir, moduleId);
  const dims = vectors[0]?.length || 4;
  const buildOpts = {
    outputDir: outDir,
    meta: {
      moduleId,
      version: options.version || '1.0.0',
      model: 'codebert',
      dimensions: dims,
    },
    chunks,
    vectors,
    tier: options.tier || 'full',
  };
  if (options.encryptionKey) {
    buildOpts.encryption = { key: options.encryptionKey };
  }
  const pkgPath = await buildPackage(buildOpts);
  return pkgPath;
}

// Pre-computed cosine similarity test pairs
const vecA = new Float32Array([1, 0, 0, 0]); // unit vector x
const vecB = new Float32Array([0, 1, 0, 0]); // orthogonal → similarity 0
const vecC = new Float32Array([1, 0, 0, 0]); // identical → similarity 1.0
const vecD = new Float32Array([0.6, 0.8, 0, 0]); // angle → similarity 0.6

// ══════════════════════════════════════════════════════════════
describe('M7: MCP Server — Store Manager', () => {
  let tempDir;

  before(() => { tempDir = createTempDir(); });
  after(() => { cleanupTempDir(tempDir); });

  // ── loadPackage ────────────────────────────────────────────
  describe('loadPackage()', () => {
    it('loads .emb file and exposes vectors and metadata (AC-003-01)', async () => {
      const chunks = sampleChunks(3);
      const vectors = sampleVectors(3, 4);
      const pkgPath = await buildTestPackage(tempDir, 'load-test', chunks, vectors);

      const sm = createStoreManager();
      const handle = await sm.loadPackage(pkgPath);

      assert.equal(handle.moduleId, 'load-test');
      assert.equal(handle.vectors.length, 3);
      assert.equal(handle.dimensions, 4);
      assert.equal(handle.metadata.length, 3);
    });

    it('makes store accessible via listStores() after loading (AC-003-01)', async () => {
      const chunks = sampleChunks(2);
      const vectors = sampleVectors(2, 4);
      const pkgPath = await buildTestPackage(tempDir, 'list-load', chunks, vectors);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);

      const stores = sm.listStores();
      assert.equal(stores.length, 1);
      assert.equal(stores[0].moduleId, 'list-load');
      assert.equal(stores[0].chunkCount, 2);
    });

    it('loads encrypted package with valid key (AC-008-01)', async () => {
      const chunks = sampleChunks(3);
      const vectors = sampleVectors(3, 4);
      const key = randomBytes(32);
      const pkgPath = await buildTestPackage(tempDir, 'enc-load', chunks, vectors, { encryptionKey: key });

      const sm = createStoreManager();
      const handle = await sm.loadPackage(pkgPath, { decryptionKey: key });

      assert.equal(handle.moduleId, 'enc-load');
      assert.equal(handle.vectors.length, 3);
    });

    it('fails with clear error on wrong decryption key (AC-008-03)', async () => {
      const chunks = sampleChunks(2);
      const vectors = sampleVectors(2, 4);
      const key = randomBytes(32);
      const wrongKey = randomBytes(32);
      const pkgPath = await buildTestPackage(tempDir, 'wrong-key', chunks, vectors, { encryptionKey: key });

      const sm = createStoreManager();
      await assert.rejects(
        () => sm.loadPackage(pkgPath, { decryptionKey: wrongKey }),
        (err) => err instanceof Error
      );
    });

    it('fails with clear error on non-existent path', async () => {
      const sm = createStoreManager();
      await assert.rejects(
        () => sm.loadPackage(join(tempDir, 'nonexistent.emb')),
        (err) => err instanceof Error
      );
    });
  });

  // ── unloadPackage ─────────────────────────────────────────
  describe('unloadPackage()', () => {
    it('removes store from memory (AC-003-05)', async () => {
      const chunks = sampleChunks(2);
      const vectors = sampleVectors(2, 4);
      const pkgPath = await buildTestPackage(tempDir, 'unload-test', chunks, vectors);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);
      assert.equal(sm.listStores().length, 1);

      sm.unloadPackage('unload-test');
      assert.equal(sm.listStores().length, 0);
    });
  });

  // ── reloadPackage ─────────────────────────────────────────
  describe('reloadPackage()', () => {
    it('hot-reloads without restart (AC-003-05)', async () => {
      const chunks1 = sampleChunks(2);
      const vectors1 = sampleVectors(2, 4);
      const pkgPath1 = await buildTestPackage(tempDir, 'reload-mod', chunks1, vectors1);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath1);
      assert.equal(sm.listStores()[0].chunkCount, 2);

      // Build new version with more chunks
      const chunks2 = sampleChunks(5);
      const vectors2 = sampleVectors(5, 4);
      const pkgPath2 = await buildTestPackage(tempDir, 'reload-mod-v2', chunks2, vectors2, { version: '2.0.0' });

      await sm.reloadPackage('reload-mod', pkgPath2);
      const stores = sm.listStores();
      assert.equal(stores.length, 1);
      assert.equal(stores[0].chunkCount, 5);
    });

    it('preserves other stores during reload (AC-003-05)', async () => {
      const sm = createStoreManager();

      const p1 = await buildTestPackage(tempDir, 'keep-me', sampleChunks(2), sampleVectors(2, 4));
      const p2 = await buildTestPackage(tempDir, 'reload-me', sampleChunks(3), sampleVectors(3, 4));
      await sm.loadPackage(p1);
      await sm.loadPackage(p2);
      assert.equal(sm.listStores().length, 2);

      const p3 = await buildTestPackage(tempDir, 'reload-me-v2', sampleChunks(4), sampleVectors(4, 4));
      await sm.reloadPackage('reload-me', p3);
      assert.equal(sm.listStores().length, 2);
      assert.ok(sm.getStore('keep-me'));
    });
  });

  // ── listStores ────────────────────────────────────────────
  describe('listStores()', () => {
    it('returns module info including encryption flag (AC-003-04)', async () => {
      const key = randomBytes(32);
      const pkgPath = await buildTestPackage(tempDir, 'info-enc', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: key });

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath, { decryptionKey: key });

      const stores = sm.listStores();
      assert.equal(stores.length, 1);
      assert.equal(stores[0].moduleId, 'info-enc');
      assert.equal(stores[0].encrypted, true);
      assert.equal(stores[0].dimensions, 4);
    });

    it('returns empty array when no stores loaded', () => {
      const sm = createStoreManager();
      assert.deepEqual(sm.listStores(), []);
    });
  });

  // ── search ────────────────────────────────────────────────
  describe('search()', () => {
    it('returns nearest neighbors by cosine similarity (AC-003-02)', async () => {
      const chunks = sampleChunks(4);
      const vectors = [
        new Float32Array([1, 0, 0, 0]),
        new Float32Array([0, 1, 0, 0]),
        new Float32Array([0, 0, 1, 0]),
        new Float32Array([0.9, 0.1, 0, 0]),
      ];
      const pkgPath = await buildTestPackage(tempDir, 'search-test', chunks, vectors);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);

      const query = new Float32Array([1, 0, 0, 0]);
      const results = sm.search('search-test', query, 2);

      assert.equal(results.length, 2);
      assert.ok(results[0].score >= results[1].score);
    });

    it('returns results with chunk metadata (AC-003-02)', async () => {
      const chunks = sampleChunks(2);
      const vectors = sampleVectors(2, 4);
      const pkgPath = await buildTestPackage(tempDir, 'meta-search', chunks, vectors);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);

      const query = new Float32Array([1, 0, 0, 0]);
      const results = sm.search('meta-search', query, 2);

      assert.ok(results.length > 0);
      assert.ok(results[0].chunk);
      assert.ok(results[0].chunk.filePath);
      assert.ok(typeof results[0].score === 'number');
      assert.ok(results[0].chunkId);
    });

    it('returns top-k results limited by k parameter (AC-003-02)', async () => {
      const chunks = sampleChunks(5);
      const vectors = sampleVectors(5, 4);
      const pkgPath = await buildTestPackage(tempDir, 'topk-test', chunks, vectors);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);

      const query = new Float32Array([1, 0, 0, 0]);
      const results = sm.search('topk-test', query, 2);
      assert.equal(results.length, 2);
    });

    it('returns empty for unknown module ID', () => {
      const sm = createStoreManager();
      const results = sm.search('nonexistent', new Float32Array([1, 0, 0, 0]), 5);
      assert.deepEqual(results, []);
    });

    it('returns empty for empty index', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'empty-idx', [], []);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);

      const results = sm.search('empty-idx', new Float32Array([1, 0, 0, 0]), 5);
      assert.deepEqual(results, []);
    });
  });

  // ── Key rotation ──────────────────────────────────────────
  describe('key rotation (AC-008-04)', () => {
    it('search works after re-encrypting package with new key', async () => {
      const chunks = sampleChunks(3);
      const vectors = [
        new Float32Array([1, 0, 0, 0]),
        new Float32Array([0, 1, 0, 0]),
        new Float32Array([0, 0, 1, 0]),
      ];
      const oldKey = randomBytes(32);
      const newKey = randomBytes(32);

      // Build with old key — same moduleId for both versions
      const pkgPath1 = await buildTestPackage(tempDir, 'rotate-mod', chunks, vectors, { encryptionKey: oldKey });

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath1, { decryptionKey: oldKey });

      // Build with new key (re-encrypt) — use same moduleId
      const pkgPath2 = await buildTestPackage(tempDir, 'rotate-mod', chunks, vectors, { encryptionKey: newKey, version: '2.0.0' });

      // Reload with new key
      await sm.reloadPackage('rotate-mod', pkgPath2, { decryptionKey: newKey });

      const query = new Float32Array([1, 0, 0, 0]);
      const results = sm.search('rotate-mod', query, 2);
      assert.ok(results.length > 0);
      assert.ok(results[0].score > 0);
    });

    it('other stores unaffected during key rotation', async () => {
      const sm = createStoreManager();
      const key = randomBytes(32);

      const p1 = await buildTestPackage(tempDir, 'stable-mod', sampleChunks(2), sampleVectors(2, 4));
      const p2 = await buildTestPackage(tempDir, 'rotating-mod', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: key });

      await sm.loadPackage(p1);
      await sm.loadPackage(p2, { decryptionKey: key });

      const newKey = randomBytes(32);
      const p3 = await buildTestPackage(tempDir, 'rotating-mod-v2', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: newKey });
      await sm.reloadPackage('rotating-mod', p3, { decryptionKey: newKey });

      // Stable store still works
      const results = sm.search('stable-mod', new Float32Array([1, 0, 0, 0]), 2);
      assert.ok(results.length > 0);
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe('M7: MCP Server — Cosine Similarity', () => {
  describe('cosineSimilarity()', () => {
    it('returns 1.0 for identical vectors (AC-004-03)', () => {
      const score = cosineSimilarity(vecA, vecC);
      assert.ok(Math.abs(score - 1.0) < 0.001);
    });

    it('returns 0 for orthogonal vectors (AC-004-03)', () => {
      const score = cosineSimilarity(vecA, vecB);
      assert.ok(Math.abs(score) < 0.001);
    });

    it('returns expected score for known angle', () => {
      const score = cosineSimilarity(vecA, vecD);
      assert.ok(Math.abs(score - 0.6) < 0.01);
    });

    it('returns 0 for zero vector', () => {
      const zero = new Float32Array([0, 0, 0, 0]);
      assert.equal(cosineSimilarity(vecA, zero), 0);
    });

    it('returns 0 for empty vectors', () => {
      assert.equal(cosineSimilarity(new Float32Array([]), new Float32Array([])), 0);
    });

    it('returns 0 for mismatched lengths', () => {
      const a = new Float32Array([1, 0]);
      const b = new Float32Array([1, 0, 0]);
      assert.equal(cosineSimilarity(a, b), 0);
    });
  });

  describe('findNearest()', () => {
    it('returns top-k by similarity (AC-003-02)', () => {
      const corpus = [vecA, vecB, vecD]; // vecA is identical to query, vecD is close
      const results = findNearest(vecA, corpus, 2);

      assert.equal(results.length, 2);
      assert.equal(results[0].index, 0); // vecA → highest similarity
      assert.ok(results[0].score > results[1].score);
    });

    it('returns empty for empty corpus', () => {
      assert.deepEqual(findNearest(vecA, [], 5), []);
    });

    it('returns empty for k=0', () => {
      assert.deepEqual(findNearest(vecA, [vecB], 0), []);
    });

    it('limits results to k even when corpus is larger', () => {
      const corpus = [vecA, vecB, vecD, new Float32Array([0, 0, 0, 1])];
      const results = findNearest(vecA, corpus, 1);
      assert.equal(results.length, 1);
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe('M7: MCP Server — Query Orchestrator', () => {
  // ── classifyQuery ─────────────────────────────────────────
  describe('classifyQuery()', () => {
    it('returns moduleFilter when provided (AC-004-01)', () => {
      const result = classifyQuery('test query', null, ['mod-a', 'mod-b'], ['mod-a']);
      assert.deepEqual(result, ['mod-a']);
    });

    it('filters moduleFilter to loaded modules only (AC-004-01)', () => {
      const result = classifyQuery('test query', null, ['mod-a'], ['mod-a', 'mod-c']);
      assert.deepEqual(result, ['mod-a']);
    });

    it('falls back to all loaded stores when no hints match (AC-004-01)', () => {
      const result = classifyQuery('random query', null, ['mod-a', 'mod-b']);
      assert.deepEqual(result, ['mod-a', 'mod-b']);
    });

    it('returns empty for empty query', () => {
      assert.deepEqual(classifyQuery('', null, ['mod-a']), []);
    });

    it('returns empty for no loaded modules', () => {
      assert.deepEqual(classifyQuery('test', null, []), []);
    });

    it('uses registry routing hints when available (AC-004-01)', () => {
      const mockRegistry = {
        getRoutingHints: (query) => query.includes('auth') ? ['auth-mod'] : [],
      };
      const result = classifyQuery('auth login', mockRegistry, ['auth-mod', 'other-mod']);
      assert.deepEqual(result, ['auth-mod']);
    });
  });

  // ── mergeResults ──────────────────────────────────────────
  describe('mergeResults()', () => {
    it('merges and re-ranks results by score (AC-004-03)', () => {
      const set1 = [
        { moduleId: 'a', chunkId: 'c1', score: 0.9, chunk: {} },
        { moduleId: 'a', chunkId: 'c2', score: 0.5, chunk: {} },
      ];
      const set2 = [
        { moduleId: 'b', chunkId: 'c3', score: 0.8, chunk: {} },
      ];
      const merged = mergeResults([set1, set2]);
      assert.equal(merged.length, 3);
      assert.equal(merged[0].score, 0.9);
      assert.equal(merged[1].score, 0.8);
      assert.equal(merged[2].score, 0.5);
    });

    it('deduplicates by moduleId:chunkId (AC-004-03)', () => {
      const set1 = [{ moduleId: 'a', chunkId: 'c1', score: 0.9, chunk: {} }];
      const set2 = [{ moduleId: 'a', chunkId: 'c1', score: 0.7, chunk: {} }];
      const merged = mergeResults([set1, set2]);
      assert.equal(merged.length, 1);
      assert.equal(merged[0].score, 0.9); // First occurrence wins
    });

    it('handles empty result sets', () => {
      assert.deepEqual(mergeResults([]), []);
      assert.deepEqual(mergeResults([[], []]), []);
    });
  });

  // ── applyTokenBudget ─────────────────────────────────────
  describe('applyTokenBudget()', () => {
    it('truncates results to stay within budget (AC-004-05)', () => {
      const hits = [
        { chunk: { content: 'a'.repeat(100) }, score: 0.9 }, // 25 tokens
        { chunk: { content: 'b'.repeat(100) }, score: 0.8 }, // 25 tokens
        { chunk: { content: 'c'.repeat(100) }, score: 0.7 }, // 25 tokens
      ];
      const result = applyTokenBudget(hits, 50);
      assert.equal(result.length, 2);
    });

    it('returns all results when budget is sufficient (AC-004-05)', () => {
      const hits = [
        { chunk: { content: 'short' }, score: 0.9 },
        { chunk: { content: 'text' }, score: 0.8 },
      ];
      const result = applyTokenBudget(hits, 5000);
      assert.equal(result.length, 2);
    });

    it('returns empty when budget is 0 (AC-004-05)', () => {
      const hits = [{ chunk: { content: 'text' }, score: 0.9 }];
      assert.deepEqual(applyTokenBudget(hits, 0), []);
    });

    it('returns all results when budget is Infinity', () => {
      const hits = [
        { chunk: { content: 'a'.repeat(10000) }, score: 0.9 },
        { chunk: { content: 'b'.repeat(10000) }, score: 0.8 },
      ];
      const result = applyTokenBudget(hits, Infinity);
      assert.equal(result.length, 2);
    });
  });

  // ── orchestrate (integration) ─────────────────────────────
  describe('orchestrate()', () => {
    let tempDir;
    before(() => { tempDir = createTempDir(); });
    after(() => { cleanupTempDir(tempDir); });

    it('returns ranked hits from a single store (AC-004-01)', async () => {
      const chunks = sampleChunks(3);
      const vectors = [
        new Float32Array([1, 0, 0, 0]),
        new Float32Array([0, 1, 0, 0]),
        new Float32Array([0.9, 0.1, 0, 0]),
      ];
      const pkgPath = await buildTestPackage(tempDir, 'orch-single', chunks, vectors);

      const sm = createStoreManager();
      await sm.loadPackage(pkgPath);

      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query');

      assert.ok(result.hits.length > 0);
      assert.ok(result.modulesSearched.includes('orch-single'));
      assert.deepEqual(result.modulesTimedOut, []);
      assert.ok(result.totalLatencyMs >= 0);
    });

    it('fans out to multiple stores (AC-004-02)', async () => {
      const sm = createStoreManager();

      const p1 = await buildTestPackage(tempDir, 'fanout-a', sampleChunks(2), sampleVectors(2, 4));
      const p2 = await buildTestPackage(tempDir, 'fanout-b', sampleChunks(2), sampleVectors(2, 4));
      await sm.loadPackage(p1);
      await sm.loadPackage(p2);

      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query');

      assert.ok(result.modulesSearched.includes('fanout-a'));
      assert.ok(result.modulesSearched.includes('fanout-b'));
      assert.equal(result.modulesSearched.length, 2);
    });

    it('merges results across stores by score (AC-004-03)', async () => {
      const sm = createStoreManager();

      const p1 = await buildTestPackage(tempDir, 'merge-a',
        sampleChunks(2), [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0])]);
      const p2 = await buildTestPackage(tempDir, 'merge-b',
        sampleChunks(2), [new Float32Array([0.9, 0.1, 0, 0]), new Float32Array([0, 0, 1, 0])]);
      await sm.loadPackage(p1);
      await sm.loadPackage(p2);

      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query');

      // Results should be sorted by score descending
      for (let i = 1; i < result.hits.length; i++) {
        assert.ok(result.hits[i - 1].score >= result.hits[i].score);
      }
    });

    it('applies token budget (AC-004-05)', async () => {
      const sm = createStoreManager();
      const chunks = sampleChunks(5);
      const vectors = sampleVectors(5, 4);
      const pkgPath = await buildTestPackage(tempDir, 'budget-test', chunks, vectors);
      await sm.loadPackage(pkgPath);

      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query', { tokenBudget: 10 });

      // With budget of 10 tokens (~40 chars), should get fewer results
      assert.ok(result.hits.length < 5);
    });

    it('returns empty for empty query', async () => {
      const sm = createStoreManager();
      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('');

      assert.deepEqual(result.hits, []);
      assert.deepEqual(result.modulesSearched, []);
    });

    it('returns empty when no stores loaded', async () => {
      const sm = createStoreManager();
      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query');

      assert.deepEqual(result.hits, []);
    });

    it('respects maxResults option', async () => {
      const sm = createStoreManager();
      const pkgPath = await buildTestPackage(tempDir, 'maxres-test', sampleChunks(5), sampleVectors(5, 4));
      await sm.loadPackage(pkgPath);

      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query', { maxResults: 2 });

      assert.ok(result.hits.length <= 2);
    });

    it('respects moduleFilter option (AC-004-01)', async () => {
      const sm = createStoreManager();
      const p1 = await buildTestPackage(tempDir, 'filter-a', sampleChunks(2), sampleVectors(2, 4));
      const p2 = await buildTestPackage(tempDir, 'filter-b', sampleChunks(2), sampleVectors(2, 4));
      await sm.loadPackage(p1);
      await sm.loadPackage(p2);

      const orch = createOrchestrator(sm);
      const result = await orch.orchestrate('test query', { moduleFilter: ['filter-a'] });

      assert.deepEqual(result.modulesSearched, ['filter-a']);
    });
  });

  // ── hashToVector ──────────────────────────────────────────
  describe('hashToVector()', () => {
    it('produces deterministic output', () => {
      const v1 = hashToVector('hello', 4);
      const v2 = hashToVector('hello', 4);
      assert.deepEqual(v1, v2);
    });

    it('produces normalized vector', () => {
      const v = hashToVector('test query', 4);
      let norm = 0;
      for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
      assert.ok(Math.abs(Math.sqrt(norm) - 1.0) < 0.001);
    });

    it('produces different vectors for different text', () => {
      const v1 = hashToVector('hello', 4);
      const v2 = hashToVector('world', 4);
      let same = true;
      for (let i = 0; i < v1.length; i++) {
        if (Math.abs(v1[i] - v2[i]) > 0.001) { same = false; break; }
      }
      assert.ok(!same);
    });
  });
});

// ══════════════════════════════════════════════════════════════
describe('M7: MCP Server — Server', () => {
  let tempDir;

  before(() => { tempDir = createTempDir(); });
  after(() => { cleanupTempDir(tempDir); });

  // ── createServer ──────────────────────────────────────────
  describe('createServer()', () => {
    it('initializes with config and exposes tool definitions (AC-003-01)', () => {
      const server = createServer();
      const tools = server.getToolDefinitions();

      assert.equal(tools.length, 3);
      const names = tools.map(t => t.name);
      assert.ok(names.includes('semantic_search'));
      assert.ok(names.includes('list_modules'));
      assert.ok(names.includes('module_info'));
    });

    it('initializes and loads packages on startup (AC-003-01)', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'srv-init', sampleChunks(2), sampleVectors(2, 4));

      const server = createServer({ packagePaths: [pkgPath] });
      const result = await server.initialize();

      assert.equal(result.loaded, 1);
      assert.deepEqual(result.errors, []);
    });
  });

  // ── semantic_search tool ──────────────────────────────────
  describe('semantic_search tool', () => {
    it('delegates to orchestrator and returns hits (AC-003-02)', async () => {
      const chunks = sampleChunks(3);
      const vectors = [
        new Float32Array([1, 0, 0, 0]),
        new Float32Array([0, 1, 0, 0]),
        new Float32Array([0.9, 0.1, 0, 0]),
      ];
      const pkgPath = await buildTestPackage(tempDir, 'search-srv', chunks, vectors);

      const server = createServer({ packagePaths: [pkgPath] });
      await server.initialize();

      const result = await server.semanticSearch({ query: 'test code' });

      assert.equal(result.isError, false);
      assert.ok(result.content.hits.length > 0);
      assert.ok(result.content.meta.modulesSearched.includes('search-srv'));
    });

    it('returns hits with correct fields (AC-003-02)', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'fields-srv', sampleChunks(2), sampleVectors(2, 4));
      const server = createServer({ packagePaths: [pkgPath] });
      await server.initialize();

      const result = await server.semanticSearch({ query: 'test' });
      const hit = result.content.hits[0];

      assert.ok(hit.moduleId);
      assert.ok(hit.chunkId);
      assert.ok(typeof hit.score === 'number');
      assert.ok(typeof hit.filePath === 'string');
      assert.ok(typeof hit.startLine === 'number');
      assert.ok(typeof hit.content === 'string');
    });

    it('returns error for empty query (AC-003-02)', async () => {
      const server = createServer();
      const result = await server.semanticSearch({ query: '' });
      assert.equal(result.isError, true);
    });

    it('returns error for missing query', async () => {
      const server = createServer();
      const result = await server.semanticSearch({});
      assert.equal(result.isError, true);
    });
  });

  // ── list_modules tool ─────────────────────────────────────
  describe('list_modules tool', () => {
    it('returns loaded module metadata (AC-003-02)', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'list-srv', sampleChunks(3), sampleVectors(3, 4));
      const server = createServer({ packagePaths: [pkgPath] });
      await server.initialize();

      const result = server.listModules();

      assert.equal(result.isError, false);
      assert.equal(result.content.modules.length, 1);
      assert.equal(result.content.modules[0].moduleId, 'list-srv');
      assert.equal(result.content.modules[0].chunkCount, 3);
    });

    it('returns empty modules list when none loaded (AC-003-02)', () => {
      const server = createServer();
      const result = server.listModules();

      assert.equal(result.isError, false);
      assert.deepEqual(result.content.modules, []);
    });
  });

  // ── module_info tool ──────────────────────────────────────
  describe('module_info tool', () => {
    it('returns detail for specific module (AC-003-02)', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'info-srv', sampleChunks(2), sampleVectors(2, 4));
      const server = createServer({ packagePaths: [pkgPath] });
      await server.initialize();

      const result = server.moduleInfo({ moduleId: 'info-srv' });

      assert.equal(result.isError, false);
      assert.equal(result.content.module.moduleId, 'info-srv');
      assert.equal(result.content.module.dimensions, 4);
      assert.equal(result.content.module.chunkCount, 2);
      assert.ok(result.content.module.version);
      assert.ok(result.content.module.checksums);
    });

    it('shows key ID for encrypted packages (AC-008-02)', async () => {
      const key = randomBytes(32);
      const pkgPath = await buildTestPackage(tempDir, 'keyid-srv', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: key });
      const server = createServer({ packagePaths: [pkgPath], packageKeys: { 'keyid-srv': key } });
      await server.initialize();

      const result = server.moduleInfo({ moduleId: 'keyid-srv' });
      assert.equal(result.isError, false);
      assert.equal(result.content.module.encrypted, true);
    });

    it('returns error for unknown module (AC-003-02)', () => {
      const server = createServer();
      const result = server.moduleInfo({ moduleId: 'nonexistent' });

      assert.equal(result.isError, true);
      assert.ok(result.content.error.includes('not found'));
    });

    it('returns error for missing moduleId', () => {
      const server = createServer();
      const result = server.moduleInfo({});
      assert.equal(result.isError, true);
    });
  });

  // ── health ────────────────────────────────────────────────
  describe('health()', () => {
    it('reports loaded modules and status (AC-003-04)', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'health-srv', sampleChunks(2), sampleVectors(2, 4));
      const server = createServer({ packagePaths: [pkgPath] });
      await server.initialize();

      const h = server.health();

      assert.equal(h.status, 'ok');
      assert.equal(h.initialized, true);
      assert.equal(h.modules.loaded, 1);
      assert.equal(h.modules.list[0].moduleId, 'health-srv');
      assert.ok(h.uptimeMs >= 0);
    });

    it('reports SSE config (AC-003-03)', () => {
      const server = createServer({ sseConfig: { path: '/custom-sse', keepAliveMs: 15000 } });
      const h = server.health();

      assert.equal(h.sse.path, '/custom-sse');
      assert.equal(h.sse.keepAliveMs, 15000);
    });

    it('reports defaults for SSE config (AC-003-03)', () => {
      const server = createServer();
      const h = server.health();

      assert.equal(h.sse.path, '/sse');
      assert.equal(h.sse.keepAliveMs, 30000);
    });

    it('healthy with no packages loaded', () => {
      const server = createServer();
      const h = server.health();

      assert.equal(h.status, 'ok');
      assert.equal(h.modules.loaded, 0);
    });
  });

  // ── hot-reload via server ─────────────────────────────────
  describe('hot-reload (AC-003-05)', () => {
    it('reloads package via server API', async () => {
      const chunks1 = sampleChunks(2);
      const vectors1 = sampleVectors(2, 4);
      const pkgPath1 = await buildTestPackage(tempDir, 'hot-srv', chunks1, vectors1);

      const server = createServer({ packagePaths: [pkgPath1] });
      await server.initialize();

      assert.equal(server.health().modules.loaded, 1);

      // Build v2
      const chunks2 = sampleChunks(5);
      const vectors2 = sampleVectors(5, 4);
      const pkgPath2 = await buildTestPackage(tempDir, 'hot-srv-v2', chunks2, vectors2);

      await server.reloadPackage('hot-srv', pkgPath2);

      const info = server.moduleInfo({ moduleId: 'hot-srv' });
      assert.equal(info.isError, true); // old ID gone

      // New module loaded under new ID
      const h = server.health();
      assert.equal(h.modules.loaded, 1);
    });

    it('loads new package at runtime', async () => {
      const server = createServer();
      assert.equal(server.health().modules.loaded, 0);

      const pkgPath = await buildTestPackage(tempDir, 'runtime-add', sampleChunks(3), sampleVectors(3, 4));
      await server.loadPackage(pkgPath);

      assert.equal(server.health().modules.loaded, 1);
    });
  });

  // ── handleToolCall dispatch ───────────────────────────────
  describe('handleToolCall()', () => {
    it('dispatches semantic_search', async () => {
      const pkgPath = await buildTestPackage(tempDir, 'dispatch-test', sampleChunks(2), sampleVectors(2, 4));
      const server = createServer({ packagePaths: [pkgPath] });
      await server.initialize();

      const result = await server.handleToolCall('semantic_search', { query: 'test' });
      assert.equal(result.isError, false);
    });

    it('dispatches list_modules', async () => {
      const server = createServer();
      const result = await server.handleToolCall('list_modules');
      assert.equal(result.isError, false);
    });

    it('dispatches module_info', async () => {
      const server = createServer();
      const result = await server.handleToolCall('module_info', { moduleId: 'x' });
      assert.equal(result.isError, true); // not found, but dispatched correctly
    });

    it('returns error for unknown tool', async () => {
      const server = createServer();
      const result = await server.handleToolCall('unknown_tool');
      assert.equal(result.isError, true);
      assert.ok(result.content.error.includes('Unknown tool'));
    });
  });

  // ── Package security integration (FR-008 at M7 level) ────
  describe('Package Security Integration (FR-008)', () => {
    it('mixed load: encrypted + unencrypted packages (AC-008-01)', async () => {
      const key = randomBytes(32);

      const p1 = await buildTestPackage(tempDir, 'plain-mix', sampleChunks(2), sampleVectors(2, 4));
      const p2 = await buildTestPackage(tempDir, 'enc-mix', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: key });

      const server = createServer();
      await server.loadPackage(p1);
      await server.loadPackage(p2, { decryptionKey: key });

      assert.equal(server.health().modules.loaded, 2);

      // Both searchable
      const r1 = await server.semanticSearch({ query: 'test', modules: ['plain-mix'] });
      assert.equal(r1.isError, false);
      assert.ok(r1.content.hits.length > 0);

      const r2 = await server.semanticSearch({ query: 'test', modules: ['enc-mix'] });
      assert.equal(r2.isError, false);
      assert.ok(r2.content.hits.length > 0);
    });

    it('decryption failure includes descriptive error (AC-008-03)', async () => {
      const key = randomBytes(32);
      const pkgPath = await buildTestPackage(tempDir, 'err-dec', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: key });

      const server = createServer({ packagePaths: [pkgPath] });
      const result = await server.initialize();

      // Should fail to load (no key provided for encrypted package)
      // The package is encrypted so loading without key will fail
      assert.ok(result.errors.length > 0 || result.loaded === 0);
    });

    it('key rotation: old → new key, search works (AC-008-04)', async () => {
      const oldKey = randomBytes(32);
      const newKey = randomBytes(32);

      const vectors = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0])];
      const p1 = await buildTestPackage(tempDir, 'rot-srv', sampleChunks(2), vectors, { encryptionKey: oldKey });

      const server = createServer();
      await server.loadPackage(p1, { decryptionKey: oldKey });

      // Re-encrypt with new key
      const p2 = await buildTestPackage(tempDir, 'rot-srv-v2', sampleChunks(2), vectors, { encryptionKey: newKey });
      await server.reloadPackage('rot-srv', p2, { decryptionKey: newKey });

      const result = await server.semanticSearch({ query: 'test' });
      assert.equal(result.isError, false);
      assert.ok(result.content.hits.length > 0);
    });

    it('missing key for encrypted package does not affect other stores (AC-008-03)', async () => {
      const key = randomBytes(32);

      const p1 = await buildTestPackage(tempDir, 'ok-store', sampleChunks(2), sampleVectors(2, 4));
      const p2 = await buildTestPackage(tempDir, 'bad-key-store', sampleChunks(2), sampleVectors(2, 4), { encryptionKey: key });

      const server = createServer();
      await server.loadPackage(p1);

      // Try loading encrypted without key — should fail
      try {
        await server.loadPackage(p2);
      } catch {
        // Expected
      }

      // First store still works
      const result = await server.semanticSearch({ query: 'test', modules: ['ok-store'] });
      assert.equal(result.isError, false);
      assert.ok(result.content.hits.length > 0);
    });
  });
});
