#!/usr/bin/env node
/**
 * iSDLC Constitution Validator - PreToolUse Hook
 * ===============================================
 * Intercepts phase completion declarations and validates constitutional compliance.
 *
 * Triggers when:
 * - Agent declares phase complete
 * - Gate validation is requested
 * - Artifact finalization occurs
 *
 * Version: 1.1.0
 */

const {
    debugLog,
    getTimestamp,
    normalizePhaseKey,
    outputSelfHealNotification,
    logHookEvent,
    addPendingEscalation,
    detectPhaseDelegation,
    loadIterationRequirements: loadIterationRequirementsFromCommon
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0090: Bridge-first delegation to core validators
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'validators.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Patterns indicating phase completion intent
 */
const COMPLETION_PATTERNS = [
    /phase\s+(complete|done|finished)/i,
    /ready\s+for\s+gate/i,
    /gate\s+validation/i,
    /submit\s+for\s+review/i,
    /finalize\s+artifacts/i,
    /declare\s+complete/i,
    /mark\s+as\s+complete/i,
    /phase\s+\d+\s+complete/i,
    /implementation\s+complete/i,
    /testing\s+complete/i,
    /requirements\s+complete/i
];

/**
 * Load iteration requirements (local fallback)
 */
function loadIterationRequirements() {
    const { getProjectRoot } = require('./lib/common.cjs');
    const projectRoot = getProjectRoot();
    const configPaths = [
        path.join(projectRoot, '.claude', 'hooks', 'config', 'iteration-requirements.json'),
        path.join(projectRoot, '.isdlc', 'config', 'iteration-requirements.json')
    ];

    for (const configPath of configPaths) {
        if (fs.existsSync(configPath)) {
            try {
                return JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
}

/**
 * Setup commands that should NEVER be blocked.
 * These run BEFORE workflows start or are configuration commands.
 */
const SETUP_COMMAND_KEYWORDS = [
    'discover',
    'constitution',
    'init',
    'setup',
    'configure',
    'configure-cloud',
    'new project',
    'project setup',
    'install',
    'status'
];

/**
 * Detect if this is a phase completion attempt
 * BUG-0008: Added detectPhaseDelegation() guard to prevent false positives
 * on delegation prompts from the phase-loop controller.
 */
function isPhaseCompletionAttempt(input) {
    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

    if (toolName === 'Task') {
        // BUG-0008: Phase-loop controller delegations are NOT completion attempts
        try {
            const delegation = detectPhaseDelegation(input);
            if (delegation.isDelegation) {
                debugLog(`Delegation detected (agent: ${delegation.agentName}, phase: ${delegation.targetPhase}), skipping completion check`);
                return false;
            }
        } catch (e) { /* fail-open: fall through to existing logic */ }

        const prompt = (toolInput.prompt || '');
        const description = (toolInput.description || '');
        const combined = (prompt + ' ' + description).toLowerCase();

        // FIRST: Check if this is a setup/configuration command - NEVER block these
        for (const setupKeyword of SETUP_COMMAND_KEYWORDS) {
            if (combined.includes(setupKeyword)) {
                debugLog(`Setup command detected (${setupKeyword}), skipping phase completion check`);
                return false;
            }
        }

        return COMPLETION_PATTERNS.some(pattern => pattern.test(combined));
    }

    return false;
}

/**
 * Check constitutional validation status
 */
function checkConstitutionalStatus(phaseState, phaseReq) {
    const constReq = phaseReq?.constitutional_validation;
    if (!constReq || !constReq.enabled) {
        return { satisfied: true, reason: 'not_required' };
    }

    const constState = phaseState?.constitutional_validation;

    // Not started
    if (!constState) {
        return {
            satisfied: false,
            reason: 'not_started',
            message: `Constitutional validation not started. Required articles: ${constReq.articles.join(', ')}`,
            action: 'START_VALIDATION'
        };
    }

    // In progress
    if (constState.status === 'iterating' || constState.status === 'pending' || !constState.completed) {
        return {
            satisfied: false,
            reason: 'in_progress',
            message: `Constitutional validation in progress (iteration ${constState.iterations_used || 0}/${constState.max_iterations}).`,
            action: 'CONTINUE_VALIDATION'
        };
    }

    // Escalated
    if (constState.status === 'escalated') {
        if (constState.escalation_approved) {
            return { satisfied: true, reason: 'escalation_approved' };
        }
        return {
            satisfied: false,
            reason: 'escalated_pending',
            message: 'Constitutional validation escalated. Human approval required.',
            unresolved: constState.unresolved_violations,
            action: 'AWAIT_APPROVAL'
        };
    }

    // Compliant
    if (constState.status === 'compliant' && constState.completed) {
        return { satisfied: true, reason: 'compliant' };
    }

    return {
        satisfied: false,
        reason: 'unknown',
        message: `Invalid constitutional validation status: ${constState.status}`,
        action: 'REVALIDATE'
    };
}

/**
 * Initialize constitutional validation tracking (mutates state in-place)
 */
function initializeConstitutionalValidation(state, currentPhase, phaseReq) {
    if (!state.phases) state.phases = {};
    if (!state.phases[currentPhase]) state.phases[currentPhase] = { status: 'in_progress' };

    const constReq = phaseReq.constitutional_validation;

    state.phases[currentPhase].constitutional_validation = {
        required: true,
        completed: false,
        status: 'pending',
        iterations_used: 0,
        max_iterations: constReq.max_iterations || 5,
        articles_required: constReq.articles,
        articles_checked: [],
        violations_found: [],
        history: [],
        started_at: getTimestamp()
    };

    return state;
}

/**
 * Get human-readable article descriptions
 */
function getArticleDescriptions() {
    return {
        'I': 'Specification Primacy - Code implements specifications exactly',
        'II': 'Test-First Development - Tests written before/with implementation',
        'III': 'Security by Design - Security considerations documented',
        'IV': 'Explicit Over Implicit - No vague requirements or assumptions',
        'V': 'Simplicity First - No over-engineering',
        'VI': 'Code Review Required - All code reviewed before gate passage',
        'VII': 'Artifact Traceability - All artifacts have IDs and links',
        'VIII': 'Documentation Currency - Docs match current code',
        'IX': 'Quality Gate Integrity - Gates validated, not skipped',
        'X': 'Fail-Safe Defaults - Secure defaults implemented',
        'XI': 'Integration Testing Integrity - Integration tests validate component interactions',
        'XII': 'Domain-Specific Compliance - Regulatory compliance addressed'
    };
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow'|'block', stopReason?: string, stderr?: string, stdout?: string, stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Only check phase completion attempts
        if (!isPhaseCompletionAttempt(input)) {
            return { decision: 'allow' };
        }

        debugLog('Phase completion attempt detected');

        // Load state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing');
            return { decision: 'allow' };
        }

        // Check if enforcement is enabled
        if (state.iteration_enforcement?.enabled === false) {
            return { decision: 'allow' };
        }

        // BUG-0005 (AC-03a): Prefer active_workflow.current_phase over top-level
        let currentPhase = state.active_workflow?.current_phase || state.current_phase;
        if (!currentPhase) {
            return { decision: 'allow' };
        }

        // Normalize phase key (self-healing: catches alias mismatches)
        let stderrMessages = '';
        const originalPhase = currentPhase;
        currentPhase = normalizePhaseKey(currentPhase);
        if (currentPhase !== originalPhase) {
            const msg = `[SELF-HEAL] constitution-validator: Phase key '${originalPhase}' normalized to '${currentPhase}'.`;
            stderrMessages += msg + '\n';
            logHookEvent('constitution-validator', 'self-heal', { reason: `Phase key '${originalPhase}' normalized to '${currentPhase}'.` });
        }

        // Load requirements (prefer ctx.requirements, fallback to local loader)
        const requirements = ctx.requirements || loadIterationRequirementsFromCommon() || loadIterationRequirements();
        const phaseReq = requirements?.phase_requirements?.[currentPhase];

        if (!phaseReq?.constitutional_validation?.enabled) {
            // Self-heal notification if this is due to missing requirements
            if (!phaseReq) {
                const msg = `[SELF-HEAL] constitution-validator: No requirements for phase '${currentPhase}'. Allowing completion.`;
                stderrMessages += msg + '\n';
                logHookEvent('constitution-validator', 'self-heal', { reason: `No requirements for phase '${currentPhase}'. Allowing completion.` });
            }
            debugLog('Constitutional validation not enabled for phase:', currentPhase);
            return { decision: 'allow', stderr: stderrMessages.trim() || undefined };
        }

        // Get phase state
        const phaseState = state.phases?.[currentPhase];

        // Check constitutional status
        const status = checkConstitutionalStatus(phaseState, phaseReq);

        if (status.satisfied) {
            debugLog('Constitutional validation satisfied');
            return { decision: 'allow', stderr: stderrMessages.trim() || undefined };
        }

        let stateModified = false;

        // Initialize tracking if not started
        if (status.reason === 'not_started') {
            initializeConstitutionalValidation(state, currentPhase, phaseReq);
            stateModified = true;
        }

        // Build article descriptions with check instructions
        const articleDescriptions = getArticleDescriptions();
        const requiredArticles = phaseReq.constitutional_validation.articles;
        const articleChecklist = requiredArticles
            .map(a => `   - Article ${a} (${(articleDescriptions[a] || 'Unknown').split(' - ')[0]}): ${(articleDescriptions[a] || 'Unknown').split(' - ')[1] || 'Check compliance'}`)
            .join('\n');

        // Get iteration info
        const constState = phaseState?.constitutional_validation;
        const iterationsUsed = constState?.iterations_used || 0;
        const maxIterations = phaseReq.constitutional_validation.max_iterations;
        const remaining = maxIterations - iterationsUsed;

        // Block completion until constitutional validation is done
        const stopReason = `PHASE COMPLETION BLOCKED: Constitutional validation required.

Status: ${status.reason}

MANDATORY: You are in a constitutional validation loop. You MUST:
1. Read the constitution at docs/isdlc/constitution.md
2. For each article below, check your phase artifacts for compliance:
${articleChecklist}
3. If violations found: fix the artifacts, then re-validate
4. Update state.json with results:
   {
     "phases": { "${currentPhase}": { "constitutional_validation": {
       "status": "compliant", "completed": true,
       "articles_checked": ${JSON.stringify(requiredArticles)},
       "iterations_used": N
     }}}
   }
5. Then declare phase complete again.

DO NOT skip articles or mark compliant without actually checking.
Iteration ${iterationsUsed}/${maxIterations} — you have ${remaining} attempts remaining.`;

        // Write escalation to state in memory
        addPendingEscalation(state, {
            type: 'constitution_blocked',
            hook: 'constitution-validator',
            phase: currentPhase,
            detail: stopReason,
            timestamp: getTimestamp()
        });

        return {
            decision: 'block',
            stopReason,
            stderr: stderrMessages.trim() || undefined,
            stateModified: true
        };

    } catch (error) {
        debugLog('Error in constitution-validator:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, writeState: writeStateFn, loadManifest, loadIterationRequirements: loadReqs, loadWorkflowDefinitions, outputBlockResponse } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) { process.exit(0); }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadReqs();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) console.error(result.stderr);
            if (result.stdout) console.log(result.stdout);
            if (result.decision === 'block' && result.stopReason) {
                outputBlockResponse(result.stopReason);
            }
            if (result.stateModified && state) {
                writeStateFn(state);
            }
            process.exit(0);
        } catch (e) { process.exit(0); }
    })();
}
