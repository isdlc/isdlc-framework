/**
 * iSDLC Gate Logic - Shared Validation
 * =====================================
 * Core validation logic for gate advancement.
 * Shared between Claude Code hooks and Antigravity skills.
 */

const fs = require('fs');
const path = require('path');
const {
    debugLog,
    getTimestamp,
    validateSchema,
    normalizePhaseKey,
    diagnoseBlockCause,
    logHookEvent,
    addPendingEscalation,
    detectPhaseDelegation,
    loadIterationRequirements: loadIterationRequirementsFromCommon,
    loadWorkflowDefinitions: loadWorkflowDefinitionsFromCommon,
    getProjectRoot,
    loadManifest,
    getHooksConfigDir
} = require('./common.cjs');
const { resolveProfileOverrides } = require('./profile-loader.cjs');

/**
 * Deep merge two objects. Overrides replace base values.
 */
function mergeRequirements(base, overrides) {
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

function isGateAdvancementAttempt(input) {
    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

    if (toolName === 'Task') {
        try {
            const delegation = detectPhaseDelegation(input);
            if (delegation.isDelegation) return false;
        } catch (e) { /* fail-open */ }

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

function checkTestIterationRequirement(phaseState, phaseRequirements) {
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

function checkConstitutionalRequirement(phaseState, phaseRequirements) {
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

function checkElicitationRequirement(phaseState, phaseRequirements) {
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

function checkAgentDelegationRequirement(phaseState, phaseRequirements, state, currentPhase, manifest) {
    const delegationReq = phaseRequirements.agent_delegation_validation;
    if (!delegationReq || !delegationReq.enabled) return { satisfied: true, reason: 'not_required' };

    const resolvedManifest = manifest || loadManifest();
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

function loadArtifactPaths() {
    const projectRoot = getProjectRoot();
    const configPath = path.join(getHooksConfigDir(projectRoot), 'artifact-paths.json');

    if (fs.existsSync(configPath)) {
        try { return JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) { debugLog('Error loading artifact-paths.json:', e.message); }
    }
    return null;
}

function getArtifactPathsForPhase(phaseKey) {
    const config = loadArtifactPaths();
    const paths = config?.phases?.[phaseKey]?.paths;
    return Array.isArray(paths) && paths.length > 0 ? paths : null;
}

function resolveArtifactPaths(paths, state) {
    const artifactFolder = state?.active_workflow?.artifact_folder;
    return paths.map(p => p.replace(/\{artifact_folder\}/g, artifactFolder || '')).filter(p => !p.includes('{artifact_folder}'));
}

function checkArtifactPresenceRequirement(phaseState, phaseRequirements, state, currentPhase) {
    const artifactReq = phaseRequirements.artifact_validation;
    if (!artifactReq || !artifactReq.enabled) return { satisfied: true, reason: 'not_required' };

    const paths = getArtifactPathsForPhase(currentPhase) || artifactReq.paths;
    if (!paths || paths.length === 0) return { satisfied: true, reason: 'no_paths_configured' };

    const resolvedPaths = resolveArtifactPaths(paths, state);
    const projectRoot = getProjectRoot();
    const missingArtifacts = [];

    const pathsByDir = {};
    for (const p of resolvedPaths) {
        const dir = path.dirname(p);
        if (!pathsByDir[dir]) pathsByDir[dir] = [];
        pathsByDir[dir].push(p);
    }

    for (const [dir, dirPaths] of Object.entries(pathsByDir)) {
        if (!dirPaths.some(p => fs.existsSync(path.join(projectRoot, p)))) {
            missingArtifacts.push(dirPaths[0]);
        }
    }

    if (missingArtifacts.length > 0) {
        return { satisfied: false, reason: `Required artifact(s) missing: ${missingArtifacts.join(', ')}`, action_required: 'CREATE_ARTIFACTS', missing_artifacts: missingArtifacts };
    }

    return { satisfied: true, reason: 'all_present' };
}

function check(ctx) {
    try {
        const { input, state } = ctx;
        if (!input || !isGateAdvancementAttempt(input)) return { decision: 'allow' };
        if (!state || state.iteration_enforcement?.enabled === false) return { decision: 'allow' };

        const requirements = ctx.requirements || loadIterationRequirementsFromCommon();
        if (!requirements) return { decision: 'allow' };

        let currentPhase = state.active_workflow?.current_phase || state.current_phase;
        if (!currentPhase) return { decision: 'allow' };

        currentPhase = normalizePhaseKey(currentPhase);
        let phaseReq = requirements.phase_requirements[currentPhase];
        if (!phaseReq) return { decision: 'allow' };

        // Profile merge layer (REQ-0049): apply profile overrides before workflow overrides
        const activeWorkflow = state.active_workflow;
        try {
            const profileName = activeWorkflow?.profile || state?.default_profile || 'standard';
            const profileOverrides = resolveProfileOverrides(profileName, currentPhase);
            if (profileOverrides) {
                phaseReq = mergeRequirements(phaseReq, profileOverrides);
            }
        } catch (e) {
            debugLog('Profile merge failed (continuing with base requirements):', e.message);
        }

        // Workflow overrides (existing behavior, unchanged)
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
            { requirement: 'agent_delegation', ...checkAgentDelegationRequirement(phaseState, phaseReq, state, currentPhase, ctx.manifest) },
            { requirement: 'artifact_presence', ...checkArtifactPresenceRequirement(phaseState, phaseReq, state, currentPhase) }
        ].filter(c => !c.satisfied);

        let stderrMessages = '';
        const genuineChecks = [];
        for (const oneCheck of checks) {
            const diagnosis = diagnoseBlockCause('gate-blocker', currentPhase, oneCheck.requirement, state);
            if (diagnosis.cause === 'infrastructure' || diagnosis.cause === 'stale') {
                stderrMessages += `[SELF-HEAL] gate-blocker: ${diagnosis.detail}.\n`;
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
            blocked_at: getTimestamp(),
            blocking_requirements: checks.map(c => c.requirement),
            details: checks
        };

        addPendingEscalation(state, { type: 'gate_blocked', hook: 'gate-blocker', phase: currentPhase, detail: stopReason, timestamp: getTimestamp() });

        return { decision: 'block', stopReason, stderr: stderrMessages.trim() || undefined, stateModified: true };

    } catch (error) {
        debugLog('Error in gate-logic:', error.message);
        return { decision: 'allow' };
    }
}

module.exports = {
    check,
    isGateAdvancementAttempt,
    checkTestIterationRequirement,
    checkConstitutionalRequirement,
    checkElicitationRequirement,
    checkAgentDelegationRequirement,
    checkArtifactPresenceRequirement
};
