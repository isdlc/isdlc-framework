/**
 * Semantic Search Backend — bridges iSDLC search router to MCP server.
 *
 * Registers as `semantic` modality in the search registry.
 * Delegates to MCP server via configured call function.
 * Falls back to direct FAISS index loading when MCP is unavailable.
 *
 * REQ-0045 / FR-012 / AC-012-01 through AC-012-05 / M10
 * @module lib/search/backends/semantic
 */

const DEFAULT_TIMEOUT = 5000;
const HEALTH_CHECK_TIMEOUT = 2000;

/**
 * Create the semantic search backend adapter.
 *
 * @param {Object} [options]
 * @param {Function} [options.mcpCallFn] - MCP tool call function for semantic search server
 * @param {Function} [options.fallbackSearchFn] - Direct FAISS search fallback function
 * @param {number} [options.timeoutMs=5000] - Search timeout in ms
 * @param {number} [options.healthCheckTimeout=2000] - Health check timeout in ms
 * @returns {import('../registry.js').BackendAdapter}
 */
export function createSemanticBackend(options = {}) {
  const {
    mcpCallFn = null,
    fallbackSearchFn = null,
    timeoutMs = DEFAULT_TIMEOUT,
    healthCheckTimeout = HEALTH_CHECK_TIMEOUT,
  } = options;

  return {
    id: 'semantic-search',
    modality: 'semantic',
    priority: 10,
    displayName: 'Semantic Search (embedding-based)',
    requiresMcp: true,

    /**
     * Execute a semantic search.
     * Delegates to MCP server; falls back to direct FAISS if MCP unavailable.
     * Never throws — returns empty array on any failure.
     *
     * @param {import('../router.js').SearchRequest} request
     * @returns {Promise<import('../ranker.js').RawSearchHit[]>}
     */
    async search(request) {
      const { query, maxResults = 20 } = request;

      // Try MCP server first
      if (mcpCallFn) {
        try {
          const response = await Promise.race([
            mcpCallFn('semantic_search', {
              query,
              maxResults,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('timeout')), timeoutMs)
            ),
          ]);

          return normalizeSemanticResults(response, query);
        } catch {
          // MCP failed — try fallback
        }
      }

      // Fallback to direct FAISS search
      if (typeof fallbackSearchFn === 'function') {
        try {
          const results = await fallbackSearchFn(query, maxResults);
          return normalizeSemanticResults(results, query);
        } catch {
          return [];
        }
      }

      return [];
    },

    /**
     * Check if the semantic search system is operational.
     * Reports MCP server status and loaded module count.
     *
     * @returns {Promise<'healthy'|'degraded'|'unavailable'>}
     */
    async healthCheck() {
      if (!mcpCallFn) {
        return fallbackSearchFn ? 'degraded' : 'unavailable';
      }

      try {
        const result = await Promise.race([
          mcpCallFn('health', {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), healthCheckTimeout)
          ),
        ]);

        if (!result) return 'unavailable';

        // Check if modules are loaded
        const modules = result.modules || {};
        const loadedCount = modules.loaded || 0;

        if (loadedCount > 0) return 'healthy';
        return 'degraded';
      } catch {
        // MCP down but fallback available → degraded
        return fallbackSearchFn ? 'degraded' : 'unavailable';
      }
    },
  };
}

/**
 * Normalize MCP semantic search results into the standard RawSearchHit format.
 *
 * Maps MCP fields: filePath → filePath, startLine → line,
 * content → matchContent, score → relevanceScore.
 *
 * @param {Object|Object[]|null} rawResponse - Raw MCP response (may have .hits or be an array)
 * @param {string} query - Original search query
 * @returns {import('../ranker.js').RawSearchHit[]}
 */
export function normalizeSemanticResults(rawResponse, query) {
  if (!rawResponse) return [];

  // Handle both direct array and wrapped { hits: [...] } format
  const hits = Array.isArray(rawResponse)
    ? rawResponse
    : (rawResponse.hits || rawResponse.content?.hits || []);

  if (!Array.isArray(hits)) return [];

  return hits.map(hit => {
    const content = hit.content || hit.matchContent || '';
    const matchType = content.toLowerCase().includes(query.toLowerCase()) ? 'exact' : 'semantic';

    return {
      filePath: hit.filePath || hit.file_path || '',
      line: hit.startLine || hit.line || 0,
      matchContent: content,
      matchType,
      relevanceScore: hit.score || 0,
    };
  });
}
