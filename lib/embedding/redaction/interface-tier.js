/**
 * Interface Tier — extracts only public signatures from chunks.
 *
 * Strips method bodies, private members, and implementation details.
 * Retains: class names, method signatures, parameter types, return types, public constants.
 *
 * REQ-0045 / FR-011 / AC-011-01 / M4
 * @module lib/embedding/redaction/interface-tier
 */

/**
 * Signature pattern matchers for common languages.
 * Each pattern captures the signature portion of a declaration.
 * @type {RegExp[]}
 */
const SIGNATURE_PATTERNS = [
  // Java / C# / TypeScript method signatures: access modifier + return type + name(params)
  /^[ \t]*((?:public|protected|private|static|final|abstract|async|export|default)\s+)*(?:[\w<>\[\],\s]+)\s+(\w+)\s*\([^)]*\)/gm,
  // Function declarations: function name(params) or export function name(params)
  /^[ \t]*(export\s+)?(async\s+)?function\s+(\w+)\s*\([^)]*\)/gm,
  // Arrow functions assigned to const/let/var: const name = (params) =>
  /^[ \t]*(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s+)?\([^)]*\)\s*=>/gm,
  // Class declarations (Java: public/abstract class, JS/TS: export class)
  /^[ \t]*((?:export|public|protected|abstract)\s+)*class\s+(\w+)(\s+extends\s+\w+)?(\s+implements\s+[\w,\s]+)?/gm,
  // Interface declarations (TypeScript / Java)
  /^[ \t]*(export\s+)?interface\s+(\w+)(\s+extends\s+[\w,\s]+)?/gm,
  // Type alias (TypeScript)
  /^[ \t]*(export\s+)?type\s+(\w+)\s*=/gm,
  // Public constants: export const NAME = value
  /^[ \t]*(export\s+)(const|let|var)\s+([A-Z_][A-Z0-9_]*)\s*=/gm,
];

/**
 * Private member pattern — lines starting with private, #, or _ prefixed members.
 * @type {RegExp}
 */
const PRIVATE_PATTERN = /^[ \t]*(private\s+|#\w)/;

/**
 * Extract public signatures from chunk content.
 *
 * @param {string} content - Source code content
 * @param {string} [language='unknown'] - Source language hint
 * @returns {string[]} Array of extracted signature lines
 */
export function extractSignatures(content, language = 'unknown') {
  if (!content || typeof content !== 'string') return [];

  const lines = content.split('\n');
  const signatures = [];
  const seen = new Set();

  for (const pattern of SIGNATURE_PATTERNS) {
    // Reset regex state for each pattern
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const sig = match[0].trim();
      if (!seen.has(sig) && !PRIVATE_PATTERN.test(match[0])) {
        seen.add(sig);
        signatures.push(sig);
      }
    }
  }

  // If regex found nothing, fall back to using pre-extracted signatures from chunk
  if (signatures.length === 0) {
    return [];
  }

  return signatures;
}

/**
 * Apply interface-tier redaction to a single chunk.
 * Replaces content with extracted signatures only.
 *
 * @param {import('../chunker/index.js').Chunk} chunk
 * @returns {import('../chunker/index.js').Chunk} Redacted chunk (new object)
 */
export function redactToInterface(chunk) {
  if (!chunk) return chunk;

  // Use pre-extracted signatures from chunker if available
  let sigs = chunk.signatures && chunk.signatures.length > 0
    ? [...chunk.signatures]
    : extractSignatures(chunk.content, chunk.language);

  const redactedContent = sigs.length > 0
    ? sigs.join('\n')
    : `// ${chunk.type || 'block'}: ${chunk.name || '(anonymous)'}`;

  return {
    ...chunk,
    content: redactedContent,
    tokenCount: Math.ceil(redactedContent.length / 4),
    redactionTier: 'interface',
  };
}
