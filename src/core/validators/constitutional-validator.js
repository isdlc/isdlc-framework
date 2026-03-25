/**
 * Constitutional Compliance Validator (Validator 5)
 * ===================================================
 * Orchestrates per-article constitutional checks for a phase's required articles.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-005)
 * AC-005-01 through AC-005-09
 *
 * @module src/core/validators/constitutional-validator
 */

// Article check modules — imported lazily via dynamic import for extensibility
const ARTICLE_CHECKS = {
  'II': () => import('./constitutional-checks/article-ii.js'),
  'III': () => import('./constitutional-checks/article-iii.js'),
  'V': () => import('./constitutional-checks/article-v.js'),
  'VII': () => import('./constitutional-checks/article-vii.js'),
  'VIII': () => import('./constitutional-checks/article-viii.js'),
  'IX': () => import('./constitutional-checks/article-ix.js'),
  'X': () => import('./constitutional-checks/article-x.js')
};

/**
 * Validate constitutional compliance for a set of articles.
 *
 * @param {string|null} constitutionContent - Constitution document content
 * @param {string[]|null} articleIds - Article IDs to check (e.g., ['II', 'III', 'V'])
 * @param {{ name: string, content: string }[]|null} artifactContents - Phase artifacts
 * @param {{ useAgentTeams?: boolean, maxFileLines?: number, priorPhaseGates?: object[], previousAgentCount?: number, currentAgentCount?: number, previousSkillCount?: number, currentSkillCount?: number }} [options={}]
 * @returns {Promise<{ pass: boolean, failure_reason: string|null, missing_artifacts: string[], details: object }>}
 */
export async function validateConstitutionalCompliance(constitutionContent, articleIds, artifactContents, options = {}) {
  const missing_artifacts = [];
  if (constitutionContent == null) missing_artifacts.push('constitution');
  if (artifactContents == null) missing_artifacts.push('artifactContents');

  if (missing_artifacts.length > 0 || !articleIds || articleIds.length === 0) {
    return {
      pass: true,
      failure_reason: null,
      missing_artifacts,
      details: {
        articles_checked: [],
        articles_compliant: [],
        articles_violated: [],
        violations: []
      }
    };
  }

  const articles_checked = [];
  const articles_compliant = [];
  const articles_violated = [];
  const violations = [];

  // Run all article checks in parallel via Promise.all
  const checkPromises = articleIds.map(async (articleId) => {
    const loader = ARTICLE_CHECKS[articleId];
    if (!loader) {
      // Unknown article — skip silently
      return { articleId, skipped: true };
    }

    try {
      const mod = await loader();
      const result = mod.check(artifactContents || [], options);
      return { articleId, result, skipped: false };
    } catch (err) {
      // Article check crashed — fail-open
      return {
        articleId,
        result: { compliant: true, violations: [`Check error: ${err.message}`] },
        skipped: false
      };
    }
  });

  const results = await Promise.all(checkPromises);

  for (const { articleId, result, skipped } of results) {
    if (skipped) continue;

    articles_checked.push(articleId);

    if (result.compliant) {
      articles_compliant.push(articleId);
    } else {
      articles_violated.push(articleId);
      for (const violation of result.violations) {
        violations.push({ article: articleId, description: violation });
      }
    }
  }

  return {
    pass: articles_violated.length === 0,
    failure_reason: articles_violated.length > 0
      ? `${articles_violated.length} constitutional article(s) violated: ${articles_violated.join(', ')}`
      : null,
    missing_artifacts: [],
    details: {
      articles_checked,
      articles_compliant,
      articles_violated,
      violations
    }
  };
}
