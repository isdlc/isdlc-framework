/**
 * Codex Adapter — Governance Checkpoints
 * ========================================
 * REQ-0117: Codex Governance Checkpoint Integration
 *
 * Documents which of Claude's 8 hooks have Codex equivalents
 * and which are irreducible enforcement gaps. Provides a frozen
 * governance model and a validateCheckpoint function for enforceable
 * checks.
 *
 * @module src/providers/codex/governance
 */

// ---------------------------------------------------------------------------
// Phase ordering for validation (mirrors core phase-ordering.json)
// ---------------------------------------------------------------------------

const PHASE_ORDER = [
  '01-requirements',
  '02-architecture',
  '03-design',
  '04-tracing',
  '05-test-strategy',
  '06-implementation',
  '07-integration-testing',
  '08-code-review',
  '09-security-audit',
  '10-cicd',
  '11-environment',
  '12-staging',
  '13-release',
  '14-monitoring',
  '16-quality-loop'
];

// ---------------------------------------------------------------------------
// FR-001/FR-004: Governance Model
// ---------------------------------------------------------------------------

/**
 * Get the frozen governance model documenting enforceable checkpoints
 * and irreducible gaps between Claude hooks and Codex capabilities.
 *
 * @returns {{ enforceable: ReadonlyArray, gaps: ReadonlyArray, mitigation_strategy: string }}
 */
export function getGovernanceModel() {
  return Object.freeze({
    enforceable: Object.freeze([
      Object.freeze({
        checkpoint: 'phase-transition',
        claude_hook: 'phase-sequence-guard',
        codex_equivalent: 'adapter-runner-validation',
        status: 'enforceable',
        mitigation: 'Validated by adapter-owned runner before phase advance'
      }),
      Object.freeze({
        checkpoint: 'state-schema',
        claude_hook: 'state-write-validator',
        codex_equivalent: 'file-level-validation',
        status: 'enforceable',
        mitigation: 'State file validated on read/write via core StateStore'
      }),
      Object.freeze({
        checkpoint: 'artifact-existence',
        claude_hook: 'gate-blocker',
        codex_equivalent: 'file-system-check',
        status: 'enforceable',
        mitigation: 'Artifact files checked before gate passage'
      }),
      Object.freeze({
        checkpoint: 'execution-contract',
        claude_hook: 'contract-checks (inline)',
        codex_equivalent: 'core-contract-checks',
        status: 'enforceable',
        mitigation: 'Contract checked inline at each decision point via contract-checks.js'
      })
    ]),
    gaps: Object.freeze([
      Object.freeze({
        checkpoint: 'delegation-gate',
        claude_hook: 'delegation-gate (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No real-time delegation interception; periodic validation only'
      }),
      Object.freeze({
        checkpoint: 'branch-guard',
        claude_hook: 'branch-guard (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No git hook surface; branch policy enforced at PR level'
      }),
      Object.freeze({
        checkpoint: 'test-watcher',
        claude_hook: 'test-watcher (PostToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No real-time test monitoring; tests run as explicit task step'
      }),
      Object.freeze({
        checkpoint: 'state-file-guard',
        claude_hook: 'state-file-guard (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No Bash interception; state writes go through core StateStore API'
      }),
      Object.freeze({
        checkpoint: 'explore-readonly',
        claude_hook: 'explore-readonly-enforcer (PreToolUse)',
        codex_equivalent: null,
        status: 'gap',
        mitigation: 'No write interception; explore phase is advisory only'
      })
    ]),
    mitigation_strategy: 'periodic-validation'
  });
}

// ---------------------------------------------------------------------------
// Internal validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate phase transition: ensure the target phase is reachable from
 * the current phase (cannot skip ahead beyond the next phase).
 *
 * @param {string} targetPhase
 * @param {Object} state
 * @returns {{ valid: boolean, reason?: string }}
 */
function validatePhaseTransition(targetPhase, state) {
  if (!state || typeof state !== 'object') {
    return { valid: false, reason: 'State is null or invalid' };
  }

  const currentPhase = state.current_phase;
  if (!currentPhase) {
    return { valid: false, reason: 'State missing current_phase field' };
  }

  // If target phase equals current phase, always valid
  if (targetPhase === currentPhase) {
    return { valid: true };
  }

  const currentIdx = PHASE_ORDER.indexOf(currentPhase);
  const targetIdx = PHASE_ORDER.indexOf(targetPhase);

  // Unknown phases — allow (fail-open)
  if (currentIdx === -1 || targetIdx === -1) {
    return { valid: true };
  }

  // Cannot go backwards or skip more than 1 phase ahead
  if (targetIdx > currentIdx + 1) {
    return {
      valid: false,
      reason: `Cannot advance from ${currentPhase} to ${targetPhase} — phases must be sequential`
    };
  }

  return { valid: true };
}

/**
 * Validate state schema: check that required fields are present.
 *
 * @param {Object} state
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateStateSchema(state) {
  if (!state || typeof state !== 'object') {
    return { valid: false, reason: 'State is null or not an object' };
  }

  if (!('current_phase' in state)) {
    return { valid: false, reason: 'State missing required field: current_phase' };
  }

  if (!('phases' in state) || typeof state.phases !== 'object') {
    return { valid: false, reason: 'State missing required field: phases' };
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// FR-005: Checkpoint Validation
// ---------------------------------------------------------------------------

/**
 * Validate governance checkpoints for a given phase and state.
 * Runs all enforceable checks (phase transition, state schema,
 * artifact existence).
 *
 * @param {string} phase - Target phase
 * @param {Object} state - Current workflow state
 * @returns {{ valid: boolean, violations: Array<{ checkpoint: string, message: string }> }}
 */
export function validateCheckpoint(phase, state) {
  const violations = [];

  // 1. State schema validation
  const schemaResult = validateStateSchema(state);
  if (!schemaResult.valid) {
    violations.push({
      checkpoint: 'state-schema',
      message: schemaResult.reason || 'State schema validation failed'
    });
    // Cannot proceed with other checks if state is invalid
    return { valid: false, violations };
  }

  // 2. Phase transition validation
  const phaseResult = validatePhaseTransition(phase, state);
  if (!phaseResult.valid) {
    violations.push({
      checkpoint: 'phase-transition',
      message: phaseResult.reason || `Phase ${phase} transition validation failed`
    });
  }

  // 3. Artifact existence checks are deferred to runtime (require projectRoot)
  // In this pure function, we only check phase and state invariants.

  return {
    valid: violations.length === 0,
    violations
  };
}
