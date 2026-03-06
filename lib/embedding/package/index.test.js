/**
 * Tests for Package Builder/Reader (FR-006, M5)
 *
 * REQ-0045 / FR-006 / M5 Package
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { createManifest, validateManifest, computeChecksums } from './manifest.js';
import { encrypt, decrypt } from './encryption.js';
import { buildPackage } from './builder.js';
import { readPackage } from './reader.js';

// ── Test data ─────────────────────────────────────────────────
function sampleChunks(n = 3) {
  return Array.from({ length: n }, (_, i) => ({
    id: `chunk-${i}`,
    content: `function example${i}() { return ${i}; }`,
    filePath: `src/example${i}.js`,
    startLine: i * 10 + 1,
    endLine: i * 10 + 5,
    type: 'function',
    language: 'javascript',
    tokenCount: 20,
    signatures: [],
  }));
}

function sampleVectors(n = 3, dims = 4) {
  return Array.from({ length: n }, () => {
    const v = new Float32Array(dims);
    for (let j = 0; j < dims; j++) v[j] = Math.random();
    return v;
  });
}

const sampleMeta = {
  moduleId: 'test-mod',
  version: '1.0.0',
  model: 'codebert',
  dimensions: 4,
};

// ══════════════════════════════════════════════════════════════
describe('M5: Package Builder/Reader', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── manifest.js ─────────────────────────────────────────────
  describe('createManifest()', () => {
    it('includes all required fields (AC-006-02)', () => {
      const checksums = { index: 'abc123', metadata: 'def456' };
      const manifest = createManifest({
        moduleId: 'mod-a',
        version: '1.0.0',
        model: 'codebert',
        dimensions: 768,
        chunkCount: 42,
        tier: 'full',
        checksums,
      });

      assert.equal(manifest.moduleId, 'mod-a');
      assert.equal(manifest.version, '1.0.0');
      assert.equal(manifest.model, 'codebert');
      assert.equal(manifest.dimensions, 768);
      assert.equal(manifest.chunkCount, 42);
      assert.equal(manifest.tier, 'full');
      assert.ok(manifest.createdAt);
      assert.deepEqual(manifest.checksums, checksums);
    });
  });

  describe('validateManifest()', () => {
    it('rejects manifest missing required fields (AC-006-02)', () => {
      const result = validateManifest({ moduleId: 'a' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('accepts a well-formed manifest (AC-006-02)', () => {
      const manifest = createManifest({
        moduleId: 'mod-a',
        version: '1.0.0',
        model: 'codebert',
        dimensions: 768,
        chunkCount: 10,
        checksums: { index: 'aaa', metadata: 'bbb' },
      });
      const result = validateManifest(manifest);
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });
  });

  describe('computeChecksums()', () => {
    it('returns deterministic SHA-256 hashes (AC-006-02)', () => {
      const data = { index: Buffer.from('hello'), metadata: Buffer.from('world') };
      const c1 = computeChecksums(data);
      const c2 = computeChecksums(data);
      assert.equal(c1.index, c2.index);
      assert.equal(c1.metadata, c2.metadata);
      assert.match(c1.index, /^[a-f0-9]{64}$/);
      assert.match(c1.metadata, /^[a-f0-9]{64}$/);
    });
  });

  // ── encryption.js ───────────────────────────────────────────
  describe('encrypt() + decrypt()', () => {
    const key = randomBytes(32);

    it('roundtrip preserves data (AC-006-03)', () => {
      const plaintext = Buffer.from('Hello, World! This is a test of AES-256-GCM.');
      const encrypted = encrypt(plaintext, key);
      const decrypted = decrypt(encrypted, key);
      assert.deepEqual(decrypted, plaintext);
    });

    it('wrong key throws clear error (AC-006-03)', () => {
      const plaintext = Buffer.from('secret data');
      const encrypted = encrypt(plaintext, key);
      const wrongKey = randomBytes(32);
      assert.throws(
        () => decrypt(encrypted, wrongKey),
        { message: /Decryption failed/ }
      );
    });

    it('produces different ciphertext for same plaintext (random IV) (AC-006-03)', () => {
      const plaintext = Buffer.from('identical input');
      const e1 = encrypt(plaintext, key);
      const e2 = encrypt(plaintext, key);
      assert.notDeepEqual(e1, e2);
    });
  });

  // ── builder.js ──────────────────────────────────────────────
  describe('buildPackage()', () => {
    it('creates a .emb tar file at outputDir (AC-006-03)', async () => {
      const outputDir = join(tempDir, 'build-test-1');
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks: sampleChunks(),
        meta: sampleMeta,
        outputDir,
      });
      assert.ok(existsSync(path));
      assert.ok(path.endsWith('.emb'));
    });

    it('built package contains index.faiss, metadata.sqlite, manifest.json (AC-006-01)', async () => {
      const outputDir = join(tempDir, 'build-test-2');
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks: sampleChunks(),
        meta: sampleMeta,
        outputDir,
      });

      // Read and parse tar to verify contents
      const loaded = await readPackage(path);
      assert.ok(loaded.manifest);
      assert.ok(loaded.index);
      assert.ok(loaded.db);
    });

    it('built package manifest matches input metadata (AC-006-02)', async () => {
      const outputDir = join(tempDir, 'build-test-3');
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks: sampleChunks(),
        meta: sampleMeta,
        outputDir,
      });

      const loaded = await readPackage(path);
      assert.equal(loaded.manifest.moduleId, sampleMeta.moduleId);
      assert.equal(loaded.manifest.version, sampleMeta.version);
      assert.equal(loaded.manifest.model, sampleMeta.model);
      assert.equal(loaded.manifest.dimensions, sampleMeta.dimensions);
      assert.equal(loaded.manifest.chunkCount, 3);
    });

    it('with encryption option produces encrypted package (AC-006-03)', async () => {
      const outputDir = join(tempDir, 'build-test-enc');
      const key = randomBytes(32);
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks: sampleChunks(),
        meta: sampleMeta,
        outputDir,
        encryption: { key },
      });

      // Reading without key should fail
      await assert.rejects(
        () => readPackage(path),
        (err) => err.message.includes('encrypted') || err.message.includes('Decryption') || err.message.includes('JSON')
      );

      // Reading with key should succeed
      const loaded = await readPackage(path, { decryptionKey: key });
      assert.ok(loaded.manifest);
      assert.equal(loaded.db.length, 3);
    });

    it('with empty chunks array produces valid package (AC-006-01)', async () => {
      const outputDir = join(tempDir, 'build-test-empty');
      const path = await buildPackage({
        vectors: [],
        chunks: [],
        meta: sampleMeta,
        outputDir,
      });

      const loaded = await readPackage(path);
      assert.equal(loaded.manifest.chunkCount, 0);
      assert.equal(loaded.db.length, 0);
    });
  });

  // ── reader.js ───────────────────────────────────────────────
  describe('readPackage()', () => {
    it('loads a package built by buildPackage() (AC-006-04)', async () => {
      const outputDir = join(tempDir, 'read-test-1');
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks: sampleChunks(),
        meta: sampleMeta,
        outputDir,
      });

      const loaded = await readPackage(path);
      assert.ok(loaded);
      assert.ok(loaded.manifest);
    });

    it('loaded package exposes manifest, index handle, and db handle (AC-006-04)', async () => {
      const outputDir = join(tempDir, 'read-test-2');
      const chunks = sampleChunks(5);
      const path = await buildPackage({
        vectors: sampleVectors(5),
        chunks,
        meta: sampleMeta,
        outputDir,
      });

      const loaded = await readPackage(path);
      assert.equal(typeof loaded.manifest, 'object');
      assert.ok(Buffer.isBuffer(loaded.index));
      assert.ok(Array.isArray(loaded.db));
      assert.equal(loaded.db.length, 5);
    });

    it('on non-existent file throws with clear message (AC-006-04)', async () => {
      await assert.rejects(
        () => readPackage('/nonexistent/path/file.emb'),
        { message: /not found/ }
      );
    });

    it('on corrupt/non-tar file throws with clear message (AC-006-04)', async () => {
      const corruptPath = join(tempDir, 'corrupt.emb');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(corruptPath, 'this is not a tar file');

      await assert.rejects(
        () => readPackage(corruptPath),
        (err) => err.message.includes('empty') || err.message.includes('missing') || err.message.includes('tar')
      );
    });

    it('with decryption key decrypts encrypted package (AC-006-03)', async () => {
      const outputDir = join(tempDir, 'read-test-enc');
      const key = randomBytes(32);
      const chunks = sampleChunks();
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks,
        meta: sampleMeta,
        outputDir,
        encryption: { key },
      });

      const loaded = await readPackage(path, { decryptionKey: key });
      assert.equal(loaded.db.length, chunks.length);
      assert.equal(loaded.db[0].id, chunks[0].id);
    });

    it('manifest alone determines compatibility (self-describing) (AC-006-04)', async () => {
      const outputDir = join(tempDir, 'read-test-self');
      const path = await buildPackage({
        vectors: sampleVectors(),
        chunks: sampleChunks(),
        meta: { ...sampleMeta, moduleId: 'self-desc', version: '2.0.0' },
        outputDir,
      });

      const loaded = await readPackage(path);
      assert.equal(loaded.manifest.moduleId, 'self-desc');
      assert.equal(loaded.manifest.version, '2.0.0');
      assert.equal(loaded.manifest.model, 'codebert');
      assert.equal(loaded.manifest.dimensions, 4);
      assert.ok(loaded.manifest.checksums);
      assert.ok(loaded.manifest.createdAt);
    });
  });

  // ── Integration ─────────────────────────────────────────────
  describe('Integration', () => {
    it('build → read roundtrip: chunks + vectors → .emb → loaded data matches (AC-006-01, AC-006-04)', async () => {
      const outputDir = join(tempDir, 'roundtrip-1');
      const chunks = sampleChunks(5);
      const vectors = sampleVectors(5);

      const path = await buildPackage({
        vectors,
        chunks,
        meta: sampleMeta,
        outputDir,
      });

      const loaded = await readPackage(path);

      assert.equal(loaded.manifest.moduleId, sampleMeta.moduleId);
      assert.equal(loaded.manifest.chunkCount, 5);
      assert.equal(loaded.db.length, 5);
      assert.equal(loaded.db[0].filePath, chunks[0].filePath);
      assert.equal(loaded.db[4].content, chunks[4].content);
    });

    it('build with encryption → read with key → data matches (AC-006-03)', async () => {
      const outputDir = join(tempDir, 'roundtrip-enc');
      const key = randomBytes(32);
      const chunks = sampleChunks(3);

      const path = await buildPackage({
        vectors: sampleVectors(3),
        chunks,
        meta: sampleMeta,
        outputDir,
        encryption: { key },
      });

      const loaded = await readPackage(path, { decryptionKey: key });
      assert.equal(loaded.db.length, 3);
      assert.equal(loaded.db[0].id, chunks[0].id);
      assert.equal(loaded.db[2].content, chunks[2].content);
    });
  });
});
