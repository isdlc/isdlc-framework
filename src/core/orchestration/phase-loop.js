/**
 * Provider-Neutral Phase-Loop Orchestrator
 *
 * Iterates through workflow phases, delegating each to the runtime adapter.
 * Handles pre/post hooks, retry logic, interactive relay, and skill injection.
 *
 * Requirements: REQ-0129 FR-001..FR-006
 * Dependencies: provider-runtime (interface), teams/instance-registry,
 *               skills/injection-planner
 *
 * @module src/core/orchestration/phase-loop
 */

// ---------------------------------------------------------------------------
// Constants — phase-to-agent mapping (frozen lookup table)
// ---------------------------------------------------------------------------

/**
 * Maps phase keys to their responsible agent names.
 * Matches the PHASE-to-AGENT table from isdlc.md.
 * @type {Readonly<Object<string, string>>}
 */
const PHASE_AGENT_MAP = Object.freeze({
  '01-requirements':   'requirements-analyst',
  '02-tracing':        'traceability-analyst',
  '03-architecture':   'solution-architect',
  '04-design':         'module-designer',
  '05-test-strategy':  'test-strategist',
  '06-implementation': 'software-developer',
  '07-integration':    'integration-tester',
  '08-code-review':    'code-reviewer',
  '09-deployment':     'release-engineer',
  '10-monitoring':     'ops-engineer',
  '16-quality-loop':   'quality-orchestrator'
});

/**
 * Phases that use interactive relay instead of single-shot execution.
 * @type {ReadonlySet<string>}
 */
const INTERACTIVE_PHASES = Object.freeze(new Set([
  '01-requirements'
]));

/**
 * Default maximum retries per phase.
 * @type {number}
 */
const DEFAULT_MAX_RETRIES = 3;

/**
 * Completion signal returned by interactive phases.
 * @type {string}
 */
const PHASE_COMPLETE_SIGNAL = '__PHASE_COMPLETE__';

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/**
 * Get the agent name responsible for a given phase.
 * Returns the phase key itself if no mapping exists (graceful fallback).
 *
 * @param {string} phase - Phase key (e.g., '06-implementation')
 * @returns {string} Agent name
 */
export function getAgentForPhase(phase) {
  return PHASE_AGENT_MAP[phase] || phase;
}

/**
 * Check if a phase result indicates success.
 *
 * @param {Object} result - TaskResult from runtime
 * @returns {boolean}
 */
function isPhaseSuccess(result) {
  return result && (result.status === 'completed' || result.status === 'passed');
}

/**
 * Activate a phase: write activation record to state.
 *
 * @param {string} phase - Phase key
 * @param {Object} state - Mutable state object
 * @returns {Object} Updated state
 */
function activatePhase(phase, state) {
  if (!state.phases) {
    state.phases = {};
  }
  state.phases[phase] = {
    status: 'in_progress',
    started_at: new Date().toISOString(),
    completed_at: null,
    duration_ms: null,
    retries: 0
  };
  return state;
}

/**
 * Update state after phase execution.
 *
 * @param {Object} state - Mutable state object
 * @param {string} phase - Phase key
 * @param {Object} result - TaskResult from runtime
 * @returns {Object} Updated state
 */
function updatePhaseState(state, phase, result) {
  const now = new Date().toISOString();
  const phaseState = state.phases[phase];
  const started = phaseState.started_at ? new Date(phaseState.started_at).getTime() : Date.now();

  phaseState.status = isPhaseSuccess(result) ? 'completed' : 'blocked';
  phaseState.completed_at = now;
  phaseState.duration_ms = Date.now() - started;
  phaseState.output = result.output || null;
  if (result.error) {
    phaseState.error = result.error;
  }

  return state;
}

/**
 * Build execution context for a phase.
 *
 * @param {string} phase - Phase key
 * @param {Object} workflow - Workflow definition
 * @param {Object} state - Current state
 * @returns {Object} Context object for runtime
 */
function buildContext(phase, workflow, state) {
  return {
    phase,
    artifact_folder: workflow.artifact_folder,
    workflow_type: workflow.workflow_type,
    state_summary: {
      completed_phases: Object.keys(state.phases || {}).filter(
        p => state.phases[p] && state.phases[p].status === 'completed'
      )
    }
  };
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

/**
 * Run the phase loop orchestrator.
 *
 * Iterates through workflow phases in order, delegating each to the runtime.
 * Interactive phases use presentInteractive in a loop; non-interactive phases
 * use executeTask. Failed phases are retried up to maxRetries.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {Object} workflow - Workflow definition { phases, artifact_folder, workflow_type }
 * @param {Object} state - Current state.json content (mutated and returned)
 * @param {Object} [options] - Optional callbacks and config
 * @param {Function} [options.onPhaseStart] - Called before each phase
 * @param {Function} [options.onPhaseComplete] - Called after each phase
 * @param {Function} [options.onError] - Called on each phase failure
 * @param {number} [options.maxRetries] - Max retries per phase (default: 3)
 * @returns {Promise<Object>} Updated state with all phase results
 */
export async function runPhaseLoop(runtime, workflow, state, options = {}) {
  const {
    onPhaseStart,
    onPhaseComplete,
    onError,
    maxRetries = DEFAULT_MAX_RETRIES
  } = options;

  if (!state.phases) {
    state.phases = {};
  }

  for (const phase of workflow.phases) {
    // FR-002: Pre-phase hook
    if (onPhaseStart) {
      onPhaseStart(phase);
    }
    activatePhase(phase, state);

    let result = null;
    let succeeded = false;

    // Determine execution strategy
    const isInteractive = INTERACTIVE_PHASES.has(phase);
    const agent = getAgentForPhase(phase);
    const context = buildContext(phase, workflow, state);

    // Retry loop (FR-004)
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (isInteractive) {
          // FR-005: Interactive phase relay
          result = await runInteractivePhase(runtime, phase, agent, context);
        } else {
          // Standard execution
          result = await runtime.executeTask(phase, agent, context);
        }

        if (isPhaseSuccess(result)) {
          succeeded = true;
          break;
        }

        // Failed — call error handler
        if (onError) {
          onError(phase, result.error || 'Phase failed');
        }

        // Update retry count
        state.phases[phase].retries = attempt + 1;

        // Add failure context for re-delegation
        context.previous_failure = {
          attempt: attempt + 1,
          error: result.error || 'Unknown error'
        };
      } catch (err) {
        // Runtime exception — treat as failure
        result = { status: 'failed', output: null, duration_ms: 0, error: err.message };
        if (onError) {
          onError(phase, err.message);
        }
        state.phases[phase].retries = attempt + 1;
        context.previous_failure = { attempt: attempt + 1, error: err.message };
      }
    }

    // FR-003: Post-phase hook
    if (!result) {
      result = { status: 'failed', output: null, duration_ms: 0, error: 'No result' };
    }

    if (!succeeded) {
      result.status = 'blocked';
    }

    updatePhaseState(state, phase, result);

    if (onPhaseComplete) {
      onPhaseComplete(phase, { status: state.phases[phase].status });
    }

    // Stop the loop if phase is blocked (FR-004)
    if (!succeeded) {
      break;
    }
  }

  return state;
}

/**
 * Run an interactive phase using presentInteractive in a loop.
 *
 * @param {Object} runtime - ProviderRuntime instance
 * @param {string} phase - Phase key
 * @param {string} agent - Agent name
 * @param {Object} context - Phase context
 * @returns {Promise<Object>} TaskResult
 */
async function runInteractivePhase(runtime, phase, agent, context) {
  const MAX_INTERACTIVE_TURNS = 50;
  let turns = 0;
  let lastResponse = null;

  while (turns < MAX_INTERACTIVE_TURNS) {
    const prompt = {
      phase,
      agent,
      context,
      turn: turns,
      previousResponse: lastResponse
    };

    const response = await runtime.presentInteractive(prompt);
    lastResponse = response;
    turns++;

    // Check for completion signal
    if (response === PHASE_COMPLETE_SIGNAL) {
      return { status: 'completed', output: lastResponse, duration_ms: turns * 10 };
    }
  }

  // Reached max turns — treat as completed (graceful exit)
  return { status: 'completed', output: lastResponse, duration_ms: turns * 10 };
}
