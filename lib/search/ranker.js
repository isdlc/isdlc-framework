/**
 * Search Result Ranker
 *
 * Rank search results by relevance, deduplicate, and enforce token budget limits.
 * Uses a simplified BM25-inspired scoring for hits without backend-provided scores.
 *
 * REQ-0041 / FR-011: Result Ranking and Token Budget
 * @module lib/search/ranker
 */

/**
 * @typedef {Object} RawSearchHit
 * @property {string} filePath - Absolute path to the matched file
 * @property {number} line - Line number of match
 * @property {number} [column] - Column number if available
 * @property {string} matchContent - Raw match content
 * @property {number} [relevanceScore] - Backend-provided score (0.0-1.0)
 * @property {Object} [ast] - AST metadata if available
 */

/**
 * @typedef {Object} SearchHit
 * @property {string} filePath - Absolute path
 * @property {number} line - Line number (0 for file-level)
 * @property {number} [column] - Column number if available
 * @property {string} matchType - 'exact' | 'structural' | 'semantic' | 'filename'
 * @property {number} relevanceScore - 0.0 to 1.0
 * @property {string} contextSnippet - Code context around the match
 * @property {Object} [ast] - AST metadata if available
 */

/**
 * @typedef {Object} RankingOptions
 * @property {number} [tokenBudget=5000] - Maximum tokens for results
 * @property {number} [maxResults=50] - Maximum number of results
 * @property {boolean} [deduplicate=true] - Remove duplicate matches
 * @property {string} [query] - Original query (for BM25 fallback scoring)
 */

/**
 * Estimate token count for a string.
 * Uses chars/4 heuristic (GPT-style tokenization approximation).
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Compute a simple BM25-inspired relevance score for a hit.
 * Used as fallback when the backend does not provide a score.
 *
 * @param {RawSearchHit} hit
 * @param {string} [query]
 * @returns {number} Score between 0.0 and 1.0
 */
function computeFallbackScore(hit, query) {
  let score = 0.3; // baseline

  if (query && hit.matchContent) {
    const content = hit.matchContent.toLowerCase();
    const q = query.toLowerCase();

    // Exact match bonus
    if (content.includes(q)) {
      score += 0.4;
    }

    // Term overlap (simple word-level matching)
    const queryTerms = q.split(/\s+/).filter(Boolean);
    const matchedTerms = queryTerms.filter(term => content.includes(term));
    if (queryTerms.length > 0) {
      score += 0.2 * (matchedTerms.length / queryTerms.length);
    }

    // Shorter content is more precise (inverse document length)
    const lengthPenalty = Math.min(1, 100 / Math.max(content.length, 1));
    score += 0.1 * lengthPenalty;
  }

  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Rank, deduplicate, and trim results to token budget.
 *
 * @param {RawSearchHit[]} hits - Raw results from backend
 * @param {RankingOptions} [options] - Ranking options
 * @returns {SearchHit[]} Ranked, bounded results
 */
export function rankAndBound(hits, options = {}) {
  const {
    tokenBudget = 5000,
    maxResults = 50,
    deduplicate = true,
    query = '',
  } = options;

  if (!Array.isArray(hits) || hits.length === 0) {
    return [];
  }

  // Step 1: Assign scores (use backend score or compute fallback)
  let scored = hits.map(hit => ({
    filePath: hit.filePath || '',
    line: hit.line || 0,
    column: hit.column,
    matchType: hit.matchType || (hit.ast ? 'structural' : 'exact'),
    relevanceScore: typeof hit.relevanceScore === 'number'
      ? Math.min(1.0, Math.max(0.0, hit.relevanceScore))
      : computeFallbackScore(hit, query),
    contextSnippet: hit.matchContent || hit.contextSnippet || '',
    ast: hit.ast || undefined,
  }));

  // Step 2: Deduplicate (by filePath + line, keep highest score)
  if (deduplicate) {
    const seen = new Map();
    for (const hit of scored) {
      const key = `${hit.filePath}:${hit.line}`;
      const existing = seen.get(key);
      if (!existing || hit.relevanceScore > existing.relevanceScore) {
        seen.set(key, hit);
      }
    }
    scored = [...seen.values()];
  }

  // Step 3: Sort by relevance (descending), stable sort preserves insertion order for ties
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Step 4: Enforce maxResults
  if (scored.length > maxResults) {
    scored = scored.slice(0, maxResults);
  }

  // Step 5: Enforce token budget (trim from the end / lowest relevance)
  if (tokenBudget > 0) {
    let totalTokens = 0;
    let cutIndex = scored.length;

    for (let i = 0; i < scored.length; i++) {
      const hitTokens = estimateTokens(hit_to_string(scored[i]));
      if (totalTokens + hitTokens > tokenBudget && i > 0) {
        cutIndex = i;
        break;
      }
      totalTokens += hitTokens;
    }

    scored = scored.slice(0, cutIndex);
  }

  return scored;
}

/**
 * Serialize a hit for token estimation.
 * @param {SearchHit} hit
 * @returns {string}
 */
function hit_to_string(hit) {
  return `${hit.filePath}:${hit.line} ${hit.contextSnippet}`;
}
