/**
 * Tests for src/core/finalize/refresh-code-embeddings.js (F0009)
 *
 * REQ-GH-239 — Worker pool + engine parallelism
 * Scope: T003 scaffolds → T010 concrete bodies for FR-006/FR-007/FR-008 and
 *        NFR-006 fail-open paths.
 *
 * Traces: FR-006 (Opt-in via config presence),
 *         FR-007 (Refresh on finalize),
 *         FR-008 (First-time bootstrap safety),
 *         NFR-006 (Fail-open behavior),
 *         ERR-F0009-001 / ERR-F0009-002 / ERR-F0009-003
 *
 * Framework: node:test + node:assert/strict
 * Priority convention: [P0], [P1], [P2] prefix in the `it(...)` string.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  refreshCodeEmbeddings,
  BOOTSTRAP_BANNER,
} from './refresh-code-embeddings.js';

// ---------- Test helpers ----------

/**
 * Make a fake stdio stream that records every `write()` call.
 */
function makeSink() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      return true;
    },
    text() {
      return chunks.join('');
    },
    chunks,
  };
}

/**
 * Make a fake child_process.spawn that returns a ChildProcess-like object
 * whose stdout/stderr are EventEmitters and which will fire 'exit' with the
 * given code after the caller hooks listeners.
 *
 * @param {Object}  opts
 * @param {number}  opts.code       - exit code to fire
 * @param {string}  [opts.stdout]   - stdout payload to emit as a single chunk
 * @param {string}  [opts.stderr]   - stderr payload to emit as a single chunk
 * @param {Error}   [opts.spawnError] - if set, throws synchronously
 * @returns {{ spawn: Function, calls: Array }}
 */
function makeFakeSpawn({ code = 0, stdout = '', stderr = '', spawnError = null } = {}) {
  const calls = [];
  function spawn(cmd, args, spawnOpts) {
    calls.push({ cmd, args, opts: spawnOpts });
    if (spawnError) throw spawnError;

    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.unref = () => {};

    // Emit data + exit on next tick so caller has time to attach listeners.
    setImmediate(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout, 'utf8'));
      if (stderr) child.stderr.emit('data', Buffer.from(stderr, 'utf8'));
      child.stdout.emit('end');
      child.stderr.emit('end');
      child.emit('exit', code, null);
    });

    return child;
  }
  return { spawn, calls };
}

/**
 * Make a fake fs that reports `.emb` presence via a simple flag.
 */
function makeFakeFs({ hasEmb = true, throwOnRead = false } = {}) {
  return {
    existsSync() {
      return hasEmb;
    },
    readdirSync() {
      if (throwOnRead) throw new Error('readdir boom');
      return hasEmb ? ['code.emb', 'docs.emb'] : [];
    },
  };
}

/**
 * Make a fake fetch that returns a canned { status } on each call. Call
 * history is recorded in `.calls`.
 */
function makeFakeFetch(responses) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push({ url, init });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next && next.throw) throw next.throw;
    return { status: next.status };
  }
  fetchImpl.calls = calls;
  return fetchImpl;
}

function makeTempProject() {
  const root = mkdtempSync(join(tmpdir(), 'f0009-'));
  mkdirSync(join(root, '.isdlc'), { recursive: true });
  return root;
}

function cleanup(root) {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch { /* ignore */ }
}

// ---------- FR-006: opt-in via config presence ----------

describe('F0009 refresh-code-embeddings — FR-006 opt-in via config presence', () => {
  it(
    '[P0] REQ-GH-239 FR-006: Given .isdlc/config.json has no `embeddings` block, When F0009 runs, Then it skips silently and returns { status: "skipped", reason: "opted_out" }',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(join(root, '.isdlc', 'config.json'), JSON.stringify({ other: 'cfg' }));

        const fakeSpawn = makeFakeSpawn();
        const fakeFetch = makeFakeFetch({ status: 200 });

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: fakeFetch,
          _stdout: makeSink(),
          _stderr: makeSink(),
        });

        assert.equal(result.status, 'skipped');
        assert.equal(result.reason, 'opted_out');
        assert.equal(fakeSpawn.calls.length, 0, 'must not spawn child');
        assert.equal(fakeFetch.calls.length, 0, 'must not POST /reload');
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006: Given .isdlc/config.json has `embeddings: null`, When F0009 runs, Then it skips silently and returns { status: "skipped" }',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(join(root, '.isdlc', 'config.json'), JSON.stringify({ embeddings: null }));

        const fakeSpawn = makeFakeSpawn();
        const fakeFetch = makeFakeFetch({ status: 200 });

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: fakeFetch,
          _stdout: makeSink(),
          _stderr: makeSink(),
        });

        assert.equal(result.status, 'skipped');
        assert.equal(fakeSpawn.calls.length, 0);
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P0] REQ-GH-239 FR-006 + ERR-F0009-001: Given .isdlc/config.json is malformed JSON, When hasUserEmbeddingsConfig returns false, Then F0009 treats the project as opted out and does NOT throw',
    async () => {
      const root = makeTempProject();
      try {
        // Malformed JSON (trailing comma) — real hasUserEmbeddingsConfig catches
        // the parse error and returns false, so F0009 must treat it as opt-out.
        writeFileSync(join(root, '.isdlc', 'config.json'), '{ "embeddings": {,}');

        // Inject a version that throws, to exercise the defensive outer catch.
        const result = await refreshCodeEmbeddings(root, {
          _hasUserEmbeddingsConfig: () => { throw new Error('parse boom'); },
          _spawn: makeFakeSpawn().spawn,
          _fetch: makeFakeFetch({ status: 200 }),
          _stdout: makeSink(),
          _stderr: makeSink(),
        });

        assert.equal(result.status, 'skipped');
        assert.equal(result.reason, 'opted_out');
      } finally {
        cleanup(root);
      }
    }
  );
});

// ---------- FR-007: refresh on finalize ----------

describe('F0009 refresh-code-embeddings — FR-007 refresh on finalize', () => {
  it(
    '[P0] REQ-GH-239 FR-007: Given embeddings are configured and a .emb package exists, When F0009 runs, Then it spawns generate --incremental, prefixes [F0009] on output, and POSTs /reload on success',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code', server: { port: 7777 } } })
        );

        const fakeSpawn = makeFakeSpawn({
          code: 0,
          stdout: 'starting...\nGenerated 42 embeddings\ndone\n',
        });
        const fakeFetch = makeFakeFetch({ status: 200 });
        const stdoutSink = makeSink();
        const stderrSink = makeSink();

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: fakeFetch,
          _fs: makeFakeFs({ hasEmb: true }),
          _stdout: stdoutSink,
          _stderr: stderrSink,
        });

        // Spawn was invoked exactly once with the expected args
        assert.equal(fakeSpawn.calls.length, 1);
        const call = fakeSpawn.calls[0];
        assert.equal(call.cmd, 'node');
        const argv = call.args.join(' ');
        assert.match(argv, /isdlc-embedding\.js/);
        assert.ok(call.args.includes('generate'));
        assert.ok(call.args.includes('.'));
        assert.ok(call.args.includes('--incremental'));
        assert.equal(call.opts.cwd, root);

        // Output was forwarded with [F0009] prefix
        const out = stdoutSink.text();
        assert.match(out, /\[F0009\] starting\.\.\./);
        assert.match(out, /\[F0009\] Generated 42 embeddings/);

        // /reload was POSTed
        assert.equal(fakeFetch.calls.length, 1);
        assert.match(fakeFetch.calls[0].url, /\/reload$/);
        assert.equal(fakeFetch.calls[0].init.method, 'POST');

        // Success shape
        assert.equal(result.status, 'ok');
        assert.equal(result.serverReloaded, true);
        assert.equal(result.chunksProcessed, 42);
        assert.equal(typeof result.durationMs, 'number');
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P0] REQ-GH-239 FR-007: Given the embedding server is down, When the child process exits 0, Then F0009 auto-starts the server before POSTing /reload',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code', server: { port: 7777 } } })
        );

        // Count spawn invocations: first = generate, second = server auto-start
        const spawnCalls = [];
        const spawn = (cmd, args, spawnOpts) => {
          spawnCalls.push({ cmd, args, opts: spawnOpts });
          const child = new EventEmitter();
          child.stdout = new EventEmitter();
          child.stderr = new EventEmitter();
          child.unref = () => {};
          if (args.some(a => a.includes('isdlc-embedding.js'))) {
            // generate child
            setImmediate(() => {
              child.stdout.emit('end');
              child.stderr.emit('end');
              child.emit('exit', 0, null);
            });
          } else {
            // server auto-start: detached, never exits in the test window
            setImmediate(() => { /* no-op */ });
          }
          return child;
        };

        // First /reload call: ECONNREFUSED. Subsequent calls after auto-start: 200.
        let callIdx = 0;
        const fakeFetch = async (url, init) => {
          callIdx++;
          fakeFetch.calls.push({ url, init });
          if (callIdx === 1) {
            const err = new Error('fetch failed');
            err.cause = { code: 'ECONNREFUSED' };
            throw err;
          }
          return { status: 200 };
        };
        fakeFetch.calls = [];

        const result = await refreshCodeEmbeddings(root, {
          _spawn: spawn,
          _fetch: fakeFetch,
          _fs: makeFakeFs({ hasEmb: true }),
          _stdout: makeSink(),
          _stderr: makeSink(),
        });

        // Two spawn calls (generate + server auto-start)
        assert.equal(spawnCalls.length, 2);
        const serverCall = spawnCalls[1];
        assert.match(serverCall.args.join(' '), /isdlc-embedding-server\.js/);
        assert.equal(serverCall.opts.detached, true);

        // /reload was retried after auto-start
        assert.ok(fakeFetch.calls.length >= 2, 'fetch retried after auto-start');
        assert.equal(result.status, 'ok');
        assert.equal(result.serverReloaded, true);
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P0] REQ-GH-239 FR-007: Given embeddings.refresh_on_finalize === false, When F0009 runs, Then it returns { status: "skipped", reason: "disabled" } and does NOT spawn generate',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({
            embeddings: { provider: 'jina-code', refresh_on_finalize: false },
          })
        );

        const fakeSpawn = makeFakeSpawn();
        const fakeFetch = makeFakeFetch({ status: 200 });

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: fakeFetch,
          _stdout: makeSink(),
          _stderr: makeSink(),
        });

        assert.equal(result.status, 'skipped');
        assert.equal(result.reason, 'disabled');
        assert.equal(fakeSpawn.calls.length, 0);
        assert.equal(fakeFetch.calls.length, 0);
      } finally {
        cleanup(root);
      }
    }
  );
});

// ---------- FR-008: first-time bootstrap safety ----------

describe('F0009 refresh-code-embeddings — FR-008 first-time bootstrap safety', () => {
  it(
    '[P0] REQ-GH-239 FR-008: Given embeddings are configured but no .emb package exists, When F0009 runs, Then it returns { status: "bootstrap_needed" } and prints the one-line banner without spawning generate',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code' } })
        );

        const fakeSpawn = makeFakeSpawn();
        const fakeFetch = makeFakeFetch({ status: 200 });
        const stdoutSink = makeSink();

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: fakeFetch,
          _fs: makeFakeFs({ hasEmb: false }),
          _stdout: stdoutSink,
          _stderr: makeSink(),
        });

        assert.equal(result.status, 'bootstrap_needed');
        assert.match(result.reason, /no \.emb package/i);
        assert.equal(fakeSpawn.calls.length, 0);
        assert.equal(fakeFetch.calls.length, 0);

        // Exact one-line banner
        assert.ok(stdoutSink.text().includes(BOOTSTRAP_BANNER));
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P1] REQ-GH-239 FR-008: Given F0009 triggers the bootstrap banner, When a subsequent build runs with no .emb package, Then the banner fires again (no suppression)',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code' } })
        );

        const common = {
          _spawn: makeFakeSpawn().spawn,
          _fetch: makeFakeFetch({ status: 200 }),
          _fs: makeFakeFs({ hasEmb: false }),
          _stderr: makeSink(),
        };

        const out1 = makeSink();
        const r1 = await refreshCodeEmbeddings(root, { ...common, _stdout: out1 });
        const out2 = makeSink();
        const r2 = await refreshCodeEmbeddings(root, { ...common, _stdout: out2 });

        assert.equal(r1.status, 'bootstrap_needed');
        assert.equal(r2.status, 'bootstrap_needed');
        assert.ok(out1.text().includes(BOOTSTRAP_BANNER));
        assert.ok(out2.text().includes(BOOTSTRAP_BANNER));
      } finally {
        cleanup(root);
      }
    }
  );
});

// ---------- NFR-006: fail-open behavior ----------

describe('F0009 refresh-code-embeddings — NFR-006 fail-open behavior', () => {
  it(
    '[P0] REQ-GH-239 NFR-006 + ERR-F0009-002: Given the child process exits non-zero, When F0009 observes the failure, Then it captures stderr, returns { status: "failed" }, and does NOT throw',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code' } })
        );

        const fakeSpawn = makeFakeSpawn({
          code: 1,
          stderr: 'boom\nfatal: something broke\n',
        });

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: makeFakeFetch({ status: 200 }),
          _fs: makeFakeFs({ hasEmb: true }),
          _stdout: makeSink(),
          _stderr: makeSink(),
        });

        assert.equal(result.status, 'failed');
        assert.match(result.reason, /non-zero exit/i);
        assert.ok(result.stderr.includes('boom'));
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P0] REQ-GH-239 NFR-006 + ERR-F0009-003: Given the child succeeds but /reload POST fails, When F0009 observes the reload error, Then it logs a warning, returns status "partial" with reload_failed: true, and does NOT throw',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code', server: { port: 7777 } } })
        );

        const fakeSpawn = makeFakeSpawn({ code: 0, stdout: 'Generated 5 embeddings\n' });
        // 500 error path — NOT ECONNREFUSED, so no auto-start.
        const fakeFetch = makeFakeFetch({ status: 500 });
        const stderrSink = makeSink();

        const result = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: fakeFetch,
          _fs: makeFakeFs({ hasEmb: true }),
          _stdout: makeSink(),
          _stderr: stderrSink,
        });

        assert.equal(result.status, 'partial');
        assert.equal(result.reload_failed, true);
        assert.equal(result.serverReloaded, false);
        assert.match(stderrSink.text(), /\[F0009\] warning/i);
      } finally {
        cleanup(root);
      }
    }
  );

  it(
    '[P0] REQ-GH-239 NFR-006: Given any internal failure path, When F0009 is awaited, Then the returned promise RESOLVES (never rejects)',
    async () => {
      const root = makeTempProject();
      try {
        writeFileSync(
          join(root, '.isdlc', 'config.json'),
          JSON.stringify({ embeddings: { provider: 'jina-code' } })
        );

        // Spawn ENOENT
        const spawnEnoent = () => {
          throw Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' });
        };
        const r1 = await refreshCodeEmbeddings(root, {
          _spawn: spawnEnoent,
          _fetch: makeFakeFetch({ status: 200 }),
          _fs: makeFakeFs({ hasEmb: true }),
          _stdout: makeSink(),
          _stderr: makeSink(),
        });
        assert.equal(r1.status, 'failed');
        assert.match(r1.reason, /spawn failed/i);

        // Reload connection refused AND auto-start also fails to bind
        const fakeSpawn = makeFakeSpawn({ code: 0 });
        const alwaysRefuse = async () => {
          const err = new Error('fetch failed');
          err.cause = { code: 'ECONNREFUSED' };
          throw err;
        };
        const r2 = await refreshCodeEmbeddings(root, {
          _spawn: fakeSpawn.spawn,
          _fetch: alwaysRefuse,
          _fs: makeFakeFs({ hasEmb: true }),
          _stdout: makeSink(),
          _stderr: makeSink(),
        });
        // Server never comes up, so status is 'partial' (reload_failed) not
        // 'failed' — the child generated successfully, only /reload broke.
        assert.equal(r2.status, 'partial');
        assert.equal(r2.reload_failed, true);

        // Config-read throws: treated as opted-out
        const r3 = await refreshCodeEmbeddings(root, {
          _hasUserEmbeddingsConfig: () => { throw new Error('config boom'); },
          _spawn: makeFakeSpawn().spawn,
          _fetch: makeFakeFetch({ status: 200 }),
          _stdout: makeSink(),
          _stderr: makeSink(),
        });
        assert.equal(r3.status, 'skipped');
        assert.equal(r3.reason, 'opted_out');
      } finally {
        cleanup(root);
      }
    }
  );
});
