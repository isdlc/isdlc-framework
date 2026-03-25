/**
 * Article II: Test-First Development
 * ====================================
 * Check: At least one test file in artifacts with test count > 0.
 *
 * BUG-0057 (FR-005, AC-005-01)
 *
 * @module src/core/validators/constitutional-checks/article-ii
 */

const TEST_FILE_PATTERNS = /\.(test|spec)\.(js|ts|cjs|mjs|jsx|tsx)$|_test\.(go|py)$|Test\.java$/;
const TEST_CASE_PATTERNS = /\b(?:it|test|describe)\s*\(|def\s+test_|func\s+Test|@Test/g;

/**
 * Check Article II compliance: test file exists with actual tests.
 *
 * @param {{ name: string, content: string }[]} artifactContents
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents) {
  if (!artifactContents || artifactContents.length === 0) {
    return { compliant: true, violations: [] };
  }

  const testFiles = artifactContents.filter(a => TEST_FILE_PATTERNS.test(a.name));

  if (testFiles.length === 0) {
    return {
      compliant: false,
      violations: ['No test file found in artifacts. Article II requires test-first development.']
    };
  }

  // Check that at least one test file has actual test cases
  let totalTests = 0;
  for (const tf of testFiles) {
    const matches = tf.content.match(TEST_CASE_PATTERNS);
    if (matches) totalTests += matches.length;
  }

  if (totalTests === 0) {
    return {
      compliant: false,
      violations: [`Test file(s) found but 0 test cases detected. Article II requires actual test implementations.`]
    };
  }

  return { compliant: true, violations: [] };
}
