# Fix Strategy: GH-241

## Approach: Surgical fix in 2 files

### Fix 1: Defer PID file write + verify child aliveness (lifecycle.js)

**File**: `lib/embedding/server/lifecycle.js`, `startServer()` function (lines 114-185)

**Changes**:
1. Remove `writeFileSync(paths.pidFile, String(child.pid))` from line 160
2. After `waitForServer` returns `true` (line 172), add child aliveness check:
   ```js
   let childAlive = false;
   try { process.kill(child.pid, 0); childAlive = true; } catch { childAlive = false; }
   ```
3. If `childAlive && reachable` → write PID file, return success
4. If `!childAlive && reachable` → return `{ success: false, error: 'port bound by foreign process', foreignPort: true }`
5. If `!reachable` → return failure (existing behavior, unchanged)

### Fix 2: Reload verification (refresh-code-embeddings.js)

**File**: `src/core/finalize/refresh-code-embeddings.js`, `postReload()` function (lines 119-143)

**Changes**:
1. After `/reload` returns 2xx, add verification step:
   ```js
   // Verify the server actually loaded the package
   const modulesRes = await _fetch(`http://${host}:${port}/modules`);
   const modules = await modulesRes.json();
   if (!modules || !modules.length || modules[0].chunks === 0) {
     return { ok: false, refused: false, error: 'reload accepted but no modules loaded' };
   }
   ```
2. Fail-open: if `/modules` check fails, set `reload_failed: true` and warn — don't throw

## Acceptance Criteria Mapping

| AC | Fix | Verification |
|----|-----|-------------|
| AC-1 | Fix 1 (aliveness check) | Foreign process on port → failure, not dead-PID success |
| AC-2 | Fix 1 (deferred PID write) | Stale PID + port squatter → failure reflected |
| AC-3 | Fix 1 (regression guard) | Normal clean spawn → still works |
| AC-4 | Fix 1 (lock mechanism, existing) | Concurrent calls → one wins via lock |
| AC-5 | Fix 2 (reload verification) | After reload 2xx → /modules checked |

## Risk Assessment

- **Low risk**: Changes are additive — aliveness check and verification are new code paths, existing happy path is preserved
- **No API changes**: `startServer()` return type unchanged, just new error cases
- **Fail-open**: Reload verification follows existing F0009 fail-open pattern
