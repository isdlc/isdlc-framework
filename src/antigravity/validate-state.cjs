#!/usr/bin/env node
/**
 * iSDLC Antigravity - State Validator CLI
 * ========================================
 * Deterministic state.json validation for Antigravity.
 * Wraps state-logic.cjs to validate state integrity.
 *
 * Usage:
 *   node src/antigravity/validate-state.cjs
 *
 * Output (JSON to stdout):
 *   { "result": "VALID" }
 *   { "result": "VALID", "warnings": [...] }
 *   { "result": "INVALID", "errors": [...] }
 *
 * Exit codes:
 *   0 = VALID (state is consistent)
 *   1 = INVALID (state has issues that must be fixed)
 *   2 = ERROR (validation could not run)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
    getProjectRoot
} = require('../claude/hooks/lib/common.cjs');

const {
    validatePhase,
    checkPhaseFieldProtection,
    checkCrossLocationConsistency
} = require('../claude/hooks/lib/state-logic.cjs');

function output(obj) {
    console.log(JSON.stringify(obj, null, 2));
}

function main() {
    try {
        const projectRoot = getProjectRoot();
        const statePath = path.join(projectRoot, '.isdlc', 'state.json');

        if (!fs.existsSync(statePath)) {
            output({ result: 'VALID', reason: 'No state.json — nothing to validate' });
            process.exit(0);
        }

        let state;
        try {
            state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        } catch (e) {
            output({ result: 'INVALID', errors: [`state.json is not valid JSON: ${e.message}`] });
            process.exit(1);
        }

        const allWarnings = [];
        const errors = [];

        // V1-V3: Validate each phase for suspicious patterns
        const phases = state.phases;
        if (phases && typeof phases === 'object') {
            for (const [phaseName, phaseData] of Object.entries(phases)) {
                if (!phaseData || typeof phaseData !== 'object') continue;
                const phaseWarnings = validatePhase(phaseName, phaseData, statePath);
                allWarnings.push(...phaseWarnings);
            }
        }

        // V9: Cross-location consistency
        const v9 = checkCrossLocationConsistency(statePath, { content: JSON.stringify(state) }, 'Write');
        allWarnings.push(...v9.warnings);

        // V7/V8 require comparing incoming vs disk — for the CLI we validate current disk state
        // Check for basic structural integrity
        if (state.active_workflow) {
            const aw = state.active_workflow;

            // Check phase index is a valid number
            if (aw.current_phase_index !== undefined && typeof aw.current_phase_index !== 'number') {
                errors.push(`active_workflow.current_phase_index should be a number, got: ${typeof aw.current_phase_index}`);
            }

            // Check phases array exists
            if (aw.phases && !Array.isArray(aw.phases)) {
                errors.push('active_workflow.phases should be an array');
            }

            // Check current_phase is in phases array
            if (aw.current_phase && aw.phases && Array.isArray(aw.phases)) {
                if (!aw.phases.includes(aw.current_phase)) {
                    errors.push(`active_workflow.current_phase '${aw.current_phase}' is not in phases array`);
                }
            }

            // Check phase_status values are valid
            if (aw.phase_status && typeof aw.phase_status === 'object') {
                const validStatuses = ['pending', 'in_progress', 'completed', 'skipped'];
                for (const [phase, status] of Object.entries(aw.phase_status)) {
                    if (!validStatuses.includes(status)) {
                        errors.push(`active_workflow.phase_status['${phase}'] has invalid status: '${status}'`);
                    }
                }
            }
        }

        // Check state_version is present and numeric
        if (state.state_version !== undefined && typeof state.state_version !== 'number') {
            errors.push(`state_version should be a number, got: ${typeof state.state_version}`);
        }

        if (errors.length > 0) {
            output({
                result: 'INVALID',
                errors,
                warnings: allWarnings.length > 0 ? allWarnings : undefined
            });
            process.exit(1);
        }

        if (allWarnings.length > 0) {
            output({
                result: 'VALID',
                warnings: allWarnings
            });
            process.exit(0);
        }

        output({ result: 'VALID' });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
