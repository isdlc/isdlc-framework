/**
 * Tests for hook logging infrastructure (logHookEvent in common.cjs)
 * Traces to: FR-08, AC-08a-f, NFR-06
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// We test the common.cjs exports directly
const common = require('../lib/common.cjs');

describe('hook logging infrastructure', () => {
    let tmpDir;
    let originalEnv;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-log-test-'));
        const isdlcDir = path.join(tmpDir, '.isdlc');
        fs.mkdirSync(isdlcDir, { recursive: true });
        originalEnv = process.env.CLAUDE_PROJECT_DIR;
        process.env.CLAUDE_PROJECT_DIR = tmpDir;
    });

    afterEach(() => {
        process.env.CLAUDE_PROJECT_DIR = originalEnv;
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('AC-08a: logHookEvent function exists and is exported', () => {
        assert.equal(typeof common.logHookEvent, 'function');
    });

    it('AC-08b: writes JSONL format to hook-activity.log', () => {
        common.logHookEvent('test-hook', 'block', { reason: 'test reason' });
        const logPath = path.join(tmpDir, '.isdlc', 'hook-activity.log');
        assert.ok(fs.existsSync(logPath));
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n');
        assert.equal(lines.length, 1);
        const entry = JSON.parse(lines[0]);
        assert.equal(entry.hook, 'test-hook');
        assert.equal(entry.event, 'block');
        assert.equal(entry.reason, 'test reason');
    });

    it('AC-08c: entries include hookName, eventType, phase, timestamp', () => {
        common.logHookEvent('branch-guard', 'warn', {
            phase: '06-implementation',
            agent: 'software-developer',
            reason: 'commit to main blocked'
        });
        const logPath = path.join(tmpDir, '.isdlc', 'hook-activity.log');
        const content = fs.readFileSync(logPath, 'utf8');
        const entry = JSON.parse(content.trim());
        assert.equal(entry.hook, 'branch-guard');
        assert.equal(entry.event, 'warn');
        assert.equal(entry.phase, '06-implementation');
        assert.equal(entry.agent, 'software-developer');
        assert.ok(entry.ts); // timestamp exists
        assert.ok(entry.ts.includes('T')); // ISO format
    });

    it('AC-08d: log rotation at 1MB', () => {
        const logPath = path.join(tmpDir, '.isdlc', 'hook-activity.log');
        // Write 1.1MB of data
        const bigLine = JSON.stringify({ ts: new Date().toISOString(), hook: 'test', event: 'allow', phase: null, agent: null, reason: 'x'.repeat(500) }) + '\n';
        const lines = Math.ceil((1.1 * 1024 * 1024) / bigLine.length);
        let content = '';
        for (let i = 0; i < lines; i++) {
            content += bigLine;
        }
        fs.writeFileSync(logPath, content, 'utf8');
        const sizeBefore = fs.statSync(logPath).size;
        assert.ok(sizeBefore > 1024 * 1024); // over 1MB

        // Trigger rotation by logging one more event
        common.logHookEvent('rotation-trigger', 'allow', {});

        const sizeAfter = fs.statSync(logPath).size;
        assert.ok(sizeAfter < sizeBefore); // file was rotated
        const afterContent = fs.readFileSync(logPath, 'utf8');
        const afterLines = afterContent.trim().split('\n');
        assert.ok(afterLines.length <= common.HOOK_LOG_KEEP_LINES + 1); // kept lines + trigger
    });

    it('AC-08f: logging fails silently (never crashes)', () => {
        // Set project root to non-writable path
        const origDir = process.env.CLAUDE_PROJECT_DIR;
        process.env.CLAUDE_PROJECT_DIR = '/nonexistent/path/that/does/not/exist';
        // Should not throw
        assert.doesNotThrow(() => {
            common.logHookEvent('test', 'error', { reason: 'should not crash' });
        });
        process.env.CLAUDE_PROJECT_DIR = origDir;
    });

    it('appends multiple entries', () => {
        common.logHookEvent('hook-a', 'block', { reason: 'first' });
        common.logHookEvent('hook-b', 'warn', { reason: 'second' });
        common.logHookEvent('hook-c', 'allow', { reason: 'third' });
        const logPath = path.join(tmpDir, '.isdlc', 'hook-activity.log');
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n');
        assert.equal(lines.length, 3);
        assert.equal(JSON.parse(lines[0]).hook, 'hook-a');
        assert.equal(JSON.parse(lines[1]).hook, 'hook-b');
        assert.equal(JSON.parse(lines[2]).hook, 'hook-c');
    });

    it('handles null details gracefully', () => {
        assert.doesNotThrow(() => {
            common.logHookEvent('test', 'skip');
        });
        const logPath = path.join(tmpDir, '.isdlc', 'hook-activity.log');
        const content = fs.readFileSync(logPath, 'utf8');
        const entry = JSON.parse(content.trim());
        assert.equal(entry.phase, null);
        assert.equal(entry.agent, null);
        assert.equal(entry.reason, null);
    });

    it('getHookLogPath returns correct path', () => {
        const logPath = common.getHookLogPath();
        assert.ok(logPath.endsWith(path.join('.isdlc', 'hook-activity.log')));
    });

    it('HOOK_LOG_MAX_BYTES and HOOK_LOG_KEEP_LINES are exported', () => {
        assert.equal(common.HOOK_LOG_MAX_BYTES, 1024 * 1024);
        assert.equal(common.HOOK_LOG_KEEP_LINES, 500);
    });
});
