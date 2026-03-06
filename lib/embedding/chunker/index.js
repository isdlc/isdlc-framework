/**
 * Chunking Engine — parse source files into semantic chunks.
 *
 * Uses Tree-sitter for AST-based chunking when available, falls back to
 * line-based splitting for unsupported languages or when Tree-sitter
 * is not installed.
 *
 * REQ-0045 / FR-001 / M1 Chunker
 * @module lib/embedding/chunker
 */

import { readFile } from 'node:fs/promises';
import { detectLanguage, isLanguageSupported } from './language-map.js';
import { parseWithTreeSitter, isTreeSitterAvailable } from './treesitter-adapter.js';
import { chunkByLines } from './fallback-chunker.js';

export { detectLanguage, isLanguageSupported } from './language-map.js';

/**
 * @typedef {Object} Chunk
 * @property {string} id - Deterministic hash of filePath + startLine + endLine
 * @property {string} content - Chunk text content
 * @property {string} filePath - Relative path from module root
 * @property {number} startLine - 1-based start line
 * @property {number} endLine - 1-based end line
 * @property {'function'|'class'|'method'|'interface'|'block'|'module'} type
 * @property {string} language - Source language
 * @property {number} tokenCount - Estimated token count
 * @property {string|null} parentName - Enclosing class/module name
 * @property {string|null} name - Function/class/method name
 * @property {string[]} signatures - Public method signatures
 */

/**
 * @typedef {Object} ChunkOptions
 * @property {number} [maxTokens=512] - Target max tokens per chunk
 * @property {number} [overlapTokens=64] - Overlap between adjacent chunks
 * @property {boolean} [preserveSignatures=true] - Extract method signatures
 */

/**
 * Chunk a file from disk into semantic pieces.
 *
 * @param {string} filePath - Absolute path to source file
 * @param {string} language - Tree-sitter grammar name (e.g., 'java', 'typescript')
 * @param {ChunkOptions} [options]
 * @returns {Promise<Chunk[]>}
 * @throws {Error} If filePath is invalid or file cannot be read
 */
export async function chunkFile(filePath, language, options = {}) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('filePath must be a non-empty string');
  }

  const content = await readFile(filePath, 'utf-8');
  return chunkContent(content, language, { ...options, filePath });
}

/**
 * Chunk raw string content into semantic pieces.
 *
 * @param {string} content - Raw source content
 * @param {string} language - Tree-sitter grammar name
 * @param {ChunkOptions & { filePath?: string }} [options]
 * @returns {Promise<Chunk[]>}
 */
export async function chunkContent(content, language, options = {}) {
  const {
    maxTokens = 512,
    overlapTokens = 64,
    preserveSignatures = true,
    filePath = '<string>',
  } = options;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return [];
  }

  // Skip binary content
  if (isBinaryContent(content)) {
    return [];
  }

  // Try Tree-sitter first if language is supported
  if (language && isLanguageSupported(language)) {
    const treeSitterChunks = await parseWithTreeSitter(content, filePath, language, {
      maxTokens,
      overlapTokens,
      preserveSignatures,
    });

    if (treeSitterChunks && treeSitterChunks.length > 0) {
      return treeSitterChunks;
    }
  }

  // Fall back to line-based chunking
  return chunkByLines(content, filePath, language, { maxTokens, overlapTokens });
}

/**
 * Detect if content appears to be binary.
 * Checks for null bytes in the first 8KB.
 * @param {string} content
 * @returns {boolean}
 */
function isBinaryContent(content) {
  const sample = content.slice(0, 8192);
  return sample.includes('\0');
}
