# Test Strategy: BUG-GH-250

**Slug**: BUG-GH-250-embeddings-opt-in-gap
**Phase**: 05 - Test Strategy & Design
**Designed**: 2026-04-11
**Parent artifacts**:
- [bug-report.md](./bug-report.md)
- [root-cause-analysis.md](./root-cause-analysis.md)
- [fix-strategy.md](./fix-strategy.md)
- [tasks.md](./tasks.md)

**Approach**: ATDD. Phase 05 produces `test.skip()` scaffolds that encode Given/When/Then acceptance criteria. Phase 06 flips the skip to real assertions and implements production guards until the tests pass (RED -> GREEN).

---

## 1. Scope

This bug fix enforces **FR-006 (REQ-GH-239)** — opt-in via raw `embeddings` key presence in `.isdlc/config.json` — at the four pre-existing embedding entry points that were left behind when `hasUserEmbeddingsConfig()` was added:

1. `bin/isdlc-embedding.js` (`generate` CLI)
2. `bin/isdlc-embedding-server.js` (`server start`)
3. `bin/isdlc-embedding-mcp.js` (MCP stdio bridge, module-level)
4. `src/claude/agents/discover-orchestrator.md` (Step 7.9 pre-check)

**Out of scope for this test strategy** (already covered elsewhere):
- `hasUserEmbeddingsConfig()` unit tests — `tests/core/config/config-service.test.js` HUEC-01..07
- `refresh-code-embeddings.js` F0009 async path opt-out — existing tests in `src/core/finalize/refresh-code-embeddings.test.js`
- `finalize-utils.js` F0009 sync adapter — indirectly covered by finalize tests
- `lib/memory-embedder.js` session-record embeddings — future work (different data flow)

---

## 2. Existing Test Infrastructure

| Item | Location | Status |
|------|----------|--------|
| Test runner | `node:test` (built-in) | Reused |
| Assertion lib | `node:assert/strict` | Reused |
| Coverage tool | c8 / nyc (project-level) | Reused |
| Opt-in primitive tests | `tests/core/config/config-service.test.js` HUEC-01..07 | Reused as pattern source |
| Opt-out skip pattern | `src/core/finalize/refresh-code-embeddings.test.js` | Reused as pattern source |
| Bin test directory | `tests/bin/` — already has `isdlc-embedding-incremental.test.js`, `isdlc-init.test.js` | Extended |
| Hooks/agents test dir | `src/claude/hooks/tests/` exists; task plan specifies `tests/claude/hooks/tests/` (new sub-tree) | Created per tasks.md |

**Strategy**: do NOT introduce a new runner, new assertion library, or a shared fixture module. Each new test file inlines its own temp-root helper (~10 lines) mirroring `makeTempRoot()` from `config-service.test.js:78`. Extraction to `tests/bin/_fixtures.js` is flagged follow-up per fix-strategy §"Shared test fixture".

---

## 3. Acceptance Criteria (Given/When/Then)

Acceptance criteria encode the Approach A contract from `fix-strategy.md`. They are the authoritative specification the Phase 06 tests must prove.

### AC-250-01 — `isdlc-embedding generate` CLI enforces opt-in

**Priority**: P0

**Given** a project root whose `.isdlc/config.json` has NO `embeddings` key
**And** the process is spawned in a non-TTY context (`stdin.isTTY` and `stdout.isTTY` both false)
**When** `bin/isdlc-embedding.js generate .` is invoked
**Then** the CLI exits with code `0`
**And** no `.emb` file is written under `docs/.embeddings/`
**And** stderr contains a one-line skip message referencing opt-out / `isdlc-embedding configure`
**And** no model download is attempted

**Given** a project root whose `.isdlc/config.json` has NO `embeddings` key
**And** the process is spawned in a TTY context with stdin `"y\n"`
**When** `runGenerate()` is invoked
**Then** the interactive readline prompt asks to enable embeddings
**And** on "y" the CLI writes a valid `embeddings` block into `.isdlc/config.json` (reusing `lib/install/embeddings-prompt.js:buildInitialEmbeddingsBlock()`)
**And** generation proceeds

**Given** a project root whose `.isdlc/config.json` has NO `embeddings` key
**And** the process is spawned in a TTY context with stdin `"n\n"`
**When** `runGenerate()` is invoked
**Then** the CLI aborts with exit code `0`
**And** `.isdlc/config.json` is NOT modified
**And** no `.emb` file is written

**Given** a project root whose `.isdlc/config.json` has `embeddings: { model: "jina-code" }`
**When** `runGenerate()` is invoked in any context
**Then** generation proceeds on the happy path (no-regression)

### AC-250-02 — discover Step 7.9 pre-check skips when opted out

**Priority**: P0

**Given** a project root whose `.isdlc/config.json` has NO `embeddings` key
**When** the discover-orchestrator Step 7.9 pre-check bash block executes (`node -e 'process.exit(JSON.parse(fs.readFileSync(".isdlc/config.json","utf8")).embeddings ? 0 : 1)'`)
**Then** the pre-check exits with code `1`
**And** the agent branches to the "skip + banner note" path
**And** `npx isdlc-embedding generate .` is NOT invoked
**And** the discover completion banner includes a one-line note pointing at `isdlc-embedding configure`

**Given** a project root whose `.isdlc/config.json` has `embeddings: { model: "jina-code" }`
**When** the same pre-check executes
**Then** the pre-check exits with code `0`
**And** the agent proceeds to `npx isdlc-embedding generate .` (no-regression)

### AC-250-03 — `isdlc-embedding server start` refuses to start when opted out

**Priority**: P0

**Given** a project root whose `.isdlc/config.json` has NO `embeddings` key
**When** `bin/isdlc-embedding-server.js main()` is invoked
**Then** it exits with code `1`
**And** stderr contains a message instructing the user to run `isdlc-embedding configure`
**And** no HTTP listener is bound on port 7777
**And** the embedding engine is NOT loaded

**Given** a project root whose `.isdlc/config.json` has `embeddings: {}` (present empty object)
**When** `main()` is invoked
**Then** the server starts normally (no-regression — `{}` is opt-in with defaults per HUEC-03 semantics)

### AC-250-04 — `isdlc-embedding-mcp.js` exits cleanly when opted out

**Priority**: P0

**Given** a project root whose `.isdlc/config.json` has NO `embeddings` key
**When** the MCP bridge module is loaded (Claude Code session spawn)
**Then** the process exits with code `0` within 100 ms
**And** stderr contains a one-line skip notice (`[isdlc-embedding-mcp] embeddings opted out — exiting cleanly` or equivalent)
**And** `loadServerConfig()` is NOT called
**And** no HTTP handshake is attempted against `localhost:7777`

**Given** a project root whose `.isdlc/config.json` has `embeddings: { server: { port: 7777 } }`
**When** the MCP bridge module is loaded
**Then** module initialization completes and the stdio JSON-RPC loop begins (no-regression)

### AC-250-05 — `hasUserEmbeddingsConfig` is the canonical opt-in primitive

**Priority**: P1

**Given** the four violation sites after the fix
**When** their guard logic is inspected via import graph
**Then** every site imports `hasUserEmbeddingsConfig` from `src/core/config/config-service.js`
**And** no violation site retains the legacy `cfg?.embeddings || {}` or `config.embeddings || {}` fall-through idiom as its opt-in decision
**And** the existing compliant sites (`refresh-code-embeddings.js`, `finalize-utils.js`) remain unchanged

This AC is enforced structurally (import presence + pattern absence) rather than via behavioural assertion. It anchors the anti-regression goal called out in `root-cause-analysis.md §"Evidence Summary"` and `fix-strategy.md §"Optional hardening"`.

---

## 4. Test Case Inventory — TG1..TG10

Direct 1:1 mapping to `fix-strategy.md §"Test Gaps in Affected Area"`. Each row lists the test file the Phase 06 task creates, the AC it proves, the priority, and the scaffold stub name.

| ID   | File (Phase 06 task)                                    | Target site                    | AC        | Priority | Scaffold name                                                               | Type      |
|------|---------------------------------------------------------|--------------------------------|-----------|----------|-----------------------------------------------------------------------------|-----------|
| TG1  | `tests/bin/isdlc-embedding.test.js` (T002)              | generate CLI                   | AC-250-01 | P0       | `[P0] AC-250-01 TG1: non-TTY + opted-out -> exit 0, no .emb written`        | negative  |
| TG2  | `tests/bin/isdlc-embedding.test.js` (T002)              | generate CLI                   | AC-250-01 | P0       | `[P0] AC-250-01 TG2: TTY + stdin "y" -> opt-in written, proceeds`           | positive  |
| TG3  | `tests/bin/isdlc-embedding.test.js` (T002)              | generate CLI                   | AC-250-01 | P0       | `[P0] AC-250-01 TG3: TTY + stdin "n" -> abort, no changes`                  | negative  |
| TG4  | `tests/bin/isdlc-embedding.test.js` (T002)              | generate CLI                   | AC-250-01 | P1       | `[P1] AC-250-01 TG4: opted-in config -> proceeds (no-regression)`           | positive  |
| TG5  | `tests/bin/isdlc-embedding-server.test.js` (T003)       | embedding server               | AC-250-03 | P0       | `[P0] AC-250-03 TG5: opted-out -> exit 1, stderr message`                   | negative  |
| TG6  | `tests/bin/isdlc-embedding-server.test.js` (T003)       | embedding server               | AC-250-03 | P1       | `[P1] AC-250-03 TG6: opted-in -> starts listener (no-regression)`           | positive  |
| TG7  | `tests/bin/isdlc-embedding-mcp.test.js` (T004)          | MCP bridge                     | AC-250-04 | P0       | `[P0] AC-250-04 TG7: opted-out -> exit 0 within 100 ms`                     | negative  |
| TG8  | `tests/bin/isdlc-embedding-mcp.test.js` (T004)          | MCP bridge                     | AC-250-04 | P1       | `[P1] AC-250-04 TG8: opted-in -> MCP handshake proceeds (no-regression)`    | positive  |
| TG9  | `tests/claude/hooks/tests/discover-step79-optin.test.cjs` (T005) | discover Step 7.9     | AC-250-02 | P0       | `[P0] AC-250-02 TG9: opted-out pre-check -> exit 1 (skip block)`            | negative  |
| TG10 | `tests/claude/hooks/tests/discover-step79-optin.test.cjs` (T005) | discover Step 7.9     | AC-250-02 | P1       | `[P1] AC-250-02 TG10: opted-in pre-check -> exit 0 (run block)`             | positive  |

**AC coverage**: 5/5 (100%).
- AC-250-01: TG1, TG2, TG3, TG4
- AC-250-02: TG9, TG10
- AC-250-03: TG5, TG6
- AC-250-04: TG7, TG8
- AC-250-05: structurally enforced — covered in Phase 08 code review against the compliant-imports grep (`fix-strategy.md §"Optional hardening"`)

**Priority distribution**: 7 × P0 (must-have RED in Phase 06), 3 × P1 (no-regression guards, still required for GREEN).

**Positive/Negative split**: 5 negative (skip/refuse/abort paths), 5 positive (opted-in happy paths or post-opt-in flows).

---

## 5. Traceability Matrix (this phase)

| AC        | FR     | Site file                                    | Test file                                                     | Test IDs        |
|-----------|--------|----------------------------------------------|---------------------------------------------------------------|-----------------|
| AC-250-01 | FR-006 | `bin/isdlc-embedding.js`                     | `tests/bin/isdlc-embedding.test.js`                           | TG1..TG4        |
| AC-250-02 | FR-006 | `src/claude/agents/discover-orchestrator.md` | `tests/claude/hooks/tests/discover-step79-optin.test.cjs`     | TG9, TG10       |
| AC-250-03 | FR-006 | `bin/isdlc-embedding-server.js`              | `tests/bin/isdlc-embedding-server.test.js`                    | TG5, TG6        |
| AC-250-04 | FR-006 | `bin/isdlc-embedding-mcp.js`                 | `tests/bin/isdlc-embedding-mcp.test.js`                       | TG7, TG8        |
| AC-250-05 | FR-006 | all four sites                               | (structural — Phase 08 code-review grep)                      | n/a             |

A machine-readable version is emitted alongside this document in Phase 06 if required. Phase 05 leaves the matrix inline here.

---

## 6. Test Pyramid

| Layer       | Tests         | Notes |
|-------------|---------------|-------|
| Unit        | TG9, TG10     | Pure bash/JSON pre-check — no child process, no fs side effects beyond temp root |
| Integration | TG1..TG8      | Each test spawns the bin file as a child process (`child_process.spawn`) or loads the module under a temp `projectRoot` — crosses the CLI boundary and exercises the real entry point. Required to validate non-TTY / TTY / module-load timing semantics that the guard depends on. |
| E2E         | (none)        | A full `/discover` -> `isdlc-embedding generate` E2E is out of scope for this bug fix. The discover-orchestrator agent pre-check is validated as a unit (TG9/TG10); the generate CLI is validated as integration (TG1..TG4). The interaction between the two is covered by AC-250-02 behavioural contract, not a live E2E. |

**Pyramid shape for this bug**: bottom-heavy — 2 unit, 8 integration, 0 E2E. This is intentional: guards at entry-point boundaries are integration-level concerns by nature (process spawn, TTY detection, exit codes), and `hasUserEmbeddingsConfig` already has 7 unit tests underneath.

---

## 7. Flaky Test Mitigation

| Risk                                                                       | Mitigation                                                                                                                                               |
|----------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| Child-process spawn races (TG1..TG8) — the process may not exit before assertion runs | Use `await`-wrapped `spawnSync` for deterministic exit, or wrap `spawn` in an explicit `Promise` resolved on `'exit'`. No sleep-based waits.             |
| MCP clean-exit timing assertion (TG7) could be flaky under slow CI         | Assert `< 500 ms` as the upper bound (not 100 ms) in the test body; the fix-strategy's 100 ms figure is the *target*, not the *fail threshold*. Document this gap with a comment in the test. |
| Temp-root pollution between tests                                          | Each test allocates its own `mkdtempSync` root and cleans up in `after()`. No shared state. Pattern already proven in `config-service.test.js:78-98`.    |
| TTY simulation fragility (TG2, TG3)                                        | Use a PTY library only if node's native `spawn` with `stdio: ['pipe', 'pipe', 'pipe']` + explicit readline mocking is insufficient. Preferred: inject a fake `readline.createInterface` via dependency hook at `runGenerate()` boundary to avoid real PTY. Decision deferred to Phase 06 T006 implementer — test scaffold notes both options. |
| Model download network flakiness leaking into opted-in no-regression tests (TG4, TG6, TG8) | Opted-in no-regression tests do NOT invoke real generation/listener — they assert that the guard allows control flow to reach the next function (stubbed or mocked). No network calls in the test suite. |
| Non-deterministic ordering when run in parallel (`node --test`)            | Tests use fresh temp roots, no shared module state, no global mocks. Default parallel execution is safe.                                                 |

No retries, no sleep loops, no "skip on CI" escape hatches. Failures indicate real issues.

---

## 8. Performance Test Plan

No performance assertions are introduced by this bug fix. The guard is a single raw JSON read + key-presence check (~1 ms) added at entry-point boundaries. It is measurably faster than the code paths it skips (model load, chunker, HTTP bind).

Implicit performance assertions encoded via correctness tests:
- **TG1**: asserts no `.emb` written — proves the ~30-60 min generation was skipped entirely.
- **TG7**: asserts MCP exit within 500 ms — bounds the worst-case time cost per Claude Code session start for opted-out users.
- **TG5**: asserts no HTTP listener bound — proves the server never opens a socket.

No dedicated benchmark suite, no `--perf` tests, no load generators. Re-evaluate if a future 5th entry point introduces a hot loop.

---

## 9. Test Data Plan

### Inputs

| Data shape                                    | Use                            | Used by    |
|-----------------------------------------------|--------------------------------|------------|
| `{}` (valid JSON, no `embeddings` key)        | opt-out: positive case         | TG1, TG3, TG5, TG7, TG9 |
| `{ embeddings: null }`                        | opt-out: explicit null case    | (coverage via HUEC-03; not re-asserted at entry points) |
| `{ embeddings: {} }`                          | opt-in with defaults           | TG6 (server no-regression) |
| `{ embeddings: { model: "jina-code" } }`      | opt-in, minimal                | TG4 (generate no-regression), TG10 |
| `{ embeddings: { server: { port: 7777 } } }`  | opt-in with server block       | TG8 (MCP no-regression) |
| `(no file)`                                   | missing config.json            | covered by HUEC-04 at the primitive level; not re-asserted at entry points |
| `{ not valid json,`                           | malformed JSON                 | covered by HUEC-05 at the primitive level; not re-asserted at entry points |

### Boundary Values

- `embeddings: undefined` (via key absence) vs `embeddings: null` (explicit) vs `embeddings: {}` (opt-in, zero-config) — the load-bearing distinction per `root-cause-analysis.md §H1 point 5`. Entry-point tests exercise the first and third only; the second is covered by HUEC-03 and is indistinguishable from the first at the behavioural level.
- TTY stdin `"y\n"` vs `"n\n"` vs empty (EOF) — TG2, TG3 cover explicit y/n; EOF maps to abort (same as "n" path).

### Invalid Inputs

- Malformed JSON — HUEC-05 already proves `hasUserEmbeddingsConfig` fail-opens to `false`. Entry-point guards inherit this via direct call, so a malformed config behaves identically to opted-out (safe by construction).
- Missing `.isdlc/` dir — HUEC-04 covers; same inheritance.

### Maximum-Size Inputs

Not applicable. The opt-in check reads a single key from a small JSON file; no size-sensitive behavior is introduced.

### Fixture Strategy

- Each test file inlines a ~10-line `makeTempRoot(configContent)` helper mirroring `config-service.test.js:78-98`.
- No shared fixture module in Phase 05. Extraction to `tests/bin/_fixtures.js` is a scope-adjacent cleanup flagged in `fix-strategy.md`.
- No fake model files, no fake `.emb` packages needed — the guards fire BEFORE any downstream file I/O.

---

## 10. `test.skip()` Scaffolds (Phase 06 RED seeds)

The following scaffolds are the Phase 05 deliverable seeds for Phase 06 tasks T002/T003/T004/T005. Each scaffold:
- Uses `test.skip()` (or `it.skip()`) so the suite is GREEN at end-of-phase-05 and RED the moment Phase 06 flips the skip.
- Embeds the Given/When/Then docstring inline.
- Names the test with `[P0|P1] AC-250-NN TGn:` prefix per the ATDD priority tagging protocol.
- Inlines a `makeTempRoot()` helper mirroring `config-service.test.js:78-98`.

> **Note**: These scaffolds are **specified here**, not written to disk in Phase 05. Phase 06 tasks T002/T003/T004/T005 create the files with these exact contents as their starting RED state. This respects the gate rule "ATDD `require_failing_test_first`: scaffolds should initially fail (`test.skip()` is fine as a starting point)" and the task plan dependency `T002..T005 blocked_by T001`.

### 10.1 `tests/bin/isdlc-embedding.test.js` (T002 seed)

```javascript
/**
 * BUG-GH-250 — generate CLI opt-in enforcement
 * Traces: FR-006, AC-250-01 (TG1, TG2, TG3, TG4)
 *
 * Phase 05 scaffold — test.skip() placeholders with GWT docstrings.
 * Phase 06 T002 implements the bodies; T006 implements the production guard.
 */

import { describe, it, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempRoots = [];
function makeTempRoot(configContent) {
  const root = mkdtempSync(join(tmpdir(), 'bug-gh-250-gen-'));
  tempRoots.push(root);
  mkdirSync(join(root, '.isdlc'), { recursive: true });
  if (configContent !== null) {
    writeFileSync(join(root, '.isdlc', 'config.json'), configContent, 'utf8');
  }
  return root;
}
after(() => {
  for (const r of tempRoots) {
    try { rmSync(r, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('BUG-GH-250 bin/isdlc-embedding.js generate — FR-006 opt-in guard', () => {
  it.skip(
    '[P0] AC-250-01 TG1: Given opted-out config and non-TTY, When generate is invoked, Then exit 0 and no .emb written',
    async () => {
      // Given: temp root with config.json that has no `embeddings` key
      // When:  spawn bin/isdlc-embedding.js generate <root> with stdio 'pipe' (non-TTY)
      // Then:  exit code 0
      // And:   no file exists under <root>/docs/.embeddings/
      // And:   stderr includes opt-out skip message referencing `isdlc-embedding configure`
    }
  );

  it.skip(
    '[P0] AC-250-01 TG2: Given opted-out config and TTY with stdin "y", When generate is invoked, Then opt-in written and generation proceeds',
    async () => {
      // Given: temp root with config.json that has no `embeddings` key
      // When:  invoke runGenerate() with injected fake readline answering "y"
      // Then:  .isdlc/config.json is updated to include an embeddings block (shape from
      //        lib/install/embeddings-prompt.js:buildInitialEmbeddingsBlock())
      // And:   control flow reaches the post-guard generation branch (stub/mock asserts reached)
    }
  );

  it.skip(
    '[P0] AC-250-01 TG3: Given opted-out config and TTY with stdin "n", When generate is invoked, Then abort with no changes',
    async () => {
      // Given: temp root with config.json that has no `embeddings` key
      // When:  invoke runGenerate() with injected fake readline answering "n"
      // Then:  .isdlc/config.json is NOT modified (byte-equal pre/post)
      // And:   no .emb file written
      // And:   exit code 0
    }
  );

  it.skip(
    '[P1] AC-250-01 TG4: Given opted-in config, When generate is invoked, Then proceeds on happy path (no-regression)',
    async () => {
      // Given: temp root with config.json containing `embeddings: { model: "jina-code" }`
      // When:  runGenerate() is invoked in any context
      // Then:  the guard short-circuits to allow-proceed
      // And:   the existing generation call chain is reached (asserted via stub)
    }
  );
});
```

### 10.2 `tests/bin/isdlc-embedding-server.test.js` (T003 seed)

```javascript
/**
 * BUG-GH-250 — embedding server refuse-to-start
 * Traces: FR-006, AC-250-03 (TG5, TG6)
 *
 * Phase 05 scaffold — test.skip() placeholders with GWT docstrings.
 * Phase 06 T003 implements the bodies; T007 implements the production guard.
 */

import { describe, it, after } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempRoots = [];
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

describe('BUG-GH-250 bin/isdlc-embedding-server.js main — FR-006 opt-in guard', () => {
  it.skip(
    '[P0] AC-250-03 TG5: Given opted-out config, When server main() runs, Then exit 1 with refuse message and no listener',
    async () => {
      // Given: temp root whose config.json has no `embeddings` key
      // When:  spawn bin/isdlc-embedding-server.js with CWD set to temp root and --no-listen harness hook disabled
      // Then:  exit code 1
      // And:   stderr includes `isdlc-embedding configure`
      // And:   no TCP bind on 7777 (verified by attempting a connect and asserting ECONNREFUSED)
    }
  );

  it.skip(
    '[P1] AC-250-03 TG6: Given opted-in config with embeddings: {}, When main() runs, Then server starts normally (no-regression)',
    async () => {
      // Given: temp root whose config.json has `embeddings: {}` (empty object — present key, opt-in per HUEC-03 semantics)
      // When:  invoke main() with a test port override (e.g., 0 for ephemeral)
      // Then:  the guard allows through and the listener binds successfully
      // And:   the test tears down the listener cleanly
    }
  );
});
```

### 10.3 `tests/bin/isdlc-embedding-mcp.test.js` (T004 seed)

```javascript
/**
 * BUG-GH-250 — MCP bridge clean-exit
 * Traces: FR-006, AC-250-04 (TG7, TG8)
 *
 * Phase 05 scaffold — test.skip() placeholders with GWT docstrings.
 * Phase 06 T004 implements the bodies; T008 implements the production guard.
 */

import { describe, it, after } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

describe('BUG-GH-250 bin/isdlc-embedding-mcp.js module load — FR-006 opt-in guard', () => {
  it.skip(
    '[P0] AC-250-04 TG7: Given opted-out config, When MCP bridge module loads, Then exit 0 within 500 ms with skip notice',
    () => {
      // Given: temp root whose config.json has no `embeddings` key
      // When:  spawnSync('node', ['bin/isdlc-embedding-mcp.js'], { cwd: root, timeout: 2000 })
      // Then:  result.status === 0
      // And:   result.stderr.toString() includes 'opted out' (or equivalent skip marker)
      // And:   wall time < 500 ms (100 ms target per fix-strategy; 500 ms soft bound to avoid CI flake)
      // And:   no stdout data resembling an MCP JSON-RPC handshake
    }
  );

  it.skip(
    '[P1] AC-250-04 TG8: Given opted-in config, When MCP bridge module loads, Then handshake proceeds (no-regression)',
    () => {
      // Given: temp root whose config.json has `embeddings: { server: { port: 7777 } }`
      // When:  spawn the MCP bridge as a child process and write an MCP `initialize` JSON-RPC frame
      // Then:  the process stays alive past the module-load guard
      // And:   loadServerConfig() runs and returns the configured port
      // And:   the test tears the child down cleanly
    }
  );
});
```

### 10.4 `tests/claude/hooks/tests/discover-step79-optin.test.cjs` (T005 seed)

```javascript
/**
 * BUG-GH-250 — discover Step 7.9 pre-check
 * Traces: FR-006, AC-250-02 (TG9, TG10)
 *
 * Phase 05 scaffold — test.skip() placeholders with GWT docstrings.
 * Phase 06 T005 implements the bodies; T009 implements the production guard in
 * src/claude/agents/discover-orchestrator.md Step 7.9.
 *
 * CJS test file per tasks.md path (tests/claude/hooks/tests/...). Uses node:test CJS.
 */

const { describe, it, after } = require('node:test');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const tempRoots = [];
function makeTempRoot(configContent) {
  const root = mkdtempSync(join(tmpdir(), 'bug-gh-250-step79-'));
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

// The exact bash pre-check that discover-orchestrator Step 7.9 will execute
// after T009. Kept here literally so the test IS the contract.
const PRECHECK = `node -e 'process.exit(JSON.parse(require("fs").readFileSync(".isdlc/config.json","utf8")).embeddings ? 0 : 1)'`;

describe('BUG-GH-250 discover-orchestrator Step 7.9 — FR-006 pre-check', () => {
  it.skip(
    '[P0] AC-250-02 TG9: Given opted-out config, When Step 7.9 pre-check runs, Then exit 1 (skip block)',
    () => {
      // Given: temp root whose config.json has no `embeddings` key
      // When:  spawnSync('bash', ['-c', PRECHECK], { cwd: root })
      // Then:  result.status === 1
      // And:   the agent contract treats exit 1 as "skip the isdlc-embedding generate call + add banner note"
    }
  );

  it.skip(
    '[P1] AC-250-02 TG10: Given opted-in config, When Step 7.9 pre-check runs, Then exit 0 (run block)',
    () => {
      // Given: temp root whose config.json has `embeddings: { model: "jina-code" }`
      // When:  spawnSync('bash', ['-c', PRECHECK], { cwd: root })
      // Then:  result.status === 0
      // And:   the agent contract treats exit 0 as "proceed to npx isdlc-embedding generate ."
    }
  );
});
```

---

## 11. Coverage Targets

| Dimension           | Target                                     | Current | Post-fix  |
|---------------------|--------------------------------------------|---------|-----------|
| FR-006 entry points | 6/6 enforce `hasUserEmbeddingsConfig`      | 2/6     | 6/6       |
| AC-250-xx coverage  | 5/5 covered by at least 1 test             | 0/5     | 5/5       |
| Violation sites     | 4/4 have opt-out negative test             | 0/4     | 4/4       |
| Violation sites     | 4/4 have opt-in no-regression test         | 0/4     | 4/4       |
| Guard primitive     | 7 unit tests (HUEC-01..07)                 | 7/7     | 7/7 (unchanged) |

No line-coverage target is set specifically for this bug fix — the project-wide c8 budget applies, and the new tests add ~200 lines of exercised code across 4 files.

---

## 12. Task-to-Test Traceability

Per REQ-GH-212 FR-003 requirements, mapping Phase 06 implementation tasks to the tests they unlock.

| Phase 06 Task | File under test                          | Test file                                                  | Traces                  | Scenarios        |
|---------------|------------------------------------------|------------------------------------------------------------|-------------------------|------------------|
| T002          | `bin/isdlc-embedding.js` (tests)         | `tests/bin/isdlc-embedding.test.js`                        | FR-006, AC-250-01       | TG1, TG2, TG3, TG4 |
| T003          | `bin/isdlc-embedding-server.js` (tests)  | `tests/bin/isdlc-embedding-server.test.js`                 | FR-006, AC-250-03       | TG5, TG6         |
| T004          | `bin/isdlc-embedding-mcp.js` (tests)     | `tests/bin/isdlc-embedding-mcp.test.js`                    | FR-006, AC-250-04       | TG7, TG8         |
| T005          | discover-orchestrator.md (tests)         | `tests/claude/hooks/tests/discover-step79-optin.test.cjs`  | FR-006, AC-250-02       | TG9, TG10        |
| T006          | `bin/isdlc-embedding.js`                 | (unlocked by T002)                                         | FR-006, AC-250-01       | TG1..TG4 RED->GREEN |
| T007          | `bin/isdlc-embedding-server.js`          | (unlocked by T003)                                         | FR-006, AC-250-03       | TG5, TG6 RED->GREEN |
| T008          | `bin/isdlc-embedding-mcp.js`             | (unlocked by T004)                                         | FR-006, AC-250-04       | TG7, TG8 RED->GREEN |
| T009          | `src/claude/agents/discover-orchestrator.md` | (unlocked by T005)                                     | FR-006, AC-250-02       | TG9, TG10 RED->GREEN |

---

## 13. GATE-05 Self-Check

- [x] test-strategy.md exists at `docs/requirements/BUG-GH-250-embeddings-opt-in-gap/test-strategy.md`
- [x] All 5 ACs (AC-250-01..05) specified in Given/When/Then form
- [x] All 5 ACs covered by at least one test (AC-250-05 via structural enforcement noted explicitly)
- [x] All 10 test gaps (TG1..TG10) from `fix-strategy.md` listed with priority, type, site
- [x] `test.skip()` scaffolds specified for all 4 Phase 06 test files (T002/T003/T004/T005)
- [x] ATDD GWT requirement satisfied (`require_gwt: true`)
- [x] ATDD priority tagging applied (`enforce_priority_order: true`) — 7 × P0, 3 × P1
- [x] Test data plan covers boundary values, invalid inputs, and maximum-size inputs (maximum-size is N/A, justified)
- [x] Test pyramid documented (2 unit, 8 integration, 0 E2E)
- [x] Flaky test mitigation documented
- [x] Performance test plan addressed (none required, with justification)
- [x] Traceability matrix complete (5 AC -> 10 tests -> 4 sites)
- [x] No production code modified in this phase
- [x] No scaffold files written to disk in this phase (`require_failing_test_first` satisfied by Phase 06 creating files from the seeds in §10)
