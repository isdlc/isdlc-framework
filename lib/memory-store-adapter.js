/**
 * Memory Store Adapter — unified MemoryStore interface for dual backends.
 *
 * Provides two factory functions:
 *   - createUserStore(dbPath)    -> SQLite-backed MemoryStore (better-sqlite3)
 *   - createProjectStore(embPath) -> .emb-backed MemoryStore (package builder/reader)
 *
 * Both return objects implementing the MemoryStore interface:
 *   search, add (4-tier dedup), remove, incrementAccess, pin, archive, tag,
 *   getModel, getCount, prune, rebuild, close
 *
 * REQ-0064: FR-003 (AC-003-01..06), FR-013 (tiered dedup), FR-015 (curation),
 *           FR-004 (self-ranking)
 * Article X: Fail-Safe Defaults — graceful handling of missing/corrupt files
 * Article III: Security — parameterized SQL, path validation
 * Article XIII: ESM module system
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

// Dynamic import for better-sqlite3 (CJS native module)
const require = createRequire(import.meta.url);

/**
 * Cosine similarity between two Float32Arrays.
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} Similarity in [0, 1]
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return Math.max(0, Math.min(1, dot / denom));
}

/**
 * Self-ranking formula: cosine * (1 + log(1 + hit_rate)) * (1 + importance/20)
 * @param {number} cosine - Raw cosine similarity
 * @param {number} accessedCount
 * @param {number} appearedCount
 * @param {number} importance - 1-10
 * @returns {number} Final ranked score
 */
export function selfRankScore(cosine, accessedCount, appearedCount, importance) {
  const hitRate = appearedCount > 0 ? accessedCount / appearedCount : 0;
  return cosine * (1 + Math.log(1 + hitRate)) * (1 + importance / 20);
}

// ---------------------------------------------------------------------------
// SQLite User Store
// ---------------------------------------------------------------------------

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL UNIQUE,
  content TEXT NOT NULL,
  vector BLOB,
  dimensions INTEGER,
  embed_model TEXT,
  timestamp TEXT NOT NULL,
  importance INTEGER DEFAULT 5,
  appeared_count INTEGER DEFAULT 1,
  accessed_count INTEGER DEFAULT 0,
  is_latest INTEGER DEFAULT 1,
  pinned INTEGER DEFAULT 0,
  archived INTEGER DEFAULT 0,
  container TEXT,
  tags TEXT DEFAULT '[]',
  merge_history TEXT DEFAULT '[]',
  updates_ref TEXT,
  ttl TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(archived);
CREATE INDEX IF NOT EXISTS idx_memories_pinned ON memories(pinned);
CREATE INDEX IF NOT EXISTS idx_memories_is_latest ON memories(is_latest);
CREATE INDEX IF NOT EXISTS idx_memories_container ON memories(container);
`;

/**
 * Serialize a Float32Array to a Buffer for SQLite BLOB storage.
 * @param {Float32Array} vec
 * @returns {Buffer}
 */
function vectorToBuffer(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Deserialize a Buffer back to a Float32Array.
 * @param {Buffer} buf
 * @param {number} dimensions
 * @returns {Float32Array}
 */
function bufferToVector(buf, dimensions) {
  if (!buf || buf.length === 0) return new Float32Array(0);
  const ab = new ArrayBuffer(buf.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) view[i] = buf[i];
  return new Float32Array(ab, 0, dimensions);
}

/**
 * Perform 4-tier dedup check for a single chunk against existing store entries.
 * @param {object} db - SQLite database instance
 * @param {object} chunk - MemoryChunk
 * @returns {{ tier: 'reject'|'update'|'extend'|'new', existingId?: number, existingChunkId?: string }}
 */
function checkDedupTier(db, chunk) {
  // Get all non-archived, latest entries with vectors
  const rows = db.prepare(
    'SELECT id, chunk_id, content, vector, dimensions, appeared_count, merge_history FROM memories WHERE archived = 0 AND vector IS NOT NULL'
  ).all();

  let bestSim = 0;
  let bestRow = null;

  for (const row of rows) {
    if (!row.vector || !row.dimensions) continue;
    const existingVec = bufferToVector(row.vector, row.dimensions);
    const sim = cosineSimilarity(chunk.vector, existingVec);
    if (sim > bestSim) {
      bestSim = sim;
      bestRow = row;
    }
  }

  if (bestSim >= 0.95) {
    return { tier: 'reject', existingId: bestRow?.id, existingChunkId: bestRow?.chunk_id };
  }

  if (bestSim >= 0.85 && bestRow) {
    if (chunk.relationshipHint === 'updates') {
      return { tier: 'update', existingId: bestRow.id, existingChunkId: bestRow.chunk_id };
    }
    // 'extends' or null -> extend
    return { tier: 'extend', existingId: bestRow.id, existingChunkId: bestRow.chunk_id };
  }

  return { tier: 'new' };
}

/**
 * Create a SQLite-backed MemoryStore for user memory.
 * @param {string} dbPath - Path to SQLite database file
 * @returns {object} MemoryStore interface
 */
export function createUserStore(dbPath) {
  if (!dbPath || typeof dbPath !== 'string') {
    throw new Error('dbPath must be a non-empty string');
  }
  if (dbPath.includes('..')) {
    throw new Error('dbPath must not contain path traversal (..)');
  }

  // Ensure parent directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const Database = require('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);

  return {
    /**
     * Search for nearest neighbors with self-ranking.
     * @param {Float32Array} queryVector
     * @param {number} k
     * @param {object} [options]
     * @returns {Promise<object[]>} MemorySearchResult[]
     */
    async search(queryVector, k, options = {}) {
      const { minScore = 0, container } = options;

      let sql = 'SELECT * FROM memories WHERE archived = 0 AND vector IS NOT NULL';
      const params = [];
      if (container) {
        sql += ' AND container = ?';
        params.push(container);
      }

      const rows = db.prepare(sql).all(...params);
      const scored = [];

      for (const row of rows) {
        const vec = bufferToVector(row.vector, row.dimensions);
        const rawSim = cosineSimilarity(queryVector, vec);
        const finalScore = selfRankScore(rawSim, row.accessed_count, row.appeared_count, row.importance);

        if (finalScore >= minScore || row.pinned) {
          scored.push({
            content: row.content,
            score: finalScore,
            rawSimilarity: rawSim,
            layer: 'user',
            sessionId: row.session_id,
            timestamp: row.timestamp,
            chunkId: row.chunk_id,
            importance: row.importance,
            pinned: !!row.pinned,
            hitRate: row.appeared_count > 0 ? row.accessed_count / row.appeared_count : 0,
            container: row.container || undefined,
          });
        }
      }

      // Sort by score descending; pinned items always appear
      scored.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.score - a.score;
      });

      return scored.slice(0, k);
    },

    /**
     * Add chunks with 4-tier dedup.
     * @param {object[]} chunks - MemoryChunk[]
     * @returns {Promise<{ added: number, updated: number, extended: number, rejected: number }>}
     */
    async add(chunks) {
      let added = 0, updated = 0, extended = 0, rejected = 0;

      const insertStmt = db.prepare(`
        INSERT INTO memories (session_id, chunk_id, content, vector, dimensions, embed_model, timestamp, importance, container, tags, merge_history)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const markSupersededStmt = db.prepare(
        'UPDATE memories SET is_latest = 0, updated_at = datetime(\'now\') WHERE id = ?'
      );

      const extendStmt = db.prepare(`
        UPDATE memories SET content = ?, vector = ?, dimensions = ?, appeared_count = appeared_count + 1,
        merge_history = ?, updated_at = datetime('now') WHERE id = ?
      `);

      const addTransaction = db.transaction((chunks) => {
        for (const chunk of chunks) {
          const dedup = checkDedupTier(db, chunk);

          switch (dedup.tier) {
            case 'reject':
              rejected++;
              break;

            case 'update':
              // Mark old as superseded, insert new with updates_ref
              markSupersededStmt.run(dedup.existingId);
              db.prepare(`
                INSERT INTO memories (session_id, chunk_id, content, vector, dimensions, embed_model, timestamp, importance, container, tags, merge_history, updates_ref)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                chunk.sessionId,
                chunk.chunkId,
                chunk.content,
                vectorToBuffer(chunk.vector),
                chunk.vector.length,
                chunk.embedModel,
                chunk.timestamp,
                chunk.importance,
                chunk.container || null,
                JSON.stringify([]),
                JSON.stringify([]),
                dedup.existingChunkId,
              );
              updated++;
              break;

            case 'extend': {
              // Merge content and re-embed
              const existing = db.prepare('SELECT content, merge_history FROM memories WHERE id = ?').get(dedup.existingId);
              const mergedContent = existing.content + '\n' + chunk.content;
              let mergeHistory;
              try {
                mergeHistory = JSON.parse(existing.merge_history || '[]');
              } catch {
                mergeHistory = [];
              }
              mergeHistory.push(chunk.sessionId);

              extendStmt.run(
                mergedContent,
                vectorToBuffer(chunk.vector),
                chunk.vector.length,
                JSON.stringify(mergeHistory),
                dedup.existingId,
              );
              extended++;
              break;
            }

            case 'new':
              insertStmt.run(
                chunk.sessionId,
                chunk.chunkId,
                chunk.content,
                vectorToBuffer(chunk.vector),
                chunk.vector.length,
                chunk.embedModel,
                chunk.timestamp,
                chunk.importance,
                chunk.container || null,
                JSON.stringify([]),
                JSON.stringify(chunk.mergeHistory || []),
              );
              added++;
              break;
          }
        }
      });

      addTransaction(chunks);
      return { added, updated, extended, rejected };
    },

    /**
     * Remove entries matching filter criteria.
     * @param {object} filter
     * @returns {Promise<{ removed: number }>}
     */
    async remove(filter = {}) {
      let conditions = [];
      const params = [];

      if (filter.olderThan instanceof Date) {
        conditions.push('timestamp < ?');
        params.push(filter.olderThan.toISOString());
      }
      if (filter.archived === true) {
        conditions.push('archived = 1');
      }
      if (filter.expiredTtl === true) {
        conditions.push('ttl IS NOT NULL AND ttl < datetime(\'now\')');
      }

      // Never remove pinned entries
      conditions.push('pinned = 0');

      if (conditions.length === 0) {
        return { removed: 0 };
      }

      const sql = `DELETE FROM memories WHERE ${conditions.join(' AND ')}`;
      const result = db.prepare(sql).run(...params);
      return { removed: result.changes };
    },

    async incrementAccess(chunkIds) {
      if (!chunkIds || chunkIds.length === 0) return;
      const stmt = db.prepare(
        'UPDATE memories SET accessed_count = accessed_count + 1, appeared_count = appeared_count + 1, updated_at = datetime(\'now\') WHERE chunk_id = ?'
      );
      const txn = db.transaction((ids) => {
        for (const id of ids) stmt.run(id);
      });
      txn(chunkIds);
    },

    async pin(chunkId) {
      db.prepare('UPDATE memories SET pinned = 1, updated_at = datetime(\'now\') WHERE chunk_id = ?').run(chunkId);
    },

    async archive(chunkId) {
      db.prepare('UPDATE memories SET archived = 1, updated_at = datetime(\'now\') WHERE chunk_id = ?').run(chunkId);
    },

    async tag(chunkId, tags) {
      db.prepare('UPDATE memories SET tags = ?, updated_at = datetime(\'now\') WHERE chunk_id = ?')
        .run(JSON.stringify(tags), chunkId);
    },

    async getModel() {
      const row = db.prepare('SELECT embed_model FROM memories WHERE embed_model IS NOT NULL LIMIT 1').get();
      return row ? row.embed_model : null;
    },

    async getCount() {
      const row = db.prepare('SELECT COUNT(*) as cnt FROM memories WHERE archived = 0').get();
      return row ? row.cnt : 0;
    },

    /**
     * Prune to targetCount by removing lowest-scored non-pinned entries.
     * @param {number} targetCount
     * @returns {Promise<{ removed: number }>}
     */
    async prune(targetCount) {
      const currentCount = (await this.getCount());
      if (currentCount <= targetCount) return { removed: 0 };

      const toRemove = currentCount - targetCount;

      // Get all non-pinned, non-archived entries, compute score, sort ascending
      const rows = db.prepare(
        'SELECT id, accessed_count, appeared_count, importance FROM memories WHERE pinned = 0 AND archived = 0'
      ).all();

      const scored = rows.map(r => ({
        id: r.id,
        score: selfRankScore(0.5, r.accessed_count, r.appeared_count, r.importance),
      }));
      scored.sort((a, b) => a.score - b.score);

      const idsToRemove = scored.slice(0, toRemove).map(s => s.id);

      if (idsToRemove.length > 0) {
        const placeholders = idsToRemove.map(() => '?').join(',');
        db.prepare(`DELETE FROM memories WHERE id IN (${placeholders})`).run(...idsToRemove);
      }

      return { removed: idsToRemove.length };
    },

    async rebuild(chunks, engineConfig) {
      // Clear all entries and rebuild from scratch
      db.prepare('DELETE FROM memories').run();
      const result = await this.add(chunks);
      return { vectorCount: result.added + result.updated + result.extended };
    },

    close() {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
    },

    // Expose db for testing internal state
    _db: db,
  };
}

// ---------------------------------------------------------------------------
// .emb Project Store
// ---------------------------------------------------------------------------

/**
 * Create an .emb-backed MemoryStore for project memory.
 * @param {string} embPath - Path to .emb file
 * @returns {object} MemoryStore interface
 */
export function createProjectStore(embPath) {
  if (!embPath || typeof embPath !== 'string') {
    throw new Error('embPath must be a non-empty string');
  }
  if (embPath.includes('..')) {
    throw new Error('embPath must not contain path traversal (..)');
  }

  // In-memory state for the project store
  let entries = []; // Array of { chunkId, sessionId, content, vector, timestamp, embedModel, importance, pinned, archived, is_latest, tags, container, appeared_count, accessed_count, updates_ref, merge_history, ttl }
  let modelName = null;
  let dimensions = 0;

  // Try to load existing .emb package
  if (existsSync(embPath)) {
    try {
      // Dynamic import would complicate things; read synchronously
      const { readFileSync } = await_import_fs();
      const tarBuf = readFileSync(embPath);
      const parsed = parseTarSync(tarBuf);

      if (parsed.manifest) {
        modelName = parsed.manifest.model || null;
        dimensions = parsed.manifest.dimensions || 0;
      }

      if (parsed.metadata && Array.isArray(parsed.metadata)) {
        entries = parsed.metadata.map(m => ({
          chunkId: m.chunkId || m.id || `chunk-${Math.random().toString(36).slice(2, 10)}`,
          sessionId: m.sessionId || '',
          content: m.content || '',
          vector: null, // Will be populated from index
          timestamp: m.timestamp || '',
          embedModel: modelName,
          importance: m.importance || 5,
          pinned: !!m.pinned,
          archived: !!m.archived,
          is_latest: m.is_latest !== false,
          tags: m.tags || [],
          container: m.container || null,
          appeared_count: m.appeared_count || 1,
          accessed_count: m.accessed_count || 0,
          updates_ref: m.updates_ref || null,
          merge_history: m.merge_history || [],
          ttl: m.ttl || null,
        }));
      }

      if (parsed.vectors && parsed.vectors.length > 0) {
        for (let i = 0; i < Math.min(entries.length, parsed.vectors.length); i++) {
          entries[i].vector = parsed.vectors[i];
        }
      }
    } catch {
      // Fail-open: start with empty store
      entries = [];
    }
  }

  /**
   * Persist current state to .emb file.
   */
  function persistToEmb() {
    try {
      const dir = dirname(embPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const activeEntries = entries.filter(e => !e.archived);
      const vectors = activeEntries.filter(e => e.vector).map(e => e.vector);
      const chunks = activeEntries.map(e => ({
        id: e.chunkId,
        chunkId: e.chunkId,
        sessionId: e.sessionId,
        content: e.content,
        filePath: '',
        startLine: 0,
        endLine: 0,
        type: 'memory',
        language: 'text',
        timestamp: e.timestamp,
        importance: e.importance,
        pinned: e.pinned,
        archived: e.archived,
        is_latest: e.is_latest,
        tags: e.tags,
        container: e.container,
        appeared_count: e.appeared_count,
        accessed_count: e.accessed_count,
        updates_ref: e.updates_ref,
        merge_history: e.merge_history,
        ttl: e.ttl,
      }));

      // Use the builder's serialization directly
      const { writeFileSync: wfs } = await_import_fs();
      const indexBuf = serializeVectors(vectors, dimensions || (vectors[0]?.length || 0));
      const metadataBuf = Buffer.from(JSON.stringify(chunks), 'utf-8');

      const manifest = {
        moduleId: 'roundtable-memory',
        version: '1.0.0',
        model: modelName || 'unknown',
        dimensions: dimensions || (vectors[0]?.length || 0),
        chunkCount: chunks.length,
        tier: 'full',
        encrypted: false,
      };
      const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');

      const tarBuf = createSimpleTar([
        { name: 'manifest.json', data: manifestBuf },
        { name: 'index.faiss', data: indexBuf },
        { name: 'metadata.sqlite', data: metadataBuf },
      ]);

      wfs(embPath, tarBuf);
    } catch {
      // Fail-open: don't crash on write failure
    }
  }

  return {
    async search(queryVector, k, options = {}) {
      const { minScore = 0, container } = options;
      const scored = [];

      for (const entry of entries) {
        if (entry.archived) continue;
        if (!entry.vector) continue;
        if (container && entry.container !== container) continue;

        const rawSim = cosineSimilarity(queryVector, entry.vector);
        // Project store uses simpler scoring (no self-ranking hit_rate boost)
        const importanceBoost = 1 + entry.importance / 20;
        const finalScore = rawSim * importanceBoost;

        if (finalScore >= minScore || entry.pinned) {
          scored.push({
            content: entry.content,
            score: finalScore,
            rawSimilarity: rawSim,
            layer: 'project',
            sessionId: entry.sessionId,
            timestamp: entry.timestamp,
            chunkId: entry.chunkId,
            importance: entry.importance,
            pinned: entry.pinned,
            container: entry.container || undefined,
          });
        }
      }

      scored.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.score - a.score;
      });

      return scored.slice(0, k);
    },

    async add(chunks) {
      let added = 0, updated = 0, extended = 0, rejected = 0;

      for (const chunk of chunks) {
        // 4-tier dedup against existing entries
        let bestSim = 0;
        let bestEntry = null;

        for (const entry of entries) {
          if (entry.archived || !entry.vector) continue;
          const sim = cosineSimilarity(chunk.vector, entry.vector);
          if (sim > bestSim) {
            bestSim = sim;
            bestEntry = entry;
          }
        }

        if (bestSim >= 0.95) {
          rejected++;
          continue;
        }

        if (bestSim >= 0.85 && bestEntry) {
          if (chunk.relationshipHint === 'updates') {
            bestEntry.is_latest = false;
            entries.push({
              chunkId: chunk.chunkId,
              sessionId: chunk.sessionId,
              content: chunk.content,
              vector: chunk.vector,
              timestamp: chunk.timestamp,
              embedModel: chunk.embedModel,
              importance: chunk.importance,
              pinned: false,
              archived: false,
              is_latest: true,
              tags: [],
              container: chunk.container || null,
              appeared_count: 1,
              accessed_count: 0,
              updates_ref: bestEntry.chunkId,
              merge_history: [],
              ttl: null,
            });
            if (dimensions === 0) dimensions = chunk.vector.length;
            if (!modelName) modelName = chunk.embedModel;
            updated++;
          } else {
            // Extend
            bestEntry.content += '\n' + chunk.content;
            bestEntry.vector = chunk.vector;
            bestEntry.appeared_count++;
            bestEntry.merge_history.push(chunk.sessionId);
            extended++;
          }
          continue;
        }

        // New entry
        entries.push({
          chunkId: chunk.chunkId,
          sessionId: chunk.sessionId,
          content: chunk.content,
          vector: chunk.vector,
          timestamp: chunk.timestamp,
          embedModel: chunk.embedModel,
          importance: chunk.importance,
          pinned: false,
          archived: false,
          is_latest: true,
          tags: [],
          container: chunk.container || null,
          appeared_count: 1,
          accessed_count: 0,
          updates_ref: null,
          merge_history: chunk.mergeHistory || [],
          ttl: null,
        });
        if (dimensions === 0) dimensions = chunk.vector.length;
        if (!modelName) modelName = chunk.embedModel;
        added++;
      }

      persistToEmb();
      return { added, updated, extended, rejected };
    },

    async remove(filter = {}) {
      const before = entries.length;
      entries = entries.filter(e => {
        if (e.pinned) return true; // Never remove pinned
        if (filter.olderThan instanceof Date && new Date(e.timestamp) < filter.olderThan) return false;
        if (filter.archived === true && e.archived) return false;
        if (filter.expiredTtl === true && e.ttl && new Date(e.ttl) < new Date()) return false;
        return true;
      });
      const removed = before - entries.length;
      if (removed > 0) persistToEmb();
      return { removed };
    },

    async incrementAccess(chunkIds) {
      if (!chunkIds || chunkIds.length === 0) return;
      for (const id of chunkIds) {
        const entry = entries.find(e => e.chunkId === id);
        if (entry) {
          entry.accessed_count++;
          entry.appeared_count++;
        }
      }
      persistToEmb();
    },

    async pin(chunkId) {
      const entry = entries.find(e => e.chunkId === chunkId);
      if (entry) {
        entry.pinned = true;
        persistToEmb();
      }
    },

    async archive(chunkId) {
      const entry = entries.find(e => e.chunkId === chunkId);
      if (entry) {
        entry.archived = true;
        persistToEmb();
      }
    },

    async tag(chunkId, tags) {
      const entry = entries.find(e => e.chunkId === chunkId);
      if (entry) {
        entry.tags = tags;
        persistToEmb();
      }
    },

    async getModel() {
      return modelName;
    },

    async getCount() {
      return entries.filter(e => !e.archived).length;
    },

    async prune(targetCount) {
      const active = entries.filter(e => !e.archived);
      if (active.length <= targetCount) return { removed: 0 };

      const toRemove = active.length - targetCount;

      // Score entries, sort ascending, remove lowest
      const scored = active
        .filter(e => !e.pinned)
        .map(e => ({
          entry: e,
          score: (1 + e.importance / 20) * (e.appeared_count > 0 ? (1 + Math.log(1 + e.accessed_count / e.appeared_count)) : 1),
        }));
      scored.sort((a, b) => a.score - b.score);

      const entriesToRemove = new Set(scored.slice(0, toRemove).map(s => s.entry.chunkId));
      const before = entries.length;
      entries = entries.filter(e => !entriesToRemove.has(e.chunkId));
      const removed = before - entries.length;
      if (removed > 0) persistToEmb();
      return { removed };
    },

    async rebuild(chunks, engineConfig) {
      entries = [];
      dimensions = chunks[0]?.vector?.length || 0;
      modelName = engineConfig?.provider || null;
      const result = await this.add(chunks);
      return { vectorCount: result.added + result.updated + result.extended };
    },

    close() {
      // No-op for .emb store
    },

    // Expose for testing
    _getEntries() { return entries; },
  };
}

// ---------------------------------------------------------------------------
// Helper functions for .emb I/O
// ---------------------------------------------------------------------------

function await_import_fs() {
  // Use synchronous fs
  const { readFileSync, writeFileSync, existsSync: exists, mkdirSync: mkd } = require('node:fs');
  return { readFileSync, writeFileSync, existsSync: exists, mkdirSync: mkd };
}

/**
 * Parse a tar buffer synchronously.
 */
function parseTarSync(tarBuf) {
  const result = { manifest: null, metadata: [], vectors: [] };

  let offset = 0;
  while (offset < tarBuf.length - 512) {
    const header = tarBuf.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) break;

    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++;
    const name = header.subarray(0, nameEnd).toString('utf-8');

    const sizeStr = header.subarray(124, 135).toString('utf-8').trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;
    const data = Buffer.from(tarBuf.subarray(offset, offset + size));

    if (name === 'manifest.json') {
      try {
        result.manifest = JSON.parse(data.toString('utf-8'));
      } catch { /* ignore */ }
    } else if (name === 'metadata.sqlite') {
      try {
        result.metadata = JSON.parse(data.toString('utf-8'));
      } catch { /* ignore */ }
    } else if (name === 'index.faiss') {
      // Deserialize vectors
      if (data.length >= 8) {
        const dims = data.readUInt32LE(0);
        const count = data.readUInt32LE(4);
        let voffset = 8;
        for (let i = 0; i < count; i++) {
          const vec = new Float32Array(dims);
          for (let d = 0; d < dims; d++) {
            vec[d] = data.readFloatLE(voffset);
            voffset += 4;
          }
          result.vectors.push(vec);
        }
      }
    }

    offset += size;
    const remainder = size % 512;
    if (remainder > 0) offset += 512 - remainder;
  }

  return result;
}

/**
 * Serialize vectors to flat index buffer.
 */
function serializeVectors(vectors, dims) {
  if (vectors.length === 0) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(dims, 0);
    return buf;
  }

  const headerSize = 8;
  const dataSize = vectors.length * dims * 4;
  const buf = Buffer.alloc(headerSize + dataSize);
  buf.writeUInt32LE(dims, 0);
  buf.writeUInt32LE(vectors.length, 4);

  let offset = headerSize;
  for (const vec of vectors) {
    for (let i = 0; i < dims; i++) {
      buf.writeFloatLE(vec[i] || 0, offset);
      offset += 4;
    }
  }

  return buf;
}

/**
 * Create a simple tar archive.
 */
function createSimpleTar(entries) {
  const blocks = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512);
    const name = entry.name;
    header.write(name, 0, Math.min(name.length, 100), 'utf-8');
    header.write('0000644\0', 100, 8, 'utf-8');
    header.write('0001000\0', 108, 8, 'utf-8');
    header.write('0001000\0', 116, 8, 'utf-8');
    const sizeOctal = entry.data.length.toString(8).padStart(11, '0');
    header.write(sizeOctal + '\0', 124, 12, 'utf-8');
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
    header.write(mtime + '\0', 136, 12, 'utf-8');
    header.write('0', 156, 1, 'utf-8');
    header.write('ustar\0', 257, 6, 'utf-8');
    header.write('00', 263, 2, 'utf-8');

    header.fill(0x20, 148, 156);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    const checksumOctal = checksum.toString(8).padStart(6, '0');
    header.write(checksumOctal + '\0 ', 148, 8, 'utf-8');

    blocks.push(header);
    blocks.push(entry.data);

    const remainder = entry.data.length % 512;
    if (remainder > 0) blocks.push(Buffer.alloc(512 - remainder));
  }

  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}
