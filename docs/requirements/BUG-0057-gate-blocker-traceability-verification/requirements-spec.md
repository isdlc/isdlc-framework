# Requirements Specification: BUG-0057 — Gate-Blocker Traceability Verification

**Source**: GitHub Issue #209
**Status**: Analyzed
**Created**: 2026-03-25
**Confidence**: High (user-confirmed all FRs, ACs, and design)

---

## 1. Business Context

### Problem Statement

The gate-blocker hooks across Phases 05, 06, and 07 do not verify traceability between requirements, test designs, test implementations, and production code. Constitutional compliance is self-attested by the producing agent. Coverage enforcement silently passes when test runners don't output coverage data. These gaps mean quality gates can be satisfied without actual quality.

### Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| Framework developer (dogfooding) | Primary | Reliable quality gates that catch incomplete work |
| Downstream users (Claude Code + Codex) | Secondary | Trust that phase advancement means real compliance |

### Success Metrics

- Phase 05 gate blocks when any AC lacks a mapped test case
- Phase 06 gate blocks when test cases are designed but not coded, or production code is missing
- Phase 07 gate blocks when designed tests weren't executed
- Coverage absence produces a warning or block, never silently passes
- Constitutional compliance is independently verified, not self-attested
- All validators work identically in Claude Code (via hooks) and Codex (via runtime)

### Driving Factors

- Discovered during REQ-0139 build: the entire traceability chain from requirements to production code is trust-based
- Codex has no hooks — enforcement must be provider-neutral core modules

---

## 2. Stakeholders and Personas

### Framework Developer (Primary)

- **Role**: Develops the framework itself, relies on gates to catch agent mistakes
- **Pain points**: Agent self-reports compliance without independent verification; coverage silently passes with no data
- **Proficiency**: Expert

### Downstream Codex User (Secondary)

- **Role**: Uses iSDLC via Codex where hooks don't exist
- **Pain points**: No enforcement mechanism at all — relies entirely on agent instruction-following
- **Proficiency**: Intermediate

---

## 3. User Journeys

### Journey 1: Phase 05 Gate Catches Missing Test Cases

1. Test-design-engineer completes Phase 05, writes test-strategy.md
2. Gate-blocker fires, calls traceability validator
3. Validator parses requirements-spec.md (12 ACs) and test-strategy.md (10 mapped)
4. Returns `{ pass: false, orphan_acs: ["AC-003-01", "AC-003-02"] }`
5. Gate blocks, controller re-delegates with orphan AC list
6. Agent adds missing test cases, gate re-runs, passes

### Journey 2: Phase 06 Gate Catches Missing Production Code

1. Software-developer implements tests and some production code
2. Gate-blocker fires, calls test-implementation validator
3. Validator finds test imports `verb-resolver.js` but file not in git diff
4. Returns `{ pass: false, unmodified_imports: ["src/providers/codex/verb-resolver.js"] }`
5. Gate blocks, controller re-delegates
6. Agent writes the production module, gate passes

### Journey 3: Codex Runtime Enforces Same Checks

1. Codex exec completes Phase 06
2. Runtime reads artifacts, calls same validators
3. Validator returns failure
4. Runtime blocks advancement, feeds structured failure into next codex exec delegation

---

## 4. Technical Context

### Constraints

- Validators must be provider-neutral ESM modules — no hooks, no state.json dependency
- Claude hooks (CJS) call validators via dynamic `import()` bridge
- Codex runtime (ESM) imports validators directly
- Validators are pure functions: content-in, structured-result-out, no filesystem access
- Fail-open on validator code errors (crash/exception), fail-closed on validation failures

### Existing Patterns

- `src/core/bridge/validators.cjs` — CJS bridge for ESM core modules (REQ-0088)
- `gate-logic.cjs` — runs 5 gate checks, would gain traceability as 6th
- `atdd-completeness-validator.cjs` — content-aware validation (ATDD mode only)
- `test-watcher.cjs` — coverage regex parsing (to be extracted into shared module)
- `3f-gate-blocker` retry protocol in phase-loop controller

### Cross-Provider Guarantee

Claude implementation uses hook-based enforcement. Codex implementation provides equivalent guarantees through runtime validation. Both call the same core validator modules.

---

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|---|---|---|
| Correctness | Critical | Zero false negatives (missed orphan ACs) in validators 1-3 |
| Performance | High | All validators complete in < 500ms (regex on markdown files) |
| Provider parity | Critical | Claude and Codex produce identical results for same inputs |
| Fail-safety | High | Validator crash → pass with warning; validation failure → block |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Test-strategy.md format varies across projects | Medium | High | Flexible regex; parser handles common patterns; unparseable_references surfaced |
| CJS→ESM bridge dynamic import fails | Low | Medium | Bridge fallback to inline validation (existing behavior) |
| Constitutional article checks too heuristic | Medium | Medium | Start with concrete deterministic checks; expand over time |
| Git diff not available in sandboxed Codex exec | Low | High | Runtime reads git diff before delegating, passes as input |

---

## 6. Functional Requirements

### FR-001: Traceability Validator (Gap 1 — Phase 05)

**Description**: Validates that every AC in requirements-spec.md has at least one test case mapped in test-strategy.md.
**Confidence**: High

- **AC-001-01**: Validator parses AC-NNN-NN identifiers from requirements-spec content
- **AC-001-02**: Validator parses test case → AC mappings from test-strategy content
- **AC-001-03**: Returns orphan_acs list for ACs with no mapped test case
- **AC-001-04**: Returns mapped_test_cases with AC → test ID associations
- **AC-001-05**: Returns unparseable_references for malformed IDs
- **AC-001-06**: Missing artifact content returns `{ pass: true, missing_artifacts: [...] }` (fail-open on missing input)

### FR-002: Test Implementation Validator (Gap 2 — Phase 06)

**Description**: Three-part validation: (A) planned test cases coded, (B) production modules imported by tests were modified, (C) AC → production file mappings verified against git diff.
**Confidence**: High

- **AC-002-01**: Part A — extracts planned test IDs from test-strategy, matches against test file contents
- **AC-002-02**: Part A — returns unimplemented_tests for planned IDs not found in any test file
- **AC-002-03**: Part B — parses import statements from test files, extracts production module paths
- **AC-002-04**: Part B — cross-references imports against modifiedFiles list, returns unmodified_imports
- **AC-002-05**: Part C — parses AC → production file mappings from test-strategy
- **AC-002-06**: Part C — verifies production files appear in modifiedFiles, returns orphan_acs_no_production
- **AC-002-07**: Caller passes modifiedFiles from git diff; validator does not access filesystem

### FR-003: Test Execution Validator (Gap 3 — Phase 07)

**Description**: Validates that all planned test cases were executed in the test run.
**Confidence**: High

- **AC-003-01**: Extracts planned test IDs from test-strategy
- **AC-003-02**: Extracts executed test IDs from test runner output (supports node:test, Jest, TAP formats)
- **AC-003-03**: Returns unexecuted_tests for planned IDs not in execution output
- **AC-003-04**: Returns failed_tests for tests that executed but failed

### FR-004: Coverage Presence Validator (Gap 4 — Phase 06/07)

**Description**: Validates that coverage data is present in test output; surfaces absence instead of silently passing.
**Confidence**: High

- **AC-004-01**: Extracts coverage percentage from test output using shared regex patterns (from test-watcher)
- **AC-004-02**: When coverage not found and `options.required === true`: returns `{ pass: false, failure_reason: "no_coverage_data" }`
- **AC-004-03**: When coverage found but below threshold: returns `{ pass: false }` with coverage_percent and threshold
- **AC-004-04**: Coverage regex patterns extracted from test-watcher into shared module (no duplication)

### FR-005: Constitutional Compliance Validator (Gap 5 — All Phases)

**Description**: Independent per-article constitutional checks replacing self-attestation. Each article has a concrete, deterministic check function.
**Confidence**: High

- **AC-005-01**: Article II check — test file exists in artifacts, test count > 0
- **AC-005-02**: Article III check — no secret patterns (`API_KEY`, `PASSWORD`, `SECRET`, `TOKEN`) in non-test code
- **AC-005-03**: Article V check — no file exceeds configurable line limit (default 500)
- **AC-005-04**: Article VII check — AC references present in test files, traceability matrix artifact exists
- **AC-005-05**: Article VIII check — docs updated if agent/skill counts changed
- **AC-005-06**: Article IX check — all prior phase gates completed
- **AC-005-07**: Article X check — error handling patterns present in new code
- **AC-005-08**: Orchestrates per-article checks for phase's required articles; runs applicable subset
- **AC-005-09**: Can run as parallel agent teams (Claude) or parallel Promise.all (Codex)

### FR-006: Default Tier Configuration (Gap 6)

**Description**: Configurable default coverage tier so users can set project-wide thresholds.
**Confidence**: High

- **AC-006-01**: New key `default_tier` in `.isdlc/config.json` with values `"light"`, `"standard"`, `"epic"`
- **AC-006-02**: Default value is `"standard"` when key is absent
- **AC-006-03**: `resolveCoverageThreshold()` reads `default_tier` as fallback when no sizing decision exists

### FR-007: Phase Validation Entry Point

**Description**: Single `validatePhase()` function that both Claude hooks and Codex runtime call.
**Confidence**: High

- **AC-007-01**: `validatePhase(phaseKey, inputs, options)` runs all applicable validators for the phase
- **AC-007-02**: Validators 1-4 run via `Promise.all()` (fast regex)
- **AC-007-03**: Validator 5 supports agent teams parallelism (Claude) or Promise.all (Codex)
- **AC-007-04**: Returns merged result with per-validator details
- **AC-007-05**: Phase-to-validator mapping read from `iteration-requirements.json`

### FR-008: Claude Hook Integration

**Description**: Existing gate-blocker and constitution-validator hooks call core validators via CJS bridge.
**Confidence**: High

- **AC-008-01**: `gate-logic.cjs` gains `checkTraceabilityRequirement()` calling core validators via bridge
- **AC-008-02**: Bridge uses dynamic `import()` for CJS→ESM interop with lazy-init cache
- **AC-008-03**: Hook fires on same events as today; enforcement surface unchanged
- **AC-008-04**: On `pass: false`, emits `"GATE BLOCKED"` with structured failure details
- **AC-008-05**: Existing `3f-gate-blocker` retry protocol handles re-delegation (max 3 retries)

### FR-009: Codex Runtime Integration

**Description**: Codex runtime imports core validators directly and enforces before phase advancement.
**Confidence**: High

- **AC-009-01**: `runtime.js` imports `validatePhase()` directly (ESM to ESM)
- **AC-009-02**: Called after `codex exec` returns, before advancing phase index
- **AC-009-03**: On `pass: false`, blocks advancement and feeds structured failure into next delegation
- **AC-009-04**: Retry count tracked in runtime's phase advancement loop
- **AC-009-05**: Validator results use structured format consumable by Codex runner

### FR-010: Test-Strategy Artifact Enhancement

**Description**: Phase 05 test-design-engineer produces AC → production file mappings alongside AC → test case mappings.
**Confidence**: High

- **AC-010-01**: Test-strategy.md includes production file mappings per AC
- **AC-010-02**: Validator 2 Part C can parse these mappings

### FR-011: Shared Test ID Parser

**Description**: Common parsing functions used by validators 1, 2, and 3.
**Confidence**: High

- **AC-011-01**: `extractTestCaseIds(content)` returns test IDs from strategy content
- **AC-011-02**: `extractAcIds(content)` returns AC IDs from requirements-spec content
- **AC-011-03**: `extractTestToAcMappings(content)` returns test case → AC + production file mappings

---

## 7. Out of Scope

| Item | Reason | Dependency |
|---|---|---|
| AST-based test parsing | Regex on consistent ID patterns is sufficient for current conventions | Future enhancement if conventions diverge |
| Full SAST security scanning | Article III check is heuristic (common secret patterns), not comprehensive | Separate security tooling |
| Cyclomatic complexity analysis | Article V check uses line count heuristic, not AST complexity | Complexity tooling |
| Mutation testing enforcement | Article XI mentions mutation testing but this is a separate capability | Existing ATDD path |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|---|---|---|---|
| FR-001 | Traceability Validator | Must Have | Foundation — Phase 05 traceability is prerequisite for all others |
| FR-002 | Test Implementation Validator | Must Have | Core TDD verification — tests + production code |
| FR-003 | Test Execution Validator | Must Have | Completes the chain — designed tests were actually run |
| FR-004 | Coverage Presence Validator | Must Have | Closes fail-open gap |
| FR-005 | Constitutional Compliance Validator | Must Have | Replaces self-attestation |
| FR-006 | Default Tier Configuration | Should Have | Config fix, low effort |
| FR-007 | Phase Validation Entry Point | Must Have | Single entry point for both providers |
| FR-008 | Claude Hook Integration | Must Have | Connects validators to existing enforcement |
| FR-009 | Codex Runtime Integration | Must Have | Closes Codex enforcement gap |
| FR-010 | Test-Strategy Artifact Enhancement | Must Have | Enables Validator 2 Part C |
| FR-011 | Shared Test ID Parser | Must Have | Shared by validators 1-3 |

---

## 9. Codex-Specific Acceptance Criteria

- **AC-C01**: Codex phase advancement runs independent validator modules instead of relying on Claude hooks
- **AC-C02**: Phase 05 validation checks requirements-to-test-design traceability before allowing progression
- **AC-C03**: Phase 06 validation checks planned test cases against implemented tests before allowing progression
- **AC-C04**: Phase 07 validation checks executed tests against the designed test set before allowing progression
- **AC-C05**: Coverage absence is surfaced as warning or blocking behavior in Codex mode; it cannot silently pass unnoticed
- **AC-C06**: Constitutional compliance is independently validated in Codex mode rather than accepted from self-attestation alone
- **AC-C07**: Validator results use a structured format consumable by the Codex runner
- **AC-C08**: All Codex validations preserve fail-open behavior on parser/tooling errors
- **AC-C09**: Automated tests cover valid, invalid, and fail-open cases for Codex runner enforcement
