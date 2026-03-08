/**
 * Content Redaction Pipeline — strip source to configured security tier.
 *
 * Three tiers:
 *   - interface: public signatures only (class names, method sigs, types)
 *   - guided: signatures + AI-generated behavioral summaries
 *   - full: complete source code (no redaction)
 *
 * Redaction is applied BEFORE embedding — raw source never enters
 * the vector store for interface/guided tiers.
 *
 * REQ-0045 / FR-011 / AC-011-01 through AC-011-05 / M4
 * @module lib/embedding/redaction
 */

import { redactToInterface, extractSignatures } from './interface-tier.js';
import { redactToGuided, generateSummary } from './guided-tier.js';

export { extractSignatures } from './interface-tier.js';
export { generateSummary } from './guided-tier.js';

const VALID_TIERS = new Set(['interface', 'guided', 'full']);

/**
 * @typedef {Object} RedactionOptions
 * @property {Function} [summaryFn] - AI summary function for guided tier
 * @property {number} [maxSummaryTokens=128] - Max tokens per summary
 */

/**
 * Redact an array of chunks to the specified security tier.
 *
 * @param {import('../chunker/index.js').Chunk[]} chunks - Chunks to redact
 * @param {'interface'|'guided'|'full'} tier - Security tier
 * @param {RedactionOptions} [options]
 * @returns {Promise<import('../chunker/index.js').Chunk[]>} Redacted chunks
 * @throws {Error} If tier is invalid
 */
export async function redact(chunks, tier, options = {}) {
  if (!tier || !VALID_TIERS.has(tier)) {
    throw new Error(`Invalid redaction tier: "${tier}". Must be one of: interface, guided, full`);
  }

  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  if (tier === 'full') {
    // Full tier: pass through unchanged, just tag with tier
    return chunks.map(chunk => ({
      ...chunk,
      redactionTier: 'full',
    }));
  }

  if (tier === 'interface') {
    return chunks.map(chunk => redactToInterface(chunk));
  }

  // Guided tier — async because summary generation may call AI model
  const results = [];
  for (const chunk of chunks) {
    results.push(await redactToGuided(chunk, options));
  }
  return results;
}
