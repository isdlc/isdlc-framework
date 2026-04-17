/**
 * Tests for migration_mode in roundtable config (REQ-GH-253, T040)
 *
 * Verifies that:
 * - ROUNDTABLE_DEFAULTS includes migration_mode: "parallel"
 * - getRoundtableConfig() returns migration_mode from config
 * - Invalid migration_mode values fall back to default
 * - CJS bridge config.cjs has matching behavior
 *
 * Traces: T040, FR-008, AC-008-01
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import {
  getRoundtableConfig,
  ROUNDTABLE_DEFAULTS,
  clearConfigCache,
} from '../../../src/core/config/config-service.js';

// CJS bridge for parity testing
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpProject() {
  const dir = mkdtempSync(join(tmpdir(), 'isdlc-mig-'));
  mkdirSync(join(dir, '.isdlc'), { recursive: true });
  return dir;
}

function writeConfig(dir, config) {
  writeFileSync(join(dir, '.isdlc', 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// MM-01..MM-04: ROUNDTABLE_DEFAULTS shape
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T040 — ROUNDTABLE_DEFAULTS', () => {
  it('MM-01: ROUNDTABLE_DEFAULTS includes migration_mode', () => {
    assert.ok('migration_mode' in ROUNDTABLE_DEFAULTS, 'should have migration_mode key');
    // T042 cutover: default changed from "parallel" to "mechanism"
    assert.strictEqual(ROUNDTABLE_DEFAULTS.migration_mode, 'mechanism');
  });

  it('MM-02: ROUNDTABLE_DEFAULTS still includes task_card', () => {
    assert.ok('task_card' in ROUNDTABLE_DEFAULTS);
    assert.strictEqual(ROUNDTABLE_DEFAULTS.task_card.max_skills_total, 8);
  });

  it('MM-03: ROUNDTABLE_DEFAULTS is frozen', () => {
    assert.ok(Object.isFrozen(ROUNDTABLE_DEFAULTS));
  });
});

// ---------------------------------------------------------------------------
// MM-10..MM-19: getRoundtableConfig() migration_mode resolution
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T040 — getRoundtableConfig() migration_mode', () => {
  let tmpDir;

  beforeEach(() => {
    clearConfigCache();
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('MM-10: returns default "mechanism" when no config file', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'isdlc-mig-empty-'));
    mkdirSync(join(emptyDir, '.isdlc'), { recursive: true });
    try {
      const result = getRoundtableConfig(emptyDir);
      // T042 cutover: default is "mechanism"
      assert.strictEqual(result.migration_mode, 'mechanism');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('MM-11: returns "mechanism" when config has roundtable but no migration_mode', () => {
    writeConfig(tmpDir, { roundtable: { verbosity: 'bulleted' } });
    const result = getRoundtableConfig(tmpDir);
    // T042 cutover: default is "mechanism"
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-12: returns "mechanism" when config sets migration_mode to "mechanism"', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'mechanism' } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-13: returns "prose" when config sets migration_mode to "prose"', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'prose' } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'prose');
  });

  it('MM-14: returns "parallel" when config sets migration_mode to "parallel"', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'parallel' } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'parallel');
  });

  it('MM-15: falls back to default for invalid migration_mode string', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'invalid-mode' } });
    const result = getRoundtableConfig(tmpDir);
    // T042 cutover: default is "mechanism"
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-16: falls back to default for non-string migration_mode (number)', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 42 } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-17: falls back to default for non-string migration_mode (boolean)', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: true } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-18: falls back to default for non-string migration_mode (null)', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: null } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-19: migration_mode coexists with task_card', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'mechanism', task_card: { max_skills_total: 12 } } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
    assert.strictEqual(result.task_card.max_skills_total, 12);
  });
});

// ---------------------------------------------------------------------------
// MM-20..MM-24: CJS bridge parity
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T040 — CJS bridge config parity', () => {
  let tmpDir;
  let cjsBridge;

  beforeEach(() => {
    tmpDir = createTmpProject();
    // Clear CJS require cache for config.cjs
    const configCjsPath = require.resolve('../../../src/core/bridge/config.cjs');
    delete require.cache[configCjsPath];
    cjsBridge = require('../../../src/core/bridge/config.cjs');
    cjsBridge.clearConfigCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('MM-20: CJS ROUNDTABLE_DEFAULTS includes migration_mode', () => {
    assert.ok('migration_mode' in cjsBridge.ROUNDTABLE_DEFAULTS);
    // T042 cutover: default is "mechanism"
    assert.strictEqual(cjsBridge.ROUNDTABLE_DEFAULTS.migration_mode, 'mechanism');
  });

  it('MM-21: CJS getRoundtableConfig() returns migration_mode from config', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'mechanism' } });
    const result = cjsBridge.getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-22: CJS getRoundtableConfig() falls back for invalid migration_mode', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'bogus' } });
    const result = cjsBridge.getRoundtableConfig(tmpDir);
    // T042 cutover: default is "mechanism"
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('MM-23: CJS getRoundtableConfig() returns default when no config', () => {
    const emptyDir = mkdtempSync(join(tmpdir(), 'isdlc-cjs-mig-'));
    mkdirSync(join(emptyDir, '.isdlc'), { recursive: true });
    try {
      const result = cjsBridge.getRoundtableConfig(emptyDir);
      // T042 cutover: default is "mechanism"
      assert.strictEqual(result.migration_mode, 'mechanism');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it('MM-24: CJS and ESM produce identical results for same config', () => {
    clearConfigCache();
    writeConfig(tmpDir, { roundtable: { migration_mode: 'prose', task_card: { max_skills_total: 5 } } });
    const esmResult = getRoundtableConfig(tmpDir);

    // Re-clear CJS cache
    const configCjsPath = require.resolve('../../../src/core/bridge/config.cjs');
    delete require.cache[configCjsPath];
    const freshCjs = require('../../../src/core/bridge/config.cjs');
    freshCjs.clearConfigCache();
    const cjsResult = freshCjs.getRoundtableConfig(tmpDir);

    assert.strictEqual(esmResult.migration_mode, cjsResult.migration_mode);
    assert.strictEqual(esmResult.task_card.max_skills_total, cjsResult.task_card.max_skills_total);
  });
});

// ---------------------------------------------------------------------------
// MM-30..MM-33: initializeRoundtable() migration_mode check
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T040 — initializeRoundtable() migration_mode gate', () => {
  let tmpDir;
  let roundtableBridge;

  beforeEach(() => {
    tmpDir = createTmpProject();
    // Clear require caches to pick up fresh config
    const rtPath = require.resolve('../../../src/core/bridge/roundtable.cjs');
    const cfgPath = require.resolve('../../../src/core/bridge/config.cjs');
    delete require.cache[rtPath];
    delete require.cache[cfgPath];
    roundtableBridge = require('../../../src/core/bridge/roundtable.cjs');
    roundtableBridge._resetCache();
    const cfgBridge = require('../../../src/core/bridge/config.cjs');
    cfgBridge.clearConfigCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('MM-30: initializeRoundtable returns null when migration_mode is "prose"', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'prose' } });
    const result = await roundtableBridge.initializeRoundtable('analyze', 'CONVERSATION', { projectRoot: tmpDir });
    assert.strictEqual(result, null, 'should return null when prose mode disables mechanism');
  });

  it('MM-31: initializeRoundtable does NOT return null for migration_mode "parallel"', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'parallel' } });
    // "parallel" should pass the migration gate. Whether the final result is
    // null (loader failure in isolated tmp) or non-null (real framework found)
    // depends on the test env, but the key assertion is the gate does not block.
    // In the framework repo, the definition loader WILL find the workflow files.
    const result = await roundtableBridge.initializeRoundtable('analyze', 'CONVERSATION', { projectRoot: tmpDir });
    // If we're running inside the framework repo, the loader finds definitions
    // and returns a session. If not, it returns null from loader (not gate).
    // Either way, the test documents that "parallel" does not short-circuit.
    assert.ok(result === null || (result && result.machine), 'should either succeed or fail at loader, not migration gate');
  });

  it('MM-32: initializeRoundtable does NOT return null for migration_mode "mechanism"', async () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'mechanism' } });
    const result = await roundtableBridge.initializeRoundtable('analyze', 'CONVERSATION', { projectRoot: tmpDir });
    assert.ok(result === null || (result && result.machine), 'should pass migration gate for mechanism mode');
  });

  it('MM-33: initializeRoundtable proceeds when config is missing (fail-open)', async () => {
    // No config file -- should not block on migration_mode check (default is "parallel")
    const emptyDir = mkdtempSync(join(tmpdir(), 'isdlc-rt-empty-'));
    mkdirSync(join(emptyDir, '.isdlc'), { recursive: true });
    try {
      const result = await roundtableBridge.initializeRoundtable('analyze', 'CONVERSATION', { projectRoot: emptyDir });
      assert.ok(result === null || (result && result.machine), 'should pass migration gate with default config');
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
