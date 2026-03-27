/**
 * Contract Evaluator (Legacy — Refactored)
 * ==========================================
 * REQ-0141: Execution Contract System (FR-003, FR-009)
 * REQ-GH-213: Inline Contract Enforcement (FR-005)
 *
 * REFACTORED: The batch evaluateContract() and formatViolationBanner() have
 * been removed per REQ-GH-213 FR-005 (AC-005-02). Inline enforcement via
 * contract-checks.js replaces the post-phase batch evaluation pattern.
 *
 * This module retains the getByPath() helper for backward compatibility
 * and re-exports inline check functions for consumers that imported from
 * this module path.
 *
 * @module src/core/validators/contract-evaluator
 */

// Re-export inline check functions from the new module
// Consumers can migrate to importing directly from contract-checks.js
export {
  ContractViolationError,
  checkDomainTransition,
  checkBatchWrite,
  checkPersonaFormat,
  checkPersonaContribution,
  checkDelegation,
  checkArtifacts,
  checkTaskList
} from './contract-checks.js';

// ---------------------------------------------------------------------------
// Retained helper — used by other modules
// ---------------------------------------------------------------------------

/**
 * Traverse a state object using dot-notation path.
 * @param {Object} obj - State object
 * @param {string} path - Dot-notation path (e.g., "phases.06-implementation.status")
 * @returns {{ found: boolean, value: * }}
 */
export function getByPath(obj, path) {
  if (!obj || typeof obj !== 'object' || !path || typeof path !== 'string') {
    return { found: false, value: undefined };
  }
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    if (!(part in current)) {
      return { found: false, value: undefined };
    }
    current = current[part];
  }
  return { found: true, value: current };
}

// ---------------------------------------------------------------------------
// Deprecated stubs — removed per REQ-GH-213 FR-005
// ---------------------------------------------------------------------------

/**
 * @deprecated Removed per REQ-GH-213 FR-005 (AC-005-02).
 * Use inline check functions from contract-checks.js instead.
 * This stub returns an empty result for backward compatibility.
 */
export function evaluateContract(_params) {
  return {
    violations: [],
    warnings: ['evaluateContract() is deprecated — use inline check functions from contract-checks.js'],
    stale_contract: false
  };
}

/**
 * @deprecated Removed per REQ-GH-213 FR-005.
 * ContractViolationError.message provides the same information.
 */
export function formatViolationBanner(violation) {
  return `CONTRACT VIOLATION [deprecated]: ${violation?.expected || 'unknown'} -> ${violation?.actual || 'unknown'}`;
}
