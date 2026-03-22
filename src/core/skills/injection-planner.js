/**
 * Skill Injection Planner — provider-neutral skill injection plan computation
 *
 * Computes which skills should be injected for a given workflow/phase/agent
 * combination by reading the skills manifest (built-in) and external skills
 * manifest, then merging with precedence rules.
 *
 * Fail-open: missing manifest files produce empty arrays, never throw.
 *
 * Requirements: REQ-0126 FR-001 (AC-001-01..03), FR-002 (AC-002-01..02),
 *               FR-003 (AC-003-01..03), FR-004 (AC-004-01..02)
 * @module src/core/skills/injection-planner
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** @type {number} Content length threshold for forcing reference delivery */
const CONTENT_LENGTH_THRESHOLD = 10000;

/**
 * Safely read and parse a JSON file. Returns null on any error (fail-open).
 * @param {string} filePath
 * @returns {Object|null}
 */
function safeReadJSON(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Resolve built-in skills for an agent from the skills manifest.
 *
 * Reads the ownership section to find the agent's skill IDs, then maps
 * each skill ID using skill_lookup to determine the agent name (for
 * deriving the SKILL.md path).
 *
 * @param {Object} manifest - Parsed skills-manifest.json
 * @param {string} agent - Agent name
 * @returns {Array<Object>} Array of built-in skill entries
 */
function resolveBuiltInSkills(manifest, agent) {
  if (!manifest || !manifest.ownership || !manifest.ownership[agent]) {
    return [];
  }

  const agentOwnership = manifest.ownership[agent];
  const skillIds = agentOwnership.skills || [];
  const skillLookup = manifest.skill_lookup || {};

  return skillIds.map(skillId => {
    const ownerAgent = skillLookup[skillId] || agent;
    return {
      skillId,
      name: skillId,
      file: null, // File path resolution is the provider adapter's responsibility
      deliveryType: 'reference',
      source: 'built_in'
    };
  });
}

/**
 * Resolve external skills matching the given phase and agent.
 *
 * Filters the external manifest by:
 * 1. Phase must be in the binding's phases array
 * 2. Agent must be in the binding's agents array
 * 3. injection_mode must be 'always'
 *
 * Applies content length override rules for delivery type.
 *
 * @param {Object} externalManifest - Parsed external-skills-manifest.json
 * @param {string} phase - Phase key
 * @param {string} agent - Agent name
 * @param {Object} [contentLengthOverrides] - Optional map of skill name -> content length
 * @returns {Array<Object>} Array of external skill entries
 */
function resolveExternalSkills(externalManifest, phase, agent, contentLengthOverrides) {
  if (!externalManifest || !Array.isArray(externalManifest.skills)) {
    return [];
  }

  const overrides = contentLengthOverrides || {};

  return externalManifest.skills
    .filter(skill => {
      if (!skill.bindings) return false;
      const b = skill.bindings;
      const phaseMatch = Array.isArray(b.phases) && b.phases.includes(phase);
      const agentMatch = Array.isArray(b.agents) && b.agents.includes(agent);
      const modeMatch = b.injection_mode === 'always';
      return phaseMatch && agentMatch && modeMatch;
    })
    .map(skill => {
      let deliveryType = (skill.bindings && skill.bindings.delivery_type) || 'context';

      // FR-003 AC-003-03: Content >10000 chars forces delivery_type to reference
      const contentLength = overrides[skill.name];
      if (typeof contentLength === 'number' && contentLength > CONTENT_LENGTH_THRESHOLD) {
        deliveryType = 'reference';
      }

      return {
        skillId: skill.name,
        name: skill.name,
        file: skill.file || null,
        deliveryType,
        source: 'external'
      };
    });
}

/**
 * Compute the skill injection plan for a phase delegation.
 *
 * @param {string} workflow - Workflow type (feature, fix, upgrade, etc.)
 * @param {string} phase - Phase key (01-requirements, 06-implementation, etc.)
 * @param {string} agent - Agent name (requirements-analyst, software-developer, etc.)
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.manifestPath] - Override skills manifest path
 * @param {string} [options.externalManifestPath] - Override external manifest path
 * @param {string} [options.projectRoot] - Project root for path resolution
 * @param {Object} [options.contentLengthOverrides] - Map of skill name -> content length
 * @returns {{ builtIn: Array, external: Array, merged: Array }} Injection plan
 */
export function computeInjectionPlan(workflow, phase, agent, options = {}) {
  const {
    manifestPath,
    externalManifestPath,
    projectRoot,
    contentLengthOverrides
  } = options;

  // Resolve manifest paths
  const root = projectRoot || process.cwd();
  const mPath = manifestPath || join(root, 'src', 'claude', 'hooks', 'config', 'skills-manifest.json');
  const ePath = externalManifestPath || join(root, 'docs', 'isdlc', 'external-skills-manifest.json');

  // Read manifests (fail-open per FR-001 AC-001-03)
  const manifest = safeReadJSON(mPath);
  const externalManifest = safeReadJSON(ePath);

  // Resolve skills
  const builtIn = resolveBuiltInSkills(manifest, agent);
  const external = resolveExternalSkills(externalManifest, phase, agent, contentLengthOverrides);

  // FR-004 AC-004-01: Built-in first, then external
  const merged = [...builtIn, ...external];

  return { builtIn, external, merged };
}
