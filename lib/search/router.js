/**
 * Search Router
 *
 * Main entry point for all agent search operations. Consults the backend registry,
 * routes to the best available backend, handles fallback, and returns uniformly
 * structured results.
 *
 * REQ-0041 / FR-001: Search Abstraction Layer
 * @module lib/search/router
 */

import { rankAndBound, estimateTokens } from './ranker.js';
import { resolve as pathResolve } from 'node:path';

/**
 * @typedef {Object} SearchRequest
 * @property {string} query - Search pattern or natural language query
 * @property {string} modality - 'lexical' | 'structural' | 'semantic' | 'indexed' | 'lsp' | 'any'
 * @property {string} [scope] - Directory to search within
 * @property {string} [fileGlob] - File pattern filter
 * @property {number} [tokenBudget=5000] - Maximum tokens for results
 * @property {number} [maxResults=50] - Maximum number of results
 * @property {boolean} [includeAstContext=false] - Request AST metadata if available
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string} [forceBackend] - Override routing, use specific backend ID
 * @property {boolean} [skipRanking=false] - Return raw results without ranking
 * @property {boolean} [deduplicate=true] - Remove duplicate matches
 * @property {number} [timeout=30000] - Timeout in ms
 */

/**
 * @typedef {Object} SearchResult
 * @property {import('./ranker.js').SearchHit[]} hits - Ranked search results
 * @property {SearchMeta} meta - Metadata about the search
 */

/**
 * @typedef {Object} SearchMeta
 * @property {string} backendUsed - Backend ID that served the request
 * @property {string} modalityUsed - Actual modality used
 * @property {boolean} degraded - True if fallback occurred
 * @property {number} durationMs - Execution time
 * @property {number} totalHitsBeforeRanking - Hits before ranking
 * @property {number} tokenCount - Estimated token count
 */

const VALID_MODALITIES = new Set(['lexical', 'structural', 'semantic', 'indexed', 'lsp', 'any']);
const MAX_QUERY_LENGTH = 10000;
const BASELINE_BACKEND = 'grep-glob';

/**
 * Create a search router.
 *
 * @param {Object} options
 * @param {import('./registry.js').Registry} options.registry - Backend registry
 * @param {string} [options.projectRoot] - Project root for scope validation
 * @param {Function} [options.onNotification] - Callback for degradation notifications
 * @returns {Object} Router API with search() and hasEnhancedSearch()
 */
export function createRouter(options) {
  const { registry, projectRoot, onNotification } = options;
  const notifiedDegradations = new Set();

  /**
   * Execute a search request against the best available backend.
   *
   * @param {SearchRequest} request
   * @param {SearchOptions} [searchOptions]
   * @returns {Promise<SearchResult>}
   */
  async function search(request, searchOptions = {}) {
    const startTime = performance.now();

    // Validate request
    validateRequest(request, projectRoot);

    const {
      forceBackend,
      skipRanking = false,
      deduplicate = true,
      timeout = 30000,
    } = searchOptions;

    const tokenBudget = request.tokenBudget ?? 5000;
    const maxResults = request.maxResults ?? 50;
    const modality = request.modality || 'any';

    let hits = [];
    let backendUsed = '';
    let modalityUsed = modality;
    let degraded = false;

    if (forceBackend) {
      // Force a specific backend
      const backends = registry.listBackends();
      const forced = backends.find(b => b.id === forceBackend);
      if (!forced || !forced.adapter) {
        throw new SearchError(
          `Forced backend '${forceBackend}' not available`,
          'BACKEND_UNAVAILABLE',
          forceBackend
        );
      }

      hits = await executeWithTimeout(forced.adapter.search(request), timeout);
      backendUsed = forced.id;
      modalityUsed = forced.modality;
    } else {
      // Normal routing: try best backend for modality, fall back as needed
      const result = await routeWithFallback(request, modality, timeout, registry);
      hits = result.hits;
      backendUsed = result.backendUsed;
      modalityUsed = result.modalityUsed;
      degraded = result.degraded;
    }

    // Emit degradation notification if needed
    if (degraded && onNotification) {
      const notifKey = `${modalityUsed}-degraded`;
      if (!notifiedDegradations.has(notifKey)) {
        notifiedDegradations.add(notifKey);
        onNotification({
          type: 'degradation',
          message: `Enhanced search unavailable. Falling back to standard search. Results may be less precise.`,
          severity: 'warning',
          once: true,
        });
      }
    }

    const totalHitsBeforeRanking = hits.length;

    // Rank and bound results
    let rankedHits;
    if (skipRanking) {
      rankedHits = hits.map(h => ({
        filePath: h.filePath || '',
        line: h.line || 0,
        column: h.column,
        matchType: h.matchType || 'exact',
        relevanceScore: h.relevanceScore ?? 0.5,
        contextSnippet: h.matchContent || h.contextSnippet || '',
        ast: h.ast,
      }));
      if (rankedHits.length > maxResults) {
        rankedHits = rankedHits.slice(0, maxResults);
      }
    } else {
      rankedHits = rankAndBound(hits, {
        tokenBudget,
        maxResults,
        deduplicate,
        query: request.query,
      });
    }

    // Compute token count
    const tokenCount = rankedHits.reduce(
      (sum, h) => sum + estimateTokens(`${h.filePath}:${h.line} ${h.contextSnippet}`),
      0
    );

    const durationMs = Math.round(performance.now() - startTime);

    return {
      hits: rankedHits,
      meta: {
        backendUsed,
        modalityUsed,
        degraded,
        durationMs,
        totalHitsBeforeRanking,
        tokenCount,
      },
    };
  }

  /**
   * Check if any enhanced search backends are available.
   * @returns {boolean}
   */
  function hasEnhancedSearch() {
    return registry.hasEnhancedBackends();
  }

  return { search, hasEnhancedSearch };
}

/**
 * Route a request with fallback across backends.
 *
 * @param {SearchRequest} request
 * @param {string} modality
 * @param {number} timeout
 * @param {Object} registry
 * @returns {Promise<{hits: Array, backendUsed: string, modalityUsed: string, degraded: boolean}>}
 */
async function routeWithFallback(request, modality, timeout, registry) {
  // Get backends for the requested modality
  const backends = modality === 'any'
    ? registry.listBackends().sort((a, b) => b.priority - a.priority)
    : registry.getBackendsForModality(modality);

  // Try each backend in priority order
  for (const backend of backends) {
    if (backend.health !== 'healthy' || !backend.adapter) continue;

    try {
      const hits = await executeWithTimeout(backend.adapter.search(request), timeout);
      return {
        hits,
        backendUsed: backend.id,
        modalityUsed: backend.modality,
        degraded: false,
      };
    } catch {
      // Mark backend as degraded and try next
      registry.updateHealth(backend.id, 'degraded');
    }
  }

  // All requested modality backends failed; fall back to grep-glob if not already tried
  const grepGlob = registry.getBestBackend('lexical');
  if (grepGlob && grepGlob.adapter && grepGlob.id === BASELINE_BACKEND) {
    try {
      const hits = await executeWithTimeout(grepGlob.adapter.search(request), timeout);
      return {
        hits,
        backendUsed: grepGlob.id,
        modalityUsed: 'lexical',
        degraded: true,
      };
    } catch {
      // Even grep-glob failed
    }
  }

  // If we tried lexical modality originally and grep-glob was in the chain, just return empty
  return {
    hits: [],
    backendUsed: 'none',
    modalityUsed: modality,
    degraded: true,
  };
}

/**
 * Execute a promise with timeout.
 *
 * @param {Promise} promise
 * @param {number} timeoutMs
 * @returns {Promise}
 */
function executeWithTimeout(promise, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new SearchError('Search timed out', 'TIMEOUT')), timeoutMs)
    ),
  ]);
}

/**
 * Validate a search request.
 *
 * @param {SearchRequest} request
 * @param {string} [projectRoot]
 * @throws {SearchError}
 */
function validateRequest(request, projectRoot) {
  if (!request) {
    throw new SearchError('Search request is required', 'INVALID_REQUEST');
  }

  if (!request.query || typeof request.query !== 'string') {
    throw new SearchError('Search query must be a non-empty string', 'INVALID_REQUEST');
  }

  if (request.query.length > MAX_QUERY_LENGTH) {
    throw new SearchError(
      `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
      'INVALID_REQUEST'
    );
  }

  // Check for null bytes
  if (request.query.includes('\0')) {
    throw new SearchError('Query contains invalid null bytes', 'INVALID_REQUEST');
  }

  if (request.modality && !VALID_MODALITIES.has(request.modality)) {
    throw new SearchError(
      `Invalid modality: '${request.modality}'. Must be one of: ${[...VALID_MODALITIES].join(', ')}`,
      'INVALID_REQUEST'
    );
  }

  // Scope path traversal check
  if (request.scope && projectRoot) {
    const resolvedScope = pathResolve(projectRoot, request.scope);
    const resolvedRoot = pathResolve(projectRoot);
    if (!resolvedScope.startsWith(resolvedRoot)) {
      throw new SearchError(
        'Scope path traversal detected: scope must be within project root',
        'INVALID_REQUEST'
      );
    }
  }
}

/**
 * Search error class with structured error codes.
 */
export class SearchError extends Error {
  /**
   * @param {string} message
   * @param {'BACKEND_UNAVAILABLE'|'TIMEOUT'|'INVALID_REQUEST'|'ALL_BACKENDS_FAILED'} code
   * @param {string} [backendId]
   * @param {boolean} [fallbackUsed]
   */
  constructor(message, code, backendId, fallbackUsed) {
    super(message);
    this.name = 'SearchError';
    this.code = code;
    this.backendId = backendId;
    this.fallbackUsed = fallbackUsed ?? false;
  }
}
