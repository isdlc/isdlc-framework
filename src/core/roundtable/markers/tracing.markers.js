/**
 * tracing.markers.js — Marker extractor for TRACING sub-task (bug-gather only).
 *
 * Detects: hypotheses ranked, code paths traced, root cause identified.
 * Uses regex + key-phrase detection only (no LLM calls, no network).
 *
 * @module tracing-markers
 * Traces: FR-003, AC-003-02
 */

/**
 * Patterns indicating hypotheses are ranked.
 * @type {RegExp[]}
 */
const HYPOTHESES_RANKED_PATTERNS = [
  /hypothes[ie]s?\s*(?:\d+|#\d+|[A-C])?\s*:/i,
  /(?:ranked|ordered|prioritized)\s+hypothes[ie]s/i,
  /(?:most|least)\s+likely\s+(?:cause|hypothesis|explanation)/i,
  /hypothesis\s+(?:ranking|priority|order)\s*:/i,
  /(?:primary|secondary|tertiary)\s+hypothesis/i
];

/**
 * Patterns indicating code paths have been traced.
 * @type {RegExp[]}
 */
const CODE_PATHS_TRACED_PATTERNS = [
  /(?:code|execution|call)\s+paths?\s+(?:traced|followed|analyzed)/i,
  /(?:traced|followed)\s+(?:the\s+)?(?:code|execution|call)\s+(?:path|flow|chain)/i,
  /(?:stack\s+trace|backtrace|call\s+stack)\s+(?:shows?|reveals?|indicates?)/i,
  /(?:entry\s+point|call\s+site|invocation)\s*(?:->|-->|=>|\u2192)/i,
  /execution\s+(?:flow|trace|path)\s*:/i
];

/**
 * Patterns indicating root cause has been identified.
 * @type {RegExp[]}
 */
const ROOT_CAUSE_PATTERNS = [
  /root\s+cause\s*(?:identified|found|is|:)/i,
  /(?:the\s+)?(?:underlying|fundamental|actual|real)\s+(?:cause|issue|problem|bug)\s+is/i,
  /(?:this\s+)?(?:bug|issue|error|failure)\s+is\s+caused\s+by/i,
  /(?:identified|found|determined|pinpointed)\s+(?:the\s+)?root\s+cause/i,
  /tracing\s+(?:complete|done|finished)/i
];

/**
 * Extract tracing markers from LLM output.
 *
 * @param {string} llmOutput - Raw LLM output text
 * @returns {object} Extracted markers: { hypotheses_ranked, code_paths_traced, root_cause_identified }
 * Traces: FR-003, AC-003-02
 */
export function extractMarkers(llmOutput) {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) return {};

  const result = {};
  let hasSignals = false;

  if (HYPOTHESES_RANKED_PATTERNS.some(p => p.test(llmOutput))) {
    result.hypotheses_ranked = true;
    hasSignals = true;
  }

  if (CODE_PATHS_TRACED_PATTERNS.some(p => p.test(llmOutput))) {
    result.code_paths_traced = true;
    hasSignals = true;
  }

  if (ROOT_CAUSE_PATTERNS.some(p => p.test(llmOutput))) {
    result.root_cause_identified = true;
    hasSignals = true;
  }

  return hasSignals ? result : {};
}
