#!/usr/bin/env node
/**
 * iSDLC Antigravity - Workflow Rollback CLI
 * ==========================================
 * Rolls back the workflow to a target earlier phase.
 * Sets target phase to in_progress, all subsequent phases to pending.
 * Clears iteration state for target and subsequent phases.
 * Sets recovery_action flag with type "rollback".
 *
 * Usage:
 *   node src/antigravity/workflow-rollback.cjs --to-phase 01-requirements
 *   node src/antigravity/workflow-rollback.cjs --to-phase 01-requirements --confirm
 *
 * Output (JSON):
 *   { "result": "ROLLED_BACK", "from_phase": "06-impl", "to_phase": "01-req", ... }
 *   { "result": "ERROR", "message": "..." }
 *   { "result": "CONFIRM_REQUIRED", "from_phase": "...", "to_phase": "...", "phases_to_reset": [...] }
 *
 * Exit codes: 0 = success, 1 = blocked/confirm needed, 2 = error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, readState } = require('../claude/hooks/lib/common.cjs');

function output(obj) { console.log(JSON.stringify(obj, null, 2)); }

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { toPhase: null, confirm: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--to-phase' && args[i + 1]) { result.toPhase = args[i + 1]; i++; }
        if (args[i] === '--confirm') result.confirm = true;
    }
    return result;
}

function clearPhaseIterationState(phaseData) {
    if (!phaseData) return;
    // Clear constitutional_validation
    delete phaseData.constitutional_validation;
    // Clear iteration_requirements sub-fields
    if (phaseData.iteration_requirements) {
        delete phaseData.iteration_requirements.test_iteration;
        delete phaseData.iteration_requirements.interactive_elicitation;
    }
    // Clear top-level iteration fields
    delete phaseData.test_iteration;
    delete phaseData.interactive_elicitation;
}

function main() {
    try {
        const args = parseArgs();
        const projectRoot = getProjectRoot();
        const state = readState() || {};

        // Validate active workflow exists
        if (!state.active_workflow) {
            output({ result: 'ERROR', message: 'No active workflow' });
            process.exit(1);
            return;
        }

        const aw = state.active_workflow;
        const phases = aw.phases;

        if (!phases || !Array.isArray(phases) || phases.length === 0) {
            output({ result: 'ERROR', message: 'No phases in active workflow' });
            process.exit(2);
            return;
        }

        if (!args.toPhase) {
            output({ result: 'ERROR', message: 'Missing --to-phase argument' });
            process.exit(2);
            return;
        }

        const targetPhase = args.toPhase;
        const currentPhase = aw.current_phase;

        // Validate target phase is in workflow's phases array
        const targetIndex = phases.indexOf(targetPhase);
        if (targetIndex === -1) {
            output({ result: 'ERROR', message: `Phase '${targetPhase}' is not in this workflow` });
            process.exit(1);
            return;
        }

        // Validate target is not the current phase
        const currentIndex = aw.current_phase_index;
        if (targetPhase === currentPhase || targetIndex === currentIndex) {
            output({ result: 'ERROR', message: 'Cannot rollback to current phase. Use retry instead.' });
            process.exit(1);
            return;
        }

        // Validate target is not forward
        if (targetIndex > currentIndex) {
            output({ result: 'ERROR', message: 'Cannot rollback forward' });
            process.exit(1);
            return;
        }

        // Determine phases that will be reset (target + all after target)
        const phasesToReset = phases.slice(targetIndex + 1, currentIndex + 1);
        const allAffectedPhases = [targetPhase, ...phasesToReset];

        // If --confirm not provided, output confirmation request
        if (!args.confirm) {
            output({
                result: 'CONFIRM_REQUIRED',
                from_phase: currentPhase,
                to_phase: targetPhase,
                phases_to_reset: phasesToReset,
                message: `This will reset phases ${phasesToReset.join(', ')} back to pending. Phase ${targetPhase} will resume as in-progress. Continue?`
            });
            process.exit(1);
            return;
        }

        // Build phases_reset report (old → new status)
        const phasesResetReport = [];

        // Set target phase to in_progress
        if (aw.phase_status) {
            const oldStatus = aw.phase_status[targetPhase] || 'unknown';
            aw.phase_status[targetPhase] = 'in_progress';
            phasesResetReport.push({ phase: targetPhase, old_status: oldStatus, new_status: 'in_progress' });
        }

        // Set all subsequent phases to pending
        for (const phase of phasesToReset) {
            if (aw.phase_status) {
                const oldStatus = aw.phase_status[phase] || 'unknown';
                aw.phase_status[phase] = 'pending';
                phasesResetReport.push({ phase, old_status: oldStatus, new_status: 'pending' });
            }
        }

        // Update current_phase and current_phase_index
        aw.current_phase = targetPhase;
        aw.current_phase_index = targetIndex;

        // Clear iteration state for target and all subsequent phases
        for (const phase of allAffectedPhases) {
            if (state.phases && state.phases[phase]) {
                clearPhaseIterationState(state.phases[phase]);
                // Also update detailed phases status
                if (phase === targetPhase) {
                    state.phases[phase].status = 'in_progress';
                } else {
                    state.phases[phase].status = 'pending';
                }
            }
        }

        // Set recovery_action flag
        aw.recovery_action = {
            type: 'rollback',
            phase: targetPhase,
            timestamp: new Date().toISOString()
        };

        // Increment rollback_count
        aw.rollback_count = (aw.rollback_count || 0) + 1;

        // Update top-level state fields
        state.current_phase = targetPhase;

        // Bump state_version
        state.state_version = (state.state_version || 0) + 1;

        // Write state
        const statePath = path.join(projectRoot, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        output({
            result: 'ROLLED_BACK',
            from_phase: currentPhase,
            to_phase: targetPhase,
            phases_reset: phasesResetReport,
            artifacts_preserved: true,
            rollback_count: aw.rollback_count,
            message: `Rolled back from "${currentPhase}" to "${targetPhase}". ${phasesToReset.length} phase(s) reset to pending. Artifacts preserved on disk — re-read phase agent and revise existing artifacts.`
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
