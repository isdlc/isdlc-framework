/**
 * Tests for lib/utils/fs-helpers.js
 *
 * Uses REAL temp filesystem (not mocks) to verify all fs-helpers functions.
 * Each describe block manages its own temp directory for isolation.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTempDir, cleanupTempDir } from './test-helpers.js';
import * as fsh from './fs-helpers.js';
import defaultExport from './fs-helpers.js';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// getFrameworkDir / getPackageRoot
// ---------------------------------------------------------------------------

describe('getFrameworkDir()', () => {
  it('should return a path ending with /src', () => {
    const result = fsh.getFrameworkDir();
    assert.ok(result.endsWith('/src'), `Expected path ending with /src, got: ${result}`);
  });
});

describe('getPackageRoot()', () => {
  it('should return the package root directory containing package.json', () => {
    const result = fsh.getPackageRoot();
    // The package root should contain a package.json
    assert.ok(fsh.existsSync(join(result, 'package.json')), 'Package root should contain package.json');
  });
});

// ---------------------------------------------------------------------------
// exists / existsSync
// ---------------------------------------------------------------------------

describe('exists()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'real.txt'), 'content', 'utf-8');
  });

  after(() => cleanupTempDir(dir));

  it('should return true for an existing file', async () => {
    const result = await fsh.exists(join(dir, 'real.txt'));
    assert.equal(result, true);
  });

  it('should return false for a non-existent file', async () => {
    const result = await fsh.exists(join(dir, 'ghost.txt'));
    assert.equal(result, false);
  });
});

describe('existsSync()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'real.txt'), 'content', 'utf-8');
  });

  after(() => cleanupTempDir(dir));

  it('should return true for an existing file', () => {
    assert.equal(fsh.existsSync(join(dir, 'real.txt')), true);
  });

  it('should return false for a non-existent file', () => {
    assert.equal(fsh.existsSync(join(dir, 'ghost.txt')), false);
  });
});

// ---------------------------------------------------------------------------
// ensureDir
// ---------------------------------------------------------------------------

describe('ensureDir()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
  });

  after(() => cleanupTempDir(dir));

  it('should create nested directories that do not exist', async () => {
    const nested = join(dir, 'a', 'b', 'c');
    await fsh.ensureDir(nested);
    assert.equal(fsh.existsSync(nested), true);
  });
});

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

describe('copy()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'source.txt'), 'hello copy', 'utf-8');
  });

  after(() => cleanupTempDir(dir));

  it('should copy a file and preserve content', async () => {
    const src = join(dir, 'source.txt');
    const dest = join(dir, 'dest.txt');
    await fsh.copy(src, dest);
    const content = readFileSync(dest, 'utf-8');
    assert.equal(content, 'hello copy');
  });
});

// ---------------------------------------------------------------------------
// copyDir
// ---------------------------------------------------------------------------

describe('copyDir()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    mkdirSync(join(dir, 'src-dir', 'sub'), { recursive: true });
    writeFileSync(join(dir, 'src-dir', 'a.txt'), 'aaa', 'utf-8');
    writeFileSync(join(dir, 'src-dir', 'sub', 'b.txt'), 'bbb', 'utf-8');
  });

  after(() => cleanupTempDir(dir));

  it('should copy directory recursively', async () => {
    const src = join(dir, 'src-dir');
    const dest = join(dir, 'dest-dir');
    await fsh.copyDir(src, dest);

    assert.equal(readFileSync(join(dest, 'a.txt'), 'utf-8'), 'aaa');
    assert.equal(readFileSync(join(dest, 'sub', 'b.txt'), 'utf-8'), 'bbb');
  });
});

// ---------------------------------------------------------------------------
// readJson / writeJson
// ---------------------------------------------------------------------------

describe('readJson()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'valid.json'), '{"key":"value","num":42}', 'utf-8');
    writeFileSync(join(dir, 'invalid.json'), '{not json!!!', 'utf-8');
  });

  after(() => cleanupTempDir(dir));

  it('should read and parse a valid JSON file', async () => {
    const data = await fsh.readJson(join(dir, 'valid.json'));
    assert.deepEqual(data, { key: 'value', num: 42 });
  });

  it('should reject on invalid JSON', async () => {
    await assert.rejects(
      () => fsh.readJson(join(dir, 'invalid.json')),
      (err) => err instanceof SyntaxError
    );
  });
});

describe('writeJson()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
  });

  after(() => cleanupTempDir(dir));

  it('should write formatted JSON with 2-space indent', async () => {
    const filePath = join(dir, 'output.json');
    await fsh.writeJson(filePath, { a: 1, b: { c: 2 } });
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed, { a: 1, b: { c: 2 } });
    // Verify 2-space indentation
    assert.ok(raw.includes('  "a"'), 'Should use 2-space indent');
  });
});

// ---------------------------------------------------------------------------
// readFile / writeFile
// ---------------------------------------------------------------------------

describe('readFile() / writeFile()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
  });

  after(() => cleanupTempDir(dir));

  it('should round-trip text content', async () => {
    const filePath = join(dir, 'roundtrip.txt');
    const content = 'Hello, iSDLC!\nLine two.\n';
    await fsh.writeFile(filePath, content);
    const result = await fsh.readFile(filePath);
    assert.equal(result, content);
  });

  it('should create parent directories when writing', async () => {
    const filePath = join(dir, 'deep', 'nested', 'dir', 'file.txt');
    await fsh.writeFile(filePath, 'nested content');
    const result = await fsh.readFile(filePath);
    assert.equal(result, 'nested content');
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('remove()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
  });

  after(() => cleanupTempDir(dir));

  it('should delete a file', async () => {
    const filePath = join(dir, 'delete-me.txt');
    writeFileSync(filePath, 'gone', 'utf-8');
    assert.equal(fsh.existsSync(filePath), true);
    await fsh.remove(filePath);
    assert.equal(fsh.existsSync(filePath), false);
  });

  it('should delete a directory recursively', async () => {
    const subdir = join(dir, 'remove-dir', 'child');
    mkdirSync(subdir, { recursive: true });
    writeFileSync(join(subdir, 'x.txt'), 'x', 'utf-8');
    await fsh.remove(join(dir, 'remove-dir'));
    assert.equal(fsh.existsSync(join(dir, 'remove-dir')), false);
  });
});

// ---------------------------------------------------------------------------
// readdir
// ---------------------------------------------------------------------------

describe('readdir()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'alpha.txt'), '', 'utf-8');
    writeFileSync(join(dir, 'beta.txt'), '', 'utf-8');
    mkdirSync(join(dir, 'gamma'));
  });

  after(() => cleanupTempDir(dir));

  it('should list directory entries', async () => {
    const entries = await fsh.readdir(dir);
    assert.ok(entries.includes('alpha.txt'), 'Should list alpha.txt');
    assert.ok(entries.includes('beta.txt'), 'Should list beta.txt');
    assert.ok(entries.includes('gamma'), 'Should list gamma directory');
  });
});

// ---------------------------------------------------------------------------
// stat
// ---------------------------------------------------------------------------

describe('stat()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'file.txt'), 'content', 'utf-8');
    mkdirSync(join(dir, 'subdir'));
  });

  after(() => cleanupTempDir(dir));

  it('should return stats with isFile and isDirectory methods', async () => {
    const fileStat = await fsh.stat(join(dir, 'file.txt'));
    assert.equal(fileStat.isFile(), true);
    assert.equal(fileStat.isDirectory(), false);

    const dirStat = await fsh.stat(join(dir, 'subdir'));
    assert.equal(dirStat.isFile(), false);
    assert.equal(dirStat.isDirectory(), true);
  });
});

// ---------------------------------------------------------------------------
// isDirectory / isFile
// ---------------------------------------------------------------------------

describe('isDirectory()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'file.txt'), '', 'utf-8');
    mkdirSync(join(dir, 'subdir'));
  });

  after(() => cleanupTempDir(dir));

  it('should return true for a directory', async () => {
    assert.equal(await fsh.isDirectory(join(dir, 'subdir')), true);
  });

  it('should return false for a file', async () => {
    assert.equal(await fsh.isDirectory(join(dir, 'file.txt')), false);
  });

  it('should return false for a non-existent path', async () => {
    assert.equal(await fsh.isDirectory(join(dir, 'nope')), false);
  });
});

describe('isFile()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    writeFileSync(join(dir, 'file.txt'), '', 'utf-8');
    mkdirSync(join(dir, 'subdir'));
  });

  after(() => cleanupTempDir(dir));

  it('should return true for a file', async () => {
    assert.equal(await fsh.isFile(join(dir, 'file.txt')), true);
  });

  it('should return false for a directory', async () => {
    assert.equal(await fsh.isFile(join(dir, 'subdir')), false);
  });

  it('should return false for a non-existent path', async () => {
    assert.equal(await fsh.isFile(join(dir, 'nope')), false);
  });
});

// ---------------------------------------------------------------------------
// findFiles
// ---------------------------------------------------------------------------

describe('findFiles()', () => {
  let dir;

  before(() => {
    dir = createTempDir();
    mkdirSync(join(dir, 'project', 'lib'), { recursive: true });
    writeFileSync(join(dir, 'project', 'index.js'), '', 'utf-8');
    writeFileSync(join(dir, 'project', 'readme.md'), '', 'utf-8');
    writeFileSync(join(dir, 'project', 'lib', 'utils.js'), '', 'utf-8');
    writeFileSync(join(dir, 'project', 'lib', 'data.json'), '', 'utf-8');
  });

  after(() => cleanupTempDir(dir));

  it('should find files matching a regex filter', async () => {
    const results = await fsh.findFiles(join(dir, 'project'), /\.js$/);
    assert.equal(results.length, 2);
    const names = results.map((p) => p.split('/').pop());
    assert.ok(names.includes('index.js'));
    assert.ok(names.includes('utils.js'));
  });

  it('should find files matching a function filter', async () => {
    const results = await fsh.findFiles(join(dir, 'project'), (fullPath, name) =>
      name.endsWith('.md')
    );
    assert.equal(results.length, 1);
    assert.ok(results[0].endsWith('readme.md'));
  });

  it('should return empty array for non-existent directory', async () => {
    const results = await fsh.findFiles(join(dir, 'no-such-dir'), /\.js$/);
    assert.deepEqual(results, []);
  });
});

// ---------------------------------------------------------------------------
// deepMerge
// ---------------------------------------------------------------------------

describe('deepMerge()', () => {
  it('should merge flat objects', () => {
    const result = fsh.deepMerge({ a: 1 }, { b: 2 });
    assert.deepEqual(result, { a: 1, b: 2 });
  });

  it('should deep merge nested objects', () => {
    const target = { config: { theme: 'dark', lang: 'en' } };
    const source = { config: { lang: 'fr', debug: true } };
    const result = fsh.deepMerge(target, source);
    assert.deepEqual(result, { config: { theme: 'dark', lang: 'fr', debug: true } });
  });

  it('should replace arrays instead of merging them', () => {
    const target = { items: [1, 2, 3] };
    const source = { items: [4, 5] };
    const result = fsh.deepMerge(target, source);
    assert.deepEqual(result, { items: [4, 5] });
  });

  it('should handle empty or undefined target keys', () => {
    const result = fsh.deepMerge({}, { nested: { key: 'val' } });
    assert.deepEqual(result, { nested: { key: 'val' } });
  });

  it('should not mutate the original target object', () => {
    const target = { a: 1, nested: { b: 2 } };
    const source = { a: 99, nested: { c: 3 } };
    const result = fsh.deepMerge(target, source);
    assert.equal(target.a, 1, 'Original target.a should be unchanged');
    assert.equal(target.nested.c, undefined, 'Original target.nested should be unchanged');
    assert.equal(result.a, 99);
    assert.equal(result.nested.c, 3);
  });
});

// ---------------------------------------------------------------------------
// default export
// ---------------------------------------------------------------------------

describe('default export', () => {
  it('should export an object containing all 20 functions', () => {
    // BUG-0053 FR-003: Updated count from 19 to 20 to include symlink (added by REQ-0032)
    const expectedFunctions = [
      'getFrameworkDir',
      'getPackageRoot',
      'exists',
      'existsSync',
      'ensureDir',
      'copy',
      'copyDir',
      'readJson',
      'writeJson',
      'readFile',
      'writeFile',
      'remove',
      'readdir',
      'stat',
      'isDirectory',
      'isFile',
      'findFiles',
      'symlink',
      'deepMerge',
      'convertYamlToJson',
    ];

    for (const name of expectedFunctions) {
      assert.equal(
        typeof defaultExport[name],
        'function',
        `default.${name} should be a function`
      );
    }

    assert.equal(
      Object.keys(defaultExport).length,
      expectedFunctions.length,
      `Default export should have exactly ${expectedFunctions.length} keys`
    );
  });
});
