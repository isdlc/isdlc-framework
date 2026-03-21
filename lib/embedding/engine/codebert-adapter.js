/**
 * CodeBERT Adapter — ONNX runtime inference for local embeddings.
 *
 * Wraps onnxruntime-node to run the CodeBERT model locally. Returns null
 * from create() if ONNX runtime or tokenizers package is not available,
 * enabling graceful fallback (Article X: Fail-Safe Defaults).
 *
 * BUG-0056 / FR-001: Replaced hash-based stub tokenizer with proper BPE
 * tokenization via the `tokenizers` npm package loading CodeBERT vocabulary.
 *
 * REQ-0045 / FR-001, FR-005 / M2 Engine
 * @module lib/embedding/engine/codebert-adapter
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

const CODEBERT_DIMENSIONS = 768;
const DEFAULT_MODEL_PATH = '.isdlc/models/codebert-base/model.onnx';

// RoBERTa/CodeBERT special token IDs
const CLS_TOKEN_ID = 0;   // <s>
const SEP_TOKEN_ID = 2;   // </s>
const PAD_TOKEN_ID = 1;   // <pad>

// Singleton tokenizer instance (loaded once, reused)
let _tokenizerInstance = null;
let _tokenizerLoadAttempted = false;

/**
 * @typedef {Object} CodeBERTAdapter
 * @property {function} embed - (texts: string[]) => Promise<Float32Array[]>
 * @property {function} healthCheck - () => Promise<{healthy: boolean, dimensions: number, error?: string}>
 * @property {function} dispose - () => void
 * @property {number} dimensions - Vector dimensionality (768)
 */

/**
 * Load the BPE tokenizer from model directory.
 * Uses the `tokenizers` npm package (Rust bindings) with CodeBERT vocab.
 * Returns null if tokenizers is unavailable or vocab files are missing.
 *
 * BUG-0056 / FR-001 / AC-001-01, AC-001-03, AC-001-04
 * @param {string} modelDir - Directory containing tokenizer.json/vocab.json
 * @returns {Promise<object|null>} Tokenizer instance or null
 */
async function loadTokenizer(modelDir) {
  if (_tokenizerLoadAttempted) return _tokenizerInstance;
  _tokenizerLoadAttempted = true;

  try {
    // Check for tokenizer.json (HuggingFace tokenizer config)
    const tokenizerJsonPath = join(modelDir, 'tokenizer.json');
    if (!existsSync(tokenizerJsonPath)) {
      return null;
    }

    // Dynamic import of tokenizers package (optional dependency)
    const tokenizersModule = await import('tokenizers');
    const { Tokenizer } = tokenizersModule;
    _tokenizerInstance = await Tokenizer.fromFile(tokenizerJsonPath);
    return _tokenizerInstance;
  } catch {
    // AC-001-04: Fail-open if tokenizers package unavailable or vocab missing
    return null;
  }
}

/**
 * Tokenize text using proper BPE from CodeBERT vocabulary.
 *
 * BUG-0056 / FR-001 / AC-001-01: Produces real BPE token IDs in range [0, 50265]
 * instead of hash-derived values.
 *
 * Exported for testing. In production, called internally by embed().
 *
 * @param {string} text - Input text to tokenize
 * @param {number} [maxLength=512] - Maximum sequence length (including CLS + SEP)
 * @returns {number[]} Token IDs array of exactly maxLength
 */
function tokenize(text, maxLength = 512) {
  if (!_tokenizerInstance) {
    // Fallback: return CLS + SEP + PAD if tokenizer not loaded
    // This should not happen in normal operation — createCodeBERTAdapter
    // returns null when tokenizer is unavailable
    const tokens = new Array(maxLength).fill(PAD_TOKEN_ID);
    tokens[0] = CLS_TOKEN_ID;
    tokens[1] = SEP_TOKEN_ID;
    return tokens;
  }

  // Encode with the BPE tokenizer
  const encoding = _tokenizerInstance.encode(text || '');
  const rawIds = encoding.getIds();

  // Build token sequence: CLS + BPE tokens (truncated) + SEP + PAD
  const tokens = new Array(maxLength).fill(PAD_TOKEN_ID);
  tokens[0] = CLS_TOKEN_ID;

  // Copy BPE tokens, leaving room for CLS at start and SEP at end
  const maxContent = maxLength - 2; // Reserve spots for CLS and SEP
  const contentLength = Math.min(rawIds.length, maxContent);
  for (let i = 0; i < contentLength; i++) {
    tokens[i + 1] = rawIds[i];
  }

  // Place SEP after the last content token
  tokens[contentLength + 1] = SEP_TOKEN_ID;

  return tokens;
}

/**
 * Create a CodeBERT adapter instance.
 * Returns null if ONNX runtime or tokenizers package is not installed.
 *
 * BUG-0056 / FR-001 / AC-001-04: Returns null (fail-open) when:
 * - onnxruntime-node is not installed
 * - tokenizers npm package is not installed
 * - vocabulary/tokenizer config files are missing
 *
 * @param {Object} [config]
 * @param {string} [config.modelPath] - Path to ONNX model file
 * @returns {Promise<CodeBERTAdapter|null>}
 */
export async function createCodeBERTAdapter(config = {}) {
  const { modelPath = DEFAULT_MODEL_PATH } = config;

  let ort;
  try {
    ort = await import('onnxruntime-node');
  } catch {
    return null;
  }

  // BUG-0056 / FR-001: Load BPE tokenizer from model directory
  const modelDir = dirname(modelPath);
  const tokenizer = await loadTokenizer(modelDir);
  if (!tokenizer) {
    // AC-001-04: Fail-open if tokenizer unavailable
    return null;
  }

  let session = null;

  async function ensureSession() {
    if (!session) {
      try {
        session = await ort.InferenceSession.create(modelPath);
      } catch (err) {
        throw new Error(`Failed to load CodeBERT model from ${modelPath}: ${err.message}`);
      }
    }
    return session;
  }

  return {
    dimensions: CODEBERT_DIMENSIONS,

    /**
     * Generate embeddings for an array of text inputs.
     * @param {string[]} texts
     * @returns {Promise<Float32Array[]>}
     */
    async embed(texts) {
      const sess = await ensureSession();
      const results = [];

      for (const text of texts) {
        // BUG-0056 / FR-001: Use proper BPE tokenization
        const tokens = tokenize(text);
        const inputIds = new BigInt64Array(tokens.map(t => BigInt(t)));
        const attentionMask = new BigInt64Array(tokens.map(t => BigInt(t !== PAD_TOKEN_ID ? 1 : 0)));

        const feeds = {
          input_ids: new ort.Tensor('int64', inputIds, [1, tokens.length]),
          attention_mask: new ort.Tensor('int64', attentionMask, [1, tokens.length]),
        };

        const output = await sess.run(feeds);
        // Extract [CLS] token embedding (first token, all dimensions)
        const outputData = output.last_hidden_state?.data || output[Object.keys(output)[0]]?.data;

        if (outputData) {
          const embedding = new Float32Array(CODEBERT_DIMENSIONS);
          for (let i = 0; i < CODEBERT_DIMENSIONS; i++) {
            embedding[i] = outputData[i];
          }
          // L2 normalize
          normalize(embedding);
          results.push(embedding);
        } else {
          // Zero vector as fallback
          results.push(new Float32Array(CODEBERT_DIMENSIONS));
        }
      }

      return results;
    },

    /**
     * Check if the model is loaded and functional.
     * @returns {Promise<{healthy: boolean, dimensions: number, error?: string}>}
     */
    async healthCheck() {
      try {
        await ensureSession();
        return { healthy: true, dimensions: CODEBERT_DIMENSIONS };
      } catch (err) {
        return { healthy: false, dimensions: CODEBERT_DIMENSIONS, error: err.message };
      }
    },

    /**
     * Release ONNX session resources.
     */
    dispose() {
      if (session) {
        session.release?.();
        session = null;
      }
    },
  };
}

/**
 * L2-normalize a vector in place.
 * @param {Float32Array} vec
 */
function normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < vec.length; i++) {
      vec[i] /= norm;
    }
  }
}

export { CODEBERT_DIMENSIONS, tokenize };
