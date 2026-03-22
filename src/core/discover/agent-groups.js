/**
 * Discover Agent Group Definitions — 7 frozen group configs
 *
 * Each group specifies: id, members (agent IDs), parallelism, required_for_modes.
 * Deep groups also have depth_level.
 * Pure data — no runtime logic.
 *
 * Requirements: REQ-0103 FR-002 (AC-002-01..04), FR-003 (AC-003-01..03)
 * @module src/core/discover/agent-groups
 */

/** D1, D2, D5, D6 — core analyzers run in parallel */
export const CORE_ANALYZERS = Object.freeze({
  id: 'core_analyzers',
  members: Object.freeze([
    'architecture-analyzer', 'test-evaluator', 'data-model-analyzer', 'feature-mapper'
  ]),
  parallelism: 'parallel',
  required_for_modes: Object.freeze([
    'discover_existing', 'discover_incremental', 'discover_deep'
  ])
});

/** Post-analysis: characterization tests, artifact integration, ATDD bridge */
export const POST_ANALYSIS = Object.freeze({
  id: 'post_analysis',
  members: Object.freeze([
    'characterization-test-generator', 'artifact-integration', 'atdd-bridge'
  ]),
  parallelism: 'sequential',
  required_for_modes: Object.freeze(['discover_existing', 'discover_deep'])
});

/** D3, D4 — constitution and skills generation */
export const CONSTITUTION_SKILLS = Object.freeze({
  id: 'constitution_skills',
  members: Object.freeze(['constitution-generator', 'skills-researcher']),
  parallelism: 'sequential',
  required_for_modes: Object.freeze([
    'discover_existing', 'discover_new', 'discover_deep'
  ])
});

/** D7, D8 — new project core analysis */
export const NEW_PROJECT_CORE = Object.freeze({
  id: 'new_project_core',
  members: Object.freeze(['product-analyst', 'architecture-designer']),
  parallelism: 'sequential',
  required_for_modes: Object.freeze(['discover_new'])
});

/** D9-D15 — new project party (parallel domain experts) */
export const NEW_PROJECT_PARTY = Object.freeze({
  id: 'new_project_party',
  members: Object.freeze([
    'domain-researcher', 'technical-scout', 'solution-architect-party',
    'security-advisor', 'devops-pragmatist', 'data-model-designer', 'test-strategist'
  ]),
  parallelism: 'parallel',
  required_for_modes: Object.freeze(['discover_new'])
});

/** D16, D17 — deep standard depth (security + tech debt audit) */
export const DEEP_STANDARD = Object.freeze({
  id: 'deep_standard',
  members: Object.freeze(['security-auditor', 'technical-debt-auditor']),
  parallelism: 'parallel',
  required_for_modes: Object.freeze(['discover_deep']),
  depth_level: 'standard'
});

/** D18, D19 — deep full depth (performance + ops readiness) */
export const DEEP_FULL = Object.freeze({
  id: 'deep_full',
  members: Object.freeze(['performance-analyst', 'ops-readiness-reviewer']),
  parallelism: 'parallel',
  required_for_modes: Object.freeze(['discover_deep']),
  depth_level: 'full'
});
