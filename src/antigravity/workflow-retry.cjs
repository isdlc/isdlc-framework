#!/usr/bin/env node
/**
 * iSDLC Antigravity - Workflow Retry CLI
 * =======================================
 * Resets the current phase's iteration state without changing phase position.
 * Clears test_iteration, constitutional_validation, interactive_elicitation.
 * Increments retry_count. Sets recovery_action flag.
 *
 * Usage:
 *   node src/antigravity/workflow-retry.cjs
 *
 * Output (JSON):
 *   { "result": "RETRIED", "phase": "06-implementation", "retry_count": 1, ... }
 *   { "result": "ERROR", "message": "No active workflow" }
 *
 * Exit codes: 0 = success, 1 = blocked, 2 = error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, readState } = require('../claude/hooks/lib/common.cjs');

function output(obj) { console.log(JSON.stringify(obj, null, 2)); }

function main() {
    try {
        const projectRoot = getProjectRoot();
        const state = readState() || {};

        // Validate active workflow exists
        if (!state.active_workflow) {
            output({ result: 'ERROR', message: 'No active workflow' });
            process.exit(1);
            return;
        }

        const aw = state.active_workflow;
        const currentPhase = aw.current_phase;

        if (!currentPhase) {
            output({ result: 'ERROR', message: 'No current phase in active workflow' });
            process.exit(1);
            return;
        }

        // Get phase data from detailed phases object
        const phaseData = state.phases && state.phases[currentPhase];
        const clearedState = [];

        if (phaseData) {
            // Clear test_iteration
            if (phaseData.iteration_requirements && phaseData.iteration_requirements.test_iteration) {
                delete phaseData.iteration_requirements.test_iteration;
                clearedState.push('test_iteration');
            }
            if (phaseData.test_iteration) {
                delete phaseData.test_iteration;
                if (!clearedState.includes('test_iteration')) clearedState.push('test_iteration');
            }

            // Clear constitutional_validation
            if (phaseData.constitutional_validation) {
                delete phaseData.constitutional_validation;
                clearedState.push('constitutional_validation');
            }

            // Clear interactive_elicitation
            if (phaseData.iteration_requirements && phaseData.iteration_requirements.interactive_elicitation) {
                delete phaseData.iteration_requirements.interactive_elicitation;
                clearedState.push('interactive_elicitation');
            }
            if (phaseData.interactive_elicitation) {
                delete phaseData.interactive_elicitation;
                if (!clearedState.includes('interactive_elicitation')) clearedState.push('interactive_elicitation');
            }

            // Increment retry_count
            phaseData.retry_count = (phaseData.retry_count || 0) + 1;
        }

        // Set recovery_action flag
        aw.recovery_action = {
            type: 'retry',
            phase: currentPhase,
            timestamp: new Date().toISOString()
        };

        // Bump state_version
        state.state_version = (state.state_version || 0) + 1;

        // Write state
        const statePath = path.join(projectRoot, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        const retryCount = phaseData ? phaseData.retry_count : 1;

        output({
            result: 'RETRIED',
            phase: currentPhase,
            retry_count: retryCount,
            cleared_state: clearedState,
            artifacts_preserved: true,
            message: `Phase "${currentPhase}" has been reset for retry (attempt ${retryCount}). Existing artifacts on disk are preserved — review them before producing new output.`
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
