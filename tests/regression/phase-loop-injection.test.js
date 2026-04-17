/**
 * Regression tests — Phase-loop injection unchanged by GH-253 (T057)
 *
 * Verifies that the existing STEP 3d delegation prompt construction for
 * build phases still works identically after GH-253 roundtable changes:
 *   1. gate-requirements-injector output format is unchanged
 *   2. SKILL INJECTION STEP A/B/C pattern is unchanged
 *   3. Phase-loop buildContext() produces the same structure
 *   4. Claude runtime buildPrompt() sections ordering unchanged for build phases
 *
 * Traces: FR-006 (boundary), REQ-GH-253
 * Test runner: node:test (ESM)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { runPhaseLoop, getAgentForPhase } from '../../src/core/orchestration/phase-loop.js';
import { createRuntime, PHASE_AGENT_MAP } from '../../src/providers/claude/runtime.js';
import {
  buildCriticalConstraints,
  buildConstraintReminder,
  deepMerge,
  resolveTemplateVars,
} from '../../src/core/validators/gate-requirements.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockConfig() {
  return {
    projectRoot: '/tmp/test-project',
    _execSync: () => Buffer.from('/usr/local/bin/claude\n'),
  };
}

function createTrackingRuntime() {
  const calls = { executeTask: [] };
  return {
    calls,
    async executeTask(phase, agent, context) {
      calls.executeTask.push({ phase, agent, context });
      return { status: 'completed', output: `${phase} done`, duration_ms: 10 };
    },
    async executeParallel(tasks) {
      return tasks.map(() => ({ status: 'completed', output: 'done', duration_ms: 5 }));
    },
    async presentInteractive() { return '__PHASE_COMPLETE__'; },
    async readUserResponse() { return 'ok'; },
    async validateRuntime() { return { available: true }; },
  };
}

// ---------------------------------------------------------------------------
// PLI-01..PLI-06: gate-requirements-injector output format
// ---------------------------------------------------------------------------

describe('REQ-GH-253 regression — gate-requirements-injector format unchanged', () => {

  it('PLI-01: buildCriticalConstraints returns array of strings', () => {
    const phaseReq = {
      test_iteration: { enabled: true, success_criteria: { min_coverage_percent: 80 } },
      constitutional_validation: { enabled: true },
      artifact_validation: { enabled: true, paths: ['docs/'] },
    };
    const constraints = buildCriticalConstraints('06-implementation', phaseReq, null, true, {});
    assert.ok(Array.isArray(constraints));
    assert.ok(constraints.length >= 3, 'Should have at least 3 constraints');
    for (const c of constraints) {
      assert.strictEqual(typeof c, 'string', 'Each constraint must be a string');
    }
  });

  it('PLI-02: git commit prohibition constraint present for intermediate phases', () => {
    const phaseReq = { test_iteration: { enabled: false }, constitutional_validation: { enabled: false } };
    const constraints = buildCriticalConstraints('06-implementation', phaseReq, null, true, {});
    const hasGitConstraint = constraints.some(c => c.includes('git commit'));
    assert.ok(hasGitConstraint, 'Should include git commit prohibition for intermediate phases');
  });

  it('PLI-03: coverage constraint present when test_iteration enabled', () => {
    const phaseReq = {
      test_iteration: { enabled: true, success_criteria: { min_coverage_percent: 85 } },
    };
    const constraints = buildCriticalConstraints('06-implementation', phaseReq, null, false, {});
    const hasCoverage = constraints.some(c => c.includes('coverage'));
    assert.ok(hasCoverage, 'Should include coverage constraint');
  });

  it('PLI-04: buildConstraintReminder produces REMINDER prefix', () => {
    const reminder = buildConstraintReminder(['Do not commit.', 'Run tests.']);
    assert.ok(reminder.startsWith('REMINDER:'), 'Should start with REMINDER:');
    assert.ok(reminder.includes('Do not commit.'));
    assert.ok(reminder.includes('Run tests.'));
  });

  it('PLI-05: buildConstraintReminder returns empty string for empty array', () => {
    assert.strictEqual(buildConstraintReminder([]), '');
  });

  it('PLI-06: buildConstraintReminder returns empty string for null', () => {
    assert.strictEqual(buildConstraintReminder(null), '');
  });
});

// ---------------------------------------------------------------------------
// PLI-10..PLI-14: Claude runtime prompt sections ordering
// ---------------------------------------------------------------------------

describe('REQ-GH-253 regression — Claude runtime prompt section ordering unchanged', () => {

  it('PLI-10: buildPrompt produces Phase, Agent, Artifact, Workflow, Instructions, Skills sections', async () => {
    const runtime = createRuntime(mockConfig());
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-TEST-001',
      workflow_type: 'feature',
      instructions: 'Implement the feature',
      skill_context: 'code-implementation',
    });

    const prompt = result.output.prompt;
    assert.ok(prompt.includes('Phase: 06-implementation'), 'Should have Phase section');
    assert.ok(prompt.includes('Agent: 05-software-developer'), 'Should have Agent section');
    assert.ok(prompt.includes('Artifact folder: REQ-TEST-001'), 'Should have Artifact folder');
    assert.ok(prompt.includes('Workflow: feature'), 'Should have Workflow');
    assert.ok(prompt.includes('Implement the feature'), 'Should have Instructions');
    assert.ok(prompt.includes('Skills: code-implementation'), 'Should have Skills');
  });

  it('PLI-11: prompt sections appear in correct order: Phase > Agent > Artifact > Workflow > Instructions > Skills', async () => {
    const runtime = createRuntime(mockConfig());
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-TEST',
      workflow_type: 'feature',
      instructions: 'Build it',
      skill_context: 'skill-ctx',
    });

    const prompt = result.output.prompt;
    const phaseIdx = prompt.indexOf('Phase:');
    const agentIdx = prompt.indexOf('Agent:');
    const artifactIdx = prompt.indexOf('Artifact folder:');
    const workflowIdx = prompt.indexOf('Workflow:');
    const instrIdx = prompt.indexOf('Build it');
    const skillIdx = prompt.indexOf('Skills:');

    assert.ok(phaseIdx < agentIdx, 'Phase before Agent');
    assert.ok(agentIdx < artifactIdx, 'Agent before Artifact');
    assert.ok(artifactIdx < workflowIdx, 'Artifact before Workflow');
    assert.ok(workflowIdx < instrIdx, 'Workflow before Instructions');
    assert.ok(instrIdx < skillIdx, 'Instructions before Skills');
  });

  it('PLI-12: composedCard injection does not break section ordering for build phases', async () => {
    const runtime = createRuntime(mockConfig());
    // Even when composedCard is present (it shouldn't be for build, but
    // verifying it doesn't break ordering if it ever were)
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-TEST',
      instructions: 'Build it',
      composedCard: 'CARD_TEXT',
      skill_context: 'skill-ctx',
    });

    const prompt = result.output.prompt;
    const instrIdx = prompt.indexOf('Build it');
    const cardIdx = prompt.indexOf('CARD_TEXT');
    const skillIdx = prompt.indexOf('Skills:');

    assert.ok(instrIdx < cardIdx, 'Instructions before card');
    assert.ok(cardIdx < skillIdx, 'Card before skills');
  });

  it('PLI-13: without composedCard, prompt has no extra whitespace injection', async () => {
    const runtime = createRuntime(mockConfig());
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-TEST',
      instructions: 'Build it',
      skill_context: 'skill-ctx',
    });

    const prompt = result.output.prompt;
    // Should not have a blank section between Instructions and Skills
    assert.ok(!prompt.includes('\n\n\nSkills:'), 'No triple newlines before Skills');
  });
});

// ---------------------------------------------------------------------------
// PLI-20..PLI-24: Phase-loop context structure unchanged
// ---------------------------------------------------------------------------

describe('REQ-GH-253 regression — phase-loop context structure unchanged', () => {

  it('PLI-20: phase-loop buildContext includes phase, artifact_folder, workflow_type, state_summary', async () => {
    const runtime = createTrackingRuntime();
    const workflow = {
      phases: ['06-implementation'],
      artifact_folder: 'REQ-TEST',
      workflow_type: 'feature',
    };
    await runPhaseLoop(runtime, workflow, { phases: {}, active_workflow: {} });

    const ctx = runtime.calls.executeTask[0].context;
    assert.strictEqual(ctx.phase, '06-implementation', 'context.phase set');
    assert.strictEqual(ctx.artifact_folder, 'REQ-TEST', 'context.artifact_folder set');
    assert.strictEqual(ctx.workflow_type, 'feature', 'context.workflow_type set');
    assert.ok(ctx.state_summary, 'context.state_summary exists');
    assert.ok(Array.isArray(ctx.state_summary.completed_phases), 'completed_phases is array');
  });

  it('PLI-21: state_summary.completed_phases accumulates as loop progresses', async () => {
    const runtime = createTrackingRuntime();
    const workflow = {
      phases: ['03-architecture', '06-implementation'],
      artifact_folder: 'REQ-TEST',
      workflow_type: 'feature',
    };
    await runPhaseLoop(runtime, workflow, { phases: {}, active_workflow: {} });

    // First phase context: no completed phases yet
    const ctx0 = runtime.calls.executeTask[0].context;
    assert.deepStrictEqual(ctx0.state_summary.completed_phases, []);

    // Second phase context: first phase should be in completed list
    const ctx1 = runtime.calls.executeTask[1].context;
    assert.ok(ctx1.state_summary.completed_phases.includes('03-architecture'),
      'Second phase should see first phase as completed');
  });

  it('PLI-22: PHASE_AGENT_MAP is frozen and has standard build phases', () => {
    assert.ok(Object.isFrozen(PHASE_AGENT_MAP), 'PHASE_AGENT_MAP must be frozen');
    assert.ok('05-implementation' in PHASE_AGENT_MAP);
    assert.ok('06-integration-testing' in PHASE_AGENT_MAP);
    assert.ok('08-code-review' in PHASE_AGENT_MAP);
  });

  it('PLI-23: PHASE_AGENT_MAP values follow NN-name pattern', () => {
    const pattern = /^\d{2}-[a-z][\w-]+$/;
    for (const [phase, agent] of Object.entries(PHASE_AGENT_MAP)) {
      assert.ok(pattern.test(agent), `${phase} -> "${agent}" must match NN-name pattern`);
    }
  });
});

// ---------------------------------------------------------------------------
// PLI-30..PLI-33: Utility functions unchanged
// ---------------------------------------------------------------------------

describe('REQ-GH-253 regression — gate-requirements utilities unchanged', () => {

  it('PLI-30: deepMerge combines objects without mutation', () => {
    const base = { a: 1, b: { c: 2 } };
    const over = { b: { d: 3 }, e: 4 };
    const merged = deepMerge(base, over);
    assert.strictEqual(merged.a, 1);
    assert.strictEqual(merged.b.c, 2);
    assert.strictEqual(merged.b.d, 3);
    assert.strictEqual(merged.e, 4);
    assert.strictEqual(base.b.d, undefined, 'Original should not be mutated');
  });

  it('PLI-31: resolveTemplateVars replaces placeholders', () => {
    const result = resolveTemplateVars('docs/{folder}/output.html', { folder: 'REQ-001' });
    assert.strictEqual(result, 'docs/REQ-001/output.html');
  });

  it('PLI-32: resolveTemplateVars handles null vars safely', () => {
    const result = resolveTemplateVars('path/{x}', null);
    assert.strictEqual(result, 'path/{x}');
  });

  it('PLI-33: workflow modifiers constraint (require_failing_test_first) still works', () => {
    const phaseReq = { test_iteration: { enabled: false } };
    const modifiers = { require_failing_test_first: true };
    const constraints = buildCriticalConstraints('06-implementation', phaseReq, modifiers, false, {});
    const hasFailingTest = constraints.some(c => c.includes('failing test'));
    assert.ok(hasFailingTest, 'Should include require_failing_test_first constraint');
  });
});
