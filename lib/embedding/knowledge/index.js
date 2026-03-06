/**
 * Knowledge Base Embedding — public API.
 *
 * Re-exports document chunking and pipeline creation for non-code
 * document embeddings (markdown, HTML, plain text).
 *
 * REQ-0045 / FR-002 / AC-002-01, AC-002-02, AC-002-03 / M2 Engine
 * @module lib/embedding/knowledge
 */

export { chunkDocument, SUPPORTED_FORMATS } from './document-chunker.js';
export { createKnowledgePipeline } from './pipeline.js';
