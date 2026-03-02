/**
 * Tests for constitutional-iteration-validator.cjs hook
 * Traces to: FR-02, AC-02a-h, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'constitutional-iteration-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'const-iter-test-'));
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

function makeSkillInput(skill, args) {
    return {
        tool_name: 'Skill',
        tool_input: { skill, args: args || '' }
    };
}

function makeValidState(phase) {
    return {
        active_workflow: { current_phase: phase },
        phases: {
            [phase]: {
                constitutional_validation: {
                    completed: true,
                    iterations_used: 1,
                    status: 'compliant',
                    articles_checked: ['I', 'IV', 'VII']
                }
            }
        }
    };
}

describe('constitutional-iteration-validator hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-02a: blocks when completed is false', () => {
        const state = makeValidState('06-implementation');
        state.phases['06-implementation'].constitutional_validation.completed = false;
        writeState(tmpDir, state);
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.ok(result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'));
        assert.ok(result.stdout.includes('stopReason'));
        assert.ok(result.stdout.includes('completed'));
    });

    it('AC-02b: blocks when iterations_used is 0', () => {
        const state = makeValidState('06-implementation');
        state.phases['06-implementation'].constitutional_validation.iterations_used = 0;
        writeState(tmpDir, state);
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.ok(result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'));
        assert.ok(result.stdout.includes('stopReason'));
        assert.ok(result.stdout.includes('iterations_used'));
    });

    it('AC-02c: blocks when articles_checked is empty', () => {
        const state = makeValidState('06-implementation');
        state.phases['06-implementation'].constitutional_validation.articles_checked = [];
        writeState(tmpDir, state);
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'advance'));
        assert.ok(result.stdout.includes('"continue":false') || result.stdout.includes('"continue": false'));
        assert.ok(result.stdout.includes('stopReason'));
    });

    it('AC-02d: allows when all fields correct', () => {
        writeState(tmpDir, makeValidState('06-implementation'));
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.equal(result.stdout, '');
        assert.equal(result.exitCode, 0);
    });

    it('AC-02e: allows non-gate invocations', () => {
        writeState(tmpDir, makeValidState('06-implementation'));
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'status'));
        assert.equal(result.stdout, '');
    });

    it('AC-02f: fails open when state.json unreadable', () => {
        // No state written
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('AC-02g: fails open when no active workflow', () => {
        writeState(tmpDir, { active_workflow: null, phases: {} });
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.equal(result.stdout, '');
    });

    it('AC-02h: fails open when validation section missing', () => {
        writeState(tmpDir, {
            active_workflow: { current_phase: '06-implementation' },
            phases: { '06-implementation': {} }
        });
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.equal(result.stdout, '');
    });

    it('allows when status is escalated', () => {
        const state = makeValidState('06-implementation');
        state.phases['06-implementation'].constitutional_validation.status = 'escalated';
        writeState(tmpDir, state);
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.equal(result.stdout, '');
    });

    it('blocks with invalid status value', () => {
        const state = makeValidState('06-implementation');
        state.phases['06-implementation'].constitutional_validation.status = 'pending';
        writeState(tmpDir, state);
        const result = runHook(tmpDir, makeSkillInput('/isdlc', 'gate-check'));
        assert.ok(result.stdout.includes('stopReason'));
    });

    it('allows non-Skill tool calls', () => {
        const result = runHook(tmpDir, { tool_name: 'Bash', tool_input: { command: 'ls' } });
        assert.equal(result.stdout, '');
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });
});
