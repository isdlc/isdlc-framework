/**
 * Tests for Aggregation Pipeline (FR-010, M9)
 *
 * REQ-0045 / FR-010 / AC-010-01 through AC-010-04
 * Assembles release bundles from multiple module packages with
 * cross-module compatibility validation and manifest generation.
 *
 * @module lib/embedding/aggregation/index.test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { aggregate, createReleaseManifest, validateAggregationInputs } from './index.js';
import { CompatibilityMatrix } from '../registry/compatibility.js';

// ── Helper: create minimal fake .emb file ────────────────────
function createFakeEmb(dir, moduleId, version) {
  const content = JSON.stringify({ moduleId, version, fake: true });
  const fileName = `${moduleId}-${version}.emb`;
  const filePath = join(dir, fileName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  const checksum = createHash('sha256').update(content).digest('hex');
  return { filePath, checksum, moduleId, version };
}

// ── Helper: create mock registry that resolves module info ───
function createMockRegistry(modules = []) {
  return {
    getModule(id) {
      return modules.find(m => m.id === id) || null;
    },
    listModules() {
      return [...modules];
    },
  };
}

// ==============================================================
describe('M9: Aggregation Pipeline (FR-010)', () => {
  let tempDir;
  let packagesDir;
  let outputDir;

  before(() => {
    tempDir = createTempDir();
    packagesDir = join(tempDir, 'packages');
    outputDir = join(tempDir, 'output');
    mkdirSync(packagesDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── AC-010-01: Collect module packages into release bundle ─
  describe('AC-010-01: Release bundle assembly', () => {
    it('aggregate() collects specified modules into a bundle', async () => {
      const pkgA = createFakeEmb(packagesDir, 'mod-auth', '2.1.0');
      const pkgB = createFakeEmb(packagesDir, 'mod-orders', '1.5.0');

      const result = await aggregate({
        modules: [
          { moduleId: 'mod-auth', version: '2.1.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
          { moduleId: 'mod-orders', version: '1.5.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
        ],
        releaseVersion: '1.0.0',
        outputDir,
      });

      assert.ok(result.bundlePath);
      assert.ok(existsSync(result.bundlePath));
      assert.ok(result.manifest);
    });

    it('aggregate() creates bundle file with correct naming', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'naming'), 'mod-a', '1.0.0');

      const namingOutput = join(outputDir, 'naming');
      const result = await aggregate({
        modules: [
          { moduleId: 'mod-a', version: '1.0.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
        ],
        releaseVersion: '2.0.0',
        outputDir: namingOutput,
      });

      assert.ok(result.bundlePath.includes('release-2.0.0'));
    });

    it('aggregate() with empty modules produces error', async () => {
      await assert.rejects(
        aggregate({
          modules: [],
          releaseVersion: '1.0.0',
          outputDir,
        }),
        (err) => {
          assert.ok(err.message.toLowerCase().includes('at least one module'));
          return true;
        }
      );
    });

    it('aggregate() requires releaseVersion', async () => {
      const pkg = createFakeEmb(join(packagesDir, 'no-ver'), 'mod-a', '1.0.0');
      await assert.rejects(
        aggregate({
          modules: [{ moduleId: 'mod-a', version: '1.0.0', packagePath: pkg.filePath, checksum: pkg.checksum }],
          outputDir,
        }),
        (err) => { assert.ok(err.message.includes('releaseVersion is required')); return true; }
      );
    });

    it('aggregate() requires outputDir', async () => {
      const pkg = createFakeEmb(join(packagesDir, 'no-out'), 'mod-a', '1.0.0');
      await assert.rejects(
        aggregate({
          modules: [{ moduleId: 'mod-a', version: '1.0.0', packagePath: pkg.filePath, checksum: pkg.checksum }],
          releaseVersion: '1.0.0',
        }),
        (err) => { assert.ok(err.message.includes('outputDir is required')); return true; }
      );
    });
  });

  // ── AC-010-02: Cross-module compatibility validated ────────
  describe('AC-010-02: Cross-module compatibility validation', () => {
    it('aggregate() succeeds when all modules are compatible', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'compat-ok-a'), 'mod-auth', '2.1.0');
      const pkgB = createFakeEmb(join(packagesDir, 'compat-ok-b'), 'mod-orders', '1.5.0');

      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);

      const compatOutput = join(outputDir, 'compat-ok');
      const result = await aggregate({
        modules: [
          { moduleId: 'mod-auth', version: '2.1.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
          { moduleId: 'mod-orders', version: '1.5.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
        ],
        releaseVersion: '1.0.0',
        outputDir: compatOutput,
        compatibilityMatrix: matrix,
      });

      assert.ok(result.bundlePath);
      assert.equal(result.warnings.length, 0);
    });

    it('aggregate() fails when modules are incompatible', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'compat-bad-a'), 'mod-auth', '2.1.0');
      const pkgB = createFakeEmb(join(packagesDir, 'compat-bad-b'), 'mod-orders', '5.0.0');

      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);

      await assert.rejects(
        aggregate({
          modules: [
            { moduleId: 'mod-auth', version: '2.1.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
            { moduleId: 'mod-orders', version: '5.0.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
          ],
          releaseVersion: '1.0.0',
          outputDir: join(outputDir, 'compat-bad'),
          compatibilityMatrix: matrix,
        }),
        (err) => { assert.ok(err.message.toLowerCase().includes('incompatible')); return true; }
      );
    });

    it('aggregate() skips compatibility check when no matrix provided', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'no-matrix-a'), 'mod-x', '1.0.0');
      const pkgB = createFakeEmb(join(packagesDir, 'no-matrix-b'), 'mod-y', '99.0.0');

      const noMatrixOutput = join(outputDir, 'no-matrix');
      const result = await aggregate({
        modules: [
          { moduleId: 'mod-x', version: '1.0.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
          { moduleId: 'mod-y', version: '99.0.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
        ],
        releaseVersion: '1.0.0',
        outputDir: noMatrixOutput,
      });

      assert.ok(result.bundlePath);
    });
  });

  // ── AC-010-03: Release manifest ────────────────────────────
  describe('AC-010-03: Release manifest', () => {
    it('manifest lists all included modules with versions and checksums', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'manifest-a'), 'mod-auth', '2.1.0');
      const pkgB = createFakeEmb(join(packagesDir, 'manifest-b'), 'mod-orders', '1.5.0');

      const manifestOutput = join(outputDir, 'manifest');
      const result = await aggregate({
        modules: [
          { moduleId: 'mod-auth', version: '2.1.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
          { moduleId: 'mod-orders', version: '1.5.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
        ],
        releaseVersion: '3.0.0',
        outputDir: manifestOutput,
      });

      const manifest = result.manifest;
      assert.equal(manifest.releaseVersion, '3.0.0');
      assert.equal(manifest.modules.length, 2);

      const modAuth = manifest.modules.find(m => m.moduleId === 'mod-auth');
      assert.ok(modAuth);
      assert.equal(modAuth.version, '2.1.0');
      assert.ok(modAuth.checksum);

      const modOrders = manifest.modules.find(m => m.moduleId === 'mod-orders');
      assert.ok(modOrders);
      assert.equal(modOrders.version, '1.5.0');
      assert.ok(modOrders.checksum);
    });

    it('manifest includes createdAt timestamp', async () => {
      const pkg = createFakeEmb(join(packagesDir, 'timestamp'), 'mod-ts', '1.0.0');

      const tsOutput = join(outputDir, 'timestamp');
      const result = await aggregate({
        modules: [
          { moduleId: 'mod-ts', version: '1.0.0', packagePath: pkg.filePath, checksum: pkg.checksum },
        ],
        releaseVersion: '1.0.0',
        outputDir: tsOutput,
      });

      assert.ok(result.manifest.createdAt);
      // Validate it's a parseable ISO date
      assert.ok(!isNaN(Date.parse(result.manifest.createdAt)));
    });

    it('createReleaseManifest() produces valid manifest structure', () => {
      const manifest = createReleaseManifest({
        releaseVersion: '1.0.0',
        modules: [
          { moduleId: 'mod-a', version: '1.0.0', checksum: 'abc123' },
        ],
      });

      assert.equal(manifest.releaseVersion, '1.0.0');
      assert.ok(manifest.createdAt);
      assert.equal(manifest.modules.length, 1);
      assert.equal(manifest.modules[0].moduleId, 'mod-a');
    });

    it('manifest is saved alongside bundle', async () => {
      const pkg = createFakeEmb(join(packagesDir, 'saved-manifest'), 'mod-sm', '1.0.0');

      const smOutput = join(outputDir, 'saved-manifest');
      const result = await aggregate({
        modules: [
          { moduleId: 'mod-sm', version: '1.0.0', packagePath: pkg.filePath, checksum: pkg.checksum },
        ],
        releaseVersion: '1.0.0',
        outputDir: smOutput,
      });

      // Manifest file should exist alongside bundle
      const manifestPath = result.bundlePath.replace(/\.tar$/, '-manifest.json');
      assert.ok(existsSync(manifestPath), `Manifest file should exist at ${manifestPath}`);

      const saved = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      assert.equal(saved.releaseVersion, '1.0.0');
    });
  });

  // ── AC-010-04: Failed aggregation blocks release ───────────
  describe('AC-010-04: Failed aggregation blocks release', () => {
    it('incompatible versions produce clear error', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'block-a'), 'mod-auth', '2.1.0');
      const pkgB = createFakeEmb(join(packagesDir, 'block-b'), 'mod-orders', '5.0.0');

      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);

      try {
        await aggregate({
          modules: [
            { moduleId: 'mod-auth', version: '2.1.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
            { moduleId: 'mod-orders', version: '5.0.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
          ],
          releaseVersion: '1.0.0',
          outputDir: join(outputDir, 'block'),
          compatibilityMatrix: matrix,
        });
        assert.fail('Should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('mod-auth') || err.message.includes('mod-orders'));
        assert.ok(err.message.toLowerCase().includes('incompatible'));
      }
    });

    it('no bundle file created when aggregation fails', async () => {
      const pkgA = createFakeEmb(join(packagesDir, 'no-bundle-a'), 'mod-auth', '2.1.0');
      const pkgB = createFakeEmb(join(packagesDir, 'no-bundle-b'), 'mod-orders', '5.0.0');

      const matrix = new CompatibilityMatrix([
        { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } },
      ]);

      const failDir = join(outputDir, 'no-bundle');
      try {
        await aggregate({
          modules: [
            { moduleId: 'mod-auth', version: '2.1.0', packagePath: pkgA.filePath, checksum: pkgA.checksum },
            { moduleId: 'mod-orders', version: '5.0.0', packagePath: pkgB.filePath, checksum: pkgB.checksum },
          ],
          releaseVersion: '1.0.0',
          outputDir: failDir,
          compatibilityMatrix: matrix,
        });
      } catch {
        // Expected
      }

      // No release bundle should exist
      const bundlePath = join(failDir, 'release-1.0.0.tar');
      assert.ok(!existsSync(bundlePath), 'Bundle should not be created on failure');
    });

    it('missing package file produces clear error', async () => {
      await assert.rejects(
        aggregate({
          modules: [
            { moduleId: 'mod-missing', version: '1.0.0', packagePath: '/nonexistent/mod-missing-1.0.0.emb', checksum: 'abc' },
          ],
          releaseVersion: '1.0.0',
          outputDir: join(outputDir, 'missing-pkg'),
        }),
        (err) => { assert.ok(err.message.includes('not found')); return true; }
      );
    });

    it('checksum mismatch in source package produces error', async () => {
      const pkg = createFakeEmb(join(packagesDir, 'bad-cksum'), 'mod-ck', '1.0.0');

      await assert.rejects(
        aggregate({
          modules: [
            { moduleId: 'mod-ck', version: '1.0.0', packagePath: pkg.filePath, checksum: 'wrong-checksum-value' },
          ],
          releaseVersion: '1.0.0',
          outputDir: join(outputDir, 'bad-cksum'),
        }),
        (err) => { assert.ok(err.message.includes('checksum mismatch')); return true; }
      );
    });
  });

  // ── Validation helper ──────────────────────────────────────
  describe('validateAggregationInputs()', () => {
    it('returns valid for correct inputs', () => {
      const result = validateAggregationInputs({
        modules: [{ moduleId: 'mod-a', version: '1.0.0', packagePath: '/tmp/a.emb', checksum: 'abc' }],
        releaseVersion: '1.0.0',
        outputDir: '/tmp/out',
      });
      assert.equal(result.valid, true);
    });

    it('returns errors for missing fields', () => {
      const result = validateAggregationInputs({});
      assert.equal(result.valid, false);
      assert.ok(result.errors.length > 0);
    });

    it('returns error for module missing moduleId', () => {
      const result = validateAggregationInputs({
        modules: [{ version: '1.0.0', packagePath: '/tmp/a.emb', checksum: 'abc' }],
        releaseVersion: '1.0.0',
        outputDir: '/tmp/out',
      });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some(e => e.includes('moduleId')));
    });
  });
});
