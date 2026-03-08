/**
 * Guided Tier — interface content plus AI-generated behavioral summaries.
 *
 * Replaces method bodies with brief descriptions of what the code does.
 * Falls back to interface-tier output when summary model is unavailable.
 *
 * REQ-0045 / FR-011 / AC-011-02 / M4
 * @module lib/embedding/redaction/guided-tier
 */

import { redactToInterface, extractSignatures } from './interface-tier.js';

/**
 * @typedef {Object} SummaryOptions
 * @property {Function} [summaryFn] - (content: string, maxTokens: number) => Promise<string>
 * @property {number} [maxSummaryTokens=128] - Maximum tokens per summary
 */

/**
 * Generate a behavioral summary from source code content.
 * Uses the provided summaryFn, or falls back to a simple heuristic.
 *
 * @param {string} content - Source code to summarize
 * @param {SummaryOptions} options
 * @returns {Promise<string|null>} Summary text, or null if generation fails
 */
export async function generateSummary(content, options = {}) {
  const { summaryFn = null, maxSummaryTokens = 128 } = options;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return null;
  }

  // Use provided AI summary function if available
  if (typeof summaryFn === 'function') {
    try {
      const summary = await summaryFn(content, maxSummaryTokens);
      if (summary && typeof summary === 'string' && summary.trim().length > 0) {
        return summary.trim();
      }
    } catch {
      // Fall through to heuristic
    }
  }

  // Heuristic fallback: extract key information from the code
  return heuristicSummary(content, maxSummaryTokens);
}

/**
 * Simple heuristic summary — extracts comments, function calls, and return statements.
 *
 * @param {string} content
 * @param {number} maxTokens
 * @returns {string|null}
 */
function heuristicSummary(content, maxTokens) {
  const lines = content.split('\n');
  const parts = [];

  // Extract doc comments
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')) {
      const comment = trimmed.replace(/^\/\*\*?\s*|\*\/\s*$|\*\s*|\/\/\s*/g, '').trim();
      if (comment.length > 5 && !comment.startsWith('@')) {
        parts.push(comment);
      }
    }
  }

  // Extract return statements (shows what the function produces)
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('return ') && trimmed.length < 80) {
      parts.push(`Returns: ${trimmed.slice(7).replace(/;$/, '')}`);
      break;
    }
  }

  if (parts.length === 0) return null;

  // Truncate to approximate token budget (4 chars per token)
  const maxChars = maxTokens * 4;
  let summary = parts.join('. ');
  if (summary.length > maxChars) {
    summary = summary.slice(0, maxChars - 3) + '...';
  }

  return summary;
}

/**
 * Apply guided-tier redaction to a single chunk.
 * Produces interface content plus behavioral summary.
 * Falls back to interface-only when summary generation fails.
 *
 * @param {import('../chunker/index.js').Chunk} chunk
 * @param {SummaryOptions} [options]
 * @returns {Promise<import('../chunker/index.js').Chunk>} Redacted chunk (new object)
 */
export async function redactToGuided(chunk, options = {}) {
  if (!chunk) return chunk;

  // Start with interface-tier content
  const interfaceChunk = redactToInterface(chunk);

  // Generate summary of the original content
  const summary = await generateSummary(chunk.content, options);

  if (!summary) {
    // Fallback: return interface-tier only
    return {
      ...interfaceChunk,
      redactionTier: 'guided',
    };
  }

  // Combine interface signatures with summary
  const guidedContent = `${interfaceChunk.content}\n\n// Summary: ${summary}`;

  return {
    ...chunk,
    content: guidedContent,
    tokenCount: Math.ceil(guidedContent.length / 4),
    redactionTier: 'guided',
  };
}
