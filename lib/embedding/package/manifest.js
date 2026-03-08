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
  return {
    moduleId: meta.moduleId,
    version: meta.version,
    model: meta.model,
    dimensions: meta.dimensions,
    chunkCount: meta.chunkCount,
    tier: meta.tier || 'full',
    createdAt: new Date().toISOString(),
    checksums: meta.checksums,
  };
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
