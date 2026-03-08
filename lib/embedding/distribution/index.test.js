/**
 * Tests for Distribution Adapters (FR-007, M8)
 *
 * REQ-0045 / FR-007 / AC-007-01 through AC-007-04
 * Transport adapters for Artifactory, Nexus, S3, SFTP with update
 * checking, checksum validation, and rollback capability.
 *
 * All external services are mocked in-process -- no real HTTP/network calls.
 *
 * @module lib/embedding/distribution/index.test
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import {
  createTransport,
  TRANSPORT_TYPES,
  createUpdateChecker,
} from './index.js';

// ── Mock HTTP client factory ─────────────────────────────────
function createMockHttpClient(responses = {}) {
  const calls = [];

  async function request(method, url, options = {}) {
    calls.push({ method, url, options });
    const key = `${method} ${url}`;
    if (responses[key]) {
      const resp = responses[key];
      if (resp.error) throw new Error(resp.error);
      return resp;
    }
    // Default: 404
    return { status: 404, body: null, headers: {} };
  }

  return { request, calls };
}

// ── Helper: create a fake .emb file with known checksum ──────
function createFakePackage(dir, name, content = 'fake-package-data') {
  const filePath = join(dir, name);
  writeFileSync(filePath, content, 'utf-8');
  const checksum = createHash('sha256').update(content).digest('hex');
  return { filePath, checksum, content };
}

// ==============================================================
describe('M8: Distribution Adapters (FR-007)', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── AC-007-01: Transport adapters ──────────────────────────
  describe('AC-007-01: Transport adapter factory', () => {
    it('TRANSPORT_TYPES lists all four adapter types', () => {
      assert.ok(TRANSPORT_TYPES.includes('artifactory'));
      assert.ok(TRANSPORT_TYPES.includes('nexus'));
      assert.ok(TRANSPORT_TYPES.includes('s3'));
      assert.ok(TRANSPORT_TYPES.includes('sftp'));
    });

    it('creates Artifactory transport', () => {
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/artifactory',
        httpClient: createMockHttpClient(),
      });
      assert.ok(transport);
      assert.equal(typeof transport.publish, 'function');
      assert.equal(typeof transport.fetch, 'function');
      assert.equal(typeof transport.listVersions, 'function');
    });

    it('creates Nexus transport', () => {
      const transport = createTransport({
        type: 'nexus',
        url: 'https://nexus.example.com/repository',
        httpClient: createMockHttpClient(),
      });
      assert.ok(transport);
      assert.equal(typeof transport.publish, 'function');
    });

    it('creates S3 transport', () => {
      const transport = createTransport({
        type: 's3',
        url: 's3://my-bucket/embeddings',
        httpClient: createMockHttpClient(),
      });
      assert.ok(transport);
      assert.equal(typeof transport.publish, 'function');
    });

    it('creates SFTP transport', () => {
      const transport = createTransport({
        type: 'sftp',
        url: 'sftp://host.example.com/packages',
        httpClient: createMockHttpClient(),
      });
      assert.ok(transport);
      assert.equal(typeof transport.publish, 'function');
    });

    it('throws for unknown transport type', () => {
      assert.throws(
        () => createTransport({ type: 'ftp', url: 'ftp://foo' }),
        { message: /Unknown transport type: ftp/ }
      );
    });

    it('throws when type is missing', () => {
      assert.throws(
        () => createTransport({ url: 'https://example.com' }),
        { message: /transport type is required/ }
      );
    });

    it('throws when url is missing', () => {
      assert.throws(
        () => createTransport({ type: 'artifactory' }),
        { message: /url is required/ }
      );
    });

    it('applies default config values', () => {
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com',
        httpClient: createMockHttpClient(),
      });
      assert.ok(transport.config);
      assert.equal(transport.config.retries, 3);
      assert.equal(transport.config.timeoutMs, 60000);
    });

    it('accepts custom retries and timeout', () => {
      const transport = createTransport({
        type: 'nexus',
        url: 'https://nexus.example.com',
        retries: 5,
        timeoutMs: 120000,
        httpClient: createMockHttpClient(),
      });
      assert.equal(transport.config.retries, 5);
      assert.equal(transport.config.timeoutMs, 120000);
    });
  });

  // ── Artifactory Transport ──────────────────────────────────
  describe('Artifactory transport', () => {
    it('publish() sends PUT with package data', async () => {
      const pkg = createFakePackage(tempDir, 'art-pub.emb');
      const mockHttp = createMockHttpClient({
        'PUT https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': { status: 201, body: { ok: true } },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      await transport.publish({
        moduleId: 'mod-a',
        version: '1.0.0',
        filePath: pkg.filePath,
        checksum: pkg.checksum,
      });

      assert.equal(mockHttp.calls.length, 1);
      assert.equal(mockHttp.calls[0].method, 'PUT');
    });

    it('fetch() downloads package to local path', async () => {
      const content = 'artifactory-package-data';
      const checksum = createHash('sha256').update(content).digest('hex');
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': {
          status: 200,
          body: content,
          headers: { 'x-checksum-sha256': checksum },
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'art-fetch');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-a',
        version: '1.0.0',
        outputDir: outDir,
        expectedChecksum: checksum,
      });

      assert.ok(result.filePath);
      assert.equal(result.checksumValid, true);
    });

    it('listVersions() returns available versions', async () => {
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/': {
          status: 200,
          body: JSON.stringify({ versions: ['1.0.0', '1.1.0', '2.0.0'] }),
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const versions = await transport.listVersions('mod-a');
      assert.ok(Array.isArray(versions));
      assert.ok(versions.includes('1.0.0'));
    });
  });

  // ── Nexus Transport ────────────────────────────────────────
  describe('Nexus transport', () => {
    it('publish() sends PUT with correct URL path', async () => {
      const pkg = createFakePackage(tempDir, 'nex-pub.emb');
      const mockHttp = createMockHttpClient({
        'PUT https://nexus.example.com/repository/mod-b/1.0.0/mod-b-1.0.0.emb': { status: 201, body: { ok: true } },
      });
      const transport = createTransport({
        type: 'nexus',
        url: 'https://nexus.example.com/repository',
        httpClient: mockHttp,
      });

      await transport.publish({
        moduleId: 'mod-b',
        version: '1.0.0',
        filePath: pkg.filePath,
        checksum: pkg.checksum,
      });

      assert.equal(mockHttp.calls[0].method, 'PUT');
    });

    it('fetch() returns checksum validation result', async () => {
      const content = 'nexus-content';
      const checksum = createHash('sha256').update(content).digest('hex');
      const mockHttp = createMockHttpClient({
        'GET https://nexus.example.com/repository/mod-b/1.0.0/mod-b-1.0.0.emb': {
          status: 200,
          body: content,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'nexus',
        url: 'https://nexus.example.com/repository',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'nex-fetch');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-b',
        version: '1.0.0',
        outputDir: outDir,
        expectedChecksum: checksum,
      });

      assert.equal(result.checksumValid, true);
    });
  });

  // ── S3 Transport ───────────────────────────────────────────
  describe('S3 transport', () => {
    it('publish() sends PUT to S3 path', async () => {
      const pkg = createFakePackage(tempDir, 's3-pub.emb');
      const mockHttp = createMockHttpClient({
        'PUT s3://my-bucket/embeddings/mod-c/1.0.0/mod-c-1.0.0.emb': { status: 200, body: null },
      });
      const transport = createTransport({
        type: 's3',
        url: 's3://my-bucket/embeddings',
        httpClient: mockHttp,
      });

      await transport.publish({
        moduleId: 'mod-c',
        version: '1.0.0',
        filePath: pkg.filePath,
        checksum: pkg.checksum,
      });

      assert.equal(mockHttp.calls[0].method, 'PUT');
    });

    it('fetch() downloads from S3 path', async () => {
      const content = 's3-content';
      const checksum = createHash('sha256').update(content).digest('hex');
      const mockHttp = createMockHttpClient({
        'GET s3://my-bucket/embeddings/mod-c/1.0.0/mod-c-1.0.0.emb': {
          status: 200,
          body: content,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 's3',
        url: 's3://my-bucket/embeddings',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 's3-fetch');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-c',
        version: '1.0.0',
        outputDir: outDir,
        expectedChecksum: checksum,
      });

      assert.equal(result.checksumValid, true);
    });
  });

  // ── SFTP Transport ─────────────────────────────────────────
  describe('SFTP transport', () => {
    it('publish() sends PUT to SFTP path', async () => {
      const pkg = createFakePackage(tempDir, 'sftp-pub.emb');
      const mockHttp = createMockHttpClient({
        'PUT sftp://host.example.com/packages/mod-d/1.0.0/mod-d-1.0.0.emb': { status: 200, body: null },
      });
      const transport = createTransport({
        type: 'sftp',
        url: 'sftp://host.example.com/packages',
        httpClient: mockHttp,
      });

      await transport.publish({
        moduleId: 'mod-d',
        version: '1.0.0',
        filePath: pkg.filePath,
        checksum: pkg.checksum,
      });

      assert.equal(mockHttp.calls[0].method, 'PUT');
    });

    it('fetch() downloads from SFTP path', async () => {
      const content = 'sftp-content';
      const checksum = createHash('sha256').update(content).digest('hex');
      const mockHttp = createMockHttpClient({
        'GET sftp://host.example.com/packages/mod-d/1.0.0/mod-d-1.0.0.emb': {
          status: 200,
          body: content,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'sftp',
        url: 'sftp://host.example.com/packages',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'sftp-fetch');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-d',
        version: '1.0.0',
        outputDir: outDir,
        expectedChecksum: checksum,
      });

      assert.equal(result.checksumValid, true);
    });
  });

  // ── AC-007-02: Update checker ──────────────────────────────
  describe('AC-007-02: Update checker', () => {
    it('checkForUpdates() finds newer versions from registry', async () => {
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/': {
          status: 200,
          body: JSON.stringify({ versions: ['1.0.0', '1.1.0', '2.0.0'] }),
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const checker = createUpdateChecker(transport);
      const updates = await checker.checkForUpdates('mod-a', '1.0.0');
      assert.ok(updates.hasUpdates);
      assert.ok(updates.available.length > 0);
    });

    it('checkForUpdates() returns no updates when current is latest', async () => {
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/': {
          status: 200,
          body: JSON.stringify({ versions: ['1.0.0'] }),
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const checker = createUpdateChecker(transport);
      const updates = await checker.checkForUpdates('mod-a', '1.0.0');
      assert.equal(updates.hasUpdates, false);
    });

    it('checkForUpdates() handles transport errors gracefully', async () => {
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/': {
          error: 'Network timeout',
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const checker = createUpdateChecker(transport);
      const updates = await checker.checkForUpdates('mod-a', '1.0.0');
      assert.equal(updates.hasUpdates, false);
      assert.ok(updates.error);
    });
  });

  // ── AC-007-03: Download checksum validation ────────────────
  describe('AC-007-03: Checksum validation on download', () => {
    it('fetch() validates checksum matches expected', async () => {
      const content = 'validated-package';
      const goodChecksum = createHash('sha256').update(content).digest('hex');
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': {
          status: 200,
          body: content,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'cksum-good');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-a',
        version: '1.0.0',
        outputDir: outDir,
        expectedChecksum: goodChecksum,
      });

      assert.equal(result.checksumValid, true);
    });

    it('fetch() detects checksum mismatch', async () => {
      const content = 'mismatched-package';
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': {
          status: 200,
          body: content,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'cksum-bad');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-a',
        version: '1.0.0',
        outputDir: outDir,
        expectedChecksum: 'deadbeefdeadbeef',
      });

      assert.equal(result.checksumValid, false);
    });

    it('fetch() still saves file when no expected checksum provided', async () => {
      const content = 'no-checksum-check';
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': {
          status: 200,
          body: content,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'no-cksum');
      mkdirSync(outDir, { recursive: true });

      const result = await transport.fetch({
        moduleId: 'mod-a',
        version: '1.0.0',
        outputDir: outDir,
      });

      assert.ok(result.filePath);
      // When no expected checksum, checksumValid should be null/undefined or true
      assert.ok(result.checksumValid === true || result.checksumValid === null);
    });
  });

  // ── AC-007-04: Rollback capability ─────────────────────────
  describe('AC-007-04: Rollback capability', () => {
    it('fetch() retains previous version until new one verified', async () => {
      const oldContent = 'old-version-content';
      const newContent = 'new-version-content';
      const newChecksum = createHash('sha256').update(newContent).digest('hex');

      // Create a "previous" version file
      const pkgDir = join(tempDir, 'rollback-test');
      mkdirSync(pkgDir, { recursive: true });
      const oldPath = join(pkgDir, 'mod-a-1.0.0.emb');
      writeFileSync(oldPath, oldContent, 'utf-8');

      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.1.0/mod-a-1.1.0.emb': {
          status: 200,
          body: newContent,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const result = await transport.fetch({
        moduleId: 'mod-a',
        version: '1.1.0',
        outputDir: pkgDir,
        expectedChecksum: newChecksum,
      });

      // Old file should still exist (not deleted)
      assert.ok(existsSync(oldPath), 'Previous version should be retained');
      assert.equal(result.checksumValid, true);
    });

    it('fetch() does not overwrite previous version on checksum failure', async () => {
      const oldContent = 'stable-old';
      const newContent = 'corrupt-new';

      const pkgDir = join(tempDir, 'rollback-fail');
      mkdirSync(pkgDir, { recursive: true });
      const oldPath = join(pkgDir, 'mod-a-1.0.0.emb');
      writeFileSync(oldPath, oldContent, 'utf-8');

      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.1.0/mod-a-1.1.0.emb': {
          status: 200,
          body: newContent,
          headers: {},
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const result = await transport.fetch({
        moduleId: 'mod-a',
        version: '1.1.0',
        outputDir: pkgDir,
        expectedChecksum: 'wrong-checksum-value',
      });

      // Old file untouched
      assert.ok(existsSync(oldPath));
      assert.equal(readFileSync(oldPath, 'utf-8'), oldContent);
      assert.equal(result.checksumValid, false);
    });

    it('publish() errors propagate as rejected promise', async () => {
      const pkg = createFakePackage(tempDir, 'err-pub.emb');
      const mockHttp = createMockHttpClient({
        'PUT https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': {
          error: 'Connection refused',
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      await assert.rejects(
        transport.publish({
          moduleId: 'mod-a',
          version: '1.0.0',
          filePath: pkg.filePath,
          checksum: pkg.checksum,
        }),
        { message: /Connection refused/ }
      );
    });

    it('fetch() errors propagate as rejected promise', async () => {
      const mockHttp = createMockHttpClient({
        'GET https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': {
          error: 'Server error',
        },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        httpClient: mockHttp,
      });

      const outDir = join(tempDir, 'fetch-err');
      mkdirSync(outDir, { recursive: true });

      await assert.rejects(
        transport.fetch({
          moduleId: 'mod-a',
          version: '1.0.0',
          outputDir: outDir,
          expectedChecksum: 'abc123',
        }),
        { message: /Server error/ }
      );
    });
  });

  // ── Auth header support ────────────────────────────────────
  describe('Auth support', () => {
    it('passes auth to HTTP client when configured', async () => {
      const pkg = createFakePackage(tempDir, 'auth-pub.emb');
      const mockHttp = createMockHttpClient({
        'PUT https://repo.example.com/embeddings/mod-a/1.0.0/mod-a-1.0.0.emb': { status: 201, body: { ok: true } },
      });
      const transport = createTransport({
        type: 'artifactory',
        url: 'https://repo.example.com/embeddings',
        auth: { token: 'my-secret-token' },
        httpClient: mockHttp,
      });

      await transport.publish({
        moduleId: 'mod-a',
        version: '1.0.0',
        filePath: pkg.filePath,
        checksum: pkg.checksum,
      });

      assert.ok(mockHttp.calls[0].options.auth);
      assert.equal(mockHttp.calls[0].options.auth.token, 'my-secret-token');
    });
  });
});
