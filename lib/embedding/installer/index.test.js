/**
 * Tests for Semantic Search Installer (FR-015)
 *
 * REQ-0045 / FR-015 / Installer
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { setupSemanticSearch, getSemanticSearchConfig } from './semantic-search-setup.js';
import { downloadModel, getModelPath } from './model-downloader.js';

describe('FR-015: Semantic Search Installer', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── setupSemanticSearch() ─────────────────────────────────────────
  describe('setupSemanticSearch()', () => {
    it('returns a success result with components', async () => {
      const result = await setupSemanticSearch(tempDir);
      assert.equal(result.success, true);
      assert.ok(result.components);
      assert.ok(Array.isArray(result.warnings));
    });

    it('is idempotent — re-running produces same result', async () => {
      const result1 = await setupSemanticSearch(tempDir);
      const result2 = await setupSemanticSearch(tempDir);
      assert.equal(result1.success, result2.success);
      assert.deepEqual(
        Object.keys(result1.components),
        Object.keys(result2.components)
      );
    });

    it('reports components status', async () => {
      const result = await setupSemanticSearch(tempDir);
      const c = result.components;

      assert.equal(typeof c.treeSitter.installed, 'boolean');
      assert.equal(typeof c.onnxRuntime.installed, 'boolean');
      assert.equal(typeof c.faiss.installed, 'boolean');
      assert.equal(typeof c.docker.installed, 'boolean');
      assert.equal(typeof c.codebertModel.installed, 'boolean');
    });

    it('skips Docker check when skipDocker is true', async () => {
      const result = await setupSemanticSearch(tempDir, { skipDocker: true });
      assert.equal(result.components.docker.skipped, true);
    });

    it('skips model download when skipModel is true', async () => {
      const result = await setupSemanticSearch(tempDir, { skipModel: true });
      assert.equal(result.components.codebertModel.skipped, true);
    });

    it('fires onProgress callback', async () => {
      const progressCalls = [];
      await setupSemanticSearch(tempDir, {
        skipDocker: true,
        skipModel: true,
        onProgress: (component, status, detail) => {
          progressCalls.push({ component, status, detail });
        },
      });
      assert.ok(progressCalls.length > 0);
      assert.ok(progressCalls.some(p => p.component === 'tree-sitter'));
    });

    it('warns when tree-sitter not installed', async () => {
      const result = await setupSemanticSearch(tempDir);
      // tree-sitter is likely not installed in test environment
      if (!result.components.treeSitter.installed) {
        assert.ok(result.warnings.some(w => w.includes('tree-sitter')));
      }
    });

    it('warns when onnxruntime-node not installed (AC-015-07)', async () => {
      const result = await setupSemanticSearch(tempDir);
      if (!result.components.onnxRuntime.installed) {
        assert.ok(result.warnings.some(w => w.includes('onnxruntime-node')));
      }
    });

    it('accepts custom language list', async () => {
      const result = await setupSemanticSearch(tempDir, {
        languages: ['java', 'go'],
        skipDocker: true,
        skipModel: true,
      });
      assert.ok(result.success);
    });
  });

  // ── getSemanticSearchConfig() ─────────────────────────────────────
  describe('getSemanticSearchConfig()', () => {
    it('returns config object with semantic section', () => {
      const setupResult = {
        success: true,
        components: {
          treeSitter: { installed: false, skipped: true },
          grammars: { installed: false, skipped: true, languages: [] },
          onnxRuntime: { installed: false, skipped: true },
          codebertModel: { installed: false, skipped: true },
          faiss: { installed: false, skipped: true },
          docker: { installed: false, skipped: true },
        },
        warnings: [],
      };
      const config = getSemanticSearchConfig(setupResult);
      assert.ok(config.semantic);
      assert.equal(config.semantic.enabled, true);
      assert.ok(config.semantic.model);
      assert.ok(config.semantic.chunking);
    });

    it('reflects component availability in config', () => {
      const setupResult = {
        success: true,
        components: {
          treeSitter: { installed: true, skipped: false },
          grammars: { installed: true, skipped: false, languages: ['java'] },
          onnxRuntime: { installed: true, skipped: false },
          codebertModel: { installed: true, skipped: false },
          faiss: { installed: true, skipped: false },
          docker: { installed: true, skipped: false },
        },
        warnings: [],
      };
      const config = getSemanticSearchConfig(setupResult);
      assert.equal(config.semantic.components.treeSitter, true);
      assert.equal(config.semantic.components.onnxRuntime, true);
      assert.equal(config.semantic.components.faiss, true);
    });

    it('suggests cloud provider when ONNX not available', () => {
      const setupResult = {
        success: true,
        components: {
          treeSitter: { installed: false, skipped: true },
          grammars: { installed: false, skipped: true, languages: [] },
          onnxRuntime: { installed: false, skipped: true },
          codebertModel: { installed: false, skipped: true },
          faiss: { installed: false, skipped: true },
          docker: { installed: false, skipped: true },
        },
        warnings: [],
      };
      const config = getSemanticSearchConfig(setupResult);
      assert.equal(config.semantic.model.provider, 'none');
      assert.ok(config.semantic.model.fallbackNote);
    });

    it('handles null setupResult gracefully', () => {
      const config = getSemanticSearchConfig(null);
      assert.ok(config.semantic);
      assert.equal(config.semantic.enabled, true);
    });
  });

  // ── downloadModel() ───────────────────────────────────────────────
  describe('downloadModel()', () => {
    it('returns not-ready when model does not exist', async () => {
      const projectDir = join(tempDir, 'no-model');
      mkdirSync(projectDir, { recursive: true });

      const result = await downloadModel(projectDir);
      assert.equal(result.ready, false);
      assert.equal(result.alreadyExists, false);
      assert.ok(result.reason);
    });

    it('returns ready when model file exists', async () => {
      const projectDir = join(tempDir, 'has-model');
      const modelDir = join(projectDir, '.isdlc', 'models', 'codebert-base');
      mkdirSync(modelDir, { recursive: true });
      writeFileSync(join(modelDir, 'model.onnx'), 'fake model data');

      const result = await downloadModel(projectDir);
      assert.equal(result.ready, true);
      assert.equal(result.alreadyExists, true);
    });

    it('creates model directory when it does not exist', async () => {
      const projectDir = join(tempDir, 'create-dir');
      mkdirSync(projectDir, { recursive: true });

      await downloadModel(projectDir);
      const modelDir = join(projectDir, '.isdlc', 'models', 'codebert-base');
      assert.ok(existsSync(modelDir));
    });

    it('fires onProgress callback', async () => {
      const projectDir = join(tempDir, 'progress-test');
      mkdirSync(projectDir, { recursive: true });

      const calls = [];
      await downloadModel(projectDir, {
        onProgress: (pct, detail) => calls.push({ pct, detail }),
      });
      assert.ok(calls.length > 0);
    });
  });

  // ── getModelPath() ────────────────────────────────────────────────
  describe('getModelPath()', () => {
    it('returns default model path', () => {
      const p = getModelPath('/project');
      assert.ok(p.includes('.isdlc'));
      assert.ok(p.includes('model.onnx'));
    });

    it('respects custom model dir override', () => {
      const p = getModelPath('/project', '/custom/models');
      assert.ok(p.startsWith('/custom/models'));
      assert.ok(p.endsWith('model.onnx'));
    });
  });
});
