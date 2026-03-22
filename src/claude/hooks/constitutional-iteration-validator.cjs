#!/usr/bin/env node
/**
 * iSDLC Constitutional Iteration Validator - PreToolUse[Skill] Hook
 * ==================================================================
 * Before gate advancement, verifies that constitutional_validation
 * was actually performed for the current phase.
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-02, AC-02a through AC-02h
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent
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
 * Patterns that indicate a gate-related skill invocation.
 */
const GATE_PATTERNS = [
    /gate[-_]?check/i,
    /\badvance\b/i,
    /gate[-_]?validation/i,
    /phase[-_]?transition/i
];

/**
 * Check if a skill invocation is gate-related.
 * @param {object} input - Parsed stdin JSON
 * @returns {boolean}
 */
function isGateInvocation(input) {
    // Check skill name
    const skillName = (input.tool_input && input.tool_input.skill) || '';
    if (/^\/isdlc$/i.test(skillName) || /^isdlc$/i.test(skillName) || /^\/sdlc$/i.test(skillName)) {
        // Check args for gate-related keywords
        const args = (input.tool_input && input.tool_input.args) || '';
        for (const pattern of GATE_PATTERNS) {
            if (pattern.test(args)) {
                return true;
            }
        }
    }

    // Check the task/prompt content for gate keywords
    const prompt = (input.tool_input && input.tool_input.prompt) ||
                   (input.tool_input && input.tool_input.description) || '';
    for (const pattern of GATE_PATTERNS) {
        if (pattern.test(prompt)) {
            return true;
        }
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

        // Only check Skill invocations
        if (input.tool_name !== 'Skill') {
            return { decision: 'allow' };
        }

        // Only check gate-related invocations
        if (!isGateInvocation(input)) {
            debugLog('Not a gate invocation, allowing');
            return { decision: 'allow' };
        }

        debugLog('Gate invocation detected, checking constitutional validation');

        // Read state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            return { decision: 'allow' };
        }

        if (!state.active_workflow) {
            debugLog('No active workflow, allowing');
            return { decision: 'allow' };
        }

        const currentPhase = state.active_workflow.current_phase;
        if (!currentPhase) {
            debugLog('No current phase, allowing');
            return { decision: 'allow' };
        }

        // Check constitutional validation for current phase
        const phaseData = state.phases && state.phases[currentPhase];
        if (!phaseData) {
            debugLog('No phase data for', currentPhase, ', allowing (fail-open)');
            logHookEvent('constitutional-iteration-validator', 'skip', {
                phase: currentPhase,
                reason: 'No phase data found'
            });
            return { decision: 'allow' };
        }

        const cv = phaseData.constitutional_validation;
        if (!cv) {
            debugLog('No constitutional_validation section, allowing (fail-open)');
            logHookEvent('constitutional-iteration-validator', 'skip', {
                phase: currentPhase,
                reason: 'No constitutional_validation section'
            });
            return { decision: 'allow' };
        }

        // Validate fields
        const issues = [];

        if (cv.completed !== true) {
            issues.push(`completed is ${cv.completed}, expected true`);
        }

        if (!cv.iterations_used || cv.iterations_used < 1) {
            issues.push(`iterations_used is ${cv.iterations_used || 0}, expected >= 1`);
        }

        if (cv.status !== 'compliant' && cv.status !== 'escalated') {
            issues.push(`status is '${cv.status}', expected 'compliant' or 'escalated'`);
        }

        if (!cv.articles_checked || !Array.isArray(cv.articles_checked) || cv.articles_checked.length === 0) {
            issues.push('articles_checked is empty or missing');
        }

        if (issues.length > 0) {
            const reason = `Constitutional validation incomplete for phase '${currentPhase}': ${issues.join('; ')}`;
            logHookEvent('constitutional-iteration-validator', 'block', {
                phase: currentPhase,
                reason
            });
            const stopReason =
                `CONSTITUTIONAL VALIDATION INCOMPLETE: ${reason}.\n\n` +
                `Complete constitutional validation before gate advancement.\n` +
                `Required: completed=true, iterations_used>=1, status=compliant|escalated, articles_checked non-empty.`;
            return { decision: 'block', stopReason };
        }

        // All checks pass
        debugLog('Constitutional validation complete for', currentPhase);
        logHookEvent('constitutional-iteration-validator', 'allow', {
            phase: currentPhase,
            reason: 'Validation complete'
        });
        return { decision: 'allow' };

    } catch (error) {
        debugLog('Error in constitutional-iteration-validator:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions, outputBlockResponse } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) { process.exit(0); }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) console.error(result.stderr);
            if (result.stdout) console.log(result.stdout);
            if (result.decision === 'block' && result.stopReason) {
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) { process.exit(0); }
    })();
}
