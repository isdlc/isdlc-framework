/**
 * Agent Content Classification — classifies 47 agent markdown files
 *
 * Most agents follow a standard 7-section template. Special agents
 * (roundtable-analyst, bug-gather-analyst, persona files) have custom entries.
 * All data is frozen (pure data, no runtime logic).
 *
 * Requirements: REQ-0099 FR-002 (AC-002-01..08), FR-003 (AC-003-01..03)
 * @module src/core/content/agent-classification
 */

import { createSectionEntry } from './content-model.js';

// ---------------------------------------------------------------------------
// Standard template: most agents follow this 7-section pattern
// ---------------------------------------------------------------------------

const STANDARD_SECTIONS = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),         // AC-002-01
  createSectionEntry('role_description', 'role_spec', 'full'),    // AC-002-02
  createSectionEntry('phase_overview', 'role_spec', 'full'),      // AC-002-03
  createSectionEntry('constitutional_principles', 'role_spec', 'full'), // AC-002-06
  createSectionEntry('tool_usage', 'runtime_packaging', 'none'),  // AC-002-04
  createSectionEntry('iteration_protocol', 'mixed', 'partial'),   // AC-002-07
  createSectionEntry('suggested_prompts', 'runtime_packaging', 'none') // AC-002-08
]);

// ---------------------------------------------------------------------------
// Special agent section definitions
// ---------------------------------------------------------------------------

const ROUNDTABLE_ANALYST_SECTIONS = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),
  createSectionEntry('role_description', 'role_spec', 'full'),
  createSectionEntry('roundtable_protocol', 'mixed', 'partial'),
  createSectionEntry('persona_management', 'role_spec', 'full'),
  createSectionEntry('topic_orchestration', 'role_spec', 'full'),
  createSectionEntry('tool_usage', 'runtime_packaging', 'none'),
  createSectionEntry('artifact_generation', 'mixed', 'partial'),
  createSectionEntry('suggested_prompts', 'runtime_packaging', 'none')
]);

const BUG_GATHER_ANALYST_SECTIONS = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),
  createSectionEntry('role_description', 'role_spec', 'full'),
  createSectionEntry('gather_protocol', 'mixed', 'partial'),
  createSectionEntry('symptom_collection', 'role_spec', 'full'),
  createSectionEntry('tool_usage', 'runtime_packaging', 'none'),
  createSectionEntry('suggested_prompts', 'runtime_packaging', 'none')
]);

const PERSONA_SECTIONS = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),
  createSectionEntry('role_description', 'role_spec', 'full'),
  createSectionEntry('domain_expertise', 'role_spec', 'full'),
  createSectionEntry('review_criteria', 'role_spec', 'full'),
  createSectionEntry('interaction_style', 'role_spec', 'full')
]);

const CRITIC_REFINER_SECTIONS = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),
  createSectionEntry('role_description', 'role_spec', 'full'),
  createSectionEntry('review_criteria', 'role_spec', 'full'),
  createSectionEntry('tool_usage', 'runtime_packaging', 'none'),
  createSectionEntry('iteration_protocol', 'mixed', 'partial')
]);

const SUB_AGENT_SECTIONS = Object.freeze([
  createSectionEntry('frontmatter', 'role_spec', 'full'),
  createSectionEntry('role_description', 'role_spec', 'full'),
  createSectionEntry('analysis_protocol', 'role_spec', 'full'),
  createSectionEntry('tool_usage', 'runtime_packaging', 'none')
]);

// ---------------------------------------------------------------------------
// Agent list: all 47 agents mapped to their section classifications
// ---------------------------------------------------------------------------

const STANDARD_AGENTS = [
  '00-sdlc-orchestrator',
  '01-requirements-analyst',
  '02-solution-architect',
  '03-system-designer',
  '04-test-design-engineer',
  '05-software-developer',
  '06-integration-tester',
  '07-qa-engineer',
  '08-security-compliance-auditor',
  '09-cicd-engineer',
  '10-environment-builder',
  '11-deployment-engineer-staging',
  '12-release-manager',
  '13-site-reliability-engineer',
  '16-quality-loop-engineer',
  'upgrade-engineer',
  'quick-scan-agent',
  'skill-manager'
];

const PERSONA_AGENTS = [
  'persona-business-analyst',
  'persona-solutions-architect',
  'persona-system-designer',
  'persona-devops-reviewer',
  'persona-domain-expert',
  'persona-qa-tester',
  'persona-security-reviewer',
  'persona-ux-reviewer'
];

const CRITIC_REFINER_AGENTS = [
  'requirements-critic',
  'requirements-refiner',
  'architecture-critic',
  'architecture-refiner',
  'design-critic',
  'design-refiner',
  'test-strategy-critic',
  'test-strategy-refiner',
  'implementation-reviewer',
  'implementation-updater'
];

const SUB_AGENTS = [
  'impact-analysis-orchestrator',
  'impact-analyzer',
  'entry-point-finder',
  'risk-assessor',
  'cross-validation-verifier',
  'tracing-orchestrator',
  'symptom-analyzer',
  'execution-path-tracer',
  'root-cause-identifier'
];

// Build the map
const entries = [];

for (const name of STANDARD_AGENTS) {
  entries.push([name, STANDARD_SECTIONS]);
}
entries.push(['roundtable-analyst', ROUNDTABLE_ANALYST_SECTIONS]);
entries.push(['bug-gather-analyst', BUG_GATHER_ANALYST_SECTIONS]);
for (const name of PERSONA_AGENTS) {
  entries.push([name, PERSONA_SECTIONS]);
}
for (const name of CRITIC_REFINER_AGENTS) {
  entries.push([name, CRITIC_REFINER_SECTIONS]);
}
for (const name of SUB_AGENTS) {
  entries.push([name, SUB_AGENT_SECTIONS]);
}

const _map = new Map(entries);

/** @type {ReadonlyMap<string, ReadonlyArray>} Frozen map of agent classifications */
export const agentClassifications = Object.freeze({
  get size() { return _map.size; },
  get(key) { return _map.get(key); },
  has(key) { return _map.has(key); },
  keys() { return _map.keys(); },
  values() { return _map.values(); },
  entries() { return _map.entries(); },
  forEach(cb) { _map.forEach(cb); },
  set() { throw new TypeError('Cannot modify frozen classification map'); },
  delete() { throw new TypeError('Cannot modify frozen classification map'); },
  clear() { throw new TypeError('Cannot modify frozen classification map'); }
});

/**
 * Get the section classification for a named agent.
 *
 * @param {string} name - Agent name (e.g. '05-software-developer')
 * @returns {ReadonlyArray<{name: string, type: string, portability: string}>}
 * @throws {Error} If agent name is not classified
 */
export function getAgentClassification(name) {
  const sections = _map.get(name);
  if (!sections) {
    throw new Error(`Unknown agent: "${name}". Use listClassifiedAgents() for valid names.`);
  }
  return sections;
}

/**
 * List all 47 classified agent names.
 *
 * @returns {string[]}
 */
export function listClassifiedAgents() {
  return [..._map.keys()];
}

/**
 * Get a portability percentage breakdown across all agents.
 *
 * @returns {{full: number, partial: number, none: number}} Rounded percentages
 */
export function getAgentPortabilitySummary() {
  let totalSections = 0;
  let fullCount = 0;
  let partialCount = 0;
  let noneCount = 0;

  for (const sections of _map.values()) {
    for (const section of sections) {
      totalSections++;
      if (section.portability === 'full') fullCount++;
      else if (section.portability === 'partial') partialCount++;
      else noneCount++;
    }
  }

  return {
    full: Math.round((fullCount / totalSections) * 100),
    partial: Math.round((partialCount / totalSections) * 100),
    none: Math.round((noneCount / totalSections) * 100)
  };
}
