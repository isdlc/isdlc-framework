# Test Strategy: Execution Observability (REQ-0068)

**Feature**: Execution observability -- surface workflow trace as structured report
**Source**: GitHub Issue #128
**Date**: 2026-03-25
**Test Framework**: Node.js built-in test runner (`node:test`)
**Assertion Library**: `node:assert/strict`

---

## 1. Existing Infrastructure

- **Framework**: `node:test` (describe/it pattern, ESM imports)
- **Test commands**: `npm run test:core` (runs `node --test tests/core/**/*.test.js`)
- **Existing observability tests**: `tests/core/observability/telemetry.test.js` (8 tests)
- **Existing orchestration tests**: `tests/core/orchestration/phase-loop.test.js`, `fan-out.test.js`, `dual-track.test.js`
- **Coverage tool**: None (node:test built-in coverage via `--experimental-test-coverage`)
- **Naming convention**: `{module-name}.test.js` in corresponding `tests/` subdirectory
- **Import pattern**: Direct ESM imports from `../../../src/core/...`

## 2. Test Pyramid

```
                    /\
                   /  \
                  / E2E \          tests/e2e/ -- 3 tests
                 /--------\
                /Integration\      tests/core/ -- 8 tests
               /--------------\
              /   Unit Tests    \  tests/core/ -- 47 tests
             /____________________\
```

### Unit Tests (47 test cases)
- Module 1: State Tracking Extensions -- 14 tests
- Module 2: Phase Topology Config -- 6 tests (schema validation)
- Module 3: CLI Formatter -- 16 tests
- Module 7: Orchestrator Callbacks -- 11 tests

### Integration Tests (8 test cases)
- Module 4: Dashboard Server -- 8 tests (HTTP server, API endpoints)

### E2E Tests (3 test cases)
- Module 6: Status Command -- 3 tests (full flow: resolve identifier -> format -> output)

**Total: 58 test cases**

## 3. Test File Layout

```
tests/
  core/
    observability/
      state-tracking.test.js          # Module 1: 14 unit tests
      cli-formatter.test.js           # Module 3: 16 unit tests
      orchestrator-hooks.test.js      # Module 7: 11 unit tests
      phase-topology.test.js          # Module 2: 6 validation tests
    dashboard/
      server.test.js                  # Module 4: 8 integration tests
  e2e/
    status-command.test.js            # Module 6: 3 E2E tests
```

Module 5 (Dashboard UI) is a single-file SPA with embedded JS. Browser-side JS is tested
indirectly through server integration tests (API response shape) and manually verified.
No automated DOM testing -- the UI is pure SVG rendering with no framework.

## 4. Test Cases by Module

### Module 1: State Tracking Extensions (`state-tracking.test.js`)

| ID | AC | Test Case | Type | Priority |
|----|-----|-----------|------|----------|
| ST-01 | AC-006-01 | appendSubAgentLog appends entry with all required fields | Unit | P0 |
| ST-02 | AC-006-01 | appendSubAgentLog initializes sub_agent_log array when missing | Unit | P0 |
| ST-03 | AC-006-02 | appendSubAgentLog updates existing entry with completed_at, status, duration_ms | Unit | P0 |
| ST-04 | AC-006-06 | appendSubAgentLog accepts null tokens_used without error | Unit | P0 |
| ST-05 | AC-006-03 | appendHookEvent appends entry with timestamp, hook, phase, action, reason | Unit | P0 |
| ST-06 | AC-006-03 | appendHookEvent initializes hook_events array when missing | Unit | P0 |
| ST-07 | AC-006-03 | appendHookEvent includes provider field for multi-provider distinction | Unit | P1 |
| ST-08 | AC-006-05 | appendArtifactProduced appends entry with timestamp, phase, file_path, action | Unit | P1 |
| ST-09 | AC-006-05 | appendArtifactProduced initializes artifacts_produced array when missing | Unit | P1 |
| ST-10 | AC-006-04 | getSubAgentLog returns empty array when sub_agent_log missing | Unit | P0 |
| ST-11 | AC-006-04 | getSubAgentLog returns array contents when present | Unit | P0 |
| ST-12 | AC-006-04 | getHookEvents returns empty array when hook_events missing | Unit | P0 |
| ST-13 | AC-006-04 | getArtifactsProduced returns empty array when artifacts_produced missing | Unit | P1 |
| ST-14 | AC-006-01 | appendSubAgentLog includes provider field from argument | Unit | P0 |

### Module 2: Phase Topology Config (`phase-topology.test.js`)

| ID | AC | Test Case | Type | Priority |
|----|-----|-----------|------|----------|
| PT-01 | AC-005-03 | phase-topology.json is valid JSON and parseable | Unit | P0 |
| PT-02 | AC-005-01 | phases with sub-agents have nodes array with id, agent, label | Unit | P0 |
| PT-03 | AC-005-01 | phases with sub-agents have edges array with from, to | Unit | P0 |
| PT-04 | AC-005-02 | single-agent phases have exactly one node and no edges | Unit | P1 |
| PT-05 | AC-008-02 | missing phase key returns undefined (graceful fallback) | Unit | P0 |
| PT-06 | AC-005-03 | version field is present and follows semver format | Unit | P2 |

### Module 3: CLI Formatter (`cli-formatter.test.js`)

| ID | AC | Test Case | Type | Priority |
|----|-----|-----------|------|----------|
| CF-01 | AC-001-01 | formatPhaseCompletion with standard level includes phase name, duration, iterations | Unit | P0 |
| CF-02 | AC-001-02 | formatPhaseCompletion with detailed level includes sub-agents, hook events, artifacts, provider | Unit | P0 |
| CF-03 | AC-001-03 | formatPhaseCompletion with minimal level returns empty string (no enrichment) | Unit | P0 |
| CF-04 | AC-001-04 | parseObservabilityConfig returns standard defaults when section missing | Unit | P0 |
| CF-05 | AC-001-04 | parseObservabilityConfig parses display_level and live_dashboard from content | Unit | P0 |
| CF-06 | AC-001-04 | parseObservabilityConfig returns defaults on invalid values | Unit | P1 |
| CF-07 | AC-001-05 | formatPhaseCompletion output identical regardless of provider value | Unit | P1 |
| CF-08 | AC-003-01 | formatWorkflowTrace renders phase timeline with timing, iterations, coverage | Unit | P0 |
| CF-09 | AC-003-01 | formatWorkflowTrace renders sub-agent activity section | Unit | P0 |
| CF-10 | AC-003-01 | formatWorkflowTrace renders hook events section | Unit | P1 |
| CF-11 | AC-003-01 | formatWorkflowTrace renders artifacts produced section | Unit | P1 |
| CF-12 | AC-007-02 | formatWorkflowTrace shows provider per phase row | Unit | P0 |
| CF-13 | AC-007-04 | formatWorkflowTrace shows "unknown" for missing provider field | Unit | P0 |
| CF-14 | AC-003-04 | formatWorkflowTrace degrades gracefully when sub_agent_log missing | Unit | P0 |
| CF-15 | AC-003-03 | formatWorkflowSummary renders last N workflows with status, duration, coverage | Unit | P1 |
| CF-16 | AC-008-03 | formatWorkflowTrace displays custom workflow type name verbatim | Unit | P0 |

### Module 7: Orchestrator Observability Callbacks (`orchestrator-hooks.test.js`)

| ID | AC | Test Case | Type | Priority |
|----|-----|-----------|------|----------|
| OH-01 | AC-006-01 | onPhaseStart appends sub_agent_log entry with status running | Unit | P0 |
| OH-02 | AC-006-01 | onPhaseStart includes provider from constructor argument | Unit | P0 |
| OH-03 | AC-006-02 | onPhaseComplete updates sub_agent_log entry with completed status and duration_ms | Unit | P0 |
| OH-04 | AC-007-01 | onPhaseComplete writes provider field to phase state | Unit | P0 |
| OH-05 | AC-006-02 | onPhaseComplete appends to artifacts_produced if result contains file paths | Unit | P1 |
| OH-06 | AC-006-03 | onError appends hook_events entry with action blocked | Unit | P0 |
| OH-07 | AC-006-03 | onError updates sub_agent_log entry with status failed | Unit | P0 |
| OH-08 | -- | createObservabilityCallbacks returns object with three callback functions | Unit | P0 |
| OH-09 | AC-006-05 | callbacks use provided stateWriter (not direct file I/O) | Unit | P1 |
| OH-10 | AC-006-06 | onPhaseComplete handles null tokens_used without error | Unit | P1 |
| OH-11 | AC-008-01 | callbacks work with arbitrary phase keys (custom workflow support) | Unit | P0 |

### Module 4: Dashboard Server (`server.test.js`)

| ID | AC | Test Case | Type | Priority |
|----|-----|-----------|------|----------|
| DS-01 | AC-002-01 | startDashboardServer starts HTTP server on specified port | Integration | P0 |
| DS-02 | AC-002-02 | GET /api/state returns merged state + topology JSON | Integration | P0 |
| DS-03 | AC-002-02 | GET /api/state response includes active_workflow, phases, topology, timestamp | Integration | P0 |
| DS-04 | -- | GET /api/history returns workflow_history array | Integration | P1 |
| DS-05 | -- | GET /api/history/:id returns single workflow by slug | Integration | P1 |
| DS-06 | AC-002-05 | server does not start when live_dashboard is false | Integration | P0 |
| DS-07 | -- | server binds to 127.0.0.1 only | Integration | P1 |
| DS-08 | -- | server tries next port on EADDRINUSE (port fallback) | Integration | P2 |

### Module 6: Status Command (`status-command.test.js`)

| ID | AC | Test Case | Type | Priority |
|----|-----|-----------|------|----------|
| SC-01 | AC-003-02 | status -inline resolves GitHub issue ID to workflow | E2E | P0 |
| SC-02 | AC-003-03 | status -inline last returns most recent workflow | E2E | P0 |
| SC-03 | AC-004-03 | status with no matching workflow displays error and recent list | E2E | P1 |

---

## 5. Flaky Test Mitigation

| Risk | Mitigation |
|------|-----------|
| Port conflicts in server tests | Use `port: 0` (OS-assigned) for unit tests; reserve 3456-3460 only for manual testing |
| File system timing in state reads | Use in-memory state mock for unit tests; real fs only in integration tests |
| Timestamp drift in assertions | Assert timestamp exists and is ISO-8601 format; never assert exact value |
| HTTP server startup race | Wait for `server.listening` event before issuing requests in tests |

## 6. Performance Test Plan

No dedicated performance test suite for this feature. Performance is validated through:

1. **Non-blocking constraint**: Dashboard server runs in a separate process. Workflow execution is never blocked by observability. Validated by integration test DS-01 (server starts independently).
2. **Polling interval**: Browser polls at 2s (active) / 10s (historical). These are client-side constants in the SPA -- not testable server-side.
3. **State read latency**: `fs.readFileSync` on a <500KB state.json. No test needed -- built-in Node.js I/O.

## 7. Boundary Values and Edge Cases

| Scenario | Test Coverage |
|----------|--------------|
| Empty sub_agent_log array | ST-10 (getSubAgentLog returns []) |
| Empty hook_events array | ST-12 (getHookEvents returns []) |
| null tokens_used (Codex) | ST-04, OH-10 |
| Missing provider field (legacy data) | CF-13 (shows "unknown") |
| Custom phase not in topology | PT-05 (returns undefined, graceful fallback) |
| Custom workflow type string | CF-16 (displays verbatim) |
| Pre-observability workflow history | CF-14 (degrades gracefully) |
| No ## Observability section in CLAUDE.md | CF-04 (defaults to standard) |
| Invalid display_level value | CF-06 (falls back to defaults) |

## 8. Test Data Strategy

All tests use in-memory fixtures. No external test data files needed.

### State Fixtures
- `makeActiveWorkflow()` -- returns a minimal active_workflow with sub_agent_log, hook_events, artifacts_produced
- `makeWorkflowHistoryEntry()` -- returns a workflow_history entry with phase_snapshots
- `makeLegacyWorkflowEntry()` -- returns a pre-observability workflow entry (no sub_agent_log)
- `makeCustomWorkflowEntry()` -- returns a custom workflow with non-standard phase keys and type

### Phase State Fixtures
- `makePhaseState(phase, status, provider)` -- returns a phase state with timing and provider
- `makeSubAgentLogEntry(overrides)` -- returns a sub_agent_log entry with sensible defaults
- `makeHookEventEntry(overrides)` -- returns a hook_events entry with sensible defaults

### Config Fixtures
- Phase topology is loaded from the real `phase-topology.json` file (it is static config, not generated)

## 9. Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Line coverage | >= 85% | New modules are pure logic with no external dependencies |
| Branch coverage | >= 80% | Display level branching and null-safe getters require branch coverage |
| Function coverage | >= 90% | All public API functions must be tested |

## 10. Test Commands

```bash
# Run all REQ-0068 tests
node --test tests/core/observability/state-tracking.test.js tests/core/observability/cli-formatter.test.js tests/core/observability/orchestrator-hooks.test.js tests/core/observability/phase-topology.test.js tests/core/dashboard/server.test.js tests/e2e/status-command.test.js

# Run unit tests only
node --test tests/core/observability/*.test.js

# Run dashboard integration tests only
node --test tests/core/dashboard/server.test.js

# Run full core test suite (includes REQ-0068 tests)
npm run test:core
```

## 11. Constitutional Compliance

- **Article II (Test-First)**: All 58 test cases designed before implementation. Test files will be written alongside or before module code in Phase 06.
- **Article VII (Traceability)**: Every test case traces to at least one AC. See traceability matrix below.
- **Article IX (Gate Integrity)**: Test strategy artifact produced; gate criteria addressed.
- **Article XI (Integration Testing)**: 8 integration tests cover dashboard server API contracts and state data flow.

---

## 12. Traceability Matrix

| AC | Test IDs | Coverage |
|----|----------|----------|
| AC-001-01 | CF-01 | Full |
| AC-001-02 | CF-02 | Full |
| AC-001-03 | CF-03 | Full |
| AC-001-04 | CF-04, CF-05, CF-06 | Full |
| AC-001-05 | CF-07 | Full |
| AC-002-01 | DS-01 | Full |
| AC-002-02 | DS-02, DS-03 | Full |
| AC-002-03 | *(browser-side polling; verified by DS-02 API shape)* | Partial (API shape) |
| AC-002-04 | *(auto-stop is lifecycle; tested via DS-06 inverse)* | Partial (inverse) |
| AC-002-05 | DS-06 | Full |
| AC-002-06 | *(CLI wrapper integration; out of unit test scope)* | Design-verified |
| AC-003-01 | CF-08, CF-09, CF-10, CF-11 | Full |
| AC-003-02 | SC-01 | Full |
| AC-003-03 | SC-02 | Full |
| AC-003-04 | CF-14 | Full |
| AC-004-01 | *(visual mode starts server; tested via DS-01 + SC-01)* | Partial (component) |
| AC-004-02 | *(live view; tested via DS-02 API response)* | Partial (API shape) |
| AC-004-03 | SC-03 | Full |
| AC-005-01 | PT-02, PT-03 | Full |
| AC-005-02 | PT-04 | Full |
| AC-005-03 | PT-01, PT-06 | Full |
| AC-005-04 | *(browser-side CSS; not unit testable)* | Design-verified |
| AC-006-01 | ST-01, ST-02, ST-14, OH-01, OH-02 | Full |
| AC-006-02 | ST-03, OH-03 | Full |
| AC-006-03 | ST-05, ST-06, ST-07, OH-06, OH-07 | Full |
| AC-006-04 | ST-10, ST-11, ST-12, ST-13 | Full |
| AC-006-05 | ST-08, ST-09, OH-09 | Full |
| AC-006-06 | ST-04, OH-10 | Full |
| AC-007-01 | OH-04 | Full |
| AC-007-02 | CF-12 | Full |
| AC-007-03 | *(architectural constraint; no test needed)* | Design-verified |
| AC-007-04 | CF-13 | Full |
| AC-008-01 | OH-11, CF-16 | Full |
| AC-008-02 | PT-05 | Full |
| AC-008-03 | CF-16 | Full |
| AC-008-04 | *(topology inline declaration; tested via PT-02 pattern)* | Partial (pattern) |

**Summary**: 34 acceptance criteria total. 26 fully covered by automated tests, 5 partially covered (browser-side behaviors verified at API/component level), 3 design-verified (architectural constraints or CSS-only behaviors).

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
