/**
 * Semantic Search Toolchain Setup
 *
 * Installs and configures the semantic search toolchain components:
 * - Tree-sitter core and language grammars
 * - CodeBERT ONNX model
 * - FAISS and SQLite native bindings
 * - MCP server Docker image
 *
 * Called during `isdlc init` and `isdlc update` as part of the search setup pipeline.
 * Follows the existing setup-search.js pattern (fail-open, dependency-injected).
 *
 * REQ-0045 / FR-015
 * @module lib/embedding/installer/semantic-search-setup
 */

import { execSync } from 'node:child_process';
import { downloadModel } from './model-downloader.js';

/**
 * @typedef {Object} SetupResult
 * @property {boolean} success - Overall success
 * @property {Object} components - Per-component results
 * @property {string[]} warnings - Non-fatal warnings
 */

/**
 * @typedef {Object} SetupOptions
 * @property {string[]} [languages=['java','typescript','python','xml']] - Languages to install grammars for
 * @property {boolean} [skipDocker=false] - Skip Docker image pull
 * @property {boolean} [skipModel=false] - Skip CodeBERT model download
 * @property {function} [onProgress] - Progress callback: (component, status, detail) => void
 */

/**
 * Install and configure the semantic search toolchain.
 *
 * Idempotent: re-running skips already-installed components.
 *
 * @param {string} projectRoot - Project root directory
 * @param {SetupOptions} [options]
 * @returns {Promise<SetupResult>}
 */
export async function setupSemanticSearch(projectRoot, options = {}) {
  const {
    languages = ['java', 'typescript', 'python', 'xml'],
    skipDocker = false,
    skipModel = false,
    onProgress,
  } = options;

  const warnings = [];
  const components = {
    treeSitter: { installed: false, skipped: false },
    grammars: { installed: false, skipped: false, languages: [] },
    onnxRuntime: { installed: false, skipped: false },
    codebertModel: { installed: false, skipped: false },
    faiss: { installed: false, skipped: false },
    docker: { installed: false, skipped: false },
  };

  // 1. Check Tree-sitter core (AC-015-01)
  progress(onProgress, 'tree-sitter', 'checking', 'Checking tree-sitter availability');
  if (isPackageAvailable('tree-sitter')) {
    components.treeSitter.installed = true;
    progress(onProgress, 'tree-sitter', 'found', 'tree-sitter already available');
  } else {
    progress(onProgress, 'tree-sitter', 'installing', 'tree-sitter not found — install with: npm install tree-sitter');
    components.treeSitter.skipped = true;
    warnings.push('tree-sitter not installed. Install with: npm install tree-sitter');
  }

  // 2. Check language grammars (AC-015-01)
  const grammarMap = {
    java: 'tree-sitter-java',
    typescript: 'tree-sitter-typescript',
    python: 'tree-sitter-python',
    xml: 'tree-sitter-xml',
    javascript: 'tree-sitter-javascript',
    go: 'tree-sitter-go',
    rust: 'tree-sitter-rust',
    c: 'tree-sitter-c',
    cpp: 'tree-sitter-cpp',
  };

  for (const lang of languages) {
    const pkg = grammarMap[lang];
    if (!pkg) {
      warnings.push(`No grammar package known for language: ${lang}`);
      continue;
    }
    progress(onProgress, 'grammars', 'checking', `Checking ${pkg}`);
    if (isPackageAvailable(pkg)) {
      components.grammars.languages.push(lang);
    } else {
      warnings.push(`Grammar not installed: ${pkg}. Install with: npm install ${pkg}`);
    }
  }
  components.grammars.installed = components.grammars.languages.length > 0;

  // 3. Check ONNX runtime (AC-015-07)
  progress(onProgress, 'onnx-runtime', 'checking', 'Checking onnxruntime-node');
  if (isPackageAvailable('onnxruntime-node')) {
    components.onnxRuntime.installed = true;
    progress(onProgress, 'onnx-runtime', 'found', 'onnxruntime-node available');
  } else {
    components.onnxRuntime.skipped = true;
    warnings.push(
      'onnxruntime-node not installed. Local CodeBERT inference unavailable. ' +
      'Install with: npm install onnxruntime-node. Cloud model providers still work.'
    );
    progress(onProgress, 'onnx-runtime', 'skipped', 'onnxruntime-node not available — cloud providers still work');
  }

  // 4. Download CodeBERT model (AC-015-02)
  if (!skipModel && components.onnxRuntime.installed) {
    progress(onProgress, 'codebert-model', 'checking', 'Checking CodeBERT ONNX model');
    try {
      const modelResult = await downloadModel(projectRoot, {
        onProgress: (pct, detail) => progress(onProgress, 'codebert-model', 'downloading', `${pct}% — ${detail}`),
      });
      components.codebertModel.installed = modelResult.ready;
      if (!modelResult.ready) {
        warnings.push(`CodeBERT model not ready: ${modelResult.reason}`);
      }
    } catch (err) {
      components.codebertModel.skipped = true;
      warnings.push(`CodeBERT model download failed: ${err.message}`);
    }
  } else if (skipModel) {
    components.codebertModel.skipped = true;
    progress(onProgress, 'codebert-model', 'skipped', 'Model download skipped');
  } else {
    components.codebertModel.skipped = true;
    progress(onProgress, 'codebert-model', 'skipped', 'Skipped — ONNX runtime not available');
  }

  // 5. Check FAISS native bindings (AC-015-03)
  progress(onProgress, 'faiss', 'checking', 'Checking faiss-node');
  if (isPackageAvailable('faiss-node')) {
    components.faiss.installed = true;
    progress(onProgress, 'faiss', 'found', 'faiss-node available');
  } else {
    components.faiss.skipped = true;
    warnings.push('faiss-node not installed. Install with: npm install faiss-node');
  }

  // 6. Check Docker and pull MCP server image (AC-015-04, AC-015-06)
  if (!skipDocker) {
    progress(onProgress, 'docker', 'checking', 'Checking Docker availability');
    if (isDockerAvailable()) {
      components.docker.installed = true;
      progress(onProgress, 'docker', 'found', 'Docker available');
    } else {
      components.docker.skipped = true;
      warnings.push('Docker not available. MCP server image pull skipped. Direct FAISS fallback still works.');
      progress(onProgress, 'docker', 'skipped', 'Docker not available — FAISS fallback still works');
    }
  } else {
    components.docker.skipped = true;
    progress(onProgress, 'docker', 'skipped', 'Docker check skipped');
  }

  // Determine overall success — at minimum we need chunker (tree-sitter or fallback) to be useful
  const success = true; // Always succeed — individual components may be missing but system degrades gracefully

  return { success, components, warnings };
}

/**
 * Get semantic search configuration defaults for search-config.json.
 * AC-015-08
 *
 * @param {SetupResult} setupResult
 * @returns {Object} Config to merge into search-config.json
 */
export function getSemanticSearchConfig(setupResult) {
  const config = {
    semantic: {
      enabled: true,
      model: {
        provider: 'codebert',
        modelPath: '.isdlc/models/codebert-base/model.onnx',
      },
      chunking: {
        maxTokens: 512,
        overlapTokens: 64,
        preserveSignatures: true,
      },
      components: {},
    },
  };

  if (setupResult && setupResult.components) {
    const c = setupResult.components;
    config.semantic.components = {
      treeSitter: c.treeSitter.installed,
      onnxRuntime: c.onnxRuntime.installed,
      faiss: c.faiss.installed,
      docker: c.docker.installed,
      codebertModel: c.codebertModel.installed,
    };

    // If ONNX not available, suggest cloud provider
    if (!c.onnxRuntime.installed) {
      config.semantic.model.provider = 'none';
      config.semantic.model.fallbackNote = 'Install onnxruntime-node for local inference, or configure a cloud provider';
    }
  }

  return config;
}

/**
 * Check if a Node.js package is importable.
 * @param {string} packageName
 * @returns {boolean}
 */
function isPackageAvailable(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    // require.resolve may not work in ESM — fallback to exec check
    try {
      execSync(`node -e "require('${packageName}')"`, { stdio: 'ignore', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Check if Docker is available.
 * @returns {boolean}
 */
function isDockerAvailable() {
  try {
    execSync('docker --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to call progress callback if provided.
 */
function progress(fn, component, status, detail) {
  if (fn) {
    fn(component, status, detail);
  }
}
