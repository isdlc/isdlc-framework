/**
 * Tree-sitter Adapter — AST-based chunk extraction.
 *
 * Wraps tree-sitter to parse source files and extract semantic chunks
 * (functions, classes, methods). Falls back to line-based chunking if
 * tree-sitter or the required grammar is not available.
 *
 * REQ-0045 / FR-001 / M1 Chunker
 * @module lib/embedding/chunker/treesitter-adapter
 */

import { createHash } from 'node:crypto';

const CHARS_PER_TOKEN = 4;

/** Node types that represent semantic boundaries in most grammars */
const FUNCTION_TYPES = new Set([
  'function_declaration',
  'function_definition',
  'method_declaration',
  'method_definition',
  'arrow_function',
  'function_item',       // Rust
  'func_declaration',    // Go
]);

const CLASS_TYPES = new Set([
  'class_declaration',
  'class_definition',
  'interface_declaration',
  'enum_declaration',
  'struct_item',         // Rust
  'type_declaration',    // Go
]);

const METHOD_TYPES = new Set([
  'method_declaration',
  'method_definition',
]);

/**
 * Try to load tree-sitter dynamically. Returns null if not available.
 * @returns {Promise<Object|null>}
 */
async function loadTreeSitter() {
  try {
    const Parser = (await import('tree-sitter')).default;
    return Parser;
  } catch {
    return null;
  }
}

/**
 * Try to load a tree-sitter grammar dynamically.
 * @param {string} language - Grammar name (e.g., 'java', 'typescript')
 * @returns {Promise<Object|null>}
 */
async function loadGrammar(language) {
  const grammarPackages = {
    java: 'tree-sitter-java',
    typescript: 'tree-sitter-typescript',
    javascript: 'tree-sitter-javascript',
    python: 'tree-sitter-python',
    xml: 'tree-sitter-xml',
    c: 'tree-sitter-c',
    cpp: 'tree-sitter-cpp',
    go: 'tree-sitter-go',
    rust: 'tree-sitter-rust',
    ruby: 'tree-sitter-ruby',
    c_sharp: 'tree-sitter-c-sharp',
    kotlin: 'tree-sitter-kotlin',
    bash: 'tree-sitter-bash',
  };

  const packageName = grammarPackages[language];
  if (!packageName) return null;

  try {
    const grammar = (await import(packageName)).default;
    return grammar;
  } catch {
    return null;
  }
}

/**
 * Check if tree-sitter is available for use.
 * @returns {Promise<boolean>}
 */
export async function isTreeSitterAvailable() {
  const Parser = await loadTreeSitter();
  return Parser !== null;
}

/**
 * Parse source content using tree-sitter and extract semantic chunks.
 *
 * @param {string} content - Source file content
 * @param {string} filePath - Relative file path
 * @param {string} language - Tree-sitter grammar name
 * @param {Object} [options]
 * @param {number} [options.maxTokens=512] - Max tokens per chunk
 * @param {number} [options.overlapTokens=64] - Overlap tokens
 * @param {boolean} [options.preserveSignatures=true] - Extract method signatures
 * @returns {Promise<import('./index.js').Chunk[]|null>} Chunks or null if tree-sitter unavailable
 */
export async function parseWithTreeSitter(content, filePath, language, options = {}) {
  const { maxTokens = 512, preserveSignatures = true } = options;

  const Parser = await loadTreeSitter();
  if (!Parser) return null;

  const grammar = await loadGrammar(language);
  if (!grammar) return null;

  const parser = new Parser();
  parser.setLanguage(grammar);

  const tree = parser.parse(content);
  const chunks = [];

  extractChunks(tree.rootNode, content, filePath, language, chunks, {
    maxTokens,
    preserveSignatures,
    parentName: null,
  });

  // If no semantic chunks found, return null to trigger fallback
  if (chunks.length === 0) return null;

  return chunks;
}

/**
 * Recursively extract semantic chunks from AST nodes.
 * @param {Object} node - Tree-sitter node
 * @param {string} content - Full source content
 * @param {string} filePath
 * @param {string} language
 * @param {import('./index.js').Chunk[]} chunks - Output array
 * @param {Object} ctx - Context with options and parent info
 */
function extractChunks(node, content, filePath, language, chunks, ctx) {
  const { maxTokens, preserveSignatures, parentName } = ctx;

  const nodeType = node.type;
  let chunkType = null;
  let name = null;

  if (CLASS_TYPES.has(nodeType)) {
    chunkType = nodeType.includes('interface') ? 'interface' : 'class';
    name = findChildName(node);
  } else if (METHOD_TYPES.has(nodeType)) {
    chunkType = 'method';
    name = findChildName(node);
  } else if (FUNCTION_TYPES.has(nodeType) && !METHOD_TYPES.has(nodeType)) {
    chunkType = 'function';
    name = findChildName(node);
  }

  if (chunkType) {
    const text = node.text;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const tokenCount = Math.ceil(text.length / CHARS_PER_TOKEN);

    // If chunk is too large, extract children individually
    if (tokenCount > maxTokens && (chunkType === 'class' || chunkType === 'interface')) {
      // Extract the class header as its own chunk
      const headerEnd = findClassBodyStart(node);
      if (headerEnd > 0) {
        const headerText = content.split('\n').slice(startLine - 1, headerEnd).join('\n');
        const headerId = generateChunkId(filePath, startLine, headerEnd);
        chunks.push({
          id: headerId,
          content: headerText,
          filePath,
          startLine,
          endLine: headerEnd,
          type: chunkType,
          language,
          tokenCount: Math.ceil(headerText.length / CHARS_PER_TOKEN),
          parentName,
          name,
          signatures: preserveSignatures ? extractSignatures(node) : [],
        });
      }

      // Recurse into children with updated parent
      for (let i = 0; i < node.childCount; i++) {
        extractChunks(node.child(i), content, filePath, language, chunks, {
          ...ctx,
          parentName: name || parentName,
        });
      }
      return;
    }

    const id = generateChunkId(filePath, startLine, endLine);
    chunks.push({
      id,
      content: text,
      filePath,
      startLine,
      endLine,
      type: chunkType,
      language,
      tokenCount,
      parentName,
      name,
      signatures: preserveSignatures ? extractSignatures(node) : [],
    });
    return; // Don't recurse into already-chunked nodes
  }

  // Recurse into children for non-semantic nodes
  for (let i = 0; i < node.childCount; i++) {
    extractChunks(node.child(i), content, filePath, language, chunks, ctx);
  }
}

/**
 * Find the name identifier child of a node.
 * @param {Object} node
 * @returns {string|null}
 */
function findChildName(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'identifier' || child.type === 'type_identifier' || child.type === 'name') {
      return child.text;
    }
  }
  return null;
}

/**
 * Find the line where a class body starts (opening brace).
 * @param {Object} node
 * @returns {number} 1-based line number, or 0 if not found
 */
function findClassBodyStart(node) {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child.type === 'class_body' || child.type === 'declaration_list' || child.type === 'block') {
      return child.startPosition.row + 1;
    }
  }
  return 0;
}

/**
 * Extract method signatures from a class/interface node.
 * @param {Object} node
 * @returns {string[]}
 */
function extractSignatures(node) {
  const signatures = [];

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (METHOD_TYPES.has(child.type) || FUNCTION_TYPES.has(child.type)) {
      // Extract just the first line (signature line)
      const firstLine = child.text.split('\n')[0].trim();
      if (firstLine) signatures.push(firstLine);
    }
  }

  return signatures;
}

/**
 * Generate a deterministic chunk ID.
 * @param {string} filePath
 * @param {number} startLine
 * @param {number} endLine
 * @returns {string}
 */
function generateChunkId(filePath, startLine, endLine) {
  const input = `${filePath}:${startLine}:${endLine}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}
