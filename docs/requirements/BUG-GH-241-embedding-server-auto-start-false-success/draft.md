# BUG-GH-241: Embedding server auto-start reports false success when port already bound

**Source**: github
**Source ID**: GH-241
**Type**: BUG
**Created**: 2026-04-12
**GitHub**: https://github.com/vihang-hub/isdlc-framework/issues/241

---

## Bug Summary

`startServer()` in `lib/embedding/server/lifecycle.js` can report `{ success: true }` with a dead child PID when another process already holds the configured port. The spawned child dies with EADDRINUSE but `waitForServer` pings the port, gets 200 from the foreign process, and reports success. The PID file then points to a dead process.

## Additional Gap (identified 2026-04-12)

F0009 reload verification is absent. After POST `/reload` returns HTTP 2xx, no verification that the server actually loaded the new `.emb` package. The server could accept the request and fail silently (bad package, zero vectors, cached old version).

## Proposed Fixes

1. **Defer PID file write**: Move `writeFileSync(pidFile)` to after `waitForServer` succeeds AND child is verified alive
2. **Verify child aliveness**: After `waitForServer`, call `process.kill(child.pid, 0)` to confirm the spawned child is actually serving
3. **Reload verification**: After POST `/reload` returns 2xx, GET `/modules` and verify package filename, chunk count > 0, build timestamp is recent

## Acceptance Criteria

- AC-1: Foreign process on port → NOT reported as success with dead child PID
- AC-2: Stale PID file + port squatter → failure reflected, not spurious success
- AC-3: Normal clean spawn → regression guard, still works correctly
- AC-4: Concurrent startServer calls → one wins, other detects, no dead PID
- AC-5: After reload 2xx → verify /modules shows correct package loaded (new)

## Code Locations

- `lib/embedding/server/lifecycle.js` — `startServer()` lines 114-185
- `src/core/finalize/refresh-code-embeddings.js` — `postReload()` lines 119-143
