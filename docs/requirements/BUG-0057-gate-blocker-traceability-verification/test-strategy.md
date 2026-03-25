# Test Strategy: BUG-0057 — Gate-Blocker Traceability Verification

## 1. Scope

Unit and integration tests for the provider-neutral validation pipeline:

**New files (15)**:
- `src/core/validators/validate-phase.js` — Entry point: parallel validator orchestration
- `src/core/validators/traceability-validator.js` — Requirements-to-tests traceability (Phase 05)
- `src/core/validators/test-implementation-validator.js` — Tests coded + production imports + AC-to-production mapping (Phase 06)
- `src/core/validators/test-execution-validator.js` — Planned tests vs executed tests (Phase 07)
- `src/core/validators/coverage-presence-validator.js` — Coverage data presence check (Phase 06/07)
- `src/core/validators/constitutional-validator.js` — Per-article check orchestration
- `src/core/validators/constitutional-checks/article-ii.js` — Test-First check
- `src/core/validators/constitutional-checks/article-iii.js` — Security check
- `src/core/validators/constitutional-checks/article-v.js` — Simplicity check
- `src/core/validators/constitutional-checks/article-vii.js` — Traceability check
- `src/core/validators/constitutional-checks/article-viii.js` — Documentation check
- `src/core/validators/constitutional-checks/article-ix.js` — Gate Integrity check
- `src/core/validators/constitutional-checks/article-x.js` — Fail-Safe check
- `src/core/validators/lib/test-id-parser.js` — Shared AC/test ID extraction
- `src/core/validators/lib/coverage-patterns.js` — Shared coverage regex patterns

**Modified files (4)**:
- `src/core/validators/gate-logic.js` — new `checkTraceabilityRequirement()`
- `src/core/bridge/validators.cjs` — dynamic `import()` for `validate-phase.js`
- `src/providers/codex/runtime.js` — `validatePhaseGate()` before phase advancement
- `.claude/hooks/config/iteration-requirements.json` — new `traceability_validation` entries

## 2. Existing Infrastructure

- **Framework**: `node:test` (project standard)
- **Assertions**: `node:assert/strict`
- **Existing tests**: 4 validator test files in `tests/core/validators/` (gate-logic, enforcement, checkpoint-router, profile-loader)
- **Naming convention**: `{module}.test.js` with Test ID prefix (e.g., VR-, RVG-, PVS-)
- **Test command**: `npm run test:core` (glob: `tests/core/**/*.test.js`)
- **Module system**: ESM (`import`/`export`)
- **Patterns**: `describe`/`it` blocks, AC references in test names, pure function inputs

This strategy extends the existing `tests/core/validators/` test suite. All new validators are pure functions (content-in, result-out) making them ideal for exhaustive unit testing.

## 3. Test Framework

- **Runner**: `node:test` (project standard)
- **Assertions**: `node:assert/strict`
- **Command**: `npm run test:core`
- **Module system**: ESM (`import`/`export`)

## 4. Test Files

| File | Prefix | Approx Tests | Type |
|------|--------|-------------|------|
| `tests/core/validators/traceability-validator.test.js` | TV- | ~14 | Unit |
| `tests/core/validators/test-implementation-validator.test.js` | TIV- | ~18 | Unit |
| `tests/core/validators/test-execution-validator.test.js` | TEV- | ~12 | Unit |
| `tests/core/validators/coverage-presence-validator.test.js` | CPV- | ~10 | Unit |
| `tests/core/validators/constitutional-validator.test.js` | CV- | ~10 | Unit |
| `tests/core/validators/constitutional-checks.test.js` | CC- | ~21 | Unit |
| `tests/core/validators/test-id-parser.test.js` | TIP- | ~12 | Unit |
| `tests/core/validators/validate-phase.test.js` | VP- | ~10 | Integration |
| `tests/core/validators/gate-logic-traceability.test.js` | GLT- | ~6 | Integration |
| `tests/providers/codex/runtime-validate-gate.test.js` | RVG- | ~6 | Integration |

**Total new tests**: ~119

## 5. Test Pyramid

| Layer | Count | Percentage | Focus |
|-------|-------|------------|-------|
| Unit (validators 1-5) | ~64 | 54% | Pure function logic: parsing, matching, edge cases |
| Unit (shared libs) | ~12 | 10% | Parser extraction, regex patterns |
| Unit (constitutional checks) | ~21 | 18% | Per-article check functions |
| Integration (validate-phase) | ~10 | 8% | Orchestration, parallel execution, merge logic |
| Integration (gate-logic + runtime) | ~12 | 10% | CJS bridge, hook integration, Codex runtime |

## Flaky Test Mitigation

All validators are pure functions with no I/O, timers, or network access. Flaky test risk is minimal. The only potential source of non-determinism is Promise.all ordering in `validate-phase.js`, which is mitigated by testing merged results (order-independent) rather than execution sequence.

## Performance Test Plan

Performance requirements are minimal: all validators must complete in < 500ms on markdown file content. Since these are regex operations on string content (typically < 50KB), individual tests will naturally complete in single-digit milliseconds. No explicit performance test suite is needed; the standard test timeout (5s) provides sufficient regression protection.

## 6. Coverage Strategy

### 6.1 Shared Lib: test-id-parser.js — Unit Tests (TIP-)

#### 6.1.1 extractAcIds (FR-011, AC-011-02)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIP-01 | Extracts AC-001-01 through AC-011-03 from requirements-spec content | positive | AC-011-02 | src/core/validators/lib/test-id-parser.js |
| TIP-02 | Returns empty array for content with no AC IDs | negative | AC-011-02 | src/core/validators/lib/test-id-parser.js |
| TIP-03 | Handles malformed AC IDs (e.g., AC-1-1, AC-0001-01) gracefully | negative | AC-011-02 | src/core/validators/lib/test-id-parser.js |
| TIP-04 | Deduplicates AC IDs appearing multiple times | positive | AC-011-02 | src/core/validators/lib/test-id-parser.js |

#### 6.1.2 extractTestCaseIds (FR-011, AC-011-01)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIP-05 | Extracts VR-01, TIV-03, CC-07 etc. from test-strategy content | positive | AC-011-01 | src/core/validators/lib/test-id-parser.js |
| TIP-06 | Returns empty array for content with no test IDs | negative | AC-011-01 | src/core/validators/lib/test-id-parser.js |
| TIP-07 | Extracts multi-segment IDs like TC-BUILD-01 | positive | AC-011-01 | src/core/validators/lib/test-id-parser.js |
| TIP-08 | Ignores IDs that are substrings within longer text | positive | AC-011-01 | src/core/validators/lib/test-id-parser.js |

#### 6.1.3 extractTestToAcMappings (FR-011, AC-011-03)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIP-09 | Parses test ID + AC reference lines into mapping objects | positive | AC-011-03 | src/core/validators/lib/test-id-parser.js |
| TIP-10 | Includes production_file when `production:` annotation present | positive | AC-011-03 | src/core/validators/lib/test-id-parser.js |
| TIP-11 | Returns null production_file when annotation absent | positive | AC-011-03 | src/core/validators/lib/test-id-parser.js |
| TIP-12 | Handles multiple AC references per test ID line | positive | AC-011-03 | src/core/validators/lib/test-id-parser.js |

### 6.2 traceability-validator.js — Unit Tests (TV-)

#### 6.2.1 Happy Path (FR-001)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-01 | All ACs covered → pass: true, orphan_acs: [] | positive | AC-001-03, AC-001-04 | src/core/validators/traceability-validator.js |
| TV-02 | Returns mapped_test_cases with correct AC→test ID associations | positive | AC-001-04 | src/core/validators/traceability-validator.js |
| TV-03 | Calculates correct coverage_percent (100% when all mapped) | positive | AC-001-03 | src/core/validators/traceability-validator.js |

#### 6.2.2 Failure Cases (FR-001)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-04 | Missing ACs → pass: false, orphan_acs lists unmapped ACs | negative | AC-001-03 | src/core/validators/traceability-validator.js |
| TV-05 | Single orphan AC → coverage_percent reflects partial coverage | negative | AC-001-03 | src/core/validators/traceability-validator.js |
| TV-06 | All ACs orphaned → pass: false, coverage_percent: 0 | negative | AC-001-03 | src/core/validators/traceability-validator.js |

#### 6.2.3 Unparseable References (FR-001)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-07 | Malformed references → unparseable_references populated | negative | AC-001-05 | src/core/validators/traceability-validator.js |

#### 6.2.4 Fail-Open on Missing Artifacts (FR-001)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-08 | null requirementsSpec → pass: true, missing_artifacts includes "requirementsSpec" | positive | AC-001-06 | src/core/validators/traceability-validator.js |
| TV-09 | null testStrategy → pass: true, missing_artifacts includes "testStrategy" | positive | AC-001-06 | src/core/validators/traceability-validator.js |
| TV-10 | Both null → pass: true, missing_artifacts includes both | positive | AC-001-06 | src/core/validators/traceability-validator.js |

#### 6.2.5 Edge Cases

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TV-11 | Empty string inputs → pass: true (no ACs found = nothing to check) | positive | AC-001-06 | src/core/validators/traceability-validator.js |
| TV-12 | Requirements with 0 ACs → pass: true | positive | AC-001-03 | src/core/validators/traceability-validator.js |
| TV-13 | Strategy maps to ACs not in requirements → pass: true (extra tests OK) | positive | AC-001-03 | src/core/validators/traceability-validator.js |
| TV-14 | Multiple tests map to same AC → AC counted as covered | positive | AC-001-04 | src/core/validators/traceability-validator.js |

### 6.3 test-implementation-validator.js — Unit Tests (TIV-)

#### 6.3.1 Part A: Planned Tests Coded (FR-002)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIV-01 | All planned test IDs found in test files → unimplemented_tests: [] | positive | AC-002-01 | src/core/validators/test-implementation-validator.js |
| TIV-02 | Some planned IDs missing → unimplemented_tests lists them | negative | AC-002-02 | src/core/validators/test-implementation-validator.js |
| TIV-03 | No test files provided → all planned tests unimplemented | negative | AC-002-02 | src/core/validators/test-implementation-validator.js |
| TIV-04 | Test ID found across multiple files → counted as implemented | positive | AC-002-01 | src/core/validators/test-implementation-validator.js |

#### 6.3.2 Part B: Production Imports Modified (FR-002)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIV-05 | All imported production modules in modifiedFiles → unmodified_imports: [] | positive | AC-002-03, AC-002-04 | src/core/validators/test-implementation-validator.js |
| TIV-06 | Import not in modifiedFiles → unmodified_imports includes path | negative | AC-002-04 | src/core/validators/test-implementation-validator.js |
| TIV-07 | Parses ESM import statements (`import ... from '...'`) | positive | AC-002-03 | src/core/validators/test-implementation-validator.js |
| TIV-08 | Parses CJS require statements (`require('...')`) | positive | AC-002-03 | src/core/validators/test-implementation-validator.js |
| TIV-09 | Ignores node_modules and node: imports | positive | AC-002-03 | src/core/validators/test-implementation-validator.js |
| TIV-10 | Resolves relative import paths to project-relative paths | positive | AC-002-03 | src/core/validators/test-implementation-validator.js |

#### 6.3.3 Part C: AC-to-Production File Traceability (FR-002, FR-010)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIV-11 | All AC production files in modifiedFiles → orphan_acs_no_production: [] | positive | AC-002-05, AC-002-06, AC-010-02 | src/core/validators/test-implementation-validator.js |
| TIV-12 | AC production file not in modifiedFiles → orphan_acs_no_production includes AC | negative | AC-002-06 | src/core/validators/test-implementation-validator.js |
| TIV-13 | Parses `production: path/to/file` annotations from strategy content | positive | AC-002-05, AC-010-02 | src/core/validators/test-implementation-validator.js |

#### 6.3.4 Fail-Open and Edge Cases (FR-002)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TIV-14 | null testStrategyContent → pass: true, missing_artifacts | positive | AC-002-07 | src/core/validators/test-implementation-validator.js |
| TIV-15 | null testFiles → pass: true, missing_artifacts | positive | AC-002-07 | src/core/validators/test-implementation-validator.js |
| TIV-16 | null modifiedFiles → Part B/C skip with warning, Part A still runs | positive | AC-002-07 | src/core/validators/test-implementation-validator.js |
| TIV-17 | Empty modifiedFiles → all imports flagged unmodified | negative | AC-002-04 | src/core/validators/test-implementation-validator.js |
| TIV-18 | Combined pass: all three parts must pass for overall pass | positive | AC-002-01, AC-002-06 | src/core/validators/test-implementation-validator.js |

### 6.4 test-execution-validator.js — Unit Tests (TEV-)

#### 6.4.1 Happy Path (FR-003)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TEV-01 | All planned tests executed → pass: true, unexecuted_tests: [] | positive | AC-003-01, AC-003-02 | src/core/validators/test-execution-validator.js |
| TEV-02 | Returns executed_tests list matching output | positive | AC-003-02 | src/core/validators/test-execution-validator.js |

#### 6.4.2 Failure Cases (FR-003)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TEV-03 | Some planned tests not in output → unexecuted_tests lists them | negative | AC-003-03 | src/core/validators/test-execution-validator.js |
| TEV-04 | Failed tests extracted → failed_tests populated, pass: false | negative | AC-003-04 | src/core/validators/test-execution-validator.js |
| TEV-05 | Mix of executed, failed, unexecuted → all categorized correctly | negative | AC-003-03, AC-003-04 | src/core/validators/test-execution-validator.js |

#### 6.4.3 Output Format Parsing (FR-003)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TEV-06 | Parses node:test output (checkmark + test name) | positive | AC-003-02 | src/core/validators/test-execution-validator.js |
| TEV-07 | Parses Jest output (PASS/FAIL markers) | positive | AC-003-02 | src/core/validators/test-execution-validator.js |
| TEV-08 | Parses TAP output (ok N / not ok N) | positive | AC-003-02 | src/core/validators/test-execution-validator.js |
| TEV-09 | Parses node:test failure output (cross mark + test name) | positive | AC-003-04 | src/core/validators/test-execution-validator.js |

#### 6.4.4 Fail-Open (FR-003)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| TEV-10 | null testStrategyContent → pass: true, missing_artifacts | positive | AC-003-01 | src/core/validators/test-execution-validator.js |
| TEV-11 | null testExecutionOutput → pass: true, missing_artifacts | positive | AC-003-01 | src/core/validators/test-execution-validator.js |
| TEV-12 | Empty output string → no tests detected, all planned unexecuted | negative | AC-003-03 | src/core/validators/test-execution-validator.js |

### 6.5 coverage-presence-validator.js — Unit Tests (CPV-)

#### 6.5.1 Coverage Found (FR-004)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CPV-01 | Coverage line present, meets threshold → pass: true | positive | AC-004-01 | src/core/validators/coverage-presence-validator.js |
| CPV-02 | Coverage line present, below threshold → pass: false with percent + threshold | negative | AC-004-03 | src/core/validators/coverage-presence-validator.js |
| CPV-03 | Returns source_pattern identifying which regex matched | positive | AC-004-01 | src/core/validators/coverage-presence-validator.js |

#### 6.5.2 Coverage Not Found (FR-004)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CPV-04 | No coverage data and required: true → pass: false, failure_reason: "no_coverage_data" | negative | AC-004-02 | src/core/validators/coverage-presence-validator.js |
| CPV-05 | No coverage data and required: false → pass: true | positive | AC-004-02 | src/core/validators/coverage-presence-validator.js |

#### 6.5.3 Regex Patterns (FR-004)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CPV-06 | Matches "Coverage: 85.3%" format | positive | AC-004-04 | src/core/validators/lib/coverage-patterns.js |
| CPV-07 | Matches "Statements : 92.1%" format | positive | AC-004-04 | src/core/validators/lib/coverage-patterns.js |
| CPV-08 | Matches "Lines: 78%" format | positive | AC-004-04 | src/core/validators/lib/coverage-patterns.js |

#### 6.5.4 Fail-Open (FR-004)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CPV-09 | null testExecutionOutput → pass: true, missing_artifacts | positive | AC-004-01 | src/core/validators/coverage-presence-validator.js |
| CPV-10 | Empty string output → coverage_found: false | negative | AC-004-02 | src/core/validators/coverage-presence-validator.js |

### 6.6 constitutional-validator.js — Unit Tests (CV-)

#### 6.6.1 Orchestration (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CV-01 | All articles compliant → pass: true, articles_violated: [] | positive | AC-005-08 | src/core/validators/constitutional-validator.js |
| CV-02 | One article violated → pass: false, violations populated | negative | AC-005-08 | src/core/validators/constitutional-validator.js |
| CV-03 | Multiple articles violated → all violations collected | negative | AC-005-08 | src/core/validators/constitutional-validator.js |
| CV-04 | Runs only requested articleIds, not all articles | positive | AC-005-08 | src/core/validators/constitutional-validator.js |
| CV-05 | Unknown article ID → skipped with warning, does not fail | positive | AC-005-08 | src/core/validators/constitutional-validator.js |

#### 6.6.2 Parallel Execution (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CV-06 | useAgentTeams: false → runs via Promise.all | positive | AC-005-09 | src/core/validators/constitutional-validator.js |
| CV-07 | Individual article check crash → caught, does not fail entire validation | positive | AC-005-09 | src/core/validators/constitutional-validator.js |

#### 6.6.3 Fail-Open (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CV-08 | null constitutionContent → pass: true, missing_artifacts | positive | AC-005-08 | src/core/validators/constitutional-validator.js |
| CV-09 | null articleIds → pass: true (nothing to check) | positive | AC-005-08 | src/core/validators/constitutional-validator.js |
| CV-10 | null artifactContents → pass: true, missing_artifacts | positive | AC-005-08 | src/core/validators/constitutional-validator.js |

### 6.7 Constitutional Checks — Unit Tests (CC-)

#### 6.7.1 Article II: Test-First (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-01 | Artifacts include test file with test count > 0 → compliant | positive | AC-005-01 | src/core/validators/constitutional-checks/article-ii.js |
| CC-02 | No test file in artifacts → violated | negative | AC-005-01 | src/core/validators/constitutional-checks/article-ii.js |
| CC-03 | Test file present but 0 test cases detected → violated | negative | AC-005-01 | src/core/validators/constitutional-checks/article-ii.js |

#### 6.7.2 Article III: Security (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-04 | No secret patterns in non-test code → compliant | positive | AC-005-02 | src/core/validators/constitutional-checks/article-iii.js |
| CC-05 | API_KEY found in production code → violated | negative | AC-005-02 | src/core/validators/constitutional-checks/article-iii.js |
| CC-06 | SECRET in test file → ignored (test files excluded) | positive | AC-005-02 | src/core/validators/constitutional-checks/article-iii.js |

#### 6.7.3 Article V: Simplicity (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-07 | All files under 500 lines → compliant | positive | AC-005-03 | src/core/validators/constitutional-checks/article-v.js |
| CC-08 | File exceeds 500 lines → violated | negative | AC-005-03 | src/core/validators/constitutional-checks/article-v.js |
| CC-09 | Custom maxFileLines option respected | positive | AC-005-03 | src/core/validators/constitutional-checks/article-v.js |

#### 6.7.4 Article VII: Traceability (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-10 | AC references in test files and traceability matrix exists → compliant | positive | AC-005-04 | src/core/validators/constitutional-checks/article-vii.js |
| CC-11 | No AC references in test files → violated | negative | AC-005-04 | src/core/validators/constitutional-checks/article-vii.js |
| CC-12 | No traceability matrix artifact → violated | negative | AC-005-04 | src/core/validators/constitutional-checks/article-vii.js |

#### 6.7.5 Article VIII: Documentation (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-13 | Agent/skill counts unchanged → compliant (no docs needed) | positive | AC-005-05 | src/core/validators/constitutional-checks/article-viii.js |
| CC-14 | Counts changed and docs updated → compliant | positive | AC-005-05 | src/core/validators/constitutional-checks/article-viii.js |
| CC-15 | Counts changed but docs not updated → violated | negative | AC-005-05 | src/core/validators/constitutional-checks/article-viii.js |

#### 6.7.6 Article IX: Gate Integrity (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-16 | All prior phase gates completed → compliant | positive | AC-005-06 | src/core/validators/constitutional-checks/article-ix.js |
| CC-17 | Prior phase gate not completed → violated | negative | AC-005-06 | src/core/validators/constitutional-checks/article-ix.js |
| CC-18 | No prior phases (first phase) → compliant | positive | AC-005-06 | src/core/validators/constitutional-checks/article-ix.js |

#### 6.7.7 Article X: Fail-Safe (FR-005)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CC-19 | Error handling patterns present in new code → compliant | positive | AC-005-07 | src/core/validators/constitutional-checks/article-x.js |
| CC-20 | No try/catch/.catch/default in new code → violated | negative | AC-005-07 | src/core/validators/constitutional-checks/article-x.js |
| CC-21 | Empty artifact contents → compliant (nothing to check) | positive | AC-005-07 | src/core/validators/constitutional-checks/article-x.js |

### 6.8 validate-phase.js — Integration Tests (VP-)

#### 6.8.1 Phase-to-Validator Mapping (FR-007)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| VP-01 | Phase 05 runs traceability + constitutional validators | positive | AC-007-01, AC-007-05 | src/core/validators/validate-phase.js |
| VP-02 | Phase 06 runs test-implementation + coverage + constitutional validators | positive | AC-007-01, AC-007-05 | src/core/validators/validate-phase.js |
| VP-03 | Phase 07 runs test-execution + coverage + constitutional validators | positive | AC-007-01, AC-007-05 | src/core/validators/validate-phase.js |

#### 6.8.2 Parallel Execution (FR-007)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| VP-04 | Validators 1-4 run via Promise.all (not sequential) | positive | AC-007-02 | src/core/validators/validate-phase.js |
| VP-05 | Validator 5 (constitutional) runs via Promise.all when useAgentTeams: false | positive | AC-007-03 | src/core/validators/validate-phase.js |

#### 6.8.3 Result Merging (FR-007)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| VP-06 | All validators pass → merged pass: true | positive | AC-007-04 | src/core/validators/validate-phase.js |
| VP-07 | One validator fails → merged pass: false, failures populated | negative | AC-007-04 | src/core/validators/validate-phase.js |
| VP-08 | Validator crash → validator_errors populated, does not cause pass: false | positive | AC-007-04 | src/core/validators/validate-phase.js |

#### 6.8.4 Fail-Open on Errors (FR-007)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| VP-09 | Validator throws exception → caught, added to validator_errors | positive | AC-007-04 | src/core/validators/validate-phase.js |
| VP-10 | All validators crash → pass: true, all logged to validator_errors | positive | AC-007-04 | src/core/validators/validate-phase.js |

### 6.9 gate-logic.js — Integration Tests (GLT-)

#### 6.9.1 checkTraceabilityRequirement (FR-008)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| GLT-01 | Traceability check passes → satisfied: true | positive | AC-008-01 | src/core/validators/gate-logic.js |
| GLT-02 | Traceability check fails → satisfied: false with structured reason | negative | AC-008-01, AC-008-04 | src/core/validators/gate-logic.js |
| GLT-03 | Traceability disabled in config → check skipped, satisfied: true | positive | AC-008-03 | src/core/validators/gate-logic.js |
| GLT-04 | Bridge import fails → falls back gracefully, satisfied: true | positive | AC-008-02 | src/core/bridge/validators.cjs |
| GLT-05 | Integrated into check() alongside existing 5 checks | positive | AC-008-03 | src/core/validators/gate-logic.js |
| GLT-06 | On pass: false emits "GATE BLOCKED" with failure details | negative | AC-008-04, AC-008-05 | src/core/validators/gate-logic.js |

### 6.10 runtime.js (Codex) — Integration Tests (RVG-)

#### 6.10.1 validatePhaseGate (FR-009)

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| RVG-01 | Validation passes → allows phase advancement | positive | AC-009-01, AC-009-02 | src/providers/codex/runtime.js |
| RVG-02 | Validation fails → blocks advancement, returns structured failure | negative | AC-009-03 | src/providers/codex/runtime.js |
| RVG-03 | Structured result format consumable by Codex runner | positive | AC-009-05 | src/providers/codex/runtime.js |
| RVG-04 | Retry count tracked in phase advancement loop | positive | AC-009-04 | src/providers/codex/runtime.js |
| RVG-05 | Validator crash → fail-open, allows advancement with warning | positive | AC-009-05 | src/providers/codex/runtime.js |
| RVG-06 | Imports validatePhase directly (ESM to ESM) | positive | AC-009-01 | src/providers/codex/runtime.js |

### 6.11 Codex-Specific Acceptance Criteria Tests

These are mapped to existing test IDs above. Cross-reference:

| Codex AC | Mapped Test IDs | Rationale |
|----------|----------------|-----------|
| AC-C01 | RVG-01, RVG-06 | Codex uses independent validators, not hooks |
| AC-C02 | VP-01, TV-01, TV-04 | Phase 05 validation via validate-phase |
| AC-C03 | VP-02, TIV-01, TIV-02 | Phase 06 validation via validate-phase |
| AC-C04 | VP-03, TEV-01, TEV-03 | Phase 07 validation via validate-phase |
| AC-C05 | CPV-04, CPV-05 | Coverage absence surfaced |
| AC-C06 | CV-01, CV-02, CC-01 through CC-21 | Constitutional independence |
| AC-C07 | RVG-03 | Structured format |
| AC-C08 | RVG-05, VP-09, VP-10 | Fail-open on errors |
| AC-C09 | All TIV-, TEV-, CPV-, RVG- tests | Valid, invalid, fail-open coverage |

### 6.12 FR-010: Test-Strategy Artifact Enhancement Tests

| Test ID | Mapped From | Coverage |
|---------|-------------|----------|
| TIP-10 | AC-010-01 | production: annotation parsing |
| TIV-11 | AC-010-02 | AC-to-production file validation |
| TIV-13 | AC-010-02 | Parser correctly reads production: annotations from strategy |

### 6.13 FR-006: Default Tier Configuration Tests

FR-006 (default_tier in config.json) is a configuration concern. It is tested indirectly through CPV- tests that provide threshold options. A dedicated test for `resolveCoverageThreshold()` reading from config is deferred to the implementation phase where the exact function signature is established. The coverage-presence-validator tests (CPV-01, CPV-02) validate threshold comparison logic.

| Test ID | Target | Type | AC | Production File |
|---------|--------|------|----|-----------------|
| CPV-01 | Threshold comparison works correctly | positive | AC-006-03 | src/core/validators/coverage-presence-validator.js |
| CPV-02 | Below-threshold detection | negative | AC-006-03 | src/core/validators/coverage-presence-validator.js |

## 7. Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Statement coverage | >= 80% | Article II standard tier |
| Branch coverage | >= 75% | Error handling branches in every validator |
| Function coverage | >= 90% | Every exported function exercised |
| AC coverage | 100% | Every AC has at least one test (traceability requirement) |

## 8. Test Data Approach

All test data is inline string constants within test files. Validators are pure functions operating on markdown content strings. No fixtures directory needed — each test constructs its own minimal input content.

**Example test data patterns**:
- Requirements-spec content: markdown with `AC-NNN-NN` identifiers
- Test-strategy content: markdown with test ID tables and `production:` annotations
- Test runner output: realistic `node:test`, Jest, and TAP format strings
- Coverage output: strings like `"Coverage: 85.3%"` or `"Statements : 92.1%"`
- Artifact contents: array of `{ name, content }` objects
- Modified files: array of relative path strings

## 9. Negative and Boundary Test Summary

| Category | Test IDs | Count |
|----------|----------|-------|
| Missing/null inputs (fail-open) | TV-08..10, TIV-14..16, TEV-10..11, CPV-09, CV-08..10 | 11 |
| Empty string inputs | TV-11..12, CPV-10, TEV-12 | 4 |
| Validation failures (pass: false) | TV-04..06, TIV-02..03,06,12,17, TEV-03..05, CPV-02,04 | 13 |
| Malformed/unparseable input | TV-07, TIP-03 | 2 |
| Validator crashes (error handling) | VP-08..10, CV-07, RVG-05 | 5 |
| **Total negative/boundary** | | **35** |

Negative and boundary tests represent 29% of total tests (~35 of ~119).

## 10. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Test-strategy format varies | Flexible regex patterns tested with multiple format variations |
| CJS bridge dynamic import | Integration test (GLT-04) explicitly tests bridge failure fallback |
| Constitutional checks too heuristic | Each check has both compliant and violated test cases |
| Promise.all ordering non-determinism | Tests validate merged results (order-independent), not execution order |
