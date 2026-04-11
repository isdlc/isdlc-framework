/**
 * Install-time embeddings opt-in prompt helper.
 *
 * Traces:
 *   REQ-GH-239 FR-010 (Install-time opt-in prompt)
 *   REQ-GH-239 FR-006 (Opt-in via config presence)
 *   REQ-GH-239 NFR-006 (Fail-open behavior)
 *   REQ-GH-239 ERR-INSTALL-001 (EOF / broken stdin defaults to NO)
 *
 * Responsibilities:
 *   1. Display the exact banner + prompt text used by install.sh (binding).
 *   2. Read one line from a readline interface, defaulting to NO on:
 *        - empty input
 *        - anything that isn't y/Y/yes/YES
 *        - EOF / broken stdin (fail-open, Article X)
 *   3. Build the embeddings config block exactly as specified.
 *   4. Build the full initial .isdlc/config.json object, including or
 *      omitting the `embeddings` key based on the user's selection.
 *   5. Emit the bootstrap-or-configure hint line.
 *
 * Simplicity-first (Article V): this is a thin functional helper — no
 * classes, no state, no side effects beyond what the caller asks for.
 *
 * @module lib/install/embeddings-prompt
 */

/**
 * The exact banner text written to stdout before the prompt. Must match
 * install.sh character-for-character — the T003 scaffolds assert against
 * both paths using a single contract.
 *
 * @type {readonly string[]}
 */
export const EMBEDDINGS_BANNER_LINES = Object.freeze([
  '',
  'Code Embeddings (Optional)',
  'Enables semantic code search, sprawl detection, duplication analysis.',
  'First generation: ~30-60 min on medium codebases. Refresh: seconds-minutes.',
  '',
]);

/**
 * The exact prompt string passed to rl.question(). Matches install.sh
 * (`echo "Enable code embeddings for semantic search? [y/N]:"`) — readline's
 * question() does not append a newline, so we include a trailing space
 * so the cursor sits one column past the colon for better TTY ergonomics.
 *
 * @type {string}
 */
export const EMBEDDINGS_PROMPT_TEXT =
  'Enable code embeddings for semantic search? [y/N]: ';

/**
 * Hint line emitted after a successful enable selection.
 * @type {string}
 */
export const EMBEDDINGS_ENABLED_HINT =
  "  → Embeddings enabled. Run 'isdlc-embedding generate .' to bootstrap.";

/**
 * Hint line emitted after a disable / default selection.
 * @type {string}
 */
export const EMBEDDINGS_DISABLED_HINT =
  "  → Embeddings disabled. Run 'isdlc-embedding configure' at any time to enable.";

/**
 * Parse a raw answer string into a boolean enable/disable decision.
 *
 * Only explicit affirmatives (y, Y, yes, YES) enable. Anything else —
 * including empty string, "n", "no", "maybe", whitespace, null, or
 * undefined — is treated as NO. This is the "fail-closed to opt-out"
 * semantic from the task contract.
 *
 * @param {string|null|undefined} answer - raw response (may include whitespace)
 * @returns {boolean} true if enabled, false otherwise
 */
export function parseEmbeddingsAnswer(answer) {
  if (answer == null) return false;
  const normalized = String(answer).trim().toLowerCase();
  return normalized === 'y' || normalized === 'yes';
}

/**
 * Prompt the user for the embeddings opt-in decision.
 *
 * Dependency-injected IO: accepts a readline-like interface (anything with
 * a `question(text)` method that returns a Promise<string>) and an optional
 * output function (defaults to console.log). This is the DI pattern the
 * T003 scaffolds expect — tests can pass a mock `rl` and capture writes.
 *
 * Fail-open behavior (NFR-006 / ERR-INSTALL-001):
 *   - If `rl.question` throws or rejects (EOF, broken pipe, closed stream),
 *     the function returns `false` and does NOT propagate the error.
 *   - If `rl` is missing or lacks a `question` method, returns `false`.
 *   - The caller is responsible for creating/closing the readline interface;
 *     this helper deliberately does not own lifecycle.
 *
 * @param {{ question: (text: string) => Promise<string> } | null | undefined} rl
 *   Readline interface (typically from node:readline/promises).
 * @param {{ write?: (line: string) => void }} [options]
 *   Optional DI hook for output capture. Defaults to console.log.
 * @returns {Promise<boolean>} true if user opted in, false otherwise.
 */
export async function promptEmbeddings(rl, options = {}) {
  const write = options.write || ((line) => console.log(line));

  // Emit banner first — matches install.sh line-for-line.
  for (const line of EMBEDDINGS_BANNER_LINES) {
    try {
      write(line);
    } catch {
      // Swallow write errors — banner is advisory, not load-bearing.
    }
  }

  // Fail-safe: missing rl interface → default NO.
  if (!rl || typeof rl.question !== 'function') {
    return false;
  }

  let answer;
  try {
    answer = await rl.question(EMBEDDINGS_PROMPT_TEXT);
  } catch {
    // EOF, broken pipe, closed stream — fail-open to NO (ERR-INSTALL-001).
    return false;
  }

  return parseEmbeddingsAnswer(answer);
}

/**
 * Build the `embeddings` config block as specified by FR-010.
 *
 * Returns a fresh object on every call so callers can safely mutate the
 * result without corrupting other installs.
 *
 * @returns {object} the embeddings config block
 */
export function buildInitialEmbeddingsBlock() {
  return {
    provider: 'jina-code',
    model: 'jinaai/jina-embeddings-v2-base-code',
    server: {
      port: 7777,
      host: 'localhost',
      auto_start: true,
    },
    parallelism: 'auto',
    device: 'auto',
    dtype: 'auto',
    batch_size: 32,
    session_options: {},
    max_memory_gb: null,
    refresh_on_finalize: true,
  };
}

/**
 * Build the initial .isdlc/config.json object for a fresh install.
 *
 * When `enableEmbeddings` is truthy, includes an `embeddings` block with
 * defaults from {@link buildInitialEmbeddingsBlock}. When falsy, the
 * `embeddings` key is OMITTED entirely — not `null`, not `{}`. This is the
 * contract `hasUserEmbeddingsConfig()` reads (FR-006): presence of the key
 * signals opt-in, absence signals opt-out.
 *
 * The returned object is intended to be JSON.stringify'd and written to
 * `.isdlc/config.json` by the installer. Other top-level keys mirror the
 * shape of {@link src/core/config/config-defaults.DEFAULT_PROJECT_CONFIG}
 * but intentionally minimal — the framework's defaults-merge layer fills
 * the rest at read time.
 *
 * @param {{ enableEmbeddings?: boolean }} [flags]
 * @returns {object} config object ready for JSON.stringify
 */
export function buildInitialConfig(flags = {}) {
  const { enableEmbeddings = false } = flags;

  const config = {
    cache: {
      budget_tokens: 100000,
    },
    ui: {
      show_subtasks_in_ui: true,
    },
    provider: {
      default: 'claude',
    },
    roundtable: {
      verbosity: 'bulleted',
    },
    search: {},
    workflows: {},
  };

  if (enableEmbeddings) {
    config.embeddings = buildInitialEmbeddingsBlock();
  }

  return config;
}

/**
 * Return the correct post-selection hint line for a given decision.
 *
 * Pure function — no IO. Callers can print the result via any writer.
 *
 * @param {boolean} enabled - result of promptEmbeddings
 * @returns {string} the hint line
 */
export function getEmbeddingsPostHint(enabled) {
  return enabled ? EMBEDDINGS_ENABLED_HINT : EMBEDDINGS_DISABLED_HINT;
}
