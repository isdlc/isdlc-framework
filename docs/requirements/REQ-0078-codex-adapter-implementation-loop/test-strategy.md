# Test Strategy: Codex Adapter for Implementation Loop

**Item**: REQ-0078 | **GitHub**: #142
**Phase**: 05 - Test Strategy

---

## 1. Test Scope

### In Scope

| Area | What We Test |
|------|-------------|
| Codex loop runner | `runImplementationLoop()` drives the core loop correctly |
| File ordering parity | Same fixture files produce same ordering as core direct |
| Verdict routing parity | Same verdict sequences produce same actions and state |
| State evolution parity | Loop state at every checkpoint matches core direct |
| Contract shapes | Writer/Reviewer/Updater contexts match JSON schemas |
| spawnCodexAgent stub | Stub returns correct contract-conforming results |
| State persistence | State round-trips through readState/writeState |
| TDD ordering | Codex path respects test-before-source ordering |
| Error handling | Invalid verdicts, missing files, bad teamSpec |

### Out of Scope

| Area | Reason |
|------|--------|
| Real Codex CLI agent spawning | Deferred to REQ-0114 |
| Codex installation/doctor | REQ-0115 |
| Other team types | REQ-0078 is implementation loop only |
| Performance benchmarks | Not required for parity proof |

## 2. Test Approach: Parity Testing

The core testing strategy is **parity verification**: feed identical inputs (file lists and verdict sequences from existing fixtures) to both the core `ImplementationLoop` (direct) and the Codex adapter `runImplementationLoop`, then assert identical outputs.

### Fixture Reuse

All 9 existing parity fixtures from REQ-0077 are reused:

| Fixture | Tests |
|---------|-------|
| `all-pass.json` | 3-file all-PASS parity |
| `revise-then-pass.json` | REVISE/PASS cycle parity |
| `max-cycles-fail.json` | Max cycles exhaustion parity |
| `empty-files.json` | Empty file list edge case |
| `single-file-pass.json` | Single file trivial case |
| `large-file-list.json` | 100-file stress test parity |
| `tdd-ordering-4-features.json` | TDD ordering parity |
| `mixed-verdicts.json` | Mixed verdict sequence parity |
| `max-cycles-boundary.json` | Boundary cycle parity |

### spawnCodexAgent Mock Strategy

The `spawnCodexAgent(role, context)` function is stubbed to return structured results matching each role's output contract:

- **Writer**: `{ file_produced: context.file_path, content_summary: "..." }`
- **Reviewer**: `{ verdict: <from fixture>, findings: { blocking: [...], warning: [...] } }`
- **Updater**: `{ fixes_applied: [...], tests_passed: true }`

The mock reviewer's verdict is driven by a pre-loaded sequence from the fixture, consuming one verdict per call. This allows deterministic replay of any fixture scenario.

## 3. Test Cases

### CP-01 through CP-09: Core Parity (one per fixture)

Each test:
1. Runs the fixture through core `ImplementationLoop` directly (reference path)
2. Runs the same fixture through the Codex adapter `runImplementationLoop` (codex path)
3. Asserts: completed_files match, verdict history matches, cycle counts match, final action matches

### CP-10: Contract Shape Validation

Verifies that the Codex adapter's spawnCodexAgent receives contexts matching the JSON schemas (writer-context.json, review-context.json, update-context.json).

### CP-11: State Persistence Parity

Verifies that loop state written by the Codex adapter can be read back and produces identical resume behavior as the core direct path.

### CP-12: Error Handling

Verifies that the Codex adapter propagates errors from the core (invalid verdict, missing teamSpec fields) without masking them.

## 4. Test Infrastructure

- **Framework**: `node:test` (project standard)
- **Assertions**: `node:assert/strict`
- **Test location**: `tests/core/teams/codex-adapter-parity.test.js`
- **Runner command**: `node --test tests/core/teams/codex-adapter-parity.test.js`
- **Fixtures**: Reused from `tests/core/fixtures/parity-sequences/`

## 5. Coverage Target

- **Line coverage**: >= 80% of `codex-adapter/implementation-loop-runner.js`
- **Branch coverage**: >= 80% (PASS/REVISE/fail paths all exercised)
- **Function coverage**: 100% of exported functions

## 6. Acceptance Criteria Mapping

| AC | Test Cases |
|----|-----------|
| AC-001-01 | CP-01 through CP-09 (adapter invokes core loop) |
| AC-001-02 | CP-10 (sub-agent receives correct contract) |
| AC-001-03 | CP-01 through CP-09 (processVerdict fed back) |
| AC-002-01 | CP-01 through CP-09 (identical loop state) |
| AC-002-02 | CP-11 (state.json fields match) |
| AC-003-01 | CP-01 through CP-09 (same files produced) |
| AC-003-02 | CP-01 through CP-09 (same cycle counts) |
| AC-004-01 | Instruction files exist and contain role-specific content |
| AC-004-02 | Runner lives in isdlc-codex repo |
