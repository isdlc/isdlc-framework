/**
 * Tests for tasks-as-table-validator.cjs hook (REQ-GH-235)
 *
 * When the confirmation state is PRESENTING_TASKS, verifies the last
 * assistant turn contains a pipe-delimited traceability table (≥4 columns).
 * Emits WARN on violation; never blocks (fail-open per Article X).
 *
 * Traces to: FR-008 (AC-008-03), FR-003 (AC-003-03)
 * ATDD RED-state: scaffolds shipped in Phase 05 T002.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'tasks-as-table-validator.cjs');

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'req-gh-235-tasks-table-'));
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

const VALID_TABLE_MESSAGE = [
  '| FR | Requirement | Design / Blast Radius | Related Tasks |',
  '|----|-------------|-----------------------|---------------|',
  '| FR-001 | Rewrite | 2 files | T001, T002 |',
  '| FR-002 | Bindings | 3 files | T003 |'
].join('\n');

const BULLET_MESSAGE = [
  '- Task 1: rewrite prompt',
  '- Task 2: add hook',
  '- Task 3: update docs'
].join('\n');

const PROSE_MESSAGE = 'We will rewrite the roundtable prompt and add three hooks.';

const SHORT_TABLE_MESSAGE = [
  '| Task | Status |',
  '|------|--------|',
  '| T001 | done |'
].join('\n');

describe('tasks-as-table-validator.cjs (REQ-GH-235)', () => {
  it('TC-HK-001-A: valid 4-column traceability table passes silently', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, {
      tool_name: 'Write',
      tool_input: { file_path: `${tmp}/docs/tasks.md` },
      context: { confirmation_state: 'PRESENTING_TASKS', last_assistant_message: VALID_TABLE_MESSAGE }
    });
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('TC-HK-001-B: bullet list in PRESENTING_TASKS triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, {
      tool_name: 'Write',
      tool_input: { file_path: `${tmp}/docs/tasks.md` },
      context: { confirmation_state: 'PRESENTING_TASKS', last_assistant_message: BULLET_MESSAGE }
    });
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN:.*table.*not.*bullets/i);
  });

  it('TC-HK-001-C: prose message in PRESENTING_TASKS triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, {
      tool_name: 'Write',
      tool_input: { file_path: `${tmp}/docs/tasks.md` },
      context: { confirmation_state: 'PRESENTING_TASKS', last_assistant_message: PROSE_MESSAGE }
    });
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN/);
  });

  it('TC-HK-001-D: non-TASKS state passes silently even with bullets', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, {
      tool_name: 'Write',
      tool_input: { file_path: `${tmp}/docs/x.md` },
      context: { confirmation_state: 'PRESENTING_REQUIREMENTS', last_assistant_message: BULLET_MESSAGE }
    });
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('TC-HK-001-E: table with <4 columns triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, {
      tool_name: 'Write',
      tool_input: { file_path: `${tmp}/docs/tasks.md` },
      context: { confirmation_state: 'PRESENTING_TASKS', last_assistant_message: SHORT_TABLE_MESSAGE }
    });
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN/);
  });

  it('TC-HK-001-F: missing context passes silently (fail-open)', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, {
      tool_name: 'Write',
      tool_input: { file_path: `${tmp}/docs/x.md` }
      // no context
    });
    assert.equal(result.exit, 0);
  });

  it('exit code is always 0 (fail-open Article X)', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, 'invalid json {{{');
    assert.equal(result.exit, 0);
  });
});
