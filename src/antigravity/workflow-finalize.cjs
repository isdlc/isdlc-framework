#!/usr/bin/env node
/**
 * iSDLC Antigravity - Workflow Finalize CLI
 * ==========================================
 * Finalizes a completed workflow:
 * - Merges branch to main
 * - Moves workflow to history
 * - Clears active_workflow
 *
 * Usage:
 *   node src/antigravity/workflow-finalize.cjs
 *   node src/antigravity/workflow-finalize.cjs --skip-merge
 *
 * Output (JSON):
 *   { "result": "FINALIZED", "branch": "...", "merged": true }
 *   { "result": "NOT_COMPLETE", ... }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectRoot, readState } = require('../claude/hooks/lib/common.cjs');

function parseArgs() {
    const args = process.argv.slice(2);
    return { skipMerge: args.includes('--skip-merge') };
}

function output(obj) { console.log(JSON.stringify(obj, null, 2)); }

function main() {
    try {
        const args = parseArgs();
        const projectRoot = getProjectRoot();
        const state = readState();

        if (!state || !state.active_workflow) {
            output({ result: 'ERROR', message: 'No active workflow to finalize' });
            process.exit(2);
        }

        const aw = state.active_workflow;
        const phases = aw.phases || [];
        const lastPhase = phases[phases.length - 1];

        // Check if workflow is complete
        if (aw.current_phase !== lastPhase || aw.phase_status?.[lastPhase] !== 'completed') {
            const pending = phases.filter(p => aw.phase_status?.[p] !== 'completed');
            output({
                result: 'NOT_COMPLETE',
                current_phase: aw.current_phase,
                pending_phases: pending,
                message: `Workflow not complete. ${pending.length} phases remaining.`
            });
            process.exit(1);
        }

        // Get branch name
        const branchPrefix = aw.type === 'fix' ? 'bugfix' : 'feature';
        const branchName = `${branchPrefix}/${aw.slug}`;

        // Merge branch
        let merged = false;
        if (!args.skipMerge) {
            try {
                // Commit any uncommitted work
                try { execSync('git add -A && git commit -m "Finalize workflow" --allow-empty', { cwd: projectRoot, stdio: 'pipe' }); } catch (e) { /* may be nothing to commit */ }
                // Checkout main and merge
                execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
                execSync(`git merge --no-ff ${branchName} -m "Merge ${branchName}"`, { cwd: projectRoot, stdio: 'pipe' });
                // Delete branch
                try { execSync(`git branch -d ${branchName}`, { cwd: projectRoot, stdio: 'pipe' }); } catch (e) { /* non-critical */ }
                merged = true;
            } catch (e) {
                // Merge failed — stay on current branch
                merged = false;
            }
        }

        // Move to history
        if (!state.workflow_history) state.workflow_history = [];
        state.workflow_history.push({
            ...aw,
            status: 'completed',
            completed_at: new Date().toISOString(),
            merged
        });

        // Clear active workflow
        delete state.active_workflow;
        state.state_version = (state.state_version || 0) + 1;

        const statePath = path.join(projectRoot, '.isdlc', 'state.json');
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        output({
            result: 'FINALIZED',
            workflow_type: aw.type,
            slug: aw.slug,
            branch: branchName,
            merged,
            phases_completed: phases.length,
            state_version: state.state_version
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
