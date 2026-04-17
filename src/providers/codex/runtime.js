/**
 * Codex ProviderRuntime Adapter
 * ===============================
 * Implements the ProviderRuntime interface for OpenAI Codex CLI (REQ-0135).
 *
 * Unlike the Claude adapter (which is a delegation shim), this adapter
 * actually spawns codex processes via child_process. It integrates with
 * the Codex instruction projection service (projection.js) to build
 * per-task instruction bundles.
 *
 * REQ-0139: Adds applyVerbGuard() for runtime-mode verb routing enforcement.
 *
 * Requirements: FR-001..FR-007 (REQ-0135), FR-003/FR-004 (REQ-0139)
 * Source: GitHub #198 (REQ-0135), GitHub #205 (REQ-0139)
 * Interface: src/core/orchestration/provider-runtime.js
 * Dependencies: src/providers/codex/projection.js (projectInstructions),
 *               src/providers/codex/verb-resolver.js (resolveVerb)
 *
 * @module src/providers/codex/runtime
 */

import { execSync as nodeExecSync, execFile as nodeExecFile, spawn as nodeSpawn } from 'node:child_process';
import * as nodeReadline from 'node:readline';
import { projectInstructions as coreProjectInstructions } from './projection.js';
import { resolveVerb } from './verb-resolver.js';
import { validatePhase } from '../../core/validators/validate-phase.js';
import { checkDelegation, checkArtifacts, ContractViolationError } from '../../core/validators/contract-checks.js';
import { loadContractEntry } from '../../core/validators/contract-loader.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Promisify execFile with the injected or real function.
 *
 * @param {Function} execFileFn - execFile function (real or mock)
 * @param {string} cmd - Command to execute
 * @param {string[]} args - Arguments
 * @param {Object} opts - Options (timeout, etc.)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execFileAsync(execFileFn, cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFileFn(cmd, args, opts, (err, stdout, stderr) => {
      if (err) {
        reject(err);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
    });
  });
}

/**
 * Promisify spawn with stdout collection.
 *
 * @param {Function} spawnFn - spawn function (real or mock)
 * @param {string} cmd - Command to execute
 * @param {string[]} args - Arguments
 * @param {Object} opts - Options
 * @param {string} [stdinData] - Data to write to stdin
 * @returns {Promise<string>} Collected stdout
 */
function spawnAsync(spawnFn, cmd, args, opts, stdinData) {
  return new Promise((resolve) => {
    const proc = spawnFn(cmd, args, opts);
    let output = '';

    if (proc.stdout) {
      proc.stdout.setEncoding('utf8');
      proc.stdout.on('data', (chunk) => { output += chunk; });
    }

    proc.on('error', () => {
      // Resolve with whatever we have — fail-open
      resolve(output);
    });

    proc.on('close', () => {
      resolve(output);
    });

    if (stdinData && proc.stdin) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    }
  });
}

/**
 * Parse stdout as JSON if possible, else return as string.
 *
 * @param {string} stdout - Raw stdout text
 * @returns {*} Parsed JSON or original string
 */
function parseOutput(stdout) {
  if (!stdout || stdout.trim().length === 0) return stdout;
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout;
  }
}

/**
 * Format choices as a numbered list for display.
 *
 * @param {string} prompt - Base prompt
 * @param {string[]} choices - Available choices
 * @returns {string} Formatted prompt with numbered choices
 */
function formatChoicesPrompt(prompt, choices) {
  const numbered = choices.map((c, i) => `  ${i + 1}. ${c}`).join('\n');
  return `${prompt}\n${numbered}\n> `;
}

// ---------------------------------------------------------------------------
// FR-003 (REQ-0139): Runtime Verb Guard
// ---------------------------------------------------------------------------

/**
 * Apply verb guard to a user prompt based on config mode.
 *
 * When verb_routing === "runtime" and a verb is detected, prepends a
 * structured RESERVED_VERB_ROUTING preamble to the prompt. Otherwise
 * returns the prompt unmodified (fail-open, Article X).
 *
 * @param {string} prompt - Raw user prompt
 * @param {Object} config - Parsed .isdlc/config.json
 * @param {Object|null} stateJson - Parsed .isdlc/state.json (for active workflow check)
 * @returns {{ modifiedPrompt: string, verbResult: Object }}
 */
export function applyVerbGuard(prompt, config, stateJson) {
  // Default: prompt mode — return unmodified
  if (!config || config.verb_routing !== 'runtime') {
    return { modifiedPrompt: prompt, verbResult: { detected: false } };
  }

  // Resolve verb from prompt
  const verbResult = resolveVerb(prompt, {
    activeWorkflow: !!(stateJson && stateJson.active_workflow),
    isSlashCommand: typeof prompt === 'string' && prompt.startsWith('/')
  });

  // If no verb detected, return unmodified
  if (!verbResult.detected) {
    return { modifiedPrompt: prompt, verbResult };
  }

  // Build structured preamble
  const preamble = [
    'RESERVED_VERB_ROUTING:',
    `  detected: true`,
    `  verb: "${verbResult.verb}"`,
    `  command: "${verbResult.command}"`,
    `  confirmation_required: true`,
    `  ambiguity: ${verbResult.ambiguity}`,
    `  ambiguous_verbs: [${verbResult.ambiguous_verbs.map(v => `"${v}"`).join(', ')}]`,
    `  source_phrase: "${verbResult.source_phrase}"`,
    `  blocked_by: ${verbResult.blocked_by ? `"${verbResult.blocked_by}"` : 'null'}`
  ].join('\n');

  return {
    modifiedPrompt: `${preamble}\n\n${prompt}`,
    verbResult
  };
}

// ---------------------------------------------------------------------------
// Factory — FR-001
// ---------------------------------------------------------------------------

/**
 * Create a Codex ProviderRuntime adapter.
 *
 * The returned runtime implements all 5 ProviderRuntime interface methods.
 * For testability, config can include injectable overrides for child_process
 * functions and the projection service.
 *
 * @param {Object} [config={}] - Configuration
 * @param {string} [config.projectRoot] - Project root directory
 * @param {Function} [config._execSync] - Injectable execSync for testing
 * @param {Function} [config._execFile] - Injectable execFile for testing
 * @param {Function} [config._spawn] - Injectable spawn for testing
 * @param {Object} [config._readline] - Injectable readline module for testing
 * @param {Function} [config._projectInstructions] - Injectable projection for testing
 * @returns {Object} ProviderRuntime implementation
 */
export function createRuntime(config = {}) {
  const execSyncFn = config._execSync || nodeExecSync;
  const execFileFn = config._execFile || nodeExecFile;
  const spawnFn = config._spawn || nodeSpawn;
  const readlineMod = config._readline || nodeReadline;
  const projectInstructionsFn = config._projectInstructions || coreProjectInstructions;

  return {
    /**
     * Execute a task by calling projectInstructions and then codex exec.
     *
     * FR-002 (REQ-0135): Calls projectInstructions(phase, agent) to build
     * a markdown instruction bundle, then invokes codex exec with that
     * instruction as prompt. Parses stdout, constructs TaskResult.
     *
     * @param {string} phase - Phase key
     * @param {string} agent - Agent name
     * @param {Object} [context={}] - Task context
     * @returns {Promise<{status: string, output: *, duration_ms: number, error?: string}>}
     */
    async executeTask(phase, agent, context = {}) {
      const start = Date.now();

      // Build instruction bundle via projection
      let instructions;
      try {
        instructions = projectInstructionsFn(phase, agent, {
          workflow: context.workflow_type,
          projectRoot: config.projectRoot
        });
      } catch (projErr) {
        // Fail-open: use minimal instruction
        instructions = {
          content: `Phase: ${phase}\nAgent: ${agent}\nProjection unavailable: ${projErr.message}`,
          metadata: { phase, agent, skills_injected: [], team_type: 'unknown' }
        };
      }

      // REQ-GH-253 T046: Inject composed roundtable card into projection bundle
      if (context.composedCard) {
        instructions.content = instructions.content + '\n\n' + context.composedCard;
      }

      // Execute via codex exec
      try {
        const { stdout } = await execFileAsync(
          execFileFn,
          'codex',
          ['exec', '--', instructions.content],
          { timeout: 300000 }
        );

        return {
          status: 'completed',
          output: parseOutput(stdout),
          duration_ms: Date.now() - start
        };
      } catch (execErr) {
        return {
          status: 'failed',
          output: null,
          duration_ms: Date.now() - start,
          error: execErr.message
        };
      }
    },

    /**
     * Execute multiple tasks concurrently via Promise.allSettled.
     * Preserves order; per-task error handling.
     *
     * FR-003 (REQ-0135)
     *
     * @param {Array<{phase: string, agent: string, context: Object}>} tasks
     * @returns {Promise<Array<{status: string, output: *, duration_ms: number, error?: string}>>}
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
     * Spawn a codex process with the prompt, collect stdout.
     *
     * FR-004 (REQ-0135): Interactive mode — spawn codex with stdio piped,
     * write prompt to stdin, collect stdout.
     *
     * @param {string} prompt - The prompt to present
     * @returns {Promise<string>} Collected output
     */
    async presentInteractive(prompt) {
      return spawnAsync(
        spawnFn,
        'codex',
        [prompt],
        { stdio: 'pipe' },
        null
      );
    },

    /**
     * Read user response via readline.
     * If options.choices provided, formats as numbered list and resolves
     * numeric selection to the choice string.
     *
     * FR-005 (REQ-0135)
     *
     * @param {Object} [options={}] - Input options
     * @param {string} [options.prompt='> '] - Prompt text
     * @param {string[]} [options.choices] - Available choices
     * @returns {Promise<string>} User's text or selected choice
     */
    async readUserResponse(options = {}) {
      const prompt = options.prompt || '> ';
      const choices = options.choices;

      const displayPrompt = choices && choices.length > 0
        ? formatChoicesPrompt(prompt, choices)
        : prompt;

      return new Promise((resolve) => {
        const rl = readlineMod.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        rl.question(displayPrompt, (answer) => {
          rl.close();

          // If choices provided and answer is a number, resolve to choice
          if (choices && choices.length > 0) {
            const idx = parseInt(answer, 10);
            if (!isNaN(idx) && idx >= 1 && idx <= choices.length) {
              resolve(choices[idx - 1]);
              return;
            }
          }

          resolve(answer);
        });
      });
    },

    /**
     * Check if the Codex CLI is available on the system.
     *
     * FR-006 (REQ-0135)
     *
     * @returns {Promise<{available: boolean, reason?: string}>}
     */
    async validateRuntime() {
      try {
        execSyncFn('which codex', { stdio: 'pipe' });
        return { available: true };
      } catch {
        return { available: false, reason: 'codex CLI not found in PATH' };
      }
    }
  };
}

// ---------------------------------------------------------------------------
// BUG-0057 (FR-009): Phase Gate Validation for Codex Runtime
// ---------------------------------------------------------------------------

/**
 * Validate phase gate before allowing phase advancement in Codex runtime.
 * Imports validatePhase directly (ESM to ESM) — no CJS bridge needed.
 *
 * BUG-0057 (FR-009, AC-009-01..05)
 *
 * @param {string} phaseKey - Phase key (e.g., "06-implementation")
 * @param {object} inputs - Artifact contents for validation
 * @param {object} [options={}] - Validation options
 * @returns {Promise<{ pass: boolean, failures: object[], details: object, validator_errors: string[] }>}
 */
export async function validatePhaseGate(phaseKey, inputs, options = {}) {
  try {
    // Existing phase validation
    const phaseResult = await validatePhase(phaseKey, inputs, options);

    // Inline contract checks (REQ-GH-213, replaces batch evaluateContract)
    const contractWarnings = [];
    const contractViolations = [];
    try {
      const workflowType = options.workflowType || 'feature';
      const intensity = options.intensity || 'standard';
      const context = `${workflowType}:${intensity}`;
      const loaded = loadContractEntry(phaseKey, context, {
        projectRoot: options.projectRoot || '.'
      });
      if (loaded.entry) {
        // checkDelegation: validate correct agent for phase (skip if agentName not provided)
        if (options.agentName) {
          try {
            checkDelegation(loaded.entry, phaseKey, options.agentName);
          } catch (e) {
            if (e instanceof ContractViolationError) {
              contractViolations.push({ checkpoint: 'delegation', message: e.message, severity: 'block' });
            }
          }
        }
        // checkArtifacts: validate required artifacts exist on disk (skip if artifactFolder not provided)
        if (options.artifactFolder) {
          try {
            checkArtifacts(loaded.entry, options.artifactFolder, options.projectRoot || '.');
          } catch (e) {
            if (e instanceof ContractViolationError) {
              contractViolations.push({ checkpoint: 'artifacts', message: e.message, severity: 'block' });
            }
          }
        }
        if (loaded.stale) {
          contractWarnings.push('Contract is stale — run generate-contracts.js to update');
        }
      }
    } catch {
      // Fail-open: contract check errors do not block
    }

    // Merge results
    return {
      pass: phaseResult.pass && contractViolations.length === 0,
      failures: [...phaseResult.failures, ...contractViolations],
      details: { ...phaseResult.details, contract: { violations: contractViolations, warnings: contractWarnings } },
      warnings: [...(phaseResult.warnings || []), ...contractWarnings],
      validator_errors: phaseResult.validator_errors || []
    };
  } catch (err) {
    // Fail-open on validator code errors (ADR-004)
    return {
      pass: true,
      failures: [],
      details: {},
      validator_errors: [`validatePhaseGate error: ${err.message}`]
    };
  }
}
