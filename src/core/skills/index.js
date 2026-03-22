/**
 * Skills Service Boundary — Extracted skill management functions
 *
 * REQ-0085: Decompose remaining common.cjs functions
 *
 * These functions were originally in src/claude/hooks/lib/common.cjs and
 * are now extracted to src/core/skills/ as ESM modules. The common.cjs
 * wrapper delegates to these via the skills bridge when available.
 *
 * Functions extracted:
 * - SKILL_KEYWORD_MAP, PHASE_TO_AGENT_MAP (constants)
 * - validateSkillFrontmatter, analyzeSkillContent, suggestBindings
 * - formatSkillInjectionBlock, removeSkillFromManifest, reconcileSkillsBySource
 *
 * @module src/core/skills
 */

import { readFileSync, existsSync } from 'node:fs';
import { extname } from 'node:path';

export const MODULE_ID = 'core/skills';

// =========================================================================
// Constants (REQ-0022)
// =========================================================================

/**
 * Keyword-to-phase mapping for smart binding suggestions.
 * Maps skill content keywords to relevant workflow phases.
 * @type {Object<string, {keywords: string[], phases: string[]}>}
 */
export const SKILL_KEYWORD_MAP = {
  testing: {
    keywords: ['test', 'testing', 'coverage', 'assertion', 'mock', 'stub', 'jest', 'mocha'],
    phases: ['05-test-strategy', '06-implementation']
  },
  architecture: {
    keywords: ['architecture', 'design pattern', 'module', 'component', 'system design', 'microservice'],
    phases: ['03-architecture', '04-design']
  },
  devops: {
    keywords: ['deploy', 'ci/cd', 'pipeline', 'docker', 'kubernetes', 'infrastructure'],
    phases: ['10-cicd', '11-local-testing']
  },
  security: {
    keywords: ['security', 'auth', 'authentication', 'encryption', 'owasp', 'vulnerability'],
    phases: ['09-validation']
  },
  implementation: {
    keywords: ['implement', 'code', 'function', 'class', 'api', 'endpoint', 'controller', 'service'],
    phases: ['06-implementation']
  },
  requirements: {
    keywords: ['requirements', 'user story', 'acceptance criteria', 'specification'],
    phases: ['01-requirements']
  },
  review: {
    keywords: ['review', 'quality', 'lint', 'code review', 'static analysis'],
    phases: ['08-code-review']
  }
};

/**
 * Phase-to-agent mapping for resolving agent names from phase keys.
 * @type {Object<string, string>}
 */
export const PHASE_TO_AGENT_MAP = {
  '01-requirements': 'requirements-analyst',
  '03-architecture': 'solution-architect',
  '04-design': 'system-designer',
  '05-test-strategy': 'test-design-engineer',
  '06-implementation': 'software-developer',
  '07-testing': 'integration-tester',
  '08-code-review': 'qa-engineer',
  '09-validation': 'security-compliance-auditor',
  '10-cicd': 'cicd-engineer',
  '11-local-testing': 'environment-builder',
  '16-quality-loop': 'quality-loop-engineer'
};

// =========================================================================
// Skill Validation (REQ-0022)
// =========================================================================

/**
 * Validate an external skill file's frontmatter.
 * Checks file existence, extension, YAML frontmatter presence, and required fields.
 * Collects ALL errors before returning (not fail-fast) for better UX.
 *
 * Traces: FR-001, Security 6.1, V-001 through V-006
 *
 * @param {string} filePath - Absolute path to the skill .md file
 * @returns {{valid: boolean, errors: string[], parsed: object|null, body: string|null}}
 */
export function validateSkillFrontmatter(filePath) {
  const errors = [];

  // V-001: File exists
  if (!existsSync(filePath)) {
    return { valid: false, errors: [`File not found: ${filePath}`], parsed: null, body: null };
  }

  // V-002: File extension
  if (!filePath.endsWith('.md')) {
    const ext = extname(filePath) || '(none)';
    return { valid: false, errors: [`Only .md files are supported. Got: ${ext}`], parsed: null, body: null };
  }

  const content = readFileSync(filePath, 'utf8');

  // V-003: Frontmatter present
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    return {
      valid: false,
      errors: ["No YAML frontmatter found. Expected file to start with '---'"],
      parsed: null,
      body: null
    };
  }

  // Parse frontmatter (simple key: value parser per ADR-0009)
  const parsed = {};
  const fmLines = fmMatch[1].split('\n');
  for (const line of fmLines) {
    const sepIdx = line.indexOf(': ');
    if (sepIdx > 0) {
      const key = line.substring(0, sepIdx).trim();
      const value = line.substring(sepIdx + 2).trim();
      parsed[key] = value;
    }
  }

  // V-004: name field required
  if (!parsed.name || !parsed.name.trim()) {
    errors.push('Missing required frontmatter field: name');
  }

  // V-005: description field required
  if (!parsed.description || !parsed.description.trim()) {
    errors.push('Missing required frontmatter field: description');
  }

  // V-006: name format (if name exists and is non-empty)
  if (parsed.name && parsed.name.trim()) {
    const namePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!namePattern.test(parsed.name.trim())) {
      errors.push(
        "Skill name must be lowercase alphanumeric with hyphens, "
        + "2+ chars (e.g., 'nestjs-conventions')"
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, parsed: null, body: null };
  }

  // Extract body (everything after frontmatter)
  const fmEnd = content.indexOf('---', 4);
  const body = content.substring(fmEnd + 3).trim();

  return { valid: true, errors: [], parsed, body };
}

// =========================================================================
// Content Analysis (REQ-0022)
// =========================================================================

/**
 * Analyze skill content for phase-indicative keywords.
 *
 * Traces: FR-002
 *
 * @param {string} content - The skill body content to analyze
 * @returns {{keywords: string[], suggestedPhases: string[], confidence: string}}
 */
export function analyzeSkillContent(content) {
  if (!content || typeof content !== 'string') {
    return { keywords: [], suggestedPhases: ['06-implementation'], confidence: 'low' };
  }

  const lowerContent = content.toLowerCase();
  const matchedKeywords = [];
  const phaseSet = new Set();

  for (const [_category, config] of Object.entries(SKILL_KEYWORD_MAP)) {
    for (const kw of config.keywords) {
      if (lowerContent.includes(kw.toLowerCase())) {
        matchedKeywords.push(kw);
        config.phases.forEach(p => phaseSet.add(p));
      }
    }
  }

  const suggestedPhases = phaseSet.size > 0
    ? Array.from(phaseSet)
    : ['06-implementation'];

  let confidence;
  if (matchedKeywords.length >= 3) {
    confidence = 'high';
  } else if (matchedKeywords.length >= 1) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  return { keywords: matchedKeywords, suggestedPhases, confidence };
}

// =========================================================================
// Binding Suggestions (REQ-0022)
// =========================================================================

/**
 * Suggest bindings (agents, phases, delivery type) based on content analysis
 * and optional frontmatter hints.
 *
 * Traces: FR-002
 *
 * @param {object|null} analysis - Result from analyzeSkillContent()
 * @param {object|null} frontmatterHints - Parsed frontmatter with optional owner, when_to_use fields
 * @returns {{agents: string[], phases: string[], delivery_type: string, confidence: string}}
 */
export function suggestBindings(analysis, frontmatterHints) {
  const phases = (analysis && analysis.suggestedPhases) || ['06-implementation'];
  let confidence = (analysis && analysis.confidence) || 'low';

  // Map phases to agents
  const agentSet = new Set();
  for (const phase of phases) {
    const agent = PHASE_TO_AGENT_MAP[phase];
    if (agent) agentSet.add(agent);
  }

  // Enhance with frontmatter hints
  if (frontmatterHints && frontmatterHints.owner) {
    agentSet.add(frontmatterHints.owner);
    if (confidence === 'low') confidence = 'medium';
  }

  // Determine delivery type
  let delivery_type = 'context';
  if (frontmatterHints && frontmatterHints.when_to_use) {
    const hint = frontmatterHints.when_to_use.toLowerCase();
    if (hint.includes('must') || hint.includes('standard') || hint.includes('convention')) {
      delivery_type = 'instruction';
    }
  }
  if (analysis && analysis.contentLength && analysis.contentLength > 5000) {
    delivery_type = 'reference';
  }

  return {
    agents: Array.from(agentSet),
    phases,
    delivery_type,
    confidence
  };
}

// =========================================================================
// Injection Block Formatting (REQ-0022)
// =========================================================================

/**
 * Format an external skill's content into an injection block for agent Task prompts.
 * Pure function, no I/O.
 *
 * Traces: FR-005
 *
 * @param {string} name - The skill name
 * @param {string} content - The skill body content (or file path for reference type)
 * @param {string} deliveryType - 'context', 'instruction', or 'reference'
 * @returns {string} Formatted injection block, or empty string for unknown types
 */
export function formatSkillInjectionBlock(name, content, deliveryType) {
  switch (deliveryType) {
    case 'context':
      return `EXTERNAL SKILL CONTEXT: ${name}\n---\n${content}\n---`;
    case 'instruction':
      return `EXTERNAL SKILL INSTRUCTION (${name}): You MUST follow these guidelines:\n${content}`;
    case 'reference':
      return `EXTERNAL SKILL AVAILABLE: ${name} -- Read from ${content} if relevant to your current task`;
    default:
      return '';
  }
}

// =========================================================================
// Manifest Operations (REQ-0022)
// =========================================================================

/**
 * Remove a skill from the manifest by name.
 * Pure function on the manifest object (does not write to disk).
 *
 * Traces: FR-007
 *
 * @param {string} skillName - The skill name to remove
 * @param {object|null} manifest - The manifest object
 * @returns {{removed: boolean, manifest: object}}
 */
export function removeSkillFromManifest(skillName, manifest) {
  if (!manifest || !Array.isArray(manifest.skills)) {
    return { removed: false, manifest: manifest || { version: '1.0.0', skills: [] } };
  }

  const initialLength = manifest.skills.length;
  const filtered = manifest.skills.filter(s => s.name !== skillName);

  return {
    removed: filtered.length < initialLength,
    manifest: { ...manifest, skills: filtered }
  };
}

/**
 * Reconcile incoming skills into the manifest for a given source.
 * Pure function -- operates on manifest in memory, does not write to disk.
 *
 * Traces: FR-002, FR-003, FR-004 (REQ-0038)
 *
 * @param {object|null} manifest - Current manifest from loadExternalManifest()
 * @param {string} source - Source identifier: "discover" or "skills.sh"
 * @param {Array} incomingSkills
 * @param {Array<string>|null} phasesExecuted
 * @returns {{manifest: object, changed: boolean, added: string[], removed: string[], updated: string[]}}
 */
export function reconcileSkillsBySource(manifest, source, incomingSkills, phasesExecuted) {
  const noChange = (m) => ({ manifest: m, changed: false, added: [], removed: [], updated: [] });

  // Validate source
  if (source !== 'discover' && source !== 'skills.sh') {
    return noChange(manifest || { version: '1.0.0', skills: [] });
  }

  // Validate incomingSkills
  if (!Array.isArray(incomingSkills)) {
    return noChange(manifest || { version: '1.0.0', skills: [] });
  }

  // Normalize manifest (null -> empty)
  if (!manifest || !manifest.skills) {
    manifest = { version: '1.0.0', skills: [] };
  }

  // Normalize source on all existing entries (missing source -> "user")
  const skills = manifest.skills.map(s => {
    if (!s.source) {
      return { ...s, source: 'user' };
    }
    return s;
  });

  // Partition existing skills: sameSource vs otherSource
  const sameSource = [];
  const otherSource = [];
  for (const skill of skills) {
    if (skill.source === source) {
      sameSource.push(skill);
    } else {
      otherSource.push(skill);
    }
  }

  // Build a map of incoming skills by name
  const incomingMap = new Map();
  for (const incoming of incomingSkills) {
    if (incoming && incoming.name) {
      incomingMap.set(incoming.name, incoming);
    }
  }

  // Normalize phasesExecuted
  const hasPhases = Array.isArray(phasesExecuted) && phasesExecuted.length > 0;
  const phasesSet = hasPhases ? new Set(phasesExecuted) : null;

  const added = [];
  const removed = [];
  const updated = [];
  const surviving = [];
  const now = new Date().toISOString();

  // Process existing same-source entries
  for (const existing of sameSource) {
    const incoming = incomingMap.get(existing.name);
    if (incoming) {
      const updatedSkill = {
        ...existing,
        file: incoming.file !== undefined ? incoming.file : existing.file,
        description: incoming.description !== undefined ? incoming.description : existing.description,
        sourcePhase: incoming.sourcePhase !== undefined ? incoming.sourcePhase : existing.sourcePhase,
        updated_at: now
      };
      surviving.push(updatedSkill);
      updated.push(existing.name);
      incomingMap.delete(existing.name);
    } else if (phasesSet && phasesSet.has(existing.sourcePhase)) {
      removed.push(existing.name);
    } else {
      surviving.push(existing);
    }
  }

  // Add new entries
  for (const [name, incoming] of incomingMap) {
    const newEntry = {
      name: incoming.name,
      file: incoming.file,
      source: source,
      description: incoming.description,
      sourcePhase: incoming.sourcePhase,
      added_at: now,
      updated_at: now,
      bindings: incoming.bindings
    };
    surviving.push(newEntry);
    added.push(name);
  }

  // Merge
  const mergedSkills = [...otherSource, ...surviving];
  const changed = added.length > 0 || removed.length > 0 || updated.length > 0;

  return {
    manifest: { ...manifest, skills: mergedSkills },
    changed,
    added,
    removed,
    updated
  };
}
