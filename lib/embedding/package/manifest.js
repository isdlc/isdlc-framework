/**
 * Manifest schema, validation, and checksums for .emb packages.
 *
 * REQ-0045 / FR-006 / AC-006-02 / M5 Package
 * @module lib/embedding/package/manifest
 */

import { createHash } from 'node:crypto';

const REQUIRED_FIELDS = [
  'moduleId', 'version', 'model', 'dimensions',
  'chunkCount', 'tier', 'createdAt', 'checksums',
];

/**
 * Create a manifest object from build metadata.
 *
 * @param {Object} meta
 * @param {string} meta.moduleId
 * @param {string} meta.version
 * @param {string} meta.model
 * @param {number} meta.dimensions
 * @param {number} meta.chunkCount
 * @param {string} [meta.tier='full']
 * @param {Object} meta.checksums - { index: string, metadata: string }
 * @returns {Object} Manifest object
 */
export function createManifest(meta) {
  const manifest = {
    moduleId: meta.moduleId,
    version: meta.version,
    model: meta.model,
    dimensions: meta.dimensions,
    chunkCount: meta.chunkCount,
    tier: meta.tier || 'full',
    createdAt: new Date().toISOString(),
    checksums: meta.checksums,
  };
  // Include model_id for stale-embedding detection (FR-006 / AC-006-01)
  if (meta.model_id) {
    manifest.model_id = meta.model_id;
  }
  // Include generatedAtCommit for VCS staleness detection (REQ-GH-244 FR-003 / AC-003-06)
  if (meta.generatedAtCommit) {
    manifest.generatedAtCommit = meta.generatedAtCommit;
  }
  return manifest;
}

/**
 * Validate a manifest object has all required fields and correct types.
 *
 * @param {Object} manifest
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateManifest(manifest) {
  const errors = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof manifest.dimensions === 'number' && manifest.dimensions <= 0) {
    errors.push('dimensions must be a positive number');
  }

  if (typeof manifest.chunkCount === 'number' && manifest.chunkCount < 0) {
    errors.push('chunkCount must be non-negative');
  }

  if (manifest.checksums && typeof manifest.checksums === 'object') {
    if (!manifest.checksums.index) errors.push('checksums.index is required');
    if (!manifest.checksums.metadata) errors.push('checksums.metadata is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute SHA-256 checksums for buffers.
 *
 * @param {Object} buffers - { index: Buffer, metadata: Buffer }
 * @returns {Object} - { index: string, metadata: string }
 */
export function computeChecksums(buffers) {
  return {
    index: createHash('sha256').update(buffers.index).digest('hex'),
    metadata: createHash('sha256').update(buffers.metadata).digest('hex'),
  };
}

// ===========================================================================
// REQ-GH-227 / FR-007: HNSW + file_hashes manifest extensions
// ===========================================================================

/**
 * Default HNSW parameters mirrored from lib/embedding/hnsw/index.js.
 * Inlined here to avoid cross-module import at this layer.
 */
const DEFAULT_HNSW_PARAMS_MANIFEST = Object.freeze({
  M: 16,
  efConstruction: 200,
  efSearch: 50
});

/**
 * Create a manifest with HNSW + filesystem-hash fields.
 *
 * @param {Object} baseManifest - Existing manifest (from createManifest)
 * @param {Object} opts
 * @param {Object} opts.fileHashes - { relativePath: sha256Hex }
 * @param {Object} [opts.hnswParams] - { M, efConstruction, efSearch }
 * @param {boolean} [opts.hnswIndexPresent=true]
 * @param {string} [opts.hashAlgorithm='sha256']
 * @returns {Object} Extended manifest
 */
export function createManifestWithHnsw(baseManifest, opts = {}) {
  return {
    ...baseManifest,
    hnsw_index_present: opts.hnswIndexPresent !== false,
    hnsw_params: opts.hnswParams || DEFAULT_HNSW_PARAMS_MANIFEST,
    hash_algorithm: opts.hashAlgorithm || 'sha256',
    file_hashes: opts.fileHashes || {}
  };
}
