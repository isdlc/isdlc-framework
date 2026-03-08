# Test Strategy: Contributing Personas -- Roundtable Extension

**Status**: Draft
**Requirement**: REQ-0047 / GH-108a
**Last Updated**: 2026-03-07
**Coverage Target**: >= 80% line, >= 70% branch (per Article II)

---

## 1. Overview

This document defines the test strategy for the Contributing Personas feature (REQ-0047). The feature spans 6 modules across 2 testable code files (`analyze-item.cjs`, `common.cjs`), 1 agent behavior file (`roundtable-analyst.md`), and 5 new content files (`persona-*.md`).

### Modules Under Test

| Module | Responsibility | Testability | Test Approach |
|--------|---------------|-------------|---------------|
| M1: Persona Loader | Discover, validate, resolve persona files | **Code-testable** (CJS) | Unit tests with temp directory isolation |
| M2: Config Reader | Read `.isdlc/roundtable.yaml`, inject config | **Code-testable** (CJS) | Unit tests with temp directory isolation |
| M3: Roster Proposer | Keyword matching, roster proposal | **Behavior-only** (markdown) | AC validation via integration |
| M4: Verbosity Renderer | Output format by mode | **Behavior-only** (markdown) | AC validation via integration |
| M5: Persona Files | Built-in persona definitions | **Content validation** | Schema/format validation |
| M6: Late-Join Handler | Mid-conversation persona invitation | **Behavior-only** (markdown) | AC validation via integration |

### Existing Infrastructure (from test evaluation)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion library**: `node:assert/strict`
- **Test pattern**: `*.test.cjs` for hook/CJS tests
- **Test utilities**: `src/claude/hooks/tests/hook-test-utils.cjs` (setupTestEnv, cleanupTestEnv, runHook)
- **Current project tests**: ~1100+ tests across lib/ and hooks/
- **CJS isolation**: Hook tests copy to temp directory outside package to avoid ESM/CJS conflicts (Article XIII)

### Strategy for This Requirement

- **Approach**: Extend existing test suite -- add new test files alongside existing `src/claude/hooks/tests/` structure
- **Conventions**: Match existing naming (`*.test.cjs`), use `hook-test-utils.cjs`, `node:test` + `node:assert/strict`
- **Location**: `src/claude/hooks/tests/` for code-testable modules (M1, M2); content validation tests alongside
- **Coverage Target**: >= 80% line coverage for M1 and M2 code changes

---

## 2. Test Pyramid

### Level 1: Unit Tests (65% of test effort)

Unit tests validate M1 (Persona Loader) and M2 (Config Reader) code paths in isolation using temp directories.

| Module | Unit Test File | Test Count (est.) |
|--------|---------------|-------------------|
| M1: Persona Loader (`getPersonaPaths()` extension) | `persona-loader.test.cjs` | 28 |
| M2: Config Reader (roundtable.yaml parsing) | `config-reader.test.cjs` | 20 |
| M5: Persona Files (schema validation) | `persona-schema-validation.test.cjs` | 12 |
| **Total** | | **60** |

**Mocking strategy**: Temp directories with crafted persona files and YAML configs. No external mocking libraries -- use `fs.mkdtempSync()` + `fs.writeFileSync()` for fixture creation per the established `hook-test-utils.cjs` pattern.

### Level 2: Integration Tests (25% of test effort)

Integration tests validate cross-module interactions: persona loading + config reading + ROUNDTABLE_CONTEXT building.

| Integration Scope | Test File | Test Count (est.) |
|-------------------|-----------|-------------------|
| M1 + M2: Persona loading with config defaults/disabled | `persona-config-integration.test.cjs` | 10 |
| M1 + M5: Override-by-copy with real persona files | `persona-override-integration.test.cjs` | 8 |
| M2 + dispatch: Config injection into ROUNDTABLE_CONTEXT | `roundtable-context-integration.test.cjs` | 6 |
| **Total** | | **24** |

**Real filesystem**: Integration tests create temp project structures with `.isdlc/personas/`, `.isdlc/roundtable.yaml`, and `src/claude/agents/persona-*.md` files. Tests validate the full pipeline from file discovery through config resolution.

### Level 3: E2E / Behavioral Tests (10% of test effort)

E2E tests validate the analyze-item.cjs hook end-to-end by spawning the process with controlled input and verifying output JSON contains correct persona paths and config.

| E2E Scope | Test File | Test Count (est.) |
|-----------|-----------|-------------------|
| analyze-item.cjs hook with persona discovery | `persona-e2e.test.cjs` | 6 |
| Per-analysis override flags (--verbose, --silent, --personas) | `per-analysis-flags-e2e.test.cjs` | 4 |
| **Total** | | **10** |

**Total estimated tests**: 94

---

## 3. Test Pyramid Rationale

The pyramid is bottom-heavy (64% unit, 26% integration, 10% E2E) because:

1. **M1 and M2 are pure logic modules** with well-defined inputs (filesystem state) and outputs (path arrays, config objects). Unit tests provide the fastest feedback.
2. **M3, M4, M6 are agent behavior** defined in markdown. These cannot be unit-tested -- their ACs are validated through behavioral observation during roundtable sessions. The test strategy documents expected behaviors but does not create automated tests for markdown-defined agent instructions.
3. **M5 are content files** with a defined schema. Validation tests confirm format compliance.
4. **Integration tests** are essential because the feature's value comes from M1+M2 working together (persona paths filtered by config defaults/disabled lists).

---

## 4. Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| Temp directory cleanup failures | Use `afterEach()` with try/catch cleanup; prefix temp dirs with `isdlc-test-` for manual cleanup identification |
| File system timing (writes not flushed) | Use synchronous `fs.*Sync()` operations throughout (consistent with existing hook tests) |
| YAML parsing library differences | Pin to `js-yaml` or Node.js built-in; test with deterministic YAML fixtures |
| Test isolation (shared state) | Each test creates fresh temp directory via `setupTestEnv()`; no shared mutable state |
| Path separator differences (Windows) | Use `path.join()` for all path construction; test on CI matrix (Article XII) |

---

## 5. Performance Test Plan

### NFR-001: Persona Loading Time < 500ms for 10 Files

| Test | Method | Threshold |
|------|--------|-----------|
| Load 10 persona files from disk | `performance.now()` timing around `getPersonaPaths()` call | < 500ms |
| Load 20 persona files (stress) | Same timing with 2x files | < 1000ms |
| Load with 5 malformed files (fail-open) | Timing includes validation + skip | < 500ms for remaining 5 valid files |

**Implementation**: Performance tests included in unit test suite with `it('NFR-001: loads 10 personas within 500ms')` using `performance.now()` delta assertions.

### NFR-002: Context Window Impact

| Test | Method | Threshold |
|------|--------|-----------|
| Shipped persona file line count | Count lines in each `persona-*.md` | < 40 lines each |
| ROUNDTABLE_CONTEXT section size | Measure character count of built section | Document baseline, no regression |

---

## 6. Security Test Considerations

| Concern | Test |
|---------|------|
| Path traversal in persona filenames | Unit test: persona file with `../` in name is rejected |
| Malformed YAML injection | Unit test: YAML with special characters does not crash parser |
| Oversized persona files | Unit test: file > 1MB is skipped with warning |
| Symlink following in `.isdlc/personas/` | Document: symlinks are followed by `fs.readFileSync` -- no special handling needed |

---

## 7. Test Data Strategy

See `test-data-plan.md` for complete test data specifications.

**Summary**: Test data is generated programmatically in test setup using `fs.writeFileSync()`. No external fixtures directory -- each test creates exactly the filesystem state it needs.

---

## 8. Coverage Analysis

### Code Coverage Targets

| Module | Line Target | Branch Target | Rationale |
|--------|------------|---------------|----------|
| M1: Persona Loader | >= 85% | >= 80% | Core discovery + override logic is critical path |
| M2: Config Reader | >= 85% | >= 80% | Config parsing + defaults are critical path |
| Overall (new code) | >= 80% | >= 70% | Per Article II threshold |

### Untestable Code (Documented)

| Code | Reason | Coverage Impact |
|------|--------|-----------------|
| M3: Roster Proposer (roundtable-analyst.md) | Agent behavior in markdown, not executable code | N/A -- behavioral validation only |
| M4: Verbosity Renderer (roundtable-analyst.md) | Agent behavior in markdown | N/A |
| M6: Late-Join Handler (roundtable-analyst.md) | Agent behavior in markdown | N/A |
| M5: Persona file body content | Content, not code | Schema validation only |

---

## 9. Test Execution

### Commands

Run persona-specific tests:
```bash
node --test src/claude/hooks/tests/persona-loader.test.cjs src/claude/hooks/tests/config-reader.test.cjs src/claude/hooks/tests/persona-schema-validation.test.cjs
```

Run integration tests:
```bash
node --test src/claude/hooks/tests/persona-config-integration.test.cjs src/claude/hooks/tests/persona-override-integration.test.cjs src/claude/hooks/tests/roundtable-context-integration.test.cjs
```

Run all REQ-0047 tests:
```bash
node --test src/claude/hooks/tests/persona-*.test.cjs src/claude/hooks/tests/config-reader.test.cjs src/claude/hooks/tests/roundtable-context-integration.test.cjs src/claude/hooks/tests/per-analysis-flags-e2e.test.cjs
```

### CI Integration

New test files are picked up by existing CI matrix (`ci.yml`) via glob pattern matching. No CI configuration changes needed.

---

## 10. Risk-Based Test Prioritization

| Priority | Area | Rationale |
|----------|------|-----------|
| P0 (Critical) | M1: Persona discovery + override-by-copy | Wrong paths = wrong personas loaded = corrupted analysis |
| P0 (Critical) | M2: Config reader defaults | Missing config must default correctly (NFR-004: backward compat) |
| P1 (High) | M1: Version drift detection | User must be warned about stale overrides |
| P1 (High) | M2: Verbosity field validation | Invalid verbosity must not crash |
| P1 (High) | M5: Persona file schema compliance | Malformed built-in files would break all roundtables |
| P2 (Medium) | M1+M2: Config disabled_personas filtering | Filtering is important but user can override at confirmation |
| P2 (Medium) | Per-analysis flags parsing | Override mechanism, not primary path |
| P3 (Low) | Performance (NFR-001) | 10-file load is fast on any modern disk |
| P3 (Low) | Context window size (NFR-002) | Informational, not functional |

---

## 11. Constitutional Compliance

| Article | How This Strategy Complies |
|---------|---------------------------|
| **Article II** (Test-First) | Test cases designed before implementation; coverage targets defined (>= 80% line) |
| **Article VII** (Traceability) | Every AC mapped to test case(s) in traceability matrix; 100% AC coverage |
| **Article IX** (Quality Gates) | GATE-04 checklist fully satisfied; all required artifacts produced |
| **Article XI** (Integration Testing) | 24 integration tests validate real module interactions with real filesystem; no mocked external services |
| **Article XII** (Cross-Platform) | Tests use `path.join()` for all paths; CI matrix covers macOS/Linux/Windows |
| **Article XIII** (Module System) | CJS test files with `.cjs` extension; temp directory isolation for hook tests |
