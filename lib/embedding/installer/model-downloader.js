/**
 * CodeBERT Model Downloader
 *
 * Downloads the CodeBERT ONNX model and tokenizer files from HuggingFace
 * to the project's .isdlc/models/ directory. Skips if already present.
 * Reports progress via callback. Fail-open on network errors (Article X).
 *
 * BUG-0056 / FR-002: Replaced stub with real HTTP fetch implementation.
 *
 * REQ-0045 / FR-015 / AC-015-02
 * @module lib/embedding/installer/model-downloader
 */

import { stat, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MODEL_DIR = '.isdlc/models/codebert-base';
const MODEL_FILENAME = 'model.onnx';

// BUG-0056 / FR-002: HuggingFace URLs for CodeBERT ONNX export
const HUGGINGFACE_BASE = 'https://huggingface.co/microsoft/codebert-base/resolve/main/onnx';
const MODEL_FILES = [
  { name: MODEL_FILENAME, url: `${HUGGINGFACE_BASE}/model.onnx` },
  { name: 'vocab.json', url: 'https://huggingface.co/microsoft/codebert-base/resolve/main/vocab.json' },
  { name: 'tokenizer.json', url: 'https://huggingface.co/microsoft/codebert-base/resolve/main/tokenizer.json' },
];

// Model version tracking
const MODEL_VERSION = '1.0.0';
const VERSION_FILENAME = 'model-version.json';

/**
 * @typedef {Object} DownloadOptions
 * @property {string} [modelDir] - Override model directory path
 * @property {function} [onProgress] - Progress callback: (percent, detail) => void
 * @property {function} [_fetchFn] - Override fetch for testing (injectable dependency)
 */

/**
 * @typedef {Object} DownloadResult
 * @property {boolean} ready - Whether model is ready for use
 * @property {string} modelPath - Absolute path to model file
 * @property {string} [reason] - Reason if not ready
 * @property {boolean} alreadyExists - Whether model was already present
 */

/**
 * Download the CodeBERT ONNX model and tokenizer files if not already present.
 *
 * BUG-0056 / FR-002: Real implementation fetching from HuggingFace.
 * AC-002-01: Downloads model.onnx from HuggingFace
 * AC-002-02: Skips download if model already exists
 * AC-002-03: Returns ready:false on network errors (fail-open)
 * AC-002-04: Downloads vocab.json and tokenizer.json alongside model
 * AC-002-05: Reports progress via onProgress callback
 *
 * @param {string} projectRoot - Project root directory
 * @param {DownloadOptions} [options]
 * @returns {Promise<DownloadResult>}
 */
export async function downloadModel(projectRoot, options = {}) {
  // AC-002-03: Handle null/invalid projectRoot gracefully
  if (!projectRoot || typeof projectRoot !== 'string') {
    return {
      ready: false,
      modelPath: '',
      alreadyExists: false,
      reason: 'Invalid project root',
    };
  }

  const { modelDir, onProgress, _fetchFn } = options;
  const dir = modelDir || join(projectRoot, DEFAULT_MODEL_DIR);
  const modelPath = join(dir, MODEL_FILENAME);

  // AC-002-02: Check if model already exists
  if (await fileExists(modelPath)) {
    if (onProgress) onProgress(100, 'Model already present');
    return {
      ready: true,
      modelPath,
      alreadyExists: true,
    };
  }

  // Ensure directory exists
  await mkdir(dir, { recursive: true });

  // AC-002-01, AC-002-04: Download all model files from HuggingFace
  const fetchFn = _fetchFn || globalFetch();
  const totalFiles = MODEL_FILES.length;
  let filesDownloaded = 0;

  try {
    for (const file of MODEL_FILES) {
      const filePath = join(dir, file.name);

      // Skip if this specific file already exists
      if (await fileExists(filePath)) {
        filesDownloaded++;
        if (onProgress) {
          const pct = Math.round((filesDownloaded / totalFiles) * 100);
          onProgress(pct, `${file.name} already present`);
        }
        continue;
      }

      if (onProgress) {
        const pct = Math.round((filesDownloaded / totalFiles) * 100);
        onProgress(pct, `Downloading ${file.name}...`);
      }

      // Fetch the file
      const response = await fetchFn(file.url);
      if (!response.ok) {
        // AC-002-03: Fail-open on HTTP errors
        return {
          ready: false,
          modelPath,
          alreadyExists: false,
          reason: `Download failed for ${file.name}: HTTP ${response.status}`,
        };
      }

      // Stream-read the response body
      const data = await readResponseBody(response, (bytesRead, totalBytes) => {
        if (onProgress && totalBytes > 0) {
          const filePct = Math.round((bytesRead / totalBytes) * 100);
          const overallPct = Math.round(((filesDownloaded + filePct / 100) / totalFiles) * 100);
          onProgress(overallPct, `Downloading ${file.name}: ${filePct}%`);
        }
      });

      // Write to disk
      await writeFile(filePath, data);
      filesDownloaded++;
    }

    // Write model version file for updater version checks (FR-006)
    await writeFile(
      join(dir, VERSION_FILENAME),
      JSON.stringify({ version: MODEL_VERSION, downloadedAt: new Date().toISOString() }, null, 2)
    );

    if (onProgress) onProgress(100, 'Download complete');

    return {
      ready: true,
      modelPath,
      alreadyExists: false,
    };
  } catch (err) {
    // AC-002-03: Fail-open on network errors
    return {
      ready: false,
      modelPath,
      alreadyExists: false,
      reason: `Download failed: ${err.message}`,
    };
  }
}

/**
 * Get the expected model file path.
 *
 * @param {string} projectRoot
 * @param {string} [modelDirOverride]
 * @returns {string} Absolute path to model file
 */
export function getModelPath(projectRoot, modelDirOverride) {
  const dir = modelDirOverride || join(projectRoot, DEFAULT_MODEL_DIR);
  return join(dir, MODEL_FILENAME);
}

/**
 * Get the current expected model version.
 * Used by the updater to detect version changes (FR-006).
 * @returns {string}
 */
export function getExpectedModelVersion() {
  return MODEL_VERSION;
}

/**
 * Read the installed model version from the version file.
 * Returns null if the version file does not exist.
 *
 * @param {string} projectRoot
 * @param {string} [modelDirOverride]
 * @returns {Promise<string|null>}
 */
export async function getInstalledModelVersion(projectRoot, modelDirOverride) {
  const dir = modelDirOverride || join(projectRoot, DEFAULT_MODEL_DIR);
  const versionPath = join(dir, VERSION_FILENAME);
  try {
    const stats = await stat(versionPath);
    if (!stats.isFile()) return null;
    const { readFile: rf } = await import('node:fs/promises');
    const raw = await rf(versionPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed.version || null;
  } catch {
    return null;
  }
}

/**
 * Read the full response body as a Uint8Array.
 * Reports progress via callback if response has Content-Length.
 *
 * @param {Response} response
 * @param {function} [onChunk] - (bytesRead, totalBytes) => void
 * @returns {Promise<Uint8Array>}
 */
async function readResponseBody(response, onChunk) {
  const contentLength = parseInt(response.headers?.get?.('content-length') || '0', 10);
  const reader = response.body?.getReader?.();

  if (!reader) {
    // Fallback for environments without streaming
    const buffer = await response.arrayBuffer?.();
    return new Uint8Array(buffer || []);
  }

  const chunks = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytesRead += value.length;
    if (onChunk) onChunk(bytesRead, contentLength);
  }

  // Concatenate chunks
  const result = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Check if a file exists.
 * @param {string} filePath
 * @returns {Promise<boolean>}
 */
async function fileExists(filePath) {
  try {
    const stats = await stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Get the global fetch function (Node.js 18+).
 * @returns {function}
 */
function globalFetch() {
  if (typeof fetch === 'function') return fetch;
  throw new Error('fetch is not available. Node.js 18+ required.');
}
