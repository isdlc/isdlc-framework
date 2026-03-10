'use strict';

/**
 * iSDLC Phase Advance Skip Logic - Test Suite (CJS)
 * ==================================================
 * Integration tests for phase-advance.cjs skip logic (REQ-0056 FR-003)
 *
 * Tests that phase-advance correctly skips over phases with status "skipped"
 * in the active workflow's phase_status map.
 *
 * Run: node --test src/claude/hooks/tests/test-phase-advance-skip.test.cjs
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
    setupTestEnv,
    cleanupTestEnv,
    getTestDir,
    writeState,
    readState
} = require('./hook-test-utils.cjs');

const PHASE_ADVANCE_PATH = path.resolve(__dirname, '..', '..', '..', 'antigravity', 'phase-advance.cjs');

// Lib files needed by phase-advance.cjs
const LIB_SRC = path.resolve(__dirname, '..', 'lib');
const HOOKS_CONFIG_SRC = path.resolve(__dirname, '..', 'config');

/**
 * Set up the test environment with the files phase-advance.cjs needs:
 * - .isdlc/state.json (via setupTestEnv)
 * - lib/common.cjs, lib/gate-logic.cjs, lib/user-hooks.cjs (copied)
 * - .claude/hooks/config/iteration-requirements.json (via setupTestEnv)
 * - docs/isdlc/constitution.md (stub)
 */
function setupPhaseAdvanceEnv(stateOverrides) {
    const testDir = setupTestEnv(stateOverrides);

    // Copy lib files that phase-advance requires
    const libDir = path.join(testDir, 'src', 'claude', 'hooks', 'lib');
    fs.mkdirSync(libDir, { recursive: true });

    const libFiles = ['common.cjs', 'gate-logic.cjs', 'user-hooks.cjs'];
    for (const f of libFiles) {
        const src = path.join(LIB_SRC, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(libDir, f));
        }
    }

    // Create constitution stub (gate-logic checks for it)
    const constDir = path.join(testDir, 'docs', 'isdlc');
    fs.mkdirSync(constDir, { recursive: true });
    fs.writeFileSync(path.join(constDir, 'constitution.md'), '# Test Constitution\n');

    // Create user-hooks config stub
    const hooksDir = path.join(testDir, '.claude', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    // Override iteration-requirements with all-disabled config so we purely test skip logic
    const configDir = path.join(testDir, '.claude', 'hooks', 'config');
    fs.mkdirSync(configDir, { recursive: true });
    const disabledReqs = {
        version: '1.0.0-test',
        phase_requirements: {},
        gate_blocking_rules: {
            block_on_incomplete_test_iteration: false,
            block_on_incomplete_constitutional: false,
            block_on_incomplete_elicitation: false,
            block_on_missing_agent_delegation: false,
            block_on_missing_artifacts: false
        }
    };
    fs.writeFileSync(
        path.join(configDir, 'iteration-requirements.json'),
        JSON.stringify(disabledReqs, null, 2)
    );

    return testDir;
}

/**
 * Run phase-advance.cjs in the test directory.
 * Returns { stdout, stderr, code, parsed }.
 */
function runPhaseAdvance(testDir) {
    try {
        const stdout = execSync(`node "${PHASE_ADVANCE_PATH}"`, {
            cwd: testDir,
            env: { ...process.env, CLAUDE_PROJECT_DIR: testDir },
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 10000
        }).toString();
        let parsed;
        try { parsed = JSON.parse(stdout); } catch (e) { parsed = null; }
        return { stdout, code: 0, parsed };
    } catch (err) {
        const stdout = err.stdout ? err.stdout.toString() : '';
        let parsed;
        try { parsed = JSON.parse(stdout); } catch (e) { parsed = null; }
        return { stdout, stderr: err.stderr ? err.stderr.toString() : '', code: err.status, parsed };
    }
}

// =============================================================================
// Phase advance skip logic
// =============================================================================

describe('phase-advance skip logic (REQ-0056 FR-003)', () => {
    let savedEnv;

    before(() => {
        savedEnv = { ...process.env };
    });

    after(() => {
        process.env = savedEnv;
    });

    afterEach(() => {
        cleanupTestEnv();
    });

    function afterEach() {
        // Inline cleanup
    }

    // Helper: build a minimal workflow state for testing skip behavior.
    // Gate requirements are disabled by using a phase that has no requirements.
    function buildWorkflowState(phases, currentIndex, phaseStatus) {
        return {
            active_workflow: {
                type: 'feature',
                description: 'test',
                slug: 'test-slug',
                phases,
                current_phase: phases[currentIndex],
                current_phase_index: currentIndex,
                phase_status: phaseStatus,
                started_at: new Date().toISOString(),
                flags: {}
            },
            phases: {},
            state_version: 1
        };
    }

    // ---- Normal advance (no skipped phases) ----

    it('T01: advances to next phase when no phases are skipped', () => {
        const phases = ['00-quick-scan', '01-requirements', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '01-requirements': 'pending',
            '06-implementation': 'pending'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'ADVANCED');
        assert.strictEqual(result.parsed.from, '00-quick-scan');
        assert.strictEqual(result.parsed.to, '01-requirements');
    });

    // ---- Next phase is skipped → skip to the one after ----

    it('T02: skips over a single skipped phase', () => {
        const phases = ['00-quick-scan', '01-requirements', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '01-requirements': 'skipped',
            '06-implementation': 'pending'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'ADVANCED');
        assert.strictEqual(result.parsed.from, '00-quick-scan');
        assert.strictEqual(result.parsed.to, '06-implementation');
    });

    // ---- Multiple consecutive skipped phases ----

    it('T03: skips over multiple consecutive skipped phases', () => {
        const phases = ['00-quick-scan', '01-requirements', '03-architecture', '04-design', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '01-requirements': 'skipped',
            '03-architecture': 'skipped',
            '04-design': 'skipped',
            '06-implementation': 'pending'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'ADVANCED');
        assert.strictEqual(result.parsed.from, '00-quick-scan');
        assert.strictEqual(result.parsed.to, '06-implementation');
    });

    // ---- All remaining phases skipped → WORKFLOW_COMPLETE ----

    it('T04: all remaining phases skipped → WORKFLOW_COMPLETE', () => {
        const phases = ['00-quick-scan', '01-requirements', '03-architecture'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '01-requirements': 'skipped',
            '03-architecture': 'skipped'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'WORKFLOW_COMPLETE');
    });

    // ---- Last phase → WORKFLOW_COMPLETE ----

    it('T05: at last phase → WORKFLOW_COMPLETE', () => {
        const phases = ['00-quick-scan', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'completed',
            '06-implementation': 'in_progress'
        };
        const state = buildWorkflowState(phases, 1, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'WORKFLOW_COMPLETE');
    });

    // ---- State file is updated correctly after skip ----

    it('T06: state.json updated correctly after skipping phases', () => {
        const phases = ['00-quick-scan', '01-requirements', '03-architecture', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '01-requirements': 'skipped',
            '03-architecture': 'skipped',
            '06-implementation': 'pending'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        runPhaseAdvance(testDir);

        const updatedState = JSON.parse(
            fs.readFileSync(path.join(testDir, '.isdlc', 'state.json'), 'utf8')
        );
        const aw = updatedState.active_workflow;

        assert.strictEqual(aw.current_phase, '06-implementation');
        assert.strictEqual(aw.current_phase_index, 3);
        assert.strictEqual(aw.phase_status['00-quick-scan'], 'completed');
        assert.strictEqual(aw.phase_status['06-implementation'], 'in_progress');
        // Skipped phases remain skipped
        assert.strictEqual(aw.phase_status['01-requirements'], 'skipped');
        assert.strictEqual(aw.phase_status['03-architecture'], 'skipped');
    });

    // ---- phases_remaining is correct ----

    it('T07: phases_remaining count is correct after skip', () => {
        const phases = ['00-quick-scan', '01-requirements', '06-implementation', '08-code-review'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '01-requirements': 'skipped',
            '06-implementation': 'pending',
            '08-code-review': 'pending'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'ADVANCED');
        assert.strictEqual(result.parsed.to, '06-implementation');
        assert.strictEqual(result.parsed.phases_remaining, 1); // only 08-code-review remains
    });

    // ---- Skip at middle of workflow ----

    it('T08: skip works from middle of workflow, not just start', () => {
        const phases = ['00-quick-scan', '01-requirements', '03-architecture', '04-design', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'completed',
            '01-requirements': 'in_progress',
            '03-architecture': 'skipped',
            '04-design': 'skipped',
            '06-implementation': 'pending'
        };
        const state = buildWorkflowState(phases, 1, phaseStatus);
        const testDir = setupPhaseAdvanceEnv(state);

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'ADVANCED');
        assert.strictEqual(result.parsed.from, '01-requirements');
        assert.strictEqual(result.parsed.to, '06-implementation');
    });

    // ---- No active workflow → ERROR ----

    it('T09: no active workflow → ERROR', () => {
        const testDir = setupPhaseAdvanceEnv({ phases: {}, state_version: 1 });
        // Remove active_workflow from state
        const statePath = path.join(testDir, '.isdlc', 'state.json');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        delete state.active_workflow;
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

        const result = runPhaseAdvance(testDir);

        assert.strictEqual(result.parsed.result, 'ERROR');
    });

    // ---- state_version increments ----

    it('T10: state_version increments after advance', () => {
        const phases = ['00-quick-scan', '06-implementation'];
        const phaseStatus = {
            '00-quick-scan': 'in_progress',
            '06-implementation': 'pending'
        };
        const state = buildWorkflowState(phases, 0, phaseStatus);
        state.state_version = 5;
        const testDir = setupPhaseAdvanceEnv(state);

        runPhaseAdvance(testDir);

        const updatedState = JSON.parse(
            fs.readFileSync(path.join(testDir, '.isdlc', 'state.json'), 'utf8')
        );
        assert.strictEqual(updatedState.state_version, 6);
    });
});
