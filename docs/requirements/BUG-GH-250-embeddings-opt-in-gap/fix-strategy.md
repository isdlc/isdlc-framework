# Fix Strategy: BUG-GH-250

**Slug**: BUG-GH-250-embeddings-opt-in-gap
**Analysis Phase**: 02-tracing
**Designed**: 2026-04-11
**Selected Approach**: A (per-site inline guards)

---

## Approaches

### Approach A — Per-site inline guards (SELECTED)

Import `hasUserEmbeddingsConfig` at the top of each violation site, add a ~6-line guard at function entry, handle the skip behavior locally.

**Pros**:
- Minimal code — ~4 guards × 6 lines = ~24 new lines total (plus imports and interactive prompt path)
- Each site gets exactly the skip behavior its context requires (prompt / refuse / exit / banner-note)
- Zero new abstractions — uses the primitive that already exists
- Pattern already proven in `src/core/finalize/refresh-code-embeddings.js:211-220` and `src/core/finalize/finalize-utils.js:184-198`
- Tests mirror the existing `refresh-code-embeddings.test.js` opt-out pattern

**Cons**:
- Guards are ~40% structurally similar across sites (read config, check key, emit message). Not duplication, but rhymes.
- If a future 5th entry point is added, the pattern must be remembered — no compile-time enforcement.

**Regression risk**: LOW

**Files affected**:

| # | File | Lines | Change |
|---|------|-------|--------|
| 1 | `bin/isdlc-embedding.js` | ~15 | Import guard; at `runGenerate()` entry, check opt-in. If false AND `process.stdout.isTTY && process.stdin.isTTY`: interactive prompt via readline reusing `lib/install/embeddings-prompt.js:buildInitialEmbeddingsBlock()` writer. If false AND non-TTY: one-line skip message + exit 0. |
| 2 | `src/claude/agents/discover-orchestrator.md` | ~10 | Step 7.9 gains a pre-check: single-line bash `node -e 'process.exit(JSON.parse(require("fs").readFileSync(".isdlc/config.json","utf8")).embeddings ? 0 : 1)'`. On exit 1, skip the generate block, add a note to the completion banner pointing at `isdlc-embedding configure`. |
| 3 | `bin/isdlc-embedding-server.js` | ~8 | Import guard; at `main()` entry, check opt-in. On false: stderr `[server] embeddings not configured — run 'isdlc-embedding configure' to enable` and `process.exit(1)`. |
| 4 | `bin/isdlc-embedding-mcp.js` | ~8 | Import guard; at module top-level (before line 47 `serverConfig = loadServerConfig()`), check opt-in. On false: `console.error('[isdlc-embedding-mcp] embeddings opted out — exiting cleanly')` + `process.exit(0)`. |

### Approach B — Shared opt-in guard helper (REJECTED)

Create `requireEmbeddingsOptIn(projectRoot, { interactive, quiet })` in `src/core/config/config-service.js`. Each caller invokes the helper and acts on the result.

**Pros**:
- Single place to evolve opt-in policy later
- Lint-able — future bypasses are easier to detect
- Encapsulates interactive-vs-programmatic decision in one place

**Cons**:
- Encoding 4 different skip behaviors (prompt, skip-silent, refuse, exit-clean) as helper options adds complexity that doesn't reduce total LOC
- The 4 sites have genuinely different needs (CLI wants readline, server wants exit code, MCP wants stderr+exit(0), discover wants a banner note) — the helper can't meaningfully unify them
- Extra indirection for a pattern that only repeats 4 times

**Verdict**: Rejected for GH-250 closure. Could be revisited if a 5th+ entry point appears in the future.

### Approach C — Conditional MCP registration at install time (REJECTED AS REPLACEMENT, NOTED AS OPTIONAL HARDENING)

Modify `install.sh`/`install.ps1` to conditionally include the `isdlc-embedding` MCP entry in `src/claude/settings.json` based on the opt-in answer.

**Pros**:
- Strongest possible guarantee — no child process at all when opted out
- Saves the cost of spawning + exiting every session for opted-out users

**Cons**:
- Requires install.sh + install.ps1 edits (already-shipped installers need handling for existing projects)
- Later opt-in via `isdlc-embedding configure` requires a settings.json patch — new coupling between config and settings
- Approach A's "exit cleanly" handles this case simply and keeps the policy in one place (the binary)

**Verdict**: Rejected as a replacement for Approach A. Could be stacked on top later if MCP-spawn overhead becomes measurable.

---

## Recommended Approach: A (per-site inline guards)

**Rationale**:
- 4 sites, 4 distinct skip behaviors, no meaningful unification opportunity → Approach A matches the problem shape
- Pattern already proven in the two compliant sites
- Tests can mirror existing `refresh-code-embeddings.test.js` structure
- Approach C is optionally stackable later if MCP-spawn overhead becomes measurable — not blocking GH-250 closure
- Total LOC delta is small (~41 lines of production code + ~200 lines of tests)

---

## Regression Risk Assessment

**Overall**: LOW. Guards are purely additive; the opted-in happy path is untouched at all 4 sites.

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Discover Step 7.9 pre-check has a JSON parsing bug → skips for opted-in users | LOW | HIGH (silent regression of user's intended workflow) | Mirror the exact JSON read pattern from `finalize-utils.js:184-198`. Add integration test for the agent-level check (T005). |
| MCP bridge `process.exit(0)` at module top-level changes Claude Code MCP handshake timing | LOW | MEDIUM (session start warning) | Tracing confirmed this is a known MCP pattern (servers that can't start exit cleanly). Add a test asserting exit(0) within 100ms for the opt-out case (T004). |
| Interactive CLI prompt fires in non-TTY contexts (CI, piped stdin) and hangs | MEDIUM | HIGH (CI breakage) | Guard the prompt with `process.stdout.isTTY && process.stdin.isTTY`. In non-TTY, fall through to silent skip. Add a test running `isdlc-embedding generate` with `stdio: 'pipe'` asserting it does NOT hang (T002). |
| Refactor of compliant sites (#5, #6) to use `hasUserEmbeddingsConfig` directly leaks into scope | LOW | LOW (scope creep) | Explicitly keep the two compliant sites unchanged in GH-250. Flag the duplication as a follow-up note. |
| Adding the guard breaks existing opted-in users whose config has `embeddings: {}` (empty object) | LOW | HIGH | `hasUserEmbeddingsConfig` returns `true` for `embeddings: {}` (present key, non-null). Verified in `tests/core/config/config-service.test.js` HUEC-03. No regression. |

---

## Test Gaps in Affected Area

**Current state**:
- `hasUserEmbeddingsConfig` itself has 7 unit tests (HUEC-01..07) at `tests/core/config/config-service.test.js` — solid baseline
- `refresh-code-embeddings.test.js` has opt-out skip tests (P0) — pattern source for the new tests
- **Zero** tests cover the 4 violation sites for the opt-out path

**Tests to add** (10 total, mirrors existing opt-out test pattern):

| Test ID | Site | Test | Rationale |
|---------|------|------|-----------|
| TG1 | `bin/isdlc-embedding.js` | `generate` with non-TTY and opted-out config → exit 0, no .emb written | Non-TTY skip path |
| TG2 | `bin/isdlc-embedding.js` | `generate` with mock TTY + "y" stdin → opt-in written, proceeds | Interactive prompt happy path |
| TG3 | `bin/isdlc-embedding.js` | `generate` with mock TTY + "n" stdin → abort, no changes | Interactive prompt opt-out path |
| TG4 | `bin/isdlc-embedding.js` | `generate` with opted-in config → proceeds as today | No-regression |
| TG5 | `bin/isdlc-embedding-server.js` | `main()` with opted-out config → exit 1, stderr message | Refuse-to-start path |
| TG6 | `bin/isdlc-embedding-server.js` | `main()` with opted-in config → starts listener | No-regression |
| TG7 | `bin/isdlc-embedding-mcp.js` | Module load with opted-out config → exit 0 within 100ms | Clean-exit path |
| TG8 | `bin/isdlc-embedding-mcp.js` | Module load with opted-in config → MCP handshake proceeds | No-regression |
| TG9 | `discover-orchestrator.md` Step 7.9 | Bash pre-check with opted-out config → exit 1 (skip block) | Agent-level logic test |
| TG10 | `discover-orchestrator.md` Step 7.9 | Bash pre-check with opted-in config → exit 0 (run block) | No-regression |

**Shared test fixture** (efficiency note, not blocking): a helper that creates a temp `.isdlc/config.json` in a temp directory with/without the `embeddings` key, used by all 4 site test files. Kept inline per test file for now; extraction to `tests/bin/_fixtures.js` is a scope-adjacent cleanup flagged for follow-up.

---

## Out of Scope (Flagged for Follow-up)

- **`lib/memory-embedder.js`** — session record embeddings, different data flow. Separate opt-in signal arguably needed. Not part of GH-250.
- **Duplicate raw-read collapsing** — `src/core/finalize/finalize-utils.js:184-198` duplicates the `hasUserEmbeddingsConfig` logic inline. Collapsing this to a direct call is cleanup, not a bug fix.
- **ESLint rule / pre-commit grep** — forbidding `config.embeddings || {}` outside `src/core/config/` would prevent regressions. Regression prevention, optional hardening.
