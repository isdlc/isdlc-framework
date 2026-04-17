/**
 * scope-framing.markers.js — Marker extractor for SCOPE_FRAMING sub-task.
 *
 * Detects: scope statement present, user types identified, problem articulated.
 * Uses regex + key-phrase detection only (no LLM calls, no network).
 *
 * @module scope-framing-markers
 * Traces: FR-003, AC-003-02
 */

/**
 * Patterns indicating scope has been framed / accepted.
 * @type {RegExp[]}
 */
const SCOPE_ACCEPTED_PATTERNS = [
  /scope\s+(?:is\s+)?clear/i,
  /enough\s+context\s+to\s+proceed/i,
  /scope\s+(?:has\s+been\s+)?(?:defined|framed|established|accepted)/i,
  /we\s+have\s+(?:a\s+)?clear\s+(?:understanding|scope|picture)/i,
  /ready\s+to\s+proceed/i,
  /scope\s+framing\s+complete/i
];

/**
 * Patterns indicating a scope statement is present.
 * @type {RegExp[]}
 */
const SCOPE_STATEMENT_PATTERNS = [
  /(?:the\s+)?scope\s+(?:of\s+(?:this|the)\s+(?:change|feature|work|task|request))/i,
  /problem\s+(?:statement|description)\s*:/i,
  /what\s+(?:we're|we\s+are)\s+(?:building|implementing|changing|fixing)/i,
  /the\s+user\s+wants?\s+to/i,
  /requirements?\s*:/i
];

/**
 * Patterns indicating user types have been identified.
 * @type {RegExp[]}
 */
const USER_TYPES_PATTERNS = [
  /(?:user|actor|persona|stakeholder)\s+types?\s*:/i,
  /(?:end\s+)?users?\s+(?:include|are|who)/i,
  /(?:developers?|admins?|operators?)\s+(?:who|that|will)/i,
  /affected\s+(?:users?|roles?|actors?)/i
];

/**
 * Patterns indicating the problem has been articulated.
 * @type {RegExp[]}
 */
const PROBLEM_ARTICULATED_PATTERNS = [
  /the\s+(?:core\s+)?(?:problem|issue|challenge)\s+is/i,
  /(?:currently|right\s+now|today)[,\s]+(?:the|there|it)/i,
  /this\s+(?:causes?|leads?\s+to|results?\s+in)/i,
  /pain\s+point/i,
  /the\s+bug\s+(?:is|causes?|manifests?)/i
];

/**
 * Extract scope-framing markers from LLM output.
 *
 * @param {string} llmOutput - Raw LLM output text
 * @returns {object} Extracted markers: { scope_accepted, scope_statement_present, user_types_identified, problem_articulated }
 * Traces: FR-003, AC-003-02
 */
export function extractMarkers(llmOutput) {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) return {};

  const result = {};
  let hasSignals = false;

  if (SCOPE_ACCEPTED_PATTERNS.some(p => p.test(llmOutput))) {
    result.scope_accepted = true;
    hasSignals = true;
  }

  if (SCOPE_STATEMENT_PATTERNS.some(p => p.test(llmOutput))) {
    result.scope_statement_present = true;
    hasSignals = true;
  }

  if (USER_TYPES_PATTERNS.some(p => p.test(llmOutput))) {
    result.user_types_identified = true;
    hasSignals = true;
  }

  if (PROBLEM_ARTICULATED_PATTERNS.some(p => p.test(llmOutput))) {
    result.problem_articulated = true;
    hasSignals = true;
  }

  return hasSignals ? result : {};
}
