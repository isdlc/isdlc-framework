/**
 * Memory Search — semantic search over dual vector stores.
 *
 * Embeds a query, searches both user (SQLite) and project (.emb) stores,
 * merges results with layer tags, applies self-ranking boost, and
 * increments access counters for returned results.
 *
 * Exports:
 *   - searchMemory(queryText, userDbPath, projectIndexPath, engineConfig, options)
 *   - checkModelConsistency(indexPath, engineConfig)
 *   - formatSemanticMemoryContext(results)
 *
 * REQ-0064: FR-004 (AC-004-01..06), FR-017 (container filtering)
 * Article X: Fail-Safe Defaults — never throws, returns empty array
 * Article XIII: ESM module system
 */

/**
 * Search both user and project memory stores.
 *
 * @param {string} queryText - Draft content + topic context
 * @param {string} userDbPath - Path to SQLite user memory DB
 * @param {string} projectIndexPath - Path to .emb project index
 * @param {object} engineConfig - ModelConfig with provider field
 * @param {object} [deps] - Injectable dependencies for testing
 * @param {function} [deps.embed] - embed(texts, config) -> EmbeddingResult
 * @param {function} [deps.createUserStore]
 * @param {function} [deps.createProjectStore]
 * @param {function} [deps.embedSession]
 * @param {object} [options]
 * @param {number} [options.maxResults=10]
 * @param {number} [options.minScore=0.5]
 * @param {string} [options.container]
 * @param {string} [options.userSessionsDir]
 * @param {string} [options.projectSessionsDir]
 * @returns {Promise<object[]>} MemorySearchResult[]
 */
export async function searchMemory(queryText, userDbPath, projectIndexPath, engineConfig, deps = {}, options = {}) {
  try {
    if (!queryText || typeof queryText !== 'string' || queryText.trim().length === 0) {
      return [];
    }

    if (!engineConfig || !engineConfig.provider) {
      return [];
    }

    const maxResults = options.maxResults || 10;
    const minScore = options.minScore ?? 0.5;
    const container = options.container || undefined;

    const embedFn = deps.embed || (await importEmbed());
    const createUserStoreFn = deps.createUserStore || (await importCreateUserStore());
    const createProjectStoreFn = deps.createProjectStore || (await importCreateProjectStore());

    // Step 5: Embed query
    let queryVector;
    try {
      const embResult = await embedFn([queryText], engineConfig);
      if (!embResult || !embResult.vectors || embResult.vectors.length === 0) {
        return [];
      }
      queryVector = embResult.vectors[0];
    } catch {
      return [];
    }

    const allResults = [];
    let userStore = null;
    let projectStore = null;

    // Step 2: Open user store (fail-open)
    try {
      userStore = createUserStoreFn(userDbPath);

      // Step 4: Check model consistency
      const userModel = await userStore.getModel();
      if (userModel && userModel !== engineConfig.provider) {
        // Model mismatch — skip user store
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
        // Model mismatch — skip project store
        projectStore.close();
        projectStore = null;
      }
    } catch {
      projectStore = null;
    }

    // Step 6: Search user store
    if (userStore) {
      try {
        const userResults = await userStore.search(queryVector, maxResults, { minScore, container });
        allResults.push(...userResults);
      } catch {
        // Isolated failure
      }
    }

    // Step 7: Search project store
    if (projectStore) {
      try {
        const projResults = await projectStore.search(queryVector, maxResults, { minScore, container });
        allResults.push(...projResults);
      } catch {
        // Isolated failure
      }
    }

    // Step 8-9: Merge, sort by score descending, apply limits
    allResults.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.score - a.score;
    });

    const filtered = allResults.filter(r => r.score >= minScore || r.pinned);
    const limited = filtered.slice(0, maxResults);

    // Step 10: Increment accessed_count for user results
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
    if (userStore) {
      try { userStore.close(); } catch { /* ignore */ }
    }
    if (projectStore) {
      try { projectStore.close(); } catch { /* ignore */ }
    }

    return limited;
  } catch {
    return [];
  }
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
