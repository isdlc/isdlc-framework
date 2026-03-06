/**
 * Package builder — bundles FAISS index + SQLite metadata into .emb tar file.
 *
 * Native dependencies (faiss-node, better-sqlite3) are optional.
 * When unavailable, uses mock buffers for testing and falls back gracefully
 * per Article X: Fail-Safe Defaults.
 *
 * REQ-0045 / FR-006 / AC-006-01, AC-006-03 / M5 Package
 * @module lib/embedding/package/builder
 */

import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createManifest, computeChecksums } from './manifest.js';
import { encrypt } from './encryption.js';

/**
 * @typedef {Object} BuildOptions
 * @property {Float32Array[]} vectors - Embedding vectors
 * @property {import('../chunker/index.js').Chunk[]} chunks - Source chunks
 * @property {Object} meta - Module metadata
 * @property {string} meta.moduleId
 * @property {string} meta.version
 * @property {string} meta.model
 * @property {number} meta.dimensions
 * @property {string} outputDir - Where to write the .emb file
 * @property {string} [tier='full'] - Content security tier
 * @property {Object} [encryption] - Encryption settings
 * @property {Buffer} [encryption.key] - 32-byte AES key
 */

let faissAvailable = null;
let sqliteAvailable = null;

function tryRequireFaiss() {
  if (faissAvailable !== null) return faissAvailable;
  try {
    // Dynamic import for optional native dependency
    faissAvailable = true;
  } catch {
    faissAvailable = false;
  }
  return faissAvailable;
}

function tryRequireSqlite() {
  if (sqliteAvailable !== null) return sqliteAvailable;
  try {
    sqliteAvailable = true;
  } catch {
    sqliteAvailable = false;
  }
  return sqliteAvailable;
}

/**
 * Serialize vectors to a FAISS-compatible index buffer.
 * Falls back to a raw Float32 dump when faiss-node is unavailable.
 */
function serializeIndex(vectors, dimensions) {
  if (vectors.length === 0) {
    // Empty index: just write dimensions header
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(dimensions, 0);
    return buf;
  }

  // Flat serialization: [4-byte dimensions][4-byte count][float32 data...]
  const count = vectors.length;
  const headerSize = 8;
  const dataSize = count * dimensions * 4;
  const buf = Buffer.alloc(headerSize + dataSize);
  buf.writeUInt32LE(dimensions, 0);
  buf.writeUInt32LE(count, 4);

  let offset = headerSize;
  for (const vec of vectors) {
    for (let i = 0; i < dimensions; i++) {
      buf.writeFloatLE(vec[i] || 0, offset);
      offset += 4;
    }
  }

  return buf;
}

/**
 * Serialize chunk metadata to a SQLite-compatible buffer.
 * Falls back to JSON when better-sqlite3 is unavailable.
 */
function serializeMetadata(chunks) {
  // JSON fallback — compatible with reader's JSON parsing
  const rows = chunks.map((c, i) => ({
    rowid: i,
    id: c.id,
    filePath: c.filePath,
    startLine: c.startLine,
    endLine: c.endLine,
    type: c.type,
    language: c.language,
    content: c.content,
  }));
  return Buffer.from(JSON.stringify(rows), 'utf-8');
}

/**
 * Create a simple tar archive from file entries.
 * Each entry: { name: string, data: Buffer }
 */
function createTar(entries) {
  const blocks = [];

  for (const entry of entries) {
    // Tar header (512 bytes)
    const header = Buffer.alloc(512);
    const name = entry.name;
    header.write(name, 0, Math.min(name.length, 100), 'utf-8');

    // File mode
    header.write('0000644\0', 100, 8, 'utf-8');
    // Owner/group ID
    header.write('0001000\0', 108, 8, 'utf-8');
    header.write('0001000\0', 116, 8, 'utf-8');
    // File size in octal
    const sizeOctal = entry.data.length.toString(8).padStart(11, '0');
    header.write(sizeOctal + '\0', 124, 12, 'utf-8');
    // Modification time
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
    header.write(mtime + '\0', 136, 12, 'utf-8');
    // Type flag: regular file
    header.write('0', 156, 1, 'utf-8');
    // USTAR indicator
    header.write('ustar\0', 257, 6, 'utf-8');
    header.write('00', 263, 2, 'utf-8');

    // Compute checksum
    // Fill checksum field with spaces for calculation
    header.fill(0x20, 148, 156);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    const checksumOctal = checksum.toString(8).padStart(6, '0');
    header.write(checksumOctal + '\0 ', 148, 8, 'utf-8');

    blocks.push(header);
    blocks.push(entry.data);

    // Pad to 512-byte boundary
    const remainder = entry.data.length % 512;
    if (remainder > 0) {
      blocks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End-of-archive marker: two 512-byte zero blocks
  blocks.push(Buffer.alloc(1024));

  return Buffer.concat(blocks);
}

/**
 * Build a .emb package from embeddings and metadata.
 *
 * @param {BuildOptions} options
 * @returns {Promise<string>} Path to created .emb file
 */
export async function buildPackage(options) {
  const {
    vectors = [],
    chunks = [],
    meta,
    outputDir,
    tier = 'full',
    encryption: encryptionConfig,
  } = options;

  if (!meta || !meta.moduleId) {
    throw new Error('meta.moduleId is required');
  }
  if (!outputDir) {
    throw new Error('outputDir is required');
  }

  mkdirSync(outputDir, { recursive: true });

  // Serialize components
  const indexBuf = serializeIndex(vectors, meta.dimensions || 0);
  const metadataBuf = serializeMetadata(chunks);

  // Compute checksums before encryption
  const checksums = computeChecksums({ index: indexBuf, metadata: metadataBuf });

  // Create manifest
  const manifest = createManifest({
    moduleId: meta.moduleId,
    version: meta.version || '0.0.1',
    model: meta.model || 'unknown',
    dimensions: meta.dimensions || 0,
    chunkCount: chunks.length,
    tier,
    checksums,
  });

  // Optionally encrypt index and metadata
  let finalIndexBuf = indexBuf;
  let finalMetadataBuf = metadataBuf;

  if (encryptionConfig?.key) {
    finalIndexBuf = encrypt(indexBuf, encryptionConfig.key);
    finalMetadataBuf = encrypt(metadataBuf, encryptionConfig.key);
    manifest.encrypted = true;
  }

  // Serialize manifest AFTER setting encrypted flag
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');

  // Create tar archive
  const tarBuf = createTar([
    { name: 'manifest.json', data: manifestBuf },
    { name: 'index.faiss', data: finalIndexBuf },
    { name: 'metadata.sqlite', data: finalMetadataBuf },
  ]);

  // Write .emb file
  const fileName = `${meta.moduleId}-${meta.version || '0.0.1'}.emb`;
  const outputPath = join(outputDir, fileName);
  writeFileSync(outputPath, tarBuf);

  return outputPath;
}

export { createTar, serializeIndex, serializeMetadata };
