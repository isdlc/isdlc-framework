/**
 * Article VII: Artifact Traceability
 * =====================================
 * Check: AC references present in test files; traceability matrix artifact exists.
 *
 * BUG-0057 (FR-005, AC-005-04)
 *
 * @module src/core/validators/constitutional-checks/article-vii
 */

const AC_PATTERN = /AC-\d{3}-\d{2}/;
const TEST_FILE_PATTERNS = /\.(test|spec)\.(js|ts|cjs|mjs|jsx|tsx)$|_test\.(go|py)$|Test\.java$|tests?\//;
const TRACEABILITY_NAMES = /traceability[_-]?matrix|test-strategy/i;

/**
 * Check Article VII compliance: AC references in tests and traceability matrix exists.
 *
 * @param {{ name: string, content: string }[]} artifactContents
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents) {
  if (!artifactContents || artifactContents.length === 0) {
    return { compliant: true, violations: [] };
  }

  const violations = [];

  // Check 1: AC references in test files
  const testFiles = artifactContents.filter(a => TEST_FILE_PATTERNS.test(a.name));
  if (testFiles.length > 0) {
    const hasAcRefs = testFiles.some(tf => AC_PATTERN.test(tf.content));
    if (!hasAcRefs) {
      violations.push('No AC reference (AC-NNN-NN) found in test files. Article VII requires artifact traceability.');
    }
  }

  // Check 2: Traceability matrix artifact exists
  const hasMatrix = artifactContents.some(a => TRACEABILITY_NAMES.test(a.name));
  if (!hasMatrix) {
    violations.push('No traceability matrix artifact found. Article VII requires traceability documentation.');
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}
