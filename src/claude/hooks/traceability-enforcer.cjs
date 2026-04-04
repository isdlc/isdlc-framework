#!/usr/bin/env node
'use strict';

/**
 * Traceability Enforcer Hook — REQ-GH-223 FR-006
 *
 * Blocks build-phase completion if any FR has no covering task.
 * Runs at implementation+ phases for feature workflows only.
 * Fail-open on any error (Article X).
 */

const fs = require('fs');
const path = require('path');
const { debugLog, logHookEvent, PHASE_PREFIXES } = require('./lib/common.cjs');

/**
 * @param {object} ctx - { input, state, manifest, requirements, workflows }
 * @returns {{ decision: 'allow'|'block', stopReason?: string, stderr?: string, stateModified?: boolean }}
 */
function check(ctx) {
    try {
        const state = ctx.state;
        if (!state?.active_workflow) return { decision: 'allow' };

        // Only activate for feature/build workflows
        if (state.active_workflow.type !== 'feature') return { decision: 'allow' };

        const phase = state.active_workflow.current_phase || '';
        // Only fire at implementation+ phases
        if (phase !== PHASE_PREFIXES.IMPLEMENTATION && phase !== '16-quality-loop') {
            return { decision: 'allow' };
        }

        const artifactFolder = state.active_workflow.artifact_folder;
        if (!artifactFolder) return { decision: 'allow' };

        const projectRoot = process.cwd();

        // Read tasks.md
        const tasksPath = path.join(projectRoot, 'docs', 'isdlc', 'tasks.md');
        if (!fs.existsSync(tasksPath)) {
            debugLog('traceability-enforcer: tasks.md not found, allowing (fail-open)');
            return { decision: 'allow' };
        }

        // Read requirements-spec.md
        const reqPath = path.join(projectRoot, 'docs', 'requirements', artifactFolder, 'requirements-spec.md');
        if (!fs.existsSync(reqPath)) {
            debugLog('traceability-enforcer: requirements-spec.md not found, allowing (fail-open)');
            return { decision: 'allow' };
        }

        const reqContent = fs.readFileSync(reqPath, 'utf8');
        const tasksContent = fs.readFileSync(tasksPath, 'utf8');

        // Extract task traces
        const taskTraces = new Set();
        const taskLineRegex = /^- \[[ X]\] T\d{3,4}[A-Z]?\s+.*?\|\s*traces:\s*(.+)$/gm;
        let match;
        while ((match = taskLineRegex.exec(tasksContent)) !== null) {
            const traces = match[1].split(',').map(t => t.trim());
            traces.forEach(t => taskTraces.add(t));
        }

        // Extract FRs from requirements
        const frRegex = /^###\s+(FR-\d{3}):\s*(.+)$/gm;
        const uncoveredFRs = [];
        while ((match = frRegex.exec(reqContent)) !== null) {
            if (!taskTraces.has(match[1])) {
                uncoveredFRs.push({ id: match[1], description: match[2].trim() });
            }
        }

        if (uncoveredFRs.length > 0) {
            const frList = uncoveredFRs.map(fr => `  - ${fr.id}: ${fr.description}`).join('\n');
            const stopReason =
                `TRACEABILITY ENFORCEMENT: The following FRs have no covering task:\n${frList}\n\n` +
                `Every FR must have at least one task with a matching traces: annotation.\n` +
                `Add tasks covering these requirements before the phase can advance.`;

            logHookEvent('traceability-enforcer', 'block', {
                phase,
                uncoveredFRs: uncoveredFRs.map(fr => fr.id)
            });

            return { decision: 'block', stopReason };
        }

        debugLog('traceability-enforcer: all FRs covered');
        return { decision: 'allow' };

    } catch (error) {
        debugLog('traceability-enforcer error:', error.message);
        return { decision: 'allow' }; // fail-open
    }
}

module.exports = { check };
