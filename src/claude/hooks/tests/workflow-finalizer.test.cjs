/**
 * Tests for workflow-finalizer.cjs hook
 * Tests: WF01-WF15 from BUG-0003 test-strategy.md
 *
 * TDD: These tests are written FIRST, before the implementation.
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', 'workflow-finalizer.cjs');

// Test helpers
function setupTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'wf-finalizer-test-'));
  const isdlcDir = path.join(tmpDir, '.isdlc');
  fs.mkdirSync(isdlcDir, { recursive: true });

  // Copy the hook's lib dependency so it can resolve common.cjs
  const hooksLibDir = path.join(tmpDir, '.isdlc', 'hooks-lib');
  fs.mkdirSync(hooksLibDir, { recursive: true });

  return tmpDir;
}

function writeState(tmpDir, state) {
  const statePath = path.join(tmpDir, '.isdlc', 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readStateFromDisk(tmpDir) {
  const statePath = path.join(tmpDir, '.isdlc', 'state.json');
  return JSON.parse(fs.readFileSync(statePath, 'utf8'));
}

function runHook(tmpDir, stdinData) {
  // Use a temp file for stdin to avoid shell escaping issues with parentheses/quotes
  const stdinFile = path.join(tmpDir, '_stdin.json');
  fs.writeFileSync(stdinFile, stdinData);
  try {
    const result = execSync(
      `node "${HOOK_PATH}" < "${stdinFile}"`,
      {
        cwd: tmpDir,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: tmpDir,
          SKILL_VALIDATOR_DEBUG: '0'
        },
        encoding: 'utf8',
        timeout: 5000
      }
    );
    return { stdout: result.trim(), exitCode: 0 };
  } catch (e) {
    return { stdout: (e.stdout || '').trim(), exitCode: e.status || 1 };
  }
}

function makeStdinWithMergeOutput(command, stdout) {
  return JSON.stringify({
    tool_name: 'Bash',
    tool_input: { command },
    tool_result: { stdout, stderr: '', exit_code: 0 }
  });
}

function activeWorkflowWithBranch(branchName) {
  return {
    type: 'fix',
    description: 'Fix state.json cleanup',
    started_at: '2026-02-09T16:00:00Z',
    phases: ['01-requirements', '02-tracing', '05-implementation'],
    current_phase: '05-implementation',
    current_phase_index: 2,
    phase_status: {
      '01-requirements': 'completed',
      '02-tracing': 'completed',
      '05-implementation': 'completed'
    },
    gate_mode: 'strict',
    artifact_prefix: 'BUG',
    artifact_folder: 'BUG-0003-state-json-cleanup',
    counter_used: 3,
    git_branch: {
      name: branchName,
      created_from: 'main',
      created_at: '2026-02-09T16:20:00Z',
      status: 'active'
    }
  };
}

function bloatedState(branchName) {
  const skillLog = [];
  for (let i = 1; i <= 50; i++) {
    skillLog.push({
      timestamp: `2026-02-09T${String(i % 24).padStart(2, '0')}:00:00Z`,
      agent: `agent-${i}`,
      description: `entry ${i}`
    });
  }

  return {
    framework_version: '0.1.0-alpha',
    project: { name: 'test-project' },
    constitution: { status: 'valid' },
    discovery_context: { completed_at: '2026-02-08T11:20:00Z' },
    active_workflow: activeWorkflowWithBranch(branchName || 'bugfix/BUG-0003-state-json-cleanup'),
    active_agent: 'software-developer',
    current_phase: '05-implementation',
    pending_delegation: { skill: 'isdlc', loaded_at: '2026-02-09T16:00:00Z' },
    pending_escalations: [
      { type: 'gate-blocker', phase: '01-requirements', reason: 'stale' },
      { type: 'gate-blocker', phase: '02-tracing', reason: 'stale' },
      { type: 'gate-blocker', phase: '05-implementation', reason: 'stale' }
    ],
    skill_usage_log: skillLog,
    workflow_history: [],
    counters: { next_req_id: 6, next_bug_id: 4 },
    phases: {
      '01-requirements': { status: 'completed', started: '2026-02-09T16:00:00Z', completed: '2026-02-09T16:20:00Z', gate_passed: '2026-02-09T16:20:00Z', artifacts: ['requirements-spec.md'] },
      '05-implementation': { status: 'completed', started: '2026-02-09T17:00:00Z', completed: '2026-02-09T18:00:00Z', gate_passed: null, artifacts: [] },
      '01-requirements-BUG-0002': { status: 'completed', started: '2026-02-09T14:00:00Z' },
      '02-tracing-BUG-0002': { status: 'completed', started: '2026-02-09T14:20:00Z' }
    },
    blockers: [],
    history: [{ timestamp: '2026-02-08T09:40:58Z', agent: 'setup', action: 'initialized' }],
    fix_workflow_init: { timestamp: '2026-02-09T16:00:00Z' },
    '01-requirements-BUG-0003': { status: 'completed' }
  };
}

describe('workflow-finalizer hook', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = setupTestEnv();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // =========================================================================
  // 4.1 Trigger Detection
  // =========================================================================

  describe('Trigger detection', () => {
    it('WF01: triggers on git merge --no-ff output with "Merge made by"', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      const mergeOutput = `Merge made by the 'ort' strategy.\n src/file.js | 10 ++++\n 1 file changed\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge --no-ff ${branchName} -m "merge: bugfix BUG-0003"`,
        mergeOutput
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0);

      // Verify cleanup was executed
      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.active_workflow, null, 'active_workflow should be null after cleanup');
    });

    it('WF02: triggers on Fast-forward merge output', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      const mergeOutput = `Updating abc1234..def5678\nFast-forward\n src/file.js | 10 ++++\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge ${branchName}`,
        mergeOutput
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0);

      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.active_workflow, null, 'active_workflow should be null after cleanup');
    });

    it('WF03: does NOT trigger on non-merge bash output', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      const stdin = makeStdinWithMergeOutput(
        'npm test',
        'All tests passed\n43 passing'
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0);

      // State should be unchanged
      const state = readStateFromDisk(tmpDir);
      assert.ok(state.active_workflow !== null, 'active_workflow should NOT be null');
    });

    it('WF04: does NOT trigger on git commands that are not merges', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      const stdin = makeStdinWithMergeOutput(
        'git status',
        'On branch main\nnothing to commit, working tree clean'
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0);

      const state = readStateFromDisk(tmpDir);
      assert.ok(state.active_workflow !== null, 'active_workflow should NOT be null');
    });
  });

  // =========================================================================
  // 4.2 Merge-Branch Matching
  // =========================================================================

  describe('Merge-branch matching', () => {
    it('WF05: triggers cleanup when merge branch matches active_workflow.git_branch.name', () => {
      const branchName = 'feature/REQ-0005-advisory-hooks';
      writeState(tmpDir, bloatedState(branchName));

      const mergeOutput = `Merge made by the 'ort' strategy.\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge --no-ff ${branchName}`,
        mergeOutput
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0);

      const cleaned = readStateFromDisk(tmpDir);
      assert.equal(cleaned.active_workflow, null, 'Should cleanup when branch matches');
    });

    it('WF06: does NOT trigger when merge branch does not match active_workflow', () => {
      writeState(tmpDir, bloatedState('feature/REQ-0005-advisory-hooks'));

      const mergeOutput = `Merge made by the 'ort' strategy.\nDeleted branch unrelated-branch (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        'git merge --no-ff unrelated-branch',
        mergeOutput
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0);

      const state = readStateFromDisk(tmpDir);
      assert.ok(state.active_workflow !== null, 'Should NOT cleanup when branch does not match');
    });
  });

  // =========================================================================
  // 4.3 Cleanup Execution
  // =========================================================================

  describe('Cleanup execution', () => {
    it('WF07: full cleanup - active_workflow nulled, history archived', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      const mergeOutput = `Merge made by the 'ort' strategy.\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge --no-ff ${branchName}`,
        mergeOutput
      );

      runHook(tmpDir, stdin);
      const cleaned = readStateFromDisk(tmpDir);

      // FR-01: active_workflow, active_agent, current_phase nulled
      assert.equal(cleaned.active_workflow, null);
      assert.equal(cleaned.active_agent, null);
      assert.equal(cleaned.current_phase, null);
      assert.equal(cleaned.pending_delegation, null);

      // FR-06: workflow_history has the archived entry
      assert.equal(cleaned.workflow_history.length, 1);
      assert.equal(cleaned.workflow_history[0].type, 'fix');
      assert.equal(cleaned.workflow_history[0].status, 'completed');

      // FR-04: orphaned phase keys removed
      assert.equal(cleaned.phases['01-requirements-BUG-0002'], undefined);
      assert.equal(cleaned.phases['02-tracing-BUG-0002'], undefined);

      // FR-05: orphaned top-level keys removed
      assert.equal(cleaned.fix_workflow_init, undefined);
      assert.equal(cleaned['01-requirements-BUG-0003'], undefined);
    });

    it('WF08: pending_escalations cleared', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      const mergeOutput = `Merge made by the 'ort' strategy.\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge --no-ff ${branchName}`,
        mergeOutput
      );

      runHook(tmpDir, stdin);
      const cleaned = readStateFromDisk(tmpDir);

      assert.deepEqual(cleaned.pending_escalations, []);
    });

    it('WF09: skill_usage_log pruned', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName)); // Has 50 entries

      const mergeOutput = `Merge made by the 'ort' strategy.\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge --no-ff ${branchName}`,
        mergeOutput
      );

      runHook(tmpDir, stdin);
      const cleaned = readStateFromDisk(tmpDir);

      assert.equal(cleaned.skill_usage_log.length, 20);
    });
  });

  // =========================================================================
  // 4.4 Fail-Open Behavior
  // =========================================================================

  describe('Fail-open behavior (Article X)', () => {
    it('WF10: fail-open on missing state.json', () => {
      // Don't write state.json
      const mergeOutput = 'Merge made by the \'ort\' strategy.';
      const stdin = makeStdinWithMergeOutput('git merge --no-ff branch', mergeOutput);

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0, 'Should exit 0');
    });

    it('WF11: fail-open on invalid JSON state', () => {
      const statePath = path.join(tmpDir, '.isdlc', 'state.json');
      fs.writeFileSync(statePath, 'not json at all');

      const mergeOutput = 'Merge made by the \'ort\' strategy.';
      const stdin = makeStdinWithMergeOutput('git merge --no-ff branch', mergeOutput);

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0, 'Should exit 0');
    });

    it('WF12: fail-open on empty stdin', () => {
      writeState(tmpDir, bloatedState());

      const result = runHook(tmpDir, '');
      assert.equal(result.exitCode, 0, 'Should exit 0');
    });

    it('WF13: fail-open on invalid JSON stdin', () => {
      writeState(tmpDir, bloatedState());

      const result = runHook(tmpDir, 'not json');
      assert.equal(result.exitCode, 0, 'Should exit 0');
    });

    it('WF14: fail-open when no active_workflow', () => {
      const state = bloatedState();
      state.active_workflow = null;
      writeState(tmpDir, state);

      const mergeOutput = 'Merge made by the \'ort\' strategy.';
      const stdin = makeStdinWithMergeOutput('git merge --no-ff branch', mergeOutput);

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0, 'Should exit 0');

      // State should be unchanged
      const stateAfter = readStateFromDisk(tmpDir);
      assert.equal(stateAfter.active_agent, 'software-developer');
    });

    it('WF15: fail-open on write failure (read-only state.json)', () => {
      const branchName = 'bugfix/BUG-0003-state-json-cleanup';
      writeState(tmpDir, bloatedState(branchName));

      // Make state.json read-only
      const statePath = path.join(tmpDir, '.isdlc', 'state.json');
      fs.chmodSync(statePath, 0o444);

      const mergeOutput = `Merge made by the 'ort' strategy.\nDeleted branch ${branchName} (was abc1234).`;
      const stdin = makeStdinWithMergeOutput(
        `git merge --no-ff ${branchName}`,
        mergeOutput
      );

      const result = runHook(tmpDir, stdin);
      assert.equal(result.exitCode, 0, 'Should exit 0 even when write fails');

      // Restore permissions for cleanup
      fs.chmodSync(statePath, 0o644);
    });
  });
});
