/**
 * options-research.markers.js — Marker extractor for OPTIONS_RESEARCH sub-task.
 *
 * Detects: multiple options evaluated, selected with rationale, pros/cons listed.
 * Uses regex + key-phrase detection only (no LLM calls, no network).
 *
 * @module options-research-markers
 * Traces: FR-003, AC-003-02
 */

/**
 * Patterns indicating multiple options are evaluated.
 * @type {RegExp[]}
 */
const OPTIONS_EVALUATED_PATTERNS = [
  /option\s+[A-Z1-3]\s*:/i,
  /(?:approach|option|alternative|strategy)\s+(?:\d+|[A-C])\s*:/i,
  /(?:we\s+)?(?:evaluated|considered|explored|compared)\s+(?:\d+|multiple|several|two|three)\s+(?:options?|approaches?|alternatives?|strategies?)/i,
  /(?:there\s+are|we\s+have)\s+(?:\d+|multiple|several|two|three)\s+(?:options?|approaches?)/i
];

/**
 * Patterns indicating a selection with rationale.
 * @type {RegExp[]}
 */
const SELECTED_WITH_RATIONALE_PATTERNS = [
  /(?:recommended?|selected?|chosen?|preferred?)\s+(?:approach|option|strategy)\s*:/i,
  /(?:we|I)\s+recommend/i,
  /(?:the\s+)?best\s+(?:approach|option)\s+is/i,
  /(?:going\s+with|selecting|choosing)\s+(?:option|approach)\s+(?:\d+|[A-C])/i,
  /rationale\s*:/i,
  /because\s+(?:it|this)\s+(?:provides?|offers?|gives?|enables?|ensures?)/i
];

/**
 * Patterns indicating pros/cons are listed.
 * @type {RegExp[]}
 */
const PROS_CONS_PATTERNS = [
  /pros?\s*(?:\/|and)\s*cons?\s*:/i,
  /(?:advantages?|benefits?)\s*:/i,
  /(?:disadvantages?|drawbacks?|trade-?offs?)\s*:/i,
  /(?:\+|\u2795)\s+/,  // Plus sign bullet
  /(?:-|\u2796)\s+/     // Minus sign bullet (in context of trade-offs)
];

/**
 * Patterns indicating options research is complete.
 * @type {RegExp[]}
 */
const RESEARCH_COMPLETE_PATTERNS = [
  /options?\s+(?:research|evaluation|analysis)\s+(?:complete|done|finished)/i,
  /(?:finished|completed)\s+(?:evaluating|researching|comparing)\s+(?:options?|approaches?)/i
];

/**
 * Extract options-research markers from LLM output.
 *
 * @param {string} llmOutput - Raw LLM output text
 * @returns {object} Extracted markers: { options_evaluated, selected_with_rationale, pros_cons_listed, options_researched }
 * Traces: FR-003, AC-003-02
 */
export function extractMarkers(llmOutput) {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) return {};

  const result = {};
  let hasSignals = false;

  if (OPTIONS_EVALUATED_PATTERNS.some(p => p.test(llmOutput))) {
    result.options_evaluated = true;
    hasSignals = true;
  }

  if (SELECTED_WITH_RATIONALE_PATTERNS.some(p => p.test(llmOutput))) {
    result.selected_with_rationale = true;
    hasSignals = true;
  }

  if (PROS_CONS_PATTERNS.some(p => p.test(llmOutput))) {
    result.pros_cons_listed = true;
    hasSignals = true;
  }

  if (RESEARCH_COMPLETE_PATTERNS.some(p => p.test(llmOutput))) {
    result.options_researched = true;
    hasSignals = true;
  }

  return hasSignals ? result : {};
}
