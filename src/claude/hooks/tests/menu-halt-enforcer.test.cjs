/**
 * Tests for menu-halt-enforcer.cjs hook
 * Traces to: FR-03, AC-03a-f, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'menu-halt-enforcer.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'menu-halt-test-'));
    const isdlcDir = path.join(tmpDir, '.isdlc');
    fs.mkdirSync(isdlcDir, { recursive: true });
    return tmpDir;
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

const LONG_TEXT = 'A'.repeat(250); // Over 200 char threshold

describe('menu-halt-enforcer hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-03a: detects A/R/C menu followed by extra output', () => {
        const text = 'Here is draft:\n[A] Adjust [R] Refine [C] Continue\n' + LONG_TEXT;
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.ok(result.stderr.includes('MENU HALT VIOLATION'));
        assert.ok(result.stderr.includes('arc-menu'));
    });

    it('AC-03b: detects numbered menu with Enter selection followed by extra output', () => {
        const text = '[1] Feature\n[2] Fix\n[3] Test\nEnter selection:\n' + LONG_TEXT;
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.ok(result.stderr.includes('MENU HALT VIOLATION'));
        assert.ok(result.stderr.includes('numbered-menu'));
    });

    it('AC-03c: silent when menu is last content (agent stopped correctly)', () => {
        const text = 'Here is draft:\n[A] Adjust [R] Refine [C] Continue\n';
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.equal(result.stderr, '');
        assert.equal(result.stdout, '');
    });

    it('AC-03d: silent when no menu patterns detected', () => {
        const text = 'Implementation complete. All 140 tests passing. Coverage at 85%.';
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.equal(result.stderr, '');
    });

    it('AC-03e: fails open on errors (invalid JSON)', () => {
        const result = runHook(tmpDir, 'not valid json');
        assert.equal(result.exitCode, 0);
        assert.equal(result.stdout, '');
    });

    it('AC-03f: handles output with backlog picker menu', () => {
        const text = '[1] Build auth system\n[2] Add logging\n[O] Other\n' + LONG_TEXT;
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.ok(result.stderr.includes('MENU HALT VIOLATION'));
    });

    it('silent when small text after menu (under threshold)', () => {
        const text = '[A] Adjust [R] Refine [C] Continue\nShort text here.';
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.equal(result.stderr, '');
    });

    it('handles empty task output', () => {
        const result = runHook(tmpDir, makeTaskOutput(''));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, '');
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });

    it('detects numbered menu with Enter selection (case insensitive)', () => {
        const text = '[1] Feature\n[2] Fix\nENTER SELECTION:\n' + LONG_TEXT;
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.ok(result.stderr.includes('MENU HALT VIOLATION'));
    });

    // REQ-0008: Backlog picker with Jira suffixes regression tests (TC-M5-01..03)

    it('TC-M5-01: backlog picker with Jira suffixes triggers halt detection', () => {
        const text = '[1] Auth system [Jira: PROJ-1234]\n[2] Local item\n[O] Other\n' + LONG_TEXT;
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.ok(result.stderr.includes('MENU HALT VIOLATION'), 'Must detect violation with Jira suffixes');
        assert.ok(result.stderr.includes('backlog-picker'), 'Must identify as backlog-picker menu type');
    });

    it('TC-M5-02: mixed Jira and local items in picker triggers halt', () => {
        const text = '[1] Jira feature [Jira: ABC-100]\n[2] Local only task\n[3] Another [Jira: XY-5]\n[O] Other\n' + LONG_TEXT;
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.ok(result.stderr.includes('MENU HALT VIOLATION'), 'Must detect violation with mixed items');
    });

    it('TC-M5-03: backlog picker with Jira suffixes and no extra output is silent', () => {
        const text = '[1] Auth system [Jira: PROJ-1234]\n[2] Local item\n[O] Other\n';
        const result = runHook(tmpDir, makeTaskOutput(text));
        assert.equal(result.stderr, '', 'Must not report violation when agent stopped correctly');
        assert.equal(result.stdout, '', 'Must have no stdout when agent stopped correctly');
    });
});
