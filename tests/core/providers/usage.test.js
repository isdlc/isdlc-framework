/**
 * Tests for src/core/providers/usage.js
 * REQ-0127: Extract provider routing from provider-utils.cjs
 *
 * Tests usage tracking and statistics retrieval.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  trackUsage,
  getUsageStats
} from '../../../src/core/providers/usage.js';

describe('trackUsage', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `isdlc-test-usage-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does nothing when track_usage is false', () => {
    const config = { constraints: { track_usage: false } };
    trackUsage(config, {}, { provider: 'anthropic' }, tempDir);
    const logPath = join(tempDir, '.isdlc', 'usage-log.jsonl');
    assert.strictEqual(existsSync(logPath), false);
  });

  it('appends usage entry to log file', () => {
    const config = { constraints: { track_usage: true, usage_log_path: '.isdlc/usage-log.jsonl' } };
    const selection = { provider: 'anthropic', model: 'sonnet', source: 'global_default' };
    const state = { current_phase: '06-implementation' };
    trackUsage(config, state, selection, tempDir);

    const logPath = join(tempDir, '.isdlc', 'usage-log.jsonl');
    assert.ok(existsSync(logPath));
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.provider, 'anthropic');
    assert.strictEqual(entry.model, 'sonnet');
  });

  it('tracks multiple usage entries', () => {
    const config = { constraints: { track_usage: true, usage_log_path: '.isdlc/usage-log.jsonl' } };
    trackUsage(config, {}, { provider: 'anthropic', model: 'sonnet', source: 'a' }, tempDir);
    trackUsage(config, {}, { provider: 'ollama', model: 'qwen', source: 'b' }, tempDir);

    const logPath = join(tempDir, '.isdlc', 'usage-log.jsonl');
    const lines = readFileSync(logPath, 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 2);
  });
});

describe('getUsageStats', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = join(tmpdir(), `isdlc-test-stats-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(tempDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns zeroed stats when no log file exists', () => {
    const stats = getUsageStats(tempDir, '.isdlc/usage-log.jsonl', 7);
    assert.strictEqual(stats.total_calls, 0);
    assert.deepStrictEqual(stats.by_provider, {});
  });

  it('aggregates stats from log file', () => {
    const logPath = join(tempDir, '.isdlc', 'usage-log.jsonl');
    const now = new Date().toISOString();
    const entries = [
      { timestamp: now, provider: 'anthropic', model: 'sonnet', phase: '06-implementation', source: 'default', fallback_used: false },
      { timestamp: now, provider: 'anthropic', model: 'opus', phase: '08-code-review', source: 'quality', fallback_used: false },
      { timestamp: now, provider: 'ollama', model: 'qwen', phase: '06-implementation', source: 'local', fallback_used: true }
    ];
    writeFileSync(logPath, entries.map(e => JSON.stringify(e)).join('\n') + '\n');

    const stats = getUsageStats(tempDir, '.isdlc/usage-log.jsonl', 7);
    assert.strictEqual(stats.total_calls, 3);
    assert.strictEqual(stats.by_provider.anthropic, 2);
    assert.strictEqual(stats.by_provider.ollama, 1);
    assert.strictEqual(stats.fallback_count, 1);
  });
});
