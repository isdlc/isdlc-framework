/**
 * Tests for knowledge namespace in config-service.js (ESM)
 * REQ-GH-264 FR-002, AC-002-01, AC-002-02, AC-002-03
 *
 * TC-KS-02: Config Service — Knowledge Namespace Read (10 tests)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  readProjectConfig,
  getKnowledgeConfig,
  clearConfigCache,
  KNOWLEDGE_DEFAULTS,
} from '../../../src/core/config/config-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), 'isdlc-ks-'));
}

function writeJson(dir, relativePath, data) {
  const full = join(dir, relativePath);
  const parent = join(full, '..');
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// readProjectConfig — knowledge namespace
// ---------------------------------------------------------------------------

describe('readProjectConfig — knowledge namespace (TC-KS-02)', () => {
  let tmpDir;

  beforeEach(() => {
    clearConfigCache();
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC-KS-02-01: [P0] returns knowledge defaults when no config file', () => {
    const config = readProjectConfig(tmpDir);
    assert.strictEqual(config.knowledge.url, null);
    assert.deepStrictEqual(config.knowledge.projects, []);
  });

  it('TC-KS-02-02: [P0] returns knowledge defaults when config has no knowledge section', () => {
    writeJson(tmpDir, '.isdlc/config.json', { cache: {} });
    const config = readProjectConfig(tmpDir);
    assert.strictEqual(config.knowledge.url, null);
    assert.deepStrictEqual(config.knowledge.projects, []);
  });

  it('TC-KS-02-03: [P0] merges user knowledge.url', () => {
    writeJson(tmpDir, '.isdlc/config.json', {
      knowledge: { url: 'https://ks.example.com' },
    });
    const config = readProjectConfig(tmpDir);
    assert.strictEqual(config.knowledge.url, 'https://ks.example.com');
    // projects should still default to []
    assert.deepStrictEqual(config.knowledge.projects, []);
  });

  it('TC-KS-02-04: [P0] merges user knowledge.projects', () => {
    writeJson(tmpDir, '.isdlc/config.json', {
      knowledge: { projects: ['proj-a', 'proj-b'] },
    });
    const config = readProjectConfig(tmpDir);
    assert.deepStrictEqual(config.knowledge.projects, ['proj-a', 'proj-b']);
    // url should still default to null
    assert.strictEqual(config.knowledge.url, null);
  });

  it('TC-KS-02-05: [P0] merges both url and projects', () => {
    writeJson(tmpDir, '.isdlc/config.json', {
      knowledge: { url: 'https://ks.example.com', projects: ['p1'] },
    });
    const config = readProjectConfig(tmpDir);
    assert.strictEqual(config.knowledge.url, 'https://ks.example.com');
    assert.deepStrictEqual(config.knowledge.projects, ['p1']);
  });

  it('TC-KS-02-06: [P0] handles knowledge: null gracefully', () => {
    writeJson(tmpDir, '.isdlc/config.json', { knowledge: null });
    const config = readProjectConfig(tmpDir);
    // deep merge treats null as override — knowledge section becomes null
    // This should not crash
    assert.ok(config !== null);
  });

  it('TC-KS-02-07: [P1] handles knowledge: "string" gracefully', () => {
    writeJson(tmpDir, '.isdlc/config.json', { knowledge: 'not-an-object' });
    const config = readProjectConfig(tmpDir);
    // deep merge replaces non-object
    assert.ok(config !== null);
    assert.strictEqual(config.knowledge, 'not-an-object');
  });
});

// ---------------------------------------------------------------------------
// getKnowledgeConfig
// ---------------------------------------------------------------------------

describe('getKnowledgeConfig (TC-KS-02 continued)', () => {
  let tmpDir;

  beforeEach(() => {
    clearConfigCache();
    tmpDir = createTmpDir();
    mkdirSync(join(tmpDir, '.isdlc'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('TC-KS-02-08: [P1] returns merged knowledge section', () => {
    writeJson(tmpDir, '.isdlc/config.json', {
      knowledge: { url: 'https://ks.example.com', projects: ['myproj'] },
    });
    const kc = getKnowledgeConfig(tmpDir);
    assert.strictEqual(kc.url, 'https://ks.example.com');
    assert.deepStrictEqual(kc.projects, ['myproj']);
  });

  it('TC-KS-02-09: [P1] returns defaults when no project root found', () => {
    const kc = getKnowledgeConfig('/nonexistent/path/xyz-definitely-not-there');
    assert.strictEqual(kc.url, null);
    assert.deepStrictEqual(kc.projects, []);
  });

  it('TC-KS-02-10: [P0] fail-open on malformed JSON', () => {
    writeFileSync(join(tmpDir, '.isdlc', 'config.json'), '{invalid json', 'utf8');
    const kc = getKnowledgeConfig(tmpDir);
    assert.strictEqual(kc.url, null);
    assert.deepStrictEqual(kc.projects, []);
  });

  it('exposes KNOWLEDGE_DEFAULTS as a frozen object', () => {
    assert.strictEqual(KNOWLEDGE_DEFAULTS.url, null);
    assert.deepStrictEqual([...KNOWLEDGE_DEFAULTS.projects], []);
    assert.ok(Object.isFrozen(KNOWLEDGE_DEFAULTS));
  });

  it('filters non-string values from projects array', () => {
    writeJson(tmpDir, '.isdlc/config.json', {
      knowledge: { url: 'https://ks.example.com', projects: ['valid', 123, null, 'also-valid'] },
    });
    const kc = getKnowledgeConfig(tmpDir);
    assert.deepStrictEqual(kc.projects, ['valid', 'also-valid']);
  });

  it('treats empty string url as not configured', () => {
    writeJson(tmpDir, '.isdlc/config.json', {
      knowledge: { url: '' },
    });
    const kc = getKnowledgeConfig(tmpDir);
    assert.strictEqual(kc.url, null);
  });
});
