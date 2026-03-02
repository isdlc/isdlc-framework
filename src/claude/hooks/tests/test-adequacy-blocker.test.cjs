/**
 * Tests for test-adequacy-blocker.cjs hook
 * Traces to: FR-07, AC-07a-f, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'test-adequacy-blocker.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-adequacy-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    const configDir = path.join(isdlcDir, 'config');
    fs.mkdirSync(configDir, { recursive: true });

    // Copy skills-manifest for detectPhaseDelegation
    const manifestSrc = path.join(__dirname, '..', 'config', 'skills-manifest.json');
    if (fs.existsSync(manifestSrc)) {
        fs.cpSync(manifestSrc, path.join(configDir, 'skills-manifest.json'));
    }

    return tmpDir;
}

function writeState(tmpDir, state) {
    fs.writeFileSync(
        path.join(tmpDir, '.isdlc', 'state.json'),
        JSON.stringify(state, null, 2)
    );
}

function runHook(tmpDir, stdinJson) {
    const stdinStr = typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson);
    const result = spawnSync('node', [HOOK_PATH], {
        cwd: tmpDir,
        input: stdinStr,
        env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: tmpDir,
            SKILL_VALIDATOR_DEBUG: '0',
            PATH: process.env.PATH
        },
        encoding: 'utf8',
        timeout: 5000
    });
    return {
        stdout: (result.stdout || '').trim(),
        stderr: (result.stderr || '').trim(),
        exitCode: result.status || 0
    };
}

function makeUpgradeTask() {
    return {
        tool_name: 'Task',
        tool_input: {
            prompt: 'Delegate to upgrade-engineer agent for Phase 14 upgrade plan analysis',
            description: 'Execute upgrade plan for dependency upgrade'
        }
    };
}

function makeNonUpgradeTask() {
    return {
        tool_name: 'Task',
        tool_input: {
            prompt: 'Delegate to requirements-analyst agent for Phase 01 requirements',
            description: 'Capture requirements'
        }
    };
}

describe('test-adequacy-blocker hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-07a: blocks when total_tests is 0', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '16-upgrade-plan' },
            discovery_context: {
                coverage_summary: { total_tests: 0, unit_test_pct: 0 }
            }
        });
        const result = runHook(tmpDir, makeUpgradeTask());
        assert.ok(result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'));
        assert.ok(result.stdout.includes('stopReason'));
        assert.ok(result.stdout.includes('total_tests is 0'));
    });

    it('AC-07b: blocks when unit_test_pct below threshold', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '16-upgrade-plan' },
            discovery_context: {
                coverage_summary: { total_tests: 50, unit_test_pct: 30 }
            }
        });
        const result = runHook(tmpDir, makeUpgradeTask());
        assert.ok(result.stdout.includes('stopReason'));
        assert.ok(result.stdout.includes('unit_test_pct'));
    });

    it('AC-07c: allows when coverage adequate', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '16-upgrade-plan' },
            discovery_context: {
                coverage_summary: { total_tests: 100, unit_test_pct: 80 }
            }
        });
        const result = runHook(tmpDir, makeUpgradeTask());
        assert.equal(result.stdout, '');
    });

    it('AC-07d: allows non-upgrade delegations', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '01-requirements' },
            discovery_context: {
                coverage_summary: { total_tests: 0, unit_test_pct: 0 }
            }
        });
        const result = runHook(tmpDir, makeNonUpgradeTask());
        assert.equal(result.stdout, '');
    });

    it('AC-07e: fails open when state.json unreadable', () => {
        // No state written
        const result = runHook(tmpDir, makeUpgradeTask());
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('AC-07f: fails open when coverage data missing', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '16-upgrade-plan' }
        });
        const result = runHook(tmpDir, makeUpgradeTask());
        assert.equal(result.stdout, '');
    });

    it('allows when coverage exactly at threshold', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '16-upgrade-plan' },
            discovery_context: {
                coverage_summary: { total_tests: 10, unit_test_pct: 50 }
            }
        });
        const result = runHook(tmpDir, makeUpgradeTask());
        assert.equal(result.stdout, '');
    });

    it('handles non-Task tool calls', () => {
        const result = runHook(tmpDir, { tool_name: 'Bash', tool_input: { command: 'ls' } });
        assert.equal(result.stdout, '');
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });

    it('handles invalid JSON stdin', () => {
        const result = runHook(tmpDir, 'not json');
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });
});
