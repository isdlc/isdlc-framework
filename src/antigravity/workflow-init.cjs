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
const { getProjectRoot, readState, readProcessConfig } = require('../claude/hooks/lib/common.cjs');
const { executeHooks, buildContext } = require('../claude/hooks/lib/user-hooks.cjs');

const WORKFLOW_PHASES = {
    feature: ['00-quick-scan', '01-requirements', '02-impact-analysis', '03-architecture', '04-design', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
    fix: ['01-requirements', '02-tracing', '05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review'],
    upgrade: ['15-upgrade-plan', '15-upgrade-execute', '08-code-review'],
    'test-run': ['11-local-testing', '07-testing'],
    'test-generate': ['05-test-strategy', '06-implementation', '16-quality-loop', '08-code-review']
};

const REQUIRES_BRANCH = {
    feature: true, fix: true, upgrade: true,
    'test-run': false, 'test-generate': false
};

/** All known phase identifiers — used to validate process.json entries (REQ-0056 FR-006) */
const PHASE_LIBRARY = [
    '00-quick-scan', '01-requirements', '02-impact-analysis', '02-tracing',
    '03-architecture', '04-design', '05-test-strategy', '06-implementation',
    '07-testing', '08-code-review', '11-local-testing',
    '15-upgrade-plan', '15-upgrade-execute', '16-quality-loop'
];

/**
 * Compute the final phase array merging process.json config with defaults (REQ-0056).
 * Phases in the config are active; default phases NOT in config are marked "skipped".
 * Config phases NOT in defaults are added (recomposition, FR-006).
 *
 * @param {string[]|null} configPhases - Phase array from process.json, or null
 * @param {string[]} defaultPhases - Built-in default phases for this workflow type
 * @returns {{ phases: string[], phaseStatus: object, skippedReasons: object }}
 */
function computePhaseArray(configPhases, defaultPhases) {
    if (!configPhases) {
        // No config — use defaults unchanged
        const phaseStatus = {};
        for (const p of defaultPhases) phaseStatus[p] = 'pending';
        return { phases: [...defaultPhases], phaseStatus, skippedReasons: {} };
    }

    // Validate config phases against PHASE_LIBRARY
    const validConfigPhases = [];
    for (const p of configPhases) {
        if (PHASE_LIBRARY.includes(p)) {
            validConfigPhases.push(p);
        } else {
            process.stderr.write(`[process-config] Unknown phase "${p}" in process.json, ignoring\n`);
        }
    }

    // Empty after validation → warn and use defaults
    if (validConfigPhases.length === 0) {
        process.stderr.write('[process-config] process.json phase array is empty after validation, using defaults\n');
        const phaseStatus = {};
        for (const p of defaultPhases) phaseStatus[p] = 'pending';
        return { phases: [...defaultPhases], phaseStatus, skippedReasons: {} };
    }

    const configSet = new Set(validConfigPhases);
    const phases = [];
    const phaseStatus = {};
    const skippedReasons = {};

    // Walk defaults: active if in config, skipped if not
    for (const p of defaultPhases) {
        phases.push(p);
        if (configSet.has(p)) {
            phaseStatus[p] = 'pending';
            configSet.delete(p);
        } else {
            phaseStatus[p] = 'skipped';
            skippedReasons[p] = 'process.json override';
        }
    }

    // Recomposition: config phases NOT in defaults get added at the end
    for (const p of validConfigPhases) {
        if (configSet.has(p)) {
            phases.push(p);
            phaseStatus[p] = 'pending';
            configSet.delete(p);
        }
    }

    return { phases, phaseStatus, skippedReasons };
}

/**
 * Print a visual phase list at workflow start (REQ-0056 FR-004).
 * Active phases: [ ] 01-requirements
 * Skipped phases: [x] 03-architecture (skipped: process.json override)
 */
function printPhaseList(phases, phaseStatus, skippedReasons) {
    process.stderr.write('\nPhase sequence:\n');
    for (const p of phases) {
        if (phaseStatus[p] === 'skipped') {
            const reason = skippedReasons[p] || 'skipped';
            process.stderr.write(`  [x] ${p} (skipped: ${reason})\n`);
        } else {
            process.stderr.write(`  [ ] ${p}\n`);
        }
    }
    process.stderr.write('\n');
}

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { type: null, description: null, slug: null, light: false, supervised: false, startPhase: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--type' && args[i + 1]) { result.type = args[i + 1]; i++; }
        if (args[i] === '--description' && args[i + 1]) { result.description = args[i + 1]; i++; }
        if (args[i] === '--slug' && args[i + 1]) { result.slug = args[i + 1]; i++; }
        if (args[i] === '--start-phase' && args[i + 1]) { result.startPhase = args[i + 1]; i++; }
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

        const requiresBranch = REQUIRES_BRANCH[args.type] !== false;

        // Determine slug and branch (only for branch-requiring workflows)
        let slug, branchName, artifactFolder;
        if (requiresBranch) {
            const prefix = args.type === 'fix' ? 'BUG' : 'REQ';
            const seqNum = getNextSeqNum(projectRoot, prefix);
            slug = args.slug || `${prefix}-${seqNum}-${generateSlug(args.description)}`;
            const branchPrefix = args.type === 'fix' ? 'bugfix' : 'feature';
            branchName = `${branchPrefix}/${slug}`;
            artifactFolder = slug;
        } else {
            slug = args.type;
            branchName = null;
            artifactFolder = null;
        }

        // Determine phases (REQ-0056: process.json override)
        const defaultPhases = [...WORKFLOW_PHASES[args.type]];
        const processConfig = readProcessConfig(projectRoot);
        const configPhasesRaw = processConfig && processConfig[args.type];

        // Validate config phase array type
        let configPhases = null;
        if (configPhasesRaw != null) {
            if (Array.isArray(configPhasesRaw) && configPhasesRaw.every(p => typeof p === 'string')) {
                configPhases = configPhasesRaw;
            } else {
                process.stderr.write(`[process-config] "${args.type}" key in process.json must be a string array, using defaults\n`);
            }
        }

        let phases, phaseStatus, skippedReasons;
        if (configPhases) {
            // process.json takes precedence over --light (FR-001, precedence order)
            ({ phases, phaseStatus, skippedReasons } = computePhaseArray(configPhases, defaultPhases));
        } else if (args.light) {
            // Existing --light behavior (backward compat)
            phases = defaultPhases.filter(p => p !== '03-architecture' && p !== '04-design');
            phaseStatus = {};
            for (const p of phases) phaseStatus[p] = 'pending';
            skippedReasons = {};
        } else {
            // Defaults
            phases = defaultPhases;
            phaseStatus = {};
            for (const p of phases) phaseStatus[p] = 'pending';
            skippedReasons = {};
        }

        // Skip to start phase (for pre-analyzed items)
        if (args.startPhase) {
            const idx = phases.indexOf(args.startPhase);
            if (idx > 0) {
                phases = phases.slice(idx);
                // Rebuild phaseStatus for remaining phases only
                const newStatus = {};
                for (const p of phases) newStatus[p] = phaseStatus[p] || 'pending';
                phaseStatus = newStatus;
            }
        }

        // Set first non-skipped phase to in_progress
        const firstActive = phases.find(p => phaseStatus[p] !== 'skipped');
        if (firstActive) phaseStatus[firstActive] = 'in_progress';

        // Print visual phase list (FR-004)
        if (Object.keys(skippedReasons).length > 0 || configPhases) {
            printPhaseList(phases, phaseStatus, skippedReasons);
        }

        // Create active_workflow
        const workflow = {
            type: args.type,
            description: args.description || slug,
            slug,
            phases,
            current_phase: firstActive || phases[0],
            current_phase_index: phases.indexOf(firstActive || phases[0]),
            phase_status: phaseStatus,
            started_at: new Date().toISOString(),
            flags: { light: args.light, supervised: args.supervised }
        };
        if (artifactFolder) workflow.artifact_folder = artifactFolder;

        // Copy source/source_id from meta.json if artifact folder exists
        if (slug) {
            try {
                const metaPath = path.join(projectRoot, 'docs', 'requirements', slug, 'meta.json');
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.source) workflow.source = meta.source;
                    if (meta.source_id) workflow.source_id = meta.source_id;
                }
            } catch (e) { /* non-critical — source tracking is best-effort */ }
        }

        // Update state
        state.active_workflow = workflow;
        state.state_version = (state.state_version || 0) + 1;

        const statePath = path.join(projectRoot, '.isdlc', 'state.json');
        const stateDir = path.dirname(statePath);
        if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');

        // Create branch (only for branch-requiring workflows)
        let branchCreated = false;
        if (requiresBranch && branchName) {
            try {
                execSync(`git checkout -b ${branchName}`, { cwd: projectRoot, stdio: 'pipe' });
                branchCreated = true;
            } catch (e) {
                // Branch may already exist or git not available
            }
        }

        // Run pre-workflow user hooks (informational -- blocks reported but don't prevent init)
        try {
            const hookCtx = buildContext(state);
            executeHooks('pre-workflow', hookCtx);
        } catch (e) { /* pre-workflow hooks are non-blocking */ }

        output({
            result: 'INITIALIZED',
            workflow_type: args.type,
            slug,
            branch: branchName,
            branch_created: branchCreated,
            phases,
            current_phase: phases[0],
            artifact_folder: artifactFolder,
            flags: { light: args.light, supervised: args.supervised }
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

// Guard for testability: only run main() when executed directly
if (require.main === module) {
    main();
}

// Export internals for unit testing (REQ-0056)
module.exports = { computePhaseArray, printPhaseList, PHASE_LIBRARY, WORKFLOW_PHASES };
