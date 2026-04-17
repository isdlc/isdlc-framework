/**
 * Claude ProviderRuntime Adapter
 * ================================
 * Implements the ProviderRuntime interface for Claude Code (REQ-0134).
 *
 * This is a **delegation shim**: the actual Claude Code Task tool invocation
 * happens at the isdlc.md orchestration layer. This runtime structures the
 * delegation prompt and returns structured intents that the caller interprets.
 *
 * Requirements: FR-001..FR-006
 * Source: GitHub #197 (REQ-0134)
 * Interface: src/core/orchestration/provider-runtime.js
 *
 * @module src/providers/claude/runtime
 */

import { execSync as nodeExecSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Constants — REQ-0134
// ---------------------------------------------------------------------------

/**
 * Frozen mapping of phase keys to Claude subagent_type names.
 * Matches the agent table in isdlc.md.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PHASE_AGENT_MAP = Object.freeze({
  '01-requirements':          '01-requirements-analyst',
  '02-requirements-tracing':  '02-requirements-tracer',
  '03-architecture':          '03-software-architect',
  '04-test-strategy':         '04-test-strategist',
  '05-implementation':        '05-software-developer',
  '06-integration-testing':   '06-integration-tester',
  '07-documentation':         '07-technical-writer',
  '08-code-review':           '08-code-reviewer',
  '09-deployment':            '09-deployment-engineer',
  '10-monitoring':            '10-operations-monitor',
  '11-roundtable-analysis':   '11-roundtable-analyst',
  '12-orchestration':         '12-workflow-orchestrator',
  '13-security-review':       '13-security-reviewer',
  '14-performance-testing':   '14-performance-tester',
  '15-accessibility-review':  '15-accessibility-reviewer',
  '16-quality-loop':          '16-quality-orchestrator'
});

// ---------------------------------------------------------------------------
// Prompt Construction
// ---------------------------------------------------------------------------

/**
 * Build the delegation prompt string from context fields.
 *
 * @param {string} phase - Phase key (e.g. '06-implementation')
 * @param {string} agent - Agent name
 * @param {Object} [context={}] - Delegation context
 * @returns {string} Constructed prompt
 */
function buildPrompt(phase, agent, context = {}) {
  const sections = [];

  sections.push(`Phase: ${phase}`);
  sections.push(`Agent: ${agent}`);

  if (context.artifact_folder) {
    sections.push(`Artifact folder: ${context.artifact_folder}`);
  }
  if (context.workflow_type) {
    sections.push(`Workflow: ${context.workflow_type}`);
  }
  if (context.instructions) {
    sections.push(`\nInstructions:\n${context.instructions}`);
  }
  // REQ-GH-253 T045: Inject composed roundtable card after instructions, before skills
  if (context.composedCard) {
    sections.push(`\n${context.composedCard}`);
  }
  if (context.skill_context) {
    sections.push(`Skills: ${context.skill_context}`);
  }

  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Factory — FR-001
// ---------------------------------------------------------------------------

/**
 * Create a Claude ProviderRuntime adapter.
 *
 * The returned runtime implements all 5 ProviderRuntime interface methods.
 * For testability, config can include `_execSync` to override child_process.
 *
 * @param {Object} [config={}] - Configuration
 * @param {string} [config.projectRoot] - Project root directory
 * @param {Function} [config._execSync] - Injectable execSync for testing
 * @returns {Object} ProviderRuntime implementation
 */
export function createRuntime(config = {}) {
  const execSyncFn = config._execSync || nodeExecSync;

  return {
    /**
     * Structure a delegation prompt for a Claude Code Task tool call.
     * Returns a TaskResult with status 'delegated' — actual invocation
     * is performed by the isdlc.md orchestration layer.
     *
     * FR-002 (REQ-0134)
     *
     * @param {string} phase - Phase key
     * @param {string} agent - Agent name
     * @param {Object} [context={}] - Delegation context
     * @returns {Promise<{status: string, output: Object, duration_ms: number}>}
     */
    async executeTask(phase, agent, context = {}) {
      const start = Date.now();
      const prompt = buildPrompt(phase, agent, context);

      return {
        status: 'delegated',
        output: { phase, agent, prompt },
        duration_ms: Date.now() - start
      };
    },

    /**
     * Execute multiple tasks via Promise.allSettled, preserving order.
     * Per-task failures are captured individually.
     *
     * FR-003 (REQ-0134)
     *
     * @param {Array<{phase: string, agent: string, context: Object}>} tasks
     * @returns {Promise<Array<{status: string, output: Object, duration_ms: number}>>}
     */
    async executeParallel(tasks) {
      if (!tasks || tasks.length === 0) return [];

      const settled = await Promise.allSettled(
        tasks.map(t => this.executeTask(t.phase, t.agent, t.context))
      );

      return settled.map(s => {
        if (s.status === 'fulfilled') return s.value;
        return {
          status: 'failed',
          output: null,
          duration_ms: 0,
          error: s.reason?.message || String(s.reason)
        };
      });
    },

    /**
     * Return a structured interactive intent for the caller to interpret.
     * The actual relay loop stays in isdlc.md for now.
     *
     * FR-004 (REQ-0134)
     *
     * @param {string} prompt - The prompt to present
     * @returns {Promise<{type: string, prompt: string}>}
     */
    async presentInteractive(prompt) {
      return { type: 'interactive', prompt };
    },

    /**
     * Return a structured user-input intent for the caller to interpret.
     *
     * FR-005 (REQ-0134)
     *
     * @param {Object} [options={}] - Input options (prompt, choices, etc.)
     * @returns {Promise<{type: string, options: Object}>}
     */
    async readUserResponse(options = {}) {
      return { type: 'user_input', options };
    },

    /**
     * Check if the Claude CLI is available on the system.
     *
     * FR-006 (REQ-0134)
     *
     * @returns {Promise<{available: boolean, reason?: string}>}
     */
    async validateRuntime() {
      try {
        execSyncFn('which claude', { stdio: 'pipe' });
        return { available: true };
      } catch {
        return { available: false, reason: 'claude CLI not found in PATH' };
      }
    }
  };
}
