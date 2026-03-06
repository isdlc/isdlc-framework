/**
 * Voyage-code-3 Adapter — cloud embedding via Voyage AI API.
 *
 * Uses native fetch() to call the Voyage AI embedding endpoint.
 * Returns normalized vectors compatible with the M2 Engine adapter interface.
 *
 * REQ-0045 / FR-005 / AC-005-03, AC-005-04, AC-005-05 / M2 Engine
 * @module lib/embedding/engine/voyage-adapter
 */

const VOYAGE_DIMENSIONS = 1024;
const DEFAULT_ENDPOINT = 'https://api.voyageai.com/v1/embeddings';
const DEFAULT_MODEL = 'voyage-code-3';

/**
 * @typedef {Object} VoyageAdapterConfig
 * @property {string} apiKey - Voyage AI API key (required)
 * @property {string} [endpoint] - Custom API endpoint URL
 * @property {string} [model] - Model name (default: 'voyage-code-3')
 */

/**
 * Create a Voyage-code-3 adapter instance.
 *
 * @param {VoyageAdapterConfig} config
 * @returns {{ dimensions: number, embed: Function, healthCheck: Function, dispose: Function }}
 * @throws {Error} If apiKey is missing
 */
export function createVoyageAdapter(config = {}) {
  const { apiKey, endpoint = DEFAULT_ENDPOINT, model = DEFAULT_MODEL } = config;

  if (!apiKey) {
    throw new Error('voyage-code-3: apiKey is required');
  }

  let disposed = false;

  return {
    dimensions: VOYAGE_DIMENSIONS,

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
        throw new Error(`voyage-code-3: Network error calling ${endpoint}: ${err.message}`);
      }

      if (!response.ok) {
        let detail = '';
        try {
          const body = await response.json();
          detail = body.detail || body.error?.message || JSON.stringify(body);
        } catch {
          detail = await response.text().catch(() => 'unknown error');
        }
        throw new Error(
          `voyage-code-3: API returned HTTP ${response.status}: ${detail}`
        );
      }

      const body = await response.json();

      if (!body.data || !Array.isArray(body.data)) {
        throw new Error('voyage-code-3: Invalid API response — missing data array');
      }

      return body.data.map(item => {
        const vec = new Float32Array(VOYAGE_DIMENSIONS);
        const raw = item.embedding;
        for (let i = 0; i < VOYAGE_DIMENSIONS && i < raw.length; i++) {
          vec[i] = raw[i];
        }
        normalize(vec);
        return vec;
      });
    },

    /**
     * Check if the Voyage API is reachable and functional.
     * @returns {Promise<{healthy: boolean, dimensions: number, error?: string}>}
     */
    async healthCheck() {
      try {
        await this.embed(['health check']);
        return { healthy: true, dimensions: VOYAGE_DIMENSIONS };
      } catch (err) {
        return { healthy: false, dimensions: VOYAGE_DIMENSIONS, error: err.message };
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

export { VOYAGE_DIMENSIONS };
