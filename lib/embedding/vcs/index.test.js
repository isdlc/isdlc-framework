/**
 * Tests for VCS Adapter (M3)
 *
 * REQ-0045 / FR-014 / M3 VCS
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { createTempDir, cleanupTempDir } from '../../../lib/utils/test-helpers.js';
import { createAdapter } from './index.js';
import { createGitAdapter } from './git-adapter.js';

describe('M3: VCS Adapter', () => {
  let tempDir;

  before(() => {
    tempDir = createTempDir();
  });

  after(() => {
    cleanupTempDir(tempDir);
  });

  // ── createAdapter() — detection ───────────────────────────────────
  describe('createAdapter()', () => {
    it('throws for null workingCopyPath', async () => {
      await assert.rejects(
        () => createAdapter(null),
        { message: 'workingCopyPath must be a non-empty string' }
      );
    });

    it('throws for empty string', async () => {
      await assert.rejects(
        () => createAdapter(''),
        { message: 'workingCopyPath must be a non-empty string' }
      );
    });

    it('throws when no VCS detected', async () => {
      const noVcsDir = join(tempDir, 'no-vcs');
      mkdirSync(noVcsDir, { recursive: true });
      await assert.rejects(
        () => createAdapter(noVcsDir),
        /No supported VCS detected/
      );
    });

    it('detects Git repository', async () => {
      const gitDir = join(tempDir, 'git-repo');
      mkdirSync(gitDir, { recursive: true });
      execSync('git init', { cwd: gitDir, stdio: 'ignore' });

      const adapter = await createAdapter(gitDir);
      assert.equal(adapter.type, 'git');
    });

    it('detects SVN working copy via .svn directory', async () => {
      const svnDir = join(tempDir, 'svn-wc');
      mkdirSync(join(svnDir, '.svn'), { recursive: true });

      const adapter = await createAdapter(svnDir);
      assert.equal(adapter.type, 'svn');
    });

    it('prefers Git over SVN when both present', async () => {
      const bothDir = join(tempDir, 'both-vcs');
      mkdirSync(join(bothDir, '.git'), { recursive: true });
      mkdirSync(join(bothDir, '.svn'), { recursive: true });

      const adapter = await createAdapter(bothDir);
      assert.equal(adapter.type, 'git');
    });
  });

  // ── Git Adapter ───────────────────────────────────────────────────
  describe('Git Adapter', () => {
    let gitDir;

    before(() => {
      gitDir = join(tempDir, 'git-test-repo');
      mkdirSync(gitDir, { recursive: true });
      execSync('git init', { cwd: gitDir, stdio: 'ignore' });
      execSync('git config user.email "test@test.com"', { cwd: gitDir, stdio: 'ignore' });
      execSync('git config user.name "Test"', { cwd: gitDir, stdio: 'ignore' });

      // Create initial commit
      writeFileSync(join(gitDir, 'file1.js'), 'const a = 1;\n');
      writeFileSync(join(gitDir, 'file2.ts'), 'const b: number = 2;\n');
      execSync('git add -A && git commit -m "initial"', { cwd: gitDir, stdio: 'ignore' });
    });

    it('returns type git', () => {
      const adapter = createGitAdapter(gitDir);
      assert.equal(adapter.type, 'git');
    });

    it('getCurrentRevision() returns a SHA hash', async () => {
      const adapter = createGitAdapter(gitDir);
      const rev = await adapter.getCurrentRevision();
      assert.match(rev, /^[0-9a-f]{40}$/);
    });

    it('getFileList() returns tracked files', async () => {
      const adapter = createGitAdapter(gitDir);
      const files = await adapter.getFileList();
      assert.ok(Array.isArray(files));
      assert.ok(files.includes('file1.js'));
      assert.ok(files.includes('file2.ts'));
    });

    it('getChangedFiles() returns uncommitted changes', async () => {
      const adapter = createGitAdapter(gitDir);
      // Add a new uncommitted file
      writeFileSync(join(gitDir, 'new-file.txt'), 'hello\n');
      const changes = await adapter.getChangedFiles();
      const newFileChange = changes.find(c => c.path === 'new-file.txt');
      assert.ok(newFileChange);
      assert.equal(newFileChange.status, 'added');
    });

    it('getChangedFiles(since) returns changes between commits', async () => {
      const adapter = createGitAdapter(gitDir);
      const baseRev = await adapter.getCurrentRevision();

      // Make a new commit
      writeFileSync(join(gitDir, 'added.js'), 'new file\n');
      execSync('git add -A && git commit -m "second"', { cwd: gitDir, stdio: 'ignore' });

      const changes = await adapter.getChangedFiles(baseRev);
      assert.ok(Array.isArray(changes));
      // Should include the added file
      const addedChange = changes.find(c => c.path === 'added.js');
      assert.ok(addedChange);
      assert.equal(addedChange.status, 'added');
    });

    it('getChangedFiles() returns empty array when no changes', async () => {
      // Create a clean repo
      const cleanDir = join(tempDir, 'clean-git');
      mkdirSync(cleanDir, { recursive: true });
      execSync('git init', { cwd: cleanDir, stdio: 'ignore' });
      execSync('git config user.email "t@t.com"', { cwd: cleanDir, stdio: 'ignore' });
      execSync('git config user.name "T"', { cwd: cleanDir, stdio: 'ignore' });
      writeFileSync(join(cleanDir, 'a.txt'), 'a\n');
      execSync('git add -A && git commit -m "init"', { cwd: cleanDir, stdio: 'ignore' });

      const adapter = createGitAdapter(cleanDir);
      const changes = await adapter.getChangedFiles();
      assert.deepEqual(changes, []);
    });
  });

  // ── SVN Adapter (interface-level) ─────────────────────────────────
  describe('SVN Adapter (interface check)', () => {
    it('createAdapter returns svn adapter with correct interface', async () => {
      const svnDir = join(tempDir, 'svn-iface');
      mkdirSync(join(svnDir, '.svn'), { recursive: true });

      const adapter = await createAdapter(svnDir);
      assert.equal(adapter.type, 'svn');
      assert.equal(typeof adapter.getChangedFiles, 'function');
      assert.equal(typeof adapter.getCurrentRevision, 'function');
      assert.equal(typeof adapter.getFileList, 'function');
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('handles non-existent directory gracefully', async () => {
      await assert.rejects(
        () => createAdapter('/nonexistent/path/abc123'),
        /No supported VCS detected/
      );
    });
  });
});
