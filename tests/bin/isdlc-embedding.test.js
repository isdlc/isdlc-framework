/**
 * BUG-GH-250 -- generate CLI opt-in enforcement (FR-006, AC-250-01)
 *
 * Traces: FR-006, AC-250-01 (TG1, TG2, TG3, TG4)
 *
 * Phase 06 T002 RED tests. These tests exercise the contract that T006
 * must implement in bin/isdlc-embedding.js: a per-site opt-in guard that
 * reads hasUserEmbeddingsConfig() at runGenerate() entry and branches
 * based on TTY/non-TTY context.
 *
 * Test-strategy source: docs/requirements/BUG-GH-250-embeddings-opt-in-gap/
 *   test-strategy.md section 10.1 (TG1..TG4 scaffolds).
 *
 * TTY simulation note (test-strategy section 7):
 *   spawnSync child processes are never TTY under stdio:'pipe'. To exercise
 *   the interactive-prompt branch (TG2, TG3) without a PTY library, these
 *   tests set ISDLC_FORCE_INTERACTIVE=1 -- a test-only env hook that T006
 *   must honor to treat the spawn as if both stdin and stdout were TTYs.
 *   This mirrors the deferral recorded in test-strategy.md section 7 and
 *   avoids node-pty as a new dependency.
 *
 * RED-state expectation: until T006 implements the guard + env hook, all
 * four tests MUST fail -- TG1 fails because the CLI proceeds past the
 * missing guard, TG2/TG3 fail because the env hook does not exist, TG4
 * fails because the CLI attempts a real generation pipeline.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve bin path from this test file location (tests/bin/ -> ../../bin/).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BIN_PATH = resolve(__dirname, '..', '..', 'bin', 'isdlc-embedding.js');

/** @type {string[]} */
const tempRoots = [];

/**
 * Create an isolated temp project root. When configContent is null, no
 * config.json is written (absence case). When a string, it is written
 * verbatim to .isdlc/config.json.
 *
 * @param {string | null} configContent
 * @returns {string} absolute path to the temp project root
 */
function makeTempRoot(configContent) {
  const root = mkdtempSync(join(tmpdir(), 'bug-gh-250-gen-'));
  tempRoots.push(root);
  mkdirSync(join(root, '.isdlc'), { recursive: true });
  if (configContent !== null) {
    writeFileSync(join(root, '.isdlc', 'config.json'), configContent, 'utf8');
  }
  return root;
}

/**
 * Return true if any .emb file exists under <root>/docs/.embeddings/.
 * @param {string} root
 */
function hasEmbFile(root) {
  const dir = join(root, 'docs', '.embeddings');
  if (!existsSync(dir)) return false;
  try {
    const entries = readdirSync(dir);
    return entries.some((e) => e.endsWith('.emb'));
  } catch {
    return false;
  }
}

after(() => {
  for (const r of tempRoots) {
    try {
      rmSync(r, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failures */
    }
  }
});

describe('BUG-GH-250 bin/isdlc-embedding.js generate -- FR-006 opt-in guard', () => {
  // ----------------------------------------------------------------------
  // TG1 -- [P0] AC-250-01: non-TTY + opted-out -> exit 0, no .emb written
  // ----------------------------------------------------------------------
  it(
    '[P0] AC-250-01 TG1: Given opted-out config and non-TTY, When generate is invoked, Then exit 0 and no .emb written',
    () => {
      // Given: a temp project root whose .isdlc/config.json has NO `embeddings` key
      const root = makeTempRoot(
        JSON.stringify({ atdd: { enabled: true }, search: {} })
      );

      // When: spawn bin/isdlc-embedding.js generate . with stdio 'pipe'
      //       (guarantees neither stdin.isTTY nor stdout.isTTY on the child)
      const result = spawnSync(
        process.execPath,
        [BIN_PATH, 'generate', '.'],
        {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 15_000,
          // Scrub any inherited env that could mark the child as interactive.
          env: { ...process.env, ISDLC_FORCE_INTERACTIVE: '' },
        }
      );

      // Then: exit code 0
      assert.strictEqual(
        result.status,
        0,
        `expected exit 0, got ${result.status}. stdout=${result.stdout} stderr=${result.stderr}`
      );

      // And: no .emb file exists under <root>/docs/.embeddings/
      assert.strictEqual(
        hasEmbFile(root),
        false,
        'no .emb file should be written under docs/.embeddings/'
      );

      // And: stderr contains a skip message referencing the configure command
      //      (T006 will emit this line; the exact phrasing is pinned by the
      //       AC-250-01 non-TTY "one-line skip message referencing opt-out /
      //       isdlc-embedding configure" contract).
      const combined = `${result.stdout || ''}\n${result.stderr || ''}`;
      assert.match(
        combined,
        /isdlc[- ]embedding configure/i,
        'skip message should point at `isdlc-embedding configure`'
      );
      assert.match(
        combined,
        /(opt(?:ed)?[- ]out|not configured|disabled)/i,
        'skip message should identify the opt-out reason'
      );
    }
  );

  // ----------------------------------------------------------------------
  // TG2 -- [P0] AC-250-01: TTY + "y" stdin -> opt-in written, proceeds
  // ----------------------------------------------------------------------
  it(
    '[P0] AC-250-01 TG2: Given opted-out config and TTY with stdin "y", When generate is invoked, Then opt-in written and generation proceeds',
    () => {
      // Given: temp root with config.json that has no `embeddings` key
      const configPathBefore = { path: '' };
      const root = makeTempRoot(JSON.stringify({ search: {} }));
      configPathBefore.path = join(root, '.isdlc', 'config.json');
      const bytesBefore = readFileSync(configPathBefore.path, 'utf8');
      assert.strictEqual(
        bytesBefore.includes('"embeddings"'),
        false,
        'precondition: embeddings key must be absent before the run'
      );

      // When: spawn the CLI with ISDLC_FORCE_INTERACTIVE=1 and feed "y\n"
      //       through stdin. The env hook is the contract T006 must honor:
      //       "treat as TTY for the purposes of the opt-in prompt."
      const result = spawnSync(
        process.execPath,
        [BIN_PATH, 'generate', '.'],
        {
          cwd: root,
          input: 'y\n',
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 20_000,
          env: { ...process.env, ISDLC_FORCE_INTERACTIVE: '1' },
        }
      );

      // Then: .isdlc/config.json now contains an `embeddings` block whose
      //       shape matches buildInitialEmbeddingsBlock() from
      //       lib/install/embeddings-prompt.js (provider, model, server).
      const bytesAfter = readFileSync(configPathBefore.path, 'utf8');
      assert.notStrictEqual(
        bytesAfter,
        bytesBefore,
        'config.json must be updated after the opt-in "y" response'
      );
      const parsed = JSON.parse(bytesAfter);
      assert.ok(
        parsed.embeddings && typeof parsed.embeddings === 'object',
        'config.embeddings must be present after opt-in'
      );
      assert.strictEqual(
        parsed.embeddings.provider,
        'jina-code',
        'embeddings.provider must match buildInitialEmbeddingsBlock()'
      );
      assert.ok(
        parsed.embeddings.server && typeof parsed.embeddings.server === 'object',
        'embeddings.server block must be present'
      );

      // And: control flow reached the post-guard generation branch. We do
      //      not require a successful .emb (the temp root is not a real
      //      VCS), but the process must have proceeded past the guard --
      //      signalled by the "Generating embeddings for:" log line from
      //      runGenerate() body (bin/isdlc-embedding.js:227).
      const stdoutAll = result.stdout || '';
      assert.match(
        stdoutAll,
        /Generating embeddings for/,
        'post-guard generation branch must be reached after "y" opt-in'
      );
    }
  );

  // ----------------------------------------------------------------------
  // TG3 -- [P0] AC-250-01: TTY + "n" stdin -> abort, no changes
  // ----------------------------------------------------------------------
  it(
    '[P0] AC-250-01 TG3: Given opted-out config and TTY with stdin "n", When generate is invoked, Then abort with no changes',
    () => {
      // Given: temp root with config.json that has no `embeddings` key
      const root = makeTempRoot(JSON.stringify({ search: {} }));
      const configPath = join(root, '.isdlc', 'config.json');
      const bytesBefore = readFileSync(configPath, 'utf8');
      const mtimeBefore = statSync(configPath).mtimeMs;

      // When: spawn with ISDLC_FORCE_INTERACTIVE=1 and feed "n\n"
      const result = spawnSync(
        process.execPath,
        [BIN_PATH, 'generate', '.'],
        {
          cwd: root,
          input: 'n\n',
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 10_000,
          env: { ...process.env, ISDLC_FORCE_INTERACTIVE: '1' },
        }
      );

      // Then: exit code 0 (abort is a clean, user-directed exit)
      assert.strictEqual(
        result.status,
        0,
        `expected exit 0 on "n" abort, got ${result.status}. stderr=${result.stderr}`
      );

      // And: .isdlc/config.json is NOT modified (byte-equal pre/post)
      const bytesAfter = readFileSync(configPath, 'utf8');
      assert.strictEqual(
        bytesAfter,
        bytesBefore,
        'config.json must be byte-identical after "n" abort'
      );
      assert.strictEqual(
        statSync(configPath).mtimeMs,
        mtimeBefore,
        'config.json mtime must be unchanged after "n" abort'
      );

      // And: no .emb file written
      assert.strictEqual(
        hasEmbFile(root),
        false,
        'no .emb file should be written after "n" abort'
      );

      // And: the CLI did NOT reach the generation branch
      const stdoutAll = result.stdout || '';
      assert.doesNotMatch(
        stdoutAll,
        /Generating embeddings for/,
        'post-guard generation branch must NOT be reached after "n" abort'
      );
    }
  );

  // ----------------------------------------------------------------------
  // TG4 -- [P1] AC-250-01: opted-in config -> proceeds (no-regression)
  // ----------------------------------------------------------------------
  it(
    '[P1] AC-250-01 TG4: Given opted-in config, When generate is invoked, Then proceeds on happy path (no-regression)',
    () => {
      // Given: temp root whose config.json has `embeddings: { model: ... }`
      const root = makeTempRoot(
        JSON.stringify({ embeddings: { model: 'jina-code' } })
      );

      // When: spawn the CLI in non-TTY mode (env hook off).
      //       The guard should short-circuit to "allow-proceed" because
      //       hasUserEmbeddingsConfig() returns true for a present key.
      const result = spawnSync(
        process.execPath,
        [BIN_PATH, 'generate', '.'],
        {
          cwd: root,
          stdio: ['pipe', 'pipe', 'pipe'],
          encoding: 'utf8',
          timeout: 15_000,
          env: { ...process.env, ISDLC_FORCE_INTERACTIVE: '' },
        }
      );

      // Then: the CLI reached runGenerate()'s post-guard body. We do not
      //       assert a successful .emb build (the temp root is not a real
      //       VCS) -- only that control flow passed the opt-in guard and
      //       printed the "Generating embeddings for:" header.
      const stdoutAll = result.stdout || '';
      assert.match(
        stdoutAll,
        /Generating embeddings for/,
        'post-guard generation branch must be reached on opted-in config'
      );

      // And: no opt-out skip marker was emitted on stderr -- this is the
      //      anti-regression assertion that distinguishes TG4 from TG1.
      const stderrAll = result.stderr || '';
      assert.doesNotMatch(
        stderrAll,
        /isdlc[- ]embedding configure/i,
        'opted-in path must NOT emit the opt-out skip message'
      );
    }
  );
});
