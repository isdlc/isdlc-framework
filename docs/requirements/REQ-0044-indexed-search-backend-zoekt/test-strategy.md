# Test Strategy: Indexed Search Backend (REQ-0044)

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Phase**: 05 - Test Strategy & Design

---

## Existing Infrastructure

- **Framework**: `node:test` (built-in Node.js test runner)
- **Assertions**: `node:assert/strict`
- **Coverage Tool**: `c8` (via `npm test`)
- **Existing Patterns**: `createExecStub()` for command injection, `createTempDir()`/`cleanupTempDir()` for filesystem isolation, `mcpCallFn` injection for MCP mocking
- **Existing Test Files**: 9 search module test files (`detection.test.js`, `install.test.js`, `registry.test.js`, `router.test.js`, `ranker.test.js`, `config.test.js`, `lexical.test.js`, `enhanced-lexical.test.js`, `structural.test.js`)

## Strategy for This Requirement

- **Approach**: Extend existing test suite — add new test file for the new backend adapter, extend existing test files for detection, install, and registry modifications
- **New Test Files**: `lib/search/backends/indexed.test.js` (NEW)
- **Modified Test Files**: `lib/search/detection.test.js`, `lib/search/install.test.js`, `lib/search/registry.test.js`
- **Coverage Target**: >=80% line coverage for all new/modified code

## Test Pyramid

| Level | Count | Target |
|-------|-------|--------|
| Unit tests | 21 | >=80% line, >=80% branch |
| Integration tests | 0 | Not applicable (MCP server is external) |
| E2E tests | 0 | Not applicable (requires real MCP server) |

**Rationale**: All tests are unit tests with dependency injection. The indexed backend communicates with an external MCP server that is not part of the iSDLC codebase. Integration testing with the real MCP server is out of scope (FR-005, FR-006 are about the external server's behavior, not our adapter).

## Test Commands (existing)

- Unit: `npm test` (runs all `*.test.js` via `node:test`)
- Coverage: `npm test` (c8 wraps the test runner)

## Flaky Test Mitigation

- All MCP calls are injected via `mcpCallFn` parameter — no real network calls
- All filesystem operations use `createTempDir()` — no shared state
- Timeouts in health check tests use short values (50ms) for determinism
- No sleep/polling patterns — all async operations resolve immediately via stubs

## Performance Test Plan

Not applicable for this requirement. The backend adapter is a thin MCP transport layer — performance depends on the external MCP server, not our code. Query latency is tested indirectly via the health check timeout test.

## Critical Paths

1. **Backend adapter search → MCP call → normalize → return**: The primary data path. Tests: TC-003-01 through TC-003-05.
2. **Detection → Python check → recommendation**: Python availability gates the entire feature. Tests: TC-001-01 through TC-001-05.
3. **Health check → timeout → graceful failure**: Ensures degradation works. Tests: TC-003-06 through TC-003-08.

## Test Data Strategy

See `test-data-plan.md` for detailed test data specifications. Key patterns:
- MCP responses stubbed as plain objects matching `McpSearchResult` interface
- Python version strings covering edge cases (3.7, 3.8, 3.11.4, malformed)
- Empty/null/undefined inputs for all normalizer edge cases
