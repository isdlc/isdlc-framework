#!/usr/bin/env node
/**
 * iSDLC Menu Interaction Tracker - PostToolUse Hook
 * ==================================================
 * Tracks A/R/C menu interactions for Phase 01 requirements elicitation.
 *
 * Monitors for:
 * - Menu presentations (A/R/C pattern)
 * - User selections
 * - Final save/continue selection
 *
 * Version: 1.1.0
 */

const {
    debugLog,
    getTimestamp
} = require('./lib/common.cjs');

const fs = require('fs');
const path = require('path');

// REQ-0092: Bridge-first delegation to core observability
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', 'observability.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}

/**
 * Menu patterns to detect in output
 */
const MENU_PRESENTATION_PATTERNS = [
    /\[A\]\s*Adjust/i,
    /\[R\]\s*Refine/i,
    /\[C\]\s*Continue/i,
    /\[S\]\s*Save/i,
    /\[X\]\s*Exit/i,
    /Your choice:/i,
    /Enter selection/i,
    /Select an option/i
];

/**
 * Selection patterns to detect user choices
 */
const SELECTION_PATTERNS = [
    { pattern: /(?:user\s+)?select(?:ed|ion)?:?\s*\[?A\]?/i, selection: 'adjust' },
    { pattern: /(?:user\s+)?select(?:ed|ion)?:?\s*\[?R\]?/i, selection: 'refine' },
    { pattern: /(?:user\s+)?select(?:ed|ion)?:?\s*\[?C\]?/i, selection: 'continue' },
    { pattern: /(?:user\s+)?select(?:ed|ion)?:?\s*\[?S\]?/i, selection: 'save' },
    { pattern: /(?:user\s+)?select(?:ed|ion)?:?\s*\[?X\]?/i, selection: 'exit' },
    { pattern: /chose:?\s*\[?A\]?\s*adjust/i, selection: 'adjust' },
    { pattern: /chose:?\s*\[?R\]?\s*refine/i, selection: 'refine' },
    { pattern: /chose:?\s*\[?C\]?\s*continue/i, selection: 'continue' },
    { pattern: /chose:?\s*\[?S\]?\s*save/i, selection: 'save' },
    { pattern: /chose:?\s*\[?X\]?\s*exit/i, selection: 'exit' },
    { pattern: /proceeding\s+to\s+next\s+step/i, selection: 'continue' },
    { pattern: /saving\s+artifacts/i, selection: 'save' },
    { pattern: /artifacts\s+saved/i, selection: 'save' },
    { pattern: /requirements\s+finalized/i, selection: 'save' }
];

/**
 * Step completion patterns
 */
const STEP_PATTERNS = [
    { pattern: /step\s+1.*(?:complete|done)/i, step: 1, name: 'project_discovery' },
    { pattern: /step\s+2.*(?:complete|done)/i, step: 2, name: 'user_personas' },
    { pattern: /step\s+3.*(?:complete|done)/i, step: 3, name: 'core_features' },
    { pattern: /step\s+4.*(?:complete|done)/i, step: 4, name: 'nfr' },
    { pattern: /step\s+5.*(?:complete|done)/i, step: 5, name: 'user_stories' },
    { pattern: /step\s+6.*(?:complete|done)/i, step: 6, name: 'prioritization' },
    { pattern: /step\s+7.*(?:complete|done)/i, step: 7, name: 'finalization' },
    { pattern: /project\s+discovery.*complete/i, step: 1, name: 'project_discovery' },
    { pattern: /persona.*identification.*complete/i, step: 2, name: 'user_personas' },
    { pattern: /functional\s+requirements.*complete/i, step: 3, name: 'core_features' },
    { pattern: /non-functional.*requirements.*complete/i, step: 4, name: 'nfr' },
    { pattern: /user\s+stories.*complete/i, step: 5, name: 'user_stories' },
    { pattern: /prioritization.*complete/i, step: 6, name: 'prioritization' }
];

/**
 * Detect menu activity in text
 */
function detectMenuActivity(text) {
    if (!text) return null;

    const results = {
        menu_presented: false,
        selection: null,
        step_completed: null
    };

    // Check for menu presentation (need at least 2 menu patterns)
    const menuMatches = MENU_PRESENTATION_PATTERNS.filter(p => p.test(text));
    if (menuMatches.length >= 2) {
        results.menu_presented = true;
    }

    // Check for selection
    for (const { pattern, selection } of SELECTION_PATTERNS) {
        if (pattern.test(text)) {
            results.selection = selection;
            break;
        }
    }

    // Check for step completion
    for (const { pattern, step, name } of STEP_PATTERNS) {
        if (pattern.test(text)) {
            results.step_completed = { step, name };
            break;
        }
    }

    // Return null if nothing detected
    if (!results.menu_presented && !results.selection && !results.step_completed) {
        return null;
    }

    return results;
}

/**
 * Dispatcher-compatible check function.
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow', stdout?: string, stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const input = ctx.input;
        if (!input) {
            return { decision: 'allow' };
        }

        // Get the tool result text
        const result = typeof input.tool_result === 'string'
            ? input.tool_result
            : JSON.stringify(input.tool_result || '');

        // Also check tool input (for agent responses)
        const prompt = input.tool_input?.prompt || '';
        const combinedText = result + ' ' + prompt;

        // Load state
        const state = ctx.state;
        if (!state) {
            return { decision: 'allow' };
        }

        // Only track during active workflows in Phase 01
        if (!state.active_workflow) {
            return { decision: 'allow' };
        }
        const currentPhase = (state.active_workflow && state.active_workflow.current_phase) || state.current_phase;
        if (currentPhase !== '01-requirements') {
            return { decision: 'allow' };
        }

        // Check if iteration enforcement is enabled
        if (state.iteration_enforcement?.enabled === false) {
            return { decision: 'allow' };
        }

        // Detect menu activity
        const activity = detectMenuActivity(combinedText);
        if (!activity) {
            return { decision: 'allow' };
        }

        debugLog('Menu activity detected:', activity);

        // Initialize state structure
        if (!state.phases) state.phases = {};
        if (!state.phases[currentPhase]) state.phases[currentPhase] = { status: 'in_progress' };
        // BUG 0.11 fix: type-check iteration_requirements -- reset if not a plain object
        const iterReqs = state.phases[currentPhase].iteration_requirements;
        if (!iterReqs || typeof iterReqs !== 'object' || Array.isArray(iterReqs)) {
            state.phases[currentPhase].iteration_requirements = {};
        }

        // Get or initialize elicitation state
        let elicitState = state.phases[currentPhase].iteration_requirements.interactive_elicitation;
        if (!elicitState) {
            elicitState = {
                required: true,
                completed: false,
                menu_interactions: 0,
                selections: [],
                steps_completed: [],
                started_at: getTimestamp()
            };
        }

        let outputMessage = '';

        // Update based on activity
        if (activity.menu_presented) {
            elicitState.menu_interactions = (elicitState.menu_interactions || 0) + 1;
            elicitState.last_menu_at = getTimestamp();
            debugLog('Menu interaction count:', elicitState.menu_interactions);
        }

        if (activity.selection) {
            const selectionEntry = {
                selection: activity.selection,
                timestamp: getTimestamp()
            };
            elicitState.selections = elicitState.selections || [];
            elicitState.selections.push(selectionEntry);
            elicitState.last_selection = activity.selection;
            elicitState.last_selection_at = getTimestamp();

            // Check for final selection
            if (activity.selection === 'save') {
                elicitState.completed = true;
                elicitState.final_selection = 'save';
                elicitState.completed_at = getTimestamp();

                outputMessage = `\n\n✅ INTERACTIVE ELICITATION COMPLETED\n` +
                    `Final selection: SAVE\n` +
                    `Menu interactions: ${elicitState.menu_interactions}\n` +
                    `Steps completed: ${(elicitState.steps_completed || []).length}\n\n` +
                    `Interactive elicitation requirement: SATISFIED\n` +
                    `You may now proceed with constitutional validation.`;

            } else if (activity.selection === 'exit') {
                elicitState.completed = true;
                elicitState.final_selection = 'exit';
                elicitState.completed_at = getTimestamp();

                outputMessage = `\n\n⚠️ INTERACTIVE ELICITATION EXITED\n` +
                    `User chose to exit.\n` +
                    `Verify artifacts were saved before proceeding.`;

            } else if (activity.selection === 'continue') {
                outputMessage = `\n\n→ Proceeding to next step (${elicitState.menu_interactions} interactions so far)`;
            }
        }

        if (activity.step_completed) {
            elicitState.steps_completed = elicitState.steps_completed || [];
            if (!elicitState.steps_completed.includes(activity.step_completed.name)) {
                elicitState.steps_completed.push(activity.step_completed.name);
                elicitState.last_step_completed = activity.step_completed;
                elicitState.last_step_at = getTimestamp();

                debugLog('Step completed:', activity.step_completed);
            }
        }

        // Save updated state in memory
        state.phases[currentPhase].iteration_requirements.interactive_elicitation = elicitState;

        return {
            decision: 'allow',
            stdout: outputMessage || undefined,
            stateModified: true
        };

    } catch (error) {
        debugLog('Error in menu-tracker:', error.message);
        return { decision: 'allow' };
    }
}

// Export check for dispatcher use
module.exports = { check };

// Standalone execution
if (require.main === module) {
    const { readStdin, readState, writeState: writeStateFn, loadManifest, loadIterationRequirements, loadWorkflowDefinitions } = require('./lib/common.cjs');

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
            if (result.stateModified && state) {
                writeStateFn(state);
            }
            process.exit(0);
        } catch (e) { process.exit(0); }
    })();
}
