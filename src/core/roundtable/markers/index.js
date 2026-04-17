/**
 * markers/index.js — Dispatcher for per-sub-task marker extractors.
 *
 * Dynamically loads all .markers.js files in this directory and routes
 * dispatch calls to the correct extractor by sub-task ID.
 * Fail-open: unknown sub-task ID returns empty object (Article X).
 *
 * @module markers-index
 * Traces: FR-003, AC-003-02
 */

import { extractMarkers as extractScopeFraming } from './scope-framing.markers.js';
import { extractMarkers as extractCodebaseScan } from './codebase-scan.markers.js';
import { extractMarkers as extractBlastRadius } from './blast-radius.markers.js';
import { extractMarkers as extractOptionsResearch } from './options-research.markers.js';
import { extractMarkers as extractDependencyCheck } from './dependency-check.markers.js';
import { extractMarkers as extractTracing } from './tracing.markers.js';

/**
 * Map from sub-task ID to its extractor function.
 * Keys match the sub-task IDs in analyze.json and bug-gather.json.
 * @type {Map<string, function>}
 */
const EXTRACTOR_MAP = new Map([
  ['SCOPE_FRAMING', extractScopeFraming],
  ['CODEBASE_SCAN', extractCodebaseScan],
  ['BLAST_RADIUS', extractBlastRadius],
  ['OPTIONS_RESEARCH', extractOptionsResearch],
  ['DEPENDENCY_CHECK', extractDependencyCheck],
  ['TRACING', extractTracing],
  // Also support lowercase variants
  ['scope_framing', extractScopeFraming],
  ['codebase_scan', extractCodebaseScan],
  ['blast_radius', extractBlastRadius],
  ['options_research', extractOptionsResearch],
  ['dependency_check', extractDependencyCheck],
  ['tracing', extractTracing]
]);

/**
 * Dispatch marker extraction to the correct extractor for a given sub-task ID.
 *
 * Fail-open: returns empty object for unknown sub-task IDs (Article X).
 * Synchronous, no LLM calls, no network.
 *
 * @param {string} subTaskId - The sub-task ID (e.g., 'SCOPE_FRAMING', 'CODEBASE_SCAN')
 * @param {string} llmOutput - Raw LLM output text to extract markers from
 * @returns {object} Extracted markers from the appropriate extractor, or empty object
 * Traces: FR-003, AC-003-02
 */
export function dispatch(subTaskId, llmOutput) {
  if (typeof subTaskId !== 'string' || typeof llmOutput !== 'string') return {};

  const extractor = EXTRACTOR_MAP.get(subTaskId);
  if (!extractor) return {};

  try {
    return extractor(llmOutput);
  } catch (_err) {
    // Fail-open: any unexpected error returns empty object (Article X)
    return {};
  }
}

/**
 * List all registered sub-task IDs (uppercase canonical forms only).
 *
 * @returns {string[]} Array of canonical sub-task IDs
 */
export function listExtractors() {
  return [...EXTRACTOR_MAP.keys()].filter(k => k === k.toUpperCase());
}
