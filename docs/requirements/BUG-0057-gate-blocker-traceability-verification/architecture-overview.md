# Architecture Overview: BUG-0057 — Gate-Blocker Traceability Verification

**Status**: Accepted
**Created**: 2026-03-25

---

## 1. Architecture Options

### Option A: Provider-Neutral Validation Pipeline (Selected)

**Summary**: Core validators as pure ESM modules in `src/core/validators/`. Claude hooks call via CJS bridge. Codex runtime imports directly. Single `validatePhase()` entry point handles parallelism.

| Aspect | Assessment |
|---|---|
| Pros | Same logic for both providers; pure functions are testable; hooks stay as Claude differentiator; Codex gets real enforcement |
| Cons | CJS→ESM bridge adds complexity; new module directory |
| Pattern alignment | Follows existing bridge pattern (REQ-0088); extends gate-logic with real checks |
| Verdict | **Selected** |

### Option B: Generalize ATDD Validator to All Modes

**Summary**: Remove the `when: "atdd_mode"` guard from atdd-completeness-validator.cjs and run it for all workflows.

| Aspect | Assessment |
|---|---|
| Pros | Less new code; reuses existing content-aware check |
| Cons | ATDD validator is Claude-hook-specific (CJS); doesn't solve Codex; doesn't cover gaps 2-6; couples non-ATDD to ATDD assumptions |
| Verdict | **Eliminated** — too narrow, doesn't address Codex or production code verification |

### Option C: Independent Verification Agent

**Summary**: A separate agent reviews each phase's artifacts independently, like a code reviewer for compliance.

| Aspect | Assessment |
|---|---|
| Pros | Could handle subjective checks; mirrors real audit process |
| Cons | Slow (agent delegation per gate); expensive (token cost per phase); hard to make deterministic |
| Verdict | **Eliminated** — overkill for regex-parseable traceability; reserved as future option for complex constitutional checks |

---

## 2. Selected Architecture

### ADR-001: Provider-Neutral Validation Pipeline

- **Status**: Accepted
- **Context**: Gate enforcement must work identically in Claude Code (hooks) and Codex (runtime). Validators must be pure, testable, and independent of provider infrastructure.
- **Decision**: Core validators as pure ESM modules. Single `validatePhase()` entry point. Claude hooks call via CJS bridge. Codex runtime imports directly.
- **Rationale**: Same guarantees, different trigger mechanisms. Hooks remain Claude's enforcement differentiator. Codex gets equivalent enforcement without hooks.
- **Consequences**: New `src/core/validators/` directory. CJS bridge needs dynamic `import()` support. Phase-loop controller retry protocol applies to both providers.

### ADR-002: Content-In / Structured-Result-Out Interface

- **Status**: Accepted
- **Context**: Validators need artifact content but shouldn't access the filesystem (keeps them pure and testable).
- **Decision**: Callers (hooks, runtime) handle path resolution and file reading. Validators receive content strings and return structured results.
- **Rationale**: Different providers have different path resolution. Pure functions are trivially testable. No mocking needed.
- **Consequences**: Callers must know which files to read per phase. This is configured in `iteration-requirements.json`.

### ADR-003: Parallel Execution Model

- **Status**: Accepted
- **Context**: Validators 1-4 are independent regex operations (milliseconds). Validator 5 per-article checks are also independent but may involve reasoning.
- **Decision**: Validators 1-4 via `Promise.all()`. Validator 5 supports agent teams (Claude) or `Promise.all` (Codex).
- **Rationale**: Fast validators don't benefit from agent teams overhead. Constitutional checks may benefit from parallel reasoning.
- **Consequences**: `validatePhase()` manages parallelism internally. Callers see a single async function.

### ADR-004: Fail-Open on Code Errors, Fail-Closed on Validation Failures

- **Status**: Accepted
- **Context**: A validator crash should never block a user's workflow. But a successful validation finding problems must block.
- **Decision**: Validator exceptions caught → `{ pass: true, failure_reason: "validator_error: ..." }` with logged warning. Successful parse finding failures → `{ pass: false, ... }` which blocks.
- **Rationale**: Article X (Fail-Safe Defaults) requires fail-open on errors. Article IX (Gate Integrity) requires fail-closed on real failures.
- **Consequences**: Validator errors are invisible to the agent but logged. Need monitoring to detect persistent validator bugs.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|---|---|---|---|
| ESM modules | Native | Consistent with `src/core/` and `src/providers/codex/` | CJS (wrong for core modules) |
| Dynamic `import()` | Native | CJS→ESM bridge interop | `require()` (can't load ESM), bundler (overkill) |
| Regex parsing | Native | Test IDs and AC IDs follow consistent patterns in codebase | AST parsing (overkill for markdown/test files) |
| `Promise.all` | Native | Parallel independent validators | Sequential (unnecessary wait) |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|---|
| IP-1 | `gate-logic.cjs` | `validate-phase.js` | Dynamic `import()` via bridge | Content strings → structured result | Bridge fallback to inline logic |
| IP-2 | `runtime.js` | `validate-phase.js` | Direct ESM import | Content strings → structured result | Fail-open on validator crash |
| IP-3 | `validate-phase.js` | `iteration-requirements.json` | `readFileSync` at init | JSON config | Default to empty checks |
| IP-4 | `validate-phase.js` | Validators 1-5 | `Promise.all` / agent teams | Content strings → per-validator result | Per-validator try/catch |
| IP-5 | Caller | `git diff` | Shell exec | File path list | Empty list on failure |

### Data Flow

```
Phase agent completes work
  → Caller (hook or runtime) reads artifacts from disk + git diff
  → Caller calls validatePhase(phaseKey, { requirementsSpec, testStrategy, testFiles, modifiedFiles, testOutput, constitution, ... })
  → validatePhase reads iteration-requirements for applicable checks
  → Runs applicable validators in parallel (Promise.all / agent teams)
  → Each validator: parse content → cross-reference → return structured result
  → validatePhase merges results → single { pass, failures[], details{} }
  → Caller: if pass=false → block (hook emits GATE BLOCKED / runtime blocks advancement)
  → Controller: re-delegates to phase agent with structured failure details
  → Retry up to 3 times, then escalate to user
```

---

## 5. Summary

| Metric | Value |
|---|---|
| New files | ~15 (6 validators + 7 article checks + 1 parser lib + 1 entry point) |
| Modified files | 4 (`gate-logic.cjs`, `bridge/validators.cjs`, `runtime.js`, `iteration-requirements.json`) |
| Test files | ~8 (one per validator + integration tests for bridge and runtime) |
| Config files | 1 (`.isdlc/config.json` — new `default_tier` key) |
| New dependencies | 0 |
| Risk level | Medium — touches gate enforcement path (critical infrastructure) but fail-open on errors |
