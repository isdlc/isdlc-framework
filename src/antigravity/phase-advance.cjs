#!/usr/bin/env node
/**
 * iSDLC Antigravity - Phase Advance CLI
 * =======================================
 * Advances to the next phase after validating all gate requirements.
 * Combines validate-gate + state advancement in one atomic operation.
 *
 * Usage:
 *   node src/antigravity/phase-advance.cjs
 *
 * Output (JSON):
 *   { "result": "ADVANCED", "from": "01-requirements", "to": "02-impact-analysis" }
 *   { "result": "BLOCKED", "phase": "01-requirements", "blocking": [...] }
 *   { "result": "WORKFLOW_COMPLETE", ... }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const {
    getProjectRoot,
    readState,
    normalizePhaseKey,
    loadManifest,
    loadIterationRequirements
} = require('../claude/hooks/lib/common.cjs');

const {
    checkTestIterationRequirement,
    checkConstitutionalRequirement,
    checkElicitationRequirement,
    checkAgentDelegationRequirement,
    checkArtifactPresenceRequirement
} = require('../claude/hooks/lib/gate-logic.cjs');

function output(obj) { console.log(JSON.stringify(obj, null, 2)); }

function main() {
    try {
        const projectRoot = getProjectRoot();
        const state = readState();

        if (!state || !state.active_workflow) {
            output({ result: 'ERROR', message: 'No active workflow in state.json' });
            process.exit(2);
        }

        const aw = state.active_workflow;
        const currentPhase = aw.current_phase;
        const currentIndex = aw.current_phase_index;
        const phases = aw.phases;

        if (!currentPhase || !phases || !Array.isArray(phases)) {
            output({ result: 'ERROR', message: 'Invalid workflow state: missing phases or current_phase' });
            process.exit(2);
        }

        // Check if already at last phase
        if (currentIndex >= phases.length - 1) {
            output({
                result: 'WORKFLOW_COMPLETE',
                phase: currentPhase,
                message: 'All phases completed. Run workflow-finalize.cjs to complete.'
            });
            process.exit(0);
        }

        // Run gate validation
        const normalizedPhase = normalizePhaseKey(currentPhase);
        const requirements = loadIterationRequirements();
        let blocked = false;
        let blockDetails = [];

        if (requirements) {
            let phaseReq = requirements.phase_requirements?.[normalizedPhase];
            if (phaseReq) {
                // Merge workflow overrides
                if (requirements.workflow_overrides?.[aw.type]?.[normalizedPhase]) {
                    phaseReq = { ...phaseReq, ...requirements.workflow_overrides[aw.type][normalizedPhase] };
                }

                const phaseState = state.phases?.[normalizedPhase] || {};
                const manifest = loadManifest();

                const checks = [
                    { requirement: 'test_iteration', ...checkTestIterationRequirement(phaseState, phaseReq) },
                    { requirement: 'constitutional_validation', ...checkConstitutionalRequirement(phaseState, phaseReq) },
                    { requirement: 'interactive_elicitation', ...checkElicitationRequirement(phaseState, phaseReq) },
                    { requirement: 'agent_delegation', ...checkAgentDelegationRequirement(phaseState, phaseReq, state, normalizedPhase, manifest) },
                    { requirement: 'artifact_presence', ...checkArtifactPresenceRequirement(phaseState, phaseReq, state, normalizedPhase) }
                ];

                blockDetails = checks.filter(c => !c.satisfied);
                if (blockDetails.length > 0) blocked = true;
            }
        }

        if (blocked) {
            output({
                result: 'BLOCKED',
                phase: currentPhase,
                blocking: blockDetails.map(d => d.requirement),
                details: blockDetails.map(d => ({
                    requirement: d.requirement,
                    reason: d.reason,
                    action_required: d.action_required
                }))
            });
            process.exit(1);
        }

        // Advance phase
        const nextIndex = currentIndex + 1;
        const nextPhase = phases[nextIndex];

        // Update state
        aw.phase_status[currentPhase] = 'completed';
        aw.current_phase = nextPhase;
        aw.current_phase_index = nextIndex;
        aw.phase_status[nextPhase] = 'in_progress';

        // Update phases record
        if (!state.phases) state.phases = {};
        if (!state.phases[normalizedPhase]) state.phases[normalizedPhase] = {};
        state.phases[normalizedPhase].status = 'completed';
        state.phases[normalizedPhase].completed_at = new Date().toISOString();

        state.state_version = (state.state_version || 0) + 1;

        const statePath = path.join(projectRoot, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        output({
            result: 'ADVANCED',
            from: currentPhase,
            to: nextPhase,
            phase_index: nextIndex,
            phases_remaining: phases.length - nextIndex - 1,
            state_version: state.state_version
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
