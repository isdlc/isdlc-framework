# Test Strategy: Embedding Pipeline Activation

**Item**: REQ-GH-224
**Phase**: 05-test-strategy

---

## 1. Test Approach

TDD. Test cases defined inline in tasks.md (T001-T008). Each test file targets a specific new module, written alongside the implementation task.

## 2. Test Files

| File | Module Under Test | Task | Traces |
|------|-------------------|------|--------|
| `tests/embedding/server/http-server.test.js` | http-server endpoints | T001 | FR-001, FR-007, FR-008, FR-010 |
| `tests/embedding/server/lifecycle.test.js` | Daemon lifecycle | T002 | FR-002, FR-016 |
| `tests/embedding/server/port-discovery.test.js` | Client discovery | T003 | FR-003, FR-004 |
| `tests/embedding/server/refresh-client.test.js` | Client helpers | T004 | FR-005, FR-008 |
| `tests/core/finalize/refresh-embeddings.test.js` | Finalize step | T004 | FR-005, FR-015 |
| `tests/core/hooks/embedding-session-check.test.cjs` | SessionStart hook | T005 | FR-004, FR-015 |
| `tests/bin/isdlc-embedding-server-cli.test.js` | CLI subcommands | T006 | FR-002, FR-013 |
| `tests/embedding/server/multi-session.test.js` | Lock coordination | T007 | FR-016 |
| `tests/embedding/discover-incremental.test.js` | Incremental discover | T008 | FR-006 |

## 3. Test Pyramid

- **Unit tests** (primary): 80% of coverage target — each module tested in isolation with mocked HTTP/fs
- **Integration tests**: 15% — http-server + lifecycle integration, session check + lock file interaction
- **End-to-end smoke test** (T022): 5% — real server start, search query, verify results

## 4. Coverage Targets

| Module | Target |
|--------|--------|
| http-server.js | 90% (critical infrastructure) |
| lifecycle.js | 85% (daemon correctness) |
| port-discovery.js | 85% |
| refresh-client.js | 85% |
| embedding-session-check.cjs | 90% (fail-open paths critical) |
| refresh-embeddings.js | 85% |

## 5. Error Path Coverage (Article XI)

Every module has tests for:
- **Success path**: happy case
- **Server unreachable**: fail-open behavior verified
- **Malformed response**: parse errors handled gracefully
- **Timeout**: connection timeouts respected
- **Stale state**: lock files with dead PIDs cleaned up

## 6. Critical Test Scenarios

1. **Multi-session lock race**: Two sessions start concurrently, only one acquires lock, other waits and connects
2. **Provider initialization failure**: Invalid API key → server startup error with clear message
3. **Package corruption**: Malformed .emb file → skipped, others loaded, server starts
4. **Session start fail-open**: Server not running → warning + prompt, session continues
5. **Delta refresh fail-open**: Server down during finalize → workflow continues, warning logged
6. **MCP tool registration parity**: isdlc_embedding_add_content works identically in Claude/Codex/Antigravity

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
