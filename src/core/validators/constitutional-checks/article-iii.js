/**
 * Article III: Security by Design
 * =================================
 * Check: No secret patterns in non-test code.
 *
 * BUG-0057 (FR-005, AC-005-02)
 *
 * @module src/core/validators/constitutional-checks/article-iii
 */

const SECRET_PATTERNS = /\b(API[_-]?KEY|PASSWORD|SECRET|TOKEN)\s*[=:]\s*["'][^"']{4,}/gi;
const TEST_FILE_PATTERNS = /\.(test|spec)\.(js|ts|cjs|mjs|jsx|tsx)$|_test\.(go|py)$|Test\.java$|tests?\//;

/**
 * Check Article III compliance: no secret patterns in production code.
 *
 * @param {{ name: string, content: string }[]} artifactContents
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents) {
  if (!artifactContents || artifactContents.length === 0) {
    return { compliant: true, violations: [] };
  }

  const violations = [];
  const productionFiles = artifactContents.filter(a => !TEST_FILE_PATTERNS.test(a.name));

  for (const file of productionFiles) {
    let match;
    SECRET_PATTERNS.lastIndex = 0;
    while ((match = SECRET_PATTERNS.exec(file.content)) !== null) {
      violations.push(`Secret pattern '${match[1]}' found in ${file.name}`);
    }
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}
