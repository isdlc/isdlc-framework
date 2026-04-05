'use strict';

/**
 * Tests for src/core/bridge/config.cjs
 * REQ-GH-231 FR-003, AC-003-02
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function requireBridge() {
  delete require.cache[require.resolve('../bridge/config.cjs')];
  return require('../bridge/config.cjs');
}

function createTmpDir() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isdlc-cfg-bridge-'));
  fs.mkdirSync(path.join(tmp, '.isdlc'), { recursive: true });
  return tmp;
}

describe('config-bridge.cjs', () => {
  let bridge;

  beforeEach(() => {
    bridge = requireBridge();
    bridge.clearConfigCache();
  });

  it('TC-CB-01: exports all required functions', () => {
    assert.strictEqual(typeof bridge.loadFrameworkConfig, 'function');
    assert.strictEqual(typeof bridge.readProjectConfig, 'function');
    assert.strictEqual(typeof bridge.loadSchema, 'function');
    assert.strictEqual(typeof bridge.getConfigPath, 'function');
    assert.strictEqual(typeof bridge.clearConfigCache, 'function');
    // REQ-GH-216: getAtdd bridge export
    assert.strictEqual(typeof bridge.getAtdd, 'function');
  });

  it('TC-T001-09: getAtdd bridge returns partial-merged atdd config', () => {
    const tmp = createTmpDir();
    try {
      fs.writeFileSync(
        path.join(tmp, '.isdlc', 'config.json'),
        JSON.stringify({ atdd: { track_red_green: false } }),
        'utf8'
      );
      const atdd = bridge.getAtdd(tmp);
      assert.deepStrictEqual(atdd, {
        enabled: true,
        require_gwt: true,
        track_red_green: false,
        enforce_priority_order: true,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('REQ-GH-216: getAtdd fails open to all-true defaults on bad path', () => {
    const atdd = bridge.getAtdd('/nonexistent/path/xyz-absent');
    assert.deepStrictEqual(atdd, {
      enabled: true,
      require_gwt: true,
      track_red_green: true,
      enforce_priority_order: true,
    });
  });

  it('REQ-GH-216: getAtdd preserves explicit full overrides', () => {
    const tmp = createTmpDir();
    try {
      fs.writeFileSync(
        path.join(tmp, '.isdlc', 'config.json'),
        JSON.stringify({
          atdd: { enabled: false, require_gwt: false, track_red_green: false, enforce_priority_order: false },
        }),
        'utf8'
      );
      const atdd = bridge.getAtdd(tmp);
      assert.deepStrictEqual(atdd, {
        enabled: false,
        require_gwt: false,
        track_red_green: false,
        enforce_priority_order: false,
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('REQ-GH-216: ATDD_DEFAULTS export has all-true values and is frozen', () => {
    assert.strictEqual(typeof bridge.ATDD_DEFAULTS, 'object');
    assert.strictEqual(bridge.ATDD_DEFAULTS.enabled, true);
    assert.strictEqual(bridge.ATDD_DEFAULTS.require_gwt, true);
    assert.strictEqual(bridge.ATDD_DEFAULTS.track_red_green, true);
    assert.strictEqual(bridge.ATDD_DEFAULTS.enforce_priority_order, true);
    assert.ok(Object.isFrozen(bridge.ATDD_DEFAULTS));
  });

  it('TC-CB-02: loadFrameworkConfig returns same result as would ESM service', () => {
    const result = bridge.loadFrameworkConfig('workflows');
    assert.ok(result !== null, 'workflows.json should exist');
    assert.ok(result.workflows || result.version, 'should have workflows structure');
  });

  it('TC-CB-03: readProjectConfig returns defaults when no config file exists', () => {
    const tmp = createTmpDir();
    try {
      const config = bridge.readProjectConfig(tmp);
      assert.strictEqual(config.cache.budget_tokens, 100000);
      assert.strictEqual(config.ui.show_subtasks_in_ui, true);
      assert.strictEqual(config.provider.default, 'claude');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('TC-CB-04: synchronous execution — no promises returned', () => {
    const tmp = createTmpDir();
    try {
      const result = bridge.readProjectConfig(tmp);
      // If it were async, result would be a Promise
      assert.ok(!(result instanceof Promise), 'must be synchronous');
      assert.strictEqual(typeof result, 'object');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('TC-CB-05: fail-open — returns defaults on any internal error', () => {
    // Non-existent project root
    const config = bridge.readProjectConfig('/nonexistent/path/xyz');
    assert.strictEqual(typeof config, 'object');
    assert.ok(config.cache, 'should have cache section from defaults');
  });

  it('merges user overrides with defaults', () => {
    const tmp = createTmpDir();
    try {
      fs.writeFileSync(
        path.join(tmp, '.isdlc', 'config.json'),
        JSON.stringify({ cache: { budget_tokens: 999 } }),
        'utf8'
      );
      const config = bridge.readProjectConfig(tmp);
      assert.strictEqual(config.cache.budget_tokens, 999);
      assert.strictEqual(config.roundtable.verbosity, 'bulleted');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
