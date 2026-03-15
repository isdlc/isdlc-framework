/**
 * Tests for lib/memory-search.js — REQ-0064 semantic search
 *
 * Covers searchMemory, checkModelConsistency, formatSemanticMemoryContext.
 * Uses mocked stores and engine for isolation.
 *
 * Test IDs map to test-cases.md (MS-001..MS-030).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import {
  searchMemory,
  checkModelConsistency,
  formatSemanticMemoryContext,
} from './memory-search.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVector(seed, dims = 4) {
  const vec = new Float32Array(dims);
  for (let i = 0; i < dims; i++) vec[i] = Math.sin(seed * (i + 1)) * 0.5 + 0.5;
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm;
  return vec;
}

function mockEmbed(texts, config) {
  return Promise.resolve({
    vectors: texts.map((_, i) => makeVector(i + 1)),
    dimensions: 4,
    model: config.provider,
    totalTokens: texts.reduce((s, t) => s + t.length, 0),
  });
}

function createMockUserStore(results = [], model = 'test') {
  const accessedIds = [];
  return {
    results,
    accessedIds,
    async search(queryVec, k, options = {}) {
      return results.filter(r => {
        if (options.container && r.container !== options.container) return false;
        return r.score >= (options.minScore || 0) || r.pinned;
      }).slice(0, k);
    },
    async getModel() { return model; },
    async incrementAccess(ids) { accessedIds.push(...ids); },
    close() {},
  };
}

function createMockProjectStore(results = [], model = 'test') {
  return {
    results,
    async search(queryVec, k, options = {}) {
      return results.filter(r => {
        if (options.container && r.container !== options.container) return false;
        return r.score >= (options.minScore || 0) || r.pinned;
      }).slice(0, k);
    },
    async getModel() { return model; },
    async incrementAccess() {},
    close() {},
  };
}

function makeSearchResult(chunkId, score, layer, overrides = {}) {
  return {
    content: overrides.content || `Content for ${chunkId}`,
    score,
    rawSimilarity: overrides.rawSimilarity ?? score * 0.9,
    layer,
    sessionId: overrides.sessionId || `sess_${chunkId}`,
    timestamp: overrides.timestamp || '2026-03-15T10:00:00Z',
    chunkId,
    importance: overrides.importance ?? 5,
    pinned: overrides.pinned ?? false,
    hitRate: overrides.hitRate,
    container: overrides.container,
  };
}

// ---------------------------------------------------------------------------
// searchMemory
// ---------------------------------------------------------------------------

describe('searchMemory', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // MS-001: Merges results from both stores
  it('MS-001: merges results from both stores', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user'), makeSearchResult('u2', 0.7, 'user')];
    const projResults = [makeSearchResult('p1', 0.85, 'project'), makeSearchResult('p2', 0.6, 'project')];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => createMockProjectStore(projResults),
      },
      { minScore: 0 },
    );

    assert.ok(results.length >= 2);
    const layers = new Set(results.map(r => r.layer));
    assert.ok(layers.has('user'));
    assert.ok(layers.has('project'));
  });

  // MS-002: Results sorted by score descending
  it('MS-002: results sorted by score descending', async () => {
    const userResults = [makeSearchResult('u1', 0.7, 'user'), makeSearchResult('u2', 0.9, 'user')];
    const projResults = [makeSearchResult('p1', 0.8, 'project')];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => createMockProjectStore(projResults),
      },
      { minScore: 0 },
    );

    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, `Results not sorted at index ${i}`);
    }
  });

  // MS-003: Respects maxResults
  it('MS-003: respects maxResults limit', async () => {
    const userResults = Array.from({ length: 10 }, (_, i) => makeSearchResult(`u${i}`, 0.9 - i * 0.05, 'user'));

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => createMockProjectStore([]),
      },
      { maxResults: 3, minScore: 0 },
    );

    assert.ok(results.length <= 3);
  });

  // MS-004: Filters by minScore
  it('MS-004: filters results below minScore', async () => {
    const userResults = [
      makeSearchResult('high', 0.9, 'user'),
      makeSearchResult('low', 0.2, 'user'),
    ];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => createMockProjectStore([]),
      },
      { minScore: 0.5 },
    );

    assert.ok(results.every(r => r.score >= 0.5 || r.pinned));
  });

  // MS-005: Container filtering
  it('MS-005: filters by container', async () => {
    const userResults = [
      makeSearchResult('auth', 0.9, 'user', { container: 'auth' }),
      makeSearchResult('deploy', 0.8, 'user', { container: 'deployment' }),
    ];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => createMockProjectStore([]),
      },
      { container: 'auth', minScore: 0 },
    );

    assert.ok(results.every(r => r.container === 'auth'));
  });

  // MS-006: Increments accessed_count for user results
  it('MS-006: increments accessed_count for returned user results', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    const mockStore = createMockUserStore(userResults);

    await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => mockStore,
        createProjectStore: () => createMockProjectStore([]),
      },
      { minScore: 0 },
    );

    assert.ok(mockStore.accessedIds.includes('u1'));
  });

  // MS-007: Returns empty array for empty query
  it('MS-007: returns empty for empty query', async () => {
    const results = await searchMemory('', '', '', { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    });
    assert.deepEqual(results, []);
  });

  // MS-008: Returns empty for null engineConfig
  it('MS-008: returns empty for null engineConfig', async () => {
    const results = await searchMemory('query', 'path', 'path', null, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    });
    assert.deepEqual(results, []);
  });

  // MS-009: Handles model mismatch — skips mismatched store
  it('MS-009: skips store with model mismatch', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'openai' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults, 'codebert'), // Mismatch!
        createProjectStore: () => createMockProjectStore([], 'openai'),
      },
      { minScore: 0 },
    );

    // User store should be skipped due to model mismatch
    assert.ok(!results.some(r => r.layer === 'user'));
  });

  // MS-010: Fail-open on user store failure
  it('MS-010: continues searching project store when user store fails', async () => {
    const projResults = [makeSearchResult('p1', 0.85, 'project')];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => { throw new Error('SQLite corrupt'); },
        createProjectStore: () => createMockProjectStore(projResults),
      },
      { minScore: 0 },
    );

    assert.ok(results.some(r => r.layer === 'project'));
  });

  // MS-011: Fail-open on project store failure
  it('MS-011: continues searching user store when project store fails', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => { throw new Error('.emb corrupt'); },
      },
      { minScore: 0 },
    );

    assert.ok(results.some(r => r.layer === 'user'));
  });

  // MS-012: Returns empty when embedding fails
  it('MS-012: returns empty when embedding fails', async () => {
    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: () => { throw new Error('Embed fail'); },
        createUserStore: () => createMockUserStore([]),
        createProjectStore: () => createMockProjectStore([]),
      },
    );
    assert.deepEqual(results, []);
  });

  // MS-013: Pinned results always included
  it('MS-013: pinned results always included regardless of score', async () => {
    const userResults = [
      makeSearchResult('pinned', 0.1, 'user', { pinned: true }),
    ];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults),
        createProjectStore: () => createMockProjectStore([]),
      },
      { minScore: 0.5 },
    );

    assert.ok(results.some(r => r.chunkId === 'pinned' && r.pinned));
  });

  // MS-014: Handles null model from store
  it('MS-014: proceeds when store returns null model', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];

    const results = await searchMemory(
      'test query',
      join(tmpDir, 'user.db'),
      join(tmpDir, 'proj.emb'),
      { provider: 'test' },
      {
        embed: mockEmbed,
        createUserStore: () => createMockUserStore(userResults, null),
        createProjectStore: () => createMockProjectStore([], null),
      },
      { minScore: 0 },
    );

    assert.ok(results.length > 0);
  });
});

// ---------------------------------------------------------------------------
// checkModelConsistency
// ---------------------------------------------------------------------------

describe('checkModelConsistency', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // MS-015: Returns consistent=true when models match
  it('MS-015: returns consistent when models match', async () => {
    const result = await checkModelConsistency(
      join(tmpDir, 'test.emb'),
      { provider: 'openai' },
      { createProjectStore: () => ({ async getModel() { return 'openai'; }, close() {} }) },
    );

    assert.equal(result.consistent, true);
    assert.equal(result.indexModel, 'openai');
    assert.equal(result.currentModel, 'openai');
  });

  // MS-016: Returns consistent=false when models differ
  it('MS-016: returns inconsistent when models differ', async () => {
    const result = await checkModelConsistency(
      join(tmpDir, 'test.emb'),
      { provider: 'openai' },
      { createProjectStore: () => ({ async getModel() { return 'codebert'; }, close() {} }) },
    );

    assert.equal(result.consistent, false);
    assert.equal(result.indexModel, 'codebert');
    assert.equal(result.currentModel, 'openai');
  });

  // MS-017: Returns unknown when store fails to open
  it('MS-017: returns unknown on store failure', async () => {
    const result = await checkModelConsistency(
      '/nonexistent.emb',
      { provider: 'openai' },
      { createProjectStore: () => { throw new Error('Cannot open'); } },
    );

    assert.equal(result.consistent, false);
    assert.equal(result.indexModel, 'unknown');
  });

  // MS-018: Handles null model from store
  it('MS-018: returns inconsistent for null model', async () => {
    const result = await checkModelConsistency(
      join(tmpDir, 'test.emb'),
      { provider: 'openai' },
      { createProjectStore: () => ({ async getModel() { return null; }, close() {} }) },
    );

    assert.equal(result.consistent, false);
    assert.equal(result.indexModel, 'unknown');
  });
});

// ---------------------------------------------------------------------------
// formatSemanticMemoryContext
// ---------------------------------------------------------------------------

describe('formatSemanticMemoryContext', () => {
  // MS-019: Formats results as MEMORY_CONTEXT block
  it('MS-019: formats results correctly', () => {
    const results = [
      makeSearchResult('u1', 0.87, 'user', { content: 'User prefers brief on security.' }),
      makeSearchResult('p1', 0.82, 'project', { content: 'Project goes deep on architecture.' }),
    ];

    const output = formatSemanticMemoryContext(results);
    assert.ok(output.startsWith('MEMORY_CONTEXT:'));
    assert.ok(output.includes('score: 0.87'));
    assert.ok(output.includes('layer: user'));
    assert.ok(output.includes('User prefers brief on security.'));
    assert.ok(output.includes('score: 0.82'));
    assert.ok(output.includes('layer: project'));
    assert.ok(output.includes('Project goes deep on architecture.'));
  });

  // MS-020: Returns empty string for empty results
  it('MS-020: returns empty string for no results', () => {
    assert.equal(formatSemanticMemoryContext([]), '');
    assert.equal(formatSemanticMemoryContext(null), '');
    assert.equal(formatSemanticMemoryContext(undefined), '');
  });

  // MS-021: Handles single result
  it('MS-021: formats single result', () => {
    const output = formatSemanticMemoryContext([makeSearchResult('u1', 0.95, 'user', { content: 'Single memory.' })]);
    assert.ok(output.includes('MEMORY_CONTEXT:'));
    assert.ok(output.includes('score: 0.95'));
    assert.ok(output.includes('Single memory.'));
  });

  // MS-022: Score formatting to 2 decimal places
  it('MS-022: formats score to 2 decimal places', () => {
    const output = formatSemanticMemoryContext([makeSearchResult('u1', 0.8, 'user')]);
    assert.ok(output.includes('score: 0.80'));
  });
});
