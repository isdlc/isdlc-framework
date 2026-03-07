'use strict';

// REQ-0048 / FR-001, FR-002, FR-003, FR-004, FR-005, FR-006
// Core file I/O operations with atomic writes and per-file error reporting.

const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');
const { createLockManager } = require('./lock-manager.js');
const { findSection, spliceSection } = require('./section-parser.js');

/**
 * Create a file operations instance with its own lock manager.
 *
 * @returns {{ writeFiles, readFiles, appendSection, createDirectories }}
 */
function createFileOps() {
  const lockManager = createLockManager();

  /**
   * Validate that all paths in the array are absolute.
   * @param {string[]} paths
   * @throws {Error} INVALID_PATH if any path is relative
   */
  function validateAbsolutePaths(paths) {
    for (const p of paths) {
      if (!path.isAbsolute(p)) {
        const err = new Error(`INVALID_PATH: All paths must be absolute. Relative path found: '${p}'`);
        err.code = 'INVALID_PATH';
        throw err;
      }
    }
  }

  /**
   * Build a batch result from individual results.
   * @param {Array<{ path: string, success: boolean, error?: string, content?: string }>} results
   * @returns {{ results: Array, summary: { total: number, succeeded: number, failed: number } }}
   */
  function buildBatchResult(results) {
    const succeeded = results.filter((r) => r.success).length;
    return {
      results,
      summary: {
        total: results.length,
        succeeded,
        failed: results.length - succeeded
      }
    };
  }

  /**
   * Perform an atomic write: write to temp file, fsync, rename.
   * @param {string} targetPath - Absolute target file path
   * @param {string} content - File content
   */
  async function atomicWrite(targetPath, content) {
    const dir = path.dirname(targetPath);
    const basename = path.basename(targetPath);
    const tmpPath = path.join(dir, `.${basename}.tmp.${process.pid}.${Date.now()}`);

    let fd;
    try {
      // Ensure parent directory exists
      await fsPromises.mkdir(dir, { recursive: true });

      // Write to temp file
      fd = await fsPromises.open(tmpPath, 'w');
      await fd.writeFile(content, 'utf-8');
      await fd.datasync();
      await fd.close();
      fd = null;

      // Atomic rename
      await fsPromises.rename(tmpPath, targetPath);
    } catch (err) {
      // Clean up temp file on error
      if (fd) {
        try { await fd.close(); } catch (_) { /* ignore */ }
      }
      try { await fsPromises.unlink(tmpPath); } catch (_) { /* ignore */ }
      throw err;
    }
  }

  /**
   * Write multiple files to disk atomically in a single call.
   * FR-001: Batch File Write
   * FR-006: Atomic Write Safety
   *
   * @param {Array<{ path: string, content: string }>} files
   * @returns {Promise<{ results: Array, summary: object }>}
   */
  async function writeFiles(files) {
    if (!files || files.length === 0) {
      const err = new Error('EMPTY_BATCH: files array must not be empty');
      err.code = 'EMPTY_BATCH';
      throw err;
    }

    // Validate all paths are absolute
    validateAbsolutePaths(files.map((f) => f.path));

    // Validate content
    for (const f of files) {
      if (f.content == null || typeof f.content !== 'string') {
        const err = new Error(`MISSING_CONTENT: content must be a string for path '${f.path}'`);
        err.code = 'MISSING_CONTENT';
        throw err;
      }
    }

    // Process all files concurrently
    const settled = await Promise.allSettled(
      files.map(async (file) => {
        const absPath = path.resolve(file.path);
        const release = await lockManager.acquire(absPath);
        try {
          await atomicWrite(absPath, file.content);
          return { path: file.path, success: true };
        } catch (err) {
          return { path: file.path, success: false, error: err.message };
        } finally {
          release();
        }
      })
    );

    const results = settled.map((s) => {
      if (s.status === 'fulfilled') return s.value;
      return { path: 'unknown', success: false, error: s.reason.message };
    });

    return buildBatchResult(results);
  }

  /**
   * Read multiple files from disk concurrently.
   * FR-002: Batch File Read
   *
   * @param {string[]} paths
   * @returns {Promise<{ results: Array, summary: object }>}
   */
  async function readFiles(paths) {
    if (!paths || paths.length === 0) {
      const err = new Error('EMPTY_BATCH: paths array must not be empty');
      err.code = 'EMPTY_BATCH';
      throw err;
    }

    validateAbsolutePaths(paths);

    const settled = await Promise.allSettled(
      paths.map(async (filePath) => {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        return { path: filePath, success: true, content };
      })
    );

    const results = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      return { path: paths[i], success: false, error: s.reason.message };
    });

    return buildBatchResult(results);
  }

  /**
   * Update a named section within a markdown file.
   * FR-003: Incremental Section Update
   *
   * @param {string} filePath - Absolute file path
   * @param {string} sectionId - Section identifier
   * @param {string} content - New section content
   * @param {{ matchBy?: 'heading' | 'marker' }} [options]
   * @returns {Promise<{ path: string, success: boolean, error?: string }>}
   */
  async function appendSection(filePath, sectionId, content, options) {
    if (!path.isAbsolute(filePath)) {
      const err = new Error(`INVALID_PATH: Path must be absolute. Got: '${filePath}'`);
      err.code = 'INVALID_PATH';
      throw err;
    }

    const absPath = path.resolve(filePath);
    const matchBy = (options && options.matchBy) || 'heading';

    const release = await lockManager.acquire(absPath);
    try {
      // Read existing file
      let existingContent;
      try {
        existingContent = await fsPromises.readFile(absPath, 'utf-8');
      } catch (err) {
        if (err.code === 'ENOENT') {
          return { path: filePath, success: false, error: 'FILE_NOT_FOUND: File does not exist' };
        }
        throw err;
      }

      // Find section
      const bounds = findSection(existingContent, sectionId, matchBy);
      if (!bounds) {
        return { path: filePath, success: false, error: `SECTION_NOT_FOUND: No section matching '${sectionId}' found` };
      }

      // Splice new content
      const updatedContent = spliceSection(existingContent, bounds, content);

      // Atomic write
      await atomicWrite(absPath, updatedContent);

      return { path: filePath, success: true };
    } catch (err) {
      return { path: filePath, success: false, error: err.message };
    } finally {
      release();
    }
  }

  /**
   * Create multiple directories with recursive parent creation.
   * FR-004: Batch Directory Creation
   *
   * @param {string[]} paths
   * @returns {Promise<{ results: Array, summary: object }>}
   */
  async function createDirectories(paths) {
    if (!paths || paths.length === 0) {
      const err = new Error('EMPTY_BATCH: paths array must not be empty');
      err.code = 'EMPTY_BATCH';
      throw err;
    }

    validateAbsolutePaths(paths);

    const settled = await Promise.allSettled(
      paths.map(async (dirPath) => {
        await fsPromises.mkdir(dirPath, { recursive: true });
        return { path: dirPath, success: true };
      })
    );

    const results = settled.map((s, i) => {
      if (s.status === 'fulfilled') return s.value;
      return { path: paths[i], success: false, error: s.reason.message };
    });

    return buildBatchResult(results);
  }

  return { writeFiles, readFiles, appendSection, createDirectories };
}

module.exports = { createFileOps };
