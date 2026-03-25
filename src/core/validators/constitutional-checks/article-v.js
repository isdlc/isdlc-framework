/**
 * Article V: Simplicity First
 * ==============================
 * Check: No file exceeds configurable line limit (default 500).
 *
 * BUG-0057 (FR-005, AC-005-03)
 *
 * @module src/core/validators/constitutional-checks/article-v
 */

const DEFAULT_MAX_LINES = 500;

/**
 * Check Article V compliance: no file exceeds line limit.
 *
 * @param {{ name: string, content: string }[]} artifactContents
 * @param {{ maxFileLines?: number }} [options={}]
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents, options = {}) {
  if (!artifactContents || artifactContents.length === 0) {
    return { compliant: true, violations: [] };
  }

  const maxLines = options.maxFileLines || DEFAULT_MAX_LINES;
  const violations = [];

  for (const file of artifactContents) {
    const lineCount = file.content.split('\n').length;
    if (lineCount > maxLines) {
      violations.push(`${file.name} has ${lineCount} lines (max: ${maxLines})`);
    }
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}
