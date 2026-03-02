/**
 * Tests for output-format-validator.cjs hook
 * Traces to: FR-06, AC-06a-g, NFR-01
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'output-format-validator.cjs');

function setupTestEnv() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'output-fmt-test-'));
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

function writeArtifact(filePath, content) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
}

function makeWriteInput(filePath) {
    return {
        tool_name: 'Write',
        tool_input: { file_path: filePath }
    };
}

describe('output-format-validator hook', () => {
    let tmpDir;

    beforeEach(() => {
        tmpDir = setupTestEnv();
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-06a: validates user-stories.json has required fields', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'user-stories.json');
        writeArtifact(filePath, JSON.stringify({
            stories: [{ id: 'US-01', title: 'Test', acceptance_criteria: ['AC-01'] }]
        }));
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06a: warns on invalid user-stories.json (missing stories)', () => {
        const filePath = path.join(tmpDir, 'docs', 'requirements', 'user-stories.json');
        writeArtifact(filePath, JSON.stringify({ version: '1.0' }));
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
        assert.ok(result.stderr.includes('stories'));
    });

    it('AC-06b: validates traceability-matrix.csv headers', () => {
        const filePath = path.join(tmpDir, 'docs', 'traceability-matrix.csv');
        writeArtifact(filePath, 'FR,US,AC,Hook File,Test File,Hook Type\nFR-01,US-01,AC-01a,test.cjs,test.test.cjs,PreToolUse');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06b: warns on traceability-matrix.csv missing headers', () => {
        const filePath = path.join(tmpDir, 'docs', 'traceability-matrix.csv');
        writeArtifact(filePath, 'Column1,Column2\nval1,val2');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
    });

    it('AC-06c: validates ADR with required sections', () => {
        const filePath = path.join(tmpDir, 'docs', 'adr-001-tech-stack.md');
        writeArtifact(filePath, '# ADR-001\n## Status\nAccepted\n## Context\nWe need X\n## Decision\nUse Y\n## Consequences\nFaster dev');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06c: warns on ADR missing sections', () => {
        const filePath = path.join(tmpDir, 'docs', 'adr-001-tech-stack.md');
        writeArtifact(filePath, '# ADR-001\n## Status\nAccepted\nSome text');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
    });

    it('AC-06d: validates test-strategy.md sections', () => {
        const filePath = path.join(tmpDir, 'docs', 'test-strategy.md');
        writeArtifact(filePath, '# Test Strategy\n## Scope\nAll hooks\n## Approach\nTDD\n## Entry Criteria\nCode complete\n## Exit Criteria\nAll pass');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06e: silent for unrecognized file types', () => {
        const filePath = path.join(tmpDir, 'src', 'app.js');
        writeArtifact(filePath, 'console.log("hello")');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.equal(result.stderr, '');
    });

    it('AC-06f: fails open on read errors', () => {
        const filePath = '/nonexistent/path/user-stories.json';
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.equal(result.exitCode, 0);
        assert.equal(result.stderr, '');
    });

    it('AC-06g: reports specific missing fields', () => {
        const filePath = path.join(tmpDir, 'docs', 'user-stories.json');
        writeArtifact(filePath, JSON.stringify({ stories: [{ id: 'US-01' }] }));
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.ok(result.stderr.includes('title'));
        assert.ok(result.stderr.includes('acceptance_criteria'));
    });

    it('handles empty stdin', () => {
        const result = runHook(tmpDir, '');
        assert.equal(result.exitCode, 0);
    });

    it('handles invalid JSON in user-stories.json', () => {
        const filePath = path.join(tmpDir, 'docs', 'user-stories.json');
        writeArtifact(filePath, 'not json {{{');
        const result = runHook(tmpDir, makeWriteInput(filePath));
        assert.ok(result.stderr.includes('ARTIFACT FORMAT WARNING'));
        assert.ok(result.stderr.includes('valid JSON'));
    });
});
