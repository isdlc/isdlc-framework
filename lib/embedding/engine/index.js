/**
 * Embedding Engine — generate vector embeddings from text chunks.
 *
 * Supports pluggable model backends. Group 1 ships with CodeBERT (local ONNX).
 * Cloud providers (Voyage, OpenAI) are Group 2+ scope.
 *
 * REQ-0045 / FR-001, FR-005 / M2 Engine
 * @module lib/embedding/engine
 */

import { createCodeBERTAdapter, CODEBERT_DIMENSIONS } from './codebert-adapter.js';

/**
 * @typedef {Object} ModelConfig
 * @property {'codebert'|'voyage-code-3'|'openai'} provider
 * @property {string} [modelId]
 * @property {string} [apiKey]
 * @property {string} [endpoint]
 * @property {string} [modelPath]
 */

/**
 * @typedef {Object} EmbeddingResult
 * @property {Float32Array[]} vectors - Array of embedding vectors
 * @property {number} dimensions - Vector dimensionality
 * @property {string} model - Model ID used
 * @property {number} totalTokens - Total tokens processed
 */

/**
 * @typedef {Object} EmbedOptions
 * @property {number} [batchSize=32] - Chunks per batch
 * @property {function} [onProgress] - Callback: (processed, total) => void
 * @property {AbortSignal} [signal] - Cancellation signal
 */

/**
 * Generate embeddings for an array of text chunks.
 *
 * @param {string[]} texts - Array of text chunks to embed
 * @param {ModelConfig} config - Model configuration
 * @param {EmbedOptions} [options]
 * @returns {Promise<EmbeddingResult>}
 * @throws {Error} If model provider is unsupported or unavailable
 */
export async function embed(texts, config, options = {}) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return {
      vectors: [],
      dimensions: config?.provider === 'codebert' ? CODEBERT_DIMENSIONS : 0,
      model: config?.provider || 'unknown',
      totalTokens: 0,
    };
  }

  if (!config || !config.provider) {
    throw new Error('config.provider is required');
  }

  const { batchSize = 32, onProgress, signal } = options;
  const adapter = await resolveAdapter(config);

  const allVectors = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += batchSize) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Embedding cancelled');
    }

    const batch = texts.slice(i, i + batchSize);
    const vectors = await adapter.embed(batch);
    allVectors.push(...vectors);

    // Rough token estimate: 1 token per 4 chars
    totalTokens += batch.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }
  }

  return {
    vectors: allVectors,
    dimensions: adapter.dimensions,
    model: config.modelId || config.provider,
    totalTokens,
  };
}

/**
 * Check if a model is available and functional.
 *
 * @param {ModelConfig} config - Model to validate
 * @returns {Promise<{healthy: boolean, dimensions: number, error?: string}>}
 */
export async function healthCheck(config) {
  if (!config || !config.provider) {
    return { healthy: false, dimensions: 0, error: 'config.provider is required' };
  }

  try {
    const adapter = await resolveAdapter(config);
    return adapter.healthCheck();
  } catch (err) {
    return { healthy: false, dimensions: 0, error: err.message };
  }
}

/**
 * Resolve the appropriate model adapter based on config.
 * @param {ModelConfig} config
 * @returns {Promise<Object>}
 */
async function resolveAdapter(config) {
  switch (config.provider) {
    case 'codebert': {
      const adapter = await createCodeBERTAdapter({
        modelPath: config.modelPath,
      });
      if (!adapter) {
        throw new Error(
          'CodeBERT adapter unavailable: onnxruntime-node is not installed. ' +
          'Run: npm install onnxruntime-node'
        );
      }
      return adapter;
    }
    case 'voyage-code-3':
    case 'openai':
      throw new Error(`Cloud provider '${config.provider}' is not yet implemented (Group 2+ scope)`);
    default:
      throw new Error(`Unsupported embedding provider: '${config.provider}'`);
  }
}

export { CODEBERT_DIMENSIONS };
