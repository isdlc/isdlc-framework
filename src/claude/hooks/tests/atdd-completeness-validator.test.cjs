/**
 * Tests for atdd-completeness-validator.cjs hook
 * Traces to: FR-05, AC-05a-f, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'atdd-completeness-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atdd-val-test-'));
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

// REQ-GH-216: write .isdlc/config.json with atdd section override
function writeAtddConfig(tmpDir, atddOverride) {
    fs.writeFileSync(
        path.join(tmpDir, '.isdlc', 'config.json'),
        JSON.stringify({ atdd: atddOverride }, null, 2)
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

function makeBashOutput(command, testOutput) {
    return {
        tool_name: 'Bash',
        tool_input: { command },
        tool_result: { text: testOutput }
    };
}

function makeAtddState(phase) {
    return {
        active_workflow: {
            current_phase: phase,
            options: {}
        }
    };
}

describe('atdd-completeness-validator hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-05a: detects P1 tests before P0 pass', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        const output = 'P0 test auth - fail\nP0 test setup - pass\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.ok(result.stderr.includes('ATDD PRIORITY VIOLATIONS'));
        assert.ok(result.stderr.includes('P0'));
    });

    it('AC-05b: detects orphaned test.skip at P0', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        const output = 'P0 test auth - pass\nP0 test login - skip\nP0 test setup - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.ok(result.stderr.includes('ATDD PRIORITY VIOLATIONS'));
        assert.ok(result.stderr.includes('skipped'));
    });

    it('AC-05c / TC-T002-03: silent when atdd.enabled=false in config', () => {
        writeState(tmpDir, {
            active_workflow: {
                current_phase: '06-implementation',
                options: {}
            }
        });
        writeAtddConfig(tmpDir, { enabled: false });
        const output = 'P0 test auth - fail\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.equal(result.stderr, '');
    });

    it('TC-T002-01: reports violations when atdd.enabled and enforce_priority_order both default-true', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        // No config file -> all-true defaults
        const output = 'P0 test auth - fail\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.ok(result.stderr.includes('ATDD PRIORITY VIOLATIONS'));
    });

    it('TC-T002-02 / AC-07-02: silent when enforce_priority_order=false (master enabled)', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        writeAtddConfig(tmpDir, { enabled: true, enforce_priority_order: false });
        const output = 'P0 test auth - fail\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.equal(result.stderr, '');
    });

    it('TC-T002-04: master kill switch wins over enforce_priority_order=true', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        writeAtddConfig(tmpDir, { enabled: false, enforce_priority_order: true });
        const output = 'P0 test auth - fail\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.equal(result.stderr, '');
    });

    it('AC-05d: silent for non-test commands', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        const result = runHook(tmpDir, makeBashOutput('ls -la', 'some files'));
        assert.equal(result.stderr, '');
    });

    it('AC-05e: silent when priority ordering is correct', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        const output = 'P0 test auth - pass\nP0 test setup - pass\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', output));
        assert.equal(result.stderr, '');
    });

    it('AC-05f: fails open on all errors', () => {
        const result = runHook(tmpDir, 'not json');
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('silent when no active workflow', () => {
        writeState(tmpDir, { active_workflow: null });
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', 'P0 fail'));
        assert.equal(result.stderr, '');
    });

    it('handles npm test command', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        const output = 'P0 test auth - fail\nP1 test feature - pass';
        const result = runHook(tmpDir, makeBashOutput('npm test', output));
        assert.ok(result.stderr.includes('ATDD PRIORITY VIOLATIONS'));
    });

    it('handles empty test output', () => {
        writeState(tmpDir, makeAtddState('06-implementation'));
        const result = runHook(tmpDir, makeBashOutput('node --test tests/', ''));
        assert.equal(result.stderr, '');
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });
});
