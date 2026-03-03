# Test Strategy: Improve Search Capabilities for Claude Effectiveness

**Phase**: 05 - Test Strategy
**Requirement**: REQ-0041 (GH-34)
**Status**: Complete
**Last Updated**: 2026-03-02

---

## 1. Test Objectives

### Primary Objectives

1. **Correctness**: Verify that the search abstraction layer correctly routes requests, handles fallback, and returns uniformly structured results across all backends
2. **Reliability**: Confirm graceful degradation when enhanced backends are unavailable, with Grep/Glob as permanent fallback
3. **Extensibility**: Validate that new backends can be added via the adapter interface without modifying agent code or existing backends
4. **Cross-Platform**: Ensure all modules work on macOS, Linux, and Windows (per Article XII)
5. **Non-Regression**: Ensure no degradation to existing Grep/Glob search behavior

### Quality Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Unit test coverage | >=80% | Per Article II constitution threshold |
| Integration test coverage | >=70% | Per Article II |
| Mutation score | >=80% | Per Article XI requirement |
| Critical path coverage | 100% | Router fallback, registry invariants, config read/write |
| Regression threshold | >=555 existing + new tests | Per Article II baseline requirement |

## 2. Existing Infrastructure (from test evaluation)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion**: `node:assert/strict`
- **Test helpers**: `lib/utils/test-helpers.js` (createTempDir, cleanupTempDir, createProjectDir)
- **Package scripts**: `npm test` (lib tests), `npm run test:hooks` (hook tests), `npm run test:all` (full suite)
- **Naming convention**: `*.test.js` for ESM lib modules, `*.test.cjs` for CJS hook modules
- **Module system**: ESM for `lib/` tests, CJS for `src/claude/hooks/` tests (per Article XIII)
- **Current baseline**: 555+ tests across lib and hook modules

### Strategy Approach

This strategy **extends** the existing test suite. All new test files follow existing conventions:
- ESM `lib/search/*.test.js` files for new search modules
- Node.js built-in test runner (`node:test`) with `node:assert/strict`
- Real filesystem operations (not mocks) matching the established pattern
- Test helpers from `lib/utils/test-helpers.js`

## 3. Test Scope

### In Scope (Phase 1)

| Module | Test Types | Priority |
|--------|-----------|----------|
| `lib/search/router.js` | Unit, Integration | CRITICAL |
| `lib/search/registry.js` | Unit | CRITICAL |
| `lib/search/ranker.js` | Unit | HIGH |
| `lib/search/config.js` | Unit | HIGH |
| `lib/search/detection.js` | Unit, Integration | HIGH |
| `lib/search/install.js` | Unit, Integration | HIGH |
| `lib/search/backends/lexical.js` | Unit, Integration | CRITICAL |
| `lib/search/backends/structural.js` | Unit | MEDIUM |
| `lib/search/backends/enhanced-lexical.js` | Unit | MEDIUM |

### Out of Scope

- FR-012 (Semantic Search Backend) -- Phase 2 deferred
- FR-013 (Indexed Search Backend) -- Phase 2 deferred
- Visual or UI testing -- all search is agent-driven, no UI
- Load/stress testing at 500K file scale -- deferred to Phase 2 indexed backend

## 4. Test Pyramid

### Unit Tests (~70% of test effort)

Unit tests verify individual module behavior in isolation. All dependencies are replaced with test doubles where appropriate (stubs for external tools, real filesystem for config files).

| Module | Estimated Tests | Focus Areas |
|--------|----------------|-------------|
| `registry.js` | 18 | Register, retrieve, health updates, priority ordering, grep-glob invariant |
| `router.js` | 22 | Modality routing, fallback chains, timeout handling, force-backend override |
| `ranker.js` | 15 | BM25 ranking, deduplication, token budget truncation, edge cases |
| `config.js` | 12 | Read/write cycle, missing file defaults, corrupt JSON recovery |
| `detection.js` | 14 | Tool presence detection, scale tier classification, MCP detection |
| `install.js` | 16 | Install success/failure, MCP config generation, settings.json preservation |
| `backends/lexical.js` | 10 | Grep/Glob wrapping, result normalization, health check (always healthy) |
| `backends/structural.js` | 10 | ast-grep request translation, AST metadata normalization, health check |
| `backends/enhanced-lexical.js` | 10 | Probe request translation, relevance score normalization, health check |
| **Total** | **~127** | |

### Integration Tests (~20% of test effort)

Integration tests validate module interactions without mocking the search system's internal boundaries. Per Article XI, integration tests use real system behavior and validate through execution success/failure, not intermediate assertions.

| Scenario | Modules Involved | Focus |
|----------|-----------------|-------|
| Router-Registry integration | router.js + registry.js | Routing selects correct backend from populated registry |
| Router-Ranker integration | router.js + ranker.js | Results are properly ranked and bounded after routing |
| Full search flow (lexical) | router.js + registry.js + ranker.js + lexical.js | End-to-end lexical search returns normalized results |
| Detection-Install flow | detection.js + install.js + config.js | Detection findings drive installation and config |
| Config persistence | config.js + install.js | Config survives write-read cycle with correct values |
| Degradation flow | router.js + registry.js + backends | Unhealthy backend triggers fallback to next available |
| MCP configuration | install.js + config.js | MCP servers configured correctly in settings.json |
| **Estimated count** | **~30** | |

### E2E Tests (~10% of test effort)

End-to-end tests validate complete user journeys from the setup/discovery flow through search execution. These test the system as a user would experience it.

| Journey | Description |
|---------|-------------|
| UJ-01: Fresh setup | Run detection, accept recommendations, verify config written |
| UJ-02: Search with fallback | Execute search with degraded backend, verify fallback and notification |
| UJ-03: Opt-out | Skip search setup with --no-search-setup, verify grep-glob baseline only |
| UJ-04: Reconfiguration | Disable a backend, verify remaining backends still function |
| **Estimated count** | **~12** |

## 5. Flaky Test Mitigation

### Risk Factors

| Factor | Risk Level | Mitigation |
|--------|-----------|------------|
| External tool detection (which, command) | Medium | Stub child_process.exec for tool availability checks; use real tools only in tagged integration tests |
| MCP server health checks | Medium | Use timeout-bounded health checks (2000ms max per interface spec); mock MCP for unit tests |
| Filesystem race conditions | Low | Each test uses isolated temp directories (existing pattern); cleanup in after() hooks |
| Platform-specific path behavior | Low | Use path.join/path.resolve exclusively; test on CI matrix (3 OS) |

### Flaky Test Prevention Rules

1. **No shared state**: Each test creates its own temp directory and config files
2. **No timing dependencies**: Avoid setTimeout-based assertions; use deterministic event sequences
3. **Explicit cleanup**: All temp files removed in after() hooks (matching existing test convention)
4. **Retry policy**: Flaky tests are bugs, not retried -- fix root cause
5. **CI matrix**: Tests run on macOS, Linux, Windows x Node 20, 22, 24 (9 combinations, per Article XII)

## 6. Performance Test Plan

### Performance Targets (from requirements)

| Metric | Target | How Tested |
|--------|--------|------------|
| Detection time | < 5 seconds | Timed integration test with real tool detection |
| Health check timeout | <= 2000ms | Unit test verifies timeout enforcement |
| Search router overhead | < 50ms (excluding backend execution) | Benchmark test measuring routing + ranking time |
| Token budget enforcement | No result set exceeds specified budget | Unit test with large result sets |

### Performance Test Approach

Performance tests are implemented as standard unit/integration tests with timing assertions, not a separate performance test suite. This aligns with the project's lightweight tooling philosophy (no external performance testing frameworks).

```javascript
// Example: Router overhead benchmark
it('should add < 50ms overhead to backend search time', async () => {
  const start = performance.now();
  await router.search({ query: 'test', modality: 'lexical' });
  const elapsed = performance.now() - start;
  // Backend stub returns immediately, so elapsed = routing overhead
  assert.ok(elapsed < 50, `Router overhead ${elapsed}ms exceeds 50ms`);
});
```

## 7. Security Testing

### Security Test Cases

| Area | Test | Type |
|------|------|------|
| Path traversal in search scope | Verify scope parameter cannot escape project root | Unit (negative) |
| Settings.json injection | Verify MCP config does not allow command injection | Unit (negative) |
| Sensitive data in logs | Verify search queries are not logged to state.json | Unit (negative) |
| Malformed search request | Verify invalid modality/query rejected with INVALID_REQUEST | Unit (negative) |
| Config file corruption | Verify corrupt search-config.json handled gracefully | Unit (negative) |

### Adversarial Testing (Article XI)

Property-based testing applied to:
- **Search request validation**: Fuzz query strings (empty, very long, special characters, null bytes)
- **Result normalization**: Fuzz raw backend results with missing/extra fields
- **Config parsing**: Fuzz search-config.json with random JSON structures
- **Token budget**: Boundary testing with budget = 0, 1, MAX_SAFE_INTEGER

Implementation approach: Use `node:test`'s built-in capabilities with hand-crafted boundary generators (no external property-based testing framework needed for this scope).

## 8. Test Data Strategy

### Test Data Categories

| Category | Examples | Generation |
|----------|----------|------------|
| Valid search requests | Lexical query with scope, structural query with AST flag | Static fixtures |
| Invalid search requests | Missing query, invalid modality, negative token budget | Static fixtures |
| Backend results | Normalized hits from grep-glob, ast-grep, probe | Static fixtures |
| Malformed backend results | Missing filePath, null relevance score, extra fields | Hand-crafted edge cases |
| Configuration files | Valid config, empty config, corrupt JSON, missing fields | Generated in tests |
| Project structures | Small (100 files), medium (50K files -- simulated), large (500K -- simulated metadata only) | Temp dir creation |

### Test Fixture Location

```
lib/search/__fixtures__/
  search-requests.js        # Valid and invalid SearchRequest objects
  backend-results.js        # Raw and normalized backend results
  search-configs.js         # Various SearchConfig states
  detection-results.js      # Tool detection scenarios
```

This follows the existing project convention of co-locating test data near test files.

## 9. Test Commands

All commands extend the existing npm scripts:

```bash
# Run search module unit tests only
node --test lib/search/*.test.js

# Run all lib tests (existing + search)
npm test

# Run all tests (lib + hooks + char + e2e)
npm run test:all
```

No new npm scripts are needed -- the existing glob pattern `lib/*.test.js` will need updating to `lib/**/*.test.js` to pick up the new `lib/search/` subdirectory. Alternatively, add `lib/search/*.test.js` to the test script.

### Recommended package.json update

```json
{
  "scripts": {
    "test": "node --test lib/*.test.js lib/utils/*.test.js lib/search/*.test.js"
  }
}
```

## 10. Test Execution Order

1. **Unit tests first**: All `lib/search/*.test.js` files (fast, isolated, catch most issues)
2. **Integration tests**: Cross-module tests in `lib/search/integration.test.js`
3. **E2E tests**: Full journey tests in `tests/e2e/search-*.test.js`
4. **Existing test suite**: `npm run test:all` to verify no regressions

## 11. Coverage Measurement

- **Tool**: Node.js built-in coverage (`--experimental-test-coverage` flag in Node 22+)
- **Alternative**: `c8` (istanbul-based, zero-config for Node.js)
- **Threshold enforcement**: Coverage check in CI pipeline
- **Branch coverage**: Critical for router fallback logic and registry health state transitions

## 12. Mutation Testing Plan (Article XI)

- **Tool**: Stryker for JavaScript (aligns with test evaluation recommendation)
- **Scope**: `lib/search/` directory
- **Target**: >=80% mutation score
- **Mutant types**: Conditional boundary, arithmetic, string literal, block removal
- **Execution**: After unit tests pass, before integration tests

## 13. Risk-Based Test Prioritization

| Priority | Modules | Rationale |
|----------|---------|-----------|
| P0 (Critical) | router.js, registry.js, backends/lexical.js | Core routing and fallback -- failure means all search breaks |
| P1 (High) | ranker.js, config.js, detection.js, install.js | Token budget, config persistence, and setup flow |
| P2 (Medium) | backends/structural.js, backends/enhanced-lexical.js | Phase 1 enhanced backends -- fallback exists if broken |
| P3 (Low) | Notification interface, agent migration helpers | Cosmetic/documentation -- not user-facing behavior |

## 14. Phase Gate Alignment

This test strategy satisfies GATE-04/GATE-05 requirements:

- [x] Test strategy covers unit, integration, E2E, security, performance
- [x] Test cases designed for all in-scope requirements (FR-001 through FR-011)
- [x] Traceability matrix maps requirements to test cases (see test-cases.md)
- [x] Coverage targets defined (>=80% unit, >=70% integration, >=80% mutation)
- [x] Test data strategy documented (Section 8)
- [x] Critical paths identified (Section 13)
- [x] Extends existing test infrastructure (Section 2)
- [x] Constitutional articles addressed: II (test-first), VII (traceability), IX (gate integrity), XI (integration/mutation)
