# Test Cases: GH-241 — Embedding server auto-start false success

**Phase**: 05-test-strategy
**Version**: 1.0
**Created**: 2026-04-12
**Bug**: PID false success in lifecycle.js + reload verification gap in refresh-code-embeddings.js
**Traces to**: AC-1, AC-2, AC-3, AC-4, AC-5

---

## Test Pyramid

- **Unit Tests**: 9 test cases covering startServer() aliveness checks and postReload() verification
- **Integration Tests**: 0 (bugs are in isolated functions with DI; unit tests with mocks are sufficient)
- **E2E Tests**: 0 (real-server integration would be flaky; mocked unit tests cover all paths)

## Flaky Test Mitigation

- All tests use dependency injection (DI) for `spawn`, `fetch`, `fs`, `process.kill` -- no real processes or network calls
- No timing-dependent assertions; child aliveness is checked via injected `isPidAlive` / `process.kill(pid, 0)` stubs
- Temp directories created per test with `mkdtempSync`, cleaned up in `afterEach`/`finally`

## Performance Test Plan

- Not applicable for this bug fix -- no performance-sensitive paths affected
- Existing `waitForServer` timeout behavior is preserved (not modified by this fix)

---

## Test Suite 1: lifecycle.js — startServer() PID aliveness

### TC-LC-001: Foreign process on port, child dies with EADDRINUSE
- **Requirement**: AC-1
- **Test type**: negative
- **Priority**: P0
- **Given**: No PID file exists, a foreign process holds the configured port
- **When**: `startServer()` spawns a child that dies immediately (EADDRINUSE) while `waitForServer` gets 200 from the foreign process
- **Then**: `startServer()` returns `{ success: false, foreignPort: true }` and does NOT write a PID file
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P0] AC-1: Given foreign process on port, When child dies with EADDRINUSE and waitForServer gets 200 from foreign process, Then startServer returns failure with foreignPort flag and no PID file written`

### TC-LC-002: Stale PID file + foreign port squatter
- **Requirement**: AC-2
- **Test type**: negative
- **Priority**: P0
- **Given**: A stale PID file exists (PID not alive), a foreign process holds the port
- **When**: `startServer()` cleans up stale PID, spawns child that dies, waitForServer gets 200 from foreign process
- **Then**: Returns `{ success: false }` with failure indication, stale PID file is NOT replaced with dead child PID
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P0] AC-2: Given stale PID file and port squatter, When startServer spawns child that dies but port responds, Then failure is reported and PID file not written with dead child PID`

### TC-LC-003: Normal clean spawn succeeds (regression guard)
- **Requirement**: AC-3
- **Test type**: positive
- **Priority**: P0
- **Given**: No PID file, no foreign process, port is free
- **When**: `startServer()` spawns child, child stays alive, `waitForServer` gets 200
- **Then**: Returns `{ success: true, pid: child.pid }` and PID file contains `child.pid`
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P0] AC-3: Given clean environment with no port conflict, When startServer spawns child that stays alive and port responds, Then success with correct PID file written`

### TC-LC-004: Child alive but port not responding yet
- **Requirement**: AC-3
- **Test type**: negative
- **Priority**: P1
- **Given**: No PID file, port is free
- **When**: `startServer()` spawns child that stays alive but `waitForServer` times out (port never responds)
- **Then**: Returns `{ success: false }` with timeout error, no PID file written (child alive but unresponsive)
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P1] AC-3: Given child stays alive but port never responds, When waitForServer times out, Then failure returned and no PID file written`

### TC-LC-005: PID file only written after child aliveness confirmed
- **Requirement**: AC-1, AC-2
- **Test type**: positive
- **Priority**: P0
- **Given**: Clean spawn scenario
- **When**: `startServer()` succeeds
- **Then**: PID file write occurs AFTER `waitForServer` returns AND after `process.kill(child.pid, 0)` confirms child is alive (deferred write)
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P0] AC-1/AC-2: Given successful spawn, When startServer completes, Then PID file write is deferred until after child aliveness confirmation`

### TC-LC-006: Concurrent startServer calls, one wins via lock
- **Requirement**: AC-4
- **Test type**: positive
- **Priority**: P1
- **Given**: Lock file held by live process (simulating concurrent startup)
- **When**: Second `startServer()` call detects lock held
- **Then**: Second call waits for server via `waitForServer`, does not write its own PID file, returns success if server becomes reachable
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P1] AC-4: Given lock held by another live process, When second startServer call runs, Then it waits for server and returns lock-based result without writing PID`

### TC-LC-007: Concurrent startServer with dead lock holder, no dead PID
- **Requirement**: AC-4
- **Test type**: negative
- **Priority**: P1
- **Given**: Lock file held by dead process, foreign process on port
- **When**: `startServer()` cleans stale lock, spawns child that dies, foreign process responds
- **Then**: Returns failure, does not write dead child PID
- **Test file**: `lib/embedding/server/lifecycle.test.js`
- **Test name**: `[P1] AC-4: Given stale lock from dead process and foreign port squatter, When startServer acquires lock and child dies, Then no dead PID file written`

---

## Test Suite 2: refresh-code-embeddings.js — postReload() verification

### TC-RL-001: Reload 2xx with valid /modules response
- **Requirement**: AC-5
- **Test type**: positive
- **Priority**: P0
- **Given**: Embedding server running, `/reload` returns 200, `/modules` returns array with valid package metadata (filename present, chunks > 0)
- **When**: F0009 completes generation and calls postReload
- **Then**: Returns `{ ok: true }`, result has `serverReloaded: true` and no `reload_failed`
- **Test file**: `src/core/finalize/refresh-code-embeddings.test.js`
- **Test name**: `[P0] AC-5: Given reload returns 2xx and /modules shows valid package with chunks > 0, When postReload verifies, Then serverReloaded is true`

### TC-RL-002: Reload 2xx but /modules shows no package loaded
- **Requirement**: AC-5
- **Test type**: negative
- **Priority**: P0
- **Given**: Embedding server running, `/reload` returns 200, but `/modules` returns empty array or modules with 0 chunks
- **When**: F0009 completes generation and calls postReload
- **Then**: Returns `{ ok: false }` with verification error, result has `reload_failed: true` and warning logged
- **Test file**: `src/core/finalize/refresh-code-embeddings.test.js`
- **Test name**: `[P0] AC-5: Given reload returns 2xx but /modules shows empty or zero-chunk package, When postReload verifies, Then reload_failed is true and warning emitted`

---

## Summary

| Test ID | AC | Type | Priority | File |
|---------|------|------|----------|------|
| TC-LC-001 | AC-1 | negative | P0 | lifecycle.test.js |
| TC-LC-002 | AC-2 | negative | P0 | lifecycle.test.js |
| TC-LC-003 | AC-3 | positive | P0 | lifecycle.test.js |
| TC-LC-004 | AC-3 | negative | P1 | lifecycle.test.js |
| TC-LC-005 | AC-1, AC-2 | positive | P0 | lifecycle.test.js |
| TC-LC-006 | AC-4 | positive | P1 | lifecycle.test.js |
| TC-LC-007 | AC-4 | negative | P1 | lifecycle.test.js |
| TC-RL-001 | AC-5 | positive | P0 | refresh-code-embeddings.test.js |
| TC-RL-002 | AC-5 | negative | P0 | refresh-code-embeddings.test.js |
