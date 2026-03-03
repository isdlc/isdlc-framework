/**
 * Structural Search Backend - ast-grep Adapter
 *
 * MCP server adapter for ast-grep providing AST-aware structural search.
 * Falls back gracefully when the MCP server is unavailable.
 *
 * REQ-0041 / FR-007: Structural Search Backend
 * @module lib/search/backends/structural
 */

const HEALTH_CHECK_TIMEOUT = 2000;

/**
 * Create the structural (ast-grep) backend adapter.
 *
 * @param {Object} [options]
 * @param {Function} [options.mcpCallFn] - MCP tool call function for ast-grep
 * @param {number} [options.healthCheckTimeout=2000] - Health check timeout in ms
 * @returns {import('../registry.js').BackendAdapter}
 */
export function createStructuralBackend(options = {}) {
  const {
    mcpCallFn = null,
    healthCheckTimeout = HEALTH_CHECK_TIMEOUT,
  } = options;

  return {
    id: 'ast-grep',
    modality: 'structural',
    priority: 10,
    displayName: 'ast-grep (structural)',
    requiresMcp: true,

    /**
     * Execute a structural search using ast-grep MCP.
     *
     * @param {import('../router.js').SearchRequest} request
     * @returns {Promise<import('../ranker.js').RawSearchHit[]>}
     */
    async search(request) {
      if (!mcpCallFn) {
        throw new SearchBackendError('ast-grep MCP function not configured');
      }

      const { query, scope, fileGlob, includeAstContext = true } = request;

      try {
        const response = await mcpCallFn('search', {
          pattern: query,
          path: scope,
          glob: fileGlob,
        });

        return normalizeAstGrepResults(response, includeAstContext);
      } catch (err) {
        throw new SearchBackendError(`ast-grep search failed: ${err.message}`);
      }
    },

    /**
     * Check if the ast-grep MCP server is operational.
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
 * Normalize ast-grep results into the standard RawSearchHit format.
 *
 * @param {Object} response - Raw ast-grep MCP response
 * @param {boolean} includeAstContext - Whether to include AST metadata
 * @returns {import('../ranker.js').RawSearchHit[]}
 */
export function normalizeAstGrepResults(response, includeAstContext = true) {
  if (!response || !Array.isArray(response.matches)) return [];

  return response.matches.map(match => {
    const hit = {
      filePath: match.file || match.filePath || '',
      line: match.range?.start?.line || match.line || 0,
      column: match.range?.start?.column || match.column,
      matchContent: match.text || match.content || '',
      matchType: 'structural',
      relevanceScore: match.score ?? 0.8, // structural matches have high relevance
    };

    if (includeAstContext && match.meta) {
      hit.ast = {
        nodeType: match.meta.nodeType || match.meta.kind || 'unknown',
        parentScope: match.meta.parentScope || match.meta.enclosingScope || 'module',
        symbolName: match.meta.symbolName || match.meta.name,
        language: match.meta.language || match.meta.lang,
      };
    }

    return hit;
  });
}

/**
 * Error class for backend-specific failures.
 */
class SearchBackendError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SearchBackendError';
  }
}

export { SearchBackendError };
