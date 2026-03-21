# Test Strategy: Claude Parity Tests for Implementation Loop

**Item**: REQ-0077 | **GitHub**: #141 | **Depends on**: REQ-0076
**Phase**: 05 (Test Strategy)

---

## 1. Objective

Prove that the refactored `src/core/teams/implementation-loop.js` and `src/core/state/index.js` produce identical behavior to the current Claude inline implementation across all edge cases and boundary conditions. This establishes the parity verification pattern for all subsequent core extraction work.

## 2. Test Framework

- **Runner**: `node:test` (built-in, matches existing project patterns)
- **Assertions**: `node:assert/strict` (matches existing test files)
- **Command**: `npm run test:core` (runs `node --test tests/core/**/*.test.js`)
- **No external dependencies** required

## 3. Test Architecture

### 3.1 Fixture-Based Approach

All tests use deterministic fixture data -- no LLM calls, no randomness. Each fixture captures:
- Input state (file list, team spec)
- Verdict sequence (mock reviewer decisions)
- Expected output at each step (contexts, state transitions, final state)

### 3.2 Test Layers

| Layer | File | What It Tests |
|-------|------|---------------|
| Unit | `implementation-loop.test.js` | Individual method behavior (existing, 26 tests) |
| Contract | `contracts.test.js` | JSON Schema validation for 3 contracts (existing, 11 tests) |
| Integration/Parity | `implementation-loop-parity.test.js` | Full loop simulation against fixture sequences |
| State | `state-store.test.js` | Read/write/atomic persistence (existing, 11 tests) |

### 3.3 Fixture Directory Structure

```
tests/core/fixtures/parity-sequences/
  all-pass.json              (existing) - 3 files, all PASS
  revise-then-pass.json      (existing) - REVISE then PASS
  max-cycles-fail.json       (existing) - max cycles exhausted
  empty-files.json            (new) - empty file list edge case
  single-file-pass.json       (new) - single file trivial case
  large-file-list.json        (new) - 100+ files stress test
  tdd-ordering-4-features.json (new) - 4 feature pairs, TDD ordered
  mixed-verdicts.json          (new) - PASS-REVISE-PASS-REVISE-REVISE-PASS across 4 files
  max-cycles-boundary.json     (new) - boundary: exactly at max, one under, one over
```

## 4. Test Cases (Expanded Parity Coverage)

### 4.1 Edge Cases

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-09 | Empty file list produces immediate completion | `empty-files.json` | FR-001, AC-001-01 |
| PT-10 | Single file PASS completes in one step | `single-file-pass.json` | FR-001, AC-001-01 |
| PT-11 | 100+ file list processes correctly | `large-file-list.json` | FR-001, AC-001-01 |

### 4.2 TDD Ordering

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-12 | 4-feature TDD ordering: every test precedes its source | `tdd-ordering-4-features.json` | FR-001, AC-001-01 |
| PT-13 | TDD ordering with unpaired files appends them at end | inline | FR-001, AC-001-01 |
| PT-14 | TDD ordering with all-test files (no sources) preserves order | inline | FR-001, AC-001-01 |
| PT-15 | TDD ordering with all-source files (no tests) preserves order | inline | FR-001, AC-001-01 |

### 4.3 Mixed Verdict Sequences

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-16 | PASS-REVISE-PASS-REVISE-REVISE-PASS across 4 files | `mixed-verdicts.json` | FR-001, AC-001-02 |
| PT-17 | Verdict history records every verdict in order | `mixed-verdicts.json` | FR-001, AC-001-02 |

### 4.4 Max Cycles Boundary

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-18 | One under max cycles (cycle 2 of 3): REVISE returns update | `max-cycles-boundary.json` | FR-001, AC-001-03 |
| PT-19 | Exactly at max cycles (cycle 3 of 3): REVISE returns fail | `max-cycles-boundary.json` | FR-001, AC-001-03 |
| PT-20 | PASS at max cycle still succeeds (not blocked by cycle count) | inline | FR-001, AC-001-03 |

### 4.5 Contract Field Completeness

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-21 | WRITER_CONTEXT has all 7 required+optional fields with correct types | inline | FR-002, AC-002-01 |
| PT-22 | REVIEW_CONTEXT has all required fields with correct types | inline | FR-002, AC-002-02 |
| PT-23 | UPDATE_CONTEXT has all required fields including nested findings | inline | FR-002, AC-002-03 |
| PT-24 | UPDATE_CONTEXT cycle field matches current cycle_per_file value | inline | FR-002, AC-002-03 |

### 4.6 State Persistence Round-Trip

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-25 | Mid-loop state persists and resumes with identical behavior | inline | FR-003, AC-003-01 |
| PT-26 | State with verdicts history round-trips without data loss | inline | FR-003, AC-003-01 |
| PT-27 | State with cycle_per_file round-trips correctly | inline | FR-003, AC-003-01 |

### 4.7 Bridge Parity

| ID | Test | Fixture | FR Trace |
|----|------|---------|----------|
| PT-28 | CJS bridge processVerdict produces same result as ESM direct | inline | FR-004, AC-004-01 |
| PT-29 | CJS bridge buildWriterContext matches ESM direct output | inline | FR-004, AC-004-01 |
| PT-30 | CJS bridge state write+read matches ESM direct | inline | FR-004, AC-004-01 |

## 5. Coverage Targets

| Module | Target | Method |
|--------|--------|--------|
| `implementation-loop.js` | >= 95% line coverage | All branches exercised via fixtures |
| `state/index.js` | >= 90% line coverage | Happy path + error paths |
| `bridge/teams.cjs` | >= 80% line coverage | Bridge equivalence tests |
| `bridge/state.cjs` | >= 80% line coverage | Bridge equivalence tests |
| **Overall core/** | >= 85% | Weighted across modules |

## 6. Test Execution

```bash
# Run parity tests only
node --test tests/core/teams/implementation-loop-parity.test.js

# Run all core tests
npm run test:core

# Run with verbose output
node --test --test-reporter=spec tests/core/**/*.test.js
```

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Fixture data drifts from implementation | Fixtures are static snapshots; tests fail loudly on shape changes |
| Large file list test is slow | 100 files with all-PASS is O(n) -- under 50ms expected |
| CJS bridge import timing | Tests await bridge load; no race conditions |
| Temp directory cleanup | `after()` hooks with force cleanup on every test group |
