/**
 * Tests for participation-gate-enforcer.cjs hook (REQ-GH-235)
 *
 * Before the first PRESENTING_REQUIREMENTS is reached, verifies the
 * transcript contains 3 primary persona contributions:
 *   - Maya scope statement
 *   - Alex codebase evidence
 *   - Jordan design implication
 * In silent mode, checks for semantic markers rather than persona names.
 * Emits WARN on violation; never blocks (fail-open).
 *
 * Traces to: FR-008 (AC-008-03), FR-003 (AC-003-02)
 * ATDD RED-state: scaffolds shipped in Phase 05 T002.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'participation-gate-enforcer.cjs');

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'req-gh-235-partgate-'));
  fs.mkdirSync(path.join(tmp, '.isdlc'), { recursive: true });
  return tmp;
}

function runHook(tmpDir, stdin) {
  const result = spawnSync('node', [HOOK_PATH], {
    cwd: tmpDir,
    input: typeof stdin === 'string' ? stdin : JSON.stringify(stdin),
    env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir, PATH: process.env.PATH },
    encoding: 'utf8',
    timeout: 5000
  });
  return { stdout: result.stdout || '', stderr: result.stderr || '', exit: result.status };
}

const ALL_THREE_CONTRIBUTIONS = {
  confirmation_state: 'PRE_FIRST_CONFIRMATION',
  rendering_mode: 'bulleted',
  transcript: [
    { role: 'assistant', content: 'Maya: What is the scope of this change — narrow fix or broader refactor?' },
    { role: 'user', content: 'narrow fix' },
    { role: 'assistant', content: 'Alex: I searched the codebase; auth.js is the only affected module.' },
    { role: 'assistant', content: 'Jordan: This has a design implication for session handling we should confirm.' }
  ]
};

const MAYA_ONLY = {
  confirmation_state: 'PRE_FIRST_CONFIRMATION',
  rendering_mode: 'bulleted',
  transcript: [
    { role: 'assistant', content: 'Maya: What is the scope?' },
    { role: 'user', content: 'narrow' }
  ]
};

const MISSING_ALEX = {
  confirmation_state: 'PRE_FIRST_CONFIRMATION',
  rendering_mode: 'bulleted',
  transcript: [
    { role: 'assistant', content: 'Maya: What is the scope?' },
    { role: 'user', content: 'narrow' },
    { role: 'assistant', content: 'Jordan: This has a design implication for sessions.' }
  ]
};

const MISSING_JORDAN = {
  confirmation_state: 'PRE_FIRST_CONFIRMATION',
  rendering_mode: 'bulleted',
  transcript: [
    { role: 'assistant', content: 'Maya: What is the scope?' },
    { role: 'user', content: 'narrow' },
    { role: 'assistant', content: 'Alex: codebase evidence: only auth.js affected.' }
  ]
};

const SILENT_MODE_SEMANTIC = {
  confirmation_state: 'PRE_FIRST_CONFIRMATION',
  rendering_mode: 'silent',
  transcript: [
    { role: 'assistant', content: 'The scope is a narrow fix to auth module.' },
    { role: 'assistant', content: 'Searched the codebase: auth.js is the only affected module.' },
    { role: 'assistant', content: 'Design implication: session handling strategy must be confirmed.' }
  ]
};

const POST_CONFIRMATION = {
  confirmation_state: 'PRESENTING_ARCHITECTURE',
  rendering_mode: 'bulleted',
  transcript: []
};

describe('participation-gate-enforcer.cjs (REQ-GH-235)', () => {
  it('TC-HK-002-A: all 3 contributions present passes silently', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, ALL_THREE_CONTRIBUTIONS);
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('TC-HK-002-B: Maya-only triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, MAYA_ONLY);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN.*participation.*gate/i);
  });

  it('TC-HK-002-C: missing Alex evidence triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, MISSING_ALEX);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN/i);
    assert.match(result.stdout, /Alex|evidence/i);
  });

  it('TC-HK-002-D: missing Jordan design implication triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, MISSING_JORDAN);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN/i);
    assert.match(result.stdout, /Jordan|design/i);
  });

  it('TC-HK-002-E: silent mode uses semantic markers only (no persona names required)', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, SILENT_MODE_SEMANTIC);
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '', 'Silent mode with all 3 semantic markers should pass');
  });

  it('TC-HK-002-F: post-first-confirmation passes silently (gate already cleared)', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, POST_CONFIRMATION);
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('exit code is always 0 (fail-open Article X)', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, 'malformed {{');
    assert.equal(result.exit, 0);
  });
});
