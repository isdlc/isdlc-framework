/**
 * Knowledge Base Embedding Pipeline — end-to-end document embedding.
 *
 * Accepts markdown, HTML, and plain text documents. Chunks them
 * using structure-aware splitting and generates embeddings via a
 * pluggable embed function. Output is tagged as 'knowledge-base'
 * to distinguish from code embeddings.
 *
 * REQ-0045 / FR-002 / AC-002-01, AC-002-02, AC-002-03 / M2 Engine
 * @module lib/embedding/knowledge/pipeline
 */

import { chunkDocument } from './document-chunker.js';

/**
 * @typedef {Object} PipelineConfig
 * @property {function} embedFn - (texts: string[]) => Promise<Float32Array[]>
 * @property {string} model - Model name used for embedding
 * @property {number} dimensions - Vector dimensionality
 */

/**
 * @typedef {Object} PipelineResult
 * @property {import('./document-chunker.js').DocumentChunk[]} chunks
 * @property {Float32Array[]} vectors
 * @property {string} contentType - Always 'knowledge-base'
 * @property {string} model
 * @property {number} dimensions
 */

/**
 * Create a knowledge base pipeline instance.
 *
 * @param {PipelineConfig} config
 * @returns {{ processDocument: Function, processDocuments: Function }}
 * @throws {Error} If embedFn is missing
 */
export function createKnowledgePipeline(config = {}) {
  const { embedFn, model = 'unknown', dimensions = 0 } = config;

  if (!embedFn || typeof embedFn !== 'function') {
    throw new Error('embedFn is required and must be a function');
  }

  /**
   * Process a single document — chunk and embed.
   *
   * @param {string} content - Raw document content
   * @param {Object} options
   * @param {string} [options.format] - 'markdown', 'html', or 'text'
   * @param {string} [options.filePath]
   * @param {number} [options.maxTokens=512]
   * @returns {Promise<{ chunks: DocumentChunk[], vectors: Float32Array[] }>}
   */
  async function processDocument(content, options = {}) {
    const chunks = chunkDocument(content, {
      format: options.format,
      filePath: options.filePath,
      maxTokens: options.maxTokens || 512,
    });

    if (chunks.length === 0) {
      return { chunks: [], vectors: [] };
    }

    const texts = chunks.map(c => c.content);
    const vectors = await embedFn(texts);

    return { chunks, vectors };
  }

  /**
   * Process multiple documents — chunk all, then embed in batch.
   *
   * @param {Object[]} documents - Array of { content, filePath, format }
   * @param {Object} [options]
   * @param {function} [options.onProgress] - (processed, total) => void
   * @returns {Promise<PipelineResult>}
   */
  async function processDocuments(documents, options = {}) {
    const { onProgress } = options;
    const allChunks = [];
    const allVectors = [];

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const { chunks, vectors } = await processDocument(doc.content, {
        format: doc.format,
        filePath: doc.filePath,
        maxTokens: doc.maxTokens,
      });

      allChunks.push(...chunks);
      allVectors.push(...vectors);

      if (onProgress) {
        onProgress(i + 1, documents.length);
      }
    }

    return {
      chunks: allChunks,
      vectors: allVectors,
      contentType: 'knowledge-base',
      model,
      dimensions,
    };
  }

  return {
    processDocument,
    processDocuments,
  };
}
