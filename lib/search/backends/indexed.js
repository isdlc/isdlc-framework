/**
 * Indexed Search Backend - Code-Index-MCP Adapter
 *
 * MCP server adapter for ViperJuice/Code-Index-MCP providing sub-second
 * indexed search using tree-sitter parsing and SQLite FTS5 with BM25 ranking.
 * Returns empty results gracefully when the MCP server is unavailable.
 *
 * REQ-0044 / FR-003: Indexed Backend Adapter
 * REQ-0044 / FR-010: Backend Health Monitoring
 * @module lib/search/backends/indexed
 */

const HEALTH_CHECK_TIMEOUT = 2000;

/**
 * Create the indexed (code-index-mcp) backend adapter.
 *
 * @param {Object} [options]
 * @param {Function} [options.mcpCallFn] - MCP tool call function for code-index-mcp
 * @param {number} [options.healthCheckTimeout=2000] - Health check timeout in ms
 * @returns {import('../registry.js').BackendAdapter}
 */
export function createIndexedBackend(options = {}) {
  const {
    mcpCallFn = null,
    healthCheckTimeout = HEALTH_CHECK_TIMEOUT,
  } = options;

  return {
    id: 'code-index',
    modality: 'indexed',
    priority: 10,
    displayName: 'Code Index (indexed search)',
    requiresMcp: true,

    /**
     * Execute an indexed search using code-index-mcp.
     * Never throws — returns empty array on any failure.
     *
     * @param {import('../router.js').SearchRequest} request
     * @returns {Promise<import('../ranker.js').RawSearchHit[]>}
     */
    async search(request) {
      if (!mcpCallFn) return [];

      const { query, fileGlob, maxResults = 50 } = request;

      try {
        const response = await mcpCallFn('search_code_advanced', {
          query,
          file_pattern: fileGlob,
          max_results: maxResults,
        });

        return normalizeIndexedResults(response, query);
      } catch {
        return [];
      }
    },

    /**
     * Check if the code-index-mcp server is operational.
     * Must complete within healthCheckTimeout ms.
     *
     * @returns {Promise<'healthy'|'degraded'|'unavailable'>}
     */
    async healthCheck() {
      if (!mcpCallFn) return 'unavailable';

      try {
        const result = await Promise.race([
          mcpCallFn('ping', {}),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), healthCheckTimeout)
          ),
        ]);

        return result ? 'healthy' : 'unavailable';
      } catch {
        return 'unavailable';
      }
    },
  };
}

/**
 * Normalize code-index-mcp results into the standard RawSearchHit format.
 *
 * Maps MCP fields: file_path → filePath, line_number → line,
 * content → matchContent, score → relevanceScore.
 * matchType is 'exact' if query is a substring of content, else 'fuzzy'.
 *
 * @param {Object[]|null} rawResults - Raw MCP response array
 * @param {string} query - Original search query
 * @returns {import('../ranker.js').RawSearchHit[]}
 */
export function normalizeIndexedResults(rawResults, query) {
  if (!rawResults || !Array.isArray(rawResults)) return [];

  return rawResults.map(hit => {
    const content = hit.content || '';
    const matchType = content.includes(query) ? 'exact' : 'fuzzy';

    return {
      filePath: hit.file_path || '',
      line: hit.line_number || 0,
      matchContent: content,
      matchType,
      relevanceScore: hit.score,
    };
  });
}
