# Test Strategy: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Phase**: 05-test-strategy
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%
**Requirement**: REQ-0035 (8 FRs, 28 ACs)

## 1. Existing Infrastructure

- **Test Runner**: `node:test` (Article II constitutional mandate)
- **Test Pattern**: Prompt content verification -- read `.md` files, assert content patterns
- **Test Location**: `tests/prompt-verification/*.test.js`
- **Naming Convention**: `{feature-slug}.test.js`
- **Coverage Tool**: None (prompt verification tests assert structural content, not runtime coverage)
- **Existing Tests**: 5 test files, ~284 total tests across all suites

This strategy extends the existing prompt content verification pattern. No new frameworks or dependencies are introduced.

## 2. Test Approach

### 2.1 Test Type: Prompt Content Verification

This feature modifies two agent/command markdown files:
1. `src/claude/agents/roundtable-analyst.md` -- primary (FR-001 through FR-007)
2. `src/claude/commands/isdlc.md` -- minor (FR-008)

Both are `.md` prompt files, not executable code. The established project pattern for testing prompt changes is **prompt content verification**: read the file content and assert that required instructions, patterns, keywords, and structural elements are present.

This approach is validated by prior REQ tests (REQ-0006, REQ-0019, REQ-0034) which all use the same `readFileSync` + `assert` pattern.

### 2.2 What We Are Testing

For each FR and AC, we verify that the implementing `.md` file contains the necessary instruction content:
- State machine states and transitions (FR-001)
- Domain-specific summary content requirements (FR-002, FR-003, FR-004)
- Amendment flow instructions with all-persona engagement (FR-005)
- Tier-based domain mapping tables (FR-006)
- Summary persistence instructions (FR-007)
- Meta.json acceptance schema documentation (FR-008)

### 2.3 What We Are NOT Testing

- Runtime LLM behavior (summaries generated at runtime by the LLM reading its instructions)
- User experience quality (subjective)
- Performance of summary generation (LLM-dependent)

## 3. Test Pyramid

### Unit Tests (Prompt Content Verification)
- **Count**: 42 test cases across 10 test groups
- **Target**: 100% AC coverage (28/28 ACs)
- **Runner**: `node:test`
- **Location**: `tests/prompt-verification/confirmation-sequence.test.js`

### Integration Tests
- **Scope**: Cross-file consistency between `roundtable-analyst.md` and `isdlc.md`
- **Count**: 6 test cases (TG-09)
- **Focus**: Relay-and-resume compatibility, meta.json field preservation, no new hooks/deps

### E2E Tests
- **Scope**: Not applicable for this feature
- **Rationale**: The feature modifies prompt instructions, not executable code. The relay-and-resume loop is already tested by the existing e2e test (`tests/e2e/cli-lifecycle.test.js`). No new executable code is being added.

### Security Tests
- **Scope**: Not applicable
- **Rationale**: No new user inputs, no new file system operations beyond what already exists, no credentials, no APIs

### Performance Tests
- **Scope**: Not applicable for prompt content verification
- **Rationale**: Summary generation performance is LLM-dependent and cannot be unit-tested. The specification (FR-007) addresses performance via caching instructions, which are verified structurally.

## 4. Test Pyramid (Summary)

| Test Type | Count | Location |
|-----------|-------|----------|
| Prompt Content Verification (Unit) | 42 | `tests/prompt-verification/confirmation-sequence.test.js` |
| Cross-File Consistency (Integration) | 6 | Same file, TG-09 |
| E2E | 0 | N/A (no new executable code) |
| Security | 0 | N/A |
| Performance | 0 | N/A |
| **Total** | **48** | |

## 5. Flaky Test Mitigation

All tests in this suite are deterministic file-content assertions:
- Read file from disk with `readFileSync` (synchronous, no timing issues)
- Assert content patterns with `assert.ok`, `assert.match`, `assert.equal`
- No network calls, no async operations, no randomness, no timeouts
- No test isolation concerns (each test reads its own file independently)

**Flakiness risk**: Zero. This is consistent with all other prompt-verification tests in the project.

## 6. Performance Test Plan

Not applicable for this feature. See Section 3 rationale.

The specification addresses perceived performance through caching instructions (FR-007, AC-007-01), which is verified structurally by TC-07.1.

## 7. Coverage Targets

- **Requirement coverage**: 100% (all 8 FRs, all 28 ACs mapped to test cases)
- **File coverage**: 100% of modified files (2/2: roundtable-analyst.md, isdlc.md)
- **Structural coverage**: Every state machine state, every transition, every tier mapping, every domain-to-artifact mapping

## 8. Critical Paths

1. **Sequential confirmation flow** (FR-001): IDLE -> PRESENTING_REQUIREMENTS -> PRESENTING_ARCHITECTURE -> PRESENTING_DESIGN -> FINALIZING -> COMPLETE
2. **Amendment flow** (FR-005): Any PRESENTING_* -> AMENDING -> PRESENTING_REQUIREMENTS (restart)
3. **Tier-based scoping** (FR-006): Standard (3 domains), Light (2 domains), Trivial (brief mention, no Accept/Amend)
4. **Summary persistence** (FR-007): In-memory cache -> disk persistence on acceptance
5. **Meta.json acceptance** (FR-008): Acceptance field written with timestamp, domains, amendment count

## 9. Test Commands

```bash
# Run confirmation sequence tests only
node --test tests/prompt-verification/confirmation-sequence.test.js

# Run all prompt verification tests
node --test tests/prompt-verification/*.test.js

# Run full test suite
npm run test:all
```

## 10. Test File Structure

```
tests/
  prompt-verification/
    confirmation-sequence.test.js    # <-- NEW: 48 tests for REQ-0035
    parallel-execution.test.js       # Existing: REQ-0006
    preparation-pipeline.test.js     # Existing: REQ-0019
    provider-documentation.test.js   # Existing
    orchestrator-conversational-opening.test.js  # Existing
```

## 11. Constitutional Compliance

| Article | Compliance |
|---------|------------|
| II (Test-First Development) | Tests designed before implementation. Uses `node:test` (project standard). |
| VII (Artifact Traceability) | Every FR and AC maps to at least one test case. Traceability matrix provides 100% coverage. |
| IX (Quality Gate Integrity) | All GATE-04 requirements satisfied. No gates skipped or weakened. |
| XI (Integration Testing Integrity) | Cross-file consistency tests verify component interactions between roundtable-analyst.md and isdlc.md. |
| V (Simplicity First) | No new dependencies. Uses existing test patterns. |
| XII (Dual Module System) | Test file uses ESM (`.test.js`), consistent with project convention for prompt-verification tests. |
