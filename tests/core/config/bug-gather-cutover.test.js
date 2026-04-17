/**
 * Bug-gather cutover verification tests (REQ-GH-253, T044)
 *
 * Verifies that the bug-gather workflow correctly uses the mechanism path
 * when migration_mode is "mechanism" (the default after T042), and
 * correctly falls back to prose (returns null) when migration_mode is "prose".
 *
 * Also validates the bug-gather definition loads correctly and that
 * external_delegation is present on PRESENTING_BUG_SUMMARY accept transitions.
 *
 * Traces: T044, FR-008
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpProject() {
  const dir = mkdtempSync(join(tmpdir(), 'isdlc-bg-cutover-'));
  mkdirSync(join(dir, '.isdlc'), { recursive: true });
  return dir;
}

function writeConfig(dir, config) {
  writeFileSync(join(dir, '.isdlc', 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Load the CJS roundtable bridge with a fresh require cache.
 * Returns { bridge, configBridge } so callers can clear caches.
 */
function loadFreshBridge() {
  const bridgePath = require.resolve('../../../src/core/bridge/roundtable.cjs');
  const configPath = require.resolve('../../../src/core/bridge/config.cjs');
  delete require.cache[bridgePath];
  delete require.cache[configPath];
  const bridge = require('../../../src/core/bridge/roundtable.cjs');
  const configBridge = require('../../../src/core/bridge/config.cjs');
  bridge._resetCache();
  configBridge.clearConfigCache();
  return { bridge, configBridge };
}

// ---------------------------------------------------------------------------
// BG-01..BG-04: initializeRoundtable('bug-gather') with mechanism mode
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Bug-gather cutover: mechanism mode', () => {
  let tmpDir;
  let bridge;
  let configBridge;

  beforeEach(() => {
    const loaded = loadFreshBridge();
    bridge = loaded.bridge;
    configBridge = loaded.configBridge;
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('BG-01: initializeRoundtable("bug-gather") returns non-null with default config (mechanism)', async () => {
    // Default migration_mode is "mechanism" — bug-gather should initialize
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null, 'initializeRoundtable should return non-null for mechanism mode');
    assert.ok(result.definition, 'result should have a definition');
    assert.ok(result.machine, 'result should have a machine');
    assert.ok(result.rollingState, 'result should have a rollingState');
  });

  it('BG-02: initializeRoundtable("bug-gather") returns non-null with explicit mechanism config', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'mechanism' } });
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null, 'explicit mechanism mode should initialize');
    assert.ok(result.machine, 'result should have a machine');
  });

  it('BG-03: machine starts in CONVERSATION state', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.machine.getCurrentState(), 'CONVERSATION');
  });

  it('BG-04: machine has bug_gather workflow_type in definition', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.definition.workflow_type, 'bug_gather');
  });
});

// ---------------------------------------------------------------------------
// BG-10..BG-12: initializeRoundtable('bug-gather') with prose mode (returns null)
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Bug-gather cutover: prose mode falls back', () => {
  let tmpDir;
  let bridge;
  let configBridge;

  beforeEach(() => {
    const loaded = loadFreshBridge();
    bridge = loaded.bridge;
    configBridge = loaded.configBridge;
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('BG-10: initializeRoundtable("bug-gather") returns null when migration_mode is "prose"', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'prose' } });
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.strictEqual(result, null, 'prose mode should return null for bug-gather');
  });

  it('BG-11: initializeRoundtable("bug-gather") returns non-null when migration_mode is "parallel"', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'parallel' } });
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null, 'parallel mode should still initialize bug-gather');
  });

  it('BG-12: prose mode returns null for both analyze and bug-gather equally', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'prose' } });
    const analyzeResult = await bridge.initializeRoundtable('analyze', 'CONVERSATION', { projectRoot: tmpDir });
    const bugGatherResult = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.strictEqual(analyzeResult, null, 'prose mode should return null for analyze');
    assert.strictEqual(bugGatherResult, null, 'prose mode should return null for bug-gather');
  });
});

// ---------------------------------------------------------------------------
// BG-20..BG-23: Bug-gather definition structural validation
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — Bug-gather definition loads correctly', () => {
  let tmpDir;
  let bridge;

  beforeEach(() => {
    const loaded = loadFreshBridge();
    bridge = loaded.bridge;
    loaded.configBridge.clearConfigCache();
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('BG-20: definition contains expected bug-gather states', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const states = Object.keys(result.definition.states);
    const expectedStates = [
      'IDLE', 'CONVERSATION', 'PRESENTING_BUG_SUMMARY',
      'PRESENTING_ROOT_CAUSE', 'PRESENTING_FIX_STRATEGY',
      'PRESENTING_TASKS', 'AMENDING', 'FINALIZING', 'COMPLETE',
    ];
    for (const expected of expectedStates) {
      assert.ok(states.includes(expected), `definition should include state: ${expected}`);
    }
  });

  it('BG-21: CONVERSATION state has sub_tasks defined', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const conversationState = result.definition.states.CONVERSATION;
    assert.ok(conversationState.sub_tasks, 'CONVERSATION state should have sub_tasks');
    const tasks = conversationState.sub_tasks.tasks || conversationState.sub_tasks;
    assert.ok(Array.isArray(tasks), 'sub_tasks should contain a tasks array');
    assert.ok(tasks.length >= 3, 'bug-gather CONVERSATION should have at least 3 sub-tasks');
  });

  it('BG-22: COMPLETE state is terminal', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const completeState = result.definition.states.COMPLETE;
    assert.strictEqual(completeState.terminal, true, 'COMPLETE state should be terminal');
  });

  it('BG-23: definition has completion_signal BUG_ROUNDTABLE_COMPLETE', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    assert.strictEqual(result.definition.completion_signal, 'BUG_ROUNDTABLE_COMPLETE');
  });
});

// ---------------------------------------------------------------------------
// BG-30..BG-33: external_delegation on PRESENTING_BUG_SUMMARY transitions
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T044 — external_delegation on PRESENTING_BUG_SUMMARY', () => {
  let tmpDir;
  let bridge;

  beforeEach(() => {
    const loaded = loadFreshBridge();
    bridge = loaded.bridge;
    loaded.configBridge.clearConfigCache();
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('BG-30: PRESENTING_BUG_SUMMARY has accept transition with external_delegation', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const bugSummaryState = result.definition.states.PRESENTING_BUG_SUMMARY;
    assert.ok(bugSummaryState, 'PRESENTING_BUG_SUMMARY state should exist');
    const transitions = bugSummaryState.transitions;
    assert.ok(Array.isArray(transitions), 'transitions should be an array');
    const acceptTransition = transitions.find(t => t.condition === 'accept');
    assert.ok(acceptTransition, 'accept transition should exist');
    assert.ok(acceptTransition.external_delegation, 'accept transition should have external_delegation');
  });

  it('BG-31: external_delegation targets tracing-orchestrator agent', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const transitions = result.definition.states.PRESENTING_BUG_SUMMARY.transitions;
    const acceptTransition = transitions.find(t => t.condition === 'accept');
    assert.strictEqual(acceptTransition.external_delegation.agent, 'tracing-orchestrator');
  });

  it('BG-32: external_delegation has fail_open enabled', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const transitions = result.definition.states.PRESENTING_BUG_SUMMARY.transitions;
    const acceptTransition = transitions.find(t => t.condition === 'accept');
    const failOpen = acceptTransition.external_delegation.fail_open;
    assert.ok(failOpen, 'fail_open should be present');
    assert.strictEqual(failOpen.enabled, true, 'fail_open.enabled should be true');
  });

  it('BG-33: external_delegation accept transition targets PRESENTING_ROOT_CAUSE', async () => {
    const result = await bridge.initializeRoundtable('bug-gather', 'CONVERSATION', { projectRoot: tmpDir });
    assert.notStrictEqual(result, null);
    const transitions = result.definition.states.PRESENTING_BUG_SUMMARY.transitions;
    const acceptTransition = transitions.find(t => t.condition === 'accept');
    assert.strictEqual(acceptTransition.target, 'PRESENTING_ROOT_CAUSE');
  });
});
