/**
 * CodeBERT Adapter — ONNX runtime inference for local embeddings.
 *
 * Wraps onnxruntime-node to run the CodeBERT model locally. Returns null
 * from create() if ONNX runtime is not available, enabling graceful fallback.
 *
 * REQ-0045 / FR-001, FR-005 / M2 Engine
 * @module lib/embedding/engine/codebert-adapter
 */

const CODEBERT_DIMENSIONS = 768;
const DEFAULT_MODEL_PATH = '.isdlc/models/codebert-base/model.onnx';

/**
 * @typedef {Object} CodeBERTAdapter
 * @property {function} embed - (texts: string[]) => Promise<Float32Array[]>
 * @property {function} healthCheck - () => Promise<{healthy: boolean, dimensions: number, error?: string}>
 * @property {function} dispose - () => void
 * @property {number} dimensions - Vector dimensionality (768)
 */

/**
 * Create a CodeBERT adapter instance.
 * Returns null if ONNX runtime is not installed.
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
        // Simple tokenization: split into word pieces, pad/truncate to 512
        const tokens = tokenize(text);
        const inputIds = new BigInt64Array(tokens.map(t => BigInt(t)));
        const attentionMask = new BigInt64Array(tokens.map(t => BigInt(t > 0 ? 1 : 0)));

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
 * Simple whitespace tokenizer with vocabulary mapping.
 * In production this would use a proper BPE tokenizer.
 * @param {string} text
 * @param {number} maxLength
 * @returns {number[]}
 */
function tokenize(text, maxLength = 512) {
  // CLS=101, SEP=102, PAD=0
  const tokens = [101]; // [CLS]
  const words = text.split(/\s+/).filter(Boolean);

  for (const word of words) {
    if (tokens.length >= maxLength - 1) break;
    // Simple hash-based token ID (placeholder for real BPE tokenizer)
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
    }
    tokens.push(Math.abs(hash % 30000) + 1000);
  }

  tokens.push(102); // [SEP]

  // Pad to maxLength
  while (tokens.length < maxLength) {
    tokens.push(0);
  }

  return tokens.slice(0, maxLength);
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

export { CODEBERT_DIMENSIONS };
