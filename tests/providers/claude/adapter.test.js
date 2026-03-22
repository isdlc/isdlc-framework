/**
 * Tests for src/providers/claude/ adapter boundary
 * REQ-0087: Create Claude adapter boundary
 *
 * Tests the Claude adapter entry point, hook registration, and projection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  getClaudeConfig,
  getHookRegistration,
  getProjectionPaths
} from '../../../src/providers/claude/index.js';

describe('getClaudeConfig (REQ-0087)', () => {
  it('returns an object with required fields', () => {
    const config = getClaudeConfig();
    assert.strictEqual(typeof config, 'object');
    assert.ok('provider' in config);
    assert.ok('frameworkDir' in config);
    assert.ok('settingsTemplate' in config);
  });

  it('identifies provider as claude', () => {
    const config = getClaudeConfig();
    assert.strictEqual(config.provider, 'claude');
  });

  it('specifies .claude as the framework directory', () => {
    const config = getClaudeConfig();
    assert.strictEqual(config.frameworkDir, '.claude');
  });
});

describe('getHookRegistration (REQ-0087)', () => {
  it('returns an array of hook registrations', () => {
    const hooks = getHookRegistration();
    assert.ok(Array.isArray(hooks));
    assert.ok(hooks.length > 0);
  });

  it('each hook has name, event, and command fields', () => {
    const hooks = getHookRegistration();
    for (const hook of hooks) {
      assert.ok(typeof hook.name === 'string', `hook missing name: ${JSON.stringify(hook)}`);
      assert.ok(typeof hook.event === 'string', `hook missing event: ${JSON.stringify(hook)}`);
      assert.ok(typeof hook.command === 'string', `hook missing command: ${JSON.stringify(hook)}`);
    }
  });

  it('includes the gate-blocker hook', () => {
    const hooks = getHookRegistration();
    const gateBloker = hooks.find(h => h.name === 'gate-blocker');
    assert.ok(gateBloker, 'gate-blocker hook should be registered');
    assert.strictEqual(gateBloker.event, 'PreToolUse');
  });
});

describe('getProjectionPaths (REQ-0087)', () => {
  it('returns an object with required path keys', () => {
    const paths = getProjectionPaths();
    assert.strictEqual(typeof paths, 'object');
    assert.ok('claudeMd' in paths);
    assert.ok('settingsJson' in paths);
    assert.ok('commandsDir' in paths);
    assert.ok('hooksDir' in paths);
  });

  it('all paths are relative strings', () => {
    const paths = getProjectionPaths();
    for (const [key, value] of Object.entries(paths)) {
      assert.strictEqual(typeof value, 'string', `${key} should be a string`);
      assert.ok(!value.startsWith('/'), `${key} should be a relative path`);
    }
  });
});
