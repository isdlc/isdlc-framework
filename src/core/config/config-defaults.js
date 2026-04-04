/**
 * Default values for the unified user project config (.isdlc/config.json).
 *
 * Single source of truth — imported by config-service.js and used as the
 * merge base when reading user config. Missing or partial user config is
 * filled from these defaults (fail-open, Article X).
 *
 * REQ-GH-231 FR-001, AC-001-02, AC-001-05
 * @module src/core/config/config-defaults
 */

export const DEFAULT_PROJECT_CONFIG = {
  cache: {
    budget_tokens: 100000,
    section_priorities: {
      CONSTITUTION: 100,
      WORKFLOW_CONFIG: 90,
      ITERATION_REQUIREMENTS: 85,
      ARTIFACT_PATHS: 80,
      SKILLS_MANIFEST: 75,
      SKILL_INDEX: 70,
      EXTERNAL_SKILLS: 65,
      ROUNDTABLE_CONTEXT: 60,
      DISCOVERY_CONTEXT: 50,
      INSTRUCTIONS: 40,
    },
  },
  ui: {
    show_subtasks_in_ui: true,
  },
  provider: {
    default: 'claude',
  },
  roundtable: {
    verbosity: 'bulleted',
    default_personas: [
      'persona-business-analyst',
      'persona-solutions-architect',
      'persona-system-designer',
    ],
    disabled_personas: [],
  },
  search: {},
  workflows: {
    sizing_thresholds: {
      light_max_files: 5,
      epic_min_files: 20,
    },
    performance_budgets: {},
  },
};
