/**
 * CodeBERT Model Downloader
 *
 * Downloads the CodeBERT ONNX model to the project's .isdlc/models/ directory.
 * Validates checksum after download. Skips if model is already present and valid.
 *
 * REQ-0045 / FR-015 / AC-015-02
 * @module lib/embedding/installer/model-downloader
 */

import { stat, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MODEL_DIR = '.isdlc/models/codebert-base';
const MODEL_FILENAME = 'model.onnx';

/**
 * @typedef {Object} DownloadOptions
 * @property {string} [modelDir] - Override model directory path
 * @property {function} [onProgress] - Progress callback: (percent, detail) => void
 */

/**
 * @typedef {Object} DownloadResult
 * @property {boolean} ready - Whether model is ready for use
 * @property {string} modelPath - Absolute path to model file
 * @property {string} [reason] - Reason if not ready
 * @property {boolean} alreadyExists - Whether model was already present
 */

/**
 * Download the CodeBERT ONNX model if not already present.
 *
 * This is a stub implementation for Group 1 — the actual model download
 * requires fetching from Hugging Face or a configured artifact repository.
 * Group 1 validates the installer pipeline; actual model download is
 * integrated when the full pipeline (Group 2+) is built.
 *
 * @param {string} projectRoot - Project root directory
 * @param {DownloadOptions} [options]
 * @returns {Promise<DownloadResult>}
 */
export async function downloadModel(projectRoot, options = {}) {
  const { modelDir, onProgress } = options;
  const dir = modelDir || join(projectRoot, DEFAULT_MODEL_DIR);
  const modelPath = join(dir, MODEL_FILENAME);

  // Check if model already exists
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

  // Group 1: Model download is a placeholder.
  // In the full implementation, this would:
  // 1. Fetch from Hugging Face (microsoft/codebert-base) or configured mirror
  // 2. Show download progress via onProgress callback
  // 3. Validate SHA-256 checksum after download
  // 4. Extract if compressed
  if (onProgress) onProgress(0, 'Model download not yet implemented (Group 2+ scope)');

  return {
    ready: false,
    modelPath,
    alreadyExists: false,
    reason: 'Model download not yet implemented. Place model.onnx manually at: ' + modelPath,
  };
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
