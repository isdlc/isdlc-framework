# Test Strategy: REQ-0140 — Conversational Enforcement via Stop Hook

**Requirement**: REQ-0140
**Source**: GitHub Issue #206
**Phase**: 05 - Test Strategy & Design
**Date**: 2026-03-25

---

## 1. Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`) with `node:assert/strict`
- **Coverage Tool**: None project-wide; CI runs test matrix (3 OS x 3 Node versions)
- **Test Conventions**: CJS test files (`.test.cjs`) in `src/claude/hooks/tests/`
- **Isolation**: `hook-test-utils.cjs` creates temp directories outside the package (Article XIII), copies hooks + `lib/` deps, spawns hooks as child processes
- **Current Test Count**: ~1300+ tests across 160+ test files
- **Existing Patterns**: `setupTestEnv()` / `cleanupTestEnv()` lifecycle, `prepareHook()` for hook isolation, `runHook()` for stdin/stdout process spawning

## 2. Strategy for This Requirement

- **Approach**: Extend existing test suite following established hook test conventions
- **New Test Types Needed**: Unit tests for the compliance engine (new module), unit tests for the Stop hook, unit tests for Codex output validation, integration tests for hook chain behavior
- **Coverage Target**: >=80% unit, >=70% integration (per Article II standard tier)
- **Test Location**: `src/claude/hooks/tests/` (hook and engine tests), `src/providers/codex/tests/` (Codex validator tests — referenced in module-design.md but tests will be CJS in hooks/tests for consistency)

## 3. Test Commands (use existing)

- Unit: `node --test src/claude/hooks/tests/conversational-compliance-engine.test.cjs`
- Hook: `node --test src/claude/hooks/tests/conversational-compliance-hook.test.cjs`
- Codex: `node --test src/claude/hooks/tests/conversational-compliance-codex.test.cjs`
- Integration: `node --test src/claude/hooks/tests/conversational-compliance-integration.test.cjs`
- All: `node --test src/claude/hooks/tests/conversational-compliance-*.test.cjs`

---

## 4. Test Pyramid

### 4.1 Unit Tests (Foundation — ~65 test cases)

Unit tests form the base of the pyramid, targeting pure functions with no I/O side effects.

**Engine unit tests** (`conversational-compliance-engine.test.cjs`):
- `loadRules()`: valid rules, invalid rules (skipped with warning), missing file (empty set), malformed JSON
- Rule filtering by `provider_scope` (claude-only, codex-only, both)
- Rule filtering by `trigger_condition` (config match, config mismatch, workflow match)
- Bulleted-format pattern check: threshold calculation, line classification (bullets, headings, tables, code blocks, prose)
- Sequential-domain-confirmation structural check: detect collapsed multi-domain output, single-domain output passes
- Elicitation-first state-match check: detect "analysis complete" without question, detect question presence
- Verdict construction: highest severity wins, all violations collected, corrective guidance populated
- Short-circuit: block violation found early returns without evaluating remaining rules
- Empty rule set: no violations returned

**Stop hook unit tests** (`conversational-compliance-hook.test.cjs`):
- Stdin parsing: valid JSON, malformed JSON (fail-open)
- Block decision: returns `{ "decision": "block", "reason": "..." }` with corrective guidance
- Allow decision: empty stdout on no violations
- Warn decision: logged but allowed through
- Retry counter: increment on repeated same-rule violation, reset on different rule or pass, escalation at 3 retries
- Fail-open: missing rules file, missing sidecar file, engine throws, roundtable.yaml missing
- Config reading: reads verbosity from roundtable.yaml, reads state from roundtable-state.json

**Codex validator unit tests** (`conversational-compliance-codex.test.cjs`):
- `validateOutput()`: violation detection, no-violation pass-through
- Provider scope filtering: only codex/both rules evaluated
- Retry behavior: re-invocation with corrective guidance
- Retry limit: escalation after 3 attempts
- Fail-open: validation error accepted with warning
- Sidecar file reading: present, missing, unparseable JSON

### 4.2 Integration Tests (~15 test cases)

Integration tests validate cross-module interactions without mocking.

**Hook chain integration** (`conversational-compliance-integration.test.cjs`):
- Stop hook chain: delegation-gate + conversational-compliance running in sequence — both hooks allow
- Stop hook chain: delegation-gate allows, conversational-compliance blocks — block returned
- End-to-end bulleted format: prose response triggers block with corrective guidance
- End-to-end domain confirmation: collapsed three-domain output triggers block
- End-to-end elicitation-first: "analysis complete" without question triggers block
- Sidecar file lifecycle: file created, read by hook, state transitions reflected in hook behavior
- Rule loading + evaluation pipeline: rules loaded from disk, evaluated against real response content
- Multiple violations: highest-severity violation returned as primary, all collected

### 4.3 Performance Tests (~5 test cases)

Performance tests validate the 500ms total budget for the Stop hook.

- Rule loading latency: < 50ms for 3 built-in rules
- Rule evaluation latency: < 200ms for 3 rules against a typical response (~500 lines)
- Sidecar + config read latency: < 50ms combined
- Total hook execution: < 500ms end-to-end (process spawn + rule load + evaluate + respond)
- Timeout short-circuit: evaluation aborted at 4s mark, response allowed through

### 4.4 Security Tests (~5 test cases)

- Stdin injection: malformed JSON does not crash hook (fail-open)
- Path traversal in rule file paths: `rulesPath` parameter sanitized
- Oversized input: large response text (>1MB) does not cause OOM — hook completes or times out gracefully
- Sidecar file with unexpected content: arbitrary JSON does not crash evaluation
- Rule regex denial-of-service: catastrophic backtracking in rule patterns detected and short-circuited

---

## 5. Flaky Test Mitigation

### 5.1 Process Spawn Timing

Hook tests spawn child processes. Mitigations:
- Use `hook-test-utils.cjs`'s built-in 10-second timeout guard (HOOK_TIMEOUT_MS)
- Performance assertions use generous thresholds (2x the budget) to account for CI variability
- Each test uses `setupTestEnv()` / `cleanupTestEnv()` for full isolation — no shared state between tests

### 5.2 File System Race Conditions

The sidecar file `.isdlc/roundtable-state.json` is read/written by separate processes:
- Tests write sidecar file before spawning hook — no race condition in test setup
- Each test gets its own temp directory — no cross-test file system contention
- Retry counter is in-memory within the hook process — no persistence race

### 5.3 Deterministic Test Data

- All rule definitions used in tests are explicit fixtures, not loaded from the real config
- Response content samples are hardcoded strings, not generated
- Timestamps in sidecar files use fixed ISO strings, not `Date.now()`

---

## 6. Performance Test Plan

### 6.1 Latency Budget

| Operation | Budget | Test Approach |
|-----------|--------|---------------|
| Rule loading (JSON parse) | < 50ms | Measure `loadRules()` with 3 built-in rules |
| Rule evaluation (3 rules) | < 200ms | Measure `evaluateRules()` against 500-line response |
| Config + sidecar read | < 50ms | Measure file reads in isolation |
| Total Stop hook (end-to-end) | < 500ms | Measure `runHook()` wall time including process spawn |
| Codex validation (function call) | < 200ms | Measure `validateOutput()` call time |

### 6.2 Scalability

- Test with 10 rules (simulating future growth): total hook < 1s
- Test with 2000-line response: evaluation < 500ms
- Test with 50 rules: evaluation short-circuits after first block violation

### 6.3 Timeout Behavior

- Simulate slow evaluation: inject delay, verify hook returns allow at 4s mark
- Verify response not blocked when timeout threshold exceeded

---

## 7. Critical Paths (100% Coverage Required)

Per Article II, these critical paths require 100% test coverage:

1. **Fail-open behavior**: Every error path must be tested — missing files, parse errors, engine exceptions, timeout
2. **Block/allow decision logic**: The core verdict-to-decision mapping in the Stop hook
3. **Retry escalation**: The 3-retry counter and escalation to user
4. **Provider scope filtering**: Rules correctly filtered by claude/codex/both
5. **Bulleted format detection**: Line classification regex and threshold calculation
6. **Domain confirmation detection**: Structural check for collapsed vs sequential confirmations
7. **Elicitation-first detection**: State-match check for question presence

---

## 8. Module System Compliance (Article XIII)

All test files:
- Use `.test.cjs` extension (CommonJS, matching hook module system)
- Run from temporary directories outside the package via `prepareHook()`
- Import test utilities via `require('./hook-test-utils.cjs')`
- Use `node:test` and `node:assert/strict` (Node.js built-in, no external dependencies)

The compliance engine (`src/core/compliance/engine.cjs`) is CJS. Tests import it directly via `require()` after copying to the temp directory. The ESM wrapper (`engine.mjs`) is not tested in hook tests — it is a thin re-export validated by a separate import check.

---

## 9. Test File Layout

```
src/claude/hooks/tests/
  conversational-compliance-engine.test.cjs     # Unit: compliance engine (loadRules, evaluateRules)
  conversational-compliance-hook.test.cjs       # Unit: Stop hook (stdin/stdout, block/allow, retry)
  conversational-compliance-codex.test.cjs      # Unit: Codex output validation
  conversational-compliance-integration.test.cjs # Integration: hook chain, end-to-end flows
```

New files to copy into temp directory for testing:
```
src/core/compliance/engine.cjs                  # Compliance engine (under test)
.isdlc/config/conversational-rules.json         # Rule definitions (fixture)
```

---

## 10. Coverage Targets

| Module | Unit Coverage Target | Integration Coverage Target |
|--------|---------------------|-----------------------------|
| `engine.cjs` (compliance engine) | >=90% | >=80% |
| `conversational-compliance.cjs` (Stop hook) | >=85% | >=75% |
| Codex `validateOutput()` | >=85% | >=70% |
| `conversational-rules.json` schema | 100% (all 3 built-in rules) | N/A |

---

## 11. Test Dependencies

| Dependency | Used By | Notes |
|-----------|---------|-------|
| `node:test` | All test files | Built-in, no install needed |
| `node:assert/strict` | All test files | Built-in |
| `hook-test-utils.cjs` | All test files | Existing shared utility |
| `conversational-rules.json` (fixture) | Engine tests, integration tests | Test fixture, not production config |
| Sidecar file fixture | Hook tests, integration tests | Written by test setup, not roundtable analyst |

---

## 12. Acceptance Criteria Coverage Summary

| FR | AC Count | Test Cases | Coverage |
|----|----------|------------|----------|
| FR-001 (Rule Definition Schema) | 5 | 12 | 100% |
| FR-002 (Rule Extraction from Prose) | 5 | 8 | 100% |
| FR-003 (Stop Hook Integration) | 5 | 14 | 100% |
| FR-004 (Auto-Retry) | 6 | 10 | 100% |
| FR-005 (Built-in Rules) | 5 | 15 | 100% |
| FR-006 (Codex Integration) | 12 | 16 | 100% |
| **Total** | **38** | **~75** | **100%** |

Note: Some test cases cover multiple ACs (e.g., integration tests span FR-003 + FR-005).
