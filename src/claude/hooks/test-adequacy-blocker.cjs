#!/usr/bin/env node
/**
 * iSDLC Test Adequacy Blocker - PreToolUse[Task] Hook
 * =====================================================
 * Hard-blocks Phase 14 (upgrade) delegation when test coverage
 * is inadequate. Upgrades require a regression baseline.
 *
 * Performance budget: < 100ms
 * Fail-open: any error results in silent exit (exit 0, no output)
 *
 * Traces to: FR-07, AC-07a through AC-07f
 * Version: 1.1.0
 */

const {
    debugLog,
    logHookEvent,
    detectPhaseDelegation,
    PHASE_PREFIXES
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
 * Default minimum unit test percentage if no constitution threshold.
 */
const DEFAULT_MIN_COVERAGE = 50;

/**
 * Check if a delegation targets the upgrade-engineer agent.
 * @param {object} delegation - Result from detectPhaseDelegation
 * @returns {boolean}
 */
function isUpgradeDelegation(delegation) {
    if (!delegation || !delegation.isDelegation) return false;
    const phase = delegation.targetPhase || '';
    const agent = (delegation.agentName || '').toLowerCase();
    return phase.startsWith(PHASE_PREFIXES.UPGRADE) ||
           agent.includes('upgrade');
}

/**
 * Check if the raw Task prompt text indicates an upgrade delegation.
 * Fallback when detectPhaseDelegation cannot identify the agent
 * (e.g., no manifest file available).
 * @param {object} input - Parsed stdin
 * @returns {boolean}
 */
function isUpgradeFromPromptText(input) {
    const toolInput = input.tool_input || {};
    const combined = ((toolInput.prompt || '') + ' ' + (toolInput.description || '')).toLowerCase();
    return combined.includes('upgrade-engineer') ||
           combined.includes('upgrade engineer') ||
           (combined.includes('upgrade') && combined.includes('phase 14'));
}

/**
 * Check if the active workflow phase indicates an upgrade.
 * @param {object} state - Parsed state.json
 * @returns {boolean}
 */
function isUpgradePhaseActive(state) {
    const phase = state.active_workflow?.current_phase || '';
    return phase.startsWith(PHASE_PREFIXES.UPGRADE);
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

        if (input.tool_name !== 'Task') {
            return { decision: 'allow' };
        }

        // Detect if this is a phase delegation targeting upgrade-engineer.
        // Primary path: use detectPhaseDelegation + isUpgradeDelegation.
        // Fallback: scan raw prompt text for upgrade keywords.
        const delegation = detectPhaseDelegation(input);
        let isUpgrade = isUpgradeDelegation(delegation);

        if (!isUpgrade) {
            // Fallback: check raw prompt text for upgrade-engineer references
            isUpgrade = isUpgradeFromPromptText(input);
        }

        if (!isUpgrade) {
            return { decision: 'allow' };
        }

        debugLog('Upgrade delegation detected, checking test adequacy');

        // Read state
        const state = ctx.state;
        if (!state) {
            debugLog('No state.json, allowing (fail-open)');
            return { decision: 'allow' };
        }

        // Check coverage data from discovery context
        const coverage = state.discovery_context?.coverage_summary;
        if (!coverage) {
            debugLog('No coverage data, allowing (fail-open) with warning');
            logHookEvent('test-adequacy-blocker', 'skip', {
                reason: 'No coverage data in discovery_context'
            });
            return { decision: 'allow' };
        }

        const totalTests = coverage.total_tests || 0;
        const unitPct = coverage.unit_test_pct || 0;
        const minCoverage = DEFAULT_MIN_COVERAGE;

        const issues = [];

        if (totalTests === 0) {
            issues.push(`total_tests is 0 (no tests exist)`);
        }

        if (unitPct < minCoverage) {
            issues.push(`unit_test_pct is ${unitPct}% (minimum: ${minCoverage}%)`);
        }

        if (issues.length === 0) {
            debugLog('Test adequacy check passed:', totalTests, 'tests,', unitPct + '% coverage');
            logHookEvent('test-adequacy-blocker', 'allow', {
                reason: `Adequate: ${totalTests} tests, ${unitPct}% coverage`
            });
            return { decision: 'allow' };
        }

        // Block: inadequate test coverage
        const targetPhase = delegation?.targetPhase ||
            state.active_workflow?.current_phase ||
            'upgrade';
        const reason = `Test adequacy insufficient: ${issues.join('; ')}`;
        logHookEvent('test-adequacy-blocker', 'block', {
            phase: targetPhase,
            reason
        });

        const stopReason =
            `TEST ADEQUACY REQUIRED: The upgrade workflow requires adequate test ` +
            `coverage before proceeding. Upgrades need a regression baseline to ` +
            `validate against.\n\n` +
            `Issues:\n${issues.map(i => `  - ${i}`).join('\n')}\n\n` +
            `Current: ${totalTests} tests, ${unitPct}% unit coverage\n` +
            `Required: > 0 tests, >= ${minCoverage}% unit coverage\n\n` +
            `Run /isdlc test generate first to establish a regression baseline.`;

        return { decision: 'block', stopReason };

    } catch (error) {
        debugLog('Error in test-adequacy-blocker:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check, isUpgradeDelegation, isUpgradeFromPromptText, isUpgradePhaseActive };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, loadManifest, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');

    (async () => {
        try {
            const inputStr = await readStdin();
            if (!inputStr || !inputStr.trim()) {
                process.exit(0);
            }
            let input;
            try { input = JSON.parse(inputStr); } catch (e) { process.exit(0); }

            const state = readState();
            const manifest = loadManifest();
            const requirements = loadIterationRequirements();
            const workflows = loadWorkflowDefinitions();
            const ctx = { input, state, manifest, requirements, workflows };

            const result = check(ctx);

            if (result.stderr) {
                console.error(result.stderr);
            }
            if (result.stdout) {
                console.log(result.stdout);
            }
            if (result.decision === 'block' && result.stopReason) {
                const { outputBlockResponse } = require('./lib/common.cjs');
                outputBlockResponse(result.stopReason);
            }
            process.exit(0);
        } catch (e) {
            process.exit(0);
        }
    })();
}
