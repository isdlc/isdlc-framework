'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createServer } = require('../server.js');

// REQ-0048 — Integration Tests: Full server flow (MCP call simulation)

describe('integration: server end-to-end', () => {
  let tmpDir;
  let server;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-fs-srv-'));
    server = createServer();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // INT-15: Full write_files flow (AC-001-01)
  it('INT-15: write_files end-to-end', async () => {
    const filePath = path.join(tmpDir, 'write-e2e.txt');
    const result = await server.callTool('write_files', {
      files: [{ path: filePath, content: 'e2e content' }]
    });
    assert.ok(result.results);
    assert.equal(result.results[0].success, true);
    assert.equal(fs.readFileSync(filePath, 'utf-8'), 'e2e content');
  });

  // INT-16: Full read_files flow with content (AC-002-01)
  it('INT-16: read_files end-to-end with content', async () => {
    const filePath = path.join(tmpDir, 'read-e2e.txt');
    fs.writeFileSync(filePath, 'read e2e content');

    const result = await server.callTool('read_files', { paths: [filePath] });
    assert.ok(result.results);
    assert.equal(result.results[0].success, true);
    assert.equal(result.results[0].content, 'read e2e content');
  });

  // INT-17: Full append_section flow (AC-003-01)
  it('INT-17: append_section end-to-end', async () => {
    const filePath = path.join(tmpDir, 'append-e2e.md');
    fs.writeFileSync(filePath, '## Target\n\nOld content.\n\n## Other\n\nOther.\n');

    const result = await server.callTool('append_section', {
      path: filePath,
      section_id: '## Target',
      content: 'New content.\n'
    });
    assert.equal(result.success, true);
    assert.ok(fs.readFileSync(filePath, 'utf-8').includes('New content.'));
  });

  // INT-18: Full create_directories flow (AC-004-01)
  it('INT-18: create_directories end-to-end', async () => {
    const dirPath = path.join(tmpDir, 'e2e-dir', 'sub');
    const result = await server.callTool('create_directories', { paths: [dirPath] });
    assert.ok(result.results);
    assert.equal(result.results[0].success, true);
    assert.ok(fs.statSync(dirPath).isDirectory());
  });

  // INT-19: Batch write with partial failure (AC-005-01, AC-005-03)
  it('INT-19: batch write with partial failure returns mixed results', async () => {
    const readonlyDir = path.join(tmpDir, 'ro');
    fs.mkdirSync(readonlyDir);
    fs.chmodSync(readonlyDir, 0o444);

    const result = await server.callTool('write_files', {
      files: [
        { path: path.join(tmpDir, 'good.txt'), content: 'good' },
        { path: path.join(readonlyDir, 'bad.txt'), content: 'bad' }
      ]
    });

    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.succeeded, 1);
    assert.equal(result.summary.failed, 1);

    fs.chmodSync(readonlyDir, 0o755);
  });

  // INT-20: Batch read with mixed existing/missing files (AC-002-02, AC-005-03)
  it('INT-20: batch read with mixed results', async () => {
    const existsPath = path.join(tmpDir, 'exists.txt');
    fs.writeFileSync(existsPath, 'content');
    const missingPath = path.join(tmpDir, 'missing-' + Date.now() + '.txt');

    const result = await server.callTool('read_files', {
      paths: [existsPath, missingPath]
    });

    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.succeeded, 1);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.results[0].success, true);
    assert.equal(result.results[1].success, false);
  });

  // INT-21: Response format matches BatchResult schema (AC-005-01)
  it('INT-21: response matches BatchResult schema', async () => {
    const filePath = path.join(tmpDir, 'schema.txt');
    const result = await server.callTool('write_files', {
      files: [{ path: filePath, content: 'data' }]
    });

    // Validate BatchResult structure
    assert.ok(Array.isArray(result.results));
    assert.ok(typeof result.summary === 'object');
    assert.equal(typeof result.summary.total, 'number');
    assert.equal(typeof result.summary.succeeded, 'number');
    assert.equal(typeof result.summary.failed, 'number');

    // Validate per-item structure
    const item = result.results[0];
    assert.equal(typeof item.path, 'string');
    assert.equal(typeof item.success, 'boolean');
  });

  // INT-22: read_files response includes content field on success (AC-002-03)
  it('INT-22: read response includes content field', async () => {
    const filePath = path.join(tmpDir, 'content-field.txt');
    fs.writeFileSync(filePath, 'test content field');

    const result = await server.callTool('read_files', { paths: [filePath] });
    assert.ok('content' in result.results[0]);
    assert.equal(typeof result.results[0].content, 'string');
    assert.equal(result.results[0].content, 'test content field');
  });
});
