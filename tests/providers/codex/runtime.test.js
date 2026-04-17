/**
 * Unit tests for src/providers/codex/runtime.js
 * REQ-0135: Codex ProviderRuntime Adapter
 *
 * Tests createRuntime(), all 5 ProviderRuntime methods, and projection
 * integration. child_process functions are injected via config for testability.
 *
 * Test ID prefix: XRT- (Codex Runtime)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { createRuntime } from '../../../src/providers/codex/runtime.js';
import { validateProviderRuntime } from '../../../src/core/orchestration/provider-runtime.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mock execSync that succeeds (CLI found) */
function mockExecSyncSuccess() {
  return Buffer.from('/usr/local/bin/codex\n');
}

/** Mock execSync that fails (CLI not found) */
function mockExecSyncFail() {
  throw new Error('not found');
}

/**
 * Mock execFile that resolves with stdout/stderr.
 * Signature matches child_process.execFile callback pattern.
 */
function mockExecFile(stdout = '{"status":"completed"}', stderr = '') {
  return (cmd, args, opts, callback) => {
    // execFile can be called with (cmd, args, callback) or (cmd, args, opts, callback)
    const cb = typeof opts === 'function' ? opts : callback;
    const options = typeof opts === 'function' ? {} : opts;
    process.nextTick(() => cb(null, stdout, stderr));
  };
}

/** Mock execFile that errors */
function mockExecFileError(errMsg = 'codex exec failed') {
  return (cmd, args, opts, callback) => {
    const cb = typeof opts === 'function' ? opts : callback;
    process.nextTick(() => cb(new Error(errMsg), '', ''));
  };
}

/** Mock spawn that returns an EventEmitter-like object */
function mockSpawn(stdout = 'interactive output') {
  return (cmd, args, opts) => {
    const proc = {
      stdout: {
        on: (event, handler) => {
          if (event === 'data') process.nextTick(() => handler(Buffer.from(stdout)));
        },
        setEncoding: () => {}
      },
      stderr: {
        on: () => {},
        setEncoding: () => {}
      },
      stdin: {
        write: () => {},
        end: () => {}
      },
      on: (event, handler) => {
        if (event === 'close') process.nextTick(() => handler(0));
      }
    };
    return proc;
  };
}

/** Mock readline interface */
function mockReadline(answer = 'user response') {
  return {
    createInterface: () => ({
      question: (prompt, cb) => process.nextTick(() => cb(answer)),
      close: () => {}
    })
  };
}

/** Mock projectInstructions */
function mockProjectInstructions(content = '# Instructions\nDo the thing') {
  return (phase, agent, options) => ({
    content,
    metadata: { phase, agent, skills_injected: [], team_type: 'unknown' }
  });
}

/** Create config with all mocks injected */
function mockConfig(overrides = {}) {
  return {
    projectRoot: '/tmp/test-project',
    _execSync: mockExecSyncSuccess,
    _execFile: mockExecFile(),
    _spawn: mockSpawn(),
    _readline: mockReadline(),
    _projectInstructions: mockProjectInstructions(),
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Interface Compliance
// ---------------------------------------------------------------------------

describe('Codex createRuntime — Interface Compliance (REQ-0135 FR-001)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // XRT-01: createRuntime returns an object
  it('XRT-01: createRuntime returns an object (AC-001-01)', () => {
    assert.strictEqual(typeof runtime, 'object');
    assert.notStrictEqual(runtime, null);
  });

  // XRT-02: returned runtime passes validateProviderRuntime
  it('XRT-02: returned runtime passes validateProviderRuntime (AC-001-02)', () => {
    const result = validateProviderRuntime(runtime);
    assert.strictEqual(result.valid, true, `Missing methods: ${result.missing.join(', ')}`);
  });

  // XRT-03: all 5 methods are functions
  it('XRT-03: all 5 required methods are functions (AC-001-01)', () => {
    const methods = ['executeTask', 'executeParallel', 'presentInteractive', 'readUserResponse', 'validateRuntime'];
    for (const name of methods) {
      assert.strictEqual(typeof runtime[name], 'function', `${name} must be a function`);
    }
  });

  // XRT-04: createRuntime with minimal config returns valid runtime
  it('XRT-04: createRuntime with minimal config returns valid runtime (AC-001-01)', () => {
    const rt = createRuntime({ projectRoot: '/tmp' });
    const result = validateProviderRuntime(rt);
    assert.strictEqual(result.valid, true);
  });
});

// ---------------------------------------------------------------------------
// executeTask
// ---------------------------------------------------------------------------

describe('Codex executeTask (REQ-0135 FR-002)', () => {
  // XRT-05: returns TaskResult with required fields
  it('XRT-05: returns TaskResult with status, output, duration_ms (AC-002-01)', async () => {
    const runtime = createRuntime(mockConfig());
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {
      workflow_type: 'feature'
    });
    assert.ok('status' in result, 'Should have status');
    assert.ok('output' in result, 'Should have output');
    assert.ok('duration_ms' in result, 'Should have duration_ms');
  });

  // XRT-06: status is 'completed' on success
  it('XRT-06: status is "completed" on successful exec (AC-002-02)', async () => {
    const runtime = createRuntime(mockConfig({
      _execFile: mockExecFile('{"result":"ok"}')
    }));
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.strictEqual(result.status, 'completed');
  });

  // XRT-07: parses JSON stdout
  it('XRT-07: parses JSON stdout into output (AC-002-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _execFile: mockExecFile('{"result":"ok","count":42}')
    }));
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.deepStrictEqual(result.output, { result: 'ok', count: 42 });
  });

  // XRT-08: wraps non-JSON stdout as string output
  it('XRT-08: wraps non-JSON stdout as string output (AC-002-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _execFile: mockExecFile('plain text output')
    }));
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.strictEqual(result.output, 'plain text output');
  });

  // XRT-09: calls projectInstructions with correct args
  it('XRT-09: calls _projectInstructions with phase, agent, options (AC-002-04)', async () => {
    let capturedArgs = null;
    const runtime = createRuntime(mockConfig({
      _projectInstructions: (phase, agent, opts) => {
        capturedArgs = { phase, agent, opts };
        return { content: '# test', metadata: { phase, agent, skills_injected: [], team_type: 'unknown' } };
      }
    }));
    await runtime.executeTask('06-implementation', '05-software-developer', { workflow_type: 'feature' });
    assert.strictEqual(capturedArgs.phase, '06-implementation');
    assert.strictEqual(capturedArgs.agent, '05-software-developer');
  });

  // XRT-10: handles exec failure gracefully
  it('XRT-10: returns status "failed" on codex exec error (AC-002-05)', async () => {
    const runtime = createRuntime(mockConfig({
      _execFile: mockExecFileError('codex crashed')
    }));
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.strictEqual(result.status, 'failed');
    assert.ok(result.error, 'Should have error field');
    assert.ok(result.error.includes('codex crashed'));
  });

  // XRT-11: duration_ms is a non-negative number
  it('XRT-11: duration_ms is a non-negative number (AC-002-01)', async () => {
    const runtime = createRuntime(mockConfig());
    const result = await runtime.executeTask('01-requirements', '01-requirements-analyst', {});
    assert.strictEqual(typeof result.duration_ms, 'number');
    assert.ok(result.duration_ms >= 0);
  });

  // XRT-12: handles missing context gracefully
  it('XRT-12: handles undefined context gracefully (AC-002-06)', async () => {
    const runtime = createRuntime(mockConfig());
    const result = await runtime.executeTask('06-implementation', '05-software-developer');
    assert.ok('status' in result);
    assert.ok('output' in result);
  });

  // XRT-13: handles empty stdout
  it('XRT-13: handles empty stdout (AC-002-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _execFile: mockExecFile('')
    }));
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.output, '');
  });

  // XRT-36: composedCard is appended to projection content (REQ-GH-253 T046)
  it('XRT-36: composedCard is appended to projection content (REQ-GH-253)', async () => {
    let capturedArgs = null;
    const runtime = createRuntime(mockConfig({
      _projectInstructions: mockProjectInstructions('# Base Instructions'),
      _execFile: (cmd, args, opts, cb) => {
        capturedArgs = { cmd, args };
        const callback = typeof opts === 'function' ? opts : cb;
        process.nextTick(() => callback(null, '{"ok":true}', ''));
      }
    }));
    await runtime.executeTask('06-implementation', '05-software-developer', {
      composedCard: '## Roundtable State Card\nYou are in CONVERSATION state.'
    });
    assert.ok(capturedArgs, 'execFile should have been called');
    const argsStr = capturedArgs.args.join(' ');
    assert.ok(argsStr.includes('Roundtable State Card'), 'Should include composedCard in exec args');
    assert.ok(argsStr.includes('Base Instructions'), 'Should still include base projection');
  });

  // XRT-37: composedCard is appended after projection content (REQ-GH-253 T046)
  it('XRT-37: composedCard appears after projection content (REQ-GH-253)', async () => {
    let capturedContent = null;
    const runtime = createRuntime(mockConfig({
      _projectInstructions: mockProjectInstructions('PROJ_MARKER'),
      _execFile: (cmd, args, opts, cb) => {
        capturedContent = args[args.length - 1]; // last arg is the content
        const callback = typeof opts === 'function' ? opts : cb;
        process.nextTick(() => callback(null, '{}', ''));
      }
    }));
    await runtime.executeTask('06-implementation', '05-software-developer', {
      composedCard: 'CARD_MARKER'
    });
    assert.ok(capturedContent, 'Content should have been captured');
    const projIdx = capturedContent.indexOf('PROJ_MARKER');
    const cardIdx = capturedContent.indexOf('CARD_MARKER');
    assert.ok(projIdx >= 0, 'Projection marker should be present');
    assert.ok(cardIdx >= 0, 'Card marker should be present');
    assert.ok(projIdx < cardIdx, 'Projection should come before composedCard');
  });

  // XRT-38: no composedCard — content unchanged (REQ-GH-253 T046)
  it('XRT-38: content unchanged when composedCard absent (REQ-GH-253)', async () => {
    let capturedContent = null;
    const runtime = createRuntime(mockConfig({
      _projectInstructions: mockProjectInstructions('# Only Instructions'),
      _execFile: (cmd, args, opts, cb) => {
        capturedContent = args[args.length - 1];
        const callback = typeof opts === 'function' ? opts : cb;
        process.nextTick(() => callback(null, '{}', ''));
      }
    }));
    await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.ok(capturedContent.includes('Only Instructions'));
    assert.ok(!capturedContent.includes('Roundtable'), 'Should not contain card text');
  });
});

// ---------------------------------------------------------------------------
// executeParallel
// ---------------------------------------------------------------------------

describe('Codex executeParallel (REQ-0135 FR-003)', () => {
  let runtime;

  beforeEach(() => {
    runtime = createRuntime(mockConfig());
  });

  // XRT-14: returns array matching input length
  it('XRT-14: returns array matching input task count (AC-003-01)', async () => {
    const tasks = [
      { phase: '01-requirements', agent: '01-requirements-analyst', context: {} },
      { phase: '06-implementation', agent: '05-software-developer', context: {} },
      { phase: '08-code-review', agent: '07-code-reviewer', context: {} }
    ];
    const results = await runtime.executeParallel(tasks);
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 3);
  });

  // XRT-15: preserves order
  it('XRT-15: results preserve input order (AC-003-02)', async () => {
    let callIndex = 0;
    const rt = createRuntime(mockConfig({
      _execFile: (cmd, args, opts, cb) => {
        const idx = callIndex++;
        const callback = typeof opts === 'function' ? opts : cb;
        process.nextTick(() => callback(null, JSON.stringify({ order: idx }), ''));
      }
    }));
    const tasks = [
      { phase: '01-requirements', agent: '01-requirements-analyst', context: {} },
      { phase: '06-implementation', agent: '05-software-developer', context: {} }
    ];
    const results = await rt.executeParallel(tasks);
    assert.strictEqual(results[0].output.order, 0);
    assert.strictEqual(results[1].output.order, 1);
  });

  // XRT-16: handles per-task failures without rejecting all
  it('XRT-16: per-task failure does not reject entire batch (AC-003-03)', async () => {
    let callCount = 0;
    const rt = createRuntime(mockConfig({
      _execFile: (cmd, args, opts, cb) => {
        const callback = typeof opts === 'function' ? opts : cb;
        callCount++;
        if (callCount === 2) {
          process.nextTick(() => callback(new Error('task 2 failed'), '', ''));
        } else {
          process.nextTick(() => callback(null, '{"ok":true}', ''));
        }
      }
    }));
    const tasks = [
      { phase: '01-requirements', agent: '01-requirements-analyst', context: {} },
      { phase: '06-implementation', agent: '05-software-developer', context: {} },
      { phase: '08-code-review', agent: '07-code-reviewer', context: {} }
    ];
    const results = await rt.executeParallel(tasks);
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0].status, 'completed');
    assert.strictEqual(results[1].status, 'failed');
    assert.strictEqual(results[2].status, 'completed');
  });

  // XRT-17: empty input returns empty array
  it('XRT-17: empty tasks array returns empty results (AC-003-04)', async () => {
    const results = await runtime.executeParallel([]);
    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 0);
  });

  // XRT-18: each result is a TaskResult
  it('XRT-18: each result has TaskResult fields (AC-003-01)', async () => {
    const tasks = [{ phase: '06-implementation', agent: '05-software-developer', context: {} }];
    const results = await runtime.executeParallel(tasks);
    assert.ok('status' in results[0]);
    assert.ok('output' in results[0]);
    assert.ok('duration_ms' in results[0]);
  });
});

// ---------------------------------------------------------------------------
// presentInteractive
// ---------------------------------------------------------------------------

describe('Codex presentInteractive (REQ-0135 FR-004)', () => {
  // XRT-19: returns output string from spawned process
  it('XRT-19: returns output from codex process (AC-004-01)', async () => {
    const runtime = createRuntime(mockConfig({
      _spawn: mockSpawn('interactive result')
    }));
    const result = await runtime.presentInteractive('What do you think?');
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.includes('interactive result'));
  });

  // XRT-20: passes prompt to spawn
  it('XRT-20: passes prompt to spawn args (AC-004-02)', async () => {
    let capturedArgs = null;
    const runtime = createRuntime(mockConfig({
      _spawn: (cmd, args, opts) => {
        capturedArgs = { cmd, args };
        return mockSpawn('ok')(cmd, args, opts);
      }
    }));
    await runtime.presentInteractive('My prompt');
    assert.ok(capturedArgs, 'spawn should have been called');
    // The prompt should be somewhere in the args
    const argsJoined = capturedArgs.args.join(' ');
    assert.ok(argsJoined.includes('My prompt') || capturedArgs.cmd === 'codex');
  });

  // XRT-21: handles spawn failure
  it('XRT-21: handles spawn failure gracefully (AC-004-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _spawn: (cmd, args, opts) => ({
        stdout: { on: () => {}, setEncoding: () => {} },
        stderr: { on: () => {}, setEncoding: () => {} },
        stdin: { write: () => {}, end: () => {} },
        on: (event, handler) => {
          if (event === 'error') process.nextTick(() => handler(new Error('spawn fail')));
          if (event === 'close') process.nextTick(() => handler(1));
        }
      })
    }));
    // Should not throw
    const result = await runtime.presentInteractive('test');
    assert.strictEqual(typeof result, 'string');
  });
});

// ---------------------------------------------------------------------------
// readUserResponse
// ---------------------------------------------------------------------------

describe('Codex readUserResponse (REQ-0135 FR-005)', () => {
  // XRT-22: returns user text from readline
  it('XRT-22: returns user text response (AC-005-01)', async () => {
    const runtime = createRuntime(mockConfig({
      _readline: mockReadline('my choice')
    }));
    const result = await runtime.readUserResponse({ prompt: 'Pick one:' });
    assert.strictEqual(result, 'my choice');
  });

  // XRT-23: formats choices as numbered list
  it('XRT-23: formats choices for display (AC-005-02)', async () => {
    let capturedPrompt = null;
    const runtime = createRuntime(mockConfig({
      _readline: {
        createInterface: () => ({
          question: (prompt, cb) => {
            capturedPrompt = prompt;
            process.nextTick(() => cb('1'));
          },
          close: () => {}
        })
      }
    }));
    await runtime.readUserResponse({
      prompt: 'Choose:',
      choices: ['alpha', 'beta', 'gamma']
    });
    assert.ok(capturedPrompt, 'readline should have been called');
    assert.ok(capturedPrompt.includes('alpha'));
    assert.ok(capturedPrompt.includes('beta'));
    assert.ok(capturedPrompt.includes('gamma'));
  });

  // XRT-24: returns selected choice by number
  it('XRT-24: resolves numeric selection to choice string (AC-005-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _readline: mockReadline('2')
    }));
    const result = await runtime.readUserResponse({
      prompt: 'Choose:',
      choices: ['alpha', 'beta', 'gamma']
    });
    assert.strictEqual(result, 'beta');
  });

  // XRT-25: returns raw text when no choices provided
  it('XRT-25: returns raw text when no choices (AC-005-01)', async () => {
    const runtime = createRuntime(mockConfig({
      _readline: mockReadline('free text answer')
    }));
    const result = await runtime.readUserResponse({ prompt: 'Say something:' });
    assert.strictEqual(result, 'free text answer');
  });

  // XRT-26: handles empty options
  it('XRT-26: handles empty options object (AC-005-04)', async () => {
    const runtime = createRuntime(mockConfig({
      _readline: mockReadline('something')
    }));
    const result = await runtime.readUserResponse({});
    assert.strictEqual(typeof result, 'string');
  });

  // XRT-27: handles undefined options
  it('XRT-27: handles undefined options (AC-005-04)', async () => {
    const runtime = createRuntime(mockConfig({
      _readline: mockReadline('fallback')
    }));
    const result = await runtime.readUserResponse();
    assert.strictEqual(typeof result, 'string');
  });
});

// ---------------------------------------------------------------------------
// validateRuntime
// ---------------------------------------------------------------------------

describe('Codex validateRuntime (REQ-0135 FR-006)', () => {
  // XRT-28: returns available true when codex CLI exists
  it('XRT-28: returns { available: true } when codex CLI found (AC-006-01)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: mockExecSyncSuccess
    }));
    const result = await runtime.validateRuntime();
    assert.strictEqual(result.available, true);
  });

  // XRT-29: returns available false when codex CLI missing
  it('XRT-29: returns { available: false, reason } when codex CLI not found (AC-006-02)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: mockExecSyncFail
    }));
    const result = await runtime.validateRuntime();
    assert.strictEqual(result.available, false);
    assert.ok(typeof result.reason === 'string');
    assert.ok(result.reason.length > 0);
  });

  // XRT-30: reason mentions codex
  it('XRT-30: failure reason mentions "codex" (AC-006-02)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: mockExecSyncFail
    }));
    const result = await runtime.validateRuntime();
    assert.ok(result.reason.toLowerCase().includes('codex'));
  });

  // XRT-31: does not throw on CLI check failure
  it('XRT-31: does not throw when CLI check fails (AC-006-03)', async () => {
    const runtime = createRuntime(mockConfig({
      _execSync: () => { throw new Error('ENOENT'); }
    }));
    const result = await runtime.validateRuntime();
    assert.strictEqual(typeof result, 'object');
    assert.strictEqual(result.available, false);
  });
});

// ---------------------------------------------------------------------------
// Projection Integration
// ---------------------------------------------------------------------------

describe('Codex projection integration (REQ-0135 FR-007)', () => {
  // XRT-32: executeTask uses projectInstructions output as prompt
  it('XRT-32: executeTask uses projectInstructions content as exec input (AC-007-01)', async () => {
    let capturedArgs = null;
    const runtime = createRuntime(mockConfig({
      _projectInstructions: mockProjectInstructions('# Custom Instructions\nDo it'),
      _execFile: (cmd, args, opts, cb) => {
        capturedArgs = { cmd, args };
        const callback = typeof opts === 'function' ? opts : cb;
        process.nextTick(() => callback(null, '{"done":true}', ''));
      }
    }));
    await runtime.executeTask('06-implementation', '05-software-developer', {});
    assert.ok(capturedArgs, 'execFile should have been called');
    // The instructions content should be passed as part of args
    const argsStr = JSON.stringify(capturedArgs.args);
    assert.ok(argsStr.includes('Custom Instructions') || argsStr.includes('Do it'),
      'Instructions content should be passed to codex exec');
  });

  // XRT-33: falls back gracefully when projectInstructions fails
  it('XRT-33: falls back when _projectInstructions throws (AC-007-02)', async () => {
    const runtime = createRuntime(mockConfig({
      _projectInstructions: () => { throw new Error('projection failed'); }
    }));
    const result = await runtime.executeTask('06-implementation', '05-software-developer', {});
    // Should still return a TaskResult (may be failed or completed with fallback)
    assert.ok('status' in result);
    assert.ok('output' in result);
  });
});

// ---------------------------------------------------------------------------
// Module Exports
// ---------------------------------------------------------------------------

describe('Codex runtime module exports (REQ-0135)', () => {
  // XRT-34: exports createRuntime function
  it('XRT-34: exports createRuntime as a function', async () => {
    const mod = await import('../../../src/providers/codex/runtime.js');
    assert.strictEqual(typeof mod.createRuntime, 'function');
  });

  // XRT-35: does not export PHASE_AGENT_MAP (Codex uses projection)
  it('XRT-35: does not export PHASE_AGENT_MAP (Codex uses projection instead)', async () => {
    const mod = await import('../../../src/providers/codex/runtime.js');
    assert.strictEqual(mod.PHASE_AGENT_MAP, undefined);
  });
});
