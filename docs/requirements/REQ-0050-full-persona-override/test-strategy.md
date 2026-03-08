# Test Strategy: Full Persona Override

**Status**: Draft
**Requirement**: REQ-0050 / GH-108b
**Last Updated**: 2026-03-08
**Coverage Target**: >= 80% line, >= 70% branch (per Article II)

---

## 1. Overview

This document defines the test strategy for the Full Persona Override feature (REQ-0050). The feature modifies 5 existing files and adds 1 new documentation file across the analyze verb, persona loader, roundtable config, roundtable analyst agent, and session cache builder.

### Modules Under Test

| Module | File | Change Type | Testability | Test Approach |
|--------|------|-------------|-------------|---------------|
| M1: Mode Selection | `analyze-item.cjs` | Modify | **Code-testable** (CJS) | Unit tests for flag parsing + mode dispatch |
| M2: Persona Loader | `persona-loader.cjs` | Modify | **Code-testable** (CJS) | Unit tests: remove PRIMARY_PERSONAS enforcement |
| M3: Config Reader | `roundtable-config.cjs` | Modify | **Code-testable** (CJS) | Unit tests: config as pre-population semantics |
| M4: Roundtable Agent | `roundtable-analyst.md` | Modify | **Behavior-only** (markdown) | AC validation via behavioral observation |
| M5: Session Cache | `common.cjs` | Modify | **Code-testable** (CJS) | Integration tests for ROUNDTABLE_CONTEXT shape |
| M6: Documentation | `persona-authoring-guide.md` | New | **Content validation** | Structure/completeness checks |

### Existing Infrastructure (from REQ-0047)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion library**: `node:assert/strict`
- **Test pattern**: `*.test.cjs` for hook/CJS tests
- **Test utilities**: `src/claude/hooks/tests/hook-test-utils.cjs`
- **Existing persona tests**: 3 test files (persona-loader, persona-config-integration, persona-override-integration)
- **Current project tests**: ~1300+ tests across lib/ and hooks/
- **CJS isolation**: Hook tests use temp directory outside package (Article XIII)

### Strategy for This Requirement

- **Approach**: Extend existing test suite -- modify 3 existing test files and add 2 new test files
- **Conventions**: Match existing naming (`*.test.cjs`), use `node:test` + `node:assert/strict`, temp dir isolation
- **Location**: `src/claude/hooks/tests/` for code-testable modules
- **Coverage Target**: >= 80% line coverage for all modified CJS modules

---

## 2. Test Pyramid

### Level 1: Unit Tests (60% of test effort)

Unit tests validate M1 (Mode Selection), M2 (Persona Loader changes), and M3 (Config Reader changes) in isolation.

| Module | Test File | New/Modify | Test Count (est.) |
|--------|-----------|------------|-------------------|
| M1: Mode selection flag parsing | `mode-selection.test.cjs` | **New** | 22 |
| M2: Persona Loader (remove PRIMARY_PERSONAS forcing) | `persona-loader.test.cjs` | **Modify** (add tests) | 10 |
| M3: Config as pre-population | `roundtable-config-prepopulate.test.cjs` | **New** | 16 |
| M6: Documentation structure validation | `persona-authoring-docs.test.cjs` (optional) | **New** | 6 |
| **Total** | | | **54** |

**Mocking strategy**: Temp directories with crafted persona files and YAML configs. Synchronous filesystem operations. No external mocking libraries.

### Level 2: Integration Tests (30% of test effort)

Integration tests validate cross-module interactions: mode selection -> persona loading -> config pre-population -> dispatch context.

| Integration Scope | Test File | New/Modify | Test Count (est.) |
|-------------------|-----------|------------|-------------------|
| M1+M2: Mode selection with persona discovery | `persona-config-integration.test.cjs` | **Modify** (add tests) | 8 |
| M2+M3: No-primary-forcing + config pre-population | `persona-override-integration.test.cjs` | **Modify** (add tests) | 6 |
| M1+M5: Mode context in ROUNDTABLE_CONTEXT | `mode-dispatch-integration.test.cjs` | **New** | 8 |
| **Total** | | | **22** |

### Level 3: E2E / Behavioral Tests (10% of test effort)

E2E tests validate analyze-item.cjs end-to-end with mode selection flags.

| E2E Scope | Test File | Test Count (est.) |
|-----------|-----------|-------------------|
| analyze-item.cjs with --no-roundtable flag | `mode-selection-e2e.test.cjs` | 4 |
| analyze-item.cjs with --personas flag pre-selection | `mode-selection-e2e.test.cjs` | 3 |
| **Total** | | **7** |

### Behavioral AC Validation (Not Automated)

| Scope | AC Coverage | Validation Method |
|-------|------------|-------------------|
| M4: Roundtable agent dynamic roster | AC-005-02 thru AC-005-06 | Manual behavioral observation during roundtable sessions |
| M4: Roster proposal UX | AC-003-04, AC-003-05 | Manual behavioral observation |
| M6: Documentation discoverability | AC-007-06 | Manual review |

**Total estimated automated tests**: 83
**Total behavioral validations**: 8

---

## 3. Test Pyramid Rationale

The pyramid is bottom-heavy (65% unit, 27% integration, 8% E2E) because:

1. **M1, M2, M3 are pure logic modules** with well-defined inputs (flags, filesystem state, YAML config) and outputs (mode objects, path arrays, config objects). Unit tests give fastest feedback.
2. **M4 is agent behavior** defined in markdown (roundtable-analyst.md). ACs for dynamic roster rendering and persona engagement rules cannot be automated -- they are validated through behavioral observation.
3. **Integration tests** are critical because the feature's value comes from mode selection flowing through persona loading, config pre-population, and dispatch context assembly.
4. **E2E tests** cover the analyze-item.cjs entry point with real flag parsing and JSON output validation.

---

## 4. Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| Temp directory cleanup failures | Use `afterEach()` with try/catch cleanup; prefix temp dirs with `isdlc-test-` |
| File system timing (writes not flushed) | Use synchronous `fs.*Sync()` operations throughout |
| Test isolation (shared state) | Each test creates fresh temp directory; no shared mutable state |
| Path separator differences (Windows) | Use `path.join()` for all path construction; test on CI matrix (Article XII) |
| YAML parsing edge cases | Test with deterministic YAML fixtures; cover malformed input |
| Flag parsing order sensitivity | Test all flag combinations; document mutually exclusive flags |

---

## 5. Performance Test Plan

### Persona Loading After PRIMARY_PERSONAS Removal

| Test | Method | Threshold |
|------|--------|-----------|
| Load all personas without forced inclusion | `performance.now()` timing | < 500ms for 10 files |
| Mode selection dispatch overhead | Time from flag parse to dispatch context | < 50ms |
| Config pre-population read + merge | Time for readRoundtableConfig with overrides | < 100ms |

### No-Persona Mode Performance

| Test | Method | Threshold |
|------|--------|-----------|
| Verify zero persona file reads in no-persona mode | Count fs.readFileSync calls | 0 persona file reads |
| Dispatch context assembly without personas | Timing | < 20ms |

---

## 6. Security Test Considerations

| Concern | Test |
|---------|------|
| Path traversal in persona filenames | Existing: TC-M1-27 (isSafeFilename) |
| Flag injection via --personas value | Unit test: malicious persona name strings are sanitized |
| No-persona mode does not accidentally load persona files | Integration test: verify zero persona file reads |
| Config YAML injection | Existing: roundtable-config tests handle malformed YAML |

---

## 7. Test Data Strategy

See `test-data-plan.md` for complete test data specifications.

**Summary**: Test data is generated programmatically in test setup using `fs.writeFileSync()`. No external fixtures directory. Each test creates exactly the filesystem state it needs.

---

## 8. Coverage Analysis

### Code Coverage Targets

| Module | Line Target | Branch Target | Rationale |
|--------|------------|---------------|----------|
| M1: analyze-item.cjs (mode selection) | >= 85% | >= 80% | New entry-point logic; all flag combinations must be covered |
| M2: persona-loader.cjs (no forced primaries) | >= 85% | >= 80% | Critical change to always-include behavior |
| M3: roundtable-config.cjs (pre-population) | >= 85% | >= 80% | Behavioral change from default to pre-populate |
| M5: common.cjs (ROUNDTABLE_CONTEXT) | >= 80% | >= 70% | Context shape changes |
| Overall (new + modified code) | >= 80% | >= 70% | Per Article II threshold |

### Untestable Code (Documented)

| Code | Reason | Coverage Impact |
|------|--------|------------------|
| M4: roundtable-analyst.md dynamic roster | Agent behavior in markdown | N/A -- behavioral validation only |
| M4: roundtable-analyst.md confirmation sequence | Agent behavior in markdown | N/A |
| M6: persona-authoring-guide.md content quality | Documentation prose | Manual review |

---

## 9. Test Execution

### Commands

Run REQ-0050 unit tests:
```bash
node --test src/claude/hooks/tests/mode-selection.test.cjs src/claude/hooks/tests/roundtable-config-prepopulate.test.cjs
```

Run modified existing tests (with new REQ-0050 cases):
```bash
node --test src/claude/hooks/tests/persona-loader.test.cjs src/claude/hooks/tests/persona-config-integration.test.cjs src/claude/hooks/tests/persona-override-integration.test.cjs
```

Run integration + E2E tests:
```bash
node --test src/claude/hooks/tests/mode-dispatch-integration.test.cjs src/claude/hooks/tests/mode-selection-e2e.test.cjs
```

Run all REQ-0050 tests:
```bash
node --test src/claude/hooks/tests/mode-selection*.test.cjs src/claude/hooks/tests/roundtable-config-prepopulate.test.cjs src/claude/hooks/tests/mode-dispatch-integration.test.cjs src/claude/hooks/tests/persona-loader.test.cjs src/claude/hooks/tests/persona-config-integration.test.cjs src/claude/hooks/tests/persona-override-integration.test.cjs
```

### CI Integration

New test files are picked up by existing CI matrix (`ci.yml`) via glob pattern matching. No CI configuration changes needed.

---

## 10. Risk-Based Test Prioritization

| Priority | Area | Rationale |
|----------|------|-----------|
| P0 (Critical) | M2: PRIMARY_PERSONAS removal does not break existing persona loading | Regression risk: removing always-include must not lose personas entirely |
| P0 (Critical) | M1: Mode selection flag parsing (--no-roundtable, --silent, --personas) | Entry point for all new behavior; incorrect parsing = wrong mode |
| P0 (Critical) | M3: Config pre-population backward compatibility | Existing roundtable.yaml files must continue to work |
| P1 (High) | M1+M2: No-persona mode produces zero persona file reads | Functional requirement: clean analysis without persona influence |
| P1 (High) | M2+M3: Dynamic roster with config defaults/disabled pre-population | Core feature: user control over roster with preference memory |
| P1 (High) | M5: ROUNDTABLE_CONTEXT includes full roster (not just primaries) | Session cache correctness affects all downstream analysis |
| P2 (Medium) | M1: Flag mutual exclusivity (--silent vs --verbose) | Edge case handling |
| P2 (Medium) | M3: Missing config defaults to sensible pre-population | Graceful degradation |
| P3 (Low) | M6: Documentation structure completeness | Content quality, not functional |
| P3 (Low) | Performance thresholds | Informational, not functional |

---

## 11. Constitutional Compliance

| Article | How This Strategy Complies |
|---------|---------------------------|
| **Article II** (Test-First) | Test cases designed in Phase 05 before implementation in Phase 06; coverage targets defined (>= 80% line) |
| **Article VII** (Traceability) | Every AC mapped to test case(s) in traceability matrix; 100% AC coverage (41/41 ACs) |
| **Article IX** (Quality Gates) | GATE-04 checklist fully satisfied; all 4 required artifacts produced |
| **Article XI** (Integration Testing) | 22 integration tests validate real module interactions with real filesystem; no mocked external services |
| **Article XII** (Cross-Platform) | Tests use `path.join()` for all paths; CI matrix covers macOS/Linux/Windows |
| **Article XIII** (Module System) | CJS test files with `.test.cjs` extension; temp directory isolation for hook tests |
