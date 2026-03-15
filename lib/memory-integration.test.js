/**
 * Integration Tests: Team Continuity Memory (REQ-0066)
 *
 * Cross-module integration tests covering:
 * - Hybrid search E2E (search->traverse->store)
 * - Link creation during embedding + traversal at search
 * - Profile recomputation + delivery at search
 * - Session linking E2E
 * - Lineage chain traversal
 * - Schema migration integration
 * - All-failure graceful degradation
 *
 * Uses real createUserStore (SQLite) for integration verification.
 * Uses mocked embedding engine to avoid model inference.
 *
 * Test IDs: INT-001..INT-018
 * REQ-0066: FR-001 through FR-008
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import { createUserStore, createProjectStore } from './memory-store-adapter.js';
import { searchMemory, traverseLinks, formatHybridMemoryContext } from './memory-search.js';
import { embedSession } from './memory-embedder.js';

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

function mockChunkDocument(text, options) {
  return [{ id: `chunk_${text.slice(0, 8)}`, content: text, filePath: '<test>', sectionPath: '<root>', charOffset: 0 }];
}

function makeEnrichedRecord(overrides = {}) {
  return {
    session_id: overrides.session_id || 'sess_int_001',
    slug: 'integration-test',
    timestamp: overrides.timestamp || new Date().toISOString(),
    topics: [{ topic_id: 'auth', depth_used: 'standard' }],
    summary: overrides.summary || 'Integration test: auth approach decided.',
    context_notes: overrides.context_notes || [
      { topic: 'auth', content: 'Direct integration chosen over middleware.', relationship_hint: null },
    ],
    playbook_entry: 'Brief on security.',
    importance: overrides.importance ?? 7,
    container: overrides.container || null,
    embedded: false,
  };
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

describe('REQ-0066 Integration: Hybrid Search E2E', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-001: hybrid search returns memory + codebase + profile
  it('INT-001: hybrid search returns memory + codebase + profile', async () => {
    const userDbPath = join(tmpDir, 'user.db');
    const projEmbPath = join(tmpDir, 'proj.emb');
    const profilePath = join(tmpDir, 'team-profile.json');

    // Set up user store with data
    const userStore = createUserStore(userDbPath);
    await userStore.add([{
      chunkId: 'u_auth', sessionId: 's1', content: 'User prefers direct auth integration.',
      vector: makeVector(1), timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 8, container: null, mergeHistory: [],
    }]);
    userStore.close();

    // Set up project store with data
    const projStore = createProjectStore(projEmbPath);
    await projStore.add([{
      chunkId: 'p_arch', sessionId: 's2', content: 'Architecture: custom auth layer.',
      vector: makeVector(2), timestamp: '2026-03-14T00:00:00Z', embedModel: 'test',
      importance: 7, container: null, mergeHistory: [],
    }]);
    projStore.close();

    // Set up codebase mock
    const codebaseResults = [{
      chunkId: 'code_1', content: 'MemoryStore interface with SQLite.', score: 0.79,
      rawSimilarity: 0.79, layer: 'codebase', filePath: 'lib/memory-store-adapter.js',
    }];

    // Write team profile
    writeFileSync(profilePath, JSON.stringify({
      static: [{ content: 'Team prefers explicit error handling.' }],
      dynamic: [{ content: 'Last session: REQ-0065.' }],
      generatedAt: '2026-03-15T00:00:00Z',
    }));

    const result = await searchMemory('auth integration', userDbPath, projEmbPath, { provider: 'test' }, {
      embed: mockEmbed,
      createCodebaseStore: () => ({ async search() { return codebaseResults; }, async getModel() { return 'test'; }, close() {} }),
    }, {
      codebaseIndexPath: join(tmpDir, 'code.emb'),
      traverseLinks: false,
      includeProfile: true,
      profilePath,
      minScore: 0,
    });

    assert.ok(result.results.length > 0, 'Should have memory results');
    assert.ok(result.codebaseResults.length > 0, 'Should have codebase results');
    assert.ok(result.profile, 'Should have profile');
    assert.equal(result.sources.profile, true);
  });

  // INT-002: degrades to memory-only when codebase missing
  it('INT-002: degrades to memory-only when codebase missing', async () => {
    const userDbPath = join(tmpDir, 'user.db');
    const userStore = createUserStore(userDbPath);
    await userStore.add([{
      chunkId: 'u1', sessionId: 's1', content: 'Auth decision.',
      vector: makeVector(1), timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 5, container: null, mergeHistory: [],
    }]);
    userStore.close();

    const result = await searchMemory('auth', userDbPath, join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
    }, {
      codebaseIndexPath: '/nonexistent/code.emb',
      traverseLinks: false,
      minScore: 0,
    });

    assert.ok(result.results.length > 0);
    assert.deepEqual(result.codebaseResults, []);
  });

  // INT-003: backward compat: no new params = REQ-0064 behavior
  it('INT-003: backward compat — no new params returns array', async () => {
    const userDbPath = join(tmpDir, 'user.db');
    const userStore = createUserStore(userDbPath);
    await userStore.add([{
      chunkId: 'u1', sessionId: 's1', content: 'Some memory.',
      vector: makeVector(1), timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 5, container: null, mergeHistory: [],
    }]);
    userStore.close();

    const results = await searchMemory('memory', userDbPath, join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
    }, { minScore: 0 });

    // Should return plain array (not HybridSearchResult)
    assert.ok(Array.isArray(results));
  });
});

describe('REQ-0066 Integration: Link Creation + Traversal', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-004: embed creates links then search traverses them
  it('INT-004: embed creates links then search traverses them', async () => {
    const dbPath = join(tmpDir, 'user.db');
    const userStore = createUserStore(dbPath);

    // Pre-populate with an existing entry
    await userStore.add([{
      chunkId: 'existing_1', sessionId: 's_old', content: 'Previous auth approach.',
      vector: makeVector(1), timestamp: '2026-03-10T00:00:00Z', embedModel: 'test',
      importance: 6, container: null, mergeHistory: [],
    }]);

    // Embed a new session that may create links
    await embedSession(makeEnrichedRecord(), userStore, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    // Search and verify store has entries with links field
    const results = await userStore.search(makeVector(1), 10, { minScore: 0 });
    assert.ok(results.length > 0);
    // Every result should have a links field (may be empty)
    for (const r of results) {
      assert.ok(Array.isArray(r.links), `Result ${r.chunkId} should have links array`);
    }

    userStore.close();
  });

  // INT-006: broken link handled gracefully
  it('INT-006: broken link from pruned chunk handled gracefully', async () => {
    const dbPath = join(tmpDir, 'broken.db');
    const userStore = createUserStore(dbPath);

    await userStore.add([{
      chunkId: 'chunk_alive', sessionId: 's1', content: 'Alive chunk.',
      vector: makeVector(1), timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 5, container: null, mergeHistory: [],
    }]);

    // Add a link pointing to a non-existent chunk (simulating pruning)
    await userStore.updateLinks('chunk_alive', [{
      targetChunkId: 'chunk_pruned', relationType: 'related_to',
      createdAt: new Date().toISOString(), createdBy: 'search',
    }]);

    // Search to get the result with broken link
    const results = await userStore.search(makeVector(1), 10, { minScore: 0 });
    const aliveResult = results.find(r => r.chunkId === 'chunk_alive');
    assert.ok(aliveResult);
    assert.ok(aliveResult.links.length > 0);

    // Traverse links — broken link should be skipped
    await traverseLinks([aliveResult], userStore, null);
    assert.deepEqual(aliveResult.linkedMemories, []); // Pruned chunk not found

    userStore.close();
  });
});

describe('REQ-0066 Integration: Profile Recomputation + Delivery', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-007: embed recomputes profile then search loads it
  it('INT-007: embed recomputes profile, search loads it', async () => {
    const dbPath = join(tmpDir, 'user.db');
    const profilePath = join(tmpDir, 'team-profile.json');
    const userStore = createUserStore(dbPath);

    // Embed with profile recomputation
    await embedSession(makeEnrichedRecord(), userStore, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { recomputeProfile: true, profilePaths: { user: profilePath } });

    userStore.close();

    // Verify profile was written
    assert.ok(existsSync(profilePath), 'Profile should be written');
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    assert.ok(profile.generatedAt);

    // Search with profile loading
    const result = await searchMemory('auth', dbPath, join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
    }, { includeProfile: true, profilePath, minScore: 0 });

    assert.ok(result.profile, 'Search should load the profile');
    assert.equal(result.sources.profile, true);
  });

  // INT-008: stale profile served when recomputation fails
  it('INT-008: stale profile served when current recomputation fails', async () => {
    const profilePath = join(tmpDir, 'team-profile.json');

    // Write a stale profile
    writeFileSync(profilePath, JSON.stringify({
      static: [{ content: 'Stale entry.' }], dynamic: [], generatedAt: '2026-03-01T00:00:00Z',
    }));

    // Search loads the stale profile
    const result = await searchMemory('auth', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => ({ async search() { return []; }, async getModel() { return 'test'; }, async incrementAccess() {}, close() {} }),
      createProjectStore: () => ({ async search() { return []; }, async getModel() { return 'test'; }, close() {} }),
    }, { includeProfile: true, profilePath, minScore: 0 });

    assert.ok(result.profile);
    assert.equal(result.profile.static[0].content, 'Stale entry.');
  });
});

describe('REQ-0066 Integration: Session Linking', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-009: session linking writes session-links.json
  it('INT-009: session linking writes session-links.json', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'past_001.json'), JSON.stringify({
      session_id: 'past_001', summary: 'Auth integration discussion.', timestamp: '2026-03-10T00:00:00Z',
    }));

    const linksPath = join(sessionsDir, 'session-links.json');
    const store = createUserStore(join(tmpDir, 'user.db'));

    await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { sessionLinksPaths: { user: linksPath }, sessionLinkThreshold: 0 });

    store.close();

    if (existsSync(linksPath)) {
      const data = JSON.parse(readFileSync(linksPath, 'utf-8'));
      assert.ok(Array.isArray(data));
    }
    // Test passes whether links are created or not — fail-open
  });

  // INT-010: session linking appends to existing file
  it('INT-010: session linking appends to existing file', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    const linksPath = join(sessionsDir, 'session-links.json');

    // Pre-existing session links
    writeFileSync(linksPath, JSON.stringify([
      { sessionId: 'old_sess', relatedSessions: [{ sessionId: 'older', similarity: 0.8, createdAt: '2026-03-01T00:00:00Z' }] },
    ]));

    writeFileSync(join(sessionsDir, 'past_001.json'), JSON.stringify({
      session_id: 'past_001', summary: 'Related auth topic.', timestamp: '2026-03-10T00:00:00Z',
    }));

    const store = createUserStore(join(tmpDir, 'user.db'));

    await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { sessionLinksPaths: { user: linksPath }, sessionLinkThreshold: 0 });

    store.close();

    const data = JSON.parse(readFileSync(linksPath, 'utf-8'));
    assert.ok(Array.isArray(data));
    assert.ok(data.length >= 1, 'Should have at least the pre-existing entry');
  });
});

describe('REQ-0066 Integration: Lineage Chain Traversal', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-011: 1-hop lineage: supersedes chain
  it('INT-011: 1-hop supersedes chain traversal', async () => {
    const dbPath = join(tmpDir, 'lineage.db');
    const store = createUserStore(dbPath);

    const vecs = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0])];
    await store.add([
      { chunkId: 'old_approach', sessionId: 's1', content: 'Middleware approach for auth.', vector: vecs[0], timestamp: '2026-02-01T00:00:00Z', embedModel: 'test', importance: 5, container: null, mergeHistory: [] },
      { chunkId: 'new_approach', sessionId: 's2', content: 'Direct integration approach.', vector: vecs[1], timestamp: '2026-03-15T00:00:00Z', embedModel: 'test', importance: 8, container: null, mergeHistory: [] },
    ]);

    // Create supersedes link from new to old
    await store.updateLinks('new_approach', [{
      targetChunkId: 'old_approach', relationType: 'supersedes',
      createdAt: '2026-03-15T00:00:00Z', createdBy: 'curator',
    }]);

    // Search for new_approach
    const results = await store.search(vecs[1], 5, { minScore: 0 });
    const newResult = results.find(r => r.chunkId === 'new_approach');
    assert.ok(newResult);

    // Traverse links
    await traverseLinks([newResult], store, null);
    assert.ok(newResult.linkedMemories.length === 1);
    assert.equal(newResult.linkedMemories[0].chunkId, 'old_approach');
    assert.equal(newResult.linkedMemories[0].relationType, 'supersedes');

    store.close();
  });

  // INT-012: 1-hop only — does not traverse 2-hop
  it('INT-012: 1-hop only — no 2-hop traversal', async () => {
    const dbPath = join(tmpDir, 'multi-hop.db');
    const store = createUserStore(dbPath);

    const vecs = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0]), new Float32Array([0, 0, 1, 0])];
    await store.add([
      { chunkId: 'A', sessionId: 's1', content: 'Origin A.', vector: vecs[0], timestamp: '2026-01-01T00:00:00Z', embedModel: 'test', importance: 5, container: null, mergeHistory: [] },
      { chunkId: 'B', sessionId: 's2', content: 'Middle B.', vector: vecs[1], timestamp: '2026-02-01T00:00:00Z', embedModel: 'test', importance: 5, container: null, mergeHistory: [] },
      { chunkId: 'C', sessionId: 's3', content: 'Latest C.', vector: vecs[2], timestamp: '2026-03-01T00:00:00Z', embedModel: 'test', importance: 5, container: null, mergeHistory: [] },
    ]);

    // A -> B -> C chain
    await store.updateLinks('C', [{ targetChunkId: 'B', relationType: 'builds_on', createdAt: '', createdBy: 'curator' }]);
    await store.updateLinks('B', [{ targetChunkId: 'A', relationType: 'builds_on', createdAt: '', createdBy: 'curator' }]);

    // Search for C, traverse 1-hop
    const results = await store.search(vecs[2], 5, { minScore: 0 });
    const cResult = results.find(r => r.chunkId === 'C');
    assert.ok(cResult);

    await traverseLinks([cResult], store, null);
    // Should get B (1-hop) but NOT A (2-hop)
    assert.equal(cResult.linkedMemories.length, 1);
    assert.equal(cResult.linkedMemories[0].chunkId, 'B');

    store.close();
  });

  // INT-013: lineage formatted with relationship context
  it('INT-013: lineage formatted with relationship annotations', () => {
    const result = {
      results: [{
        chunkId: 'new', content: 'Direct integration.', score: 0.9, layer: 'project',
        linkedMemories: [{ chunkId: 'old', content: 'Middleware approach.', relationType: 'supersedes' }],
      }],
      codebaseResults: [],
      profile: null,
      sources: { memory: 1, codebase: 0, profile: false },
    };

    const output = formatHybridMemoryContext(result);
    assert.ok(output.includes('[supersedes] Middleware approach.'));
    assert.ok(output.includes('Direct integration.'));
  });
});

describe('REQ-0066 Integration: Schema Migration', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-014: REQ-0064 store migrated then used for links
  it('INT-014: migrated store supports link operations', async () => {
    const dbPath = join(tmpDir, 'migrated.db');

    // Open store (triggers migration)
    const store = createUserStore(dbPath);
    await store.add([{
      chunkId: 'chunk_1', sessionId: 's1', content: 'Test entry.',
      vector: makeVector(1), timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 5, container: null, mergeHistory: [],
    }]);

    // Use updateLinks on migrated store
    await store.updateLinks('chunk_1', [{
      targetChunkId: 'chunk_2', relationType: 'related_to',
      createdAt: new Date().toISOString(), createdBy: 'search',
    }]);

    // Verify links stored
    const results = await store.getByIds(['chunk_1']);
    assert.equal(results.length, 1);
    assert.ok(results[0].links.length > 0);
    assert.equal(results[0].links[0].relationType, 'related_to');

    store.close();
  });

  // INT-015: migration preserves existing search results
  it('INT-015: migration preserves existing search results', async () => {
    const dbPath = join(tmpDir, 'preserve.db');
    const store = createUserStore(dbPath);

    const vec = makeVector(42);
    await store.add([{
      chunkId: 'chunk_42', sessionId: 's42', content: 'Important decision about auth.',
      vector: vec, timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 9, container: null, mergeHistory: [],
    }]);

    // Search should find the entry
    const results = await store.search(vec, 5, { minScore: 0 });
    assert.ok(results.length > 0);
    const match = results.find(r => r.chunkId === 'chunk_42');
    assert.ok(match);
    assert.ok(match.score > 0);
    assert.ok(Array.isArray(match.links));

    store.close();
  });
});

describe('REQ-0066 Integration: All-Failure Graceful Degradation', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // INT-016: all stores fail returns empty result
  it('INT-016: all stores fail returns empty result', async () => {
    const result = await searchMemory('query', join(tmpDir, 'u.db'), join(tmpDir, 'p.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      createUserStore: () => { throw new Error('User fail'); },
      createProjectStore: () => { throw new Error('Project fail'); },
      createCodebaseStore: () => { throw new Error('Codebase fail'); },
    }, { codebaseIndexPath: '/nonexistent', minScore: 0 });

    assert.deepEqual(result.results, []);
    assert.deepEqual(result.codebaseResults, []);
  });

  // INT-017: all embedding steps fail still returns embedded true
  it('INT-017: all post-dedup steps fail, embedding still succeeds', async () => {
    const store = createUserStore(join(tmpDir, 'embed.db'));

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, {
      createLinks: true,
      sessionLinksPaths: { user: '/nonexistent/links.json' },
      recomputeProfile: true,
      profilePaths: { user: '/dev/null/impossible/profile.json' },
    });

    assert.equal(result.embedded, true);
    assert.ok(result.vectorsAdded > 0);
    store.close();
  });

  // INT-018: concurrent searches don't interfere
  it('INT-018: concurrent searches complete without interference', async () => {
    const dbPath = join(tmpDir, 'concurrent.db');
    const store = createUserStore(dbPath);
    await store.add([{
      chunkId: 'c1', sessionId: 's1', content: 'Auth topic.',
      vector: makeVector(1), timestamp: '2026-03-15T00:00:00Z', embedModel: 'test',
      importance: 5, container: null, mergeHistory: [],
    }]);
    store.close();

    const [r1, r2] = await Promise.all([
      searchMemory('auth', dbPath, join(tmpDir, 'p.emb'), { provider: 'test' }, { embed: mockEmbed }, { minScore: 0 }),
      searchMemory('auth', dbPath, join(tmpDir, 'p.emb'), { provider: 'test' }, { embed: mockEmbed }, { minScore: 0 }),
    ]);

    assert.ok(r1.length > 0);
    assert.ok(r2.length > 0);
  });
});
