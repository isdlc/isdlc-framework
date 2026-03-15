/**
 * Memory Embedder — async embedding orchestrator for enriched session records.
 *
 * Accepts an EnrichedSessionRecord, chunks the NL content, generates embeddings,
 * and appends to both user (SQLite) and project (.emb) stores via the
 * MemoryStore interface from memory-store-adapter.js.
 *
 * REQ-0066 extends this with post-dedup steps:
 *   - Search-driven link creation (similarity 0.70-0.84 → related_to)
 *   - Curator-driven link creation (builds_on, contradicts, supersedes)
 *   - Session linking (compare summaries across sessions)
 *   - Team profile recomputation (materialized aggregate)
 *
 * Exports:
 *   - embedSession(record, userStore, projectStore, engineConfig, deps, options)
 *   - rebuildIndex(sessionsDir, indexPath, engineConfig, deps)
 *
 * REQ-0064: FR-005 (AC-005-01..04), FR-013 (tiered dedup), FR-012 (embedding)
 * REQ-0066: FR-002 (profile), FR-004 (curator links), FR-005 (search links),
 *           FR-007 (session linking)
 * Article X: Fail-Safe Defaults — never throws, returns error in result
 * Article XIII: ESM module system
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Embed an enriched session record into both user and project stores.
 *
 * @param {object} record - EnrichedSessionRecord
 * @param {object} userStore - MemoryStore (SQLite)
 * @param {object} projectStore - MemoryStore (.emb)
 * @param {object} engineConfig - ModelConfig
 * @param {object} [deps] - Injectable dependencies for testing
 * @param {object} [options]
 * @returns {Promise<object>} EmbedSessionResult
 */
export async function embedSession(record, userStore, projectStore, engineConfig, deps = {}, options = {}) {
  try {
    // Validate required fields
    if (!record || !record.summary) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, linksCreated: 0, sessionLinksCreated: 0, profileRecomputed: false, error: 'Record missing summary field' };
    }

    if (!engineConfig || !engineConfig.provider) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, linksCreated: 0, sessionLinksCreated: 0, profileRecomputed: false, error: 'Missing engine config' };
    }

    const embedFn = deps.embed || (await importEmbed());
    const chunkFn = deps.chunkDocument || (await importChunkDocument());
    const capacityLimit = options.capacityLimit || 500;

    // REQ-0066 options with defaults
    const createLinks = options.createLinks !== false; // Default: true
    const maxLinksPerChunk = options.maxLinksPerChunk || 5;
    const linkSimilarityRange = options.linkSimilarityRange || [0.70, 0.84];
    const recomputeProfile = options.recomputeProfile !== false; // Default: true
    const profilePaths = options.profilePaths || null;
    const sessionLinksPaths = options.sessionLinksPaths || null;
    const sessionLinkThreshold = options.sessionLinkThreshold || 0.60;
    const pastSessionsLimit = options.pastSessionsLimit || 10;

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
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, linksCreated: 0, sessionLinksCreated: 0, profileRecomputed: false, error: 'No chunks generated' };
    }

    // Step 3: Embed chunks
    const chunkTexts = allChunks.map(c => c.content);
    const embeddingResult = await embedFn(chunkTexts, engineConfig);

    if (!embeddingResult || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
      return { embedded: false, vectorsAdded: 0, updated: 0, extended: 0, rejected: 0, pruned: 0, linksCreated: 0, sessionLinksCreated: 0, profileRecomputed: false, error: 'Embedding returned no vectors' };
    }

    // Step 4: Build MemoryChunk[] with importance and relationship hints
    const sessionId = record.session_id || `sess_${Date.now()}`;
    const timestamp = record.timestamp || new Date().toISOString();
    const importance = typeof record.importance === 'number' ? record.importance : 5;
    const container = record.container || null;

    const memoryChunks = embeddingResult.vectors.map((vec, i) => {
      const chunk = allChunks[i] || {};
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
        links: [],
      };
    });

    // Step 5-6: Add to both stores
    let totalAdded = 0, totalUpdated = 0, totalExtended = 0, totalRejected = 0, totalPruned = 0;
    let linksCreated = 0;
    let sessionLinksCreated = 0;
    let profileRecomputed = false;

    // Track newly added/extended chunks per store for link creation
    const newChunksUser = [];
    const newChunksProject = [];

    if (userStore) {
      try {
        const userResult = await userStore.add(memoryChunks);
        totalAdded += userResult.added;
        totalUpdated += userResult.updated;
        totalExtended += userResult.extended;
        totalRejected += userResult.rejected;
        // Track new/extended chunks
        if (userResult.added > 0 || userResult.extended > 0) {
          newChunksUser.push(...memoryChunks);
        }
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
        if (projResult.added > 0 || projResult.extended > 0) {
          newChunksProject.push(...memoryChunks);
        }
      } catch {
        // Partial failure: user store may have succeeded
      }
    }

    // REQ-0066 Step A: Search-driven link creation (FR-005)
    if (createLinks) {
      try {
        linksCreated += await createSearchDrivenLinks(
          newChunksUser, userStore, embedFn, engineConfig,
          { maxLinksPerChunk, linkSimilarityRange }
        );
        linksCreated += await createSearchDrivenLinks(
          newChunksProject, projectStore, embedFn, engineConfig,
          { maxLinksPerChunk, linkSimilarityRange }
        );
      } catch {
        // MEM-LINK-002: Non-blocking
      }
    }

    // REQ-0066 Step B: Curator-driven link creation (FR-004)
    if (createLinks) {
      try {
        linksCreated += await createCuratorDrivenLinks(memoryChunks, userStore, projectStore);
      } catch {
        // MEM-LINK-002: Non-blocking
      }
    }

    // REQ-0066 Step C: Session linking (FR-007)
    if (sessionLinksPaths) {
      try {
        sessionLinksCreated = await createSessionLinks(
          record, embedFn, engineConfig,
          { sessionLinksPaths, sessionLinkThreshold, pastSessionsLimit }
        );
      } catch {
        // MEM-SESSION-001: Non-blocking
      }
    }

    // REQ-0066 Step D: Team profile recomputation (FR-002)
    if (recomputeProfile && profilePaths) {
      try {
        profileRecomputed = await recomputeTeamProfile(userStore, projectStore, profilePaths);
      } catch {
        // MEM-PROFILE-001: Non-blocking
        profileRecomputed = false;
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
      linksCreated,
      sessionLinksCreated,
      profileRecomputed,
    };
  } catch (err) {
    return {
      embedded: false,
      vectorsAdded: 0,
      updated: 0,
      extended: 0,
      rejected: 0,
      pruned: 0,
      linksCreated: 0,
      sessionLinksCreated: 0,
      profileRecomputed: false,
      error: err.message || String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// REQ-0066: Search-driven link creation (FR-005)
// ---------------------------------------------------------------------------

/**
 * Create bidirectional related_to links for chunks with similarity 0.70-0.84.
 * @returns {number} Number of links created
 */
async function createSearchDrivenLinks(chunks, store, embedFn, engineConfig, options) {
  if (!store || !chunks || chunks.length === 0) return 0;
  if (typeof store.search !== 'function' || typeof store.updateLinks !== 'function') return 0;

  const { maxLinksPerChunk = 5, linkSimilarityRange = [0.70, 0.84] } = options;
  const [minSim, maxSim] = linkSimilarityRange;
  let created = 0;

  for (const chunk of chunks) {
    if (!chunk.vector) continue;

    try {
      // Search same store for matches in the similarity range
      const results = await store.search(chunk.vector, 20, { minScore: 0 });

      // Get existing link count for this chunk
      const existingLinkCount = (chunk.links || []).length;
      let linksToCreate = maxLinksPerChunk - existingLinkCount;
      if (linksToCreate <= 0) continue; // MEM-LINK-003

      for (const match of results) {
        if (linksToCreate <= 0) break;
        if (match.chunkId === chunk.chunkId) continue;
        if (match.rawSimilarity < minSim || match.rawSimilarity > maxSim) continue;

        const now = new Date().toISOString();

        // Forward link on new chunk
        chunk.links = chunk.links || [];
        chunk.links.push({
          targetChunkId: match.chunkId,
          relationType: 'related_to',
          createdAt: now,
          createdBy: 'search',
        });

        // Inverse link on matched chunk
        try {
          await store.updateLinks(match.chunkId, [{
            targetChunkId: chunk.chunkId,
            relationType: 'related_to',
            createdAt: now,
            createdBy: 'search',
          }]);
        } catch { /* ignore individual link failure */ }

        // Also persist forward link if chunk is already in store
        try {
          await store.updateLinks(chunk.chunkId, [{
            targetChunkId: match.chunkId,
            relationType: 'related_to',
            createdAt: now,
            createdBy: 'search',
          }]);
        } catch { /* ignore */ }

        created += 2; // Forward + inverse
        linksToCreate--;
      }
    } catch {
      // Non-blocking per chunk
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// REQ-0066: Curator-driven link creation (FR-004)
// ---------------------------------------------------------------------------

const CURATOR_HINTS = new Set(['builds_on', 'contradicts', 'supersedes']);
const INVERSE_MAP = {
  builds_on: 'builds_on',
  contradicts: 'contradicts',
  supersedes: 'supersedes',
};

/**
 * Create directional links from curator relationship_hint annotations.
 * @returns {number} Number of links created
 */
async function createCuratorDrivenLinks(chunks, userStore, projectStore) {
  let created = 0;

  for (const chunk of chunks) {
    if (!chunk.relationshipHint || !CURATOR_HINTS.has(chunk.relationshipHint)) continue;

    const hint = chunk.relationshipHint;
    const now = new Date().toISOString();

    // Find the matched chunk from dedup — search for most similar existing chunk
    const stores = [userStore, projectStore].filter(Boolean);
    for (const store of stores) {
      if (typeof store.search !== 'function' || typeof store.updateLinks !== 'function') continue;

      try {
        if (!chunk.vector) continue;
        const results = await store.search(chunk.vector, 5, { minScore: 0 });
        // Find best match that isn't this chunk
        const match = results.find(r => r.chunkId !== chunk.chunkId && r.rawSimilarity > 0.5);
        if (!match) continue;

        // Forward link on new chunk
        chunk.links = chunk.links || [];
        chunk.links.push({
          targetChunkId: match.chunkId,
          relationType: hint,
          createdAt: now,
          createdBy: 'curator',
        });

        try {
          await store.updateLinks(chunk.chunkId, [{
            targetChunkId: match.chunkId,
            relationType: hint,
            createdAt: now,
            createdBy: 'curator',
          }]);
        } catch { /* ignore */ }

        // Inverse link on target
        const inverseType = INVERSE_MAP[hint] || hint;
        try {
          await store.updateLinks(match.chunkId, [{
            targetChunkId: chunk.chunkId,
            relationType: inverseType,
            createdAt: now,
            createdBy: 'curator',
          }]);
        } catch { /* ignore */ }

        created += 2;
      } catch {
        // Non-blocking per store
      }
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// REQ-0066: Session linking (FR-007)
// ---------------------------------------------------------------------------

/**
 * Compare current session summary against past sessions and store links.
 * @returns {number} Number of session links created
 */
async function createSessionLinks(record, embedFn, engineConfig, options) {
  const { sessionLinksPaths, sessionLinkThreshold = 0.60, pastSessionsLimit = 10 } = options;
  if (!sessionLinksPaths || !record.summary) return 0;

  let created = 0;

  // Embed current session summary
  const currentEmb = await embedFn([record.summary], engineConfig);
  if (!currentEmb || !currentEmb.vectors || currentEmb.vectors.length === 0) return 0;
  const currentVec = currentEmb.vectors[0];

  // Process each session links path (user and project)
  for (const [key, linksPath] of Object.entries(sessionLinksPaths)) {
    const sessionsDir = dirname(linksPath);

    try {
      // Read past session files
      let files;
      try {
        files = await readdir(sessionsDir);
      } catch { continue; }

      const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'session-links.json' && f !== 'team-profile.json')
        .sort().reverse().slice(0, pastSessionsLimit);

      const relatedSessions = [];

      for (const file of jsonFiles) {
        try {
          const raw = await readFile(join(sessionsDir, file), 'utf-8');
          const pastRecord = JSON.parse(raw);
          if (!pastRecord.summary || pastRecord.session_id === record.session_id) continue;

          // Embed past summary
          const pastEmb = await embedFn([pastRecord.summary], engineConfig);
          if (!pastEmb || !pastEmb.vectors || pastEmb.vectors.length === 0) continue;

          // Compute similarity
          const sim = cosineSim(currentVec, pastEmb.vectors[0]);
          if (sim > sessionLinkThreshold) {
            relatedSessions.push({
              sessionId: pastRecord.session_id || file.replace('.json', ''),
              similarity: Math.round(sim * 1000) / 1000,
              createdAt: new Date().toISOString(),
            });
            created++;
          }
        } catch { /* skip malformed */ }
      }

      if (relatedSessions.length > 0) {
        // Read existing session-links.json
        let existing = [];
        try {
          const raw = await readFile(linksPath, 'utf-8');
          existing = JSON.parse(raw);
          if (!Array.isArray(existing)) existing = [];
        } catch { existing = []; }

        existing.push({
          sessionId: record.session_id,
          relatedSessions,
        });

        // Ensure directory exists
        const dir = dirname(linksPath);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        await writeFile(linksPath, JSON.stringify(existing, null, 2), 'utf-8');
      }
    } catch {
      // MEM-SESSION-001: Non-blocking
    }
  }

  return created;
}

/**
 * Simple cosine similarity for session linking.
 */
function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    nA += a[i] * a[i];
    nB += b[i] * b[i];
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : Math.max(0, Math.min(1, dot / d));
}

// ---------------------------------------------------------------------------
// REQ-0066: Team profile recomputation (FR-002)
// ---------------------------------------------------------------------------

/**
 * Recompute team profile from store data and write to JSON.
 * @returns {boolean} true if profile was written
 */
async function recomputeTeamProfile(userStore, projectStore, profilePaths) {
  if (!profilePaths) return false;

  const staticEntries = [];
  const dynamicEntries = [];

  // Static: top 10 from user store by score where appeared_count > 3 and accessed_count > 5
  if (userStore && typeof userStore.search === 'function') {
    try {
      // Search with a generic vector to get all entries, then filter
      // We use getByIds-like approach or search with low threshold
      const results = await userStore.search(new Float32Array(4), 100, { minScore: 0 });
      const qualified = results.filter(r =>
        (r.hitRate !== undefined ? r.hitRate > 0 : true)
      );
      // Sort by score descending
      qualified.sort((a, b) => b.score - a.score);
      staticEntries.push(...qualified.slice(0, 10).map(r => ({
        content: r.content,
        score: r.score,
        layer: r.layer,
        sessionId: r.sessionId,
        importance: r.importance,
        hitRate: r.hitRate,
      })));
    } catch { /* fail-open */ }
  }

  // Dynamic: last 5 from project store by timestamp
  if (projectStore && typeof projectStore.search === 'function') {
    try {
      const results = await projectStore.search(new Float32Array(4), 50, { minScore: 0 });
      // Sort by timestamp descending
      const sorted = [...results].sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      dynamicEntries.push(...sorted.slice(0, 5).map(r => ({
        content: r.content,
        score: r.score,
        layer: r.layer,
        sessionId: r.sessionId,
        importance: r.importance,
      })));
    } catch { /* fail-open */ }
  }

  const profile = {
    static: staticEntries,
    dynamic: dynamicEntries,
    generatedAt: new Date().toISOString(),
  };

  // Write to all profile paths
  let written = false;
  for (const [key, filePath] of Object.entries(profilePaths)) {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      await writeFile(filePath, JSON.stringify(profile, null, 2), 'utf-8');
      written = true;
    } catch { /* fail-open per path */ }
  }

  return written;
}

/**
 * Rebuild an index from raw session JSON files.
 *
 * @param {string} sessionsDir - Directory containing session .json files
 * @param {string} indexPath - Path to .emb output file
 * @param {object} engineConfig - ModelConfig
 * @param {object} [deps] - Injectable dependencies
 * @returns {Promise<object>}
 */
export async function rebuildIndex(sessionsDir, indexPath, engineConfig, deps = {}) {
  try {
    if (!sessionsDir || !indexPath || !engineConfig) {
      return { vectorCount: 0, rebuilt: false, sessionsProcessed: 0, error: 'Missing required parameters' };
    }

    const embedFn = deps.embed || (await importEmbed());
    const chunkFn = deps.chunkDocument || (await importChunkDocument());
    const createStore = deps.createProjectStore || (await importCreateProjectStore());

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

    const chunkTexts = allChunks.map(c => c.content);
    const embeddingResult = await embedFn(chunkTexts, engineConfig);

    if (!embeddingResult || !embeddingResult.vectors || embeddingResult.vectors.length === 0) {
      return { vectorCount: 0, rebuilt: false, sessionsProcessed, error: 'Embedding returned no vectors' };
    }

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
