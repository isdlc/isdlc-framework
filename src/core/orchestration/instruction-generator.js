/**
 * Instruction Generator — Core orchestration module
 * ===================================================
 * Generates provider-specific instruction files (CLAUDE.md, CODEX.md,
 * .cursorrules, .windsurfrules) from project configuration and
 * content classifications.
 *
 * Fail-open: if any section source fails, that section is skipped
 * with a comment — the generator never throws on missing data.
 *
 * Traces: REQ-0136 FR-001..FR-007
 * @module src/core/orchestration/instruction-generator
 */

import { join } from 'node:path';

// ---------------------------------------------------------------------------
// FR-006: Provider template registry — frozen, immutable at runtime
// ---------------------------------------------------------------------------

/**
 * @type {Readonly<Record<string, {fileName: string, format: string, sections: string[]}>>}
 */
export const INSTRUCTION_TEMPLATES = Object.freeze({
  claude: Object.freeze({
    fileName: 'CLAUDE.md',
    format: 'markdown',
    sections: Object.freeze([
      'project_context',
      'workflow_commands',
      'constitution_summary',
      'agent_roster',
      'governance_rules',
      'hook_configuration',
      'session_cache_structure'
    ])
  }),
  codex: Object.freeze({
    fileName: 'CODEX.md',
    format: 'markdown',
    sections: Object.freeze([
      'project_context',
      'workflow_commands',
      'constitution_summary',
      'agent_roster',
      'governance_rules',
      'instruction_format_notes',
      'sandbox_constraints'
    ])
  }),
  cursor: Object.freeze({
    fileName: '.cursorrules',
    format: 'text',
    sections: Object.freeze([
      'project_context',
      'workflow_commands',
      'constitution_summary'
    ])
  }),
  windsurf: Object.freeze({
    fileName: '.windsurfrules',
    format: 'text',
    sections: Object.freeze([
      'project_context',
      'workflow_commands',
      'constitution_summary'
    ])
  })
});

// ---------------------------------------------------------------------------
// Section builders — each returns a string or empty string on failure
// ---------------------------------------------------------------------------

/**
 * Build the project context section.
 * @param {object} projectConfig
 * @returns {string}
 */
function buildProjectContext(projectConfig) {
  const name = projectConfig.projectName || 'Unknown Project';
  const root = projectConfig.projectRoot || '.';
  return `Project: ${name}\nRoot: ${root}`;
}

/**
 * Build the workflow commands section.
 * @param {object} projectConfig
 * @returns {string}
 */
function buildWorkflowCommands(projectConfig) {
  const workflows = projectConfig.workflows || ['feature', 'fix'];
  const lines = workflows.map(w => `- /isdlc ${w}`);
  return `Available workflow commands:\n${lines.join('\n')}`;
}

/**
 * Build the constitution summary section.
 * @param {object} projectConfig
 * @returns {string}
 */
function buildConstitutionSummary(projectConfig) {
  if (!projectConfig.constitution) {
    return '';
  }
  return `Constitution:\n${projectConfig.constitution}`;
}

/**
 * Build the agent roster section.
 * Uses listClassifiedAgents() from content classification — fail-open.
 * @returns {string}
 */
function buildAgentRoster() {
  try {
    // Dynamic import to avoid hard dependency — fail-open if unavailable
    // We use a synchronous approach: import at module level is ESM,
    // but we can reference the module directly
    const agents = getAgentList();
    if (agents.length === 0) return '';
    return `Agent roster (${agents.length} agents):\n${agents.map(a => `- ${a}`).join('\n')}`;
  } catch {
    return '<!-- Agent roster unavailable -->';
  }
}

/**
 * Try to get agent list from classification module.
 * @returns {string[]}
 */
function getAgentList() {
  try {
    // Lazy require to avoid circular deps — safe because this is a leaf module
    // Use dynamic import workaround: we load synchronously via the already-imported module
    // Since we're in ESM, we can't use require. Instead, return a static list
    // derived from the classification module that's loaded at startup.
    return _cachedAgentList || [];
  } catch {
    return [];
  }
}

// Cache agent list on first access
let _cachedAgentList = null;

try {
  const { listClassifiedAgents } = await import('../content/agent-classification.js');
  _cachedAgentList = listClassifiedAgents();
} catch {
  _cachedAgentList = [];
}

/**
 * Build governance rules section.
 * @param {string} providerName
 * @returns {string}
 */
function buildGovernanceRules(providerName) {
  const rules = [
    'All code must pass quality gates before advancing phases',
    'Constitutional articles are enforced by hooks',
    'Test coverage minimum: 80%'
  ];
  return `Governance rules:\n${rules.map(r => `- ${r}`).join('\n')}`;
}

/**
 * Build hook configuration section (Claude-specific).
 * @returns {string}
 */
function buildHookConfiguration() {
  return `Hook configuration:\n- PreToolUse hooks enforce state guards\n- PostToolUse hooks validate outputs\n- Notification hooks track progress`;
}

/**
 * Build session cache structure section (Claude-specific).
 * @returns {string}
 */
function buildSessionCacheStructure() {
  return `Session cache structure:\n- .isdlc/state.json — workflow state\n- .isdlc/session-cache.json — roundtable memory`;
}

/**
 * Build instruction format notes section (Codex-specific).
 * @returns {string}
 */
function buildInstructionFormatNotes() {
  return `Instruction format notes:\n- Instructions are delivered as markdown bundles\n- Each agent receives phase-scoped context\n- Skills are injected based on workflow and phase`;
}

/**
 * Build sandbox constraints section (Codex-specific).
 * @returns {string}
 */
function buildSandboxConstraints() {
  return `Sandbox constraints:\n- Network access is restricted in sandbox mode\n- File system writes are scoped to project directory\n- External tool invocations require explicit approval`;
}

// ---------------------------------------------------------------------------
// Section dispatcher — maps section names to builder functions
// ---------------------------------------------------------------------------

const SECTION_BUILDERS = {
  project_context: (config, _provider) => buildProjectContext(config),
  workflow_commands: (config, _provider) => buildWorkflowCommands(config),
  constitution_summary: (config, _provider) => buildConstitutionSummary(config),
  agent_roster: (_config, _provider) => buildAgentRoster(),
  governance_rules: (_config, provider) => buildGovernanceRules(provider),
  hook_configuration: (_config, _provider) => buildHookConfiguration(),
  session_cache_structure: (_config, _provider) => buildSessionCacheStructure(),
  instruction_format_notes: (_config, _provider) => buildInstructionFormatNotes(),
  sandbox_constraints: (_config, _provider) => buildSandboxConstraints()
};

// ---------------------------------------------------------------------------
// FR-001: generateInstructions(providerName, projectConfig)
// ---------------------------------------------------------------------------

/**
 * Generate instruction file content for a provider.
 *
 * @param {string} providerName - Provider name (claude, codex, cursor, windsurf)
 * @param {object} projectConfig - Project configuration
 * @param {string} [projectConfig.projectName] - Project name
 * @param {string} [projectConfig.projectRoot] - Project root path
 * @param {string} [projectConfig.constitution] - Constitution text
 * @param {string[]} [projectConfig.workflows] - Available workflows
 * @returns {{ content: string, fileName: string, format: string }}
 * @throws {Error} If providerName is not a supported provider
 */
export function generateInstructions(providerName, projectConfig = {}) {
  const template = INSTRUCTION_TEMPLATES[providerName];
  if (!template) {
    throw new Error(
      `Unsupported provider: "${providerName}". ` +
      `Supported providers: ${listSupportedProviders().join(', ')}`
    );
  }

  const sections = [];

  for (const sectionName of template.sections) {
    const builder = SECTION_BUILDERS[sectionName];
    if (!builder) {
      sections.push(`<!-- Section "${sectionName}" has no builder -->`);
      continue;
    }

    try {
      const content = builder(projectConfig, providerName);
      if (content) {
        sections.push(content);
      }
    } catch {
      // Fail-open: skip section with comment (Article X)
      sections.push(`<!-- Section "${sectionName}" failed to generate -->`);
    }
  }

  const isMarkdown = template.format === 'markdown';
  const separator = isMarkdown ? '\n\n---\n\n' : '\n\n';
  const header = isMarkdown
    ? `# ${projectConfig.projectName || 'Project'} — ${providerName} Instructions\n\n`
    : `${projectConfig.projectName || 'Project'} — ${providerName} Instructions\n${'='.repeat(60)}\n\n`;

  const content = header + sections.join(separator);

  return {
    content,
    fileName: template.fileName,
    format: template.format
  };
}

// ---------------------------------------------------------------------------
// FR-005: getInstructionPath(providerName, projectRoot)
// ---------------------------------------------------------------------------

/**
 * Get the file path for a provider's instruction file.
 *
 * @param {string} providerName - Provider name
 * @param {string} projectRoot - Project root directory
 * @returns {string} Absolute path to the instruction file
 * @throws {Error} If providerName is not supported
 */
export function getInstructionPath(providerName, projectRoot) {
  const template = INSTRUCTION_TEMPLATES[providerName];
  if (!template) {
    throw new Error(
      `Unsupported provider: "${providerName}". ` +
      `Supported providers: ${listSupportedProviders().join(', ')}`
    );
  }
  return join(projectRoot, template.fileName);
}

// ---------------------------------------------------------------------------
// FR-006: listSupportedProviders()
// ---------------------------------------------------------------------------

/**
 * List all providers that have instruction templates.
 *
 * @returns {string[]} Array of provider names
 */
export function listSupportedProviders() {
  return Object.keys(INSTRUCTION_TEMPLATES);
}
