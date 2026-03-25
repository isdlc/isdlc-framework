/**
 * Shared Coverage Regex Patterns
 * ================================
 * Extracted from test-watcher.cjs for shared use.
 * Single source of truth for coverage detection.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-004, AC-004-04)
 *
 * @module src/core/validators/lib/coverage-patterns
 */

/**
 * Coverage patterns for extracting coverage percentage from test runner output.
 * Each pattern has a name and a regex that captures a numeric percentage.
 */
export const COVERAGE_PATTERNS = [
  // Jest/Vitest: "Statements   : 85.71%"
  { name: 'jest-statements', pattern: /Statements\s*:\s*(\d+\.?\d*)%/ },
  // Jest/Vitest: "Lines        : 90.00%"
  { name: 'jest-lines', pattern: /Lines\s*:\s*(\d+\.?\d*)%/ },
  // pytest-cov: "TOTAL    100    15    85%"
  { name: 'pytest-cov', pattern: /TOTAL\s+\d+\s+\d+\s+(\d+)%/ },
  // Go: "coverage: 82.5% of statements"
  { name: 'go-coverage', pattern: /coverage:\s*(\d+\.?\d*)%/ },
  // Generic: "85.5% coverage" or "85.5% covered"
  { name: 'generic', pattern: /(\d+\.?\d*)%\s*(?:coverage|covered)/ }
];

/**
 * Parse coverage percentage from test output.
 * Returns the first match from COVERAGE_PATTERNS.
 *
 * @param {string} output - Test command output
 * @returns {{ found: boolean, percentage: number|null, source_pattern: string|null }}
 */
export function parseCoverage(output) {
  if (!output || typeof output !== 'string') {
    return { found: false, percentage: null, source_pattern: null };
  }

  for (const { name, pattern } of COVERAGE_PATTERNS) {
    const match = output.match(pattern);
    if (match) {
      return {
        found: true,
        percentage: parseFloat(match[1]),
        source_pattern: name
      };
    }
  }

  return { found: false, percentage: null, source_pattern: null };
}
