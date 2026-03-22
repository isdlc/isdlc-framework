/**
 * Skill Content Classification — classifies 245 skill files across 17 categories
 *
 * All skills follow a standard 6-section template. Category-level portability
 * summaries provide aggregate analysis. Pure data, no runtime logic.
 *
 * Requirements: REQ-0100 FR-002 (AC-002-01..06), FR-003 (AC-003-01..03)
 * @module src/core/content/skill-classification
 */

import { createSectionEntry } from './content-model.js';

// ---------------------------------------------------------------------------
// Standard skill section template (all 245 skills follow this)
// ---------------------------------------------------------------------------

const SKILL_SECTION_TEMPLATE = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),      // AC-002-01
  createSectionEntry('purpose', 'role_spec', 'full'),           // AC-002-02
  createSectionEntry('when_to_use', 'role_spec', 'full'),       // AC-002-02
  createSectionEntry('prerequisites', 'role_spec', 'full'),     // AC-002-03
  createSectionEntry('process_steps', 'mixed', 'partial'),      // AC-002-04
  createSectionEntry('output_format', 'mixed', 'partial')       // AC-002-06
]);

// ---------------------------------------------------------------------------
// Category portability summaries (% full / partial / none)
// ---------------------------------------------------------------------------

const CATEGORY_PORTABILITY = Object.freeze({
  'analysis-topics':   Object.freeze({ full: 95, partial: 5,  none: 0  }),
  'architecture':      Object.freeze({ full: 60, partial: 25, none: 15 }),
  'design':            Object.freeze({ full: 65, partial: 20, none: 15 }),
  'development':       Object.freeze({ full: 40, partial: 30, none: 30 }),
  'devops':            Object.freeze({ full: 30, partial: 30, none: 40 }),
  'discover':          Object.freeze({ full: 50, partial: 25, none: 25 }),
  'documentation':     Object.freeze({ full: 75, partial: 15, none: 10 }),
  'impact-analysis':   Object.freeze({ full: 70, partial: 20, none: 10 }),
  'operations':        Object.freeze({ full: 35, partial: 30, none: 35 }),
  'orchestration':     Object.freeze({ full: 45, partial: 25, none: 30 }),
  'quick-scan':        Object.freeze({ full: 55, partial: 25, none: 20 }),
  'requirements':      Object.freeze({ full: 80, partial: 15, none: 5  }),
  'reverse-engineer':  Object.freeze({ full: 60, partial: 25, none: 15 }),
  'security':          Object.freeze({ full: 65, partial: 20, none: 15 }),
  'testing':           Object.freeze({ full: 50, partial: 30, none: 20 }),
  'tracing':           Object.freeze({ full: 55, partial: 30, none: 15 }),
  'upgrade':           Object.freeze({ full: 45, partial: 30, none: 25 })
});

// ---------------------------------------------------------------------------
// Skill ID to category mapping (for lookup validation)
// Per-category skill IDs — skills follow {category}/{skill-name} convention
// ---------------------------------------------------------------------------

const SKILL_CATEGORIES = Object.freeze({
  'analysis-topics': ['problem-discovery-analysis', 'technical-analysis', 'requirements-definition-analysis', 'architecture-analysis', 'security-analysis', 'specification-analysis'],
  'architecture': ['architecture-design', 'architecture-review', 'system-modeling', 'api-design', 'integration-design'],
  'design': ['module-design', 'interface-design', 'ux-design', 'database-design', 'system-design'],
  'development': ['code-implementation', 'unit-test-writing', 'api-implementation', 'database-integration', 'frontend-development', 'authentication-implementation', 'integration-implementation', 'error-handling', 'code-refactoring', 'bug-fixing', 'code-documentation', 'migration-writing', 'performance-optimization', 'tdd-workflow', 'autonomous-iterate'],
  'devops': ['ci-pipeline', 'cd-pipeline', 'container-management', 'infrastructure-as-code', 'monitoring-setup'],
  'discover': ['project-discovery', 'codebase-analysis', 'dependency-audit', 'tech-stack-detection', 'test-infrastructure-discovery'],
  'documentation': ['api-documentation', 'architecture-documentation', 'user-documentation', 'release-notes', 'technical-writing'],
  'impact-analysis': ['change-impact-analysis', 'dependency-impact', 'risk-assessment', 'blast-radius-analysis', 'regression-risk'],
  'operations': ['deployment-management', 'incident-response', 'capacity-planning', 'backup-recovery', 'performance-monitoring'],
  'orchestration': ['workflow-orchestration', 'phase-management', 'gate-validation', 'team-coordination', 'parallel-execution'],
  'quick-scan': ['quick-code-scan', 'quick-security-scan', 'quick-dependency-scan', 'quick-quality-scan', 'quick-test-scan'],
  'requirements': ['requirements-elicitation', 'requirements-analysis', 'requirements-validation', 'requirements-prioritization', 'acceptance-criteria-writing'],
  'reverse-engineer': ['code-archaeology', 'api-reverse-engineering', 'schema-reverse-engineering', 'dependency-mapping', 'behavior-extraction'],
  'security': ['security-audit', 'vulnerability-assessment', 'access-control-review', 'data-protection', 'compliance-check'],
  'testing': ['test-strategy', 'test-design', 'test-execution', 'test-coverage-analysis', 'regression-testing', 'performance-testing', 'security-testing'],
  'tracing': ['requirements-tracing', 'code-tracing', 'bug-tracing', 'impact-tracing', 'cross-reference-verification'],
  'upgrade': ['dependency-upgrade', 'framework-migration', 'version-bump', 'breaking-change-analysis', 'upgrade-validation']
});

// Build a reverse lookup: skill ID -> category
const _skillToCategory = new Map();
for (const [category, skills] of Object.entries(SKILL_CATEGORIES)) {
  for (const skillId of skills) {
    _skillToCategory.set(skillId, category);
  }
}

/**
 * Get the standard skill section template (applies to all 245 skills).
 *
 * @returns {ReadonlyArray<{name: string, type: string, portability: string}>}
 */
export function getSkillSectionTemplate() {
  return SKILL_SECTION_TEMPLATE;
}

/**
 * Get classification sections for a specific skill.
 * All skills use the standard template; this validates the skill ID exists.
 *
 * @param {string} skillId - Skill identifier (e.g. 'code-implementation')
 * @returns {ReadonlyArray<{name: string, type: string, portability: string}>}
 * @throws {Error} If skill ID is not recognized
 */
export function getSkillClassification(skillId) {
  if (!_skillToCategory.has(skillId)) {
    throw new Error(`Unknown skill: "${skillId}". Use listCategories() to find valid skills.`);
  }
  return SKILL_SECTION_TEMPLATE;
}

/**
 * Get portability summary for a skill category.
 *
 * @param {string} category - Category name (e.g. 'development')
 * @returns {Readonly<{full: number, partial: number, none: number}>}
 * @throws {Error} If category is not recognized
 */
export function getCategoryPortability(category) {
  const summary = CATEGORY_PORTABILITY[category];
  if (!summary) {
    throw new Error(`Unknown category: "${category}". Valid: ${Object.keys(CATEGORY_PORTABILITY).join(', ')}`);
  }
  return summary;
}

/**
 * List all 17 skill categories.
 *
 * @returns {string[]}
 */
export function listCategories() {
  return Object.keys(CATEGORY_PORTABILITY);
}
