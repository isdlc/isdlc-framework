/**
 * Query Orchestrator — classifies queries, fans out to relevant stores,
 * merges and re-ranks results.
 *
 * REQ-0045 / FR-004 / AC-004-01 through AC-004-05 / M7
 * @module lib/embedding/mcp-server/orchestrator
 */

/**
 * @typedef {Object} OrchestratorOptions
 * @property {number} [maxResults=20]
 * @property {number} [timeoutMs=5000]
 * @property {string[]} [moduleFilter] - Limit to specific modules
 * @property {number} [tokenBudget=5000]
 */

/**
 * @typedef {Object} OrchestratorResult
 * @property {import('./store-manager.js').SearchResult[]} hits
 * @property {string[]} modulesSearched
 * @property {string[]} modulesTimedOut
 * @property {number} totalLatencyMs
 */

/**
 * Classify a query and determine which module stores are relevant.
 *
 * Uses registry routing hints (domain prefix match, keyword match)
 * to select relevant stores. Falls back to all stores if no hints match.
 *
 * @param {string} query
 * @param {Object} registry - Module registry instance
 * @param {string[]} loadedModuleIds - IDs of currently loaded stores
 * @param {string[]} [moduleFilter] - Explicit module filter from options
 * @returns {string[]} Module IDs to search
 */
export function classifyQuery(query, registry, loadedModuleIds, moduleFilter) {
  if (!query || typeof query !== 'string') return [];
  if (!loadedModuleIds || loadedModuleIds.length === 0) return [];

  // Explicit filter takes precedence
  if (moduleFilter && moduleFilter.length > 0) {
    return moduleFilter.filter(id => loadedModuleIds.includes(id));
  }

  // Use registry routing hints
  if (registry) {
    const hints = registry.getRoutingHints(query);
    const matched = hints.filter(id => loadedModuleIds.includes(id));
    if (matched.length > 0) return matched;
  }

  // Fallback: search all loaded stores
  return [...loadedModuleIds];
}

/**
 * Estimate token count for a search result.
 * Rough heuristic: 1 token ≈ 4 characters.
 * @param {Object} hit
 * @returns {number}
 */
function estimateTokens(hit) {
  const content = hit.chunk?.content || '';
  return Math.ceil(content.length / 4);
}

/**
 * Merge and re-rank results from multiple stores by relevance score.
 * Deduplicates by chunkId.
 *
 * @param {import('./store-manager.js').SearchResult[][]} resultSets
 * @returns {import('./store-manager.js').SearchResult[]}
 */
export function mergeResults(resultSets) {
  const seen = new Set();
  const merged = [];

  for (const results of resultSets) {
    for (const hit of results) {
      const key = `${hit.moduleId}:${hit.chunkId}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(hit);
      }
    }
  }

  // Re-rank by score descending
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

/**
 * Apply token budget constraint to results.
 * Returns only as many results as fit within the budget.
 *
 * @param {import('./store-manager.js').SearchResult[]} hits
 * @param {number} tokenBudget
 * @returns {import('./store-manager.js').SearchResult[]}
 */
export function applyTokenBudget(hits, tokenBudget) {
  if (!tokenBudget || tokenBudget <= 0) return [];
  if (!Number.isFinite(tokenBudget)) return hits;

  const result = [];
  let tokensUsed = 0;

  for (const hit of hits) {
    const tokens = estimateTokens(hit);
    if (tokensUsed + tokens > tokenBudget) break;
    result.push(hit);
    tokensUsed += tokens;
  }

  return result;
}

/**
 * Search a single store with a timeout.
 * Returns results or empty array on timeout.
 *
 * @param {Object} storeManager
 * @param {string} moduleId
 * @param {Float32Array} queryVector
 * @param {number} maxResults
 * @param {number} timeoutMs
 * @returns {Promise<{ moduleId: string, results: import('./store-manager.js').SearchResult[], timedOut: boolean }>}
 */
async function searchStoreWithTimeout(storeManager, moduleId, queryVector, maxResults, timeoutMs) {
  return new Promise(resolve => {
    const timer = setTimeout(() => {
      resolve({ moduleId, results: [], timedOut: true });
    }, timeoutMs);

    try {
      const results = storeManager.search(moduleId, queryVector, maxResults);
      clearTimeout(timer);
      resolve({ moduleId, results, timedOut: false });
    } catch {
      clearTimeout(timer);
      resolve({ moduleId, results: [], timedOut: false });
    }
  });
}

/**
 * Create a query orchestrator.
 *
 * @param {Object} storeManager - StoreManager instance
 * @param {Object} [registry] - Module registry for routing hints
 * @param {Object} [embedFn] - Function to embed query text: (text) => Float32Array
 * @returns {Object} Orchestrator API
 */
export function createOrchestrator(storeManager, registry, embedFn) {
  /**
   * Orchestrate a multi-store query.
   *
   * @param {string} query - Natural language query
   * @param {OrchestratorOptions} [options]
   * @returns {Promise<OrchestratorResult>}
   */
  async function orchestrate(query, options = {}) {
    const {
      maxResults = 20,
      timeoutMs = 5000,
      moduleFilter,
      tokenBudget = 5000,
    } = options;

    const startTime = Date.now();

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return {
        hits: [],
        modulesSearched: [],
        modulesTimedOut: [],
        totalLatencyMs: Date.now() - startTime,
      };
    }

    // Get loaded module IDs
    const loadedStores = storeManager.listStores();
    const loadedModuleIds = loadedStores.map(s => s.moduleId);

    if (loadedModuleIds.length === 0) {
      return {
        hits: [],
        modulesSearched: [],
        modulesTimedOut: [],
        totalLatencyMs: Date.now() - startTime,
      };
    }

    // Classify query → determine which stores to search
    const targetModules = classifyQuery(query, registry, loadedModuleIds, moduleFilter);

    if (targetModules.length === 0) {
      return {
        hits: [],
        modulesSearched: [],
        modulesTimedOut: [],
        totalLatencyMs: Date.now() - startTime,
      };
    }

    // Embed the query text
    let queryVector;
    if (embedFn) {
      queryVector = await embedFn(query);
    } else {
      // Fallback: use a simple hash-based pseudo-vector for testing
      queryVector = hashToVector(query, loadedStores[0]?.dimensions || 4);
    }

    // Fan-out: parallel queries to all target stores
    const searchPromises = targetModules.map(moduleId =>
      searchStoreWithTimeout(storeManager, moduleId, queryVector, maxResults, timeoutMs)
    );

    const searchResults = await Promise.all(searchPromises);

    // Collect results and timeouts
    const modulesSearched = [];
    const modulesTimedOut = [];
    const resultSets = [];

    for (const { moduleId, results, timedOut } of searchResults) {
      modulesSearched.push(moduleId);
      if (timedOut) {
        modulesTimedOut.push(moduleId);
      }
      if (results.length > 0) {
        resultSets.push(results);
      }
    }

    // Merge and re-rank
    let hits = mergeResults(resultSets);

    // Apply token budget
    hits = applyTokenBudget(hits, tokenBudget);

    // Limit to maxResults
    hits = hits.slice(0, maxResults);

    return {
      hits,
      modulesSearched,
      modulesTimedOut,
      totalLatencyMs: Date.now() - startTime,
    };
  }

  return { orchestrate, classifyQuery, mergeResults, applyTokenBudget };
}

/**
 * Simple hash-based pseudo-vector for testing (deterministic).
 * NOT a real embedding — used only when no embedFn is provided.
 * @param {string} text
 * @param {number} dimensions
 * @returns {Float32Array}
 */
function hashToVector(text, dimensions) {
  const vec = new Float32Array(dimensions);
  for (let i = 0; i < text.length; i++) {
    vec[i % dimensions] += text.charCodeAt(i) / 1000;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  }
  return vec;
}

export { hashToVector };
