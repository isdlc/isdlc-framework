/**
 * BUG-GH-250 — embedding server refuse-to-start (T003)
 *
 * Traces: FR-006, AC-250-03 (TG5 P0, TG6 P1)
 *
 * ATDD RED-phase tests for bin/isdlc-embedding-server.js opt-in guard.
 * These tests will FAIL until T007 lands the guard in main().
 *
 * TG5 (P0, negative): opted-out config -> exit 1, stderr "embeddings not configured".
 * TG6 (P1, positive / no-regression): opted-in config -> guard passes, listener starts
 *                                      (we observe the post-guard startup log then kill).
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_BIN = resolve(__dirname, '..', '..', 'bin', 'isdlc-embedding-server.js');

// --- fixture helpers ---------------------------------------------------------

const tempRoots = [];

/**
 * Create a temp project root containing .isdlc/config.json with the given content.
 * Returns the absolute path to the temp root (used as CWD for the child process).
 *
 * @param {string} configContent - raw JSON string to write to .isdlc/config.json
 * @returns {string} absolute path to the temp root
 */
function makeTempRoot(configContent) {
  const root = mkdtempSync(join(tmpdir(), 'bug-gh-250-srv-'));
  tempRoots.push(root);
  mkdirSync(join(root, '.isdlc'), { recursive: true });
  writeFileSync(join(root, '.isdlc', 'config.json'), configContent, 'utf8');
  return root;
}

after(() => {
  for (const r of tempRoots) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

/**
 * Pick a likely-free high port to avoid conflicts with a real server on 7777.
 */
function pickTestPort() {
  // Range 40000-49999 is generally free on dev machines
  return 40000 + Math.floor(Math.random() * 10000);
}

// --- tests -------------------------------------------------------------------

describe('BUG-GH-250 bin/isdlc-embedding-server.js main — FR-006 opt-in guard', () => {
  it(
    '[P0] AC-250-03 TG5: Given opted-out config, When server main() runs, Then exit 1 with refuse message and no listener',
    () => {
      // Given: temp root whose config.json has no `embeddings` key (opted out)
      const root = makeTempRoot('{}');
      const port = pickTestPort();

      // When: spawn the embedding-server binary with CWD set to the temp root
      const result = spawnSync(
        process.execPath,
        [SERVER_BIN, `--port=${port}`, '--host=127.0.0.1'],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 10_000,
          env: { ...process.env, NO_COLOR: '1' },
        }
      );

      // Then: exit code 1
      assert.equal(
        result.status,
        1,
        `expected exit code 1, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
      );

      // And: stderr includes the refuse message
      assert.match(
        result.stderr,
        /\[server\] embeddings not configured/,
        `stderr missing refuse message.\nstderr: ${result.stderr}`
      );

      // And: stderr points the user at `isdlc-embedding configure`
      assert.match(
        result.stderr,
        /isdlc-embedding configure/,
        `stderr missing configure hint.\nstderr: ${result.stderr}`
      );

      // And: the post-guard startup banner must NOT have been printed
      // (proves control flow never reached the listener setup block)
      assert.doesNotMatch(
        result.stdout,
        /\[server\] starting embedding server/,
        `unexpected startup banner — guard did not block.\nstdout: ${result.stdout}`
      );
    }
  );

  it(
    '[P1] AC-250-03 TG6: Given opted-in config with embeddings: {}, When main() runs, Then server starts normally (no-regression)',
    async () => {
      // Given: temp root whose config.json has `embeddings: {}` (empty object —
      // present key, non-null, counts as opt-in per HUEC-03 semantics)
      const root = makeTempRoot(JSON.stringify({ embeddings: {} }));
      const port = pickTestPort();

      // When: spawn the embedding-server binary and watch for the post-guard
      // startup banner (which the guard would have prevented if it incorrectly
      // rejected an opted-in config)
      const child = spawn(
        process.execPath,
        [SERVER_BIN, `--port=${port}`, '--host=127.0.0.1'],
        {
          cwd: root,
          env: { ...process.env, NO_COLOR: '1' },
        }
      );

      let stdout = '';
      let stderr = '';
      let earlyExitCode = null;

      child.stdout.on('data', (buf) => { stdout += buf.toString('utf8'); });
      child.stderr.on('data', (buf) => { stderr += buf.toString('utf8'); });

      const exited = new Promise((resolveExit) => {
        child.on('exit', (code) => {
          earlyExitCode = code;
          resolveExit();
        });
      });

      // Wait up to ~5s for either the startup banner (success) or early exit
      // (failure — guard incorrectly blocked, or some other fatal).
      const startedOrExited = await new Promise((resolveWait) => {
        const deadline = Date.now() + 5_000;
        const tick = setInterval(() => {
          if (stdout.includes('[server] starting embedding server')) {
            clearInterval(tick);
            resolveWait('started');
          } else if (earlyExitCode !== null) {
            clearInterval(tick);
            resolveWait('exited');
          } else if (Date.now() > deadline) {
            clearInterval(tick);
            resolveWait('timeout');
          }
        }, 50);
      });

      // Tear down: SIGTERM the child so we don't leak a listener or
      // trigger a real model download.
      if (earlyExitCode === null) {
        child.kill('SIGTERM');
        // Fallback hard-kill after another 2s in case SIGTERM is ignored.
        setTimeout(() => {
          if (earlyExitCode === null) child.kill('SIGKILL');
        }, 2_000).unref();
      }
      await exited;

      // Then: the startup banner was observed — the guard allowed control flow
      // through for the opted-in config
      assert.equal(
        startedOrExited,
        'started',
        `expected startup banner for opted-in config.\n` +
        `outcome: ${startedOrExited}\n` +
        `earlyExitCode: ${earlyExitCode}\n` +
        `stdout: ${stdout}\n` +
        `stderr: ${stderr}`
      );

      // And: the refuse message must NOT appear for an opted-in config
      assert.doesNotMatch(
        stderr,
        /\[server\] embeddings not configured/,
        `opted-in config was incorrectly rejected by the guard.\nstderr: ${stderr}`
      );
    }
  );
});
