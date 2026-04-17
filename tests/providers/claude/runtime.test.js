/**
 * Unit tests for src/providers/claude/runtime.js
 * REQ-0134: Claude ProviderRuntime Adapter
 *
 * Tests createRuntime(), all 5 ProviderRuntime methods, and PHASE_AGENT_MAP.
 * child_process.execSync is injected via config for testability.
 *
 * Test ID prefix: CRT- (Claude Runtime)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createRuntime, PHASE_AGENT_MAP } from '../../../src/providers/claude/runtime.js';
import { validateProviderRuntime } from '../../../src/core/orchestration/provider-runtime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a config with mocked execSync */
function mockConfig(overrides = {}) {
  return {
    projectRoot: '/tmp/test-project',
    _execSync: () => Buffer.from('/usr/local/bin/claude\n'),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Interface Compliance
// ---------------------------------------------------------------------------

describe('Claude createRuntime — Interface Compliance (REQ-0134 FR-001)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // CRT-01: createRuntime returns an object
  it('CRT-01: createRuntime returns an object (AC-001-01)', () => {
    assert.strictEqual(typeof runtime, 'object');
    assert.notStrictEqual(runtime, null);
  });

  // CRT-02: returned runtime passes validateProviderRuntime
  it('CRT-02: returned runtime passes validateProviderRuntime (AC-001-02)', () => {
    const result = validateProviderRuntime(runtime);
    assert.strictEqual(result.valid, true, `Missing methods: ${result.missing.join(', ')}`);
  });

  // CRT-03: all 5 methods are functions
  it('CRT-03: all 5 required methods are functions (AC-001-01)', () => {
    const methods = ['executeTask', 'executeParallel', 'presentInteractive', 'readUserResponse', 'validateRuntime'];
    for (const name of methods) {
      assert.strictEqual(typeof runtime[name], 'function', `${name} must be a function`);
    }
  });

  // CRT-04: createRuntime with empty config still returns valid runtime
  it('CRT-04: createRuntime with empty config returns valid runtime (AC-001-01)', () => {
    const rt = createRuntime({});
    const result = validateProviderRuntime(rt);
    assert.strictEqual(result.valid, true);
  });

  // CRT-05: createRuntime with no args returns valid runtime
  it('CRT-05: createRuntime with no args returns valid runtime (AC-001-01)', () => {
    const rt = createRuntime();
    const result = validateProviderRuntime(rt);
    assert.strictEqual(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// executeTask
// ---------------------------------------------------------------------------

describe('Claude executeTask (REQ-0134 FR-002)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // CRT-06: returns TaskResult with required fields
  it('CRT-06: returns TaskResult with status, output, duration_ms (AC-002-01)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-0134',
      workflow_type: 'feature'
    });
    assert.ok('status' in result, 'Should have status');
    assert.ok('output' in result, 'Should have output');
    assert.ok('duration_ms' in result, 'Should have duration_ms');
  });

  // CRT-07: status is 'delegated' (shim behavior)
  it('CRT-07: returns status "delegated" for shim mode (AC-002-02)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.strictEqual(result.status, 'delegated');
  });

  // CRT-08: output contains phase, agent, and constructed prompt
  it('CRT-08: output contains phase, agent, prompt (AC-002-03)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-0134',
      workflow_type: 'feature',
      instructions: 'Build the thing'
    });
    assert.strictEqual(result.output.phase, '06-implementation');
    assert.strictEqual(result.output.agent, '05-software-developer');
    assert.strictEqual(typeof result.output.prompt, 'string');
    assert.ok(result.output.prompt.length > 0, 'Prompt should not be empty');
  });

  // CRT-09: duration_ms is a non-negative number
  it('CRT-09: duration_ms is a non-negative number (AC-002-01)', async () => {
    const result = await runtime.executeTask('01-requirements', '01-requirements-analyst', {});
    assert.strictEqual(typeof result.duration_ms, 'number');
    assert.ok(result.duration_ms >= 0);
  });

  // CRT-10: prompt includes context fields when provided
  it('CRT-10: constructed prompt includes context fields (AC-002-03)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      artifact_folder: 'REQ-0134',
      workflow_type: 'feature',
      instructions: 'Implement the adapter',
      skill_context: 'code-implementation'
    });
    const prompt = result.output.prompt;
    assert.ok(prompt.includes('REQ-0134'), 'Prompt should include artifact_folder');
    assert.ok(prompt.includes('feature'), 'Prompt should include workflow_type');
    assert.ok(prompt.includes('Implement the adapter'), 'Prompt should include instructions');
  });

  // CRT-11: handles missing context gracefully
  it('CRT-11: handles undefined context gracefully (AC-002-04)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer');
    assert.strictEqual(result.status, 'delegated');
    assert.ok(result.output.prompt !== undefined);
  });

  // CRT-34: composedCard is injected into prompt (REQ-GH-253 T045)
  it('CRT-34: composedCard is appended to prompt when present (REQ-GH-253)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      instructions: 'Build the widget',
      composedCard: '## Roundtable State Card\nYou are in CONVERSATION state.',
      skill_context: 'code-implementation'
    });
    const prompt = result.output.prompt;
    assert.ok(prompt.includes('Roundtable State Card'), 'Prompt should include composedCard text');
    assert.ok(prompt.includes('CONVERSATION state'), 'Prompt should include card content');
  });

  // CRT-35: composedCard appears after instructions and before skills
  it('CRT-35: composedCard appears after instructions, before skills (REQ-GH-253)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      instructions: 'INSTR_MARKER',
      composedCard: 'CARD_MARKER',
      skill_context: 'SKILL_MARKER'
    });
    const prompt = result.output.prompt;
    const instrIdx = prompt.indexOf('INSTR_MARKER');
    const cardIdx = prompt.indexOf('CARD_MARKER');
    const skillIdx = prompt.indexOf('SKILL_MARKER');
    assert.ok(instrIdx < cardIdx, 'composedCard should appear after instructions');
    assert.ok(cardIdx < skillIdx, 'composedCard should appear before skills');
  });

  // CRT-36: prompt unchanged when composedCard is absent
  it('CRT-36: prompt unchanged when composedCard is not provided (REQ-GH-253)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      instructions: 'Build it',
      skill_context: 'code-implementation'
    });
    const prompt = result.output.prompt;
    assert.ok(!prompt.includes('Roundtable State Card'), 'Should not inject card text');
  });

  // CRT-37: composedCard works with no other optional fields
  it('CRT-37: composedCard works when instructions and skills are absent (REQ-GH-253)', async () => {
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      composedCard: 'STANDALONE_CARD'
    });
    const prompt = result.output.prompt;
    assert.ok(prompt.includes('STANDALONE_CARD'), 'Should include standalone card');
  });
});

// ---------------------------------------------------------------------------
// executeParallel
// ---------------------------------------------------------------------------

describe('Claude executeParallel (REQ-0134 FR-003)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // CRT-12: returns array matching input length
  it('CRT-12: returns array matching input task count (AC-003-01)', async () => {
    const tasks = [
      { phase: '01-requirements', agent: '01-requirements-analyst', context: {} },
      { phase: '06-implementation', agent: '05-software-developer', context: {} },
      { phase: '08-code-review', agent: '07-code-reviewer', context: {} }
    ];
    const results = await runtime.executeParallel(tasks);
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 3);
  });

  // CRT-13: preserves order
  it('CRT-13: results preserve input order (AC-003-02)', async () => {
    const tasks = [
      { phase: '01-requirements', agent: '01-requirements-analyst', context: {} },
      { phase: '06-implementation', agent: '05-software-developer', context: {} }
    ];
    const results = await runtime.executeParallel(tasks);
    assert.strictEqual(results[0].output.phase, '01-requirements');
    assert.strictEqual(results[1].output.phase, '06-implementation');
  });

  // CRT-14: each result is a TaskResult
  it('CRT-14: each result has TaskResult fields (AC-003-01)', async () => {
    const tasks = [{ phase: '01-requirements', agent: '01-requirements-analyst', context: {} }];
    const results = await runtime.executeParallel(tasks);
    assert.ok('status' in results[0]);
    assert.ok('output' in results[0]);
    assert.ok('duration_ms' in results[0]);
  });

  // CRT-15: empty input returns empty array
  it('CRT-15: empty tasks array returns empty results (AC-003-03)', async () => {
    const results = await runtime.executeParallel([]);
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 0);
  });

  // CRT-16: single task works
  it('CRT-16: single task returns single-element array (AC-003-01)', async () => {
    const tasks = [{ phase: '06-implementation', agent: '05-software-developer', context: {} }];
    const results = await runtime.executeParallel(tasks);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].status, 'delegated');
  });
});

// ---------------------------------------------------------------------------
// presentInteractive
// ---------------------------------------------------------------------------

describe('Claude presentInteractive (REQ-0134 FR-004)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // CRT-17: returns structured intent
  it('CRT-17: returns { type: "interactive", prompt } (AC-004-01)', async () => {
    const result = await runtime.presentInteractive('Pick a number 1-3');
    assert.strictEqual(result.type, 'interactive');
    assert.strictEqual(result.prompt, 'Pick a number 1-3');
  });

  // CRT-18: returns object (not string)
  it('CRT-18: returns an object, not a raw string (AC-004-01)', async () => {
    const result = await runtime.presentInteractive('Hello');
    assert.strictEqual(typeof result, 'object');
  });

  // CRT-19: preserves the prompt text
  it('CRT-19: preserves full prompt text (AC-004-02)', async () => {
    const longPrompt = 'This is a long prompt with multiple sentences. It should be preserved exactly.';
    const result = await runtime.presentInteractive(longPrompt);
    assert.strictEqual(result.prompt, longPrompt);
  });
});

// ---------------------------------------------------------------------------
// readUserResponse
// ---------------------------------------------------------------------------

describe('Claude readUserResponse (REQ-0134 FR-005)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // CRT-20: returns structured intent
  it('CRT-20: returns { type: "user_input", options } (AC-005-01)', async () => {
    const options = { prompt: 'Choose:', choices: ['a', 'b'] };
    const result = await runtime.readUserResponse(options);
    assert.strictEqual(result.type, 'user_input');
    assert.deepStrictEqual(result.options, options);
  });

  // CRT-21: handles empty options
  it('CRT-21: handles empty options object (AC-005-02)', async () => {
    const result = await runtime.readUserResponse({});
    assert.strictEqual(result.type, 'user_input');
    assert.deepStrictEqual(result.options, {});
  });

  // CRT-22: handles undefined options
  it('CRT-22: handles undefined options (AC-005-02)', async () => {
    const result = await runtime.readUserResponse();
    assert.strictEqual(result.type, 'user_input');
  });
});

// ---------------------------------------------------------------------------
// validateRuntime
// ---------------------------------------------------------------------------

describe('Claude validateRuntime (REQ-0134 FR-006)', () => {
  // CRT-23: returns available true when claude CLI exists
  it('CRT-23: returns { available: true } when claude CLI found (AC-006-01)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: () => Buffer.from('/usr/local/bin/claude\n')
    }));
    const result = await runtime.validateRuntime();
    assert.strictEqual(result.available, true);
  });

  // CRT-24: returns available false when claude CLI missing
  it('CRT-24: returns { available: false, reason } when claude CLI not found (AC-006-02)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: () => { throw new Error('not found'); }
    }));
    const result = await runtime.validateRuntime();
    assert.strictEqual(result.available, false);
    assert.ok(typeof result.reason === 'string');
    assert.ok(result.reason.length > 0);
  });

  // CRT-25: reason message mentions claude
  it('CRT-25: failure reason mentions "claude" (AC-006-02)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: () => { throw new Error('command not found'); }
    }));
    const result = await runtime.validateRuntime();
    assert.ok(result.reason.toLowerCase().includes('claude'), 'Reason should mention claude');
  });

  // CRT-26: does not throw on CLI check failure
  it('CRT-26: does not throw when CLI check fails (AC-006-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: () => { throw new Error('ENOENT'); }
    }));
    // Should not throw — returns result object instead
    const result = await runtime.validateRuntime();
    assert.strictEqual(typeof result, 'object');
  });
});

// ---------------------------------------------------------------------------
// PHASE_AGENT_MAP
// ---------------------------------------------------------------------------

describe('Claude PHASE_AGENT_MAP (REQ-0134)', () => {
  // CRT-27: PHASE_AGENT_MAP is exported
  it('CRT-27: PHASE_AGENT_MAP is exported and is an object', () => {
    assert.strictEqual(typeof PHASE_AGENT_MAP, 'object');
    assert.notStrictEqual(PHASE_AGENT_MAP, null);
  });

  // CRT-28: PHASE_AGENT_MAP is frozen
  it('CRT-28: PHASE_AGENT_MAP is frozen', () => {
    assert.ok(Object.isFrozen(PHASE_AGENT_MAP), 'PHASE_AGENT_MAP must be frozen');
  });

  // CRT-29: has entries for standard phases
  it('CRT-29: has entries for standard phases (01 through 08 at minimum)', () => {
    const requiredPhases = [
      '01-requirements',
      '02-requirements-tracing',
      '03-architecture',
      '04-test-strategy',
      '05-implementation',
      '06-integration-testing',
      '07-documentation',
      '08-code-review'
    ];
    for (const phase of requiredPhases) {
      assert.ok(phase in PHASE_AGENT_MAP, `Missing phase mapping: ${phase}`);
    }
  });

  // CRT-30: all values are non-empty strings
  it('CRT-30: all values are non-empty strings (agent subagent_type names)', () => {
    for (const [phase, agent] of Object.entries(PHASE_AGENT_MAP)) {
      assert.strictEqual(typeof agent, 'string', `${phase} value must be a string`);
      assert.ok(agent.length > 0, `${phase} value must not be empty`);
    }
  });

  // CRT-31: values follow agent naming pattern (NN-name format)
  it('CRT-31: values follow NN-name agent naming pattern', () => {
    const pattern = /^\d{2}-[a-z][\w-]+$/;
    for (const [phase, agent] of Object.entries(PHASE_AGENT_MAP)) {
      assert.ok(pattern.test(agent), `${phase} -> "${agent}" does not match NN-name pattern`);
    }
  });
});

// ---------------------------------------------------------------------------
// Module Exports
// ---------------------------------------------------------------------------

describe('Claude runtime module exports (REQ-0134)', () => {
  // CRT-32: exports createRuntime function
  it('CRT-32: exports createRuntime as a function', async () => {
    const mod = await import('../../../src/providers/claude/runtime.js');
    assert.strictEqual(typeof mod.createRuntime, 'function');
  });

  // CRT-33: exports PHASE_AGENT_MAP
  it('CRT-33: exports PHASE_AGENT_MAP as an object', async () => {
    const mod = await import('../../../src/providers/claude/runtime.js');
    assert.strictEqual(typeof mod.PHASE_AGENT_MAP, 'object');
  });
});
