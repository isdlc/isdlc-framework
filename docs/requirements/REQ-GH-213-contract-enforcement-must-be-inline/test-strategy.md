# Test Strategy: Inline Contract Enforcement

**REQ-GH-213** | Phase: 05-test-strategy | Status: Accepted

---

## 1. Existing Infrastructure

- **Test runner**: Node.js built-in (`node --test`)
- **Assertion library**: `node:assert/strict`
- **Module system**: ESM for core modules, CJS for hooks
- **Test commands**: `npm run test:core` (runs `tests/core/**/*.test.js`)
- **Parity tests**: `tests/verification/parity/governance-parity.test.js`
- **Baseline**: 555+ tests (regression threshold per Article II)
- **Existing fixtures**: `tests/core/validators/fixtures/contracts/` (valid + malformed contract JSON)
- **Conventions**: Test IDs use short prefixes (CE-, CL-, PAR-GOV-), `describe`/`it` blocks, `makeEntry()` helpers, temp dirs for I/O tests

**Approach**: Extend existing test suite. Add new test files alongside existing validator tests. Follow established naming, fixture, and helper patterns.

---

## 2. Test Scope

### 2.1 Modules Under Test

| Module | Path | Test File |
|--------|------|-----------|
| Contract Checks (7 functions + error class) | `src/core/validators/contract-checks.js` | `tests/core/validators/contract-checks.test.js` |
| Template Loader (2 functions) | `src/core/validators/template-loader.js` | `tests/core/validators/template-loader.test.js` |
| Codex Parity | `src/providers/codex/runtime.js` + `governance.js` | `tests/verification/parity/governance-parity.test.js` (extend) |

### 2.2 Out of Scope

- Tool-usage enforcement (deferred to #214)
- Content quality validation (checks structure, not content)
- Claude agent markdown wiring (not unit-testable -- covered by integration/characterization tests)
- Existing `contract-evaluator.js` tests (updated during cleanup, not designed here)

---

## 3. Test Pyramid

### Unit Tests (Primary Focus)

All 7 check functions and the error class are pure stateless functions. This is ideal for unit testing: no mocks, no I/O (except `checkArtifacts` which uses `existsSync`), trivially fast. Unit tests carry the bulk of coverage for this feature.

**Target**: 100% branch coverage for all check functions.

| Test Area | Estimated Count | Test ID Prefix |
|-----------|----------------|----------------|
| ContractViolationError | 5 | CC-ERR- |
| checkDomainTransition | 6 | CC-DT- |
| checkBatchWrite | 7 | CC-BW- |
| checkPersonaFormat | 10 | CC-PF- |
| checkPersonaContribution | 6 | CC-PC- |
| checkDelegation | 5 | CC-DG- |
| checkArtifacts | 6 | CC-ART- |
| checkTaskList | 9 | CC-TL- |
| Template Loader | 8 | TL- |
| **Total unit** | **62** | |

### Integration Tests

Validate that the Claude path (session cache -> check functions) and Codex path (loadContractEntry -> check functions) produce identical results for identical inputs. No mocking -- real file I/O against temp directories with real contract/template JSON files.

**Target**: >=70% integration coverage (per Article II).

| Test Area | Estimated Count | Test ID Prefix |
|-----------|----------------|----------------|
| Cross-provider parity | 6 | PAR-CC- |

### Performance Tests

Each check function must complete in <50ms (requirement from QA section). Measured with `performance.now()` in unit tests -- no separate perf framework needed for pure functions on in-memory data.

| Test Area | Estimated Count | Test ID Prefix |
|-----------|----------------|----------------|
| Per-function <50ms budget | 7 | PERF-CC- |

### Total: 75 new tests

---

## 4. Test Cases

### 4.1 ContractViolationError (CC-ERR-01 to CC-ERR-05)

Traces: FR-001, AC-001-04

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-ERR-01 | Constructor sets all properties (decisionPoint, expected, actual, contractId) | positive | `{ decisionPoint: 'domain_transition', expected: 'requirements', actual: 'design', contractId: 'analyze' }` | Error with all 4 properties set, `name === 'ContractViolationError'` | FR-001, AC-001-04 |
| CC-ERR-02 | Message format matches `CONTRACT VIOLATION [{dp}]: expected {e}, got {a}` | positive | Same as CC-ERR-01 | `message` matches pattern | FR-001, AC-001-04 |
| CC-ERR-03 | Is instanceof Error | positive | Any valid input | `error instanceof Error === true` | FR-001, AC-001-04 |
| CC-ERR-04 | contractId defaults to null when omitted | positive | `{ decisionPoint: 'x', expected: 'y', actual: 'z' }` | `contractId === null` | FR-001, AC-001-04 |
| CC-ERR-05 | Can be caught in try/catch as expected error type | positive | Throw and catch | `catch (e)` where `e.name === 'ContractViolationError'` | FR-001, AC-001-04 |

---

### 4.2 checkDomainTransition (CC-DT-01 to CC-DT-06)

Traces: FR-002, AC-002-01

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-DT-01 | Correct domain at correct index passes silently | positive | `contractData` with `confirmation_sequence: ['requirements','architecture','design']`, domain `'requirements'`, index `0` | No throw, returns void | FR-002, AC-002-01 |
| CC-DT-02 | Wrong domain at index throws ContractViolationError | negative | Same sequence, domain `'design'`, index `0` | Throws `ContractViolationError` with `expected: 'requirements'`, `actual: 'design'` | FR-002, AC-002-01 |
| CC-DT-03 | Index out of bounds throws (domain not in sequence) | negative | Sequence length 3, index `5` | Throws `ContractViolationError` | FR-002, AC-002-01 |
| CC-DT-04 | Missing confirmation_sequence is no-op (fail-open) | positive | `contractData` with no `confirmation_sequence` | No throw (fail-open per Article X) | FR-001, AC-001-03 |
| CC-DT-05 | Null contractData is no-op (fail-open) | positive | `null` | No throw | FR-001, AC-001-03 |
| CC-DT-06 | All three domains in correct sequence pass | positive | Check index 0='requirements', 1='architecture', 2='design' | All three pass | FR-002, AC-002-01 |

---

### 4.3 checkBatchWrite (CC-BW-01 to CC-BW-07)

Traces: FR-002, AC-002-02

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-BW-01 | All expected artifacts present in write set passes | positive | Expected: `['requirements-spec.md','architecture-overview.md']`, actual: `['docs/REQ-X/requirements-spec.md','docs/REQ-X/architecture-overview.md']` | No throw | FR-002, AC-002-02 |
| CC-BW-02 | Missing artifact throws with list of missing items | negative | Expected includes `'module-design.md'`, actual omits it | Throws with `actual` containing missing artifact name | FR-002, AC-002-02 |
| CC-BW-03 | Extra artifacts in write set are allowed (superset is fine) | positive | Actual has more artifacts than expected | No throw | FR-002, AC-002-02 |
| CC-BW-04 | Empty expected artifacts is no-op | positive | `artifacts_produced: []` or null | No throw (nothing expected = pass) | FR-001, AC-001-03 |
| CC-BW-05 | Null contractData is no-op (fail-open) | positive | `null` | No throw | FR-001, AC-001-03 |
| CC-BW-06 | Artifact paths are matched by basename, not full path | positive | Expected `'requirements-spec.md'`, actual `'docs/REQ-X/requirements-spec.md'` | Matches | FR-002, AC-002-02 |
| CC-BW-07 | artifactFolder substitution replaces `{artifact_folder}` in expected paths | positive | Expected has `'{artifact_folder}/requirements-spec.md'`, `artifactFolder = 'REQ-GH-213-...'` | Resolves and matches | FR-002, AC-002-02 |

---

### 4.4 checkPersonaFormat (CC-PF-01 to CC-PF-10)

Traces: FR-002, AC-002-03, FR-004, AC-004-01, AC-004-03

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-PF-01 | Bulleted output matches bulleted template | positive | Template `format_type: 'bulleted'`, output with `- ` prefixed lines | No throw | FR-002, AC-002-03 |
| CC-PF-02 | Numbered output violates bulleted template | negative | Template `format_type: 'bulleted'`, output with `1. ` prefixed lines | Throws `ContractViolationError` | FR-002, AC-002-03 |
| CC-PF-03 | Table output violates bulleted template | negative | Template `format_type: 'bulleted'`, output with `| col |` lines | Throws `ContractViolationError` | FR-002, AC-002-03 |
| CC-PF-04 | Sections in correct order pass | positive | Template with `section_order: ['functional_requirements','assumptions']`, output has both in order | No throw | FR-004, AC-004-03 |
| CC-PF-05 | Sections in wrong order throw | negative | Same template, output has assumptions before functional_requirements | Throws | FR-004, AC-004-03 |
| CC-PF-06 | Missing required section throws | negative | Template with `required_sections: ['assumptions']`, output omits assumptions | Throws | FR-004, AC-004-03 |
| CC-PF-07 | Inline assumptions placement passes when assumptions follow each FR | positive | Template `assumptions_placement: 'inline'`, output has assumptions after each FR block | No throw | FR-004, AC-004-03 |
| CC-PF-08 | Batched assumptions placement passes when assumptions are in separate section | positive | Template `assumptions_placement: 'batched'`, output has separate `## Assumptions` section | No throw | FR-004, AC-004-03 |
| CC-PF-09 | Null templateData is no-op (fail-open) | positive | `null` | No throw | FR-004, AC-004-04 |
| CC-PF-10 | Empty output with valid template throws (no format detected) | negative | Template `format_type: 'bulleted'`, output `''` | Throws (empty output cannot satisfy format) | FR-002, AC-002-03 |

---

### 4.5 checkPersonaContribution (CC-PC-01 to CC-PC-06)

Traces: FR-002, AC-002-04, AC-002-05

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-PC-01 | All configured personas contributed passes | positive | Configured: `['Maya','Alex','Jordan']`, contributed: `['Maya','Alex','Jordan']` | No throw | FR-002, AC-002-04 |
| CC-PC-02 | Missing persona throws with list of silent personas | negative | Configured: `['Maya','Alex','Jordan']`, contributed: `['Maya','Jordan']` | Throws with `actual` containing `'Alex'` | FR-002, AC-002-04 |
| CC-PC-03 | Extra contributions are allowed (superset) | positive | Configured: `['Maya']`, contributed: `['Maya','Alex']` | No throw | FR-002, AC-002-04 |
| CC-PC-04 | Empty configured personas is no-op | positive | `[]` | No throw | FR-002, AC-002-05 |
| CC-PC-05 | Dynamic persona list from roundtable.yaml is honored | positive | Configured from YAML: `['Aria','Blake']`, contributed: `['Aria','Blake']` | No throw (uses config, not hardcoded) | FR-002, AC-002-05 |
| CC-PC-06 | Null configuredPersonas is no-op (fail-open) | positive | `null` | No throw | FR-001, AC-001-03 |

---

### 4.6 checkDelegation (CC-DG-01 to CC-DG-05)

Traces: FR-003, AC-003-01, FR-006, AC-006-01

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-DG-01 | Correct agent for phase passes | positive | `contractData.expectations.agent: 'software-developer'`, phaseKey `'06-implementation'`, agentName `'software-developer'` | No throw | FR-003, AC-003-01 |
| CC-DG-02 | Wrong agent for phase throws | negative | Expected `'software-developer'`, actual `'test-design-engineer'` | Throws with expected/actual in error | FR-003, AC-003-01 |
| CC-DG-03 | Null agent expectation is no-op (fail-open) | positive | `contractData.expectations.agent: null` | No throw | FR-001, AC-001-03 |
| CC-DG-04 | Null contractData is no-op (fail-open) | positive | `null` | No throw | FR-001, AC-001-03 |
| CC-DG-05 | Discover workflow delegation validated same as feature | positive | Discover contract entry with expected agent, correct agent name | No throw (same function, different contract) | FR-006, AC-006-01 |

---

### 4.7 checkArtifacts (CC-ART-01 to CC-ART-06)

Traces: FR-003, AC-003-02, FR-006, AC-006-02

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-ART-01 | All expected artifacts exist on disk passes | positive | Write temp files, contract expects them | No throw | FR-003, AC-003-02 |
| CC-ART-02 | Missing artifact on disk throws | negative | Contract expects `requirements-spec.md`, file does not exist | Throws with list of missing | FR-003, AC-003-02 |
| CC-ART-03 | `{artifact_folder}` placeholder resolved correctly | positive | Expected path has `{artifact_folder}`, artifactFolder provided, file exists at resolved path | No throw | FR-003, AC-003-02 |
| CC-ART-04 | Empty artifacts_produced is no-op | positive | `artifacts_produced: []` or null | No throw | FR-001, AC-001-03 |
| CC-ART-05 | Null contractData is no-op (fail-open) | positive | `null` | No throw | FR-001, AC-001-03 |
| CC-ART-06 | Discover contract artifacts validated same as feature | positive | Discover contract entry with expected artifacts, all exist | No throw | FR-006, AC-006-02 |

---

### 4.8 checkTaskList (CC-TL-01 to CC-TL-09)

Traces: FR-004, AC-004-05, AC-004-06

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| CC-TL-01 | Task plan with all required phases passes | positive | Template requires phases `['05','06','16','08']`, task plan has all 4 | No throw | FR-004, AC-004-05 |
| CC-TL-02 | Missing required phase throws | negative | Template requires phase `'08'`, task plan omits it | Throws | FR-004, AC-004-05 |
| CC-TL-03 | All required task categories present in each phase passes | positive | Phase 06 has `setup`, `core_implementation`, `unit_tests`, `wiring_claude`, `wiring_codex`, `cleanup` | No throw | FR-004, AC-004-05 |
| CC-TL-04 | Missing task category throws | negative | Phase 06 missing `unit_tests` category | Throws with missing category | FR-004, AC-004-05 |
| CC-TL-05 | Each task has required metadata (traces, files, blocked_by) passes | positive | Every task has `traces`, `files`, `blocked_by`/`blocks` | No throw | FR-004, AC-004-06 |
| CC-TL-06 | Task missing traces metadata throws | negative | One task omits `traces` field | Throws | FR-004, AC-004-06 |
| CC-TL-07 | Task missing files metadata throws | negative | One task omits `files` field | Throws | FR-004, AC-004-06 |
| CC-TL-08 | Required sections (progress_summary, dependency_graph, traceability_matrix) present passes | positive | Task plan has all 3 sections | No throw | FR-004, AC-004-05 |
| CC-TL-09 | Null templateData is no-op (fail-open) | positive | `null` | No throw | FR-004, AC-004-04 |

---

### 4.9 Template Loader (TL-01 to TL-08)

Traces: FR-004, AC-004-01, AC-004-02, AC-004-04

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| TL-01 | loadTemplate returns shipped default when no override exists | positive | Shipped dir has `requirements.template.json`, override dir empty | Returns parsed JSON | FR-004, AC-004-01 |
| TL-02 | loadTemplate returns user override when override exists | positive | Both dirs have `requirements.template.json` | Returns override version | FR-004, AC-004-02 |
| TL-03 | loadTemplate returns null when neither exists | positive | Both dirs empty | Returns `null` (fail-open) | FR-004, AC-004-04 |
| TL-04 | loadTemplate handles malformed JSON gracefully (returns null) | positive | Override dir has invalid JSON file | Returns `null` (fail-open, no throw) | FR-004, AC-004-04 |
| TL-05 | loadAllTemplates returns map of all domains | positive | Shipped dir has 4 template files | Returns `{ requirements: {...}, architecture: {...}, design: {...}, tasks: {...} }` | FR-004, AC-004-01 |
| TL-06 | loadAllTemplates merges shipped and override per-domain | positive | Override has `design.template.json`, shipped has all 4 | Design uses override, others use shipped | FR-004, AC-004-02 |
| TL-07 | loadAllTemplates returns empty object when no templates found | positive | Both dirs empty | Returns `{}` | FR-004, AC-004-04 |
| TL-08 | loadTemplate reads from correct file paths | positive | Verify it looks for `{domain}.template.json` in both dirs | File read at expected path | FR-004, AC-004-01 |

---

### 4.10 Cross-Provider Parity (PAR-CC-01 to PAR-CC-06)

Traces: FR-007, AC-007-01, AC-007-02, AC-007-04

These tests verify that the same check functions produce identical results regardless of whether the data source is the Claude session cache or the Codex `loadContractEntry()` path. Since the functions are pure and stateless, parity is verified by calling each function with identically-structured data and confirming identical outcomes.

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| PAR-CC-01 | checkDomainTransition produces same result for identical data from both providers | positive | Same contractData, same domain/index | Both pass or both throw with same error properties | FR-007, AC-007-04 |
| PAR-CC-02 | checkBatchWrite produces same result for identical data from both providers | positive | Same contractData, same artifactPaths | Identical outcome | FR-007, AC-007-04 |
| PAR-CC-03 | checkPersonaFormat produces same result for identical data from both providers | positive | Same templateData, same output | Identical outcome | FR-007, AC-007-04 |
| PAR-CC-04 | checkPersonaContribution produces same result for identical data from both providers | positive | Same persona lists | Identical outcome | FR-007, AC-007-04 |
| PAR-CC-05 | checkDelegation produces same result for identical data from both providers | positive | Same contractData, same phase/agent | Identical outcome | FR-007, AC-007-04 |
| PAR-CC-06 | checkArtifacts produces same result for identical data from both providers | positive | Same contractData, same artifactFolder/projectRoot (temp dir) | Identical outcome | FR-007, AC-007-04 |

---

### 4.11 Performance Tests (PERF-CC-01 to PERF-CC-07)

Traces: QA (non-functional), <50ms budget per check

| ID | Description | Type | Input | Expected | FR/AC |
|----|-------------|------|-------|----------|-------|
| PERF-CC-01 | checkDomainTransition completes in <50ms | positive | Valid contractData | `performance.now()` delta < 50 | QA |
| PERF-CC-02 | checkBatchWrite completes in <50ms | positive | Valid contractData + artifact list | delta < 50 | QA |
| PERF-CC-03 | checkPersonaFormat completes in <50ms | positive | Valid templateData + output string | delta < 50 | QA |
| PERF-CC-04 | checkPersonaContribution completes in <50ms | positive | Valid persona lists | delta < 50 | QA |
| PERF-CC-05 | checkDelegation completes in <50ms | positive | Valid contractData | delta < 50 | QA |
| PERF-CC-06 | checkArtifacts completes in <50ms | positive | Valid contractData + temp dir with files | delta < 50 | QA |
| PERF-CC-07 | checkTaskList completes in <50ms | positive | Valid templateData + task plan | delta < 50 | QA |

---

## 5. Test Data Plan

### 5.1 Boundary Values

| Input | Boundary | Test IDs |
|-------|----------|----------|
| domainIndex | 0 (first), 2 (last), 3 (out of bounds) | CC-DT-01, CC-DT-03 |
| artifactPaths array | empty `[]`, single item, many items | CC-BW-04, CC-BW-01 |
| output string | empty `''`, single line, multi-section | CC-PF-10, CC-PF-01, CC-PF-04 |
| configuredPersonas | empty `[]`, single, three | CC-PC-04, CC-PC-01 |
| task plan phases | empty, all required present, one missing | CC-TL-01, CC-TL-02 |

### 5.2 Invalid Inputs

| Input | Invalid Value | Expected Behavior | Test IDs |
|-------|--------------|-------------------|----------|
| contractData | `null` | No-op (fail-open) | CC-DT-05, CC-BW-05, CC-DG-04, CC-ART-05 |
| contractData | `undefined` | No-op (fail-open) | same pattern |
| templateData | `null` | No-op (fail-open) | CC-PF-09, CC-TL-09 |
| configuredPersonas | `null` | No-op (fail-open) | CC-PC-06 |
| confirmation_sequence | missing key | No-op (fail-open) | CC-DT-04 |
| malformed JSON template | invalid JSON file | Returns null, no throw | TL-04 |

### 5.3 Maximum-Size Inputs

| Input | Max Size | Test Coverage |
|-------|----------|---------------|
| artifactPaths array | 50 paths (realistic max for a large phase) | CC-BW-01 (use larger fixture) |
| output string | 10KB (typical roundtable output) | CC-PF-01 (use larger fixture) |
| configuredPersonas | 10 personas (well beyond typical 3) | CC-PC-01 (verify no performance issue) |
| task plan | 50 tasks across 4 phases (realistic) | CC-TL-01 |

### 5.4 Test Fixtures

All fixtures are constructed in-test using helper functions (following existing `makeEntry()`, `makeContract()` patterns). No separate fixture files needed for unit tests.

For template loader tests: create temp directories with JSON files using `mkdtempSync()` + `writeFileSync()`, cleaned up in `afterEach()`. This follows the existing pattern in `contract-loader.test.js`.

**Fixture helpers to implement:**

```js
function makeContractData(overrides = {})   // builds contractData with expectations
function makeTemplateData(overrides = {})    // builds templateData with format rules
function makeTaskPlan(overrides = {})        // builds task plan object
function makePersonaList(names)              // builds persona string array
```

---

## 6. Traceability Matrix

| Requirement | AC | Test Cases | Test Type | Priority |
|-------------|-----|------------|-----------|----------|
| FR-001 | AC-001-01 | TL-01, TL-05 | positive | P0 |
| FR-001 | AC-001-02 | PERF-CC-01 to PERF-CC-07 | positive | P1 |
| FR-001 | AC-001-03 | CC-DT-04, CC-DT-05, CC-BW-04, CC-BW-05, CC-PF-09, CC-PC-04, CC-PC-06, CC-DG-03, CC-DG-04, CC-ART-04, CC-ART-05, CC-TL-09, TL-03, TL-04 | positive | P0 |
| FR-001 | AC-001-04 | CC-ERR-01 to CC-ERR-05 | positive | P0 |
| FR-002 | AC-002-01 | CC-DT-01 to CC-DT-06 | positive+negative | P0 |
| FR-002 | AC-002-02 | CC-BW-01 to CC-BW-07 | positive+negative | P0 |
| FR-002 | AC-002-03 | CC-PF-01 to CC-PF-10 | positive+negative | P0 |
| FR-002 | AC-002-04 | CC-PC-01 to CC-PC-06 | positive+negative | P0 |
| FR-002 | AC-002-05 | CC-PC-04, CC-PC-05 | positive | P0 |
| FR-003 | AC-003-01 | CC-DG-01 to CC-DG-05 | positive+negative | P0 |
| FR-003 | AC-003-02 | CC-ART-01 to CC-ART-06 | positive+negative | P0 |
| FR-004 | AC-004-01 | TL-01, TL-05, TL-08 | positive | P0 |
| FR-004 | AC-004-02 | TL-02, TL-06 | positive | P1 |
| FR-004 | AC-004-03 | CC-PF-04 to CC-PF-08 | positive+negative | P0 |
| FR-004 | AC-004-04 | TL-03, TL-04, TL-07, CC-PF-09, CC-TL-09 | positive | P0 |
| FR-004 | AC-004-05 | CC-TL-01 to CC-TL-04, CC-TL-08 | positive+negative | P1 |
| FR-004 | AC-004-06 | CC-TL-05 to CC-TL-07 | positive+negative | P1 |
| FR-005 | AC-005-01 | (verified during cleanup -- implementation phase) | N/A | P1 |
| FR-005 | AC-005-02 | (verified during cleanup -- implementation phase) | N/A | P1 |
| FR-005 | AC-005-03 | (verified by parity tests) | integration | P1 |
| FR-005 | AC-005-04 | (existing tests updated during cleanup) | N/A | P2 |
| FR-006 | AC-006-01 | CC-DG-05 | positive | P1 |
| FR-006 | AC-006-02 | CC-ART-06 | positive | P1 |
| FR-006 | AC-006-03 | (verified during integration -- discover contract loading) | integration | P2 |
| FR-007 | AC-007-01 | PAR-CC-01 to PAR-CC-06 | positive | P0 |
| FR-007 | AC-007-02 | PAR-CC-01 to PAR-CC-06 | positive | P0 |
| FR-007 | AC-007-03 | (governance.js update -- verified in existing PAR-GOV tests) | integration | P1 |
| FR-007 | AC-007-04 | PAR-CC-01 to PAR-CC-06 | positive | P0 |

### Coverage Summary

- **Total FRs**: 7
- **Total ACs**: 26
- **ACs with direct test coverage**: 22 (85%)
- **ACs covered by implementation/cleanup verification**: 4 (15%) -- FR-005 ACs are deletion/refactoring tasks verified during Phase 06 cleanup, not unit-testable
- **Effective coverage**: 100% (all ACs traced to either test cases or verification tasks)

---

## 7. Flaky Test Mitigation

All check functions are pure and deterministic -- no network, no timers, no randomness. Flakiness risks are minimal.

| Risk | Mitigation |
|------|-----------|
| `checkArtifacts` uses `existsSync` on temp files | Create files in `beforeEach`, clean in `afterEach` using `mkdtempSync` pattern from `contract-loader.test.js` |
| Template loader reads from disk | Same temp dir pattern: create -> test -> cleanup |
| Performance tests (PERF-CC-*) sensitive to system load | Use generous 50ms budget (expected <1ms); run in CI with retry-on-flake |
| Cross-platform path separators in `checkBatchWrite` | Use `path.basename()` for matching, not string comparison |

---

## 8. Performance Test Plan

**Budget**: <50ms per check function call (requirement QA section, non-functional).

**Method**: `performance.now()` bracketing in each PERF-CC-* test. Warm-up call first (JIT compilation), then measured call.

**Expected actual**: <1ms for all in-memory checks; <5ms for `checkArtifacts` (single `existsSync` call per artifact).

**CI**: Performance tests run as part of `npm run test:core`. No separate performance test infrastructure needed -- the functions are too simple to warrant it.

---

## 9. Test File Structure

```
tests/
  core/
    validators/
      contract-checks.test.js        (NEW - 62 unit + 7 perf tests)
      template-loader.test.js        (NEW - 8 tests)
      contract-evaluator.test.js     (MODIFY - remove batch tests during cleanup)
  verification/
    parity/
      governance-parity.test.js      (MODIFY - add PAR-CC-01 to PAR-CC-06)
```

All new test files use ESM (`import`/`export`), `node:test` runner, `node:assert/strict`. This is consistent with all existing `tests/core/` test files.

---

## 10. Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Unit test branch coverage | 100% | Pure functions, no excuse for gaps |
| Integration coverage | >=70% | Article II threshold |
| Mutation score | >=80% | Article XI requirement |
| Regression | total tests >= 555 + 75 = 630 | Baseline + new tests |
| Performance | <50ms per check | QA requirement |

---

## 11. GATE-04 Validation

- [x] Test strategy covers unit, integration, E2E (N/A -- pure functions), security (fail-open paths), performance
- [x] Test cases exist for all 7 FRs (FR-001 through FR-007)
- [x] Traceability matrix complete: 26/26 ACs traced (100%)
- [x] Coverage targets defined (100% unit branch, >=70% integration, >=80% mutation)
- [x] Test data strategy documented (Section 5: boundary values, invalid inputs, max-size inputs)
- [x] Critical paths identified (fail-open paths, domain sequencing, persona contribution enforcement)

---

## 12. Constitutional Compliance

| Article | Status | Evidence |
|---------|--------|----------|
| **Article II** (Test-First) | Compliant | 75 test cases designed before implementation. Coverage targets set. Baseline regression protected. |
| **Article VII** (Traceability) | Compliant | Traceability matrix maps all 26 ACs to test cases or verification tasks. No orphan tests. |
| **Article IX** (Quality Gate) | Compliant | GATE-04 checklist validated. All required artifacts produced. |
| **Article XI** (Integration Testing) | Compliant | Cross-provider parity tests use real data structures (no mocks). Mutation score target >=80%. |
