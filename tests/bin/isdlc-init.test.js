/**
 * Tests for bin/isdlc.js init / install.sh / PowerShell installer —
 * install-time embeddings opt-in prompt.
 *
 * REQ-GH-239 — Worker pool + engine parallelism
 * Scope: T003 scaffolds — FR-010 install-time opt-in prompt, NFR-006 fail-open.
 *
 * Traces: FR-010 (Install-time opt-in prompt),
 *         FR-006 (Opt-in via config presence),
 *         NFR-006 (Fail-open behavior),
 *         ERR-INSTALL-001 (EOF / broken stdin defaults to NO)
 *
 * Phase 06 (T013) landed the installer helper at
 * `lib/install/embeddings-prompt.js` with the DI pattern the scaffolds
 * anticipated — a readline-like interface + writer hook so test bodies
 * can drive the prompt without touching real stdin/stdout.
 *
 * Framework: node:test + node:assert/strict
 * Priority convention: [P0], [P1], [P2] prefix in the `it(...)` string.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  promptEmbeddings,
  parseEmbeddingsAnswer,
  buildInitialConfig,
  buildInitialEmbeddingsBlock,
  getEmbeddingsPostHint,
  EMBEDDINGS_PROMPT_TEXT,
  EMBEDDINGS_BANNER_LINES,
  EMBEDDINGS_ENABLED_HINT,
  EMBEDDINGS_DISABLED_HINT,
} from '../../lib/install/embeddings-prompt.js';

/**
 * Build a mock readline interface that returns a scripted answer when
 * `question()` is called. Captures the prompt text so tests can assert it.
 */
function mockRl(answer) {
  const calls = [];
  return {
    calls,
    question: async (text) => {
      calls.push(text);
      return answer;
    },
  };
}

/**
 * Build a mock readline interface that rejects with the given error.
 * Models EOF and broken-pipe scenarios.
 */
function brokenRl(err) {
  return {
    question: async () => {
      throw err;
    },
  };
}

/**
 * Capture lines written via the `write` DI hook.
 */
function makeWriter() {
  const lines = [];
  return {
    lines,
    write: (line) => lines.push(line),
  };
}

describe('isdlc init — FR-010 install-time embeddings opt-in prompt', () => {
  it('[P0] PROMPT-01: Given interactive mode, When prompt displayed, Then banner + prompt text match the binding wording exactly', async () => {
    // Given: an interactive rl and a capturing writer
    const rl = mockRl('');
    const w = makeWriter();

    // When: the helper runs
    await promptEmbeddings(rl, { write: w.write });

    // Then: banner lines are emitted in the exact install.sh order
    assert.deepEqual(w.lines, [
      '',
      'Code Embeddings (Optional)',
      'Enables semantic code search, sprawl detection, duplication analysis.',
      'First generation: ~30-60 min on medium codebases. Refresh: seconds-minutes.',
      '',
    ]);

    // And: the prompt text passed to rl.question is the binding string
    assert.equal(rl.calls.length, 1);
    assert.equal(rl.calls[0], 'Enable code embeddings for semantic search? [y/N]: ');
    // Sanity-check the exported constant matches (defensive against drift)
    assert.equal(EMBEDDINGS_PROMPT_TEXT, 'Enable code embeddings for semantic search? [y/N]: ');
    assert.deepEqual([...EMBEDDINGS_BANNER_LINES], [
      '',
      'Code Embeddings (Optional)',
      'Enables semantic code search, sprawl detection, duplication analysis.',
      'First generation: ~30-60 min on medium codebases. Refresh: seconds-minutes.',
      '',
    ]);
  });

  it('[P0] PROMPT-02: Given empty response (just Enter), When installer builds config, Then `embeddings` key is OMITTED entirely', async () => {
    // Given: user presses Enter → empty string
    const rl = mockRl('');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, false);

    // When: buildInitialConfig runs with the decision
    const config = buildInitialConfig({ enableEmbeddings: enabled });

    // Then: the `embeddings` key is not present at all
    assert.equal(Object.prototype.hasOwnProperty.call(config, 'embeddings'), false);
    assert.equal(config.embeddings, undefined);
    // And: the config is serializable without an `embeddings` entry
    const parsed = JSON.parse(JSON.stringify(config));
    assert.equal('embeddings' in parsed, false);
  });

  it('[P0] PROMPT-03: Given "y" response, When installer builds config, Then `embeddings` block is present with binding defaults', async () => {
    const rl = mockRl('y');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, true);

    const config = buildInitialConfig({ enableEmbeddings: enabled });
    assert.ok(config.embeddings, 'embeddings block must exist');
    assert.equal(config.embeddings.provider, 'jina-code');
    assert.equal(config.embeddings.model, 'jinaai/jina-embeddings-v2-base-code');
    assert.equal(config.embeddings.server.port, 7777);
    assert.equal(config.embeddings.server.host, 'localhost');
    assert.equal(config.embeddings.server.auto_start, true);
    assert.equal(config.embeddings.parallelism, 'auto');
    assert.equal(config.embeddings.device, 'auto');
    assert.equal(config.embeddings.dtype, 'auto');
    assert.equal(config.embeddings.batch_size, 32);
    assert.deepEqual(config.embeddings.session_options, {});
    assert.equal(config.embeddings.max_memory_gb, null);
    assert.equal(config.embeddings.refresh_on_finalize, true);
  });

  it('[P0] PROMPT-04: Given "yes" response, When installer processes, Then `embeddings` block is present (same as "y")', async () => {
    const rl = mockRl('yes');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, true);
    const config = buildInitialConfig({ enableEmbeddings: enabled });
    assert.ok(config.embeddings);
  });

  it('[P0] PROMPT-05: Given "Y" capital, When installer processes, Then case-insensitive match enables embeddings', async () => {
    const rl = mockRl('Y');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, true);
    // Also verify YES
    assert.equal(parseEmbeddingsAnswer('YES'), true);
  });

  it('[P0] PROMPT-06: Given "n" response, When installer builds config, Then `embeddings` key is OMITTED', async () => {
    const rl = mockRl('n');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, false);
    const config = buildInitialConfig({ enableEmbeddings: enabled });
    assert.equal('embeddings' in config, false);
  });

  it('[P1] PROMPT-07: Given "no" response, When installer processes, Then `embeddings` key is OMITTED', async () => {
    const rl = mockRl('no');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, false);
    const config = buildInitialConfig({ enableEmbeddings: enabled });
    assert.equal('embeddings' in config, false);
    // Also NO/No
    assert.equal(parseEmbeddingsAnswer('NO'), false);
    assert.equal(parseEmbeddingsAnswer('No'), false);
  });

  it('[P0] PROMPT-08: Given enable accepted, When installer finishes, Then the enabled post-hint is returned exactly', () => {
    const hint = getEmbeddingsPostHint(true);
    assert.equal(
      hint,
      "  → Embeddings enabled. Run 'isdlc-embedding generate .' to bootstrap."
    );
    assert.equal(hint, EMBEDDINGS_ENABLED_HINT);
  });

  it('[P0] PROMPT-09: Given decline, When installer finishes, Then the disabled post-hint is returned exactly', () => {
    const hint = getEmbeddingsPostHint(false);
    assert.equal(
      hint,
      "  → Embeddings disabled. Run 'isdlc-embedding configure' at any time to enable."
    );
    assert.equal(hint, EMBEDDINGS_DISABLED_HINT);
  });
});

describe('isdlc init — NFR-006 + ERR-INSTALL-001 fail-open on broken stdin', () => {
  it('[P0] FAILOPEN-INIT-01: Given EOF immediately, When prompt reached, Then defaults to NO and omits `embeddings`', async () => {
    // Given: a readline that rejects like an EOF stream
    const rl = brokenRl(Object.assign(new Error('ERR_USE_AFTER_CLOSE'), { code: 'ERR_USE_AFTER_CLOSE' }));
    const w = makeWriter();

    // When: the helper runs
    const enabled = await promptEmbeddings(rl, { write: w.write });

    // Then: default NO, config has no embeddings key
    assert.equal(enabled, false);
    const config = buildInitialConfig({ enableEmbeddings: enabled });
    assert.equal('embeddings' in config, false);
    // Banner still printed (advisory) — prompt swallow is internal
    assert.equal(w.lines[1], 'Code Embeddings (Optional)');
    // Disabled post-hint is the correct next step
    assert.equal(getEmbeddingsPostHint(enabled), EMBEDDINGS_DISABLED_HINT);
  });

  it('[P0] FAILOPEN-INIT-02: Given stdin errors mid-read (broken pipe), When read fails, Then defaults to NO and does NOT throw', async () => {
    // Given: a broken-pipe style error
    const rl = brokenRl(Object.assign(new Error('EPIPE'), { code: 'EPIPE' }));

    // When/Then: helper catches and returns false without propagating
    let threw = false;
    let result;
    try {
      result = await promptEmbeddings(rl, { write: () => {} });
    } catch {
      threw = true;
    }
    assert.equal(threw, false, 'helper must not throw on broken stdin');
    assert.equal(result, false);

    const config = buildInitialConfig({ enableEmbeddings: result });
    assert.equal('embeddings' in config, false);
  });

  it('[P0] FAILOPEN-INIT-03: Given missing rl interface (null), When helper runs, Then defaults to NO without crashing', async () => {
    // Given: no readline interface at all — simulates non-TTY short-circuit
    const result = await promptEmbeddings(null, { write: () => {} });
    assert.equal(result, false);

    // And: a bogus shape (no question method) also defaults to NO
    const result2 = await promptEmbeddings({}, { write: () => {} });
    assert.equal(result2, false);
  });

  it('[P1] FAILOPEN-INIT-04b: Given writer throws on every line, When prompt runs, Then banner swallow keeps prompt working', async () => {
    // Given: a writer that always throws (e.g. closed stdout pipe)
    const explodingWrite = () => { throw new Error('EBADF'); };
    const rl = mockRl('y');

    // When: the helper runs — swallow must not crash the prompt
    const enabled = await promptEmbeddings(rl, { write: explodingWrite });

    // Then: prompt still succeeds, answer still parsed
    assert.equal(enabled, true);
  });

  it('[P1] FAILOPEN-INIT-04: Given "maybe" non-y/non-n response, When answer parsed, Then treated as NO (fail-closed to opt-out)', async () => {
    const rl = mockRl('maybe');
    const enabled = await promptEmbeddings(rl, { write: () => {} });
    assert.equal(enabled, false);
    const config = buildInitialConfig({ enableEmbeddings: enabled });
    assert.equal('embeddings' in config, false);

    // Sanity: whitespace-only, arbitrary junk, numbers → all NO
    assert.equal(parseEmbeddingsAnswer('   '), false);
    assert.equal(parseEmbeddingsAnswer('1'), false);
    assert.equal(parseEmbeddingsAnswer('ok'), false);
    assert.equal(parseEmbeddingsAnswer(null), false);
    assert.equal(parseEmbeddingsAnswer(undefined), false);
    // Whitespace around yes should still parse yes (trim)
    assert.equal(parseEmbeddingsAnswer('  yes  '), true);
    assert.equal(parseEmbeddingsAnswer('\ty\n'), true);
  });
});

describe('isdlc init — buildInitialConfig shape (FR-006 opt-in via config presence)', () => {
  it('omits `embeddings` when enableEmbeddings is false (default)', () => {
    const config = buildInitialConfig();
    assert.equal('embeddings' in config, false);
    assert.ok(config.cache);
    assert.ok(config.provider);
    assert.equal(config.provider.default, 'claude');
  });

  it('omits `embeddings` when enableEmbeddings is explicitly false', () => {
    const config = buildInitialConfig({ enableEmbeddings: false });
    assert.equal('embeddings' in config, false);
  });

  it('includes `embeddings` when enableEmbeddings is true', () => {
    const config = buildInitialConfig({ enableEmbeddings: true });
    assert.ok(config.embeddings);
    assert.equal(config.embeddings.refresh_on_finalize, true);
  });

  it('buildInitialEmbeddingsBlock returns a fresh copy on every call', () => {
    const a = buildInitialEmbeddingsBlock();
    const b = buildInitialEmbeddingsBlock();
    assert.notStrictEqual(a, b, 'must be distinct objects');
    assert.notStrictEqual(a.server, b.server, 'nested objects must also be fresh');
    a.provider = 'mutated';
    assert.equal(b.provider, 'jina-code', 'mutation must not leak');
  });

  it('full config round-trips through JSON.stringify losslessly', () => {
    const enabled = buildInitialConfig({ enableEmbeddings: true });
    const roundTripped = JSON.parse(JSON.stringify(enabled));
    assert.deepEqual(roundTripped, enabled);
    assert.equal(roundTripped.embeddings.server.port, 7777);
    assert.equal(roundTripped.embeddings.max_memory_gb, null);
  });
});
