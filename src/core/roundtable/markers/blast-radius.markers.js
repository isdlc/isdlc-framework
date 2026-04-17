/**
 * blast-radius.markers.js — Marker extractor for BLAST_RADIUS sub-task.
 *
 * Detects: direct changes listed, transitive impact assessed, risk areas named.
 * Uses regex + key-phrase detection only (no LLM calls, no network).
 *
 * @module blast-radius-markers
 * Traces: FR-003, AC-003-02
 */

/**
 * Patterns indicating direct changes are listed.
 * @type {RegExp[]}
 */
const DIRECT_CHANGES_PATTERNS = [
  /direct\s+changes?\s*:/i,
  /(?:files?|modules?)\s+(?:to\s+)?(?:change|modify|update|create)\s*:/i,
  /(?:will\s+)?(?:directly\s+)?(?:change|modify|update|touch)\s+(?:the\s+following|these)/i,
  /changes?\s+required\s*:/i,
  /primary\s+(?:changes?|modifications?)\s*:/i
];

/**
 * Patterns indicating transitive impact is assessed.
 * @type {RegExp[]}
 */
const TRANSITIVE_IMPACT_PATTERNS = [
  /transitive\s+(?:impact|effects?|changes?)/i,
  /(?:downstream|indirect|secondary|cascading)\s+(?:impact|effects?|changes?)/i,
  /(?:ripple|knock-on)\s+effects?/i,
  /(?:also|additionally)\s+(?:affect|impact|touch)/i,
  /depend(?:ent|s|encies)\s+(?:that\s+)?(?:will|may|could)\s+(?:be\s+)?affected/i
];

/**
 * Patterns indicating risk areas are named.
 * @type {RegExp[]}
 */
const RISK_AREAS_PATTERNS = [
  /risk\s+areas?\s*:/i,
  /(?:high|medium|low)\s+risk/i,
  /(?:potential\s+)?(?:risks?|concerns?|dangers?)\s*:/i,
  /(?:could|might|may)\s+(?:break|fail|regress)/i,
  /regression\s+(?:risk|concern|area)/i,
  /blast\s+radius\s+(?:assessment|analysis|is|includes?|covers?)/i
];

/**
 * Patterns indicating blast radius assessment is complete.
 * @type {RegExp[]}
 */
const ASSESSMENT_COMPLETE_PATTERNS = [
  /blast\s+radius\s+(?:assessment|analysis)\s+(?:complete|done|finished)/i,
  /(?:impact|blast\s+radius)\s+(?:has\s+been\s+)?assessed/i,
  /(?:completed?|finished)\s+(?:the\s+)?(?:blast\s+radius|impact)\s+(?:assessment|analysis)/i
];

/**
 * Extract blast-radius markers from LLM output.
 *
 * @param {string} llmOutput - Raw LLM output text
 * @returns {object} Extracted markers: { direct_changes_listed, transitive_impact_assessed, risk_areas_named, blast_radius_assessed }
 * Traces: FR-003, AC-003-02
 */
export function extractMarkers(llmOutput) {
  if (typeof llmOutput !== 'string' || llmOutput.length === 0) return {};

  const result = {};
  let hasSignals = false;

  if (DIRECT_CHANGES_PATTERNS.some(p => p.test(llmOutput))) {
    result.direct_changes_listed = true;
    hasSignals = true;
  }

  if (TRANSITIVE_IMPACT_PATTERNS.some(p => p.test(llmOutput))) {
    result.transitive_impact_assessed = true;
    hasSignals = true;
  }

  if (RISK_AREAS_PATTERNS.some(p => p.test(llmOutput))) {
    result.risk_areas_named = true;
    hasSignals = true;
  }

  if (ASSESSMENT_COMPLETE_PATTERNS.some(p => p.test(llmOutput))) {
    result.blast_radius_assessed = true;
    hasSignals = true;
  }

  return hasSignals ? result : {};
}
