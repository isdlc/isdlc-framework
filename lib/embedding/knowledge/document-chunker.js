/**
 * Document Chunker — structure-aware chunking for knowledge base documents.
 *
 * Supports markdown, HTML, and plain text. Respects document structure
 * (headings, sections, paragraphs) and keeps code blocks as atomic units.
 *
 * REQ-0045 / FR-002 / AC-002-01, AC-002-02 / M2 Engine
 * @module lib/embedding/knowledge/document-chunker
 */

import { createHash } from 'node:crypto';

/** Rough estimate: 1 token ~ 4 characters */
const CHARS_PER_TOKEN = 4;

/**
 * @typedef {Object} DocumentChunk
 * @property {string} id - Deterministic chunk ID
 * @property {string} content - Chunk text content
 * @property {string} filePath - Source file path
 * @property {string} sectionPath - Breadcrumb path (e.g., "Root > Chapter > Section")
 * @property {number} charOffset - Character offset from start of document
 */

/**
 * @typedef {Object} ChunkOptions
 * @property {'markdown'|'html'|'text'} [format] - Document format
 * @property {string} [filePath='<string>'] - Source file path
 * @property {number} [maxTokens=512] - Maximum tokens per chunk
 */

const SUPPORTED_FORMATS = ['markdown', 'html', 'text'];

/**
 * Chunk a document into structure-aware pieces.
 *
 * @param {string} content - Raw document content
 * @param {ChunkOptions} [options]
 * @returns {DocumentChunk[]}
 */
export function chunkDocument(content, options = {}) {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return [];
  }

  const format = options.format || detectFormat(options.filePath || '');
  const filePath = options.filePath || '<string>';
  const maxTokens = options.maxTokens || 512;

  switch (format) {
    case 'markdown':
      return chunkMarkdown(content, filePath, maxTokens);
    case 'html':
      return chunkHTML(content, filePath, maxTokens);
    case 'text':
    default:
      return chunkPlainText(content, filePath, maxTokens);
  }
}

/**
 * Detect document format from file extension.
 * @param {string} filePath
 * @returns {'markdown'|'html'|'text'}
 */
function detectFormat(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'md' || ext === 'mdx' || ext === 'markdown') return 'markdown';
  if (ext === 'html' || ext === 'htm') return 'html';
  return 'text';
}

// ── Markdown Chunking ─────────────────────────────────────────────

/**
 * Chunk markdown by headings, preserving code blocks as atomic units.
 * @param {string} content
 * @param {string} filePath
 * @param {number} maxTokens
 * @returns {DocumentChunk[]}
 */
function chunkMarkdown(content, filePath, maxTokens) {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const sections = splitMarkdownSections(content);
  const chunks = [];

  for (const section of sections) {
    if (section.content.trim().length === 0) continue;

    if (section.content.length <= maxChars) {
      chunks.push(createChunk(
        section.content,
        filePath,
        section.sectionPath,
        section.charOffset
      ));
    } else {
      // Split oversized sections into sub-chunks
      const subChunks = splitBySize(section.content, maxChars);
      let subOffset = section.charOffset;
      for (const sub of subChunks) {
        chunks.push(createChunk(sub, filePath, section.sectionPath, subOffset));
        subOffset += sub.length;
      }
    }
  }

  return chunks;
}

/**
 * Split markdown content into sections based on headings.
 * Keeps code blocks (``` ... ```) as atomic units within their section.
 * @param {string} content
 * @returns {{ content: string, sectionPath: string, charOffset: number }[]}
 */
function splitMarkdownSections(content) {
  const lines = content.split('\n');
  const sections = [];
  const headingStack = []; // Track heading hierarchy
  let currentLines = [];
  let currentOffset = 0;
  let sectionStartOffset = 0;
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLen = line.length + 1; // +1 for newline

    // Track code blocks
    if (line.trimStart().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentLines.push(line);
      currentOffset += lineLen;
      continue;
    }

    // Only split on headings outside code blocks
    if (!inCodeBlock) {
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        // Flush current section
        if (currentLines.length > 0) {
          const sectionContent = currentLines.join('\n');
          if (sectionContent.trim().length > 0) {
            sections.push({
              content: sectionContent,
              sectionPath: buildSectionPath(headingStack),
              charOffset: sectionStartOffset,
            });
          }
        }

        const level = headingMatch[1].length;
        const title = headingMatch[2].trim();

        // Update heading stack
        while (headingStack.length >= level) {
          headingStack.pop();
        }
        headingStack.push(title);

        currentLines = [line];
        sectionStartOffset = currentOffset;
        currentOffset += lineLen;
        continue;
      }
    }

    currentLines.push(line);
    currentOffset += lineLen;
  }

  // Flush remaining content
  if (currentLines.length > 0) {
    const sectionContent = currentLines.join('\n');
    if (sectionContent.trim().length > 0) {
      sections.push({
        content: sectionContent,
        sectionPath: buildSectionPath(headingStack),
        charOffset: sectionStartOffset,
      });
    }
  }

  return sections;
}

/**
 * Build a breadcrumb path from heading stack.
 * @param {string[]} stack
 * @returns {string}
 */
function buildSectionPath(stack) {
  return stack.length > 0 ? stack.join(' > ') : '<root>';
}

// ── HTML Chunking ────────────────────────────────────────────────

/**
 * Chunk HTML by stripping tags and splitting on block elements.
 * @param {string} content
 * @param {string} filePath
 * @param {number} maxTokens
 * @returns {DocumentChunk[]}
 */
function chunkHTML(content, filePath, maxTokens) {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Split on block-level elements (h1-h6, p, div, section, article)
  const blockPattern = /<\/?(?:h[1-6]|p|div|section|article|header|footer|main|nav|aside|blockquote|ul|ol|li|table|tr|pre)[\s>]/gi;

  const segments = [];
  let lastIndex = 0;
  let match;

  // Reset lastIndex for global regex
  blockPattern.lastIndex = 0;

  const rawSegments = content.split(blockPattern);

  // If split didn't produce useful segments, treat as single block
  if (rawSegments.length <= 1) {
    const stripped = stripHtmlTags(content).trim();
    if (stripped.length > 0) {
      return [createChunk(stripped, filePath, '<root>', 0)];
    }
    return [];
  }

  // Process each segment
  let charOffset = 0;
  const headingStack = [];
  const chunks = [];

  // Use regex to find heading text and block boundaries
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let headingMatch;
  while ((headingMatch = headingRegex.exec(content)) !== null) {
    const level = parseInt(headingMatch[1], 10);
    const title = stripHtmlTags(headingMatch[2]).trim();
    if (title) {
      while (headingStack.length >= level) headingStack.pop();
      headingStack.push(title);
    }
  }

  // Split on block elements more simply
  const blockSplitRegex = /<(?:h[1-6]|p|div|section)[^>]*>/gi;
  const parts = content.split(blockSplitRegex);
  let offset = 0;

  for (const part of parts) {
    const stripped = stripHtmlTags(part).trim();
    if (stripped.length > 0) {
      if (stripped.length <= maxChars) {
        chunks.push(createChunk(stripped, filePath, buildSectionPath(headingStack), offset));
      } else {
        const subChunks = splitBySize(stripped, maxChars);
        let subOffset = offset;
        for (const sub of subChunks) {
          chunks.push(createChunk(sub, filePath, buildSectionPath(headingStack), subOffset));
          subOffset += sub.length;
        }
      }
    }
    offset += part.length;
  }

  return chunks;
}

/**
 * Strip HTML tags from content.
 * @param {string} html
 * @returns {string}
 */
function stripHtmlTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ── Plain Text Chunking ──────────────────────────────────────────

/**
 * Chunk plain text by splitting on double newlines (paragraph breaks).
 * @param {string} content
 * @param {string} filePath
 * @param {number} maxTokens
 * @returns {DocumentChunk[]}
 */
function chunkPlainText(content, filePath, maxTokens) {
  const maxChars = maxTokens * CHARS_PER_TOKEN;

  // Split on double newlines
  const paragraphs = content.split(/\n\s*\n/);
  const chunks = [];
  let charOffset = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) {
      charOffset += para.length + 2; // +2 for \n\n
      continue;
    }

    if (trimmed.length <= maxChars) {
      chunks.push(createChunk(trimmed, filePath, '<root>', charOffset));
    } else {
      const subChunks = splitBySize(trimmed, maxChars);
      let subOffset = charOffset;
      for (const sub of subChunks) {
        chunks.push(createChunk(sub, filePath, '<root>', subOffset));
        subOffset += sub.length;
      }
    }

    charOffset += para.length + 2; // +2 for separator
  }

  return chunks;
}

// ── Shared Utilities ─────────────────────────────────────────────

/**
 * Split text into chunks that fit within maxChars.
 * Prefers splitting on sentence boundaries.
 * @param {string} text
 * @param {number} maxChars
 * @returns {string[]}
 */
function splitBySize(text, maxChars) {
  if (text.length <= maxChars) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Try to split at sentence boundary
    let splitAt = maxChars;
    const sentenceEnd = remaining.lastIndexOf('. ', splitAt);
    if (sentenceEnd > maxChars * 0.5) {
      splitAt = sentenceEnd + 1;
    } else {
      // Try word boundary
      const wordEnd = remaining.lastIndexOf(' ', splitAt);
      if (wordEnd > maxChars * 0.3) {
        splitAt = wordEnd;
      }
    }

    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  return chunks;
}

/**
 * Create a DocumentChunk with a deterministic ID.
 * @param {string} content
 * @param {string} filePath
 * @param {string} sectionPath
 * @param {number} charOffset
 * @returns {DocumentChunk}
 */
function createChunk(content, filePath, sectionPath, charOffset) {
  const id = createHash('sha256')
    .update(`${filePath}:${charOffset}:${content.length}`)
    .digest('hex')
    .slice(0, 16);

  return {
    id,
    content,
    filePath,
    sectionPath,
    charOffset,
  };
}

export { detectFormat, stripHtmlTags, SUPPORTED_FORMATS, CHARS_PER_TOKEN };
