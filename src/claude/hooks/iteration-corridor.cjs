#!/usr/bin/env node
/**
 * iSDLC Iteration Corridor - PreToolUse Hook
 * ============================================
 * Restricts agent actions during active iteration states.
 *
 * When tests are failing or constitutional validation is pending,
 * agents can only perform actions related to fixing the issue.
 * Blocks delegation (Task) and gate advancement (Skill) attempts
 * that would let the agent escape the iteration loop.
 *
 * Corridors:
 * - TEST_CORRIDOR: Tests failing, agent must fix code and re-run tests
 * - CONST_CORRIDOR: Tests passed, agent must validate constitution
 * - NO_CORRIDOR: No active iteration, all actions allowed
 *
 * Version: 1.2.0
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

// REQ-0091: Bridge-first delegation to core workflow
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'workflow.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Setup commands that should NEVER be blocked.
 * Same bypass list as other hooks for consistency.
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
 * REQ-0023: Three-verb model actions that run outside workflow machinery.
 * These verbs do not write state.json or create branches; they must never
 * be blocked by gate or iteration corridor checks.
 * Matches skill-delegation-enforcer.cjs EXEMPT_ACTIONS.
 * BUG-0031: Added to prevent false positives when description text contains "gate".
 */
const EXEMPT_ACTIONS = new Set(['analyze', 'add']);

/**
 * Patterns that indicate an agent is trying to advance, delegate, or escape iteration.
 * Used to block Task tool calls that would let the agent avoid fixing the issue.
 */
const ADVANCE_PATTERNS = [
    /advance/i,
    /gate/i,
    /next\s+phase/i,
    /proceed/i,
    /move\s+to\s+phase/i,
    /progress\s+to/i,
    /delegate/i,
    /hand\s*off/i,
    /phase\s+complete/i,
    /declare\s+complete/i
];

/**
 * Extract user-configured iteration config from state.json.
 * Returns null if not present or not configured (no configured_at timestamp).
 * @param {object} state - Parsed state.json
 * @returns {object|null} iteration_config or null
 */
function getIterationConfig(state) {
    const config = state && state.iteration_config;
    if (!config || !config.configured_at) return null;
    return config;
}

// INV-0055 REQ-005: Local loadIterationRequirements() removed.
// Use loadIterationRequirementsFromCommon() from common.cjs instead (imported above).

/**
 * Determine the current corridor state from state.json
 *
 * Returns:
 *   { corridor: 'TEST_CORRIDOR' | 'CONST_CORRIDOR' | 'NONE', details: {...} }
 */
function determineCorridorState(state, currentPhase, phaseReq) {
    const phaseState = state.phases?.[currentPhase];
    if (!phaseState) {
        return { corridor: 'NONE' };
    }

    // Check test iteration state
    const testReq = phaseReq?.test_iteration;
    const testState = phaseState.iteration_requirements?.test_iteration;

    if (testReq?.enabled && testState) {
        // Test iteration is active, not completed, and not escalated → TEST_CORRIDOR
        if (!testState.completed && !testState.status?.match(/^escalated$/)) {
            // Only enforce corridor if there's been at least one test run with a failure
            if (testState.last_test_result === 'failed') {
                return {
                    corridor: 'TEST_CORRIDOR',
                    details: {
                        current_iteration: testState.current_iteration,
                        max_iterations: testState.max_iterations,
                        last_error: testState.history?.slice(-1)[0]?.error || 'Unknown',
                        last_command: testState.last_test_command
                    }
                };
            }
        }
    }

    // Check constitutional validation state
    const constReq = phaseReq?.constitutional_validation;
    const constState = phaseState.constitutional_validation;

    // Only enter CONST_CORRIDOR if test iteration is satisfied (completed or not required)
    const testSatisfied = !testReq?.enabled ||
        (testState?.completed && testState?.status !== 'escalated') ||
        (testState?.completed && testState?.escalation_approved);

    if (testSatisfied && constReq?.enabled) {
        if (constState && !constState.completed && constState.status !== 'escalated') {
            return {
                corridor: 'CONST_CORRIDOR',
                details: {
                    iterations_used: constState.iterations_used || 0,
                    max_iterations: constState.max_iterations || constReq.max_iterations,
                    articles: constReq.articles || [],
                    status: constState.status
                }
            };
        }

        // Constitutional validation not started but required, and tests passed
        if (!constState && testSatisfied && testState?.completed) {
            return {
                corridor: 'CONST_CORRIDOR',
                details: {
                    iterations_used: 0,
                    max_iterations: constReq.max_iterations,
                    articles: constReq.articles || [],
                    status: 'not_started'
                }
            };
        }
    }

    return { corridor: 'NONE' };
}

/**
 * Check if a Task tool call contains advance/delegate keywords
 * BUG-0008: Added detectPhaseDelegation() guard to prevent false positives
 * on delegation prompts (e.g., "Validate GATE-06" matches /gate/i).
 */
function taskHasAdvanceKeywords(toolInput, fullInput) {
    // BUG-0008: Phase-loop controller delegations are NOT advance attempts
    try {
        const delegation = detectPhaseDelegation(fullInput || { tool_name: 'Task', tool_input: toolInput });
        if (delegation.isDelegation) {
            debugLog(`Delegation detected (agent: ${delegation.agentName}), skipping advance keyword check`);
            return false;
        }
    } catch (e) { /* fail-open: fall through to existing logic */ }

    const prompt = (toolInput.prompt || '');
    const description = (toolInput.description || '');
    const combined = prompt + ' ' + description;

    // First check setup bypass
    const combinedLower = combined.toLowerCase();
    for (const setupKeyword of SETUP_COMMAND_KEYWORDS) {
        if (combinedLower.includes(setupKeyword)) {
            return false;
        }
    }

    return ADVANCE_PATTERNS.some(pattern => pattern.test(combined));
}

/**
 * Check if a Skill tool call is an advance attempt
 */
function skillIsAdvanceAttempt(toolInput) {
    const skill = (toolInput.skill || '').toLowerCase();
    const args = (toolInput.args || '').toLowerCase();

    // Setup commands via Skill tool should not be blocked
    for (const setupKeyword of SETUP_COMMAND_KEYWORDS) {
        if (args.includes(setupKeyword)) {
            return false;
        }
    }

    // BUG-0031: Exempt analyze/add verbs — workflow-independent actions
    const action = (args.match(/^(?:--?\w+\s+)*(\w+)/) || [])[1] || '';
    if (EXEMPT_ACTIONS.has(action)) {
        debugLog(`Exempt action '${action}' detected via Skill, skipping corridor check`);
        return false;
    }

    if (skill === 'isdlc' && (args.includes('advance') || args.includes('gate'))) {
        return true;
    }

    return false;
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

        const toolName = input.tool_name;
        const toolInput = input.tool_input || {};

        // Only apply corridor enforcement to Task and Skill tools
        if (toolName !== 'Task' && toolName !== 'Skill') {
            return { decision: 'allow' };
        }

        // Load state
        const state = ctx.state;
        if (!state) {
            return { decision: 'allow' };
        }

        // Check if enforcement is enabled
        if (state.iteration_enforcement?.enabled === false) {
            return { decision: 'allow' };
        }

        // Determine current phase — prefer active_workflow if present
        const activeWorkflow = state.active_workflow;
        let currentPhase = (activeWorkflow && activeWorkflow.current_phase) || state.current_phase;
        if (!currentPhase) {
            return { decision: 'allow' };
        }

        // Normalize phase key (self-healing: catches alias mismatches)
        let stderrMessages = '';
        const originalPhase = currentPhase;
        currentPhase = normalizePhaseKey(currentPhase);
        if (currentPhase !== originalPhase) {
            const msg = `[SELF-HEAL] iteration-corridor: Phase key '${originalPhase}' normalized to '${currentPhase}'.`;
            stderrMessages += msg + '\n';
            logHookEvent('iteration-corridor', 'self-heal', { reason: `Phase key '${originalPhase}' normalized to '${currentPhase}'.` });
        }

        // Load requirements (prefer ctx.requirements, fallback to local loader)
        const requirements = ctx.requirements || loadIterationRequirementsFromCommon();
        let phaseReq = requirements?.phase_requirements?.[currentPhase];
        if (!phaseReq) {
            // Self-heal: missing requirements is infrastructure issue
            const msg = `[SELF-HEAL] iteration-corridor: No requirements for phase '${currentPhase}'. Allowing action.`;
            stderrMessages += msg + '\n';
            logHookEvent('iteration-corridor', 'self-heal', { reason: `No requirements for phase '${currentPhase}'. Allowing action.` });
            return { decision: 'allow', stderr: stderrMessages.trim() || undefined };
        }

        if (activeWorkflow && requirements.workflow_overrides) {
            const overrides = requirements.workflow_overrides[activeWorkflow.type]?.[currentPhase];
            if (overrides) {
                phaseReq = { ...phaseReq };
                if (overrides.test_iteration) {
                    phaseReq.test_iteration = { ...phaseReq.test_iteration, ...overrides.test_iteration };
                }
                if (overrides.constitutional_validation) {
                    phaseReq.constitutional_validation = { ...phaseReq.constitutional_validation, ...overrides.constitutional_validation };
                }
            }
        }

        // Determine corridor state
        const corridorState = determineCorridorState(state, currentPhase, phaseReq);

        if (corridorState.corridor === 'NONE') {
            debugLog('No active corridor, allowing');
            return { decision: 'allow', stderr: stderrMessages.trim() || undefined };
        }

        debugLog('Corridor active:', corridorState.corridor);

        // Apply corridor rules
        if (corridorState.corridor === 'TEST_CORRIDOR') {
            // TEST_CORRIDOR: Block Task delegation and Skill advancement
            if (toolName === 'Task' && taskHasAdvanceKeywords(toolInput, input)) {
                const d = corridorState.details;
                const stopReason = `ITERATION CORRIDOR: Tests are failing (iteration ${d.current_iteration}/${d.max_iterations}). ` +
                    `Fix the code and re-run tests before doing anything else.\n\n` +
                    `Last error: ${d.last_error}\n` +
                    `Last test command: ${d.last_command || 'unknown'}\n\n` +
                    `Blocked action: ${toolName} (detected advance/delegate keywords)`;
                addPendingEscalation(state, {
                    type: 'corridor_blocked',
                    hook: 'iteration-corridor',
                    phase: currentPhase,
                    detail: stopReason,
                    timestamp: getTimestamp()
                });
                return { decision: 'block', stopReason, stderr: stderrMessages.trim() || undefined, stateModified: true };
            }

            if (toolName === 'Skill' && skillIsAdvanceAttempt(toolInput)) {
                const d = corridorState.details;
                const stopReason = `ITERATION CORRIDOR: Tests are failing (iteration ${d.current_iteration}/${d.max_iterations}). ` +
                    `Fix the code and re-run tests before doing anything else.\n\n` +
                    `Last error: ${d.last_error}\n` +
                    `Last test command: ${d.last_command || 'unknown'}\n\n` +
                    `Blocked action: ${toolName} (gate advancement not allowed during test iteration)`;
                addPendingEscalation(state, {
                    type: 'corridor_blocked',
                    hook: 'iteration-corridor',
                    phase: currentPhase,
                    detail: stopReason,
                    timestamp: getTimestamp()
                });
                return { decision: 'block', stopReason, stderr: stderrMessages.trim() || undefined, stateModified: true };
            }
        }

        if (corridorState.corridor === 'CONST_CORRIDOR') {
            // CONST_CORRIDOR: Block Task delegation and Skill advancement
            if (toolName === 'Task' && taskHasAdvanceKeywords(toolInput, input)) {
                const d = corridorState.details;
                const articleList = d.articles.join(', ');
                const stopReason = `ITERATION CORRIDOR: Constitutional validation in progress for Articles [${articleList}]. ` +
                    `Validate and fix artifacts before proceeding.\n\n` +
                    `Status: ${d.status} (iteration ${d.iterations_used}/${d.max_iterations})\n\n` +
                    `Blocked action: ${toolName} (detected advance/delegate keywords)`;
                addPendingEscalation(state, {
                    type: 'corridor_blocked',
                    hook: 'iteration-corridor',
                    phase: currentPhase,
                    detail: stopReason,
                    timestamp: getTimestamp()
                });
                return { decision: 'block', stopReason, stderr: stderrMessages.trim() || undefined, stateModified: true };
            }

            if (toolName === 'Skill' && skillIsAdvanceAttempt(toolInput)) {
                const d = corridorState.details;
                const articleList = d.articles.join(', ');
                const stopReason = `ITERATION CORRIDOR: Constitutional validation in progress for Articles [${articleList}]. ` +
                    `Validate and fix artifacts before proceeding.\n\n` +
                    `Status: ${d.status} (iteration ${d.iterations_used}/${d.max_iterations})\n\n` +
                    `Blocked action: ${toolName} (gate advancement not allowed during constitutional validation)`;
                addPendingEscalation(state, {
                    type: 'corridor_blocked',
                    hook: 'iteration-corridor',
                    phase: currentPhase,
                    detail: stopReason,
                    timestamp: getTimestamp()
                });
                return { decision: 'block', stopReason, stderr: stderrMessages.trim() || undefined, stateModified: true };
            }
        }

        // Action is allowed within the corridor
        debugLog('Action allowed within corridor');
        return { decision: 'allow', stderr: stderrMessages.trim() || undefined };

    } catch (error) {
        // Fail-open: any errors → allow the action
        debugLog('Error in iteration-corridor:', error.message);
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
