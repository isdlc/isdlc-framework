# Test Strategy: iSDLC Integration with Knowledge Service (REQ-GH-264)

**Phase**: 05 - Test Strategy & Design
**Traces**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007

---

## Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertions**: `node:assert/strict`
- **Coverage Tool**: None configured (manual)
- **Current Patterns**: Temp directory isolation via `mkdtempSync`, mtime-based cache clearing, TC-ID naming (`TC-XX-NN`), priority tagging (`[P0]`/`[P1]`/`[P2]`)
- **Existing Config Tests**: `tests/core/config/config-service-new.test.js` (23 tests for readProjectConfig, getAtdd, loadFrameworkConfig)
- **Existing Finalize Tests**: None found (greenfield for finalize-utils)
- **Existing Discover Tests**: `tests/core/discover/` (7 test files for modes, state schema, agent groups)

## Strategy Summary

This requirement adds a `knowledge` namespace to the config system and wires it through the install script, MCP routing, finalize step, discover orchestrator, status line, and session cache. The test strategy extends existing patterns rather than replacing them.

**Approach**: Extend existing test suites with new describe blocks for knowledge-specific functionality. Add new test files only where no existing file covers the module.

---

## Test Pyramid

| Layer | Count | Target Coverage | Files |
|---|---|---|---|
| Unit | 28 | >=80% of new code | config-service knowledge tests, finalize-utils knowledge push, config-defaults knowledge namespace |
| Integration | 12 | >=70% of new code | MCP routing end-to-end, finalize fail-open behavior, discover skip path |
| E2E | 0 | N/A | Covered by integration tests (no UI, CLI only) |

**Rationale**: This feature is config-driven plumbing with well-defined interfaces. Unit tests verify each function in isolation. Integration tests verify the cross-module flows (config read -> MCP routing, config read -> finalize push, config read -> discover skip). No E2E tests are needed because the feature operates at the library/hook layer, not the CLI UI layer.

---

## Test Types and Coverage Targets

### Unit Tests

Unit tests isolate each modified function with temp directory fixtures. External dependencies (MCP calls, HTTP endpoints, child processes) are mocked.

| Module | File Under Test | Test File | Test Count | Priority |
|---|---|---|---|---|
| Config defaults | `src/core/config/config-defaults.js` | `tests/core/config/config-defaults-knowledge.test.js` | 3 | P0 |
| Config service (ESM) | `src/core/config/config-service.js` | `tests/core/config/config-service-knowledge.test.js` | 10 | P0 |
| Config bridge (CJS) | `src/core/bridge/config.cjs` | `tests/core/config/config-bridge-knowledge.test.js` | 5 | P0 |
| Finalize utils | `src/core/finalize/finalize-utils.js` | `tests/core/finalize/finalize-utils-knowledge.test.js` | 10 | P0 |

### Integration Tests

Integration tests verify cross-module flows without mocking the system under test (Article XI requirement 2). External services (knowledge service HTTP endpoint) are stubbed at the network boundary only.

| Flow | Test File | Test Count | Priority |
|---|---|---|---|
| Config -> MCP routing | `tests/integration/knowledge-mcp-routing.test.js` | 4 | P1 |
| Config -> Finalize push | `tests/integration/knowledge-finalize-push.test.js` | 4 | P1 |
| Config -> Discover skip | `tests/integration/knowledge-discover-skip.test.js` | 4 | P1 |

### Security Tests

| Concern | Test Location | Description |
|---|---|---|
| URL validation | Config service unit tests | Reject non-HTTP(S) URLs, reject URLs with credentials embedded |
| No secrets in config | Config service unit tests | Verify knowledge.url does not leak into logs or state.json |

### Performance Tests

Not applicable for this requirement. All operations are config reads (microseconds) or single HTTP calls (bounded by 5s timeout in finalize). No performance regression risk.

---

## Flaky Test Mitigation

| Risk | Mitigation |
|---|---|
| Temp directory cleanup failures | `after()` hooks with `rmSync({ force: true })`; each test gets its own isolated temp root |
| File system timing (mtime cache) | Use `utimesSync` to force mtime changes, not `setTimeout` |
| Network calls in integration tests | Stub HTTP at the `execSync`/`fetch` boundary; no real network calls |
| Process environment pollution | Save and restore `process.env` in `beforeEach`/`afterEach` |

---

## Performance Test Plan

No dedicated performance test plan required. Rationale:
- Config reads are cached and sub-millisecond
- Finalize push has a hardcoded 5s timeout (tested in unit tests)
- Status line polling is 60s interval (no performance concern)
- No new hot paths, loops, or data-intensive operations introduced

---

## Test Case Specifications

### TC-KS-01: Config Defaults — Knowledge Namespace (3 tests)

**File**: `tests/core/config/config-defaults-knowledge.test.js`
**Traces**: FR-002, AC-002-01

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-01-01 | positive | P0 | DEFAULT_PROJECT_CONFIG includes knowledge namespace | Config defaults module is imported | DEFAULT_PROJECT_CONFIG is inspected | It contains a `knowledge` key with `{ url: null, projects: [] }` |
| TC-KS-01-02 | positive | P0 | Knowledge defaults have correct shape | Config defaults are read | `knowledge` section is inspected | `url` is null, `projects` is an empty array |
| TC-KS-01-03 | negative | P1 | Knowledge defaults are not accidentally overwritten | Config defaults are frozen | Attempting to mutate `knowledge.url` | Original value is unchanged (frozen object) |

---

### TC-KS-02: Config Service — Knowledge Namespace Read (10 tests)

**File**: `tests/core/config/config-service-knowledge.test.js`
**Traces**: FR-002, AC-002-01, AC-002-02, AC-002-03

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-02-01 | positive | P0 | readProjectConfig returns knowledge defaults when no config file | Empty .isdlc/ directory | readProjectConfig is called | Result has `knowledge.url === null` and `knowledge.projects === []` |
| TC-KS-02-02 | positive | P0 | readProjectConfig returns knowledge defaults when config has no knowledge section | Config with `{ cache: {} }` | readProjectConfig is called | Result has `knowledge.url === null` and `knowledge.projects === []` |
| TC-KS-02-03 | positive | P0 | readProjectConfig merges user knowledge.url | Config with `{ knowledge: { url: "https://ks.example.com" } }` | readProjectConfig is called | Result has `knowledge.url === "https://ks.example.com"` and `knowledge.projects === []` (default) |
| TC-KS-02-04 | positive | P0 | readProjectConfig merges user knowledge.projects | Config with `{ knowledge: { projects: ["proj-a", "proj-b"] } }` | readProjectConfig is called | Result has `knowledge.projects` equal to `["proj-a", "proj-b"]` and `knowledge.url === null` (default) |
| TC-KS-02-05 | positive | P0 | readProjectConfig merges both url and projects | Config with `{ knowledge: { url: "https://ks.example.com", projects: ["p1"] } }` | readProjectConfig is called | Both fields are present with user values |
| TC-KS-02-06 | negative | P0 | readProjectConfig handles knowledge: null gracefully | Config with `{ knowledge: null }` | readProjectConfig is called | Returns defaults (deep merge treats null as override -> knowledge section is null, no crash) |
| TC-KS-02-07 | negative | P1 | readProjectConfig handles knowledge: "string" gracefully | Config with `{ knowledge: "not-an-object" }` | readProjectConfig is called | No crash; knowledge section is the string value (deep merge replaces non-object) |
| TC-KS-02-08 | positive | P1 | getKnowledgeConfig returns merged knowledge section | Config with knowledge.url set | getKnowledgeConfig(projectRoot) is called | Returns `{ url, projects }` with user value merged over defaults |
| TC-KS-02-09 | positive | P1 | getKnowledgeConfig returns defaults when no project root found | No .isdlc/ directory anywhere | getKnowledgeConfig() without projectRoot arg | Returns `{ url: null, projects: [] }` |
| TC-KS-02-10 | negative | P0 | getKnowledgeConfig fail-open on malformed JSON | Config file contains `{invalid json` | getKnowledgeConfig(root) is called | Returns defaults without throwing |

---

### TC-KS-03: Config Bridge — Knowledge Namespace (CJS) (5 tests)

**File**: `tests/core/config/config-bridge-knowledge.test.js`
**Traces**: FR-002, AC-002-01, AC-002-02

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-03-01 | positive | P0 | CJS bridge readProjectConfig returns knowledge defaults | Empty .isdlc/ directory | CJS readProjectConfig is called | Result has `knowledge.url === null` |
| TC-KS-03-02 | positive | P0 | CJS bridge readProjectConfig merges knowledge.url | Config with knowledge.url set | CJS readProjectConfig is called | URL is present in result |
| TC-KS-03-03 | positive | P0 | CJS bridge exports getKnowledgeConfig | Bridge module is required | getKnowledgeConfig is inspected | It is a function |
| TC-KS-03-04 | positive | P1 | CJS bridge getKnowledgeConfig returns same shape as ESM version | Config with knowledge section | Both ESM and CJS getKnowledgeConfig are called | Results are deep-equal |
| TC-KS-03-05 | negative | P0 | CJS bridge getKnowledgeConfig fail-open | Malformed config.json | CJS getKnowledgeConfig is called | Returns defaults without throwing |

---

### TC-KS-04: Finalize Utils — Knowledge Service Push (10 tests)

**File**: `tests/core/finalize/finalize-utils-knowledge.test.js`
**Traces**: FR-004, AC-004-01, AC-004-02, AC-004-03

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-04-01 | positive | P0 | pushToKnowledgeService calls add_content with artifact folder | Knowledge service configured, artifact folder exists with files | pushToKnowledgeService is called | add_content is invoked with file contents and project ID |
| TC-KS-04-02 | positive | P0 | pushToKnowledgeService includes project ID from config | Config has `knowledge.projects: ["my-project"]` | pushToKnowledgeService is called | add_content call includes `project: "my-project"` |
| TC-KS-04-03 | positive | P0 | pushToKnowledgeService returns success on successful push | add_content succeeds | pushToKnowledgeService completes | Returns `{ success: true }` |
| TC-KS-04-04 | negative | P0 | pushToKnowledgeService fails open when service unreachable | add_content throws (network error) | pushToKnowledgeService is called | Returns `{ success: false, error: "..." }` without throwing |
| TC-KS-04-05 | negative | P0 | pushToKnowledgeService fails open on timeout | add_content hangs beyond 5s | pushToKnowledgeService is called | Returns failure result within timeout, does not block finalize |
| TC-KS-04-06 | positive | P1 | pushToKnowledgeService skips when no knowledge.url configured | Config has `knowledge.url: null` | pushToKnowledgeService is called | Returns `{ success: true, skipped: true, message: "knowledge service not configured" }` |
| TC-KS-04-07 | positive | P1 | pushToKnowledgeService skips when artifact folder is empty | Knowledge configured but artifact folder has no files | pushToKnowledgeService is called | Returns `{ success: true, skipped: true, message: "no artifacts to push" }` |
| TC-KS-04-08 | negative | P0 | pushToKnowledgeService handles malformed config gracefully | Config file is invalid JSON | pushToKnowledgeService is called | Fails open, returns skip result |
| TC-KS-04-09 | positive | P1 | pushToKnowledgeService reads all files in artifact folder | Artifact folder has 3 markdown files | pushToKnowledgeService is called | add_content is called once per file (or batch) |
| TC-KS-04-10 | negative | P1 | pushToKnowledgeService handles partial failure (some files succeed, some fail) | add_content succeeds for first file, fails for second | pushToKnowledgeService completes | Returns result indicating partial success, does not throw |

---

### TC-KS-05: MCP Routing — Knowledge Service Endpoint (4 tests)

**File**: `tests/integration/knowledge-mcp-routing.test.js`
**Traces**: FR-003, AC-003-01, AC-003-02, AC-003-03

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-05-01 | positive | P1 | .mcp.json points at local when no knowledge.url | Config has no knowledge.url | .mcp.json is generated/resolved | isdlc-embedding entry points at `bin/isdlc-embedding-mcp.js` (local) |
| TC-KS-05-02 | positive | P1 | .mcp.json points at remote when knowledge.url is set | Config has `knowledge.url: "https://ks.example.com"` | .mcp.json is generated/resolved | isdlc-embedding entry points at the remote URL |
| TC-KS-05-03 | positive | P1 | semantic_search passes projects array from config | Config has `knowledge.projects: ["proj-a"]` | semantic_search MCP call is constructed | Request includes `projects: ["proj-a"]` |
| TC-KS-05-04 | negative | P1 | MCP routing falls back to local when remote URL is invalid | Config has `knowledge.url: "not-a-url"` | MCP entry is resolved | Falls back to local endpoint or reports error gracefully |

---

### TC-KS-06: Finalize Push Integration (4 tests)

**File**: `tests/integration/knowledge-finalize-push.test.js`
**Traces**: FR-004, AC-004-01, AC-004-02, AC-004-03

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-06-01 | positive | P1 | Finalize flow calls pushToKnowledgeService when configured | Knowledge URL in config, workflow completing | Finalize step F0010 executes | pushToKnowledgeService is invoked with correct artifact folder |
| TC-KS-06-02 | positive | P1 | Finalize flow skips push when not configured | No knowledge URL in config | Finalize step F0010 executes | Step is skipped, finalize continues |
| TC-KS-06-03 | negative | P1 | Finalize continues when knowledge push fails | Knowledge URL set but service down | Finalize step F0010 executes | Warning is logged, finalize proceeds to next step |
| TC-KS-06-04 | positive | P1 | Local embedding mode preserved when no knowledge URL | No knowledge section in config at all | Full finalize sequence runs | Existing F0009 (refresh code embeddings) runs as before |

---

### TC-KS-07: Discover Orchestrator Skip (4 tests)

**File**: `tests/integration/knowledge-discover-skip.test.js`
**Traces**: FR-005, AC-005-01, AC-005-02

| ID | Type | Priority | Description | Given | When | Then |
|---|---|---|---|---|---|---|
| TC-KS-07-01 | positive | P1 | Discover skips D7/D8 embedding steps when knowledge.url set | Config has `knowledge.url: "https://ks.example.com"` | Discover orchestrator runs embedding phase | Steps D7 (embedding gen) and D8 (server startup) are skipped |
| TC-KS-07-02 | positive | P1 | Discover shows skip message | Knowledge URL configured | Discover orchestrator runs embedding phase | Output includes "Knowledge service configured at {url} -- skipping local embedding setup" |
| TC-KS-07-03 | positive | P1 | Discover runs embedding steps when no knowledge.url | No knowledge.url in config | Discover orchestrator runs | D7 and D8 proceed as normal (local embedding flow) |
| TC-KS-07-04 | negative | P1 | Discover handles invalid knowledge.url gracefully | `knowledge.url: ""` (empty string) | Discover orchestrator checks config | Treats empty string as not configured, runs local flow |

---

### TC-KS-08: Status Line (FR-006) and Session Cache (FR-007) (not in Phase 06 critical path)

These are Should Have requirements. Test cases are defined but lower priority.

| ID | Type | Priority | Traces | Description |
|---|---|---|---|---|
| TC-KS-08-01 | positive | P2 | FR-006, AC-006-01 | Status line shows connected/disconnected, project count, staleness |
| TC-KS-08-02 | positive | P2 | FR-006, AC-006-02 | Status data fetched from /metrics, cached with 60s TTL |
| TC-KS-08-03 | negative | P2 | FR-006, AC-006-03 | Status shows "disconnected" when service unreachable, no errors |
| TC-KS-08-04 | positive | P2 | FR-007, AC-007-01 | Session cache includes knowledge service info in EMBEDDING_STATUS |
| TC-KS-08-05 | positive | P2 | FR-007, AC-007-02 | Cache shows mode (remote/local), URL, project count, staleness |

---

## Task-to-Test Traceability

| Phase 06 Task | File Under Test | Test File | Traces | Scenarios |
|---|---|---|---|---|
| T002 Config schema | `src/core/config/config-service.js`, `src/core/config/config-defaults.js` | `tests/core/config/config-service-knowledge.test.js`, `tests/core/config/config-defaults-knowledge.test.js` | FR-002 | TC-KS-01-*, TC-KS-02-* |
| T002 Config schema | `src/core/bridge/config.cjs` | `tests/core/config/config-bridge-knowledge.test.js` | FR-002 | TC-KS-03-* |
| T003 Install script | `bin/init-project.sh` | (install script tests in T003 scope) | FR-001, FR-003 | AC-001-01 through AC-001-04 |
| T004 MCP routing | `.mcp.json` template | `tests/integration/knowledge-mcp-routing.test.js` | FR-003 | TC-KS-05-* |
| T005 Finalize step | `src/core/finalize/finalize-utils.js` | `tests/core/finalize/finalize-utils-knowledge.test.js`, `tests/integration/knowledge-finalize-push.test.js` | FR-004 | TC-KS-04-*, TC-KS-06-* |
| T006 Discover skip | `src/claude/agents/discover-orchestrator.md` | `tests/integration/knowledge-discover-skip.test.js` | FR-005 | TC-KS-07-* |
| T007 Status line | `src/claude/hooks/` | (status line tests in T007 scope) | FR-006 | TC-KS-08-01 through TC-KS-08-03 |
| T008 Session cache | `bin/rebuild-cache.js` | (session cache tests in T008 scope) | FR-007 | TC-KS-08-04, TC-KS-08-05 |

---

## Traceability Matrix

| Requirement | AC | Test Cases | Test Type | Priority |
|---|---|---|---|---|
| FR-001 | AC-001-01 | TC-KS-05-02 | integration | P1 |
| FR-001 | AC-001-02 | TC-KS-07-01 | integration | P1 |
| FR-001 | AC-001-03 | TC-KS-05-01, TC-KS-07-03 | integration | P1 |
| FR-001 | AC-001-04 | (install script validation — T003 scope) | unit | P0 |
| FR-002 | AC-002-01 | TC-KS-01-01, TC-KS-01-02, TC-KS-02-01, TC-KS-02-02 | unit | P0 |
| FR-002 | AC-002-02 | TC-KS-02-03, TC-KS-02-05, TC-KS-02-08 | unit | P0 |
| FR-002 | AC-002-03 | TC-KS-02-04, TC-KS-05-03 | unit + integration | P0/P1 |
| FR-003 | AC-003-01 | TC-KS-05-01, TC-KS-05-02 | integration | P1 |
| FR-003 | AC-003-02 | TC-KS-05-02 | integration | P1 |
| FR-003 | AC-003-03 | TC-KS-05-03 | integration | P1 |
| FR-004 | AC-004-01 | TC-KS-04-01, TC-KS-06-01 | unit + integration | P0/P1 |
| FR-004 | AC-004-02 | TC-KS-04-02 | unit | P0 |
| FR-004 | AC-004-03 | TC-KS-04-04, TC-KS-04-05, TC-KS-06-03 | unit + integration | P0/P1 |
| FR-005 | AC-005-01 | TC-KS-07-01, TC-KS-07-03 | integration | P1 |
| FR-005 | AC-005-02 | TC-KS-07-02 | integration | P1 |
| FR-006 | AC-006-01 | TC-KS-08-01 | integration | P2 |
| FR-006 | AC-006-02 | TC-KS-08-02 | integration | P2 |
| FR-006 | AC-006-03 | TC-KS-08-03 | integration | P2 |
| FR-007 | AC-007-01 | TC-KS-08-04 | integration | P2 |
| FR-007 | AC-007-02 | TC-KS-08-05 | integration | P2 |

---

## Test Data Plan

### Boundary Values

| Input | Boundary | Test Case |
|---|---|---|
| `knowledge.url` | `null` (not configured) | TC-KS-02-01, TC-KS-04-06 |
| `knowledge.url` | `""` (empty string) | TC-KS-07-04 |
| `knowledge.url` | Valid HTTPS URL | TC-KS-02-03 |
| `knowledge.url` | HTTP (non-HTTPS) URL | Security unit test |
| `knowledge.projects` | `[]` (empty array) | TC-KS-02-01 |
| `knowledge.projects` | Single project | TC-KS-02-04 |
| `knowledge.projects` | Multiple projects | TC-KS-05-03 |
| Artifact folder | 0 files | TC-KS-04-07 |
| Artifact folder | 1 file | TC-KS-04-01 |
| Artifact folder | 3+ files | TC-KS-04-09 |

### Invalid Inputs

| Input | Invalid Value | Expected Behavior | Test Case |
|---|---|---|---|
| `knowledge` section | `null` | Fall back to defaults | TC-KS-02-06 |
| `knowledge` section | `"string"` | No crash, graceful handling | TC-KS-02-07 |
| Config file | Malformed JSON | Fail-open, return defaults | TC-KS-02-10, TC-KS-03-05 |
| Config file | Missing entirely | Fail-open, return defaults | TC-KS-02-01 |
| `knowledge.url` | Non-URL string | Graceful error | TC-KS-05-04 |
| Network response | Timeout | Fail-open | TC-KS-04-05 |
| Network response | Connection refused | Fail-open | TC-KS-04-04 |

### Maximum-Size Inputs

| Input | Max Size | Test Case |
|---|---|---|
| `knowledge.projects` array | 100 project IDs | Not tested (no performance concern for array iteration) |
| Artifact folder | 50 files | TC-KS-04-09 covers multi-file; 50-file stress test deferred |
| `knowledge.url` | 2048-character URL | Not tested (URL length is validated by HTTP client, not config service) |

---

## Test Execution

### Commands (existing infrastructure)

```bash
# Run all knowledge service tests
node --test tests/core/config/config-defaults-knowledge.test.js tests/core/config/config-service-knowledge.test.js tests/core/config/config-bridge-knowledge.test.js tests/core/finalize/finalize-utils-knowledge.test.js

# Run integration tests
node --test tests/integration/knowledge-mcp-routing.test.js tests/integration/knowledge-finalize-push.test.js tests/integration/knowledge-discover-skip.test.js

# Run all knowledge tests at once
node --test 'tests/**/knowledge*.test.js'
```

### CI Integration

Tests will run as part of the existing `node --test` invocation in CI. No new test infrastructure or dependencies required.

---

## GATE-04 Validation

- [x] Test strategy covers unit, integration (E2E not applicable — no UI)
- [x] Test strategy covers security (URL validation, no secrets in logs)
- [x] Test strategy covers performance (assessed as N/A with rationale)
- [x] Test cases exist for all 7 functional requirements (FR-001 through FR-007)
- [x] Traceability matrix complete — all 20 acceptance criteria mapped to test cases
- [x] Coverage targets defined (>=80% unit, >=70% integration for new code)
- [x] Test data strategy documented with boundary values, invalid inputs, max-size inputs
- [x] Critical paths identified (config read -> routing, finalize fail-open)
- [x] Flaky test mitigation documented
- [x] Existing test patterns followed (node:test, assert/strict, temp dir isolation)
