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
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  searchMemory,
  traverseLinks,
  checkModelConsistency,
  formatSemanticMemoryContext,
  formatHybridMemoryContext,
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

// ---------------------------------------------------------------------------
// REQ-0066: Hybrid Search — searchMemory() with codebase index
// ---------------------------------------------------------------------------

function createMockCodebaseStore(results = [], model = 'test') {
  return {
    results,
    async search(queryVec, k, options = {}) {
      return results.slice(0, k);
    },
    async getModel() { return model; },
    close() {},
  };
}

function createMockStoreWithLinks(results = [], model = 'test', getByIdsResults = []) {
  const accessedIds = [];
  return {
    results,
    accessedIds,
    async search(queryVec, k, options = {}) {
      return results.filter(r => r.score >= (options.minScore || 0) || r.pinned).slice(0, k);
    },
    async getModel() { return model; },
    async incrementAccess(ids) { accessedIds.push(...ids); },
    async getByIds(ids) {
      return getByIdsResults.filter(r => ids.includes(r.chunkId));
    },
    close() {},
  };
}

describe('REQ-0066: Hybrid Search', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // HS-001: searches codebase index when codebaseIndexPath provided
  it('HS-001: searches codebase index when codebaseIndexPath provided', async () => {
    const codebaseResults = [makeSearchResult('code1', 0.79, 'codebase', { content: 'MemoryStore interface' })];
    const result = await searchMemory('auth integration', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
      createCodebaseStore: () => createMockCodebaseStore(codebaseResults),
    }, { codebaseIndexPath: join(tmpDir, 'code.emb') });

    assert.ok(result.codebaseResults.length > 0);
    assert.equal(result.codebaseResults[0].layer, 'codebase');
  });

  // HS-002: tags codebase results with layer codebase
  it('HS-002: codebase results tagged with layer codebase', async () => {
    const codebaseResults = [makeSearchResult('code1', 0.8, 'project', { content: 'Code chunk' })];
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
      createCodebaseStore: () => createMockCodebaseStore(codebaseResults),
    }, { codebaseIndexPath: join(tmpDir, 'code.emb') });

    for (const r of result.codebaseResults) {
      assert.equal(r.layer, 'codebase');
    }
  });

  // HS-003: all three searches run in parallel
  it('HS-003: all three searches run in parallel', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    const projResults = [makeSearchResult('p1', 0.85, 'project')];
    const codeResults = [makeSearchResult('c1', 0.79, 'codebase')];

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore(projResults),
      createCodebaseStore: () => createMockCodebaseStore(codeResults),
    }, { codebaseIndexPath: join(tmpDir, 'code.emb'), minScore: 0 });

    assert.ok(result.results.length >= 2); // user + project
    assert.ok(result.codebaseResults.length >= 1);
  });

  // HS-004: continues when codebase search fails
  it('HS-004: continues when codebase search fails', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    const failingCodebaseStore = { async search() { throw new Error('corrupt'); }, async getModel() { return 'test'; }, close() {} };

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore([]),
      createCodebaseStore: () => failingCodebaseStore,
    }, { codebaseIndexPath: join(tmpDir, 'code.emb'), minScore: 0 });

    assert.ok(result.results.length >= 1);
    assert.deepEqual(result.codebaseResults, []);
  });

  // HS-005: applies maxResultsPerSource limit
  it('HS-005: applies maxResultsPerSource limit', async () => {
    const userResults = Array.from({ length: 10 }, (_, i) => makeSearchResult(`u${i}`, 0.9 - i * 0.01, 'user'));
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore([]),
    }, { maxResultsPerSource: 3, minScore: 0, codebaseIndexPath: null, traverseLinks: false });

    // maxResultsPerSource controls per-store k
    assert.ok(result.results.length <= 3);
  });

  // HS-006: defaults maxResultsPerSource to 5
  it('HS-006: defaults maxResultsPerSource to 5', async () => {
    const userResults = Array.from({ length: 10 }, (_, i) => makeSearchResult(`u${i}`, 0.9 - i * 0.01, 'user'));
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore([]),
    }, { traverseLinks: false, minScore: 0 });

    assert.ok(result.results.length <= 5);
  });

  // HS-007: ranks merged results by score
  it('HS-007: ranks merged results by score', async () => {
    const userResults = [makeSearchResult('u1', 0.7, 'user'), makeSearchResult('u2', 0.9, 'user')];
    const projResults = [makeSearchResult('p1', 0.8, 'project')];

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore(projResults),
    }, { traverseLinks: false, minScore: 0 });

    for (let i = 1; i < result.results.length; i++) {
      assert.ok(result.results[i - 1].score >= result.results[i].score);
    }
  });

  // HS-008: returns memory-only when codebase index missing
  it('HS-008: memory-only when codebase index missing', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore([]),
      createCodebaseStore: () => { throw new Error('file not found'); },
    }, { codebaseIndexPath: '/nonexistent/code.emb', minScore: 0 });

    assert.ok(result.results.length > 0);
    assert.deepEqual(result.codebaseResults, []);
  });

  // HS-010: backward compatible without codebaseIndexPath
  it('HS-010: backward compatible — no new params returns array', async () => {
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    const results = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore(userResults),
      createProjectStore: () => createMockProjectStore([]),
    }, { minScore: 0 });

    // Should return plain array (backward compat)
    assert.ok(Array.isArray(results));
    assert.ok(!results.codebaseResults);
  });

  // HS-011: returns HybridSearchResult shape
  it('HS-011: returns HybridSearchResult shape with sources metadata', async () => {
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([makeSearchResult('u1', 0.9, 'user')]),
      createProjectStore: () => createMockProjectStore([]),
    }, { traverseLinks: false, minScore: 0 });

    assert.ok(result.results);
    assert.ok(Array.isArray(result.codebaseResults));
    assert.ok(typeof result.sources === 'object');
    assert.ok(typeof result.sources.memory === 'number');
    assert.ok(typeof result.sources.codebase === 'number');
    assert.ok(typeof result.sources.profile === 'boolean');
  });
});

// ---------------------------------------------------------------------------
// REQ-0066: Team Profile Loading
// ---------------------------------------------------------------------------

describe('REQ-0066: Team Profile', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // HS-012: loads team profile
  it('HS-012: loads team profile when includeProfile true and file exists', async () => {
    const profilePath = join(tmpDir, 'team-profile.json');
    const profile = { static: [{ content: 'Team prefers explicit error handling.' }], dynamic: [{ content: 'Last session: REQ-0065.' }], generatedAt: '2026-03-15T00:00:00Z' };
    writeFileSync(profilePath, JSON.stringify(profile));

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    }, { includeProfile: true, profilePath });

    assert.ok(result.profile);
    assert.equal(result.profile.static[0].content, 'Team prefers explicit error handling.');
    assert.equal(result.sources.profile, true);
  });

  // HS-013: profile null when file missing
  it('HS-013: returns profile null when file missing', async () => {
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    }, { includeProfile: true, profilePath: join(tmpDir, 'nonexistent.json') });

    assert.equal(result.profile, null);
    assert.equal(result.sources.profile, false);
  });

  // HS-014: profile null for invalid JSON
  it('HS-014: returns profile null for invalid JSON', async () => {
    const profilePath = join(tmpDir, 'bad-profile.json');
    writeFileSync(profilePath, 'not valid json!!!');

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    }, { includeProfile: true, profilePath });

    assert.equal(result.profile, null);
  });

  // HS-015: skips profile when includeProfile false
  it('HS-015: skips profile when includeProfile false', async () => {
    const profilePath = join(tmpDir, 'team-profile.json');
    writeFileSync(profilePath, JSON.stringify({ static: [], dynamic: [], generatedAt: '' }));

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    }, { includeProfile: false, profilePath });

    assert.equal(result.profile, null);
  });

  // HS-016: defaults includeProfile to true
  it('HS-016: defaults includeProfile to true', async () => {
    const profilePath = join(tmpDir, 'team-profile.json');
    writeFileSync(profilePath, JSON.stringify({ static: [{ content: 'Default' }], dynamic: [], generatedAt: '' }));

    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => createMockUserStore([]),
      createProjectStore: () => createMockProjectStore([]),
    }, { profilePath }); // no includeProfile specified -> default true

    assert.ok(result.profile);
    assert.equal(result.profile.static[0].content, 'Default');
  });
});

// ---------------------------------------------------------------------------
// REQ-0066: Link Traversal
// ---------------------------------------------------------------------------

describe('REQ-0066: Link Traversal — traverseLinks()', () => {
  // HS-017: fetches linked chunks
  it('HS-017: fetches linked chunks and attaches as linkedMemories', async () => {
    const linkedChunk = { chunkId: 'linked1', content: 'Linked content', layer: 'user', links: [] };
    const result = makeSearchResult('parent', 0.9, 'user');
    result.links = [{ targetChunkId: 'linked1', relationType: 'builds_on', createdAt: '2026-03-15T00:00:00Z', createdBy: 'curator' }];

    const store = createMockStoreWithLinks([], 'test', [linkedChunk]);
    await traverseLinks([result], store, null);

    assert.ok(result.linkedMemories.length === 1);
    assert.equal(result.linkedMemories[0].chunkId, 'linked1');
    assert.equal(result.linkedMemories[0].relationType, 'builds_on');
  });

  // HS-018: skips broken links silently
  it('HS-018: skips broken links silently', async () => {
    const result = makeSearchResult('parent', 0.9, 'user');
    result.links = [{ targetChunkId: 'nonexistent', relationType: 'related_to', createdAt: '', createdBy: 'search' }];

    const store = createMockStoreWithLinks([], 'test', []); // empty — nothing found
    await traverseLinks([result], store, null);

    assert.deepEqual(result.linkedMemories, []);
  });

  // HS-019: linked memories not in main results
  it('HS-019: linked chunks in linkedMemories not top-level results', async () => {
    const linkedChunk = { chunkId: 'linked1', content: 'Linked', layer: 'user', links: [] };
    const mainResult = makeSearchResult('parent', 0.9, 'user');
    mainResult.links = [{ targetChunkId: 'linked1', relationType: 'related_to', createdAt: '', createdBy: 'search' }];

    const store = createMockStoreWithLinks([], 'test', [linkedChunk]);
    const results = [mainResult];
    await traverseLinks(results, store, null);

    // Top-level results should not include the linked chunk
    assert.ok(!results.some(r => r.chunkId === 'linked1'));
    // But it should be in linkedMemories
    assert.ok(mainResult.linkedMemories.some(l => l.chunkId === 'linked1'));
  });

  // HS-020: deduplicates linked chunks across results
  it('HS-020: deduplicates linked chunks across results', async () => {
    const linkedChunk = { chunkId: 'shared', content: 'Shared', layer: 'user', links: [] };
    const r1 = makeSearchResult('a', 0.9, 'user');
    r1.links = [{ targetChunkId: 'shared', relationType: 'related_to', createdAt: '', createdBy: 'search' }];
    const r2 = makeSearchResult('b', 0.8, 'user');
    r2.links = [{ targetChunkId: 'shared', relationType: 'builds_on', createdAt: '', createdBy: 'curator' }];

    let getByIdsCalls = 0;
    const store = {
      async getByIds(ids) { getByIdsCalls++; return ids.includes('shared') ? [linkedChunk] : []; },
      async getModel() { return 'test'; },
      close() {},
    };
    await traverseLinks([r1, r2], store, null);

    // getByIds called once with deduplicated IDs
    assert.equal(getByIdsCalls, 1);
    assert.ok(r1.linkedMemories.length === 1);
    assert.ok(r2.linkedMemories.length === 1);
  });

  // HS-021: skips traversal when traverseLinks false
  it('HS-021: skips traversal when traverseLinks false', async () => {
    let tmpDir2 = createTempDir();
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    userResults[0].links = [{ targetChunkId: 'linked', relationType: 'related_to', createdAt: '', createdBy: 'search' }];

    let getByIdsCalled = false;
    const mockStore = {
      ...createMockUserStore(userResults),
      async getByIds() { getByIdsCalled = true; return []; },
    };

    const result = await searchMemory('query', join(tmpDir2, 'u.db'), join(tmpDir2, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => mockStore,
      createProjectStore: () => createMockProjectStore([]),
    }, { traverseLinks: false, minScore: 0 });

    assert.equal(getByIdsCalled, false);
    cleanupTempDir(tmpDir2);
  });

  // HS-022: defaults traverseLinks to true
  it('HS-022: defaults traverseLinks to true', async () => {
    let tmpDir2 = createTempDir();
    const linkedChunk = { chunkId: 'linked1', content: 'Linked', layer: 'user', links: [] };
    const userResults = [makeSearchResult('u1', 0.9, 'user')];
    userResults[0].links = [{ targetChunkId: 'linked1', relationType: 'related_to', createdAt: '', createdBy: 'search' }];

    const mockStore = createMockStoreWithLinks(userResults, 'test', [linkedChunk]);

    const result = await searchMemory('query', join(tmpDir2, 'u.db'), join(tmpDir2, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => mockStore,
      createProjectStore: () => createMockProjectStore([]),
    }, { profilePath: join(tmpDir2, 'p.json'), minScore: 0 }); // hybrid mode, no traverseLinks -> default true

    assert.ok(result.results[0].linkedMemories);
    cleanupTempDir(tmpDir2);
  });

  // HS-023: handles empty links array
  it('HS-023: handles results with empty links array', async () => {
    const result = makeSearchResult('a', 0.9, 'user');
    result.links = [];
    await traverseLinks([result], createMockStoreWithLinks([], 'test', []), null);
    assert.deepEqual(result.linkedMemories, []);
  });

  // HS-024: handles no links field
  it('HS-024: handles results with no links property', async () => {
    const result = makeSearchResult('a', 0.9, 'user');
    // no links property at all
    await traverseLinks([result], createMockStoreWithLinks([], 'test', []), null);
    assert.deepEqual(result.linkedMemories, []);
  });
});

// ---------------------------------------------------------------------------
// REQ-0066: formatHybridMemoryContext
// ---------------------------------------------------------------------------

describe('REQ-0066: formatHybridMemoryContext', () => {
  // HS-025: formats profile static and dynamic sections
  it('HS-025: formats profile static and dynamic sections', () => {
    const result = {
      results: [],
      codebaseResults: [],
      profile: {
        static: [{ content: 'Team prefers explicit error handling.' }],
        dynamic: [{ content: 'Last session: REQ-0065.' }],
        generatedAt: '2026-03-15T00:00:00Z',
      },
      sources: { memory: 0, codebase: 0, profile: true },
    };
    const output = formatHybridMemoryContext(result);
    assert.ok(output.includes('--- team-profile (static) ---'));
    assert.ok(output.includes('Team prefers explicit error handling.'));
    assert.ok(output.includes('--- team-profile (dynamic) ---'));
    assert.ok(output.includes('Last session: REQ-0065.'));
  });

  // HS-026: formats memory results with score and layer
  it('HS-026: formats memory results with score and layer', () => {
    const result = {
      results: [makeSearchResult('u1', 0.87, 'user', { content: 'User preference' })],
      codebaseResults: [],
      profile: null,
      sources: { memory: 1, codebase: 0, profile: false },
    };
    const output = formatHybridMemoryContext(result);
    assert.ok(output.includes('--- memory (score: 0.87, layer: user) ---'));
    assert.ok(output.includes('User preference'));
  });

  // HS-027: formats codebase results with file path
  it('HS-027: formats codebase results with file path', () => {
    const result = {
      results: [],
      codebaseResults: [{ content: 'MemoryStore interface', score: 0.79, filePath: 'lib/memory-store-adapter.js', layer: 'codebase', chunkId: 'c1' }],
      profile: null,
      sources: { memory: 0, codebase: 1, profile: false },
    };
    const output = formatHybridMemoryContext(result);
    assert.ok(output.includes('--- codebase (score: 0.79, file: lib/memory-store-adapter.js) ---'));
    assert.ok(output.includes('MemoryStore interface'));
  });

  // HS-028: includes linked memory relationship context
  it('HS-028: includes linked memory with relationType', () => {
    const r = makeSearchResult('u1', 0.87, 'user', { content: 'Auth decision' });
    r.linkedMemories = [{ content: 'Previous auth choice', relationType: 'builds_on', chunkId: 'linked1' }];
    const result = { results: [r], codebaseResults: [], profile: null, sources: { memory: 1, codebase: 0, profile: false } };
    const output = formatHybridMemoryContext(result);
    assert.ok(output.includes('[builds_on] Previous auth choice'));
  });

  // HS-029: formats supersedes relationship
  it('HS-029: formats supersedes relationship in lineage', () => {
    const r = makeSearchResult('u1', 0.82, 'project', { content: 'Direct integration' });
    r.linkedMemories = [{ content: 'Middleware approach', relationType: 'supersedes', chunkId: 'old1' }];
    const result = { results: [r], codebaseResults: [], profile: null, sources: { memory: 1, codebase: 0, profile: false } };
    const output = formatHybridMemoryContext(result);
    assert.ok(output.includes('[supersedes] Middleware approach'));
  });

  // HS-030: returns empty string when all sources empty
  it('HS-030: returns empty string when all sources empty', () => {
    const result = { results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } };
    assert.equal(formatHybridMemoryContext(result), '');
  });

  // HS-031: omits profile section when profile null
  it('HS-031: omits profile section when profile null', () => {
    const r = makeSearchResult('u1', 0.9, 'user', { content: 'Some memory' });
    const result = { results: [r], codebaseResults: [], profile: null, sources: { memory: 1, codebase: 0, profile: false } };
    const output = formatHybridMemoryContext(result);
    assert.ok(!output.includes('team-profile'));
    assert.ok(output.includes('memory (score: 0.90'));
  });

  // HS-032: handles all sources empty gracefully
  it('HS-032: handles null result gracefully', () => {
    assert.equal(formatHybridMemoryContext(null), '');
    assert.equal(formatHybridMemoryContext(undefined), '');
  });
});
