/**
 * Tests for src/core/providers/config.js
 * REQ-0127: Extract provider routing from provider-utils.cjs
 *
 * Tests YAML parsing, config loading, defaults, and config detection.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseYaml,
  parseValue,
  resolveProvidersConfigPath,
  loadProvidersConfig,
  getMinimalDefaultConfig,
  hasProvidersConfig
} from '../../../src/core/providers/config.js';

describe('parseValue', () => {
  it('parses quoted strings', () => {
    assert.strictEqual(parseValue('"hello"'), 'hello');
    assert.strictEqual(parseValue("'world'"), 'world');
  });

  it('parses booleans', () => {
    assert.strictEqual(parseValue('true'), true);
    assert.strictEqual(parseValue('false'), false);
  });

  it('parses null', () => {
    assert.strictEqual(parseValue('null'), null);
    assert.strictEqual(parseValue('~'), null);
  });

  it('parses numbers', () => {
    assert.strictEqual(parseValue('42'), 42);
    assert.strictEqual(parseValue('3.14'), 3.14);
  });

  it('returns empty string for falsy input', () => {
    assert.strictEqual(parseValue(''), '');
    assert.strictEqual(parseValue(undefined), '');
  });

  it('parses inline arrays', () => {
    assert.deepStrictEqual(parseValue('[1, 2, 3]'), [1, 2, 3]);
  });

  it('returns plain string for unrecognized values', () => {
    assert.strictEqual(parseValue('some-string'), 'some-string');
  });
});

describe('parseYaml', () => {
  it('parses simple key-value pairs', () => {
    const yaml = 'name: test\nversion: 1';
    const result = parseYaml(yaml);
    assert.strictEqual(result.name, 'test');
    assert.strictEqual(result.version, 1);
  });

  it('parses nested objects', () => {
    const yaml = 'providers:\n  anthropic:\n    enabled: true\n    base_url: https://api.anthropic.com';
    const result = parseYaml(yaml);
    assert.strictEqual(result.providers.anthropic.enabled, true);
    assert.strictEqual(result.providers.anthropic.base_url, 'https://api.anthropic.com');
  });

  it('skips comments and empty lines', () => {
    const yaml = '# comment\nkey: value\n\n# another comment\nother: data';
    const result = parseYaml(yaml);
    assert.strictEqual(result.key, 'value');
    assert.strictEqual(result.other, 'data');
  });

  it('parses simple array items via currentArrayKey', () => {
    // Note: The minimal YAML parser uses currentArrayKey tracking.
    // Array items at nested indentation are stored inside the parent
    // object's last key. This matches the original provider-utils.cjs behavior.
    const yaml = 'items:\n  - alpha\n  - beta\n  - gamma';
    const result = parseYaml(yaml);
    // The parser stores arrays inside the nested object created for 'items:'
    assert.ok(result.items, 'items key should exist');
    assert.ok(Array.isArray(result.items.items), 'nested items array should exist');
    assert.deepStrictEqual(result.items.items, ['alpha', 'beta', 'gamma']);
  });
});

describe('getMinimalDefaultConfig', () => {
  it('returns a valid default config object', () => {
    const config = getMinimalDefaultConfig();
    assert.strictEqual(config.defaults.provider, 'anthropic');
    assert.strictEqual(config.defaults.model, 'sonnet');
    assert.ok(config.providers.anthropic.enabled);
    assert.ok(Array.isArray(config.providers.anthropic.models));
    assert.strictEqual(config.active_mode, 'quality');
  });

  it('includes constraint settings', () => {
    const config = getMinimalDefaultConfig();
    assert.strictEqual(typeof config.constraints.max_retries_per_provider, 'number');
    assert.strictEqual(typeof config.constraints.health_check_timeout_ms, 'number');
  });
});

describe('resolveProvidersConfigPath', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `isdlc-test-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns project config path when providers.yaml exists in .isdlc/', () => {
    const configPath = join(tempDir, '.isdlc', 'providers.yaml');
    writeFileSync(configPath, 'test: true');
    const result = resolveProvidersConfigPath(tempDir);
    assert.strictEqual(result, configPath);
  });

  it('returns null when no config file exists', () => {
    const result = resolveProvidersConfigPath(tempDir);
    assert.strictEqual(result, null);
  });
});

describe('loadProvidersConfig', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `isdlc-test-load-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads and parses providers.yaml when it exists', () => {
    const yaml = 'providers:\n  anthropic:\n    enabled: true\ndefaults:\n  provider: anthropic';
    writeFileSync(join(tempDir, '.isdlc', 'providers.yaml'), yaml);
    const config = loadProvidersConfig(tempDir);
    assert.strictEqual(config.providers.anthropic.enabled, true);
    assert.strictEqual(config.defaults.provider, 'anthropic');
  });

  it('returns minimal default config when no file exists', () => {
    const config = loadProvidersConfig(tempDir);
    assert.strictEqual(config.defaults.provider, 'anthropic');
    assert.ok(config.providers.anthropic);
  });
});

describe('hasProvidersConfig', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `isdlc-test-has-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns true when providers.yaml exists', () => {
    writeFileSync(join(tempDir, '.isdlc', 'providers.yaml'), 'test: true');
    assert.strictEqual(hasProvidersConfig(tempDir), true);
  });

  it('returns false when providers.yaml does not exist', () => {
    assert.strictEqual(hasProvidersConfig(tempDir), false);
  });
});
