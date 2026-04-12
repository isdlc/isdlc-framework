# Root Cause Analysis: GH-241

## Root Cause 1: Premature PID file write

**Location**: `lib/embedding/server/lifecycle.js:160`

```js
// Write PID immediately  ← BUG: writes before confirming child bound the port
writeFileSync(paths.pidFile, String(child.pid));
```

The PID file is written at line 160, before `waitForServer` at line 167. If the child dies with EADDRINUSE between these two points, the PID file contains a dead PID.

## Root Cause 2: waitForServer doesn't verify responder identity

**Location**: `lib/embedding/server/lifecycle.js:167-172`

`waitForServer` pings `http://host:port/health` and checks for HTTP 2xx. It doesn't verify that the responder is the child process we spawned. Any process on that port will satisfy the check.

## Root Cause 3: postReload treats 2xx as success

**Location**: `src/core/finalize/refresh-code-embeddings.js:129-136`

```js
if (res && typeof res.status === 'number' && res.status >= 200 && res.status < 300) {
  return { ok: true, refused: false };  // ← No verification of actual package load
}
```

HTTP 2xx means the server accepted the request, not that the package was successfully loaded. No follow-up check against `/modules` endpoint.

## Fix Strategy

1. **Defer PID write**: Move `writeFileSync` to after aliveness confirmation
2. **Verify child aliveness**: `process.kill(child.pid, 0)` after `waitForServer` — if child is dead but port responds, return failure
3. **Verify reload**: After 2xx from `/reload`, GET `/modules` and check package metadata
