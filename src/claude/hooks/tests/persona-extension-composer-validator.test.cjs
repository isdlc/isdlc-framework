/**
 * Tests for persona-extension-composer-validator.cjs hook (REQ-GH-235)
 *
 * Runs on PreToolUse for Task dispatch to the analyze subagent. Validates
 * promoted persona frontmatter schemas, logs conflicts, and never blocks.
 *
 * Traces to: FR-008 (AC-008-03), FR-005
 * ATDD RED-state: scaffolds shipped in Phase 05 T002.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'persona-extension-composer-validator.cjs');

function setupTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'req-gh-235-persona-val-'));
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

const ALL_VALID = {
  tool_name: 'Task',
  tool_input: { subagent_type: 'roundtable-analyst' },
  context: {
    persona_files: [
      { name: 'persona-security-reviewer', role_type: 'contributing', domain: 'security' },
      { name: 'persona-data-architect', role_type: 'primary', owns_state: 'data_architecture', template: 'data-architecture.template.json', inserts_at: 'after:architecture' }
    ]
  }
};

const MISSING_FIELDS = {
  tool_name: 'Task',
  tool_input: { subagent_type: 'roundtable-analyst' },
  context: {
    persona_files: [
      { name: 'persona-broken', role_type: 'primary', domain: 'mystery' /* missing owns_state, template, inserts_at */ }
    ]
  }
};

const BAD_INSERTS_AT = {
  tool_name: 'Task',
  tool_input: { subagent_type: 'roundtable-analyst' },
  context: {
    persona_files: [
      { name: 'persona-bad', role_type: 'primary', owns_state: 'x', template: 'x.template.json', inserts_at: 'wherever' }
    ]
  }
};

const CONFLICT = {
  tool_name: 'Task',
  tool_input: { subagent_type: 'roundtable-analyst' },
  context: {
    persona_files: [
      { name: 'persona-a', role_type: 'primary', owns_state: 'a', template: 'a.template.json', inserts_at: 'after:architecture' },
      { name: 'persona-b', role_type: 'primary', owns_state: 'b', template: 'b.template.json', inserts_at: 'after:architecture' }
    ]
  }
};

const NON_ANALYZE_TASK = {
  tool_name: 'Task',
  tool_input: { subagent_type: 'code-reviewer' },
  context: { persona_files: [] }
};

describe('persona-extension-composer-validator.cjs (REQ-GH-235)', () => {
  it('TC-HK-003-A: all personas valid passes silently', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, ALL_VALID);
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('TC-HK-003-B: missing promotion fields triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, MISSING_FIELDS);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN.*persona-broken/i);
    assert.match(result.stdout, /owns_state|template|inserts_at/);
  });

  it('TC-HK-003-C: invalid inserts_at format triggers WARN', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, BAD_INSERTS_AT);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN/i);
    assert.match(result.stdout, /inserts_at|extension point/i);
  });

  it('TC-HK-003-D: insertion conflict triggers WARN with first-wins', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, CONFLICT);
    assert.equal(result.exit, 0);
    assert.match(result.stdout, /WARN.*Insertion conflict/i);
    assert.match(result.stdout, /after:architecture/);
    assert.match(result.stdout, /first.wins/i);
    assert.match(result.stdout, /persona-a/, 'First-declared persona must be chosen');
  });

  it('TC-HK-003-E: non-analyze Task dispatch passes silently', () => {
    const tmp = setupTmp();
    const result = runHook(tmp, NON_ANALYZE_TASK);
    assert.equal(result.exit, 0);
    assert.equal(result.stdout.trim(), '');
  });

  it('TC-HK-003-F: never blocks (always exit 0, fail-open)', () => {
    const tmp = setupTmp();
    for (const input of [ALL_VALID, MISSING_FIELDS, BAD_INSERTS_AT, CONFLICT, 'malformed']) {
      const result = runHook(tmp, input);
      assert.equal(result.exit, 0, 'Hook must never block');
    }
  });
});
