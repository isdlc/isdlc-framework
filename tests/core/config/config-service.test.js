/**
 * Tests for src/core/config/ — Config service functions
 * REQ-0085: Decompose remaining common.cjs functions
 *
 * Verifies that core config exports session/process config helpers.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('src/core/config service extensions', () => {
  it('exports loadCoreProfile function', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(typeof mod.loadCoreProfile, 'function');
  });

  it('loadCoreProfile returns null for nonexistent profile', async () => {
    const mod = await import('../../../src/core/config/index.js');
    const result = mod.loadCoreProfile('nonexistent-profile');
    assert.strictEqual(result, null);
  });

  it('loadCoreProfile loads standard profile', async () => {
    const mod = await import('../../../src/core/config/index.js');
    const result = mod.loadCoreProfile('standard');
    assert.ok(result !== null, 'Standard profile should exist');
    assert.strictEqual(typeof result, 'object');
  });

  it('exports loadCoreSchema function', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(typeof mod.loadCoreSchema, 'function');
  });

  it('exports normalizePhaseKey function', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(typeof mod.normalizePhaseKey, 'function');
  });

  it('normalizePhaseKey maps legacy aliases', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(mod.normalizePhaseKey('13-test-deploy'), '12-test-deploy');
    assert.strictEqual(mod.normalizePhaseKey('14-production'), '13-production');
  });

  it('normalizePhaseKey passes through canonical keys', async () => {
    const mod = await import('../../../src/core/config/index.js');
    assert.strictEqual(mod.normalizePhaseKey('06-implementation'), '06-implementation');
  });
});

/**
 * REQ-GH-239 — T003 slice
 *
 * hasUserEmbeddingsConfig(projectRoot) — new function that reads the RAW
 * .isdlc/config.json and answers "did the user explicitly write an
 * embeddings section?" — bypassing the merge layer in getConfig() which
 * always injects default embeddings from config-defaults.js.
 *
 * Traces: FR-006 (Opt-in via config presence), ERR-F0009-001 (fail-open parse)
 *
 * Phase 05 scaffolds — `test.skip()` placeholders with full GWT docstrings.
 * Phase 06 implements the function and the test bodies.
 */
describe('REQ-GH-239 hasUserEmbeddingsConfig — raw vs merged distinction', () => {
  /** @type {string[]} created temp roots for cleanup */
  const tempRoots = [];

  /**
   * Create an isolated temp project root with an optional .isdlc/config.json.
   * @param {string|null} configContent - raw string to write, or null to skip the file
   * @param {boolean} createIsdlcDir - whether to create the .isdlc directory
   * @returns {string} absolute path to the temp project root
   */
  function makeTempRoot(configContent, createIsdlcDir = true) {
    const root = mkdtempSync(join(tmpdir(), 'req-gh-239-huec-'));
    tempRoots.push(root);
    if (createIsdlcDir) {
      mkdirSync(join(root, '.isdlc'), { recursive: true });
    }
    if (configContent !== null) {
      writeFileSync(join(root, '.isdlc', 'config.json'), configContent, 'utf8');
    }
    return root;
  }

  after(() => {
    for (const root of tempRoots) {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* ignore cleanup failures */
      }
    }
  });

  it(
    '[P0] REQ-GH-239 FR-006 HUEC-01: Given .isdlc/config.json has `embeddings: { model: "jina-code" }`, When hasUserEmbeddingsConfig(projectRoot) is called, Then it returns true (raw presence detected)',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      const root = makeTempRoot(JSON.stringify({ embeddings: { model: 'jina-code' } }));
      assert.strictEqual(mod.hasUserEmbeddingsConfig(root), true);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006 HUEC-02: Given .isdlc/config.json has NO `embeddings` key, When hasUserEmbeddingsConfig is called, Then it returns false (even though merged view would inject defaults)',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      const root = makeTempRoot(JSON.stringify({ atdd: { enabled: true }, search: {} }));
      assert.strictEqual(mod.hasUserEmbeddingsConfig(root), false);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006 HUEC-03: Given .isdlc/config.json has `embeddings: null`, When hasUserEmbeddingsConfig is called, Then it returns false (explicit null == not configured)',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      const root = makeTempRoot(JSON.stringify({ embeddings: null }));
      assert.strictEqual(mod.hasUserEmbeddingsConfig(root), false);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006 HUEC-04: Given .isdlc/config.json does not exist at all, When hasUserEmbeddingsConfig is called, Then it returns false without throwing',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      // no .isdlc dir, no config.json
      const root = makeTempRoot(null, false);
      let threw = false;
      let result;
      try {
        result = mod.hasUserEmbeddingsConfig(root);
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'must not throw ENOENT');
      assert.strictEqual(result, false);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006 + ERR-F0009-001 HUEC-05: Given .isdlc/config.json contains malformed JSON, When hasUserEmbeddingsConfig is called, Then it returns false (fail-open) and the JSON parse error does NOT propagate',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      const root = makeTempRoot('{ not valid json,');
      let threw = false;
      let result;
      try {
        result = mod.hasUserEmbeddingsConfig(root);
      } catch {
        threw = true;
      }
      assert.strictEqual(threw, false, 'must not propagate parse error');
      assert.strictEqual(result, false);
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006 HUEC-06: Given merged readProjectConfig() returns a view with embeddings defaults, When the same projectRoot has no raw embeddings key, Then hasUserEmbeddingsConfig returns false while the merged view is truthy — proving the raw vs merged distinction',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      const root = makeTempRoot(JSON.stringify({ search: {} }));

      const merged = mod.readProjectConfig(root);
      // Regression proof: the merge layer DOES inject an embeddings section from defaults
      assert.ok(
        merged.embeddings != null && typeof merged.embeddings === 'object',
        'readProjectConfig must inject an embeddings section from defaults'
      );
      // But hasUserEmbeddingsConfig reads the raw file and must return false
      assert.strictEqual(
        mod.hasUserEmbeddingsConfig(root),
        false,
        'raw check must NOT see the merged-in defaults'
      );
    }
  );

  it(
    '[P1] REQ-GH-239 FR-006 HUEC-07: Given hasUserEmbeddingsConfig is called repeatedly, When the raw config is edited between calls, Then the second call reflects the new state (no stale cache)',
    async () => {
      const mod = await import('../../../src/core/config/config-service.js');
      // Start without an embeddings key
      const root = makeTempRoot(JSON.stringify({ search: {} }));
      assert.strictEqual(mod.hasUserEmbeddingsConfig(root), false, 'initial state: false');

      // Write a new config with embeddings present
      writeFileSync(
        join(root, '.isdlc', 'config.json'),
        JSON.stringify({ embeddings: { model: 'jina-code' } }),
        'utf8'
      );
      assert.strictEqual(
        mod.hasUserEmbeddingsConfig(root),
        true,
        'post-edit state: true (no stale cache)'
      );
    }
  );
});

