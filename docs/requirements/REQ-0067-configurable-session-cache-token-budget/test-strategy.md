# Test Strategy: Configurable Session Cache Token Budget

**REQ-0067** | **Phase**: 05-test-strategy | **Generated**: 2026-03-16

---

## 1. Existing Infrastructure

- **Framework**: `node:test` (built-in Node.js test runner) + `node:assert/strict`
- **Module system**: CommonJS (`.cjs` extension) for all hook tests
- **Test location**: `src/claude/hooks/tests/*.test.cjs`
- **Test utilities**: `src/claude/hooks/tests/hook-test-utils.cjs` (setupTestEnv, cleanupTestEnv, writeState, readState, writeConfig, deepMerge)
- **Isolation pattern**: Temp directories created via `fs.mkdtempSync` with `CLAUDE_PROJECT_DIR` env var
- **Existing cache tests**: `test-session-cache-builder.test.cjs` (8 tests covering basic rebuildSessionCache behavior)
- **Cache reset**: `common._resetCaches()` available for clearing module-level caches between tests
- **Run command**: `node --test src/claude/hooks/tests/*.test.cjs`

## 2. Strategy for This Requirement

- **Approach**: Extend existing test suite -- add a new test file for readConfig() and budget allocation, and extend the existing `test-session-cache-builder.test.cjs` patterns for budget-integrated cache tests
- **New test file**: `src/claude/hooks/tests/test-config-budget.test.cjs` -- all readConfig() and budget allocation tests
- **Extended file**: Additional tests in `test-session-cache-builder.test.cjs` for budget-aware cache rebuild behavior
- **Naming convention**: Follow existing `test-*.test.cjs` pattern
- **Test IDs**: `TC-CFG-NN` for config tests, `TC-BDG-NN` for budget allocation tests, `TC-CLI-NN` for CLI reporting tests
- **Coverage target**: 100% of acceptance criteria (23 ACs across 8 FRs), >=80% line coverage for new code

## 3. Test Pyramid

### Unit Tests (24 tests)

Core function behavior tested in isolation with controlled file system state.

| ID | Requirement | AC | Test Description | Type |
|----|-------------|-----|------------------|------|
| TC-CFG-01 | FR-001 | AC-001-01 | readConfig() returns user-configured budget_tokens from `.isdlc/config` | positive |
| TC-CFG-02 | FR-001 | AC-001-02 | readConfig() fills missing section_priorities from defaults when only budget_tokens provided | positive |
| TC-CFG-03 | FR-001 | AC-001-03 | readConfig() returns full defaults when `.isdlc/config` does not exist | positive |
| TC-CFG-04 | FR-002 | AC-002-01 | readConfig() caches result -- second call does not re-read file | positive |
| TC-CFG-05 | FR-002 | AC-002-02 | readConfig() emits stderr warning and returns defaults on malformed JSON | negative |
| TC-CFG-06 | FR-002 | AC-002-03 | readConfig() emits stderr warning and defaults budget_tokens when value is negative | negative |
| TC-CFG-07 | FR-002 | AC-002-04 | readConfig() ignores unknown section names in section_priorities | positive |
| TC-CFG-08 | FR-006 | AC-006-01 | Default budget_tokens is 100000 | positive |
| TC-CFG-09 | FR-006 | AC-006-02 | Default section priorities match specification (constitution=1 through instructions=9) | positive |
| TC-CFG-10 | FR-007 | AC-007-01 | rebuildSessionCache runs successfully with no `.isdlc/config` present (defaults) | positive |
| TC-CFG-11 | FR-007 | AC-007-02 | readConfig() returns defaults when budget_tokens is a string "not_a_number" | negative |
| TC-CFG-12 | FR-002 | -- | readConfig() returns defaults when `.isdlc/config` is empty file (0 bytes) | negative |
| TC-CFG-13 | FR-002 | -- | readConfig() returns defaults when `.isdlc/config` contains a JSON array instead of object | negative |
| TC-CFG-14 | FR-001 | -- | readConfig() accepts budget_tokens of 0 (edge: no budget) or warns and defaults | negative |
| TC-CFG-15 | FR-002 | -- | readConfig() handles priority values that are not numbers (strings, booleans) | negative |
| TC-BDG-01 | FR-003 | AC-003-01 | Budget 50K tokens with 80K total content: only priority-ordered sections fitting within 50K are included | positive |
| TC-BDG-02 | FR-003 | AC-003-02 | Partial-fit section is truncated at last newline with truncation marker appended | positive |
| TC-BDG-03 | FR-003 | AC-003-03 | Budget 500K with 50K total: all sections included in full (ceiling, not target) | positive |
| TC-BDG-04 | FR-003 | AC-003-04 | Sections are ordered by priority -- lower-priority sections skipped first | positive |
| TC-BDG-05 | FR-004 | AC-004-01 | Budget exceeded: stderr warning emitted with actual vs budget token counts | positive |
| TC-BDG-06 | FR-004 | AC-004-02 | Budget not exceeded: no warning emitted | positive |
| TC-BDG-07 | FR-005 | AC-005-01 | External skill truncation: 3 skills with 40K remaining budget get ~13333 chars each | positive |
| TC-BDG-08 | FR-005 | AC-005-02 | External skill truncation: 10 skills with 5K remaining budget get minimum 1000 chars each | positive |
| TC-BDG-09 | FR-005 | AC-005-03 | Without `.isdlc/config`, external skill truncation uses budget-derived limit, not hardcoded 5000 | positive |

### Integration Tests (5 tests)

End-to-end cache rebuild behavior with config file present.

| ID | Requirement | AC | Test Description | Type |
|----|-------------|-----|------------------|------|
| TC-INT-01 | FR-001, FR-003 | AC-001-01, AC-003-01 | Full rebuild with `.isdlc/config` setting budget to 50K: cache file respects budget | positive |
| TC-INT-02 | FR-001, FR-006, FR-007 | AC-001-03, AC-006-01, AC-007-01 | Full rebuild without config file: backward-compatible behavior with 100K default | positive |
| TC-INT-03 | FR-003, FR-005 | AC-003-04, AC-005-03 | Full rebuild with custom priorities: sections ordered correctly, external skills use derived limits | positive |
| TC-INT-04 | FR-002, FR-003 | AC-002-02, AC-003-01 | Full rebuild with malformed `.isdlc/config`: falls back to defaults, cache generated successfully | negative |
| TC-INT-05 | FR-008 | AC-008-01, AC-008-02 | CLI rebuild-cache.js output includes budget reporting line and skipped sections | positive |

### Behavioral Tests (3 tests)

Verify contract-level behavior and state changes.

| ID | Requirement | AC | Test Description | Type |
|----|-------------|-----|------------------|------|
| TC-BEH-01 | FR-003 | AC-003-01 | Skipped sections produce `SKIPPED: budget_exceeded` markers in cache content | positive |
| TC-BEH-02 | FR-003 | AC-003-02 | Truncated sections end with `[... truncated for context budget ...]` marker | positive |
| TC-BEH-03 | CON-001, CON-002 | -- | No new require() calls for external packages; all imports are Node.js built-ins or existing modules | positive |

**Total: 32 test cases** (24 unit + 5 integration + 3 behavioral)

## 4. Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| Module cache leaking between tests | Call `common._resetCaches()` in `beforeEach` and delete `require.cache` entries before re-requiring |
| Temp directory cleanup failures | Use `try/finally` around every test with cleanup in `finally` block (existing pattern) |
| Stderr capture interference | Intercept `process.stderr.write` per-test with a mock function, restore in `afterEach` |
| File system race conditions | Each test creates its own temp directory -- no shared state (existing pattern) |
| Env variable leakage | Save/restore `process.env.CLAUDE_PROJECT_DIR` in `before`/`after` hooks (existing pattern) |

## 5. Performance Test Plan

| Concern | Approach | Threshold |
|---------|----------|-----------|
| readConfig() overhead | Benchmark 1000 calls with cache (should be <1ms each after first) | <1ms per cached call |
| rebuildSessionCache() regression | Compare wall-clock time with and without `.isdlc/config` on full project | No measurable regression (within 10% of baseline) |
| Budget allocation algorithm | Test with 9 sections (production count) -- O(n) should be negligible | <5ms for allocation step |

Performance is validated through assertion-free timing checks in integration tests, not as a separate suite. The budget allocation algorithm is O(n) where n=9 sections -- too small to justify dedicated performance testing.

## 6. Security Considerations

| Concern | Test Coverage |
|---------|--------------|
| Path traversal via config | TC-CFG-05, TC-CFG-11 -- malformed config cannot inject paths |
| Denial of service via huge budget | TC-BDG-03 -- budget is a ceiling, not a target; excess budget has no cost |
| Config file permissions | Not applicable -- `.isdlc/config` is a project file, not a secret |

## 7. Test Data Plan

### Valid Inputs

| Data | Purpose | Used In |
|------|---------|---------|
| `{"cache": {"budget_tokens": 150000}}` | Standard override, partial config | TC-CFG-01, TC-CFG-02 |
| `{"cache": {"budget_tokens": 50000}}` | Tight budget forcing truncation/skip | TC-BDG-01, TC-INT-01 |
| `{"cache": {"budget_tokens": 500000}}` | Generous budget, no truncation | TC-BDG-03 |
| `{"cache": {"section_priorities": {"constitution": 1, "roundtable_context": 3, "skills_manifest": 2}}}` | Custom priority override | TC-BDG-04, TC-INT-03 |
| No `.isdlc/config` file at all | Default experience | TC-CFG-03, TC-CFG-08, TC-CFG-09, TC-INT-02 |

### Boundary Values

| Data | Purpose | Used In |
|------|---------|---------|
| `{"cache": {"budget_tokens": 0}}` | Zero budget edge case | TC-CFG-14 |
| `{"cache": {"budget_tokens": 1}}` | Minimum possible budget | TC-BDG-01 (variant) |
| `{"cache": {"budget_tokens": 999999999}}` | Very large budget | TC-BDG-03 |
| 3 external skills + exactly 40000 chars remaining | Exact division boundary | TC-BDG-07 |
| 10 external skills + exactly 5000 chars remaining | Minimum floor trigger | TC-BDG-08 |
| Section content with no newlines (binary-like) | Truncation at line boundary edge | TC-BDG-02 |

### Invalid Inputs

| Data | Purpose | Used In |
|------|---------|---------|
| `not valid json{{{` | Malformed JSON | TC-CFG-05, TC-INT-04 |
| `{"cache": {"budget_tokens": -1}}` | Negative number | TC-CFG-06 |
| `{"cache": {"budget_tokens": "not_a_number"}}` | Wrong type | TC-CFG-11 |
| Empty file (0 bytes) | Empty config | TC-CFG-12 |
| `[1, 2, 3]` | JSON array instead of object | TC-CFG-13 |
| `{"cache": {"section_priorities": {"constitution": "high"}}}` | Non-numeric priority | TC-CFG-15 |
| `{"cache": {"section_priorities": {"unknown_section": 1}}}` | Unknown section name | TC-CFG-07 |

### Maximum-Size Inputs

| Data | Purpose | Used In |
|------|---------|---------|
| Section content of 400K characters (~100K tokens) | Exceeds typical budget | TC-BDG-01 |
| 10 external skill files of 10K chars each | Many skills competing for budget | TC-BDG-08 |
| Config file with 50 unknown section priorities | Forward-compatibility stress | TC-CFG-07 |

## 8. Traceability Matrix

| Requirement | AC | Test Case(s) | Priority |
|-------------|-----|-------------|----------|
| FR-001 | AC-001-01 | TC-CFG-01, TC-INT-01 | Must Have |
| FR-001 | AC-001-02 | TC-CFG-02 | Must Have |
| FR-001 | AC-001-03 | TC-CFG-03, TC-INT-02 | Must Have |
| FR-002 | AC-002-01 | TC-CFG-04 | Must Have |
| FR-002 | AC-002-02 | TC-CFG-05, TC-INT-04 | Must Have |
| FR-002 | AC-002-03 | TC-CFG-06 | Must Have |
| FR-002 | AC-002-04 | TC-CFG-07 | Must Have |
| FR-003 | AC-003-01 | TC-BDG-01, TC-BEH-01, TC-INT-01 | Must Have |
| FR-003 | AC-003-02 | TC-BDG-02, TC-BEH-02 | Must Have |
| FR-003 | AC-003-03 | TC-BDG-03 | Must Have |
| FR-003 | AC-003-04 | TC-BDG-04, TC-INT-03 | Must Have |
| FR-004 | AC-004-01 | TC-BDG-05 | Must Have |
| FR-004 | AC-004-02 | TC-BDG-06 | Must Have |
| FR-005 | AC-005-01 | TC-BDG-07 | Must Have |
| FR-005 | AC-005-02 | TC-BDG-08 | Must Have |
| FR-005 | AC-005-03 | TC-BDG-09, TC-INT-03 | Must Have |
| FR-006 | AC-006-01 | TC-CFG-08 | Must Have |
| FR-006 | AC-006-02 | TC-CFG-09 | Must Have |
| FR-007 | AC-007-01 | TC-CFG-10, TC-INT-02 | Must Have |
| FR-007 | AC-007-02 | TC-CFG-11 | Must Have |
| FR-008 | AC-008-01 | TC-INT-05 | Should Have |
| FR-008 | AC-008-02 | TC-INT-05 | Should Have |
| CON-001 | -- | TC-BEH-03 | Must Have |
| CON-002 | -- | TC-BEH-03 | Must Have |

**Coverage**: 23/23 acceptance criteria covered (100%). All 8 FRs and 3 constraints have test coverage.

## 9. Test Commands

```bash
# Run all hook tests (existing command)
node --test src/claude/hooks/tests/*.test.cjs

# Run only REQ-0067 config/budget tests
node --test src/claude/hooks/tests/test-config-budget.test.cjs

# Run session cache builder tests (extended with budget tests)
node --test src/claude/hooks/tests/test-session-cache-builder.test.cjs

# Run with verbose output
node --test --test-reporter spec src/claude/hooks/tests/test-config-budget.test.cjs
```

## 10. Test File Organization

```
src/claude/hooks/tests/
  test-config-budget.test.cjs          # NEW: readConfig() + budget allocation (TC-CFG-*, TC-BDG-*)
  test-session-cache-builder.test.cjs  # EXTEND: add TC-INT-01..05, TC-BEH-01..03
  hook-test-utils.cjs                  # EXISTING: shared test utilities (no changes needed)
```

## 11. Constitutional Compliance

| Article | Status | Evidence |
|---------|--------|----------|
| Article II (Test-First) | Compliant | 32 test cases designed before implementation; covers unit, integration, behavioral |
| Article VII (Traceability) | Compliant | 100% AC coverage (23/23); traceability matrix in Section 8 |
| Article IX (Quality Gate) | Compliant | All GATE-04 checklist items addressed |
| Article XI (Integration Testing) | Compliant | 5 integration tests validate real cache rebuild behavior; no mocks in integration tests |

## 12. GATE-04 Checklist

- [x] Test strategy covers unit, integration, E2E (behavioral), security, performance
- [x] Test cases exist for all requirements (8 FRs, 23 ACs, 3 constraints)
- [x] Traceability matrix complete (100% requirement coverage)
- [x] Coverage targets defined (>=80% line, 100% AC)
- [x] Test data strategy documented (valid, boundary, invalid, maximum-size)
- [x] Critical paths identified (readConfig fail-open, budget allocation, backward compatibility)
