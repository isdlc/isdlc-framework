/**
 * Article X: Fail-Safe Defaults
 * ================================
 * Check: Error handling patterns present in new code.
 *
 * BUG-0057 (FR-005, AC-005-07)
 *
 * @module src/core/validators/constitutional-checks/article-x
 */

const ERROR_HANDLING_PATTERNS = /\btry\s*\{|\bcatch\s*\(|\.catch\s*\(|\|\|\s*(?:default|null|undefined|''|""|\[\]|\{\})|\?\?/;
const CODE_FILE_PATTERNS = /\.(js|ts|cjs|mjs|jsx|tsx|py|go|rs|java)$/;
const TEST_FILE_PATTERNS = /\.(test|spec)\.(js|ts|cjs|mjs|jsx|tsx)$|_test\.(go|py)$|Test\.java$|tests?\//;

/**
 * Check Article X compliance: error handling patterns in production code.
 *
 * @param {{ name: string, content: string }[]} artifactContents
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents) {
  if (!artifactContents || artifactContents.length === 0) {
    return { compliant: true, violations: [] };
  }

  // Only check code files (not docs, configs, etc.)
  const codeFiles = artifactContents.filter(
    a => CODE_FILE_PATTERNS.test(a.name) && !TEST_FILE_PATTERNS.test(a.name)
  );

  if (codeFiles.length === 0) {
    return { compliant: true, violations: [] };
  }

  const hasErrorHandling = codeFiles.some(f => ERROR_HANDLING_PATTERNS.test(f.content));

  if (!hasErrorHandling) {
    return {
      compliant: false,
      violations: ['No error handling patterns (try/catch, .catch(), nullish coalescing) found in new production code. Article X requires fail-safe defaults.']
    };
  }

  return { compliant: true, violations: [] };
}
