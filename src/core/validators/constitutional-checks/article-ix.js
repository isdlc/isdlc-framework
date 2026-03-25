/**
 * Article IX: Quality Gate Integrity
 * =====================================
 * Check: All prior phase gates show completed status.
 *
 * BUG-0057 (FR-005, AC-005-06)
 *
 * @module src/core/validators/constitutional-checks/article-ix
 */

/**
 * Check Article IX compliance: all prior phase gates completed.
 *
 * @param {{ name: string, content: string }[]} artifactContents - Not used for this check
 * @param {{ priorPhaseGates?: { phase: string, status: string }[] }} [options={}]
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents, options = {}) {
  const { priorPhaseGates = [] } = options;

  if (!priorPhaseGates || priorPhaseGates.length === 0) {
    return { compliant: true, violations: [] };
  }

  const violations = [];

  for (const gate of priorPhaseGates) {
    if (gate.status !== 'completed') {
      violations.push(`Prior phase '${gate.phase}' gate not completed (status: ${gate.status}). Article IX requires all prior gates pass.`);
    }
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}
