/**
 * Memory Embedder — async embedding orchestrator for enriched session records.
 *
 * Accepts an EnrichedSessionRecord, chunks the NL content, generates embeddings,
 * and appends to both user (SQLite) and project (.emb) stores via the
 * MemoryStore interface from memory-store-adapter.js.
 *
 * Exports:
 *   - embedSession(record, userStore, projectStore, engineConfig, options)
 *   - rebuildIndex(sessionsDir, indexPath, engineConfig)
 *
 * REQ-0064: FR-005 (AC-005-01..04), FR-013 (tiered dedup), FR-012 (embedding)
 * Article X: Fail-Safe Defaults — never throws, returns error in result
 * Article XIII: ESM module system
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Embed an enriched session record into both user and project stores.
 *
 * @param {object} record - EnrichedSessionRecord
 * @param {object} userStore - MemoryStore (SQLite)
 * @param {object} projectStore - MemoryStore (.emb)
 * @param {object} engineConfig - ModelConfig
 * @param {object} [deps] - Injectable dependencies for testing
 * @param {function} [deps.embed] - embed(texts, config) -> EmbeddingResult
 * @param {function} [deps.chunkDocument] - chunkDocument(text, options) -> DocumentChunk[]
 * @param {object} [options]
 * @param {number} [options.capacityLimit=500]
 * @returns {Promise<{ embedded: boolean, vectorsAdded: number, updated: number, extended: number, rejected: number, pruned: number, error?: string }>}
 */
export async function embedSession(record, userStore, projectStore, engineConfig, deps = {}, options = {}) {
  try {
    // Validate required fields
    if (!record || !record.summary) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, error: 'Record missing summary field' };
    }

    if (!engineConfig || !engineConfig.provider) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, error: 'Missing engine config' };
    }

    const embedFn = deps.embed || (await importEmbed());
    const chunkFn = deps.chunkDocument || (await importChunkDocument());
    const capacityLimit = options.capacityLimit || 500;

    // Step 1: Extract embeddable text
    const texts = [record.summary];
    const contextNotes = record.context_notes || [];
    for (const note of contextNotes) {
      if (note && note.content) {
        texts.push(note.content);
      }
    }

    // Step 2: Chunk text
    const allChunks = [];
    for (const text of texts) {
      const docChunks = chunkFn(text, { format: 'text', maxTokens: 256 });
      allChunks.push(...docChunks);
    }

    if (allChunks.length === 0) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, error: 'No chunks generated' };
    }

    // Step 3: Embed chunks
    const chunkTexts = allChunks.map(c => c.content);
    const embeddingResult = await embedFn(chunkTexts, engineConfig);

    if (!embeddingResult || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, error: 'Embedding returned no vectors' };
    }

    // Step 4: Build MemoryChunk[] with importance and relationship hints
    const sessionId = record.session_id || `sess_${Date.now()}`;
    const timestamp = record.timestamp || new Date().toISOString();
    const importance = typeof record.importance === 'number' ? record.importance : 5;
    const container = record.container || null;

    const memoryChunks = embeddingResult.vectors.map((vec, i) => {
      const chunk = allChunks[i] || {};
      // Determine relationship_hint: context_notes have them, summary does not
      let relationshipHint = null;
      if (i > 0 && contextNotes[i - 1]) {
        relationshipHint = contextNotes[i - 1].relationship_hint || null;
      }

      return {
        chunkId: `chunk_${sessionId}_${createHash('sha256').update(`${sessionId}:${i}:${chunk.content || ''}`).digest('hex').slice(0, 8)}`,
        sessionId,
        content: chunk.content || chunkTexts[i] || '',
        vector: vec,
        timestamp,
        embedModel: engineConfig.provider,
        importance,
        relationshipHint,
        container,
        mergeHistory: [],
      };
    });

    // Step 5-6: Add to both stores
    let totalAdded = 0, totalUpdated = 0, totalExtended = 0, totalRejected = 0, totalPruned = 0;

    if (userStore) {
      try {
        const userResult = await userStore.add(memoryChunks);
        totalAdded += userResult.added;
        totalUpdated += userResult.updated;
        totalExtended += userResult.extended;
        totalRejected += userResult.rejected;
      } catch {
        // Partial failure: continue with project store
      }
    }

    if (projectStore) {
      try {
        const projResult = await projectStore.add(memoryChunks);
        totalAdded += projResult.added;
        totalUpdated += projResult.updated;
        totalExtended += projResult.extended;
        totalRejected += projResult.rejected;
      } catch {
        // Partial failure: user store may have succeeded
      }
    }

    // Step 7: Auto-prune if over capacity
    if (userStore) {
      try {
        const userCount = await userStore.getCount();
        if (userCount > capacityLimit) {
          const pruneResult = await userStore.prune(Math.floor(capacityLimit * 0.9));
          totalPruned += pruneResult.removed;
        }
      } catch { /* ignore prune errors */ }
    }

    if (projectStore) {
      try {
        const projCount = await projectStore.getCount();
        if (projCount > capacityLimit) {
          const pruneResult = await projectStore.prune(Math.floor(capacityLimit * 0.9));
          totalPruned += pruneResult.removed;
        }
      } catch { /* ignore prune errors */ }
    }

    return {
      embedded: true,
      vectorsAdded: totalAdded,
      updated: totalUpdated,
      extended: totalExtended,
      rejected: totalRejected,
      pruned: totalPruned,
    };
  } catch (err) {
    return {
      embedded: false,
      vectorsAdded: 0,
      updated: 0,
      extended: 0,
      rejected: 0,
      pruned: 0,
      error: err.message || String(err),
    };
  }
}

/**
 * Rebuild an index from raw session JSON files.
 *
 * @param {string} sessionsDir - Directory containing session .json files
 * @param {string} indexPath - Path to .emb output file
 * @param {object} engineConfig - ModelConfig
 * @param {object} [deps] - Injectable dependencies
 * @param {function} [deps.embed]
 * @param {function} [deps.chunkDocument]
 * @param {function} [deps.createProjectStore]
 * @returns {Promise<{ vectorCount: number, rebuilt: boolean, sessionsProcessed: number, error?: string }>}
 */
export async function rebuildIndex(sessionsDir, indexPath, engineConfig, deps = {}) {
  try {
    if (!sessionsDir || !indexPath || !engineConfig) {
      return { vectorCount: 0, rebuilt: false, sessionsProcessed: 0, error: 'Missing required parameters' };
    }

    const embedFn = deps.embed || (await importEmbed());
    const chunkFn = deps.chunkDocument || (await importChunkDocument());
    const createStore = deps.createProjectStore || (await importCreateProjectStore());

    // Read all .json files
    let files;
    try {
      files = await readdir(sessionsDir);
    } catch {
      return { vectorCount: 0, rebuilt: false, sessionsProcessed: 0, error: `Cannot read sessions directory: ${sessionsDir}` };
    }

    const jsonFiles = files.filter(f => f.endsWith('.json'));
    const allChunks = [];
    let sessionsProcessed = 0;

    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(sessionsDir, file), 'utf-8');
        const record = JSON.parse(raw);

        // Only process enriched records (those with summary)
        if (!record.summary) continue;

        sessionsProcessed++;

        const texts = [record.summary];
        const contextNotes = record.context_notes || [];
        for (const note of contextNotes) {
          if (note && note.content) texts.push(note.content);
        }

        for (const text of texts) {
          const chunks = chunkFn(text, { format: 'text', maxTokens: 256 });
          for (const chunk of chunks) {
            allChunks.push({
              content: chunk.content,
              sessionId: record.session_id || file.replace('.json', ''),
              timestamp: record.timestamp || '',
              importance: record.importance || 5,
              container: record.container || null,
            });
          }
        }
      } catch {
        // Skip malformed files
      }
    }

    if (allChunks.length === 0) {
      return { vectorCount: 0, rebuilt: true, sessionsProcessed, error: undefined };
    }

    // Batch embed all chunks
    const chunkTexts = allChunks.map(c => c.content);
    const embeddingResult = await embedFn(chunkTexts, engineConfig);

    if (!embeddingResult || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
      return { vectorCount: 0, rebuilt: false, sessionsProcessed, error: 'Embedding returned no vectors' };
    }

    // Build MemoryChunk[] for rebuild
    const memoryChunks = embeddingResult.vectors.map((vec, i) => ({
      chunkId: `chunk_rebuild_${createHash('sha256').update(`${allChunks[i].sessionId}:${i}:${allChunks[i].content}`).digest('hex').slice(0, 8)}`,
      sessionId: allChunks[i].sessionId,
      content: allChunks[i].content,
      vector: vec,
      timestamp: allChunks[i].timestamp,
      embedModel: engineConfig.provider,
      importance: allChunks[i].importance,
      container: allChunks[i].container,
      mergeHistory: [],
    }));

    // Create store and rebuild
    const store = createStore(indexPath);
    const result = await store.rebuild(memoryChunks, engineConfig);
    store.close();

    return {
      vectorCount: result.vectorCount,
      rebuilt: true,
      sessionsProcessed,
    };
  } catch (err) {
    return {
      vectorCount: 0,
      rebuilt: false,
      sessionsProcessed: 0,
      error: err.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Dynamic imports for loose coupling (can be overridden via deps parameter)
// ---------------------------------------------------------------------------

async function importEmbed() {
  try {
    const { embed } = await import('./embedding/engine/index.js');
    return embed;
  } catch {
    throw new Error('Embedding engine not available');
  }
}

async function importChunkDocument() {
  try {
    const { chunkDocument } = await import('./embedding/knowledge/document-chunker.js');
    return chunkDocument;
  } catch {
    throw new Error('Document chunker not available');
  }
}

async function importCreateProjectStore() {
  try {
    const { createProjectStore } = await import('./memory-store-adapter.js');
    return createProjectStore;
  } catch {
    throw new Error('Memory store adapter not available');
  }
}
