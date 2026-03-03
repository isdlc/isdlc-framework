#!/usr/bin/env node
/**
 * iSDLC Antigravity - Workflow Init CLI
 * =======================================
 * Initializes a feature/fix/upgrade workflow:
 * - Validates constitution exists
 * - Checks no active workflow
 * - Creates active_workflow in state.json
 * - Creates feature branch
 *
 * Usage:
 *   node src/antigravity/workflow-init.cjs --type feature --description "Add dark mode"
 *   node src/antigravity/workflow-init.cjs --type fix --description "Login crash" --light
 *   node src/antigravity/workflow-init.cjs --type feature --slug "REQ-0042-dark-mode"
 *
 * Output (JSON):
 *   { "result": "INITIALIZED", "branch": "feature/REQ-0042-dark-mode", "workflow": {...} }
 *   { "result": "BLOCKED", "reason": "Active workflow already exists" }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectRoot, readState } = require('../claude/hooks/lib/common.cjs');

const WORKFLOW_PHASES = {
    feature: ['00-quick-scan', '01-requirements', '02-impact-analysis', '03-architecture', '04-design', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
    fix: ['01-requirements', '02-tracing', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
    upgrade: ['01-requirements', '02-impact-analysis', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
    'test-run': ['11-local-testing', '07-testing'],
    'test-generate': ['05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review']
};

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { type: null, description: null, slug: null, light: false, supervised: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--type' && args[i + 1]) { result.type = args[i + 1]; i++; }
        if (args[i] === '--description' && args[i + 1]) { result.description = args[i + 1]; i++; }
        if (args[i] === '--slug' && args[i + 1]) { result.slug = args[i + 1]; i++; }
        if (args[i] === '--light') result.light = true;
        if (args[i] === '--supervised') result.supervised = true;
    }
    return result;
}

function output(obj) { console.log(JSON.stringify(obj, null, 2)); }

function generateSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
}

function getNextSeqNum(projectRoot, prefix) {
    const reqDir = path.join(projectRoot, 'docs', 'requirements');
    if (!fs.existsSync(reqDir)) return '0001';
    let max = 0;
    for (const d of fs.readdirSync(reqDir)) {
        const m = d.match(new RegExp(`^${prefix}-(\\d+)-`));
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    }
    return String(max + 1).padStart(4, '0');
}

function main() {
    try {
        const args = parseArgs();
        if (!args.type) { output({ result: 'ERROR', message: 'Missing --type argument' }); process.exit(2); }
        if (!WORKFLOW_PHASES[args.type]) { output({ result: 'ERROR', message: `Unknown workflow type: ${args.type}` }); process.exit(2); }
        if (!args.description && !args.slug) { output({ result: 'ERROR', message: 'Need --description or --slug' }); process.exit(2); }

        const projectRoot = getProjectRoot();

        // Check constitution
        const constPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
        if (!fs.existsSync(constPath)) {
            output({ result: 'BLOCKED', reason: 'No constitution found. Run /discover first.' });
            process.exit(1);
        }

        // Check no active workflow
        const state = readState() || {};
        if (state.active_workflow) {
            output({
                result: 'BLOCKED',
                reason: 'Active workflow already exists',
                current_workflow: { type: state.active_workflow.type, phase: state.active_workflow.current_phase }
            });
            process.exit(1);
        }

        // Determine folder name
        const prefix = args.type === 'fix' ? 'BUG' : 'REQ';
        const seqNum = getNextSeqNum(projectRoot, prefix);
        const slug = args.slug || `${prefix}-${seqNum}-${generateSlug(args.description)}`;
        const branchPrefix = args.type === 'fix' ? 'bugfix' : 'feature';
        const branchName = `${branchPrefix}/${slug}`;

        // Determine phases
        let phases = [...WORKFLOW_PHASES[args.type]];
        if (args.light) {
            phases = phases.filter(p => p !== '03-architecture' && p !== '04-design');
        }

        // Build phase_status
        const phaseStatus = {};
        for (const p of phases) phaseStatus[p] = 'pending';
        phaseStatus[phases[0]] = 'in_progress';

        // Create active_workflow
        const workflow = {
            type: args.type,
            description: args.description || slug,
            slug,
            phases,
            current_phase: phases[0],
            current_phase_index: 0,
            phase_status: phaseStatus,
            artifact_folder: `docs/requirements/${slug}`,
            started_at: new Date().toISOString(),
            flags: { light: args.light, supervised: args.supervised }
        };

        // Update state
        state.active_workflow = workflow;
        state.state_version = (state.state_version || 0) + 1;

        const statePath = path.join(projectRoot, '.isdlc', 'state.json');
        const stateDir = path.dirname(statePath);
        if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        // Create branch
        let branchCreated = false;
        try {
            execSync(`git checkout -b ${branchName}`, { cwd: projectRoot, stdio: 'pipe' });
            branchCreated = true;
        } catch (e) {
            // Branch may already exist or git not available
        }

        output({
            result: 'INITIALIZED',
            workflow_type: args.type,
            slug,
            branch: branchName,
            branch_created: branchCreated,
            phases,
            current_phase: phases[0],
            artifact_folder: `docs/requirements/${slug}`,
            flags: { light: args.light, supervised: args.supervised }
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
