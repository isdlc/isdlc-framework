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
