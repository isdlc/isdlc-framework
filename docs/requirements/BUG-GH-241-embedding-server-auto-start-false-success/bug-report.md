# Bug Report: GH-241 — Embedding server auto-start false success

## Summary

`startServer()` in `lib/embedding/server/lifecycle.js` reports `{ success: true }` with a dead child PID when another process holds the configured port. Additionally, F0009's `postReload()` treats HTTP 2xx as successful reload without verifying the server actually loaded the new package.

## Reproduction

### Scenario 1: PID false success
1. Start a non-iSDLC process on port 7777 (e.g., `python -m http.server 7777`)
2. Delete/corrupt the PID file at `.isdlc/logs/embedding-server.pid`
3. Call `startServer(projectRoot)`
4. Result: `{ success: true, pid: <dead child>, port: 7777 }` — child died with EADDRINUSE but waitForServer got 200 from the foreign process

### Scenario 2: Reload false success
1. Embedding server running with old `.emb` package
2. F0009 generates new package and POSTs `/reload`
3. Server returns 200 but fails to load new package (bad format, parse error, etc.)
4. F0009 reports `{ status: "ok", serverReloaded: true }` — stale embeddings still served

## Impact

- PID file points to dead process → subsequent `reloadServer()`, `stopServer()`, `isPidAlive()` target wrong process or no-op
- Reload false positive → F0009 reports success but semantic search uses stale embeddings

## Severity

Medium — only triggers when port is occupied by a foreign process (rare in single-user local dev). Reload gap affects embedding freshness after builds.

## Environment

- macOS Apple Silicon, Node.js v25.x
- Discovered via code analysis during GH-238/GH-239 validation
