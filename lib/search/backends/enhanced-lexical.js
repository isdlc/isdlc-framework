/**
 * Enhanced Lexical Search Backend - Probe Adapter
 *
 * MCP server adapter for Probe providing tree-sitter-enhanced ripgrep search.
 * Higher priority than grep-glob within lexical modality.
 *
 * REQ-0041 / FR-008: Enhanced Lexical Search Backend
 * @module lib/search/backends/enhanced-lexical
 */

const HEALTH_CHECK_TIMEOUT = 2000;

/**
 * Create the enhanced lexical (Probe) backend adapter.
 *
 * @param {Object} [options]
 * @param {Function} [options.mcpCallFn] - MCP tool call function for Probe
 * @param {number} [options.healthCheckTimeout=2000] - Health check timeout in ms
 * @returns {import('../registry.js').BackendAdapter}
 */
export function createEnhancedLexicalBackend(options = {}) {
  const {
    mcpCallFn = null,
    healthCheckTimeout = HEALTH_CHECK_TIMEOUT,
  } = options;

  return {
    id: 'probe',
    modality: 'lexical',
    priority: 10,
    displayName: 'Probe (enhanced lexical)',
    requiresMcp: true,

    /**
     * Execute a search using Probe MCP.
     *
     * @param {import('../router.js').SearchRequest} request
     * @returns {Promise<import('../ranker.js').RawSearchHit[]>}
     */
    async search(request) {
      if (!mcpCallFn) {
        throw new ProbeBackendError('Probe MCP function not configured');
      }

      const { query, scope, fileGlob, maxResults = 50 } = request;

      try {
        const response = await mcpCallFn('search', {
          query,
          path: scope,
          glob: fileGlob,
          maxResults,
        });

        return normalizeProbeResults(response);
      } catch (err) {
        throw new ProbeBackendError(`Probe search failed: ${err.message}`);
      }
    },

    /**
     * Check if the Probe MCP server is operational.
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
 * Normalize Probe results into the standard RawSearchHit format.
 *
 * @param {Object} response - Raw Probe MCP response
 * @returns {import('../ranker.js').RawSearchHit[]}
 */
export function normalizeProbeResults(response) {
  if (!response || !Array.isArray(response.results)) return [];

  return response.results.map(result => {
    const hit = {
      filePath: result.file || result.filePath || '',
      line: result.line || result.lineNumber || 0,
      column: result.column,
      matchContent: result.content || result.text || result.snippet || '',
      matchType: 'exact',
      relevanceScore: result.score ?? result.relevance ?? undefined,
    };

    // Probe may include tree-sitter AST context
    if (result.ast || result.context) {
      const astSource = result.ast || result.context;
      hit.ast = {
        nodeType: astSource.nodeType || astSource.kind || 'unknown',
        parentScope: astSource.parentScope || astSource.scope || 'module',
        symbolName: astSource.symbolName || astSource.name,
        language: astSource.language || astSource.lang,
      };
    }

    return hit;
  });
}

/**
 * Error class for Probe backend-specific failures.
 */
class ProbeBackendError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProbeBackendError';
  }
}

export { ProbeBackendError };
