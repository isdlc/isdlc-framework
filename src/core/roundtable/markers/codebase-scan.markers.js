/**
 * codebase-scan.markers.js — Marker extractor for CODEBASE_SCAN sub-task.
 *
 * Detects: file count mentioned, modules listed, "files affected" / "modules touched" patterns.
 * Completion: scan results written.
 * Uses regex + key-phrase detection only (no LLM calls, no network).
 *
 * @module codebase-scan-markers
 * Traces: FR-003, AC-003-02
 */

/**
 * Patterns indicating scan completion.
 * @type {RegExp[]}
 */
const SCAN_COMPLETE_PATTERNS = [
  /scan\s+complete/i,
  /scan\s+(?:is\s+)?(?:done|finished)/i,
  /(?:codebase|code)\s+(?:scan|review|analysis)\s+(?:complete|done|finished)/i,
  /(?:finished|completed)\s+(?:the\s+)?(?:scan|review|analysis)/i,
  /moving\s+to\s+(?:blast\s+radius|impact|next)/i,
  /scan\s+results?\s+(?:written|recorded|captured)/i
];

/**
 * Patterns indicating file count mention.
 * @type {RegExp[]}
 */
const FILE_COUNT_PATTERNS = [
  /\b\d+\s+(?:files?|modules?)\b/i,
  /files?\s+affected\s*:?\s*\d+/i,
  /(?:found|identified|detected)\s+\d+\s+(?:files?|modules?)/i
];

/**
 * Patterns indicating modules listed.
 * @type {RegExp[]}
 */
const MODULES_LISTED_PATTERNS = [
  /modules?\s+(?:touched|affected|involved|listed)\s*:/i,
  /(?:src|lib|packages?)\/[\w/-]+/,
  /files?\s+affected\s*:/i,
  /(?:the\s+)?following\s+(?:files?|modules?|directories)/i
];

/**
 * Extract codebase-scan markers from LLM output.
 *
 * @param {string} llmOutput - Raw LLM output text
 * @returns {object} Extracted markers: { scan_complete, file_count_mentioned, modules_listed }
 * Traces: FR-003, AC-003-02
 */
export function extractMarkers(llmOutput) {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) return {};

  const result = {};
  let hasSignals = false;

  if (SCAN_COMPLETE_PATTERNS.some(p => p.test(llmOutput))) {
    result.scan_complete = true;
    hasSignals = true;
  }

  if (FILE_COUNT_PATTERNS.some(p => p.test(llmOutput))) {
    result.file_count_mentioned = true;
    hasSignals = true;
  }

  if (MODULES_LISTED_PATTERNS.some(p => p.test(llmOutput))) {
    result.modules_listed = true;
    hasSignals = true;
  }

  return hasSignals ? result : {};
}
