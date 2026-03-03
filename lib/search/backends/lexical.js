/**
 * Lexical Search Backend - Grep/Glob Adapter
 *
 * Wraps Claude Code's built-in Grep and Glob tools as a search backend.
 * This is the baseline backend that is always available.
 *
 * REQ-0041 / FR-009: Agent Migration Path
 * @module lib/search/backends/lexical
 */

/**
 * @typedef {Object} GrepResult
 * @property {string} filePath - File path
 * @property {number} line - Line number
 * @property {string} content - Matched line content
 */

/**
 * Create the lexical (grep-glob) backend adapter.
 *
 * The grepFn and globFn parameters allow injection of the actual
 * Grep/Glob tool implementations (or test doubles).
 *
 * @param {Object} [options]
 * @param {Function} [options.grepFn] - Grep tool function (pattern, options) => results
 * @param {Function} [options.globFn] - Glob tool function (pattern, options) => files
 * @returns {import('../registry.js').BackendAdapter}
 */
export function createLexicalBackend(options = {}) {
  const { grepFn = defaultGrep, globFn = defaultGlob } = options;

  return {
    id: 'grep-glob',
    modality: 'lexical',
    priority: 0,
    displayName: 'Grep/Glob (built-in)',
    requiresMcp: false,

    /**
     * Execute a search using grep/glob.
     *
     * @param {import('../router.js').SearchRequest} request
     * @returns {Promise<import('../ranker.js').RawSearchHit[]>}
     */
    async search(request) {
      const { query, scope, fileGlob, maxResults = 50 } = request;

      if (!query) return [];

      try {
        const results = await grepFn(query, {
          path: scope,
          glob: fileGlob,
          maxResults,
        });

        // Normalize grep results to RawSearchHit
        return normalizeGrepResults(results, query);
      } catch {
        // If grep fails, return empty results (graceful)
        return [];
      }
    },

    /**
     * Health check - grep/glob is always healthy (built-in).
     * @returns {Promise<'healthy'>}
     */
    async healthCheck() {
      return 'healthy';
    },
  };
}

/**
 * Normalize grep results into the standard RawSearchHit format.
 *
 * @param {GrepResult[]|string[]} results - Raw grep results
 * @param {string} query - Original query for scoring
 * @returns {import('../ranker.js').RawSearchHit[]}
 */
export function normalizeGrepResults(results, query) {
  if (!Array.isArray(results)) return [];

  return results.map(result => {
    // Handle both object and string formats
    if (typeof result === 'string') {
      // Format: "filepath:line:content"
      const parts = result.split(':');
      const filePath = parts[0] || '';
      const line = parseInt(parts[1], 10) || 0;
      const content = parts.slice(2).join(':').trim();

      return {
        filePath,
        line,
        matchContent: content,
        matchType: 'exact',
      };
    }

    return {
      filePath: result.filePath || result.file || '',
      line: result.line || result.lineNumber || 0,
      column: result.column,
      matchContent: result.content || result.matchContent || result.text || '',
      matchType: 'exact',
    };
  });
}

/**
 * Default grep function (no-op, returns empty).
 * In production, this is replaced by the actual Grep tool.
 */
async function defaultGrep() {
  return [];
}

/**
 * Default glob function (no-op, returns empty).
 * In production, this is replaced by the actual Glob tool.
 */
async function defaultGlob() {
  return [];
}
