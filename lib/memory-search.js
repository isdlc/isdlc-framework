/**
 * Memory Search — semantic search over dual vector stores.
 *
 * Embeds a query, searches both user (SQLite) and project (.emb) stores,
 * merges results with layer tags, applies self-ranking boost, and
 * increments access counters for returned results.
 *
 * REQ-0066 extends this with:
 *   - Codebase .emb index search (hybrid unified query)
 *   - 1-hop link traversal (linkedMemories on each result)
 *   - Team profile loading (pre-computed JSON)
 *   - formatHybridMemoryContext() for conversation priming
 *
 * Exports:
 *   - searchMemory(queryText, userDbPath, projectIndexPath, engineConfig, deps, options)
 *   - traverseLinks(results, userStore, projectStore, options)
 *   - checkModelConsistency(indexPath, engineConfig)
 *   - formatSemanticMemoryContext(results)
 *   - formatHybridMemoryContext(result)
 *
 * REQ-0064: FR-004 (AC-004-01..06), FR-017 (container filtering)
 * REQ-0066: FR-001 (hybrid query), FR-002 (team profile), FR-006 (link traversal),
 *           FR-008 (lineage tracking)
 * Article X: Fail-Safe Defaults — never throws, returns empty array/result
 * Article XIII: ESM module system
 */

import { readFile } from 'node:fs/promises';

/**
 * Search user, project, and optionally codebase memory stores.
 *
 * REQ-0066: When codebaseIndexPath or other new options are provided,
 * returns a HybridSearchResult object. When none are provided, returns
 * a plain MemorySearchResult[] for backward compatibility.
 *
 * @param {string} queryText - Draft content + topic context
 * @param {string} userDbPath - Path to SQLite user memory DB
 * @param {string} projectIndexPath - Path to .emb project index
 * @param {object} engineConfig - ModelConfig with provider field
 * @param {object} [deps] - Injectable dependencies for testing
 * @param {object} [options]
 * @returns {Promise<object[]|object>} MemorySearchResult[] or HybridSearchResult
 */
export async function searchMemory(queryText, userDbPath, projectIndexPath, engineConfig, deps = {}, options = {}) {
  // REQ-0066: Detect hybrid mode by presence of any new option
  const hybridMode = !!(options.codebaseIndexPath || options.traverseLinks !== undefined ||
    options.includeProfile !== undefined || options.profilePath || options.maxResultsPerSource);

  try {
    if (!queryText || typeof queryText !== 'string' || queryText.trim().length === 0) {
      return hybridMode ? { results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } } : [];
    }

    if (!engineConfig || !engineConfig.provider) {
      return hybridMode ? { results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } } : [];
    }

    const maxResults = options.maxResults || 10;
    const minScore = options.minScore ?? 0.5;
    const container = options.container || undefined;
    const maxResultsPerSource = options.maxResultsPerSource || 5;
    const shouldTraverseLinks = options.traverseLinks !== false; // Default: true
    const shouldIncludeProfile = options.includeProfile !== false; // Default: true

    const embedFn = deps.embed || (await importEmbed());
    const createUserStoreFn = deps.createUserStore || (await importCreateUserStore());
    const createProjectStoreFn = deps.createProjectStore || (await importCreateProjectStore());

    // Step 1: Embed query
    let queryVector;
    try {
      const embResult = await embedFn([queryText], engineConfig);
      if (!embResult || !embResult.vectors || embResult.vectors.length === 0) {
        return hybridMode ? { results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } } : [];
      }
      queryVector = embResult.vectors[0];
    } catch {
      return hybridMode ? { results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } } : [];
    }

    const allResults = [];
    let codebaseResults = [];
    let userStore = null;
    let projectStore = null;
    let codebaseStore = null;

    // Step 2: Open user store (fail-open)
    try {
      userStore = createUserStoreFn(userDbPath);
      const userModel = await userStore.getModel();
      if (userModel && userModel !== engineConfig.provider) {
        userStore.close();
        userStore = null;
      }
    } catch {
      userStore = null;
    }

    // Step 3: Open project store (fail-open)
    try {
      projectStore = createProjectStoreFn(projectIndexPath);
      const projModel = await projectStore.getModel();
      if (projModel && projModel !== engineConfig.provider) {
        projectStore.close();
        projectStore = null;
      }
    } catch {
      projectStore = null;
    }

    // REQ-0066: Step 3b: Open codebase store (fail-open)
    if (hybridMode && options.codebaseIndexPath) {
      try {
        const createCodebaseStoreFn = deps.createCodebaseStore || createProjectStoreFn;
        codebaseStore = createCodebaseStoreFn(options.codebaseIndexPath);
      } catch {
        codebaseStore = null;
      }
    }

    // Step 4: Parallel search via Promise.allSettled (REQ-0066 FR-001 AC-001-02)
    const searchPromises = [];
    const searchLabels = [];

    if (userStore) {
      searchPromises.push(
        userStore.search(queryVector, hybridMode ? maxResultsPerSource : maxResults, { minScore, container }).catch(() => [])
      );
      searchLabels.push('user');
    }

    if (projectStore) {
      searchPromises.push(
        projectStore.search(queryVector, hybridMode ? maxResultsPerSource : maxResults, { minScore, container }).catch(() => [])
      );
      searchLabels.push('project');
    }

    if (codebaseStore) {
      searchPromises.push(
        codebaseStore.search(queryVector, maxResultsPerSource, { minScore: 0 }).catch(() => [])
      );
      searchLabels.push('codebase');
    }

    const searchResults = await Promise.allSettled(searchPromises);

    for (let i = 0; i < searchResults.length; i++) {
      const settled = searchResults[i];
      if (settled.status !== 'fulfilled') continue;
      const results = settled.value;
      if (searchLabels[i] === 'codebase') {
        codebaseResults = (results || []).map(r => ({
          ...r,
          layer: 'codebase',
          filePath: r.filePath || r.content?.slice(0, 50) || '',
        }));
      } else {
        allResults.push(...(results || []));
      }
    }

    // REQ-0066: Link traversal (FR-006)
    if (hybridMode && shouldTraverseLinks && (userStore || projectStore)) {
      try {
        await traverseLinks(allResults, userStore, projectStore, {
          maxHops: options.traverseMaxHops || 1,
          maxLinkedPerResult: 5,
        });
      } catch {
        // Fail-open: skip traversal
      }
    }

    // REQ-0066: Profile loading (FR-002)
    let profile = null;
    if (hybridMode && shouldIncludeProfile && options.profilePath) {
      try {
        const raw = await readFile(options.profilePath, 'utf-8');
        profile = JSON.parse(raw);
      } catch {
        profile = null; // MEM-PROFILE-002: missing or corrupt profile
      }
    }

    // Step 5: Merge, sort by score descending, apply limits
    allResults.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.score - a.score;
    });

    const filtered = allResults.filter(r => r.score >= minScore || r.pinned);
    const limited = filtered.slice(0, maxResults);

    // Apply maxResultsPerSource in hybrid mode
    if (hybridMode) {
      codebaseResults = codebaseResults.slice(0, maxResultsPerSource);
    }

    // Step 6: Increment accessed_count for user results
    if (userStore) {
      try {
        const userChunkIds = limited.filter(r => r.layer === 'user').map(r => r.chunkId);
        if (userChunkIds.length > 0) {
          await userStore.incrementAccess(userChunkIds);
        }
      } catch {
        // Ignore increment errors
      }
    }

    // Cleanup
    if (userStore) { try { userStore.close(); } catch { /* ignore */ } }
    if (projectStore) { try { projectStore.close(); } catch { /* ignore */ } }
    if (codebaseStore) { try { codebaseStore.close(); } catch { /* ignore */ } }

    // REQ-0066: Return HybridSearchResult in hybrid mode
    if (hybridMode) {
      return {
        results: limited,
        codebaseResults,
        profile,
        sources: {
          memory: limited.length,
          codebase: codebaseResults.length,
          profile: profile !== null && profile !== undefined,
        },
      };
    }

    return limited;
  } catch {
    return hybridMode ? { results: [], codebaseResults: [], profile: null, sources: { memory: 0, codebase: 0, profile: false } } : [];
  }
}

/**
 * REQ-0066 FR-006: Traverse 1-hop links on search results.
 *
 * Reads links[] from each result, batch-fetches linked chunks from stores,
 * and attaches them as linkedMemories[] on each parent result.
 *
 * @param {object[]} results - MemorySearchResult[] (mutated in place)
 * @param {object|null} userStore - MemoryStore (SQLite)
 * @param {object|null} projectStore - MemoryStore (.emb)
 * @param {object} [options]
 * @param {number} [options.maxHops=1]
 * @param {number} [options.maxLinkedPerResult=5]
 * @returns {Promise<object[]>} Same results array with linkedMemories populated
 */
export async function traverseLinks(results, userStore, projectStore, options = {}) {
  const maxLinkedPerResult = options.maxLinkedPerResult || 5;

  if (!results || results.length === 0) return results || [];

  // Collect all unique target chunk IDs from all results' links
  const allTargetIds = new Set();
  const resultLinkMap = new Map(); // chunkId -> targetChunkIds[]

  for (const result of results) {
    const links = result.links || [];
    if (links.length === 0) {
      result.linkedMemories = [];
      continue;
    }
    const targetIds = links.map(l => l.targetChunkId).filter(Boolean);
    resultLinkMap.set(result.chunkId, { links, targetIds });
    for (const id of targetIds) allTargetIds.add(id);
  }

  if (allTargetIds.size === 0) {
    // Ensure all results have empty linkedMemories
    for (const r of results) { if (!r.linkedMemories) r.linkedMemories = []; }
    return results;
  }

  // Batch fetch from both stores (deduplicated)
  const targetIdsArray = [...allTargetIds];
  const fetchedMap = new Map();

  if (userStore && typeof userStore.getByIds === 'function') {
    try {
      const userFetched = await userStore.getByIds(targetIdsArray);
      for (const f of userFetched) fetchedMap.set(f.chunkId, f);
    } catch { /* fail-open */ }
  }

  if (projectStore && typeof projectStore.getByIds === 'function') {
    try {
      const projFetched = await projectStore.getByIds(targetIdsArray);
      for (const f of projFetched) {
        if (!fetchedMap.has(f.chunkId)) fetchedMap.set(f.chunkId, f);
      }
    } catch { /* fail-open */ }
  }

  // Attach linkedMemories on each result
  for (const result of results) {
    const entry = resultLinkMap.get(result.chunkId);
    if (!entry) {
      result.linkedMemories = [];
      continue;
    }

    const linked = [];
    for (const link of entry.links) {
      if (linked.length >= maxLinkedPerResult) break;
      const fetched = fetchedMap.get(link.targetChunkId);
      if (fetched) {
        linked.push({ ...fetched, relationType: link.relationType });
      }
      // MEM-LINK-001: broken links silently skipped
    }
    result.linkedMemories = linked;
  }

  return results;
}

/**
 * Check model consistency of an .emb index against current engine config.
 *
 * @param {string} indexPath - Path to .emb file
 * @param {object} engineConfig - ModelConfig
 * @param {object} [deps] - Injectable dependencies
 * @param {function} [deps.createProjectStore]
 * @returns {Promise<{ consistent: boolean, indexModel: string, currentModel: string }>}
 */
export async function checkModelConsistency(indexPath, engineConfig, deps = {}) {
  const currentModel = engineConfig?.provider || 'unknown';

  try {
    const createStoreFn = deps.createProjectStore || (await importCreateProjectStore());
    const store = createStoreFn(indexPath);
    const indexModel = await store.getModel();
    store.close();

    if (!indexModel) {
      return { consistent: false, indexModel: 'unknown', currentModel };
    }

    return {
      consistent: indexModel === currentModel,
      indexModel,
      currentModel,
    };
  } catch {
    return { consistent: false, indexModel: 'unknown', currentModel };
  }
}

/**
 * Format search results as MEMORY_CONTEXT block for prompt injection.
 * (REQ-0064 backward-compatible format)
 *
 * @param {object[]} results - MemorySearchResult[]
 * @returns {string} Formatted context block or empty string
 */
export function formatSemanticMemoryContext(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return '';
  }

  const lines = ['MEMORY_CONTEXT:'];

  for (const r of results) {
    const score = typeof r.score === 'number' ? r.score.toFixed(2) : '0.00';
    const layer = r.layer || 'unknown';
    lines.push(`--- memory-result (score: ${score}, layer: ${layer}) ---`);
    lines.push(r.content || '');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * REQ-0066 FR-008: Format HybridSearchResult as MEMORY_CONTEXT block.
 *
 * Includes team profile (static + dynamic), memory results with linked
 * memories annotated by relationship type, and codebase results.
 *
 * @param {object} result - HybridSearchResult
 * @returns {string} Formatted context block or empty string
 */
export function formatHybridMemoryContext(result) {
  if (!result) return '';

  const hasProfile = result.profile && (
    (result.profile.static && result.profile.static.length > 0) ||
    (result.profile.dynamic && result.profile.dynamic.length > 0)
  );
  const hasMemory = result.results && result.results.length > 0;
  const hasCodebase = result.codebaseResults && result.codebaseResults.length > 0;

  if (!hasProfile && !hasMemory && !hasCodebase) return '';

  const lines = ['MEMORY_CONTEXT:'];

  // Team profile sections
  if (result.profile) {
    if (result.profile.static && result.profile.static.length > 0) {
      lines.push('');
      lines.push('--- team-profile (static) ---');
      for (const entry of result.profile.static) {
        lines.push(entry.content || '');
      }
    }
    if (result.profile.dynamic && result.profile.dynamic.length > 0) {
      lines.push('');
      lines.push('--- team-profile (dynamic) ---');
      for (const entry of result.profile.dynamic) {
        lines.push(entry.content || '');
      }
    }
  }

  // Memory results with linked memories
  if (hasMemory) {
    for (const r of result.results) {
      const score = typeof r.score === 'number' ? r.score.toFixed(2) : '0.00';
      const layer = r.layer || 'unknown';
      lines.push('');
      lines.push(`--- memory (score: ${score}, layer: ${layer}) ---`);
      lines.push(r.content || '');

      // Linked memories with relationship context
      if (r.linkedMemories && r.linkedMemories.length > 0) {
        for (const linked of r.linkedMemories) {
          const relType = linked.relationType || 'related_to';
          lines.push(`  [${relType}] ${linked.content || ''}`);
        }
      }
    }
  }

  // Codebase results
  if (hasCodebase) {
    for (const r of result.codebaseResults) {
      const score = typeof r.score === 'number' ? r.score.toFixed(2) : '0.00';
      const filePath = r.filePath || 'unknown';
      lines.push('');
      lines.push(`--- codebase (score: ${score}, file: ${filePath}) ---`);
      lines.push(r.content || '');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dynamic imports for loose coupling
// ---------------------------------------------------------------------------

async function importEmbed() {
  try {
    const { embed } = await import('./embedding/engine/index.js');
    return embed;
  } catch {
    throw new Error('Embedding engine not available');
  }
}

async function importCreateUserStore() {
  try {
    const { createUserStore } = await import('./memory-store-adapter.js');
    return createUserStore;
  } catch {
    throw new Error('Memory store adapter not available');
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
