/**
 * Coverage Presence Validator (Validator 4)
 * ============================================
 * Validates that coverage data is present in test output.
 * Surfaces absence instead of silently passing.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-004)
 * AC-004-01 through AC-004-04
 *
 * Pure function: content-in, structured-result-out, no filesystem access.
 *
 * @module src/core/validators/coverage-presence-validator
 */

import { parseCoverage } from './lib/coverage-patterns.js';

/**
 * Validate that coverage data is present in test execution output.
 *
 * @param {string|null} testExecutionOutput - Test runner output
 * @param {{ required?: boolean, threshold?: number|null }} [options={}]
 * @returns {{ pass: boolean, failure_reason: string|null, missing_artifacts: string[], details: object }}
 */
export function validateCoveragePresence(testExecutionOutput, options = {}) {
  if (testExecutionOutput == null) {
    return {
      pass: true,
      failure_reason: null,
      missing_artifacts: ['testExecutionOutput'],
      details: {
        coverage_found: false,
        coverage_percent: null,
        threshold: options.threshold || null,
        source_pattern: null
      }
    };
  }

  const { required = true, threshold = null } = options;
  const coverage = parseCoverage(testExecutionOutput);

  if (!coverage.found) {
    return {
      pass: !required,
      failure_reason: required ? 'no_coverage_data' : null,
      missing_artifacts: [],
      details: {
        coverage_found: false,
        coverage_percent: null,
        threshold,
        source_pattern: null
      }
    };
  }

  // Coverage found — check threshold
  if (threshold != null && coverage.percentage < threshold) {
    return {
      pass: false,
      failure_reason: `Coverage ${coverage.percentage}% below threshold ${threshold}%`,
      missing_artifacts: [],
      details: {
        coverage_found: true,
        coverage_percent: coverage.percentage,
        threshold,
        source_pattern: coverage.source_pattern
      }
    };
  }

  return {
    pass: true,
    failure_reason: null,
    missing_artifacts: [],
    details: {
      coverage_found: true,
      coverage_percent: coverage.percentage,
      threshold,
      source_pattern: coverage.source_pattern
    }
  };
}
