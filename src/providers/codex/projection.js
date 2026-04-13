/**
 * Codex Adapter — Projection
 * ============================
 * Codex instruction projection management (REQ-0114, REQ-0116, REQ-0138, REQ-0139).
 *
 * Manages provider configuration, instruction directory paths, and
 * the instruction projection service that assembles core models into
 * a Codex-compatible markdown instruction bundle.
 *
 * REQ-0139: Adds buildVerbRoutingSection() for reserved verb routing.
 *
 * @module src/providers/codex/projection
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getTeamSpec, listTeamTypes } from '../../core/teams/registry.js';
import { getTeamInstancesByPhase } from '../../core/teams/instance-registry.js';
import { getAgentClassification } from '../../core/content/agent-classification.js';
import { computeInjectionPlan } from '../../core/skills/injection-planner.js';
import { readTaskPlan, formatTaskContext } from '../../core/tasks/task-reader.js';

// ---------------------------------------------------------------------------
// FR-001: Codex Provider Config (REQ-0114)
// ---------------------------------------------------------------------------

/**
 * Get the Codex provider configuration.
 * Returns identity, framework directory, and instruction format.
 *
 * @returns {{ provider: string, frameworkDir: string, instructionFormat: string }}
 */
export function getCodexConfig() {
  return Object.freeze({
    provider: 'codex',
    frameworkDir: '.codex',
    instructionFormat: 'markdown-instructions'
  });
}

// ---------------------------------------------------------------------------
// FR-002: Codex Projection Paths (REQ-0114)
// ---------------------------------------------------------------------------

/**
 * Get the projection paths for the .codex/ directory structure.
 * All paths are relative to the project root.
 *
 * @returns {{ instructions: string, teamSpec: string, contentModel: string, skillManifest: string, providerConfig: string }}
 */
export function getProjectionPaths() {
  return Object.freeze({
    instructions: '.codex/AGENTS.md',
    teamSpec: '.codex/team-spec.md',
    contentModel: '.codex/content-model.md',
    skillManifest: '.codex/skills.md',
    providerConfig: '.codex/config.json'
  });
}

// ---------------------------------------------------------------------------
// FR-007 (REQ-0138): Session Cache Section Parser
// ---------------------------------------------------------------------------

/**
 * Parse session cache content into named sections using delimiter comments.
 * Sections are delimited by `<!-- SECTION: NAME -->` and `<!-- /SECTION: NAME -->`.
 * Names must match between opening and closing tags.
 *
 * @param {string} content - Raw session-cache.md content
 * @returns {Object<string, string>} Map of section name -> trimmed content
 */
export function parseCacheSections(content) {
  const sections = {};
  const regex = /<!-- SECTION: (\w+) -->([\s\S]*?)<!-- \/SECTION: \1 -->/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    sections[match[1]] = match[2].trim();
  }
  return sections;
}

/** Sections to inject from session cache (REQ-0138 FR-007) */
const CACHE_SECTIONS_TO_INJECT = ['CONSTITUTION', 'WORKFLOW_CONFIG', 'SKILL_INDEX', 'ITERATION_REQUIREMENTS'];

// ---------------------------------------------------------------------------
// FR-002 (REQ-0139): Verb Routing Section Builder
// ---------------------------------------------------------------------------

/**
 * Build the verb routing markdown section from the verb spec.
 * Generates a RESERVED VERBS section with intent table, disambiguation
 * rules, and MUST-route language for injection into instruction bundles.
 *
 * Fail-safe: returns empty string for null/undefined/empty spec (Article X).
 *
 * @param {Object|null} verbSpec - Parsed verb spec from reserved-verbs.json
 * @returns {string} Markdown section content, or '' if spec is invalid
 */
export function buildVerbRoutingSection(verbSpec) {
  if (!verbSpec || typeof verbSpec !== 'object' || !verbSpec.verbs || Object.keys(verbSpec.verbs).length === 0) {
    return '';
  }

  const lines = [];

  // Header
  lines.push('## RESERVED VERBS');
  lines.push('');
  lines.push('Add, Analyze, and Build are **reserved workflow verbs**. When detected in imperative context, they MUST route to their mapped command before any other work. Do not perform freeform analysis, implementation, or backlog management without first resolving the workflow verb.');
  lines.push('');

  // Intent table
  lines.push('| Verb | Signal Phrases | Command | Precedence |');
  lines.push('|------|---------------|---------|------------|');

  // Sort verbs by precedence ascending (highest priority first)
  const sortedVerbs = Object.entries(verbSpec.verbs)
    .sort(([, a], [, b]) => a.precedence - b.precedence);

  for (const [verbName, verbDef] of sortedVerbs) {
    const phrases = [...(verbDef.phrases || []), ...(verbDef.imperative_forms || [])].join(', ');
    lines.push(`| **${verbName}** | ${phrases} | \`${verbDef.command}\` | ${verbDef.precedence} |`);
  }

  lines.push('');

  // Disambiguation rules
  if (verbSpec.disambiguation && Object.keys(verbSpec.disambiguation).length > 0) {
    lines.push('### Disambiguation');
    lines.push('');
    lines.push('When multiple verbs match, the following precedence rules apply:');
    lines.push('');
    for (const [key, resolved] of Object.entries(verbSpec.disambiguation)) {
      const verbs = key.split('+').join(' + ');
      lines.push(`- ${verbs} --> **${resolved}**`);
    }
    lines.push('');
  }

  // Exclusions
  if (verbSpec.exclusions && verbSpec.exclusions.length > 0) {
    lines.push('### Exclusions');
    lines.push('');
    lines.push('The following patterns indicate non-development context and skip verb detection:');
    lines.push('');
    lines.push(verbSpec.exclusions.map(e => `\`${e}\``).join(', '));
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// FR-002 (REQ-GH-252): Semantic Search Instruction
// ---------------------------------------------------------------------------

/**
 * Build the semantic search instruction section for Codex agents.
 * Injected when the isdlc-embedding MCP is available, guiding agents
 * to prefer semantic search for natural-language queries while falling
 * back to lexical Grep for code symbols and regex patterns.
 *
 * REQ-GH-252 FR-002, AC-002-01
 *
 * @returns {string} Markdown instruction section
 */
export function buildSemanticSearchInstruction() {
  return `

---

## Semantic Code Search

This project has an embedding server (\`isdlc-embedding\`) that provides semantic code search. When searching for concepts, behaviors, or natural-language descriptions, prefer the semantic search tool over lexical Grep:

**Use semantic search** (\`mcp__isdlc-embedding__isdlc_embedding_semantic_search\`) for:
- Natural-language queries: "where is error handling done", "how does authentication work"
- Conceptual searches: "find the retry logic", "which module handles rate limiting"
- Cross-file understanding: "what calls this function", "where is this pattern used"

**Use lexical Grep** for:
- Exact symbol names: \`inferEnvironmentRules\`, \`HealthResult\`
- Regex patterns: \`log.*Error\`, \`import.*from\`
- File extensions: \`.test.cjs\`, \`.config.json\`
- Dotted paths: \`process.env.HOME\`, \`path.join\`
- snake_case identifiers: \`tool_router\`, \`exit_code\`

When the embedding server is unavailable, all searches automatically fall back to lexical Grep. This is a fail-open behavior (Article X) -- never block on server unavailability.`;
}

// ---------------------------------------------------------------------------
// FR-001 (REQ-GH-244): Embedding Status Instruction
// ---------------------------------------------------------------------------

/**
 * Build the embedding status instruction for Codex agents.
 * Reads the health file written by the health monitor and returns
 * an EMBEDDING_STATUS instruction string for injection into agent context.
 *
 * REQ-GH-244 FR-001, AC-001-10
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {string|null} Instruction string or null if health file missing
 */
export function buildEmbeddingStatusInstruction(projectRoot) {
  if (!projectRoot) return null;
  try {
    const healthPath = join(projectRoot, '.isdlc', 'embedding-health.json');
    if (!existsSync(healthPath)) return null;
    const health = JSON.parse(readFileSync(healthPath, 'utf-8'));
    if (!health || !health.status) return null;

    const parts = [`EMBEDDING_STATUS: ${health.status}`];
    if (health.chunks != null) parts.push(`${health.chunks} chunks`);
    if (health.commits_behind != null && health.commits_behind > 0) {
      parts.push(`${health.commits_behind} commits behind`);
    }
    if (health.files_changed != null && health.files_changed > 0) {
      parts.push(`${health.files_changed} files modified`);
    }
    return parts.join(', ');
  } catch {
    // Fail-open (Article X): missing or malformed health file is non-fatal
    return null;
  }
}

// ---------------------------------------------------------------------------
// FR-001 (REQ-0116): Instruction Projection Service
// ---------------------------------------------------------------------------

/**
 * Assemble a markdown instruction bundle from loaded context.
 * Section order: Team Context, Agent Role, Phase Instructions, Skills, Constraints.
 * Missing sections are omitted (fail-open).
 *
 * @param {Object} context
 * @returns {string} Markdown content
 */
function assembleMarkdown({ teamSpec, teamInstances, agentClassification, injectionPlan, phase, agent }) {
  const sections = [];

  // Team context
  if (teamSpec) {
    sections.push(`# Team: ${teamSpec.name || teamSpec.team_type || 'Unknown'}\n\n${teamSpec.description || ''}`);
  }

  // Agent role — extract role_spec sections from classification
  if (agentClassification) {
    const roleSpecSections = agentClassification
      .filter(s => s.type === 'role_spec')
      .map(s => s.name)
      .join(', ');
    sections.push(`## Agent: ${agent}\n\nRole sections: ${roleSpecSections}`);
  }

  // Phase instructions from team instances
  if (teamInstances && teamInstances.length > 0) {
    const instanceDescs = teamInstances
      .map(inst => `- **${inst.id || 'instance'}** (${inst.team_type || 'unknown'}): ${inst.description || 'No description'}`)
      .join('\n');
    sections.push(`## Phase: ${phase}\n\n${instanceDescs}`);
  }

  // Skills
  if (injectionPlan && injectionPlan.merged && injectionPlan.merged.length > 0) {
    const skillSections = injectionPlan.merged
      .map(s => `### Skill: ${s.skillId || s.name}\n\nDelivery: ${s.deliveryType || 'reference'}`)
      .join('\n\n');
    sections.push(`## Skills\n\n${skillSections}`);
  }

  if (sections.length === 0) {
    return `# Codex Instructions\n\nPhase: ${phase}\nAgent: ${agent}\n\nNo additional context available.`;
  }

  return sections.join('\n\n---\n\n');
}

/**
 * Generate a Codex instruction bundle by consuming core models.
 *
 * Fail-open: if any core model is unavailable, produces a minimal
 * instruction with whatever context is available. Missing models
 * are reported in metadata.warnings.
 *
 * @param {string} phase - Phase key (e.g. '06-implementation')
 * @param {string} agent - Agent name (e.g. '05-software-developer')
 * @param {Object} [options={}] - Options (projectRoot, workflow)
 * @returns {{ content: string, metadata: { phase: string, agent: string, skills_injected: string[], team_type: string, warnings?: string[] } }}
 */
export function projectInstructions(phase, agent, options = {}) {
  const warnings = [];
  const workflow = options.workflow || 'feature';

  // 1. Load team instances for the phase
  let teamInstances;
  try {
    teamInstances = getTeamInstancesByPhase(phase);
    if (!teamInstances || teamInstances.length === 0) {
      warnings.push(`No team instances found for phase: ${phase}`);
      teamInstances = [];
    }
  } catch (err) {
    warnings.push(`Team instances load failed for phase ${phase}: ${err.message}`);
    teamInstances = [];
  }

  // 2. Load agent classification (role_spec sections only)
  let agentClassification;
  try {
    agentClassification = getAgentClassification(agent);
  } catch (err) {
    warnings.push(`Agent classification not found: ${agent}`);
    agentClassification = null;
  }

  // 3. Compute injection plan for built-in + external skills
  let injectionPlan;
  try {
    injectionPlan = computeInjectionPlan(workflow, phase, agent, {
      projectRoot: options.projectRoot
    });
  } catch (err) {
    warnings.push(`Injection plan computation failed for ${agent}/${phase}: ${err.message}`);
    injectionPlan = { builtIn: [], external: [], merged: [] };
  }

  // 4. Load team spec (use first available team type from instances)
  let teamSpec = null;
  if (teamInstances.length > 0 && teamInstances[0]?.team_type) {
    try {
      teamSpec = getTeamSpec(teamInstances[0].team_type);
    } catch (err) {
      warnings.push(`Team spec not found: ${err.message}`);
    }
  } else {
    // Try to get any available team spec
    try {
      const types = listTeamTypes();
      if (types.length > 0) {
        teamSpec = getTeamSpec(types[0]);
      }
    } catch (err) {
      warnings.push(`Team spec not found: ${err.message}`);
    }
  }

  // 5. Assemble markdown
  let content = assembleMarkdown({
    teamSpec,
    teamInstances,
    agentClassification,
    injectionPlan,
    phase,
    agent
  });

  // 6. Inject session cache sections if available (REQ-0138 FR-007)
  const cacheSectionsInjected = [];
  if (options.projectRoot) {
    try {
      const cachePath = join(options.projectRoot, '.isdlc', 'session-cache.md');
      if (existsSync(cachePath)) {
        const cacheContent = readFileSync(cachePath, 'utf-8');
        const sections = parseCacheSections(cacheContent);
        for (const sectionName of CACHE_SECTIONS_TO_INJECT) {
          if (sections[sectionName]) {
            content += `\n\n---\n\n## Cached: ${sectionName}\n\n${sections[sectionName]}`;
            cacheSectionsInjected.push(sectionName);
          }
        }
      }
    } catch {
      // Fail-open: missing or malformed cache file is non-fatal (REQ-0138 FR-008)
    }
  }

  // 7. Inject TASK_CONTEXT (REQ-GH-212 FR-007, AC-007-06)
  let taskContextInjected = false;
  if (options.projectRoot) {
    try {
      const tasksPath = join(options.projectRoot, 'docs', 'isdlc', 'tasks.md');
      const taskPlan = readTaskPlan(tasksPath);
      if (taskPlan && !taskPlan.error) {
        const includeTestMapping = ['06-implementation', '16-quality-loop'].includes(phase);
        const artifactFolder = options.artifactFolder || '';
        const testStrategyPath = artifactFolder
          ? join(options.projectRoot, 'docs', 'requirements', artifactFolder, 'test-strategy.md')
          : '';
        const taskBlock = formatTaskContext(taskPlan, phase, { includeTestMapping, testStrategyPath });
        content += `\n\n---\n\n${taskBlock}`;
        taskContextInjected = true;
      }
    } catch {
      // Fail-open: missing or malformed tasks.md is non-fatal (REQ-GH-212 AC-011-04)
    }
  }

  // 8. Inject contract summary (advisory-only, ADR-008, REQ-0141)
  let contractSummaryInjected = false;
  if (options.projectRoot) {
    try {
      const contractSummary = loadContractSummary(phase, workflow, options.projectRoot);
      if (contractSummary) {
        content += `\n\n## Expected Outputs (Advisory)\n\n${contractSummary}`;
        contractSummaryInjected = true;
      }
    } catch {
      // Fail-open: missing contract is non-fatal
    }
  }

  // 9. Inject semantic search instruction (REQ-GH-252 FR-002, AC-002-01)
  // When the isdlc-embedding MCP is available, tell the Codex agent to
  // prefer semantic search for natural-language code queries.
  let semanticSearchInjected = false;
  if (options.projectRoot) {
    try {
      const settingsPath = join(options.projectRoot, '.codex', 'settings.json');
      const claudeSettingsPath = join(options.projectRoot, '.claude', 'settings.json');
      const sPath = existsSync(settingsPath) ? settingsPath : (existsSync(claudeSettingsPath) ? claudeSettingsPath : null);
      if (sPath) {
        const settings = JSON.parse(readFileSync(sPath, 'utf-8'));
        if (settings?.mcpServers?.['isdlc-embedding']) {
          content += buildSemanticSearchInstruction();
          semanticSearchInjected = true;
        }
      }
    } catch {
      // Fail-open: missing or malformed settings is non-fatal (Article X)
    }
  }

  return {
    content,
    metadata: {
      phase,
      agent,
      skills_injected: (injectionPlan.merged || []).map(s => s.skillId || s.name),
      team_type: teamSpec?.team_type ?? 'unknown',
      ...(cacheSectionsInjected.length > 0 && { cache_sections_injected: cacheSectionsInjected }),
      ...(taskContextInjected && { task_context_injected: true }),
      ...(contractSummaryInjected && { contract_summary_injected: true }),
      ...(semanticSearchInjected && { semantic_search_injected: true }),
      ...(warnings.length > 0 && { warnings })
    }
  };
}

/**
 * Load a contract summary for advisory injection into agent instructions.
 * Advisory-only (ADR-008) -- runtime evaluator is the sole enforcement authority.
 *
 * REQ-0141: Execution Contract System
 *
 * @param {string} phase - Phase key
 * @param {string} workflow - Workflow type
 * @param {string} projectRoot - Project root
 * @returns {string|null} Summary text or null
 */
function loadContractSummary(phase, workflow, projectRoot) {
  try {
    const contractDir = join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    if (!existsSync(contractDir)) return null;
    const contractFile = join(contractDir, `workflow-${workflow}.contract.json`);
    if (!existsSync(contractFile)) return null;
    const contract = JSON.parse(readFileSync(contractFile, 'utf8'));
    if (!contract || !Array.isArray(contract.entries)) return null;
    const entry = contract.entries.find(e => e.execution_unit === phase);
    if (!entry || !entry.expectations) return null;
    const lines = [];
    if (entry.expectations.agent) {
      lines.push(`- Expected agent: ${entry.expectations.agent}`);
    }
    if (entry.expectations.artifacts_produced) {
      lines.push(`- Expected artifacts: (resolved at runtime from artifact-paths.json)`);
    }
    if (Array.isArray(entry.expectations.state_assertions)) {
      for (const a of entry.expectations.state_assertions) {
        lines.push(`- State assertion: ${a.path} === ${JSON.stringify(a.equals)}`);
      }
    }
    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}
