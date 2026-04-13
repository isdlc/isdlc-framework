/**
 * Unit tests for generatedAtCommit in manifest
 * REQ-GH-244 FR-003, AC-003-06
 *
 * Tests that createManifest correctly includes/excludes generatedAtCommit.
 *
 * Test commands:
 *   node --test lib/embedding/package/manifest.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createManifest, validateManifest } from './manifest.js';

describe('manifest generatedAtCommit (REQ-GH-244)', () => {
  const baseMeta = {
    moduleId: 'test-module',
    version: '1.0.0',
    model: 'jina-v2',
    dimensions: 768,
    chunkCount: 100,
    tier: 'full',
    checksums: { index: 'abc', metadata: 'def' },
  };

  it('[P0] AC-003-06: Given meta includes generatedAtCommit, When createManifest() is called, Then manifest includes the field', () => {
    const meta = { ...baseMeta, generatedAtCommit: 'abc123def456' };
    const manifest = createManifest(meta);
    assert.equal(manifest.generatedAtCommit, 'abc123def456');
  });

  it('[P0] AC-003-06: Given meta does not include generatedAtCommit, When createManifest() is called, Then manifest omits the field (backward compat)', () => {
    const manifest = createManifest(baseMeta);
    assert.equal(manifest.generatedAtCommit, undefined);
  });

  it('[P0] AC-003-06: Given manifest with generatedAtCommit, When validateManifest() is called, Then validation still passes', () => {
    const meta = { ...baseMeta, generatedAtCommit: 'abc123' };
    const manifest = createManifest(meta);
    const { valid, errors } = validateManifest(manifest);
    assert.equal(valid, true, `Validation errors: ${errors.join(', ')}`);
  });

  it('[P1] Given generatedAtCommit is null, When createManifest() is called, Then field is omitted', () => {
    const meta = { ...baseMeta, generatedAtCommit: null };
    const manifest = createManifest(meta);
    assert.equal(manifest.generatedAtCommit, undefined);
  });

  it('[P1] Given generatedAtCommit is empty string, When createManifest() is called, Then field is omitted', () => {
    const meta = { ...baseMeta, generatedAtCommit: '' };
    const manifest = createManifest(meta);
    assert.equal(manifest.generatedAtCommit, undefined);
  });

  it('[P1] Given SVN revision number as generatedAtCommit, When createManifest() is called, Then field contains the revision string', () => {
    const meta = { ...baseMeta, generatedAtCommit: '12345' };
    const manifest = createManifest(meta);
    assert.equal(manifest.generatedAtCommit, '12345');
  });
});
