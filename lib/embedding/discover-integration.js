/**
 * Discovery-Triggered Embedding Generation — integrates embedding generation
 * with the /discover workflow.
 *
 * Supports three trigger modes:
 * - "before": Flat embedding of entire codebase before analysis
 * - "during": Runs in parallel with analysis agents
 * - "after": Uses discovered module boundaries for partitioned embeddings
 *
 * REQ-0045 / FR-016 / AC-016-01 through AC-016-08 / M2 Engine
 * @module lib/embedding/discover-integration
 */

const TRIGGER_MODES = ['before', 'during', 'after'];

/**
 * @typedef {Object} DiscoverEmbeddingOptions
 * @property {'before'|'during'|'after'|null} mode - Trigger timing
 * @property {string} projectRoot - Absolute path to project root
 * @property {Object} config - Embedding config (provider, dimensions, apiKey, etc.)
 * @property {Object[]} [modules] - Module boundaries (required for 'after' mode)
 * @property {function} [onProgress] - Progress callback: (message: string) => void
 * @property {function} [_chunkFn] - Internal: override chunk function for testing
 * @property {function} [_embedFn] - Internal: override embed function for testing
 * @property {function} [_listFilesFn] - Internal: override file listing for testing
 */

/**
 * @typedef {Object} EmbeddingResult
 * @property {string} mode - Trigger mode used
 * @property {boolean} partitioned - Whether embeddings are module-partitioned
 * @property {Object[]} packages - Array of { moduleId, chunks, vectors }
 * @property {Object} stats - { totalChunks, totalFiles, packageCount, timeTakenMs }
 * @property {boolean} [skipped] - True if user chose to skip
 */

/**
 * Generate embeddings as part of the discovery workflow.
 *
 * @param {DiscoverEmbeddingOptions} options
 * @returns {Promise<EmbeddingResult>}
 * @throws {Error} If mode is invalid or projectRoot is missing
 */
export async function generateDiscoverEmbeddings(options = {}) {
  const {
    mode,
    projectRoot,
    config = {},
    modules = [],
    onProgress,
    _chunkFn,
    _embedFn,
    _listFilesFn,
  } = options;

  // AC-016-05: User can choose to skip
  if (mode === null || mode === undefined) {
    return { skipped: true, mode: null, partitioned: false, packages: [], stats: {} };
  }

  if (!TRIGGER_MODES.includes(mode)) {
    throw new Error(`Invalid mode: '${mode}'. Must be one of: ${TRIGGER_MODES.join(', ')}`);
  }

  if (!projectRoot) {
    throw new Error('projectRoot is required');
  }

  const startTime = Date.now();
  const listFiles = _listFilesFn || defaultListFiles;
  const chunkFn = _chunkFn || defaultChunkFn;
  const embedFn = _embedFn || defaultEmbedFn;

  if (onProgress) onProgress(`Starting ${mode}-mode embedding generation...`);

  const files = await listFiles(projectRoot);
  if (onProgress) onProgress(`Found ${files.length} files to process`);

  switch (mode) {
    case 'before':
      return generateFlat(mode, files, chunkFn, embedFn, onProgress, startTime);

    case 'during':
      // During mode generates flat embeddings the same way as before
      // but is intended to be called concurrently with analysis agents
      return generateFlat(mode, files, chunkFn, embedFn, onProgress, startTime);

    case 'after':
      return generatePartitioned(files, modules, chunkFn, embedFn, onProgress, startTime);

    default:
      throw new Error(`Unhandled mode: ${mode}`);
  }
}

/**
 * Generate flat (non-partitioned) embeddings for all files.
 * @param {string} mode - Trigger mode ('before' or 'during')
 * @param {string[]} files
 * @param {function} chunkFn
 * @param {function} embedFn
 * @param {function|undefined} onProgress
 * @param {number} startTime
 * @returns {Promise<EmbeddingResult>}
 */
async function generateFlat(mode, files, chunkFn, embedFn, onProgress, startTime) {
  const allChunks = await chunkFn(files);
  if (onProgress) onProgress(`Chunked into ${allChunks.length} chunks`);

  const texts = allChunks.map(c => c.content);
  const vectors = await embedFn(texts);
  if (onProgress) onProgress(`Generated ${vectors.length} embeddings`);

  const timeTakenMs = Date.now() - startTime;

  return {
    mode,
    partitioned: false,
    packages: [{
      moduleId: 'flat-all',
      chunks: allChunks,
      vectors,
    }],
    stats: {
      totalChunks: allChunks.length,
      totalFiles: files.length,
      packageCount: 1,
      timeTakenMs,
    },
  };
}

/**
 * Generate module-partitioned embeddings.
 * @param {string[]} files
 * @param {Object[]} modules - Array of { moduleId, files }
 * @param {function} chunkFn
 * @param {function} embedFn
 * @param {function|undefined} onProgress
 * @param {number} startTime
 * @returns {Promise<EmbeddingResult>}
 */
async function generatePartitioned(files, modules, chunkFn, embedFn, onProgress, startTime) {
  const packages = [];
  let totalChunks = 0;

  for (const mod of modules) {
    const modFiles = files.filter(f => mod.files.includes(f));
    if (modFiles.length === 0) continue;

    const chunks = await chunkFn(modFiles);
    if (chunks.length === 0) continue;

    const texts = chunks.map(c => c.content);
    const vectors = await embedFn(texts);

    packages.push({
      moduleId: mod.moduleId,
      chunks,
      vectors,
    });

    totalChunks += chunks.length;
    if (onProgress) onProgress(`Module ${mod.moduleId}: ${chunks.length} chunks`);
  }

  const timeTakenMs = Date.now() - startTime;

  return {
    mode: 'after',
    partitioned: true,
    packages,
    stats: {
      totalChunks,
      totalFiles: files.length,
      packageCount: packages.length,
      timeTakenMs,
    },
  };
}

/**
 * Upgrade flat embeddings to module-partitioned without full re-generation.
 * Re-partitions existing chunks/vectors into per-module packages based on
 * file paths matching module boundaries.
 *
 * AC-016-06: "Before" can upgrade to module-partitioned without full re-gen
 *
 * @param {EmbeddingResult} flatResult - Result from before/during mode
 * @param {Object[]} modules - Array of { moduleId, files }
 * @param {Object} config - Embedding config
 * @returns {Promise<EmbeddingResult>}
 */
export async function upgradeToModulePartitioned(flatResult, modules, config = {}) {
  if (!flatResult || !flatResult.packages) {
    throw new Error('flatResult is required and must have packages array');
  }

  // Collect all chunks and vectors from flat packages
  const allChunks = [];
  const allVectors = [];
  for (const pkg of flatResult.packages) {
    for (let i = 0; i < pkg.chunks.length; i++) {
      allChunks.push(pkg.chunks[i]);
      allVectors.push(pkg.vectors[i]);
    }
  }

  // Partition into modules
  const packages = [];

  for (const mod of modules) {
    const moduleChunks = [];
    const moduleVectors = [];

    for (let i = 0; i < allChunks.length; i++) {
      const chunkFile = allChunks[i].filePath;
      if (mod.files.includes(chunkFile)) {
        moduleChunks.push(allChunks[i]);
        moduleVectors.push(allVectors[i]);
      }
    }

    if (moduleChunks.length > 0) {
      packages.push({
        moduleId: mod.moduleId,
        chunks: moduleChunks,
        vectors: moduleVectors,
      });
    }
  }

  return {
    mode: 'after',
    partitioned: true,
    packages,
    stats: {
      totalChunks: allChunks.length,
      totalFiles: new Set(allChunks.map(c => c.filePath)).size,
      packageCount: packages.length,
      timeTakenMs: 0,
    },
  };
}

/**
 * Compute embedding statistics for the discovery report.
 *
 * AC-016-08: Discovery report includes embedding stats
 *
 * @param {EmbeddingResult|null} result
 * @returns {{ totalChunks: number, totalFiles: number, packageCount: number, timeTakenMs: number }}
 */
export function getEmbeddingStats(result) {
  if (!result || !result.packages) {
    return { totalChunks: 0, totalFiles: 0, packageCount: 0, timeTakenMs: 0 };
  }

  let totalChunks = 0;
  for (const pkg of result.packages) {
    totalChunks += (pkg.chunks || []).length;
  }

  return {
    totalChunks,
    totalFiles: result.stats?.totalFiles || 0,
    packageCount: result.packages.length,
    timeTakenMs: result.stats?.timeTakenMs || 0,
  };
}

/**
 * Default file listing stub — in production, this would list project files.
 * @param {string} projectRoot
 * @returns {Promise<string[]>}
 */
async function defaultListFiles(projectRoot) {
  return [];
}

/**
 * Default chunking stub — in production, this would use the M1 chunker.
 * @param {string[]} files
 * @returns {Promise<Object[]>}
 */
async function defaultChunkFn(files) {
  return [];
}

/**
 * Default embedding stub — in production, this would use the M2 engine.
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]>}
 */
async function defaultEmbedFn(texts) {
  return texts.map(() => new Float32Array(768));
}

export { TRIGGER_MODES };
