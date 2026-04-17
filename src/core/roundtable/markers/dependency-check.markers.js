/**
 * dependency-check.markers.js — Marker extractor for DEPENDENCY_CHECK sub-task.
 *
 * Detects: dependencies checked, conflicts found/none.
 * Uses regex + key-phrase detection only (no LLM calls, no network).
 *
 * @module dependency-check-markers
 * Traces: FR-003, AC-003-02
 */

/**
 * Patterns indicating dependencies have been checked.
 * @type {RegExp[]}
 */
const DEPENDENCIES_CHECKED_PATTERNS = [
  /dependenc(?:y|ies)\s+(?:check|analysis|review|audit)\s*(?:complete|done|finished)?/i,
  /(?:checked|reviewed|audited|analyzed)\s+(?:the\s+)?dependenc(?:y|ies)/i,
  /(?:no\s+)?dependency\s+(?:conflicts?|issues?|problems?)/i,
  /package\.json\s+(?:dependencies|devDependencies)/i,
  /dependenc(?:y|ies)\s+(?:are|look)\s+(?:clean|clear|good|fine)/i
];

/**
 * Patterns indicating conflicts were found.
 * @type {RegExp[]}
 */
const CONFLICTS_FOUND_PATTERNS = [
  /(?:dependency|version)\s+conflicts?\s+(?:found|detected|identified)/i,
  /conflicting\s+(?:versions?|dependenc(?:y|ies))/i,
  /(?:incompatible|mismatched)\s+(?:versions?|dependenc(?:y|ies))/i,
  /peer\s+dependency\s+(?:warning|error|conflict)/i
];

/**
 * Patterns indicating no conflicts were found.
 * @type {RegExp[]}
 */
const NO_CONFLICTS_PATTERNS = [
  /no\s+(?:dependency\s+)?conflicts?\s+(?:found|detected|identified)/i,
  /no\s+(?:version\s+)?(?:conflicts?|issues?|incompatibilities)/i,
  /dependenc(?:y|ies)\s+(?:are\s+)?(?:compatible|clean|clear|aligned)/i,
  /all\s+dependenc(?:y|ies)\s+(?:are\s+)?(?:satisfied|met|resolved)/i
];

/**
 * Extract dependency-check markers from LLM output.
 *
 * @param {string} llmOutput - Raw LLM output text
 * @returns {object} Extracted markers: { dependencies_checked, conflicts_found, no_conflicts }
 * Traces: FR-003, AC-003-02
 */
export function extractMarkers(llmOutput) {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) return {};

  const result = {};
  let hasSignals = false;

  if (DEPENDENCIES_CHECKED_PATTERNS.some(p => p.test(llmOutput))) {
    result.dependencies_checked = true;
    hasSignals = true;
  }

  if (CONFLICTS_FOUND_PATTERNS.some(p => p.test(llmOutput))) {
    result.conflicts_found = true;
    hasSignals = true;
  }

  if (NO_CONFLICTS_PATTERNS.some(p => p.test(llmOutput))) {
    result.no_conflicts = true;
    hasSignals = true;
  }

  return hasSignals ? result : {};
}
