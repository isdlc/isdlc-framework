/**
 * Fallback Chunker — line-based splitting for unsupported languages.
 *
 * When Tree-sitter grammars aren't available for a language, this module
 * splits content into overlapping line-based chunks.
 *
 * REQ-0045 / FR-001 / M1 Chunker
 * @module lib/embedding/chunker/fallback-chunker
 */

import { createHash } from 'node:crypto';

/** Rough estimate: 1 token ≈ 4 characters */
const CHARS_PER_TOKEN = 4;

/**
 * Split content into line-based chunks with overlap.
 *
 * @param {string} content - Source file content
 * @param {string} filePath - Relative file path (for chunk IDs)
 * @param {string} language - Language name (may be null for unknown)
 * @param {Object} [options]
 * @param {number} [options.maxTokens=512] - Target max tokens per chunk
 * @param {number} [options.overlapTokens=64] - Overlap between chunks
 * @returns {import('./index.js').Chunk[]}
 */
export function chunkByLines(content, filePath, language, options = {}) {
  const { maxTokens = 512, overlapTokens = 64 } = options;

  if (!content || content.trim().length === 0) return [];

  const lines = content.split('\n');
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const chunks = [];

  let startIdx = 0;

  while (startIdx < lines.length) {
    let charCount = 0;
    let endIdx = startIdx;

    // Accumulate lines until hitting the token limit
    while (endIdx < lines.length && charCount + lines[endIdx].length + 1 <= maxChars) {
      charCount += lines[endIdx].length + 1; // +1 for newline
      endIdx++;
    }

    // Ensure at least one line per chunk
    if (endIdx === startIdx) endIdx = startIdx + 1;

    const chunkLines = lines.slice(startIdx, endIdx);
    const chunkContent = chunkLines.join('\n');
    const startLine = startIdx + 1; // 1-based
    const endLine = endIdx; // 1-based inclusive

    const id = generateChunkId(filePath, startLine, endLine);

    chunks.push({
      id,
      content: chunkContent,
      filePath,
      startLine,
      endLine,
      type: 'block',
      language: language || 'unknown',
      tokenCount: Math.ceil(chunkContent.length / CHARS_PER_TOKEN),
      parentName: null,
      name: null,
      signatures: [],
    });

    // Move forward, accounting for overlap
    const overlapLines = countLinesForChars(lines, endIdx, overlapChars, true);
    startIdx = endIdx - overlapLines;

    // Prevent infinite loop if overlap would not advance
    if (startIdx <= (chunks.length > 1 ? startIdx : 0) && endIdx >= lines.length) break;
    if (endIdx >= lines.length) break;
  }

  return chunks;
}

/**
 * Count how many lines fit within a character budget, scanning backwards.
 * @param {string[]} lines
 * @param {number} fromIdx - Start scanning backwards from this index
 * @param {number} charBudget
 * @param {boolean} backwards
 * @returns {number}
 */
function countLinesForChars(lines, fromIdx, charBudget, backwards) {
  let count = 0;
  let chars = 0;
  let idx = backwards ? fromIdx - 1 : fromIdx;

  while (backwards ? idx >= 0 : idx < lines.length) {
    if (chars + lines[idx].length + 1 > charBudget) break;
    chars += lines[idx].length + 1;
    count++;
    idx += backwards ? -1 : 1;
  }

  return count;
}

/**
 * Generate a deterministic chunk ID from file path and line range.
 * @param {string} filePath
 * @param {number} startLine
 * @param {number} endLine
 * @returns {string}
 */
export function generateChunkId(filePath, startLine, endLine) {
  const input = `${filePath}:${startLine}:${endLine}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
