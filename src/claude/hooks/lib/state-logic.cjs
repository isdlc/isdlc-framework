/**
 * iSDLC State Logic - Shared Validation
 * ======================================
 * Core validation logic for state.json writes.
 * Shared between Claude Code hooks and Antigravity skills.
 */

const fs = require('fs');
const path = require('path');
const {
    debugLog,
    logHookEvent,
    STATE_JSON_PATTERN
} = require('./common.cjs');

// Core bridge for delegating validation to src/core/state/validation.js (REQ-0080)
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', '..', 'core', 'bridge', 'state.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else {
            _coreBridge = null;
        }
    } catch (e) {
        _coreBridge = null;
    }
    return _coreBridge;
}

/**
 * Validate a single phase's state data for suspicious patterns.
 */
function validatePhase(phaseName, phaseData, filePath) {
    const _b = _getCoreBridge(); if (_b) return _b.validatePhase(phaseName, phaseData, filePath);
    const warnings = [];

    // Rule V1: constitutional_validation
    const constVal = phaseData.constitutional_validation;
    if (constVal && constVal.completed === true) {
        const iters = constVal.iterations_used;
        if (iters === undefined || iters === null || iters < 1) {
            warnings.push(
                `[state-write-validator] WARNING: Suspicious state.json write detected.\n` +
                `  Phase: ${phaseName}\n` +
                `  Issue: constitutional_validation.completed is true but iterations_used is ${iters}\n` +
                `  Rule: A completed constitutional validation must have at least 1 iteration\n` +
                `  Path: ${filePath}`
            );
        }
    }

    // Rule V2: interactive_elicitation
    const elicit = phaseData.iteration_requirements?.interactive_elicitation;
    if (elicit && elicit.completed === true) {
        const menuCount = elicit.menu_interactions;
        if (menuCount === undefined || menuCount === null || menuCount < 1) {
            warnings.push(
                `[state-write-validator] WARNING: Suspicious state.json write detected.\n` +
                `  Phase: ${phaseName}\n` +
                `  Issue: interactive_elicitation.completed is true but menu_interactions is ${menuCount}\n` +
                `  Rule: A completed elicitation must have at least 1 menu interaction\n` +
                `  Path: ${filePath}`
            );
        }
    }

    // Rule V3: test_iteration
    const testIter = phaseData.iteration_requirements?.test_iteration;
    if (testIter && testIter.completed === true) {
        const iterCount = testIter.current_iteration;
        if (iterCount === undefined || iterCount === null || iterCount < 1) {
            warnings.push(
                `[state-write-validator] WARNING: Suspicious state.json write detected.\n` +
                `  Phase: ${phaseName}\n` +
                `  Issue: test_iteration.completed is true but current_iteration is ${iterCount}\n` +
                `  Rule: A completed test iteration must have at least 1 test run\n` +
                `  Path: ${filePath}`
            );
        }
    }

    return warnings;
}

function checkVersionLock(filePath, toolInput, toolName, diskState) {
    if (toolName !== 'Write') return null;

    try {
        const incomingContent = toolInput.content;
        if (!incomingContent || typeof incomingContent !== 'string') return null;

        let incomingState;
        try { incomingState = JSON.parse(incomingContent); } catch (e) { return null; }

        if (!incomingState || typeof incomingState !== 'object') return null;

        const incomingVersion = incomingState.state_version;

        if (!diskState || typeof diskState !== 'object') {
            return null;
        }
        const diskVersion = diskState.state_version;

        if (incomingVersion === undefined || incomingVersion === null) {
            if (diskVersion === undefined || diskVersion === null) return null;
            const reason = `Unversioned write rejected: disk state has state_version ${diskVersion} but incoming write has no state_version.`;
            logHookEvent('state-write-validator', 'block', { reason: `V7: incoming no version, disk ${diskVersion}` });
            return { decision: 'block', stopReason: reason };
        }

        if (diskVersion === undefined || diskVersion === null) return null;

        if (incomingVersion < diskVersion) {
            const reason = `Version mismatch: expected state_version >= ${diskVersion}, got ${incomingVersion}.`;
            logHookEvent('state-write-validator', 'block', { reason: `V7: state_version ${incomingVersion} < disk ${diskVersion}` });
            return { decision: 'block', stopReason: reason };
        }

        return null;
    } catch (e) {
        debugLog('V7 version check error:', e.message);
        return null;
    }
}

const PHASE_STATUS_ORDINAL = { 'pending': 0, 'in_progress': 1, 'completed': 2 };

function checkPhaseFieldProtection(filePath, toolInput, toolName, diskState) {
    if (toolName !== 'Write') return null;

    try {
        const incomingContent = toolInput.content;
        if (!incomingContent || typeof incomingContent !== 'string') return null;

        let incomingState;
        try { incomingState = JSON.parse(incomingContent); } catch (e) { return null; }

        const incomingAW = incomingState?.active_workflow;
        if (!incomingAW || typeof incomingAW !== 'object') return null;

        if (!diskState || typeof diskState !== 'object') return null;

        const diskAW = diskState?.active_workflow;
        if (!diskAW || typeof diskAW !== 'object') return null;

        const incomingIndex = incomingAW.current_phase_index;
        const diskIndex = diskAW.current_phase_index;

        if (incomingIndex !== undefined && incomingIndex !== null && diskIndex !== undefined && diskIndex !== null) {
            if (typeof incomingIndex === 'number' && typeof diskIndex === 'number') {
                if (incomingIndex < diskIndex) {
                    // Recovery action exception: allow index regression for rollback
                    const recoveryAction = incomingAW.recovery_action;
                    if (recoveryAction && recoveryAction.type === 'rollback') {
                        // Rollback explicitly decreases phase index — allowed
                    } else {
                        const reason = `Phase index regression: incoming current_phase_index (${incomingIndex}) < disk (${diskIndex}).`;
                        logHookEvent('state-write-validator', 'block', { reason: `V8: phase_index ${incomingIndex} < disk ${diskIndex}` });
                        return { decision: 'block', stopReason: reason };
                    }
                }
            }
        }

        const incomingPS = incomingAW.phase_status;
        const diskPS = diskAW.phase_status;

        if (incomingPS && typeof incomingPS === 'object' && diskPS && typeof diskPS === 'object') {
            for (const [phase, incomingStatus] of Object.entries(incomingPS)) {
                const diskStatus = diskPS[phase];
                if (diskStatus === undefined || diskStatus === null) continue;

                const incomingOrd = PHASE_STATUS_ORDINAL[incomingStatus];
                const diskOrd = PHASE_STATUS_ORDINAL[diskStatus];

                if (incomingOrd === undefined || diskOrd === undefined) continue;

                if (incomingOrd < diskOrd) {
                    // Exception 1: supervised_review redo (existing)
                    const supervisedReview = incomingState?.active_workflow?.supervised_review;
                    const isRedo = supervisedReview && (supervisedReview.status === 'redo_pending' || (typeof supervisedReview.redo_count === 'number' && supervisedReview.redo_count > 0));

                    if (isRedo && incomingStatus === 'in_progress' && diskStatus === 'completed') {
                        continue;
                    }

                    // Exception 2: recovery_action (retry or rollback)
                    const recoveryAction = incomingAW.recovery_action;
                    if (recoveryAction && (recoveryAction.type === 'retry' || recoveryAction.type === 'rollback')) {
                        continue;
                    }

                    const reason = `Phase status regression: phase '${phase}' changed from '${diskStatus}' to '${incomingStatus}'.`;
                    logHookEvent('state-write-validator', 'block', { reason: `V8: phase_status '${phase}' ${diskStatus} -> ${incomingStatus}` });
                    return { decision: 'block', stopReason: reason };
                }
            }
        }

        return null;
    } catch (e) {
        debugLog('V8 phase field protection error:', e.message);
        return null;
    }
}

function checkCrossLocationConsistency(filePath, toolInput, toolName) {
    const warnings = [];
    try {
        let stateData;
        if (toolName === 'Write' && toolInput.content && typeof toolInput.content === 'string') {
            try { stateData = JSON.parse(toolInput.content); } catch (e) { return { warnings }; }
        } else {
            try { stateData = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return { warnings }; }
        }

        if (!stateData || typeof stateData !== 'object') return { warnings };

        const phases = stateData.phases;
        const aw = stateData.active_workflow;

        if (phases && typeof phases === 'object' && aw && aw.phase_status && typeof aw.phase_status === 'object') {
            for (const [phaseKey, phaseData] of Object.entries(phases)) {
                if (!phaseData || typeof phaseData !== 'object') continue;
                if (phaseData.status && aw.phase_status[phaseKey] && phaseData.status !== aw.phase_status[phaseKey]) {
                    warnings.push(`[state-write-validator] V9-A WARNING: Phase status divergence for '${phaseKey}'.`);
                }
            }
        }

        if (stateData.current_phase && aw?.current_phase && stateData.current_phase !== aw.current_phase) {
            warnings.push(`[state-write-validator] V9-B WARNING: Current phase divergence.`);
        }
    } catch (e) {
        debugLog('V9 cross-location check error:', e.message);
    }
    return { warnings };
}

function check(ctx) {
    try {
        const input = ctx.input;
        if (!input || (input.tool_name !== 'Write' && input.tool_name !== 'Edit')) return { decision: 'allow' };

        const toolInput = input.tool_input || {};
        const filePath = toolInput.file_path || toolInput.filePath || '';
        if (!STATE_JSON_PATTERN.test(filePath)) return { decision: 'allow' };

        let diskState = null;
        try {
            if (fs.existsSync(filePath)) {
                diskState = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (e) { debugLog('Could not read disk state:', e.message); }

        const v7 = checkVersionLock(filePath, toolInput, input.tool_name, diskState);
        if (v7 && v7.decision === 'block') return v7;

        const v8 = checkPhaseFieldProtection(filePath, toolInput, input.tool_name, diskState);
        if (v8 && v8.decision === 'block') return v8;

        const allWarnings = [];
        const v9 = checkCrossLocationConsistency(filePath, toolInput, input.tool_name);
        allWarnings.push(...v9.warnings);

        let stateData;
        if (input.tool_name === 'Write' && toolInput.content && typeof toolInput.content === 'string') {
            try { stateData = JSON.parse(toolInput.content); } catch (e) { return { decision: 'allow' }; }
        } else {
            try { stateData = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return { decision: 'allow' }; }
        }

        const phases = stateData?.phases;
        if (phases && typeof phases === 'object') {
            for (const [phaseName, phaseData] of Object.entries(phases)) {
                if (!phaseData || typeof phaseData !== 'object') continue;
                allWarnings.push(...validatePhase(phaseName, phaseData, filePath));
            }
        }

        if (allWarnings.length > 0) return { decision: 'allow', stderr: allWarnings.join('\n') };

        return { decision: 'allow' };
    } catch (error) {
        debugLog('Error in state-logic:', error.message);
        return { decision: 'allow' };
    }
}

module.exports = {
    check,
    validatePhase,
    checkVersionLock,
    checkPhaseFieldProtection,
    checkCrossLocationConsistency
};
