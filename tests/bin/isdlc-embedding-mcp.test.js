/**
 * BUG-GH-250 — MCP bridge clean-exit (opt-in guard)
 * Traces: FR-006, AC-250-04 (TG7, TG8)
 *
 * Phase 06 T004 — RED-first failing tests. Production guard is added in T008
 * (bin/isdlc-embedding-mcp.js). Until then both tests are expected to FAIL:
 *   - TG7 fails because the module does not exit when opted out; it enters
 *     the readline stdin loop and hangs until the test's kill timeout.
 *   - TG8 is a positive no-regression test that will PASS both before and
 *     after the fix, guarding against accidental removal of the opt-in path.
 *
 * The tests exercise the real bin file as a child process, crossing the CLI
 * boundary exactly the way Claude Code / Codex / Antigravity invoke it.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..');
const MCP_BIN = join(REPO_ROOT, 'bin', 'isdlc-embedding-mcp.js');

const tempRoots = [];
function makeTempRoot(configContent) {
  const root = mkdtempSync(join(tmpdir(), 'bug-gh-250-mcp-'));
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
 * Spawn the MCP bridge in a child process with `cwd` set to a temp project
 * root. Returns a handle with the process and a promise that resolves with
 * { code, signal, stdout, stderr, elapsedMs } on exit.
 *
 * If the process has not exited by `killAfterMs`, it is forcefully killed
 * and the returned `code` is null (the test asserts on that to detect hang).
 */
function spawnMcpBridge(cwd, { killAfterMs = 2000 } = {}) {
  const start = Date.now();
  const child = spawn(process.execPath, [MCP_BIN], {
    cwd,
    env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });

  const killTimer = setTimeout(() => {
    try { child.kill('SIGKILL'); } catch { /* ignore */ }
  }, killAfterMs);

  const exited = new Promise((resolvePromise) => {
    child.on('exit', (code, signal) => {
      clearTimeout(killTimer);
      resolvePromise({
        code,
        signal,
        stdout,
        stderr,
        elapsedMs: Date.now() - start,
      });
    });
  });

  return { child, exited };
}

describe('BUG-GH-250 bin/isdlc-embedding-mcp.js — FR-006 opt-in guard', () => {
  it(
    '[P0] AC-250-04 TG7: Given opted-out config, When MCP bridge module loads, Then exit 0 within 500 ms with skip notice',
    async () => {
      // Given: temp root whose config.json has no `embeddings` key
      const root = makeTempRoot(JSON.stringify({}, null, 2));

      // When: spawn the MCP bridge
      const { exited } = spawnMcpBridge(root, { killAfterMs: 2000 });
      const result = await exited;

      // Then: process exited cleanly (code 0, not killed by SIGKILL)
      assert.notEqual(
        result.code,
        null,
        `MCP bridge did not exit on its own (likely hung in stdin loop). ` +
        `signal=${result.signal}, stderr=${JSON.stringify(result.stderr)}`
      );
      assert.equal(
        result.code,
        0,
        `expected exit code 0 on opt-out, got ${result.code}. ` +
        `stderr=${JSON.stringify(result.stderr)}`
      );

      // And: wall time under 500 ms soft bound (100 ms is the target per
      // fix-strategy.md; 500 ms is the flaky-test mitigation bound per
      // test-strategy.md §6). A 2000 ms kill timeout would also cause a
      // hard FAIL above; this assertion enforces the soft upper bound.
      assert.ok(
        result.elapsedMs < 500,
        `expected exit within 500 ms, took ${result.elapsedMs} ms`
      );

      // And: stderr matches a skip-notice marker. Accept any of the
      // phrases the fix-strategy permits ("opted out" is the canonical
      // form per bug-report.md line 81 and fix-strategy.md line 36).
      assert.match(
        result.stderr,
        /opted[\s-]?out|opt[\s-]?in|skipping|skip notice/i,
        `expected skip-notice in stderr, got ${JSON.stringify(result.stderr)}`
      );

      // And: no stdout data resembling an MCP JSON-RPC handshake
      assert.ok(
        !/"jsonrpc"\s*:\s*"2\.0"/.test(result.stdout),
        `unexpected JSON-RPC frame on stdout: ${JSON.stringify(result.stdout)}`
      );
    }
  );

  it(
    '[P1] AC-250-04 TG8: Given opted-in config, When MCP bridge module loads, Then handshake proceeds (no-regression)',
    async () => {
      // Given: temp root with embeddings.server configured (opt-in)
      const root = makeTempRoot(JSON.stringify({
        embeddings: { server: { port: 7777 } }
      }, null, 2));

      // When: spawn the MCP bridge and send a JSON-RPC `initialize` frame
      const { child, exited } = spawnMcpBridge(root, { killAfterMs: 3000 });

      const initializeFrame = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'bug-gh-250-test', version: '0.0.0' },
        },
      }) + '\n';

      // Collect the first line of stdout (the initialize response) before
      // the process can exit. If the module-load guard is wrong, the
      // process will exit on its own before we see any response.
      const firstStdoutLine = new Promise((resolvePromise) => {
        let buf = '';
        child.stdout.on('data', (chunk) => {
          buf += chunk.toString('utf8');
          const nl = buf.indexOf('\n');
          if (nl >= 0) resolvePromise(buf.slice(0, nl));
        });
      });

      // Give the child a beat to finish module load, then write the frame.
      // A 200 ms liveness window asserts the process stays alive past the
      // module-load guard (it is still running when we write to stdin).
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(
        child.exitCode,
        null,
        'MCP bridge exited during module load on opt-in config (should stay alive)'
      );
      child.stdin.write(initializeFrame);

      // Race the handshake response against the kill timer. If the bridge
      // is alive and responsive, we expect a JSON-RPC response on stdout.
      const responseLine = await Promise.race([
        firstStdoutLine,
        exited.then((r) => { throw new Error(
          `process exited before handshake response: code=${r.code} ` +
          `stderr=${JSON.stringify(r.stderr)}`
        ); }),
      ]);

      const response = JSON.parse(responseLine);
      assert.equal(response.jsonrpc, '2.0');
      assert.equal(response.id, 1);
      assert.ok(response.result, 'expected result object in initialize response');
      assert.equal(response.result.protocolVersion, '2024-11-05');
      assert.equal(response.result.serverInfo?.name, 'isdlc-embedding-mcp');

      // Tear down the child cleanly by closing stdin; the readline loop
      // emits 'close' and the bridge calls process.exit(0).
      child.stdin.end();
      const final = await exited;
      assert.equal(final.code, 0, 'expected clean exit after stdin close');
    }
  );
});
