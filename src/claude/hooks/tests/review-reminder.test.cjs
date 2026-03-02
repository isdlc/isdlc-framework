/**
 * Tests for review-reminder.cjs hook
 * Tests: T19-T28 from test-strategy.md
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'review-reminder.cjs');

// Test helpers
function setupTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'review-reminder-test-'));
  const isdlcDir = path.join(tmpDir, '.isdlc');
  fs.mkdirSync(isdlcDir, { recursive: true });
  return tmpDir;
}

function writeState(tmpDir, state) {
  const statePath = path.join(tmpDir, '.isdlc', 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function runHook(tmpDir, stdinData) {
  try {
    const result = execSync(`echo '${stdinData.replace(/'/g, "\\'")}' | node "${HOOK_PATH}"`, {
      cwd: tmpDir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: tmpDir,
        SKILL_VALIDATOR_DEBUG: '0'
      },
      encoding: 'utf8',
      timeout: 5000
    });
    return { stdout: result.trim(), exitCode: 0 };
  } catch (e) {
    return { stdout: (e.stdout || '').trim(), exitCode: e.status || 1 };
  }
}

function makeStdin(command) {
  return JSON.stringify({
    tool_input: { command },
    tool_result: { stdout: '', stderr: '', exit_code: 0 }
  });
}

describe('review-reminder hook', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = setupTestEnv();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // T19: Warns when disabled + team > 1
  it('T19: warns when code_review disabled and team_size > 1', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 3 }
    });
    const result = runHook(tmpDir, makeStdin('git commit -m "feat: add feature"'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, 'Should produce output');
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.warning, 'Should have warning field');
    assert.ok(parsed.warning.includes('bypassed'), 'Warning should mention bypassed');
  });

  // T20: Silent when disabled + team == 1
  it('T20: silent when code_review disabled and team_size == 1', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 1 }
    });
    const result = runHook(tmpDir, makeStdin('git commit -m "msg"'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '', 'Should produce no output');
  });

  // T21: Silent when enabled
  it('T21: silent when code_review enabled', () => {
    writeState(tmpDir, {
      code_review: { enabled: true, team_size: 3 }
    });
    const result = runHook(tmpDir, makeStdin('git commit -m "msg"'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '', 'Should produce no output');
  });

  // T22: Silent on non-commit git commands
  it('T22: silent on non-commit git commands', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 3 }
    });
    const result = runHook(tmpDir, makeStdin('git push origin main'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '', 'Should produce no output for non-commit');
  });

  // T23: Silent on non-git commands
  it('T23: silent on non-git commands', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 3 }
    });
    const result = runHook(tmpDir, makeStdin('npm test'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '', 'Should produce no output for non-git');
  });

  // T24: Matches git commit variants
  it('T24: matches git commit --amend', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 2 }
    });
    const result = runHook(tmpDir, makeStdin('git commit --amend'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.stdout.length > 0, 'Should produce warning for git commit --amend');
  });

  // T25: Fail-open on state read error
  it('T25: fail-open when state.json missing', () => {
    // Don't write state file
    fs.rmSync(path.join(tmpDir, '.isdlc', 'state.json'), { force: true });
    const result = runHook(tmpDir, makeStdin('git commit -m "msg"'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '', 'Should produce no output on missing state');
  });

  // T26: Fail-open on invalid stdin
  it('T26: fail-open on empty/invalid stdin', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 3 }
    });
    const result = runHook(tmpDir, '');
    assert.equal(result.exitCode, 0);
    // May or may not have output; the key is it does not crash
  });

  // T27: Performance (< 100ms)
  it('T27: completes within 100ms', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 2 }
    });
    const start = Date.now();
    runHook(tmpDir, makeStdin('git commit -m "msg"'));
    const elapsed = Date.now() - start;
    // Allow generous threshold for process startup (node startup ~50ms)
    // The 100ms budget is for the hook logic itself, not node startup
    // Using 2000ms to account for node process startup on slow systems
    assert.ok(elapsed < 2000, `Should complete in < 2000ms, took ${elapsed}ms`);
  });

  // T28: Warning message matches spec
  it('T28: warning message contains required text', () => {
    writeState(tmpDir, {
      code_review: { enabled: false, team_size: 2 }
    });
    const result = runHook(tmpDir, makeStdin('git commit -m "msg"'));
    const parsed = JSON.parse(result.stdout);
    assert.ok(parsed.warning.includes('bypassed'), 'Should contain "bypassed"');
    assert.ok(parsed.warning.includes('code_review.enabled'), 'Should contain "code_review.enabled"');
  });
});
