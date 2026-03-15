/**
 * Tests for lib/memory-store-adapter.js — REQ-0064 MemoryStore interface
 *
 * Covers createUserStore (SQLite), createProjectStore (.emb), MemoryStore
 * interface contract, 4-tier dedup, self-ranking, curation, auto-pruning.
 *
 * Uses node:test + node:assert/strict with temp directories for isolation.
 *
 * Test IDs map to test-cases.md (MSA-001..MSA-042).
 */

import { describe, it, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';
import {
  createUserStore,
  createProjectStore,
  cosineSimilarity,
  selfRankScore,
} from './memory-store-adapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a deterministic Float32Array vector from a seed value. */
function makeVector(seed, dims = 4) {
  const vec = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    vec[i] = Math.sin(seed * (i + 1)) * 0.5 + 0.5;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm;
  return vec;
}

/** Create a MemoryChunk for testing. */
function makeChunk(id, seed, opts = {}) {
  return {
    chunkId: `chunk_${id}`,
    sessionId: opts.sessionId || `sess_${id}`,
    content: opts.content || `Test content for chunk ${id}`,
    vector: opts.vector || makeVector(seed),
    timestamp: opts.timestamp || new Date().toISOString(),
    embedModel: opts.embedModel || 'test-model',
    importance: opts.importance ?? 5,
    relationshipHint: opts.relationshipHint || null,
    container: opts.container || null,
    mergeHistory: opts.mergeHistory || [],
  };
}

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = makeVector(1);
    const sim = cosineSimilarity(v, v);
    assert.ok(Math.abs(sim - 1.0) < 0.001, `Expected ~1.0, got ${sim}`);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim) < 0.001, `Expected ~0, got ${sim}`);
  });

  it('returns 0 for null or empty inputs', () => {
    assert.equal(cosineSimilarity(null, null), 0);
    assert.equal(cosineSimilarity(new Float32Array(0), new Float32Array(0)), 0);
  });

  it('returns 0 for mismatched dimensions', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([1, 0, 0]);
    assert.equal(cosineSimilarity(a, b), 0);
  });
});

// ---------------------------------------------------------------------------
// selfRankScore
// ---------------------------------------------------------------------------

describe('selfRankScore', () => {
  it('applies correct formula: cosine * (1 + log(1 + hit_rate)) * (1 + importance/20)', () => {
    const cosine = 0.8;
    const accessed = 3;
    const appeared = 6;
    const importance = 7;
    const hitRate = accessed / appeared;
    const expected = cosine * (1 + Math.log(1 + hitRate)) * (1 + importance / 20);
    const actual = selfRankScore(cosine, accessed, appeared, importance);
    assert.ok(Math.abs(actual - expected) < 0.001, `Expected ${expected}, got ${actual}`);
  });

  it('handles zero appeared_count', () => {
    const score = selfRankScore(0.9, 0, 0, 5);
    // hit_rate = 0, so: 0.9 * (1 + log(1)) * (1 + 5/20) = 0.9 * 1 * 1.25 = 1.125
    assert.ok(Math.abs(score - 1.125) < 0.001);
  });
});

// ---------------------------------------------------------------------------
// createUserStore — SQLite Backend
// ---------------------------------------------------------------------------

describe('createUserStore', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // MSA-001: Creates SQLite DB and tables on first open
  it('MSA-001: creates DB and tables on first open', () => {
    const dbPath = join(tmpDir, 'memory.db');
    const store = createUserStore(dbPath);
    assert.ok(existsSync(dbPath));
    store.close();
  });

  // MSA-003: Returns MemoryStore interface
  it('MSA-003: returns all MemoryStore interface methods', () => {
    const dbPath = join(tmpDir, 'memory.db');
    const store = createUserStore(dbPath);
    const methods = ['search', 'add', 'remove', 'incrementAccess', 'pin', 'archive', 'tag', 'getModel', 'getCount', 'prune', 'rebuild', 'close'];
    for (const m of methods) {
      assert.equal(typeof store[m], 'function', `Missing method: ${m}`);
    }
    store.close();
  });

  // MSA-005: Rejects path traversal
  it('MSA-005: rejects path with ..', () => {
    assert.throws(() => createUserStore('../etc/memory.db'), /path traversal/);
  });

  // MSA-006: Rejects empty dbPath
  it('MSA-006: rejects empty dbPath', () => {
    assert.throws(() => createUserStore(''), /non-empty/);
    assert.throws(() => createUserStore(null), /non-empty/);
  });

  // MSA-007..MSA-010: add() with 4-tier dedup
  describe('add() — 4-tier dedup', () => {
    it('MSA-007: adds new chunks (similarity < 0.85)', async () => {
      const dbPath = join(tmpDir, 'dedup.db');
      const store = createUserStore(dbPath);

      const chunk1 = makeChunk('a', 1);
      const chunk2 = makeChunk('b', 100); // Very different vector

      const r1 = await store.add([chunk1]);
      assert.equal(r1.added, 1);

      const r2 = await store.add([chunk2]);
      assert.equal(r2.added, 1);

      const count = await store.getCount();
      assert.equal(count, 2);
      store.close();
    });

    it('MSA-008: rejects near-identical chunks (similarity >= 0.95)', async () => {
      const dbPath = join(tmpDir, 'dedup-reject.db');
      const store = createUserStore(dbPath);

      const vec = makeVector(1);
      const chunk1 = makeChunk('a', 1, { vector: vec });
      // Identical vector -> reject
      const chunk2 = makeChunk('b', 1, { vector: new Float32Array(vec) });

      await store.add([chunk1]);
      const r2 = await store.add([chunk2]);
      assert.equal(r2.rejected, 1);
      assert.equal(r2.added, 0);

      const count = await store.getCount();
      assert.equal(count, 1);
      store.close();
    });

    it('MSA-009: updates when hint is "updates" and similarity 0.85-0.94', async () => {
      const dbPath = join(tmpDir, 'dedup-update.db');
      const store = createUserStore(dbPath);

      // Create two vectors with similarity ~0.866 (in 0.85-0.94 range)
      const raw1 = new Float32Array([1, 1, 1, 1]);
      const n1 = Math.sqrt(raw1.reduce((s, v) => s + v * v, 0));
      const vec1 = raw1.map(v => v / n1);

      const raw2 = new Float32Array([1, 1, 1, 0]);
      const n2 = Math.sqrt(raw2.reduce((s, v) => s + v * v, 0));
      const vec2 = raw2.map(v => v / n2);

      // Verify similarity is in the 0.85-0.94 range
      const sim = cosineSimilarity(vec1, vec2);
      assert.ok(sim >= 0.85 && sim < 0.95, `Similarity ${sim} not in [0.85, 0.95)`);

      const chunk1 = makeChunk('a', 1, { vector: vec1 });
      const chunk2 = makeChunk('b', 2, { vector: vec2, relationshipHint: 'updates' });

      await store.add([chunk1]);
      const r2 = await store.add([chunk2]);
      assert.equal(r2.updated, 1);

      // Old entry should be marked as not latest
      const rows = store._db.prepare('SELECT is_latest FROM memories ORDER BY id ASC').all();
      assert.equal(rows[0].is_latest, 0); // Old: superseded
      assert.equal(rows[1].is_latest, 1); // New: latest
      store.close();
    });

    it('MSA-010: extends when hint is "extends" and similarity 0.85-0.94', async () => {
      const dbPath = join(tmpDir, 'dedup-extend.db');
      const store = createUserStore(dbPath);

      // Create two vectors with similarity ~0.866 (in 0.85-0.94 range)
      const raw1 = new Float32Array([1, 1, 1, 1]);
      const n1 = Math.sqrt(raw1.reduce((s, v) => s + v * v, 0));
      const vec1 = raw1.map(v => v / n1);

      const raw2 = new Float32Array([1, 1, 1, 0]);
      const n2 = Math.sqrt(raw2.reduce((s, v) => s + v * v, 0));
      const vec2 = raw2.map(v => v / n2);

      const chunk1 = makeChunk('a', 1, { vector: vec1, content: 'Original content' });
      const chunk2 = makeChunk('b', 2, { vector: vec2, relationshipHint: 'extends', content: 'Extended content' });

      await store.add([chunk1]);
      const r2 = await store.add([chunk2]);
      assert.equal(r2.extended, 1);

      // Content should be merged
      const row = store._db.prepare('SELECT content, appeared_count FROM memories WHERE chunk_id = ?').get('chunk_a');
      assert.ok(row.content.includes('Original content'));
      assert.ok(row.content.includes('Extended content'));
      assert.equal(row.appeared_count, 2);
      store.close();
    });
  });

  // MSA-011..MSA-014: search with self-ranking
  describe('search()', () => {
    it('MSA-011: returns results sorted by score descending', async () => {
      const dbPath = join(tmpDir, 'search.db');
      const store = createUserStore(dbPath);

      await store.add([
        makeChunk('a', 1, { importance: 3 }),
        makeChunk('b', 2, { importance: 8 }),
        makeChunk('c', 3, { importance: 5 }),
      ]);

      const queryVec = makeVector(2); // Close to chunk 'b'
      const results = await store.search(queryVec, 10);

      assert.ok(results.length > 0);
      // Results should be sorted by score descending
      for (let i = 1; i < results.length; i++) {
        assert.ok(results[i - 1].score >= results[i].score, 'Results not sorted by score');
      }
      store.close();
    });

    it('MSA-012: applies minScore filter', async () => {
      const dbPath = join(tmpDir, 'search-min.db');
      const store = createUserStore(dbPath);

      await store.add([makeChunk('a', 1), makeChunk('b', 100)]);

      // Query close to 'a', far from 'b'
      const results = await store.search(makeVector(1), 10, { minScore: 0.8 });
      // Only the result with high enough score should pass
      for (const r of results) {
        assert.ok(r.score >= 0.8 || r.pinned);
      }
      store.close();
    });

    it('MSA-013: pinned entries always included regardless of score', async () => {
      const dbPath = join(tmpDir, 'search-pinned.db');
      const store = createUserStore(dbPath);

      await store.add([makeChunk('pin', 999, { importance: 1 })]);
      await store.pin('chunk_pin');

      // Query with vector far from the pinned entry
      const results = await store.search(makeVector(1), 10, { minScore: 999 });
      assert.ok(results.some(r => r.chunkId === 'chunk_pin' && r.pinned), 'Pinned entry not included');
      store.close();
    });

    it('MSA-014: excludes archived entries', async () => {
      const dbPath = join(tmpDir, 'search-archived.db');
      const store = createUserStore(dbPath);

      await store.add([makeChunk('a', 1)]);
      await store.archive('chunk_a');

      const results = await store.search(makeVector(1), 10, { minScore: 0 });
      assert.equal(results.filter(r => r.chunkId === 'chunk_a').length, 0);
      store.close();
    });

    it('MSA-015: filters by container', async () => {
      const dbPath = join(tmpDir, 'search-container.db');
      const store = createUserStore(dbPath);

      await store.add([
        makeChunk('auth', 1, { container: 'auth' }),
        makeChunk('deploy', 2, { container: 'deployment' }),
      ]);

      const results = await store.search(makeVector(1), 10, { container: 'auth', minScore: 0 });
      assert.ok(results.every(r => r.container === 'auth'));
      store.close();
    });
  });

  // MSA-016..MSA-020: curation operations
  describe('curation operations', () => {
    it('MSA-016: pin marks entry as pinned', async () => {
      const dbPath = join(tmpDir, 'curation.db');
      const store = createUserStore(dbPath);
      await store.add([makeChunk('a', 1)]);
      await store.pin('chunk_a');
      const row = store._db.prepare('SELECT pinned FROM memories WHERE chunk_id = ?').get('chunk_a');
      assert.equal(row.pinned, 1);
      store.close();
    });

    it('MSA-017: archive marks entry as archived', async () => {
      const dbPath = join(tmpDir, 'archive.db');
      const store = createUserStore(dbPath);
      await store.add([makeChunk('a', 1)]);
      await store.archive('chunk_a');
      const row = store._db.prepare('SELECT archived FROM memories WHERE chunk_id = ?').get('chunk_a');
      assert.equal(row.archived, 1);
      store.close();
    });

    it('MSA-018: tag sets tags array', async () => {
      const dbPath = join(tmpDir, 'tag.db');
      const store = createUserStore(dbPath);
      await store.add([makeChunk('a', 1)]);
      await store.tag('chunk_a', ['architecture', 'security']);
      const row = store._db.prepare('SELECT tags FROM memories WHERE chunk_id = ?').get('chunk_a');
      assert.deepEqual(JSON.parse(row.tags), ['architecture', 'security']);
      store.close();
    });

    it('MSA-019: incrementAccess updates counters', async () => {
      const dbPath = join(tmpDir, 'access.db');
      const store = createUserStore(dbPath);
      await store.add([makeChunk('a', 1)]);
      await store.incrementAccess(['chunk_a']);
      const row = store._db.prepare('SELECT accessed_count, appeared_count FROM memories WHERE chunk_id = ?').get('chunk_a');
      assert.equal(row.accessed_count, 1);
      assert.equal(row.appeared_count, 2);
      store.close();
    });
  });

  // MSA-021..MSA-024: getModel, getCount, prune
  describe('getModel / getCount / prune', () => {
    it('MSA-021: getModel returns embed model name', async () => {
      const dbPath = join(tmpDir, 'model.db');
      const store = createUserStore(dbPath);
      await store.add([makeChunk('a', 1, { embedModel: 'openai' })]);
      const model = await store.getModel();
      assert.equal(model, 'openai');
      store.close();
    });

    it('MSA-022: getModel returns null when empty', async () => {
      const dbPath = join(tmpDir, 'model-empty.db');
      const store = createUserStore(dbPath);
      const model = await store.getModel();
      assert.equal(model, null);
      store.close();
    });

    it('MSA-023: getCount returns non-archived count', async () => {
      const dbPath = join(tmpDir, 'count.db');
      const store = createUserStore(dbPath);
      await store.add([makeChunk('a', 1), makeChunk('b', 2)]);
      await store.archive('chunk_a');
      const count = await store.getCount();
      assert.equal(count, 1);
      store.close();
    });

    it('MSA-024: prune removes lowest-scored non-pinned entries', async () => {
      const dbPath = join(tmpDir, 'prune.db');
      const store = createUserStore(dbPath);

      // Use orthogonal-ish vectors to avoid dedup
      const vecs = [
        new Float32Array([1, 0, 0, 0]),
        new Float32Array([0, 1, 0, 0]),
        new Float32Array([0, 0, 1, 0]),
        new Float32Array([0, 0, 0, 1]),
        new Float32Array([0.5, 0.5, 0, 0]),
      ];
      // Normalize
      for (const v of vecs) {
        const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        for (let i = 0; i < v.length; i++) v[i] /= n;
      }

      for (let i = 0; i < 5; i++) {
        await store.add([makeChunk(`c${i}`, i * 10, { importance: i + 1, vector: vecs[i] })]);
      }
      assert.equal(await store.getCount(), 5);

      // Pin the lowest importance one
      await store.pin('chunk_c0');

      // Prune to 3
      const result = await store.prune(3);
      assert.equal(result.removed, 2);

      const remaining = await store.getCount();
      assert.equal(remaining, 3);

      // Pinned entry should survive
      const row = store._db.prepare('SELECT chunk_id FROM memories WHERE chunk_id = ?').get('chunk_c0');
      assert.ok(row, 'Pinned entry should survive pruning');
      store.close();
    });
  });

  // MSA-025: remove with filter
  describe('remove()', () => {
    it('MSA-025: removes entries older than threshold', async () => {
      const dbPath = join(tmpDir, 'remove.db');
      const store = createUserStore(dbPath);

      const oldDate = new Date('2020-01-01').toISOString();
      const newDate = new Date().toISOString();

      await store.add([
        makeChunk('old', 1, { timestamp: oldDate }),
        makeChunk('new', 2, { timestamp: newDate }),
      ]);

      const result = await store.remove({ olderThan: new Date('2023-01-01') });
      assert.equal(result.removed, 1);

      const count = await store.getCount();
      assert.equal(count, 1);
      store.close();
    });

    it('MSA-026: never removes pinned entries', async () => {
      const dbPath = join(tmpDir, 'remove-pinned.db');
      const store = createUserStore(dbPath);

      await store.add([makeChunk('a', 1, { timestamp: '2020-01-01T00:00:00Z' })]);
      await store.pin('chunk_a');

      const result = await store.remove({ olderThan: new Date() });
      assert.equal(result.removed, 0);
      store.close();
    });
  });

  // MSA-027: rebuild
  it('MSA-027: rebuild clears and repopulates store', async () => {
    const dbPath = join(tmpDir, 'rebuild.db');
    const store = createUserStore(dbPath);

    await store.add([makeChunk('old', 1)]);
    assert.equal(await store.getCount(), 1);

    const chunks = [makeChunk('new1', 10), makeChunk('new2', 20)];
    const result = await store.rebuild(chunks, { provider: 'test-model' });

    assert.equal(result.vectorCount, 2);
    assert.equal(await store.getCount(), 2);
    store.close();
  });

  // MSA-002: Opens existing DB without data loss
  it('MSA-002: opens existing DB without data loss', async () => {
    const dbPath = join(tmpDir, 'existing.db');
    const store1 = createUserStore(dbPath);
    await store1.add([makeChunk('a', 1), makeChunk('b', 2)]);
    store1.close();

    const store2 = createUserStore(dbPath);
    const count = await store2.getCount();
    assert.equal(count, 2);
    store2.close();
  });
});

// ---------------------------------------------------------------------------
// createProjectStore — .emb Backend
// ---------------------------------------------------------------------------

describe('createProjectStore', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // MSA-004: creates .emb on first add
  it('MSA-004: creates .emb file on first add', async () => {
    const embPath = join(tmpDir, 'test.emb');
    const store = createProjectStore(embPath);

    await store.add([makeChunk('a', 1)]);
    assert.ok(existsSync(embPath), '.emb file should be created');
    store.close();
  });

  // MSA-028: returns MemoryStore interface
  it('MSA-028: returns all MemoryStore interface methods', () => {
    const embPath = join(tmpDir, 'iface.emb');
    const store = createProjectStore(embPath);
    const methods = ['search', 'add', 'remove', 'incrementAccess', 'pin', 'archive', 'tag', 'getModel', 'getCount', 'prune', 'rebuild', 'close'];
    for (const m of methods) {
      assert.equal(typeof store[m], 'function', `Missing method: ${m}`);
    }
    store.close();
  });

  // MSA-029: rejects path traversal
  it('MSA-029: rejects path with ..', () => {
    assert.throws(() => createProjectStore('../test.emb'), /path traversal/);
  });

  // MSA-030: add and search
  it('MSA-030: add then search returns matching results', async () => {
    const embPath = join(tmpDir, 'search.emb');
    const store = createProjectStore(embPath);

    await store.add([
      makeChunk('a', 1, { content: 'Architecture decision about auth' }),
      makeChunk('b', 100, { content: 'Deployment pipeline changes' }),
    ]);

    const queryVec = makeVector(1);
    const results = await store.search(queryVec, 5, { minScore: 0 });

    assert.ok(results.length >= 1);
    assert.ok(results[0].layer === 'project');
    store.close();
  });

  // MSA-031: 4-tier dedup in project store
  it('MSA-031: rejects near-identical in project store', async () => {
    const embPath = join(tmpDir, 'dedup.emb');
    const store = createProjectStore(embPath);

    const vec = makeVector(1);
    await store.add([makeChunk('a', 1, { vector: vec })]);
    const r2 = await store.add([makeChunk('b', 1, { vector: new Float32Array(vec) })]);
    assert.equal(r2.rejected, 1);
    store.close();
  });

  // MSA-032: curation in project store
  it('MSA-032: pin/archive/tag work in project store', async () => {
    const embPath = join(tmpDir, 'curation.emb');
    const store = createProjectStore(embPath);

    await store.add([makeChunk('a', 1)]);
    await store.pin('chunk_a');
    await store.tag('chunk_a', ['security']);

    const entries = store._getEntries();
    const entry = entries.find(e => e.chunkId === 'chunk_a');
    assert.ok(entry.pinned);
    assert.deepEqual(entry.tags, ['security']);

    await store.archive('chunk_a');
    const archived = entries.find(e => e.chunkId === 'chunk_a');
    assert.ok(archived.archived);
    store.close();
  });

  // MSA-033: getModel and getCount
  it('MSA-033: getModel returns model name after add', async () => {
    const embPath = join(tmpDir, 'model.emb');
    const store = createProjectStore(embPath);

    await store.add([makeChunk('a', 1, { embedModel: 'codebert' })]);
    const model = await store.getModel();
    assert.equal(model, 'codebert');
    store.close();
  });

  // MSA-034: prune in project store
  it('MSA-034: prune removes lowest-scored entries', async () => {
    const embPath = join(tmpDir, 'prune.emb');
    const store = createProjectStore(embPath);

    // Use orthogonal vectors to avoid dedup
    const vecs = [
      new Float32Array([1, 0, 0, 0]),
      new Float32Array([0, 1, 0, 0]),
      new Float32Array([0, 0, 1, 0]),
      new Float32Array([0, 0, 0, 1]),
      new Float32Array([0.5, 0.5, 0, 0]),
    ];
    for (const v of vecs) {
      const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
      for (let i = 0; i < v.length; i++) v[i] /= n;
    }

    for (let i = 0; i < 5; i++) {
      await store.add([makeChunk(`c${i}`, i * 10, { importance: i + 1, vector: vecs[i] })]);
    }
    assert.equal(await store.getCount(), 5);

    const result = await store.prune(3);
    assert.equal(result.removed, 2);

    const count = await store.getCount();
    assert.equal(count, 3);
    store.close();
  });

  // MSA-035: persistence across open/close
  it('MSA-035: data persists in .emb file across open/close', async () => {
    const embPath = join(tmpDir, 'persist.emb');
    const store1 = createProjectStore(embPath);
    await store1.add([makeChunk('a', 1, { content: 'Persistent memory' })]);
    store1.close();

    const store2 = createProjectStore(embPath);
    const count = await store2.getCount();
    assert.ok(count >= 1, 'Data should persist across open/close');
    store2.close();
  });

  // MSA-036: fail-open on missing .emb file
  it('MSA-036: starts with empty store when .emb missing', async () => {
    const embPath = join(tmpDir, 'nonexistent.emb');
    const store = createProjectStore(embPath);
    const count = await store.getCount();
    assert.equal(count, 0);
    store.close();
  });

  // MSA-037: incrementAccess in project store
  it('MSA-037: incrementAccess updates counters', async () => {
    const embPath = join(tmpDir, 'access.emb');
    const store = createProjectStore(embPath);

    await store.add([makeChunk('a', 1)]);
    await store.incrementAccess(['chunk_a']);

    const entries = store._getEntries();
    const entry = entries.find(e => e.chunkId === 'chunk_a');
    assert.equal(entry.accessed_count, 1);
    assert.equal(entry.appeared_count, 2);
    store.close();
  });

  // MSA-038: remove with olderThan filter
  it('MSA-038: remove filters by olderThan', async () => {
    const embPath = join(tmpDir, 'remove.emb');
    const store = createProjectStore(embPath);

    await store.add([
      makeChunk('old', 1, { timestamp: '2020-01-01T00:00:00Z' }),
      makeChunk('new', 2, { timestamp: new Date().toISOString() }),
    ]);

    const result = await store.remove({ olderThan: new Date('2023-01-01') });
    assert.equal(result.removed, 1);
    store.close();
  });

  // MSA-039: rebuild
  it('MSA-039: rebuild clears and repopulates', async () => {
    const embPath = join(tmpDir, 'rebuild.emb');
    const store = createProjectStore(embPath);

    await store.add([makeChunk('old', 1)]);
    const chunks = [makeChunk('new1', 10), makeChunk('new2', 20)];
    const result = await store.rebuild(chunks, { provider: 'test' });

    assert.equal(result.vectorCount, 2);
    assert.equal(await store.getCount(), 2);
    store.close();
  });

  // MSA-040: container filtering in project store
  it('MSA-040: filters by container in search', async () => {
    const embPath = join(tmpDir, 'container.emb');
    const store = createProjectStore(embPath);

    await store.add([
      makeChunk('auth', 1, { container: 'auth' }),
      makeChunk('deploy', 2, { container: 'deployment' }),
    ]);

    const results = await store.search(makeVector(1), 10, { container: 'auth', minScore: 0 });
    assert.ok(results.every(r => !r.container || r.container === 'auth'));
    store.close();
  });

  // MSA-052: getByIds works for project (.emb) store
  it('MSA-052: getByIds returns results from project store', async () => {
    const embPath = join(tmpDir, 'getbyids.emb');
    const store = createProjectStore(embPath);
    const vecs = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0]), new Float32Array([0, 0, 1, 0])];
    await store.add([
      makeChunk('a', 1, { vector: vecs[0] }),
      makeChunk('b', 2, { vector: vecs[1] }),
      makeChunk('c', 3, { vector: vecs[2] }),
    ]);
    const results = await store.getByIds(['chunk_a', 'chunk_c']);
    assert.equal(results.length, 2);
    assert.equal(results[0].chunkId, 'chunk_a');
    assert.equal(results[1].chunkId, 'chunk_c');
    store.close();
  });

  // MSA-058: updateLinks works for project (.emb) store
  it('MSA-058: updateLinks appends to project store entry', async () => {
    const embPath = join(tmpDir, 'links.emb');
    const store = createProjectStore(embPath);
    await store.add([makeChunk('a', 1)]);
    await store.updateLinks('chunk_a', [
      { targetChunkId: 'chunk_b', relationType: 'related_to', createdAt: new Date().toISOString(), createdBy: 'search' },
    ]);
    const entries = store._getEntries();
    const entry = entries.find(e => e.chunkId === 'chunk_a');
    assert.equal(entry.links.length, 1);
    assert.equal(entry.links[0].relationType, 'related_to');
    store.close();
  });
});

// ---------------------------------------------------------------------------
// REQ-0066: Schema Migration, getByIds, updateLinks (User Store)
// ---------------------------------------------------------------------------

describe('REQ-0066: createUserStore — schema migration & new methods', () => {
  let tmpDir;

  beforeEach(() => { tmpDir = createTempDir(); });
  afterEach(() => { cleanupTempDir(tmpDir); });

  // MSA-043: adds links column on first open
  it('MSA-043: adds links column on first open', () => {
    const dbPath = join(tmpDir, 'migration.db');
    const store = createUserStore(dbPath);
    const cols = store._db.pragma('table_info(memories)');
    assert.ok(cols.some(c => c.name === 'links'), 'links column should exist');
    store.close();
  });

  // MSA-044: does not error on re-open with links column
  it('MSA-044: does not error on re-open with links column', () => {
    const dbPath = join(tmpDir, 're-open.db');
    const store1 = createUserStore(dbPath);
    store1.close();
    const store2 = createUserStore(dbPath);
    const cols = store2._db.pragma('table_info(memories)');
    assert.ok(cols.some(c => c.name === 'links'));
    store2.close();
  });

  // MSA-045: preserves existing data during migration
  it('MSA-045: preserves existing data during migration', async () => {
    const dbPath = join(tmpDir, 'preserve.db');
    const store = createUserStore(dbPath);
    const vecs = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0])];
    await store.add([makeChunk('a', 1, { vector: vecs[0] }), makeChunk('b', 2, { vector: vecs[1] })]);
    const count = await store.getCount();
    assert.equal(count, 2);
    // Verify links default to empty array
    const row = store._db.prepare('SELECT links FROM memories WHERE chunk_id = ?').get('chunk_a');
    const links = JSON.parse(row.links);
    assert.deepEqual(links, []);
    store.close();
  });

  // MSA-046: links column stores valid JSON array
  it('MSA-046: links column stores valid JSON array', async () => {
    const dbPath = join(tmpDir, 'json-links.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    const testLink = { targetChunkId: 'chunk_b', relationType: 'builds_on', createdAt: '2026-03-15T00:00:00Z', createdBy: 'curator' };
    await store.updateLinks('chunk_a', [testLink]);
    const row = store._db.prepare('SELECT links FROM memories WHERE chunk_id = ?').get('chunk_a');
    const parsed = JSON.parse(row.links);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].relationType, 'builds_on');
    assert.equal(parsed[0].createdBy, 'curator');
    store.close();
  });

  // MSA-047: returns results for found IDs
  it('MSA-047: getByIds returns results for found IDs', async () => {
    const dbPath = join(tmpDir, 'getbyids.db');
    const store = createUserStore(dbPath);
    const vecs = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0]), new Float32Array([0, 0, 1, 0])];
    await store.add([
      makeChunk('a', 1, { vector: vecs[0] }),
      makeChunk('b', 2, { vector: vecs[1] }),
      makeChunk('c', 3, { vector: vecs[2] }),
    ]);
    const results = await store.getByIds(['chunk_a', 'chunk_c']);
    assert.equal(results.length, 2);
    assert.equal(results[0].chunkId, 'chunk_a');
    assert.equal(results[1].chunkId, 'chunk_c');
    store.close();
  });

  // MSA-048: excludes archived chunks
  it('MSA-048: getByIds excludes archived chunks', async () => {
    const dbPath = join(tmpDir, 'archived.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    await store.archive('chunk_a');
    const results = await store.getByIds(['chunk_a']);
    assert.equal(results.length, 0);
    store.close();
  });

  // MSA-049: silently excludes unfound IDs
  it('MSA-049: getByIds silently excludes unfound IDs', async () => {
    const dbPath = join(tmpDir, 'unfound.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    const results = await store.getByIds(['chunk_a', 'chunk_nonexistent']);
    assert.equal(results.length, 1);
    assert.equal(results[0].chunkId, 'chunk_a');
    store.close();
  });

  // MSA-050: returns empty array for empty input
  it('MSA-050: getByIds returns empty for empty input', async () => {
    const dbPath = join(tmpDir, 'empty-input.db');
    const store = createUserStore(dbPath);
    const results = await store.getByIds([]);
    assert.deepEqual(results, []);
    store.close();
  });

  // MSA-051: returns results in input order
  it('MSA-051: getByIds returns results in input order', async () => {
    const dbPath = join(tmpDir, 'order.db');
    const store = createUserStore(dbPath);
    const vecs = [new Float32Array([1, 0, 0, 0]), new Float32Array([0, 1, 0, 0]), new Float32Array([0, 0, 1, 0])];
    await store.add([
      makeChunk('a', 1, { vector: vecs[0] }),
      makeChunk('b', 2, { vector: vecs[1] }),
      makeChunk('c', 3, { vector: vecs[2] }),
    ]);
    const results = await store.getByIds(['chunk_c', 'chunk_a', 'chunk_b']);
    assert.equal(results[0].chunkId, 'chunk_c');
    assert.equal(results[1].chunkId, 'chunk_a');
    assert.equal(results[2].chunkId, 'chunk_b');
    store.close();
  });

  // MSA-053: appends links to existing array
  it('MSA-053: updateLinks appends links to existing array', async () => {
    const dbPath = join(tmpDir, 'append.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    await store.updateLinks('chunk_a', [
      { targetChunkId: 'chunk_b', relationType: 'related_to', createdAt: '2026-03-15T00:00:00Z', createdBy: 'search' },
      { targetChunkId: 'chunk_c', relationType: 'builds_on', createdAt: '2026-03-15T00:00:00Z', createdBy: 'curator' },
    ]);
    const row = store._db.prepare('SELECT links FROM memories WHERE chunk_id = ?').get('chunk_a');
    const links = JSON.parse(row.links);
    assert.equal(links.length, 2);
    store.close();
  });

  // MSA-054: validates relationType values
  it('MSA-054: updateLinks rejects invalid relationType', async () => {
    const dbPath = join(tmpDir, 'invalid-type.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    await store.updateLinks('chunk_a', [
      { targetChunkId: 'chunk_b', relationType: 'invalid_type', createdAt: '2026-03-15T00:00:00Z', createdBy: 'search' },
    ]);
    const row = store._db.prepare('SELECT links FROM memories WHERE chunk_id = ?').get('chunk_a');
    const links = JSON.parse(row.links);
    assert.equal(links.length, 0); // Invalid link should be rejected
    store.close();
  });

  // MSA-055: no-op for non-existent chunkId
  it('MSA-055: updateLinks is no-op for non-existent chunkId', async () => {
    const dbPath = join(tmpDir, 'noexist.db');
    const store = createUserStore(dbPath);
    // Should not throw
    await store.updateLinks('nonexistent', [
      { targetChunkId: 'chunk_b', relationType: 'related_to', createdAt: '2026-03-15T00:00:00Z', createdBy: 'search' },
    ]);
    store.close();
  });

  // MSA-056: appends to non-empty links array
  it('MSA-056: updateLinks appends to non-empty links array', async () => {
    const dbPath = join(tmpDir, 'non-empty.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    await store.updateLinks('chunk_a', [
      { targetChunkId: 'chunk_b', relationType: 'related_to', createdAt: '2026-03-15T00:00:00Z', createdBy: 'search' },
    ]);
    await store.updateLinks('chunk_a', [
      { targetChunkId: 'chunk_c', relationType: 'builds_on', createdAt: '2026-03-15T00:00:00Z', createdBy: 'curator' },
    ]);
    const row = store._db.prepare('SELECT links FROM memories WHERE chunk_id = ?').get('chunk_a');
    const links = JSON.parse(row.links);
    assert.equal(links.length, 2);
    store.close();
  });

  // MSA-057: link structure has required fields
  it('MSA-057: stored links have all required fields', async () => {
    const dbPath = join(tmpDir, 'fields.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    const link = { targetChunkId: 'chunk_b', relationType: 'supersedes', createdAt: '2026-03-15T10:00:00Z', createdBy: 'curator' };
    await store.updateLinks('chunk_a', [link]);
    const row = store._db.prepare('SELECT links FROM memories WHERE chunk_id = ?').get('chunk_a');
    const stored = JSON.parse(row.links)[0];
    assert.equal(stored.targetChunkId, 'chunk_b');
    assert.equal(stored.relationType, 'supersedes');
    assert.equal(stored.createdAt, '2026-03-15T10:00:00Z');
    assert.equal(stored.createdBy, 'curator');
    store.close();
  });

  // Search results include links
  it('MSA-EXT: search results include links field', async () => {
    const dbPath = join(tmpDir, 'search-links.db');
    const store = createUserStore(dbPath);
    await store.add([makeChunk('a', 1)]);
    await store.updateLinks('chunk_a', [
      { targetChunkId: 'chunk_b', relationType: 'related_to', createdAt: '2026-03-15T00:00:00Z', createdBy: 'search' },
    ]);
    const results = await store.search(makeVector(1), 10, { minScore: 0 });
    const match = results.find(r => r.chunkId === 'chunk_a');
    assert.ok(match, 'Should find chunk_a in search results');
    assert.ok(Array.isArray(match.links), 'links should be an array');
    assert.equal(match.links.length, 1);
    store.close();
  });
});
