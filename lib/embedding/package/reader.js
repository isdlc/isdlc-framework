/**
 * Package reader — extract and load .emb packages.
 *
 * REQ-0045 / FR-006 / AC-006-04 / M5 Package
 * @module lib/embedding/package/reader
 */

import { readFileSync, existsSync } from 'node:fs';
import { validateManifest } from './manifest.js';
import { decrypt } from './encryption.js';

/**
 * @typedef {Object} LoadedPackage
 * @property {Object} manifest - Parsed manifest.json
 * @property {Buffer} index - FAISS index buffer (or decrypted buffer)
 * @property {Object[]} db - Parsed metadata rows
 */

/**
 * @typedef {Object} ReadOptions
 * @property {Buffer} [decryptionKey] - 32-byte AES key for encrypted packages
 */

/**
 * Parse a simple tar archive and extract entries.
 * Returns an array of { name, data } objects.
 */
function parseTar(tarBuf) {
  const entries = [];
  let offset = 0;

  while (offset < tarBuf.length - 512) {
    const header = tarBuf.subarray(offset, offset + 512);

    // Check for end-of-archive (all zeros)
    if (header.every(b => b === 0)) break;

    // Extract name (first 100 bytes, null-terminated)
    let nameEnd = 0;
    while (nameEnd < 100 && header[nameEnd] !== 0) nameEnd++;
    const name = header.subarray(0, nameEnd).toString('utf-8');

    // Extract size (bytes 124-135, octal)
    const sizeStr = header.subarray(124, 135).toString('utf-8').trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512;

    // Extract file data
    const data = tarBuf.subarray(offset, offset + size);
    entries.push({ name, data: Buffer.from(data) });

    // Advance past data + padding
    offset += size;
    const remainder = size % 512;
    if (remainder > 0) offset += 512 - remainder;
  }

  return entries;
}

/**
 * Read and load a .emb package.
 *
 * @param {string} packagePath - Path to .emb file
 * @param {ReadOptions} [options]
 * @returns {Promise<LoadedPackage>}
 * @throws {Error} If file doesn't exist, is corrupt, or decryption fails
 */
export async function readPackage(packagePath, options = {}) {
  if (!packagePath || typeof packagePath !== 'string') {
    throw new Error('packagePath must be a non-empty string');
  }

  if (!existsSync(packagePath)) {
    throw new Error(`Package file not found: ${packagePath}`);
  }

  let tarBuf;
  try {
    tarBuf = readFileSync(packagePath);
  } catch (err) {
    throw new Error(`Failed to read package file: ${err.message}`);
  }

  // Parse tar archive
  let entries;
  try {
    entries = parseTar(tarBuf);
  } catch (err) {
    throw new Error(`Package is not a valid tar archive: ${err.message}`);
  }

  if (entries.length === 0) {
    throw new Error('Package is empty or not a valid tar archive');
  }

  // Find required entries
  const manifestEntry = entries.find(e => e.name === 'manifest.json');
  const indexEntry = entries.find(e => e.name === 'index.faiss');
  const metadataEntry = entries.find(e => e.name === 'metadata.sqlite');

  if (!manifestEntry) throw new Error('Package missing manifest.json');

  // Parse and validate manifest
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.data.toString('utf-8'));
  } catch {
    throw new Error('Package manifest.json is not valid JSON');
  }

  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
  }

  // Decrypt if needed
  let indexBuf = indexEntry ? indexEntry.data : Buffer.alloc(0);
  let metadataBuf = metadataEntry ? metadataEntry.data : Buffer.alloc(0);

  if (manifest.encrypted || options.decryptionKey) {
    if (!options.decryptionKey) {
      throw new Error('Package is encrypted but no decryption key provided');
    }
    indexBuf = decrypt(indexBuf, options.decryptionKey);
    metadataBuf = decrypt(metadataBuf, options.decryptionKey);
  }

  // Parse metadata
  let db;
  try {
    db = JSON.parse(metadataBuf.toString('utf-8'));
  } catch {
    db = [];
  }

  return {
    manifest,
    index: indexBuf,
    db,
  };
}

export { parseTar };
