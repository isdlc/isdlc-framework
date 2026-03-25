/**
 * Traceability Validator (Validator 1)
 * ======================================
 * Verifies every AC in requirements-spec has a mapped test case in test-strategy.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-001)
 * AC-001-01 through AC-001-06
 *
 * Pure function: content-in, structured-result-out, no filesystem access.
 *
 * @module src/core/validators/traceability-validator
 */

import { extractAcIds, extractTestToAcMappings } from './lib/test-id-parser.js';

/**
 * Validate that every AC in requirements-spec has at least one test case in test-strategy.
 *
 * @param {string|null} requirementsSpecContent - requirements-spec.md content
 * @param {string|null} testStrategyContent - test-strategy.md content
 * @returns {{ pass: boolean, failure_reason: string|null, missing_artifacts: string[], details: object }}
 */
export function validateRequirementsToTests(requirementsSpecContent, testStrategyContent) {
  const missing_artifacts = [];
  if (requirementsSpecContent == null) missing_artifacts.push('requirementsSpec');
  if (testStrategyContent == null) missing_artifacts.push('testStrategy');

  if (missing_artifacts.length > 0) {
    return {
      pass: true,
      failure_reason: null,
      missing_artifacts,
      details: {
        total_acs: 0,
        covered_acs: 0,
        coverage_percent: 0,
        orphan_acs: [],
        mapped_test_cases: [],
        unparseable_references: []
      }
    };
  }

  const acIds = extractAcIds(requirementsSpecContent);
  const mappings = extractTestToAcMappings(testStrategyContent);

  // If no ACs found, nothing to check
  if (acIds.length === 0) {
    return {
      pass: true,
      failure_reason: null,
      missing_artifacts: [],
      details: {
        total_acs: 0,
        covered_acs: 0,
        coverage_percent: 100,
        orphan_acs: [],
        mapped_test_cases: [],
        unparseable_references: []
      }
    };
  }

  // Build AC -> test ID map
  const acToTests = new Map();
  for (const ac of acIds) {
    acToTests.set(ac, []);
  }

  // Collect unparseable references (test rows with no valid AC IDs)
  const unparseable_references = [];

  for (const mapping of mappings) {
    if (mapping.ac_ids.length === 0) {
      unparseable_references.push(mapping.test_id);
      continue;
    }
    for (const acId of mapping.ac_ids) {
      if (acToTests.has(acId)) {
        acToTests.get(acId).push(mapping.test_id);
      }
      // ACs not in requirements are silently ignored (extra tests are OK)
    }
  }

  // Compute results
  const orphan_acs = [];
  const mapped_test_cases = [];

  for (const [ac, tests] of acToTests) {
    if (tests.length === 0) {
      orphan_acs.push(ac);
    }
    mapped_test_cases.push({ ac_id: ac, test_ids: tests });
  }

  const covered_acs = acIds.length - orphan_acs.length;
  const coverage_percent = acIds.length > 0
    ? Math.round((covered_acs / acIds.length) * 100)
    : 100;

  return {
    pass: orphan_acs.length === 0,
    failure_reason: orphan_acs.length > 0 ? `${orphan_acs.length} AC(s) have no mapped test cases` : null,
    missing_artifacts: [],
    details: {
      total_acs: acIds.length,
      covered_acs,
      coverage_percent,
      orphan_acs,
      mapped_test_cases,
      unparseable_references
    }
  };
}
