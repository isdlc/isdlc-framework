/**
 * Test Execution Validator (Validator 3)
 * ========================================
 * Validates that all planned test cases were executed in the test run.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-003)
 * AC-003-01 through AC-003-04
 *
 * Pure function: content-in, structured-result-out, no filesystem access.
 *
 * @module src/core/validators/test-execution-validator
 */

import { extractTestCaseIds } from './lib/test-id-parser.js';

/**
 * Patterns to detect executed tests in various output formats.
 * Each captures the test ID from the output line.
 */
const PASS_PATTERNS = [
  // node:test: "  ✓ TEST-ID: description (Xms)"
  /[✓✔]\s+([A-Z]+-(?:[A-Z]+-)*\d+)/g,
  // Jest: "  ✓ TEST-ID: description (Xms)" or "PASS ... ✓ TEST-ID"
  /PASS[^\n]*\n[^]*?[✓✔]\s+([A-Z]+-(?:[A-Z]+-)*\d+)/g,
  // TAP: "ok N TEST-ID: description"
  /^ok\s+\d+\s+([A-Z]+-(?:[A-Z]+-)*\d+)/gm,
  // Generic: any line with checkmark-like + test ID
  /pass(?:ed)?\s+([A-Z]+-(?:[A-Z]+-)*\d+)/gi
];

const FAIL_PATTERNS = [
  // node:test failure: "  ✗ TEST-ID: description"
  /[✗✖]\s+([A-Z]+-(?:[A-Z]+-)*\d+)/g,
  // TAP: "not ok N TEST-ID: description"
  /^not ok\s+\d+\s+([A-Z]+-(?:[A-Z]+-)*\d+)/gm,
  // Generic: fail + test ID
  /fail(?:ed)?\s+([A-Z]+-(?:[A-Z]+-)*\d+)/gi
];

/**
 * Extract test IDs matching known patterns from output.
 *
 * @param {RegExp[]} patterns - Array of regex patterns
 * @param {string} output - Test runner output
 * @returns {Set<string>} Matched test IDs
 */
function extractIdsFromOutput(patterns, output) {
  const ids = new Set();
  for (const pattern of patterns) {
    // Reset lastIndex for each pattern (they have /g flag)
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(output)) !== null) {
      ids.add(match[1]);
    }
  }
  return ids;
}

/**
 * Validate that all planned test cases were executed.
 *
 * @param {string|null} testStrategyContent - test-strategy.md content
 * @param {string|null} testExecutionOutput - test runner output
 * @returns {{ pass: boolean, failure_reason: string|null, missing_artifacts: string[], details: object }}
 */
export function validateTestExecution(testStrategyContent, testExecutionOutput) {
  const missing_artifacts = [];
  if (testStrategyContent == null) missing_artifacts.push('testStrategy');
  if (testExecutionOutput == null) missing_artifacts.push('testExecutionOutput');

  if (missing_artifacts.length > 0) {
    return {
      pass: true,
      failure_reason: null,
      missing_artifacts,
      details: {
        total_planned: 0,
        executed: 0,
        unexecuted_tests: [],
        executed_tests: [],
        failed_tests: []
      }
    };
  }

  const plannedIds = extractTestCaseIds(testStrategyContent);
  const executedIds = extractIdsFromOutput(PASS_PATTERNS, testExecutionOutput);
  const failedIds = extractIdsFromOutput(FAIL_PATTERNS, testExecutionOutput);

  // Executed = passed set
  const executed_tests = plannedIds.filter(id => executedIds.has(id));
  // Failed = planned IDs that appear in fail patterns
  const failed_tests = plannedIds.filter(id => failedIds.has(id));
  // Unexecuted = planned minus (executed union failed)
  const allSeen = new Set([...executedIds, ...failedIds]);
  const unexecuted_tests = plannedIds.filter(id => !allSeen.has(id));

  const pass = unexecuted_tests.length === 0 && failed_tests.length === 0;

  const reasons = [];
  if (unexecuted_tests.length > 0) reasons.push(`${unexecuted_tests.length} planned test(s) not executed`);
  if (failed_tests.length > 0) reasons.push(`${failed_tests.length} test(s) failed`);

  return {
    pass,
    failure_reason: reasons.length > 0 ? reasons.join('; ') : null,
    missing_artifacts: [],
    details: {
      total_planned: plannedIds.length,
      executed: executed_tests.length,
      unexecuted_tests,
      executed_tests,
      failed_tests
    }
  };
}
