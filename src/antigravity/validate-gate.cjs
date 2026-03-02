#!/usr/bin/env node
/**
 * iSDLC Antigravity - Gate Validator CLI
 * =======================================
 * Deterministic gate validation for Antigravity.
 * Wraps gate-logic.cjs to provide PASS/BLOCK results via CLI.
 *
 * Usage:
 *   node src/antigravity/validate-gate.cjs [--phase <phase>]
 *
 * Output (JSON to stdout):
 *   { "result": "PASS" }
 *   { "result": "BLOCK", "blocking": [...], "details": [...] }
 *
 * Exit codes:
 *   0 = PASS (safe to advance)
 *   1 = BLOCK (requirements not met)
 *   2 = ERROR (validation could not run)
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Reuse shared logic
const {
    getProjectRoot,
    readState,
    loadManifest,
    loadIterationRequirements,
    loadWorkflowDefinitions,
    normalizePhaseKey
} = require('../claude/hooks/lib/common.cjs');

const {
    checkTestIterationRequirement,
    checkConstitutionalRequirement,
    checkElicitationRequirement,
    checkAgentDelegationRequirement,
    checkArtifactPresenceRequirement
} = require('../claude/hooks/lib/gate-logic.cjs');

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { phase: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--phase' && args[i + 1]) {
            result.phase = args[i + 1];
            i++;
        }
    }
    return result;
}

function output(obj) {
    console.log(JSON.stringify(obj, null, 2));
}

function main() {
    try {
        const args = parseArgs();

        // Read state
        const state = readState();
        if (!state) {
            output({ result: 'PASS', reason: 'No state.json found (fail-open)' });
            process.exit(0);
        }

        // Determine phase
        let currentPhase = args.phase
            || state.active_workflow?.current_phase
            || state.current_phase;

        if (!currentPhase) {
            output({ result: 'PASS', reason: 'No current phase set' });
            process.exit(0);
        }

        currentPhase = normalizePhaseKey(currentPhase);

        // Load requirements
        const requirements = loadIterationRequirements();
        if (!requirements) {
            output({ result: 'PASS', reason: 'No iteration requirements configured' });
            process.exit(0);
        }

        let phaseReq = requirements.phase_requirements?.[currentPhase];
        if (!phaseReq) {
            output({ result: 'PASS', reason: `No requirements for phase '${currentPhase}'` });
            process.exit(0);
        }

        // Merge workflow-specific overrides
        const activeWorkflow = state.active_workflow;
        if (activeWorkflow && requirements.workflow_overrides?.[activeWorkflow.type]?.[currentPhase]) {
            phaseReq = { ...phaseReq, ...requirements.workflow_overrides[activeWorkflow.type][currentPhase] };
        }

        // Check supervised review
        const supervisedReview = state.active_workflow?.supervised_review;
        if (supervisedReview?.status === 'reviewing' || supervisedReview?.status === 'rejected') {
            output({
                result: 'BLOCK',
                blocking: ['supervised_review'],
                details: [{ requirement: 'supervised_review', reason: `Supervised review status: ${supervisedReview.status}` }]
            });
            process.exit(1);
        }

        // Run all 5 gate checks
        const phaseState = state.phases?.[currentPhase] || {};
        const manifest = loadManifest();
        const checks = [
            { requirement: 'test_iteration', ...checkTestIterationRequirement(phaseState, phaseReq) },
            { requirement: 'constitutional_validation', ...checkConstitutionalRequirement(phaseState, phaseReq) },
            { requirement: 'interactive_elicitation', ...checkElicitationRequirement(phaseState, phaseReq) },
            { requirement: 'agent_delegation', ...checkAgentDelegationRequirement(phaseState, phaseReq, state, currentPhase, manifest) },
            { requirement: 'artifact_presence', ...checkArtifactPresenceRequirement(phaseState, phaseReq, state, currentPhase) }
        ];

        const failures = checks.filter(c => !c.satisfied);

        if (failures.length === 0) {
            output({
                result: 'PASS',
                phase: currentPhase,
                checks_run: checks.length,
                all_satisfied: true
            });
            process.exit(0);
        } else {
            output({
                result: 'BLOCK',
                phase: currentPhase,
                blocking: failures.map(f => f.requirement),
                details: failures.map(f => ({
                    requirement: f.requirement,
                    reason: f.reason,
                    action_required: f.action_required
                }))
            });
            process.exit(1);
        }

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
