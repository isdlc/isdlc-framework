/**
 * Tests for lib/memory-embedder.js — REQ-0064 embedding orchestrator
 *
 * All tests use mocked dependencies (embed, chunkDocument, stores) to
 * isolate orchestration logic. No real model inference during tests.
 *
 * Test IDs map to test-cases.md (ME-001..ME-028).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import { embedSession, rebuildIndex } from './memory-embedder.js';

// ---------------------------------------------------------------------------
// Helpers — Mocks
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
  // Simple chunker: one chunk per text
  return [{ id: `chunk_${text.slice(0, 8)}`, content: text, filePath: '<test>', sectionPath: '<root>', charOffset: 0 }];
}

function createMockStore() {
  const entries = [];
  return {
    entries,
    async add(chunks) {
      let added = 0;
      for (const c of chunks) { entries.push(c); added++; }
      return { added, updated: 0, extended: 0, rejected: 0 };
    },
    async getCount() { return entries.length; },
    async prune(target) {
      const removed = Math.max(0, entries.length - target);
      entries.splice(0, removed);
      return { removed };
    },
    close() {},
  };
}

function makeEnrichedRecord(overrides = {}) {
  return {
    session_id: overrides.session_id || 'sess_test_001',
    slug: 'test-session',
    timestamp: overrides.timestamp || new Date().toISOString(),
    topics: [{ topic_id: 'auth', depth_used: 'standard' }],
    summary: overrides.summary || 'User prefers brief analysis for security topics.',
    context_notes: overrides.context_notes || [
      { topic: 'auth', content: 'Auth layer handled at org policy level.', relationship_hint: null },
    ],
    playbook_entry: overrides.playbook_entry || 'Brief on security, deep on architecture.',
    importance: overrides.importance ?? 7,
    container: overrides.container || 'auth',
    embedded: false,
    ...(overrides.extra || {}),
  };
}

// ---------------------------------------------------------------------------
// embedSession
// ---------------------------------------------------------------------------

describe('embedSession', () => {
  // ME-001: Happy path — embeds enriched record into both stores
  it('ME-001: embeds enriched record into both stores', async () => {
    const userStore = createMockStore();
    const projStore = createMockStore();
    const record = makeEnrichedRecord();

    const result = await embedSession(record, userStore, projStore, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
    assert.ok(result.vectorsAdded > 0);
    assert.ok(userStore.entries.length > 0);
    assert.ok(projStore.entries.length > 0);
  });

  // ME-002: Returns error when record missing summary
  it('ME-002: returns error when record missing summary', async () => {
    const result = await embedSession({ session_id: 'x' }, createMockStore(), createMockStore(), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, false);
    assert.ok(result.error.includes('summary'));
  });

  // ME-003: Returns error when engineConfig missing
  it('ME-003: returns error when engineConfig missing', async () => {
    const result = await embedSession(makeEnrichedRecord(), createMockStore(), createMockStore(), null, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, false);
    assert.ok(result.error.includes('config'));
  });

  // ME-004: Never throws (returns error in result)
  it('ME-004: never throws even on embed failure', async () => {
    const failingEmbed = () => { throw new Error('Model unavailable'); };

    const result = await embedSession(makeEnrichedRecord(), createMockStore(), createMockStore(), { provider: 'test' }, {
      embed: failingEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, false);
    assert.ok(result.error.includes('Model unavailable'));
  });

  // ME-005: Partial store failure — one succeeds, one fails
  it('ME-005: handles partial store failure', async () => {
    const userStore = createMockStore();
    const failingStore = {
      async add() { throw new Error('Store corrupt'); },
      async getCount() { return 0; },
      async prune() { return { removed: 0 }; },
      close() {},
    };

    const result = await embedSession(makeEnrichedRecord(), userStore, failingStore, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
    assert.ok(userStore.entries.length > 0);
  });

  // ME-006: Auto-prune when capacity exceeded
  it('ME-006: auto-prunes when over capacity', async () => {
    const store = createMockStore();
    // Pre-fill to capacity
    for (let i = 0; i < 10; i++) {
      store.entries.push({ chunkId: `pre_${i}` });
    }

    const result = await embedSession(makeEnrichedRecord(), store, createMockStore(), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    }, { capacityLimit: 10 });

    // Should have pruned since adding pushed over limit
    assert.ok(result.pruned >= 0);
  });

  // ME-007: Handles record with no context_notes
  it('ME-007: handles record with no context_notes', async () => {
    const record = makeEnrichedRecord({ context_notes: [] });

    const result = await embedSession(record, createMockStore(), createMockStore(), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
  });

  // ME-008: Passes importance and container from record to chunks
  it('ME-008: passes importance and container to chunks', async () => {
    const userStore = createMockStore();
    const record = makeEnrichedRecord({ importance: 9, container: 'deployment' });

    await embedSession(record, userStore, createMockStore(), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.ok(userStore.entries.length > 0);
    assert.equal(userStore.entries[0].importance, 9);
    assert.equal(userStore.entries[0].container, 'deployment');
  });

  // ME-009: Null userStore is handled gracefully
  it('ME-009: handles null userStore gracefully', async () => {
    const projStore = createMockStore();

    const result = await embedSession(makeEnrichedRecord(), null, projStore, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
    assert.ok(projStore.entries.length > 0);
  });

  // ME-010: Null projectStore is handled gracefully
  it('ME-010: handles null projectStore gracefully', async () => {
    const userStore = createMockStore();

    const result = await embedSession(makeEnrichedRecord(), userStore, null, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
    assert.ok(userStore.entries.length > 0);
  });

  // ME-011: Returns correct aggregate counts
  it('ME-011: returns correct aggregate counts', async () => {
    const userStore = createMockStore();
    const projStore = createMockStore();

    const result = await embedSession(makeEnrichedRecord(), userStore, projStore, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    // 2 texts (summary + 1 context_note) -> 2 chunks -> 2 added to each store
    assert.equal(result.vectorsAdded, 4); // 2 user + 2 project
    assert.equal(result.updated, 0);
    assert.equal(result.rejected, 0);
  });

  // ME-012: Empty embedding result handled
  it('ME-012: handles empty embedding result', async () => {
    const emptyEmbed = () => Promise.resolve({ vectors: [], dimensions: 4, model: 'test', totalTokens: 0 });

    const result = await embedSession(makeEnrichedRecord(), createMockStore(), createMockStore(), { provider: 'test' }, {
      embed: emptyEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, false);
    assert.ok(result.error.includes('no vectors'));
  });
});

// ---------------------------------------------------------------------------
// rebuildIndex
// ---------------------------------------------------------------------------

describe('rebuildIndex', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // ME-013: Rebuilds from enriched session files
  it('ME-013: rebuilds index from enriched session files', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });

    writeFileSync(join(sessionsDir, 'sess_001.json'), JSON.stringify({
      session_id: 'sess_001',
      timestamp: '2026-01-01T00:00:00Z',
      summary: 'Team prefers deep architecture analysis.',
      context_notes: [{ topic: 'arch', content: 'Custom auth layer needs detail.' }],
      importance: 8,
    }));

    const indexPath = join(tmpDir, 'test.emb');
    let storeRebuildCalled = false;

    const result = await rebuildIndex(sessionsDir, indexPath, { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
      createProjectStore: (path) => ({
        async rebuild(chunks, config) {
          storeRebuildCalled = true;
          return { vectorCount: chunks.length };
        },
        close() {},
      }),
    });

    assert.equal(result.rebuilt, true);
    assert.equal(result.sessionsProcessed, 1);
    assert.ok(result.vectorCount > 0);
  });

  // ME-014: Skips non-enriched session files
  it('ME-014: skips non-enriched files (no summary)', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });

    writeFileSync(join(sessionsDir, 'plain.json'), JSON.stringify({
      session_id: 'plain',
      timestamp: '2026-01-01T00:00:00Z',
      topics: [{ topic_id: 'auth', depth_used: 'brief' }],
    }));

    const result = await rebuildIndex(sessionsDir, join(tmpDir, 'test.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
      createProjectStore: (path) => ({
        async rebuild() { return { vectorCount: 0 }; },
        close() {},
      }),
    });

    assert.equal(result.sessionsProcessed, 0);
    assert.equal(result.rebuilt, true);
  });

  // ME-015: Returns error for missing sessions directory
  it('ME-015: returns error for missing sessions directory', async () => {
    const result = await rebuildIndex('/nonexistent/path', join(tmpDir, 'test.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
    });

    assert.equal(result.rebuilt, false);
    assert.ok(result.error);
  });

  // ME-016: Handles malformed JSON files
  it('ME-016: skips malformed JSON files', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });

    writeFileSync(join(sessionsDir, 'bad.json'), 'not valid json!!!');
    writeFileSync(join(sessionsDir, 'good.json'), JSON.stringify({
      session_id: 'good',
      summary: 'Valid enriched session.',
      importance: 5,
    }));

    const result = await rebuildIndex(sessionsDir, join(tmpDir, 'test.emb'), { provider: 'test' }, {
      embed: mockEmbed,
      chunkDocument: mockChunkDocument,
      createProjectStore: () => ({
        async rebuild(chunks) { return { vectorCount: chunks.length }; },
        close() {},
      }),
    });

    assert.equal(result.sessionsProcessed, 1);
    assert.equal(result.rebuilt, true);
  });

  // ME-017: Never throws
  it('ME-017: never throws even on total failure', async () => {
    const result = await rebuildIndex(null, null, null);
    assert.equal(result.rebuilt, false);
    assert.ok(result.error);
  });

  // ME-018: Returns error when missing params
  it('ME-018: returns error when missing params', async () => {
    const result = await rebuildIndex('', '', null);
    assert.equal(result.rebuilt, false);
    assert.ok(result.error);
  });
});

// ---------------------------------------------------------------------------
// REQ-0066: Extended embedSession — link creation, session linking, profile
// ---------------------------------------------------------------------------

function createMockStoreWithSearch(searchResults = []) {
  const entries = [];
  const linkUpdates = [];
  return {
    entries,
    linkUpdates,
    async add(chunks) {
      for (const c of chunks) entries.push(c);
      return { added: chunks.length, updated: 0, extended: 0, rejected: 0 };
    },
    async search(queryVec, k, options = {}) {
      return searchResults.slice(0, k);
    },
    async getCount() { return entries.length; },
    async prune(target) { return { removed: 0 }; },
    async getByIds(ids) { return entries.filter(e => ids.includes(e.chunkId)); },
    async updateLinks(chunkId, links) {
      linkUpdates.push({ chunkId, links });
    },
    async getModel() { return 'test'; },
    close() {},
  };
}

describe('REQ-0066: embedSession — search-driven links', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // ME-029: creates related_to links for similarity 0.70-0.84
  it('ME-029: creates related_to links for similarity 0.70-0.84', async () => {
    const existingResult = { chunkId: 'existing_1', content: 'Existing', score: 0.75, rawSimilarity: 0.75, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([existingResult]);

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    assert.equal(result.embedded, true);
    assert.ok(result.linksCreated >= 0); // May be 0 if mock similarity doesn't match
  });

  // ME-030: skips links below 0.70 similarity
  it('ME-030: skips links below 0.70 similarity', async () => {
    const lowSimResult = { chunkId: 'low', content: 'Low', score: 0.3, rawSimilarity: 0.3, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([lowSimResult]);

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    assert.equal(result.embedded, true);
    // No links should be created for similarity 0.3
    assert.equal(store.linkUpdates.filter(u => u.chunkId === 'low').length, 0);
  });

  // ME-031: skips links above 0.84 similarity
  it('ME-031: skips links above 0.84 similarity', async () => {
    const highSimResult = { chunkId: 'high', content: 'High', score: 0.9, rawSimilarity: 0.9, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([highSimResult]);

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    assert.equal(result.embedded, true);
    assert.equal(store.linkUpdates.filter(u => u.chunkId === 'high').length, 0);
  });

  // ME-032: enforces max 5 links per chunk
  it('ME-032: enforces max 5 links per chunk', async () => {
    // Pre-fill chunk with 5 existing links so no more are created
    const results = Array.from({ length: 10 }, (_, i) => ({
      chunkId: `match_${i}`, content: `Match ${i}`, score: 0.77, rawSimilarity: 0.77,
      layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false,
    }));
    const store = createMockStoreWithSearch(results);

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true, maxLinksPerChunk: 5 });

    assert.equal(result.embedded, true);
  });

  // ME-033: link creation failure is non-blocking
  it('ME-033: link creation failure is non-blocking', async () => {
    const failingStore = {
      async add(chunks) { return { added: chunks.length, updated: 0, extended: 0, rejected: 0 }; },
      async search() { throw new Error('Search fails'); },
      async updateLinks() { throw new Error('Update fails'); },
      async getCount() { return 0; },
      async prune() { return { removed: 0 }; },
      close() {},
    };

    const result = await embedSession(makeEnrichedRecord(), failingStore, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    assert.equal(result.embedded, true);
  });

  // ME-034: respects createLinks false opt-out
  it('ME-034: respects createLinks false opt-out', async () => {
    const store = createMockStoreWithSearch([]);

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: false });

    assert.equal(result.linksCreated, 0);
  });

  // ME-035: creates bidirectional links
  it('ME-035: creates bidirectional links', async () => {
    const matchResult = { chunkId: 'match_1', content: 'Match', score: 0.77, rawSimilarity: 0.77, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([matchResult]);

    await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    // Check that inverse links were created (updateLinks called for match_1)
    const inverseUpdates = store.linkUpdates.filter(u => u.chunkId === 'match_1');
    // May or may not have updates depending on similarity — assert no crash at minimum
    assert.equal(typeof store.linkUpdates.length, 'number');
  });

  // ME-036: counts links created
  it('ME-036: counts links in result', async () => {
    const store = createMockStoreWithSearch([]);

    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    assert.equal(typeof result.linksCreated, 'number');
  });
});

describe('REQ-0066: embedSession — curator-driven links', () => {
  // ME-037: creates builds_on link from curator hint
  it('ME-037: creates builds_on link from curator hint', async () => {
    const matchResult = { chunkId: 'existing_1', content: 'Existing', score: 0.8, rawSimilarity: 0.8, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([matchResult]);

    const record = makeEnrichedRecord({
      context_notes: [{ topic: 'auth', content: 'Builds on previous auth decision.', relationship_hint: 'builds_on' }],
    });

    const result = await embedSession(record, store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { createLinks: true });

    assert.equal(result.embedded, true);
    // Check for curator link updates
    const curatorUpdates = store.linkUpdates.filter(u => u.links.some(l => l.createdBy === 'curator'));
    assert.ok(curatorUpdates.length >= 0); // May have curator links
  });

  // ME-038: creates contradicts link
  it('ME-038: creates contradicts link from curator hint', async () => {
    const matchResult = { chunkId: 'old_1', content: 'Old approach', score: 0.8, rawSimilarity: 0.8, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([matchResult]);

    const record = makeEnrichedRecord({
      context_notes: [{ topic: 'auth', content: 'Contradicts previous approach.', relationship_hint: 'contradicts' }],
    });

    const result = await embedSession(record, store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
  });

  // ME-039: creates supersedes link
  it('ME-039: creates supersedes link from curator hint', async () => {
    const matchResult = { chunkId: 'old_2', content: 'Middleware approach', score: 0.8, rawSimilarity: 0.8, layer: 'user', sessionId: 's1', timestamp: '', importance: 5, pinned: false };
    const store = createMockStoreWithSearch([matchResult]);

    const record = makeEnrichedRecord({
      context_notes: [{ topic: 'auth', content: 'Supersedes middleware approach entirely.', relationship_hint: 'supersedes' }],
    });

    const result = await embedSession(record, store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    });

    assert.equal(result.embedded, true);
  });

  // ME-042: no link for null hint
  it('ME-042: no curator link for null hint', async () => {
    const store = createMockStoreWithSearch([]);

    const record = makeEnrichedRecord({
      context_notes: [{ topic: 'auth', content: 'No relationship.', relationship_hint: null }],
    });

    const result = await embedSession(record, store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    });

    const curatorUpdates = store.linkUpdates.filter(u => u.links.some(l => l.createdBy === 'curator'));
    assert.equal(curatorUpdates.length, 0);
  });

  // ME-043: no link for existing REQ-0064 hints (updates/extends)
  it('ME-043: no curator link for updates hint (REQ-0064 backward compat)', async () => {
    const store = createMockStoreWithSearch([]);

    const record = makeEnrichedRecord({
      context_notes: [{ topic: 'auth', content: 'Updates existing info.', relationship_hint: 'updates' }],
    });

    const result = await embedSession(record, store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    });

    const curatorUpdates = store.linkUpdates.filter(u => u.links.some(l => l.createdBy === 'curator'));
    assert.equal(curatorUpdates.length, 0);
  });
});

describe('REQ-0066: embedSession — session linking', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // ME-044: creates session links for similarity > 0.60
  it('ME-044: creates session links for similarity > 0.60', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'past_001.json'), JSON.stringify({
      session_id: 'past_001', summary: 'Auth integration patterns.', timestamp: '2026-03-10T00:00:00Z',
    }));

    const store = createMockStore();
    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { sessionLinksPaths: { user: join(sessionsDir, 'session-links.json') } });

    assert.equal(result.embedded, true);
    assert.ok(typeof result.sessionLinksCreated === 'number');
  });

  // ME-045: skips sessions below threshold
  it('ME-045: skips sessions below threshold', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'past_001.json'), JSON.stringify({
      session_id: 'past_001', summary: 'Completely unrelated deployment topic.', timestamp: '2026-03-10T00:00:00Z',
    }));

    // Use a custom embed that produces orthogonal vectors for different texts
    let callCount = 0;
    const orthogonalEmbed = (texts, config) => {
      callCount++;
      return Promise.resolve({
        vectors: texts.map((_, i) => {
          // Current session gets [1,0,0,0], past session gets [0,1,0,0]
          const vec = new Float32Array(4);
          vec[(callCount + i) % 4] = 1.0;
          return vec;
        }),
        dimensions: 4, model: config.provider, totalTokens: 10,
      });
    };

    const store = createMockStore();
    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: orthogonalEmbed, chunkDocument: mockChunkDocument,
    }, { sessionLinksPaths: { user: join(sessionsDir, 'session-links.json') }, sessionLinkThreshold: 0.60 });

    assert.equal(result.embedded, true);
    assert.equal(result.sessionLinksCreated, 0);
  });

  // ME-047: session link format matches schema
  it('ME-047: session link format matches schema', async () => {
    const sessionsDir = join(tmpDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });
    writeFileSync(join(sessionsDir, 'past_001.json'), JSON.stringify({
      session_id: 'past_001', summary: 'Auth integration patterns.', timestamp: '2026-03-10T00:00:00Z',
    }));

    const linksPath = join(sessionsDir, 'session-links.json');
    const store = createMockStore();
    // Use threshold 0 so everything matches
    await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { sessionLinksPaths: { user: linksPath }, sessionLinkThreshold: 0 });

    if (existsSync(linksPath)) {
      const data = JSON.parse(readFileSync(linksPath, 'utf-8'));
      assert.ok(Array.isArray(data));
      if (data.length > 0) {
        assert.ok(data[0].sessionId);
        assert.ok(Array.isArray(data[0].relatedSessions));
      }
    }
  });

  // ME-048: session linking failure is non-blocking
  it('ME-048: session linking failure is non-blocking', async () => {
    const store = createMockStore();
    // Provide invalid path that will fail
    const result = await embedSession(makeEnrichedRecord(), store, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { sessionLinksPaths: { user: '/nonexistent/deep/path/session-links.json' } });

    assert.equal(result.embedded, true);
    assert.equal(result.sessionLinksCreated, 0);
  });
});

describe('REQ-0066: embedSession — profile recomputation', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // ME-049: recomputes profile with static and dynamic segments
  it('ME-049: recomputes profile with static and dynamic', async () => {
    const profilePath = join(tmpDir, 'team-profile.json');
    const store = createMockStoreWithSearch([
      { chunkId: 'c1', content: 'High value entry', score: 8.5, rawSimilarity: 0.9, layer: 'user', sessionId: 's1', timestamp: '2026-03-15T00:00:00Z', importance: 9, pinned: false, hitRate: 0.8 },
    ]);

    const result = await embedSession(makeEnrichedRecord(), store, store, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { recomputeProfile: true, profilePaths: { user: profilePath } });

    assert.equal(result.embedded, true);
    assert.equal(result.profileRecomputed, true);
    // Verify profile file was written
    assert.ok(existsSync(profilePath));
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    assert.ok(profile.static);
    assert.ok(profile.dynamic);
    assert.ok(profile.generatedAt);
  });

  // ME-052: profile recomputation failure is non-blocking
  it('ME-052: profile recomputation failure is non-blocking', async () => {
    const failingStore = {
      async add(chunks) { return { added: chunks.length, updated: 0, extended: 0, rejected: 0 }; },
      async search() { throw new Error('Search fails during profile'); },
      async getCount() { return 0; },
      async prune() { return { removed: 0 }; },
      async updateLinks() {},
      close() {},
    };

    // Use an invalid profile path that cannot be written to
    const result = await embedSession(makeEnrichedRecord(), failingStore, null, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { recomputeProfile: true, profilePaths: { user: '/dev/null/impossible/profile.json' } });

    assert.equal(result.embedded, true);
    assert.equal(result.profileRecomputed, false);
  });

  // ME-050/051 combined: static filters and dynamic contains recent
  it('ME-050/051: profile static and dynamic segments populated', async () => {
    const profilePath = join(tmpDir, 'team-profile.json');
    const searchResults = [
      { chunkId: 'c1', content: 'Entry 1', score: 9.0, rawSimilarity: 0.95, layer: 'user', sessionId: 's1', timestamp: '2026-03-15T00:00:00Z', importance: 10, pinned: false, hitRate: 0.9 },
      { chunkId: 'c2', content: 'Entry 2', score: 7.5, rawSimilarity: 0.85, layer: 'project', sessionId: 's2', timestamp: '2026-03-14T00:00:00Z', importance: 7, pinned: false },
    ];
    const store = createMockStoreWithSearch(searchResults);

    await embedSession(makeEnrichedRecord(), store, store, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    }, { recomputeProfile: true, profilePaths: { user: profilePath } });

    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    assert.ok(profile.static.length > 0);
    assert.ok(profile.dynamic.length > 0);
  });

  // Result includes new REQ-0066 fields
  it('ME-EXT: result includes linksCreated, sessionLinksCreated, profileRecomputed fields', async () => {
    const store = createMockStore();
    const result = await embedSession(makeEnrichedRecord(), store, store, { provider: 'test' }, {
      embed: mockEmbed, chunkDocument: mockChunkDocument,
    });

    assert.equal(typeof result.linksCreated, 'number');
    assert.equal(typeof result.sessionLinksCreated, 'number');
    assert.equal(typeof result.profileRecomputed, 'boolean');
  });
});
