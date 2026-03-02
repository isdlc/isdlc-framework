/**
 * Tests for phase-transition-enforcer.cjs hook
 * Traces to: FR-01, AC-01a-h, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'phase-transition-enforcer.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-trans-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
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

function makeTaskOutput(text) {
    return {
        tool_name: 'Task',
        tool_result: { text }
    };
}

describe('phase-transition-enforcer hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-01a: detects "Would you like to proceed" pattern', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '06-implementation' } });
        const result = runHook(tmpDir, makeTaskOutput('Phase complete. Would you like to proceed to the next phase?'));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, ''); // PostToolUse: no stdout
        assert.ok(result.stderr.includes('TRANSITION WARNING'));
        assert.ok(result.stderr.includes('Would you like to proceed'));
    });

    it('AC-01b: detects "Ready to advance" pattern', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '03-architecture' } });
        const result = runHook(tmpDir, makeTaskOutput('All tasks done. Ready to advance?'));
        assert.ok(result.stderr.includes('TRANSITION WARNING'));
        assert.ok(result.stderr.includes('Ready to advance'));
    });

    it('AC-01c: detects "Should I continue" pattern', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '05-test-strategy' } });
        const result = runHook(tmpDir, makeTaskOutput('Work is done. Should I continue with the next phase?'));
        assert.ok(result.stderr.includes('TRANSITION WARNING'));
    });

    it('AC-01d: detects "Shall we proceed" pattern', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '06-implementation' } });
        const result = runHook(tmpDir, makeTaskOutput('Everything looks good. Shall we proceed?'));
        assert.ok(result.stderr.includes('TRANSITION WARNING'));
    });

    it('AC-01e: silent when no active workflow', () => {
        writeState(tmpDir, { active_workflow: null });
        const result = runHook(tmpDir, makeTaskOutput('Would you like to proceed?'));
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, '');
    });

    it('AC-01f: silent when no permission-asking patterns found', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '06-implementation' } });
        const result = runHook(tmpDir, makeTaskOutput('Implementation complete. All tests passing.'));
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, '');
    });

    it('AC-01g: fails open on errors (invalid JSON)', () => {
        const result = runHook(tmpDir, 'not json');
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('AC-01h: handles empty task output gracefully', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '06-implementation' } });
        const result = runHook(tmpDir, makeTaskOutput(''));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, '');
    });

    it('fails open when state.json is missing', () => {
        // Don't write state
        const result = runHook(tmpDir, makeTaskOutput('Would you like to proceed?'));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });

    it('detects "Do you want me to move forward" pattern', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '06-implementation' } });
        const result = runHook(tmpDir, makeTaskOutput('All done. Do you want me to move forward?'));
        assert.ok(result.stderr.includes('TRANSITION WARNING'));
    });

    it('detects case-insensitive patterns', () => {
        writeState(tmpDir, { active_workflow: { current_phase: '06-implementation' } });
        const result = runHook(tmpDir, makeTaskOutput('WOULD YOU LIKE TO PROCEED?'));
        assert.ok(result.stderr.includes('TRANSITION WARNING'));
    });
});
