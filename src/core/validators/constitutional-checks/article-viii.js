/**
 * Article VIII: Documentation Currency
 * =======================================
 * Check: If agent/skill counts changed, docs must be updated.
 *
 * BUG-0057 (FR-005, AC-005-05)
 *
 * @module src/core/validators/constitutional-checks/article-viii
 */

const DOC_FILE_PATTERNS = /CLAUDE\.md|AGENTS\.md|README\.md/i;

/**
 * Check Article VIII compliance: docs updated if counts changed.
 *
 * @param {{ name: string, content: string }[]} artifactContents
 * @param {{ previousAgentCount?: number, currentAgentCount?: number, previousSkillCount?: number, currentSkillCount?: number }} [options={}]
 * @returns {{ compliant: boolean, violations: string[] }}
 */
export function check(artifactContents, options = {}) {
  if (!artifactContents || artifactContents.length === 0) {
    return { compliant: true, violations: [] };
  }

  const {
    previousAgentCount = 0,
    currentAgentCount = 0,
    previousSkillCount = 0,
    currentSkillCount = 0
  } = options;

  // If counts haven't changed, docs update not required
  if (previousAgentCount === currentAgentCount && previousSkillCount === currentSkillCount) {
    return { compliant: true, violations: [] };
  }

  // Counts changed — check if doc files are in the artifacts
  const hasDocUpdate = artifactContents.some(a => DOC_FILE_PATTERNS.test(a.name));

  if (!hasDocUpdate) {
    const changes = [];
    if (previousAgentCount !== currentAgentCount) {
      changes.push(`agents: ${previousAgentCount} -> ${currentAgentCount}`);
    }
    if (previousSkillCount !== currentSkillCount) {
      changes.push(`skills: ${previousSkillCount} -> ${currentSkillCount}`);
    }
    return {
      compliant: false,
      violations: [`Counts changed (${changes.join(', ')}) but no documentation artifact (CLAUDE.md, AGENTS.md) was updated.`]
    };
  }

  return { compliant: true, violations: [] };
}
