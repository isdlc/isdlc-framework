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
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');

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

        // Generate change summary (non-blocking, runs before merge so diff is available)
        try {
            const slug = aw.slug || aw.artifact_folder;
            if (slug) {
                const generatorPath = path.join(projectRoot, 'src', 'antigravity', 'change-summary-generator.cjs');
                if (fs.existsSync(generatorPath)) {
                    execSync(`node "${generatorPath}" --folder "${slug}"`, { cwd: projectRoot, stdio: 'pipe', timeout: 30000 });
                }
            }
        } catch (e) { /* non-blocking — change summary is informational */ }

        // Determine if this workflow type uses branches
        const noBranchTypes = ['test-run', 'test-generate'];
        const requiresBranch = !noBranchTypes.includes(aw.type);

        // Get branch name (only for branch-requiring workflows)
        let branchName = null;
        if (requiresBranch) {
            const branchPrefix = aw.type === 'fix' ? 'bugfix' : 'feature';
            branchName = `${branchPrefix}/${aw.slug}`;
        }

        // Merge branch (only for branch-requiring workflows)
        let merged = false;
        if (requiresBranch && branchName && !args.skipMerge) {
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

        // Run post-workflow user hooks (informational, non-blocking)
        try {
            const hookCtx = buildContext(state);
            executeHooks('post-workflow', hookCtx);
        } catch (e) { /* post-workflow hooks are non-blocking */ }

        // GitHub issue close (non-blocking)
        let githubClosed = false;
        if (aw.source === 'github' && aw.source_id) {
            const match = aw.source_id.match(/^GH-(\d+)$/);
            if (match) {
                try {
                    execSync(`gh issue close ${match[1]}`, { cwd: projectRoot, stdio: 'pipe' });
                    githubClosed = true;
                } catch (e) { /* non-blocking — log but don't fail */ }
            }
        }

        // BACKLOG.md sync (non-blocking)
        let backlogUpdated = false;
        try {
            const backlogPath = path.join(projectRoot, 'BACKLOG.md');
            if (fs.existsSync(backlogPath)) {
                let content = fs.readFileSync(backlogPath, 'utf8');
                // Match by slug, source_id (e.g. #97), or item number from slug (e.g. REQ-0049)
                const slug = aw.slug || aw.artifact_folder || '';
                const issueNum = aw.source_id ? aw.source_id.replace(/^GH-/, '#') : null;
                const lines = content.split('\n');
                let matchIdx = -1;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (slug && line.includes(slug)) { matchIdx = i; break; }
                    if (issueNum && line.includes(issueNum) && /\[[ A~]\]/.test(line)) { matchIdx = i; break; }
                }
                if (matchIdx >= 0) {
                    lines[matchIdx] = lines[matchIdx].replace(/\[[ A~]\]/, '[x]');
                    fs.writeFileSync(backlogPath, lines.join('\n'), 'utf8');
                    backlogUpdated = true;
                }
            }
        } catch (e) { /* non-blocking */ }

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
            state_version: state.state_version,
            github_closed: githubClosed,
            backlog_updated: backlogUpdated
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
