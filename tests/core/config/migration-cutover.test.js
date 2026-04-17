/**
 * Migration cutover verification tests (REQ-GH-253, T042)
 *
 * Verifies that after T041 convergence tests passed, the default
 * migration_mode has been changed from "parallel" to "mechanism".
 *
 * The toggle still works — users can set "parallel" or "prose" to roll back.
 * This test specifically validates the DEFAULT value is "mechanism".
 *
 * Traces: T042, FR-008
 * Test runner: node:test (ESM, Article XIII)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

import {
  getRoundtableConfig,
  ROUNDTABLE_DEFAULTS,
  clearConfigCache,
} from '../../../src/core/config/config-service.js';
import { DEFAULT_PROJECT_CONFIG } from '../../../src/core/config/config-defaults.js';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpProject() {
  const dir = mkdtempSync(join(tmpdir(), 'isdlc-cutover-'));
  mkdirSync(join(dir, '.isdlc'), { recursive: true });
  return dir;
}

function writeConfig(dir, config) {
  writeFileSync(join(dir, '.isdlc', 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// CO-01..CO-06: Default is "mechanism" after T042 cutover
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T042 — Default migration_mode is "mechanism"', () => {
  let tmpDir;

  beforeEach(() => {
    clearConfigCache();
    tmpDir = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CO-01: ROUNDTABLE_DEFAULTS.migration_mode is "mechanism"', () => {
    assert.strictEqual(ROUNDTABLE_DEFAULTS.migration_mode, 'mechanism');
  });

  it('CO-02: DEFAULT_PROJECT_CONFIG.roundtable.migration_mode is "mechanism"', () => {
    assert.strictEqual(DEFAULT_PROJECT_CONFIG.roundtable.migration_mode, 'mechanism');
  });

  it('CO-03: getRoundtableConfig() returns "mechanism" when no config file exists', () => {
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('CO-04: getRoundtableConfig() returns "mechanism" when roundtable section is empty', () => {
    writeConfig(tmpDir, { roundtable: {} });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('CO-05: toggle still allows "parallel" for rollback', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'parallel' } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'parallel');
  });

  it('CO-06: toggle still allows "prose" for full disable', () => {
    writeConfig(tmpDir, { roundtable: { migration_mode: 'prose' } });
    const result = getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'prose');
  });
});

// ---------------------------------------------------------------------------
// CO-10..CO-12: CJS bridge parity for cutover
// ---------------------------------------------------------------------------

describe('REQ-GH-253 T042 — CJS bridge default is "mechanism"', () => {
  let tmpDir;
  let cjsBridge;

  beforeEach(() => {
    tmpDir = createTmpProject();
    const configCjsPath = require.resolve('../../../src/core/bridge/config.cjs');
    delete require.cache[configCjsPath];
    cjsBridge = require('../../../src/core/bridge/config.cjs');
    cjsBridge.clearConfigCache();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('CO-10: CJS ROUNDTABLE_DEFAULTS.migration_mode is "mechanism"', () => {
    assert.strictEqual(cjsBridge.ROUNDTABLE_DEFAULTS.migration_mode, 'mechanism');
  });

  it('CO-11: CJS getRoundtableConfig() returns "mechanism" for empty config', () => {
    const result = cjsBridge.getRoundtableConfig(tmpDir);
    assert.strictEqual(result.migration_mode, 'mechanism');
  });

  it('CO-12: CJS and ESM defaults match', () => {
    clearConfigCache();
    const esmResult = getRoundtableConfig(tmpDir);

    const configCjsPath = require.resolve('../../../src/core/bridge/config.cjs');
    delete require.cache[configCjsPath];
    const freshCjs = require('../../../src/core/bridge/config.cjs');
    freshCjs.clearConfigCache();
    const cjsResult = freshCjs.getRoundtableConfig(tmpDir);

    assert.strictEqual(esmResult.migration_mode, 'mechanism');
    assert.strictEqual(cjsResult.migration_mode, 'mechanism');
    assert.strictEqual(esmResult.migration_mode, cjsResult.migration_mode);
  });
});
