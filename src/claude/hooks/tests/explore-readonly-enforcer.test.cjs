/**
 * Tests for explore-readonly-enforcer.cjs hook
 * Traces to: FR-04, AC-04a-g, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'explore-readonly-enforcer.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'explore-ro-test-'));
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

function makeWriteInput(filePath) {
    return {
        tool_name: 'Write',
        tool_input: { file_path: filePath, content: 'test' }
    };
}

function makeEditInput(filePath) {
    return {
        tool_name: 'Edit',
        tool_input: { file_path: filePath, old_string: 'a', new_string: 'b' }
    };
}

describe('explore-readonly-enforcer hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-04a: blocks Write to project files in explore mode', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const result = runHook(tmpDir, makeWriteInput('/project/src/app.js'));
        assert.ok(result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'));
        assert.ok(result.stdout.includes('stopReason'));
        assert.ok(result.stdout.includes('READ-ONLY'));
    });

    it('AC-04b: blocks Edit to project files in explore mode', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const result = runHook(tmpDir, makeEditInput('/project/src/app.js'));
        assert.ok(result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'));
        assert.ok(result.stdout.includes('stopReason'));
    });

    it('AC-04c: allows Write to /tmp in explore mode', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const tmpFile = path.join(os.tmpdir(), 'scratch.txt');
        const result = runHook(tmpDir, makeWriteInput(tmpFile));
        assert.equal(result.stdout, '');
    });

    it('AC-04d: allows Write to state.json in explore mode', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const statePath = path.join(tmpDir, '.isdlc', 'state.json');
        const result = runHook(tmpDir, makeWriteInput(statePath));
        assert.equal(result.stdout, '');
    });

    it('AC-04e: allows all writes when explore mode NOT active', () => {
        writeState(tmpDir, { chat_explore_active: false });
        const result = runHook(tmpDir, makeWriteInput('/project/src/app.js'));
        assert.equal(result.stdout, '');
    });

    it('AC-04f: fails open when state.json unreadable', () => {
        // No state written
        const result = runHook(tmpDir, makeWriteInput('/project/src/app.js'));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('AC-04g: detects mode from chat_explore_active field', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const result = runHook(tmpDir, makeWriteInput('/project/README.md'));
        assert.ok(result.stdout.includes('stopReason'));
    });

    it('allows when chat_explore_active is missing (undefined)', () => {
        writeState(tmpDir, { some_other_field: true });
        const result = runHook(tmpDir, makeWriteInput('/project/src/app.js'));
        assert.equal(result.stdout, '');
    });

    it('allows non-Write/Edit tools', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const result = runHook(tmpDir, { tool_name: 'Bash', tool_input: { command: 'ls' } });
        assert.equal(result.stdout, '');
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });

    it('allows monorepo state.json writes in explore mode', () => {
        writeState(tmpDir, { chat_explore_active: true });
        const monoStatePath = path.join(tmpDir, '.isdlc', 'projects', 'my-app', 'state.json');
        const result = runHook(tmpDir, makeWriteInput(monoStatePath));
        assert.equal(result.stdout, '');
    });
});
