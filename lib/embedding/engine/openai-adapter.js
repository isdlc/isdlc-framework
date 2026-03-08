/**
 * OpenAI Embedding Adapter — cloud embedding via OpenAI API.
 *
 * Uses native fetch() to call the OpenAI embedding endpoint.
 * Supports custom endpoints for Azure OpenAI deployments.
 * Returns normalized vectors compatible with the M2 Engine adapter interface.
 *
 * REQ-0045 / FR-005 / AC-005-03, AC-005-04, AC-005-05 / M2 Engine
 * @module lib/embedding/engine/openai-adapter
 */

const OPENAI_DIMENSIONS = 1536;
const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const DEFAULT_MODEL = 'text-embedding-3-small';

/**
 * @typedef {Object} OpenAIAdapterConfig
 * @property {string} apiKey - OpenAI API key (required)
 * @property {string} [endpoint] - Custom API endpoint URL (for Azure OpenAI)
 * @property {string} [model] - Model name (default: 'text-embedding-3-small')
 */

/**
 * Create an OpenAI adapter instance.
 *
 * @param {OpenAIAdapterConfig} config
 * @returns {{ dimensions: number, embed: Function, healthCheck: Function, dispose: Function }}
 * @throws {Error} If apiKey is missing
 */
export function createOpenAIAdapter(config = {}) {
  const {
    apiKey,
    endpoint = DEFAULT_ENDPOINT,
    model = DEFAULT_MODEL,
  } = config;

  if (!apiKey) {
    throw new Error('openai: apiKey is required');
  }

  let disposed = false;

  return {
    dimensions: OPENAI_DIMENSIONS,

    /**
     * Generate embeddings for an array of text inputs.
     * @param {string[]} texts
     * @returns {Promise<Float32Array[]>}
     */
    async embed(texts) {
      if (!texts || texts.length === 0) {
        return [];
      }

      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: texts,
            model,
          }),
        });
      } catch (err) {
        throw new Error(`openai: Network error calling ${endpoint}: ${err.message}`);
      }

      if (!response.ok) {
        let detail = '';
        try {
          const body = await response.json();
          detail = body.error?.message || body.detail || JSON.stringify(body);
        } catch {
          detail = await response.text().catch(() => 'unknown error');
        }
        throw new Error(
          `openai: API returned HTTP ${response.status}: ${detail}`
        );
      }

      const body = await response.json();

      if (!body.data || !Array.isArray(body.data)) {
        throw new Error('openai: Invalid API response — missing data array');
      }

      return body.data.map(item => {
        const vec = new Float32Array(OPENAI_DIMENSIONS);
        const raw = item.embedding;
        for (let i = 0; i < OPENAI_DIMENSIONS && i < raw.length; i++) {
          vec[i] = raw[i];
        }
        normalize(vec);
        return vec;
      });
    },

    /**
     * Check if the OpenAI API is reachable and functional.
     * @returns {Promise<{healthy: boolean, dimensions: number, error?: string}>}
     */
    async healthCheck() {
      try {
        await this.embed(['health check']);
        return { healthy: true, dimensions: OPENAI_DIMENSIONS };
      } catch (err) {
        return { healthy: false, dimensions: OPENAI_DIMENSIONS, error: err.message };
      }
    },

    /**
     * Release resources (no-op for HTTP adapter).
     */
    dispose() {
      disposed = true;
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

export { OPENAI_DIMENSIONS };
