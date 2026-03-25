/**
 * Gate Logic — Core gate validation
 * ===================================
 * Core validation logic for gate advancement.
 *
 * Extracted from src/claude/hooks/lib/gate-logic.cjs (REQ-0081).
 *
 * @module src/core/validators/gate-logic
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePhaseKey } from '../config/phase-ids.js';

/**
 * Deep merge two objects. Overrides replace base values.
 * @param {object} base
 * @param {object} overrides
 * @returns {object}
 */
export function mergeRequirements(base, overrides) {
  if (!base) return overrides;
  if (!overrides) return base;

  const merged = JSON.parse(JSON.stringify(base));

  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      merged[key] = mergeRequirements(merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

const SETUP_COMMAND_KEYWORDS = [
  'discover', 'constitution', 'init', 'setup', 'configure',
  'configure-cloud', 'new project', 'project setup', 'install', 'status'
];

const EXEMPT_ACTIONS = new Set(['analyze', 'add']);

/**
 * Check if the given hook input is a gate advancement attempt.
 * @param {object} input - Hook input object
 * @param {object} [helpers] - Optional helper functions (detectPhaseDelegation)
 * @returns {boolean}
 */
export function isGateAdvancementAttempt(input, helpers) {
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  if (toolName === 'Task') {
    try {
      if (helpers && helpers.detectPhaseDelegation) {
        const delegation = helpers.detectPhaseDelegation(input);
        if (delegation.isDelegation) return false;
      }
    } catch { /* fail-open */ }

    const combined = ((toolInput.prompt || '') + ' ' + (toolInput.description || '')).toLowerCase();

    for (const setupKeyword of SETUP_COMMAND_KEYWORDS) {
      if (combined.includes(setupKeyword)) return false;
    }

    const subagentType = (toolInput.subagent_type || '').toLowerCase();
    if (subagentType.includes('orchestrator') || subagentType === 'sdlc-orchestrator') {
      const gateKeywords = ['advance', 'gate', 'next phase', 'proceed', 'move to phase', 'progress to'];
      for (const keyword of gateKeywords) {
        if (combined.includes(keyword)) return true;
      }
    }
  }

  if (toolName === 'Skill') {
    const skill = (toolInput.skill || '').toLowerCase();
    const args = (toolInput.args || '').toLowerCase();

    for (const setupKeyword of SETUP_COMMAND_KEYWORDS) {
      if (args.includes(setupKeyword)) return false;
    }

    const action = (args.match(/^(?:--?\w+\s+)*(\w+)/) || [])[1] || '';
    if (EXEMPT_ACTIONS.has(action)) return false;

    if (skill === 'isdlc' && (args.includes('advance') || args.includes('gate'))) return true;
  }

  return false;
}

/**
 * Check test iteration requirement.
 * @param {object} phaseState
 * @param {object} phaseRequirements
 * @returns {{ satisfied: boolean, reason: string, action_required?: string }}
 */
export function checkTestIterationRequirement(phaseState, phaseRequirements) {
  const testReq = phaseRequirements.test_iteration;
  if (!testReq || !testReq.enabled) return { satisfied: true, reason: 'not_required' };

  const iterState = phaseState?.iteration_requirements?.test_iteration;
  if (!iterState) return { satisfied: false, reason: 'Test iteration not started. Run tests and iterate until passing.', action_required: 'RUN_TESTS' };

  if (!iterState.completed) {
    if (iterState.last_test_result === 'failed') {
      return {
        satisfied: false,
        reason: `Test iteration incomplete. ${iterState.current_iteration}/${iterState.max_iterations} iterations used. Last result: FAILED.`,
        action_required: 'CONTINUE_ITERATION'
      };
    }
    return { satisfied: false, reason: 'Test iteration not completed.', action_required: 'RUN_TESTS' };
  }

  if (iterState.status === 'escalated') {
    if (iterState.escalation_approved) return { satisfied: true, reason: 'escalation_approved' };
    return { satisfied: false, reason: 'Test iteration escalated but not approved. Human approval required.', action_required: 'HUMAN_APPROVAL' };
  }

  return { satisfied: true, reason: 'tests_passing' };
}

/**
 * Check constitutional validation requirement.
 * @param {object} phaseState
 * @param {object} phaseRequirements
 * @returns {{ satisfied: boolean, reason: string, action_required?: string }}
 */
export function checkConstitutionalRequirement(phaseState, phaseRequirements) {
  const constReq = phaseRequirements.constitutional_validation;
  if (!constReq || !constReq.enabled) return { satisfied: true, reason: 'not_required' };

  const constState = phaseState?.constitutional_validation;
  if (!constState) return { satisfied: false, reason: 'Constitutional validation not started. Validate artifacts against constitution.', action_required: 'RUN_CONSTITUTIONAL_VALIDATION' };

  if (!constState.completed) {
    return {
      satisfied: false,
      reason: `Constitutional validation incomplete. Status: ${constState.status}. ${constState.iterations_used || 0}/${constState.max_iterations} iterations.`,
      action_required: 'CONTINUE_CONSTITUTIONAL_ITERATION'
    };
  }

  if (constState.status === 'escalated') {
    if (constState.escalation_approved) return { satisfied: true, reason: 'escalation_approved' };
    return { satisfied: false, reason: 'Constitutional validation escalated. Human decision required.', action_required: 'HUMAN_DECISION' };
  }

  if (constState.status !== 'compliant') {
    return { satisfied: false, reason: `Constitutional validation status: ${constState.status}. Must be 'compliant'.`, action_required: 'FIX_VIOLATIONS' };
  }

  return { satisfied: true, reason: 'compliant' };
}

/**
 * Check interactive elicitation requirement.
 * @param {object} phaseState
 * @param {object} phaseRequirements
 * @returns {{ satisfied: boolean, reason: string, action_required?: string }}
 */
export function checkElicitationRequirement(phaseState, phaseRequirements) {
  const elicitReq = phaseRequirements.interactive_elicitation;
  if (!elicitReq || !elicitReq.enabled) return { satisfied: true, reason: 'not_required' };

  const elicitState = phaseState?.iteration_requirements?.interactive_elicitation;
  if (!elicitState) return { satisfied: false, reason: 'Interactive elicitation not started. Use A/R/C menu pattern with user.', action_required: 'START_ELICITATION' };

  if (!elicitState.completed) {
    return {
      satisfied: false,
      reason: `Interactive elicitation incomplete. ${elicitState.menu_interactions || 0} menu interactions recorded.`,
      action_required: 'CONTINUE_ELICITATION'
    };
  }

  return { satisfied: true, reason: 'elicitation_complete' };
}

/**
 * Check agent delegation requirement.
 * @param {object} phaseState
 * @param {object} phaseRequirements
 * @param {object} state
 * @param {string} currentPhase
 * @param {object} [manifest]
 * @param {object} [helpers] - Optional helper functions (loadManifest)
 * @returns {{ satisfied: boolean, reason: string, action_required?: string, expected_agent?: string }}
 */
export function checkAgentDelegationRequirement(phaseState, phaseRequirements, state, currentPhase, manifest, helpers) {
  const delegationReq = phaseRequirements.agent_delegation_validation;
  if (!delegationReq || !delegationReq.enabled) return { satisfied: true, reason: 'not_required' };

  const resolvedManifest = manifest || (helpers && helpers.loadManifest ? helpers.loadManifest() : null);
  if (!resolvedManifest || !resolvedManifest.ownership) return { satisfied: true, reason: 'no_manifest' };

  let expectedAgent = null;
  for (const [agent, info] of Object.entries(resolvedManifest.ownership)) {
    if (info.phase === currentPhase) { expectedAgent = agent; break; }
  }

  if (!expectedAgent) return { satisfied: true, reason: 'no_agent_for_phase' };

  const log = state.skill_usage_log || [];
  if (log.some(e => e.agent === expectedAgent && e.agent_phase === currentPhase)) return { satisfied: true, reason: 'agent_delegated' };

  return {
    satisfied: false,
    reason: `Phase agent '${expectedAgent}' was not delegated to during phase '${currentPhase}'.`,
    action_required: 'DELEGATE_TO_PHASE_AGENT',
    expected_agent: expectedAgent
  };
}

/**
 * Load artifact paths configuration.
 * @param {object} [helpers] - Optional { getProjectRoot, getHooksConfigDir }
 * @returns {object|null}
 */
export function loadArtifactPaths(helpers) {
  try {
    const projectRoot = helpers && helpers.getProjectRoot ? helpers.getProjectRoot() : process.cwd();
    const configDir = helpers && helpers.getHooksConfigDir ? helpers.getHooksConfigDir(projectRoot) : join(projectRoot, '.claude', 'hooks', 'config');
    const configPath = join(configDir, 'artifact-paths.json');

    if (existsSync(configPath)) {
      return JSON.parse(readFileSync(configPath, 'utf8'));
    }
  } catch { /* silent */ }
  return null;
}

/**
 * Get artifact paths for a specific phase.
 * @param {string} phaseKey
 * @param {object} [helpers]
 * @returns {string[]|null}
 */
export function getArtifactPathsForPhase(phaseKey, helpers) {
  const config = loadArtifactPaths(helpers);
  const paths = config?.phases?.[phaseKey]?.paths;
  return Array.isArray(paths) && paths.length > 0 ? paths : null;
}

/**
 * Resolve artifact paths by replacing {artifact_folder} placeholders.
 * @param {string[]} paths
 * @param {object} state
 * @returns {string[]}
 */
export function resolveArtifactPaths(paths, state) {
  const artifactFolder = state?.active_workflow?.artifact_folder;
  return paths
    .map(p => p.replace(/\{artifact_folder\}/g, artifactFolder || ''))
    .filter(p => !p.includes('{artifact_folder}'));
}

/**
 * Check artifact presence requirement.
 * @param {object} phaseState
 * @param {object} phaseRequirements
 * @param {object} state
 * @param {string} currentPhase
 * @param {object} [helpers] - Optional { getProjectRoot }
 * @returns {{ satisfied: boolean, reason: string, action_required?: string, missing_artifacts?: string[] }}
 */
export function checkArtifactPresenceRequirement(phaseState, phaseRequirements, state, currentPhase, helpers) {
  const artifactReq = phaseRequirements.artifact_validation;
  if (!artifactReq || !artifactReq.enabled) return { satisfied: true, reason: 'not_required' };

  const paths = getArtifactPathsForPhase(currentPhase, helpers) || artifactReq.paths;
  if (!paths || paths.length === 0) return { satisfied: true, reason: 'no_paths_configured' };

  const resolvedPaths = resolveArtifactPaths(paths, state);
  const projectRoot = helpers && helpers.getProjectRoot ? helpers.getProjectRoot() : process.cwd();
  const missingArtifacts = [];

  const pathsByDir = {};
  for (const p of resolvedPaths) {
    const dir = join(p, '..').replace(/\\/g, '/');
    if (!pathsByDir[dir]) pathsByDir[dir] = [];
    pathsByDir[dir].push(p);
  }

  for (const [, dirPaths] of Object.entries(pathsByDir)) {
    if (!dirPaths.some(p => existsSync(join(projectRoot, p)))) {
      missingArtifacts.push(dirPaths[0]);
    }
  }

  if (missingArtifacts.length > 0) {
    return { satisfied: false, reason: `Required artifact(s) missing: ${missingArtifacts.join(', ')}`, action_required: 'CREATE_ARTIFACTS', missing_artifacts: missingArtifacts };
  }

  return { satisfied: true, reason: 'all_present' };
}

/**
 * Check traceability requirement using core validators.
 * BUG-0057 (FR-008, AC-008-01..05)
 *
 * @param {object} phaseState - Current phase state
 * @param {object} phaseRequirements - Phase requirements from iteration-requirements.json
 * @param {object} [inputs] - Artifact contents for validation
 * @returns {Promise<{ satisfied: boolean, reason: string, details?: object }>}
 */
export async function checkTraceabilityRequirement(phaseState, phaseRequirements, inputs) {
  const traceReq = phaseRequirements?.traceability_validation;
  if (!traceReq || !traceReq.enabled) {
    return { satisfied: true, reason: 'not_required' };
  }

  try {
    const safeInputs = inputs || {};
    const checks = traceReq.checks || [];
    const failures = [];

    // Run requested checks directly (not via validatePhase, which uses phase mapping)
    if (checks.includes('requirements_to_tests')) {
      const { validateRequirementsToTests } = await import('./traceability-validator.js');
      const result = validateRequirementsToTests(
        safeInputs.requirementsSpec || null,
        safeInputs.testStrategy || null
      );
      if (!result.pass) {
        const orphanInfo = result.details?.orphan_acs?.length > 0
          ? ` Orphan ACs: ${result.details.orphan_acs.join(', ')}`
          : '';
        failures.push(`requirements_to_tests: ${result.failure_reason}${orphanInfo}`);
      }
    }

    if (checks.includes('test_implementation')) {
      const { validateTestImplementation } = await import('./test-implementation-validator.js');
      const result = validateTestImplementation(
        safeInputs.testStrategy || null,
        safeInputs.testFiles || null,
        safeInputs.modifiedFiles || null
      );
      if (!result.pass) {
        failures.push(`test_implementation: ${result.failure_reason}`);
      }
    }

    if (checks.includes('test_execution')) {
      const { validateTestExecution } = await import('./test-execution-validator.js');
      const result = validateTestExecution(
        safeInputs.testStrategy || null,
        safeInputs.testExecutionOutput || null
      );
      if (!result.pass) {
        failures.push(`test_execution: ${result.failure_reason}`);
      }
    }

    if (checks.includes('coverage_presence')) {
      const { validateCoveragePresence } = await import('./coverage-presence-validator.js');
      const result = validateCoveragePresence(
        safeInputs.testExecutionOutput || null,
        { required: safeInputs.coverageRequired !== false }
      );
      if (!result.pass) {
        failures.push(`coverage_presence: ${result.failure_reason}`);
      }
    }

    if (failures.length === 0) {
      return { satisfied: true, reason: 'traceability_verified' };
    }

    return {
      satisfied: false,
      reason: `Traceability validation failed: ${failures.join('; ')}`,
      action_required: 'FIX_TRACEABILITY',
      details: { failures }
    };
  } catch (err) {
    // Fail-open on validator code errors (ADR-004)
    return {
      satisfied: true,
      reason: `validator_error: ${err.message}`
    };
  }
}

/**
 * Main gate check function.
 * @param {object} ctx - { input, state, requirements, manifest, helpers }
 * @returns {{ decision: string, stopReason?: string, stderr?: string, stateModified?: boolean }}
 */
export function check(ctx) {
  try {
    const { input, state, helpers } = ctx;
    if (!input || !isGateAdvancementAttempt(input, helpers)) return { decision: 'allow' };
    if (!state || state.iteration_enforcement?.enabled === false) return { decision: 'allow' };

    const requirements = ctx.requirements || (helpers && helpers.loadIterationRequirements ? helpers.loadIterationRequirements() : null);
    if (!requirements) return { decision: 'allow' };

    let currentPhase = state.active_workflow?.current_phase || state.current_phase;
    if (!currentPhase) return { decision: 'allow' };

    currentPhase = normalizePhaseKey(currentPhase);
    let phaseReq = requirements.phase_requirements[currentPhase];
    if (!phaseReq) return { decision: 'allow' };

    // Profile merge layer
    const activeWorkflow = state.active_workflow;
    try {
      const profileName = activeWorkflow?.profile || state?.default_profile || 'standard';
      if (helpers && helpers.resolveProfileOverrides) {
        const profileOverrides = helpers.resolveProfileOverrides(profileName, currentPhase);
        if (profileOverrides) {
          phaseReq = mergeRequirements(phaseReq, profileOverrides);
        }
      }
    } catch { /* continue with base requirements */ }

    // Workflow overrides
    if (activeWorkflow && requirements.workflow_overrides?.[activeWorkflow.type]?.[currentPhase]) {
      phaseReq = mergeRequirements(phaseReq, requirements.workflow_overrides[activeWorkflow.type][currentPhase]);
    }

    const supervisedReview = state.active_workflow?.supervised_review;
    if (supervisedReview?.status === 'reviewing' || supervisedReview?.status === 'rejected') {
      return { decision: 'block', stopReason: `GATE BLOCKED: Supervised review ${supervisedReview.status}.` };
    }

    const phaseState = state.phases?.[currentPhase] || {};
    const checks = [
      { requirement: 'test_iteration', ...checkTestIterationRequirement(phaseState, phaseReq) },
      { requirement: 'constitutional_validation', ...checkConstitutionalRequirement(phaseState, phaseReq) },
      { requirement: 'interactive_elicitation', ...checkElicitationRequirement(phaseState, phaseReq) },
      { requirement: 'agent_delegation', ...checkAgentDelegationRequirement(phaseState, phaseReq, state, currentPhase, ctx.manifest, helpers) },
      { requirement: 'artifact_presence', ...checkArtifactPresenceRequirement(phaseState, phaseReq, state, currentPhase, helpers) }
    ].filter(c => !c.satisfied);

    let stderrMessages = '';
    const genuineChecks = [];
    for (const oneCheck of checks) {
      if (helpers && helpers.diagnoseBlockCause) {
        const diagnosis = helpers.diagnoseBlockCause('gate-blocker', currentPhase, oneCheck.requirement, state);
        if (diagnosis.cause === 'infrastructure' || diagnosis.cause === 'stale') {
          stderrMessages += `[SELF-HEAL] gate-blocker: ${diagnosis.detail}.\n`;
        } else {
          genuineChecks.push(oneCheck);
        }
      } else {
        genuineChecks.push(oneCheck);
      }
    }

    if (genuineChecks.length === 0) return { decision: 'allow', stderr: stderrMessages.trim() || undefined };

    const blockingReqs = genuineChecks.map(c => c.requirement).join(', ');
    const details = genuineChecks.map(c => `\n- ${c.requirement}: ${c.reason}`).join('');
    const stopReason = `GATE BLOCKED: Iteration requirements not satisfied for phase '${currentPhase}'.\n\nBlocking requirements: ${blockingReqs}${details}`;

    if (!state.phases) state.phases = {};
    if (!state.phases[currentPhase]) state.phases[currentPhase] = {};
    state.phases[currentPhase].gate_validation = {
      status: 'blocked',
      blocked_at: helpers && helpers.getTimestamp ? helpers.getTimestamp() : new Date().toISOString(),
      blocking_requirements: checks.map(c => c.requirement),
      details: checks
    };

    if (helpers && helpers.addPendingEscalation) {
      helpers.addPendingEscalation(state, { type: 'gate_blocked', hook: 'gate-blocker', phase: currentPhase, detail: stopReason, timestamp: helpers.getTimestamp ? helpers.getTimestamp() : new Date().toISOString() });
    }

    return { decision: 'block', stopReason, stderr: stderrMessages.trim() || undefined, stateModified: true };

  } catch {
    return { decision: 'allow' };
  }
}
