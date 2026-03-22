/**
 * Tests for src/core/providers/modes.js
 * REQ-0127: Extract provider routing from provider-utils.cjs
 *
 * Tests mode management: get, set, available modes.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getActiveMode,
  setActiveMode,
  getAvailableModes
} from '../../../src/core/providers/modes.js';

describe('getActiveMode', () => {
  it('returns active_mode from config', () => {
    const config = { active_mode: 'budget' };
    assert.strictEqual(getActiveMode(config), 'budget');
  });

  it('defaults to hybrid when not set', () => {
    assert.strictEqual(getActiveMode({}), 'hybrid');
    assert.strictEqual(getActiveMode(null), 'hybrid');
  });
});

describe('setActiveMode', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `isdlc-test-modes-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('updates active_mode in providers.yaml', () => {
    const configPath = join(tempDir, '.isdlc', 'providers.yaml');
    writeFileSync(configPath, 'active_mode: quality\nproviders:\n  anthropic:\n    enabled: true');

    const result = setActiveMode('budget', tempDir);
    assert.strictEqual(result, true);

    const content = readFileSync(configPath, 'utf8');
    assert.ok(content.includes('"budget"'));
  });

  it('returns false when no providers.yaml exists', () => {
    const result = setActiveMode('local', tempDir);
    assert.strictEqual(result, false);
  });
});

describe('getAvailableModes', () => {
  it('returns modes from config when present', () => {
    const config = { modes: { custom: { description: 'Custom mode' } } };
    const modes = getAvailableModes(config);
    assert.ok(modes.custom);
    assert.strictEqual(modes.custom.description, 'Custom mode');
  });

  it('returns default modes when config has no modes', () => {
    const modes = getAvailableModes({});
    assert.ok(modes.budget);
    assert.ok(modes.quality);
    assert.ok(modes.local);
    assert.ok(modes.hybrid);
  });

  it('returns default modes for null config', () => {
    const modes = getAvailableModes(null);
    assert.ok(modes.budget);
    assert.ok(modes.quality);
  });
});
