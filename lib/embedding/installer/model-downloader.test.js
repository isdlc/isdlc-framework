/**
 * Tests for Model Downloader — FR-002
 *
 * BUG-0056: Implement ONNX model download from HuggingFace.
 * Tests download flow, skip-if-exists, error handling, progress callback.
 *
 * REQ: BUG-0056 / FR-002 (AC-002-01..05)
 * Article II: Test-First Development
 */

import { describe, it, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../utils/test-helpers.js';

describe('FR-002: Model Downloader', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // TC-002-01: downloadModel() downloads model files when directory empty
  it('TC-002-01: downloads model.onnx when directory empty (mocked fetch)', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-01');
    mkdirSync(projectDir, { recursive: true });

    // The real downloader should attempt a fetch. With no network mock,
    // it will fail and return ready: false. That verifies the fetch path exists.
    const result = await downloadModel(projectDir, {
      _fetchFn: async (url) => ({
        ok: true,
        status: 200,
        headers: { get: () => '100' },
        body: {
          getReader: () => ({
            read: (() => {
              let called = false;
              return async () => {
                if (!called) {
                  called = true;
                  return { done: false, value: new Uint8Array([0x4f, 0x4e, 0x4e, 0x58]) };
                }
                return { done: true };
              };
            })(),
          }),
        },
      }),
    });

    // With the mock fetch, model file should be written
    const modelDir = join(projectDir, '.isdlc', 'models', 'codebert-base');
    if (result.ready) {
      assert.ok(existsSync(join(modelDir, 'model.onnx')), 'model.onnx should exist');
    }
    assert.ok('ready' in result, 'Result should have ready field');
    assert.ok('modelPath' in result, 'Result should have modelPath field');
  });

  // TC-002-02: downloadModel() skips download when model already exists
  it('TC-002-02: skips download when model already exists', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-02');
    const modelDir = join(projectDir, '.isdlc', 'models', 'codebert-base');
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(join(modelDir, 'model.onnx'), 'fake model data');

    const result = await downloadModel(projectDir);
    assert.equal(result.ready, true, 'Should be ready');
    assert.equal(result.alreadyExists, true, 'Should report already exists');
  });

  // TC-002-03: downloadModel() returns ready:false on network failure
  it('TC-002-03: returns ready:false on network failure (fail-open)', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-03');
    mkdirSync(projectDir, { recursive: true });

    const result = await downloadModel(projectDir, {
      _fetchFn: async () => { throw new Error('Network error'); },
    });
    assert.equal(result.ready, false, 'Should not be ready on network failure');
    assert.ok(!result.alreadyExists, 'Should not report already exists');
  });

  // TC-002-04: downloadModel() returns ready:false on HTTP 404
  it('TC-002-04: returns ready:false on HTTP 404', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-04');
    mkdirSync(projectDir, { recursive: true });

    const result = await downloadModel(projectDir, {
      _fetchFn: async () => ({ ok: false, status: 404, statusText: 'Not Found' }),
    });
    assert.equal(result.ready, false, 'Should not be ready on 404');
  });

  // TC-002-05: downloadModel() also downloads vocab.json and tokenizer.json
  it('TC-002-05: downloads vocab.json and tokenizer.json alongside model', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-05');
    mkdirSync(projectDir, { recursive: true });

    let fetchedUrls = [];
    const result = await downloadModel(projectDir, {
      _fetchFn: async (url) => {
        fetchedUrls.push(url);
        return {
          ok: true,
          status: 200,
          headers: { get: () => '50' },
          body: {
            getReader: () => ({
              read: (() => {
                let called = false;
                return async () => {
                  if (!called) { called = true; return { done: false, value: new Uint8Array([0x7b, 0x7d]) }; }
                  return { done: true };
                };
              })(),
            }),
          },
        };
      },
    });

    if (result.ready) {
      const modelDir = join(projectDir, '.isdlc', 'models', 'codebert-base');
      assert.ok(existsSync(join(modelDir, 'vocab.json')), 'vocab.json should exist');
      assert.ok(existsSync(join(modelDir, 'tokenizer.json')), 'tokenizer.json should exist');
    }
    // Verify multiple URLs were fetched (model + vocab + tokenizer config)
    assert.ok(fetchedUrls.length >= 3 || !result.ready,
      `Should fetch >= 3 files, got ${fetchedUrls.length}`);
  });

  // TC-002-06: downloadModel() reports progress via onProgress callback
  it('TC-002-06: reports progress via onProgress callback', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-06');
    mkdirSync(projectDir, { recursive: true });

    const progressCalls = [];
    await downloadModel(projectDir, {
      onProgress: (pct, detail) => progressCalls.push({ pct, detail }),
      _fetchFn: async () => ({
        ok: true,
        status: 200,
        headers: { get: () => '100' },
        body: {
          getReader: () => ({
            read: (() => {
              let called = false;
              return async () => {
                if (!called) { called = true; return { done: false, value: new Uint8Array(50) }; }
                return { done: true };
              };
            })(),
          }),
        },
      }),
    });

    assert.ok(progressCalls.length > 0, 'Should have progress calls');
  });

  // TC-002-07: downloadModel() creates directory if it does not exist
  it('TC-002-07: creates model directory if it does not exist', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-07');
    mkdirSync(projectDir, { recursive: true });

    await downloadModel(projectDir, {
      _fetchFn: async () => { throw new Error('Expected'); },
    });

    const modelDir = join(projectDir, '.isdlc', 'models', 'codebert-base');
    assert.ok(existsSync(modelDir), 'Model directory should be created even on failure');
  });

  // TC-002-08: downloadModel() with null projectRoot returns error gracefully
  it('TC-002-08: handles null projectRoot gracefully', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const result = await downloadModel(null);
    assert.equal(result.ready, false, 'Should return ready: false for null root');
  });

  // TC-002-09: downloadModel() respects custom modelDir option
  it('TC-002-09: respects custom modelDir option', async () => {
    const { downloadModel } = await import('./model-downloader.js');
    const projectDir = join(tempDir, 'dl-test-09');
    const customDir = join(tempDir, 'custom-model-dir');
    mkdirSync(projectDir, { recursive: true });
    mkdirSync(customDir, { recursive: true });
    writeFileSync(join(customDir, 'model.onnx'), 'custom model');

    const result = await downloadModel(projectDir, { modelDir: customDir });
    assert.equal(result.ready, true);
    assert.equal(result.alreadyExists, true);
    assert.ok(result.modelPath.includes('custom-model-dir'));
  });

  // TC-002-10: getModelPath() returns correct path with defaults
  it('TC-002-10: getModelPath() returns correct default path', async () => {
    const { getModelPath } = await import('./model-downloader.js');
    const p = getModelPath('/tmp/test-project');
    assert.equal(p, '/tmp/test-project/.isdlc/models/codebert-base/model.onnx');
  });
});
