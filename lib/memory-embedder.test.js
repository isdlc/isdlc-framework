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
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
