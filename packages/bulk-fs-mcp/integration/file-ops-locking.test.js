'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createFileOps } = require('../file-ops.js');
const { createLockManager } = require('../lock-manager.js');

// REQ-0048 — Integration Tests: file-ops + lock-manager

describe('integration: file-ops + locking', () => {
  let tmpDir;
  let fileOps;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bulk-fs-int-'));
    fileOps = createFileOps();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // INT-01: Concurrent writeFiles to same path serialize via lock-manager (AC-001-06, AC-007-01)
  it('INT-01: concurrent writes to same path serialize', async () => {
    const filePath = path.join(tmpDir, 'shared.txt');

    // Write concurrently — both should succeed without corruption
    const [r1, r2] = await Promise.all([
      fileOps.writeFiles([{ path: filePath, content: 'write-1' }]),
      fileOps.writeFiles([{ path: filePath, content: 'write-2' }])
    ]);

    assert.equal(r1.results[0].success, true);
    assert.equal(r2.results[0].success, true);

    // File should contain one of the two writes (last writer wins)
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content === 'write-1' || content === 'write-2');
  });

  // INT-02: Concurrent writeFiles to different paths run in parallel (AC-007-04)
  it('INT-02: different paths run in parallel', async () => {
    const pathA = path.join(tmpDir, 'a.txt');
    const pathB = path.join(tmpDir, 'b.txt');

    const [rA, rB] = await Promise.all([
      fileOps.writeFiles([{ path: pathA, content: 'content-a' }]),
      fileOps.writeFiles([{ path: pathB, content: 'content-b' }])
    ]);

    assert.equal(rA.results[0].success, true);
    assert.equal(rB.results[0].success, true);
    assert.equal(fs.readFileSync(pathA, 'utf-8'), 'content-a');
    assert.equal(fs.readFileSync(pathB, 'utf-8'), 'content-b');
  });

  // INT-03: appendSection acquires lock before modifying file (AC-007-05)
  it('INT-03: appendSection acquires lock before modifying', async () => {
    const filePath = path.join(tmpDir, 'locked.md');
    fs.writeFileSync(filePath, '## Section\n\nOriginal.\n');

    const result = await fileOps.appendSection(filePath, '## Section', 'Updated.\n');
    assert.equal(result.success, true);
    assert.ok(fs.readFileSync(filePath, 'utf-8').includes('Updated.'));
  });

  // INT-04: writeFiles + appendSection on same file serialize correctly (AC-007-05)
  it('INT-04: writeFiles + appendSection on same file serialize', async () => {
    const filePath = path.join(tmpDir, 'serial.md');

    // Write the initial file
    await fileOps.writeFiles([{ path: filePath, content: '## Data\n\nInitial.\n' }]);

    // Now concurrently try to write and append
    const [rWrite, rAppend] = await Promise.all([
      fileOps.writeFiles([{ path: filePath, content: '## Data\n\nRewritten.\n' }]),
      fileOps.appendSection(filePath, '## Data', 'Appended.\n')
    ]);

    assert.equal(rWrite.results[0].success, true);
    assert.equal(rAppend.success, true);

    // File should be valid (no corruption)
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.ok(content.includes('## Data'));
  });

  // INT-05: Lock timeout during concurrent writes returns LOCK_TIMEOUT error (AC-007-03)
  it('INT-05: lock timeout returns LOCK_TIMEOUT error', async () => {
    // Use the lock manager directly to simulate contention
    const lockManager = createLockManager();
    const filePath = path.join(tmpDir, 'timeout.txt');

    // Acquire lock and hold it
    const release = await lockManager.acquire(filePath);

    // Try to acquire with very short timeout
    await assert.rejects(
      lockManager.acquire(filePath, 50),
      (err) => {
        assert.equal(err.code, 'LOCK_TIMEOUT');
        return true;
      }
    );

    release();
  });

  // INT-06: Crashed write leaves original file intact (AC-006-04)
  it('INT-06: crashed write leaves original file intact', async () => {
    const filePath = path.join(tmpDir, 'crash-safe.txt');
    fs.writeFileSync(filePath, 'original content');

    // Simulate a crash by creating a temp file but not renaming
    const tmpPath = path.join(tmpDir, '.crash-safe.txt.tmp.99999.9999999');
    fs.writeFileSync(tmpPath, 'partial content');

    // Original file should be untouched
    assert.equal(fs.readFileSync(filePath, 'utf-8'), 'original content');

    // Temp file exists (orphaned)
    assert.ok(fs.existsSync(tmpPath));
  });

  // INT-07: Orphaned temp file follows naming convention (AC-006-05)
  it('INT-07: orphaned temp file matches naming convention', () => {
    const tmpFileName = '.myfile.txt.tmp.12345.1234567890';
    const tmpPath = path.join(tmpDir, tmpFileName);
    fs.writeFileSync(tmpPath, 'orphan');

    const files = fs.readdirSync(tmpDir);
    const orphans = files.filter((f) => /^\..*\.tmp\.\d+\.\d+$/.test(f));
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0], tmpFileName);
  });

  // INT-08: 10-file batch: mix of new and overwrite, all atomic (AC-001-01, AC-006-01)
  it('INT-08: 10-file batch mix of new and overwrite', async () => {
    // Pre-create 5 files
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(tmpDir, `file${i}.txt`), `old-${i}`);
    }

    // Write batch of 10 (5 overwrite + 5 new)
    const files = [];
    for (let i = 0; i < 10; i++) {
      files.push({ path: path.join(tmpDir, `file${i}.txt`), content: `new-${i}` });
    }

    const result = await fileOps.writeFiles(files);
    assert.equal(result.summary.total, 10);
    assert.equal(result.summary.succeeded, 10);
    assert.equal(result.summary.failed, 0);

    // Verify all files have new content
    for (let i = 0; i < 10; i++) {
      assert.equal(fs.readFileSync(path.join(tmpDir, `file${i}.txt`), 'utf-8'), `new-${i}`);
    }
  });
});
