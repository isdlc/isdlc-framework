/**
 * Language Map — file extension to Tree-sitter grammar mapping.
 *
 * REQ-0045 / FR-001 / M1 Chunker
 * @module lib/embedding/chunker/language-map
 */

const EXTENSION_MAP = new Map([
  // Java
  ['.java', 'java'],
  // TypeScript / JavaScript
  ['.ts', 'typescript'],
  ['.tsx', 'tsx'],
  ['.js', 'javascript'],
  ['.jsx', 'javascript'],
  ['.mjs', 'javascript'],
  ['.cjs', 'javascript'],
  // XML / markup
  ['.xml', 'xml'],
  ['.xsd', 'xml'],
  ['.xsl', 'xml'],
  ['.xslt', 'xml'],
  ['.wsdl', 'xml'],
  ['.pom', 'xml'],
  // Python
  ['.py', 'python'],
  ['.pyi', 'python'],
  // C / C++
  ['.c', 'c'],
  ['.h', 'c'],
  ['.cpp', 'cpp'],
  ['.hpp', 'cpp'],
  ['.cc', 'cpp'],
  // Go
  ['.go', 'go'],
  // Rust
  ['.rs', 'rust'],
  // Ruby
  ['.rb', 'ruby'],
  // PHP
  ['.php', 'php'],
  // Kotlin
  ['.kt', 'kotlin'],
  ['.kts', 'kotlin'],
  // Scala
  ['.scala', 'scala'],
  // C#
  ['.cs', 'c_sharp'],
  // Shell
  ['.sh', 'bash'],
  ['.bash', 'bash'],
  // SQL
  ['.sql', 'sql'],
  // JSON
  ['.json', 'json'],
  // YAML
  ['.yml', 'yaml'],
  ['.yaml', 'yaml'],
  // Markdown
  ['.md', 'markdown'],
  // Properties
  ['.properties', 'properties'],
  // Groovy (Gradle)
  ['.groovy', 'groovy'],
  ['.gradle', 'groovy'],
]);

/**
 * Detect the Tree-sitter grammar name from a file path extension.
 * @param {string} filePath - File path to detect language for
 * @returns {string|null} Tree-sitter grammar name or null if unsupported
 */
export function detectLanguage(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1) return null;
  const ext = filePath.slice(lastDot).toLowerCase();
  return EXTENSION_MAP.get(ext) || null;
}

/**
 * Get the full set of supported extensions.
 * @returns {string[]} Array of supported file extensions
 */
export function getSupportedExtensions() {
  return [...EXTENSION_MAP.keys()];
}

/**
 * Check if a language grammar name is supported.
 * @param {string} language - Grammar name to check
 * @returns {boolean}
 */
export function isLanguageSupported(language) {
  if (!language) return false;
  for (const lang of EXTENSION_MAP.values()) {
    if (lang === language) return true;
  }
  return false;
}
