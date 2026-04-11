/**
 * Embedding Engine — generate vector embeddings from text chunks.
 *
 * Supports pluggable model backends:
 * - Jina Code v2 (local ONNX via @huggingface/transformers, Group 1)
 * - Voyage-code-3 (cloud, Group 6)
 * - OpenAI text-embedding-3-small (cloud, Group 6)
 *
 * REQ-0045 / FR-001, FR-002, FR-005 / M2 Engine
 * @module lib/embedding/engine
 */

import { createJinaCodeAdapter, JINA_CODE_DIMENSIONS } from './jina-code-adapter.js';
import { createVoyageAdapter, VOYAGE_DIMENSIONS } from './voyage-adapter.js';
import { createOpenAIAdapter, OPENAI_DIMENSIONS } from './openai-adapter.js';

/** @type {string} Default embedding provider when none specified (AC-002-02) */
const DEFAULT_PROVIDER = 'jina-code';

/**
 * @typedef {Object} ModelConfig
 * @property {'jina-code'|'voyage-code-3'|'openai'} provider
 * @property {string} [modelId]
 * @property {string} [apiKey]
 * @property {string} [endpoint]
 * @property {string} [modelPath]
 * @property {number|'auto'} [parallelism] - Worker threads for local providers (FR-004)
 * @property {string} [device] - ONNX execution provider (FR-004)
 * @property {number} [batch_size] - Texts per inference call (FR-004)
 * @property {string} [dtype] - Model precision (FR-004)
 * @property {Object} [session_options] - ONNX Runtime session options (FR-004)
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
  const effectiveProvider = config?.provider || DEFAULT_PROVIDER;
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    return {
      vectors: [],
      dimensions: getDimensionsForProvider(effectiveProvider),
      model: effectiveProvider,
      totalTokens: 0,
    };
  }

  if (!config || !config.provider) {
    throw new Error('config.provider is required');
  }

  const { batchSize = 32, onProgress, signal } = options;

  // Fail-fast if already aborted before resolving the adapter.
  if (signal?.aborted) {
    throw new Error('Embedding cancelled');
  }

  const adapter = await resolveAdapter(config);

  // REQ-GH-239 FR-001/FR-002: single adapter.embed call with the FULL text array.
  // The adapter owns batching + concurrency internally. This removes the outer
  // serialization loop that was defeating worker-pool parallelism.
  const vectors = await adapter.embed(texts, { batchSize, onProgress, signal });

  // Token estimate computed in a single post-embed pass.
  const totalTokens = texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);

  return {
    vectors,
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
  // DI hook for tests (REQ-GH-239 FR-002 regression tests): callers may pass
  // config._adapterOverride as a pre-built adapter object and it is used as-is.
  // This bypasses the real adapter factories entirely.
  if (config._adapterOverride) {
    return config._adapterOverride;
  }
  switch (config.provider) {
    case 'jina-code': {
      // FR-004: Pass hardware acceleration config fields to the adapter
      const adapterConfig = { modelPath: config.modelPath };
      if (config.parallelism !== undefined) adapterConfig.parallelism = config.parallelism;
      if (config.device !== undefined) adapterConfig.device = config.device;
      if (config.batch_size !== undefined) adapterConfig.batch_size = config.batch_size;
      if (config.dtype !== undefined) adapterConfig.dtype = config.dtype;
      if (config.session_options !== undefined) adapterConfig.session_options = config.session_options;
      if (config.max_memory_gb !== undefined) adapterConfig.max_memory_gb = config.max_memory_gb;
      // Pass through DI hooks for testing
      if (config._pipelineFactory) adapterConfig._pipelineFactory = config._pipelineFactory;
      if (config._createWorkerPool) adapterConfig._createWorkerPool = config._createWorkerPool;
      if (config._platformEnv) adapterConfig._platformEnv = config._platformEnv;

      const adapter = await createJinaCodeAdapter(adapterConfig);
      if (!adapter) {
        throw new Error(
          'Jina Code adapter unavailable: @huggingface/transformers is not installed. ' +
          'Run: npm install @huggingface/transformers'
        );
      }
      return adapter;
    }
    case 'codebert': {
      throw new Error('codebert provider has been removed. Use jina-code instead.');
    }
    case 'voyage-code-3': {
      if (!config.apiKey) {
        throw new Error("Cloud provider 'voyage-code-3' requires config.apiKey");
      }
      return createVoyageAdapter({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.modelId || undefined,
      });
    }
    case 'openai': {
      if (!config.apiKey) {
        throw new Error("Cloud provider 'openai' requires config.apiKey");
      }
      return createOpenAIAdapter({
        apiKey: config.apiKey,
        endpoint: config.endpoint,
        model: config.modelId || undefined,
      });
    }
    default:
      throw new Error(`Unsupported embedding provider: '${config.provider}'`);
  }
}

/**
 * Get the expected vector dimensions for a given provider.
 * @param {string} [provider]
 * @returns {number}
 */
function getDimensionsForProvider(provider) {
  switch (provider) {
    case 'jina-code': return JINA_CODE_DIMENSIONS;
    case 'voyage-code-3': return VOYAGE_DIMENSIONS;
    case 'openai': return OPENAI_DIMENSIONS;
    default: return 0;
  }
}

export { JINA_CODE_DIMENSIONS, VOYAGE_DIMENSIONS, OPENAI_DIMENSIONS };
