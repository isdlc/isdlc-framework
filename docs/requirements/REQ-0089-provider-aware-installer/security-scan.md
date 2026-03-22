# Security Scan — REQ-0089: Provider-Aware Installer

**Date**: 2026-03-22
**Scope**: SAST review + dependency audit for installer/updater/uninstaller/doctor modules

---

## SAST Security Review

### Filesystem Operations Analysis

REQ-0089 modules perform extensive filesystem operations (create directories, copy files, write JSON, remove directories, create symlinks). All operations were reviewed for security concerns.

#### Path Traversal — PASS

All file paths are constructed using `path.join()` from a validated `projectRoot` parameter:
- `path.join(projectRoot, '.isdlc')` — bounded to project root
- `path.join(projectRoot, '.claude')` — bounded to project root
- `path.join(frameworkDir, 'claude')` — bounded to framework install dir

No user-controlled string interpolation into paths. No `../` or absolute path injection vectors.

#### Symlink Safety — PASS

`src/providers/claude/installer.js` creates symlinks in `.antigravity/`:
```js
try { await lstat(linkPath); await remove(linkPath); } catch { /* doesn't exist */ }
await symlink(target, linkPath);
```
Pattern: check-then-remove-then-create. The `lstat()` call detects broken symlinks (unlike `stat()`). The remove-before-create pattern prevents symlink confusion attacks.

#### Command Injection — PASS

New modules (`src/core/installer/index.js`, `src/providers/claude/installer.js`) contain:
- Zero calls to `exec`, `execSync`, `spawn`, or `child_process`
- No shell command construction from user input
- No template literal command building

Note: `lib/installer.js` (existing, not new) uses `execSync` for `git remote -v`, `claude --version`, and `claude mcp list`, but these are fixed strings with no user input interpolation.

#### File Permission Handling — PASS

- No `chmod`, `chown`, or permission modification calls
- No `setuid`/`setgid` operations
- File creation uses default umask (safe)

#### Denial of Service — PASS

- `removeEmptyDirRecursive()` only descends into existing directories, reads entries, and removes empty ones. No infinite recursion risk.
- Phase directory creation bounded to 13 fixed phase names (not user-controlled count)

#### Secrets / Credentials — PASS

- No hardcoded API keys, tokens, passwords, or secrets
- No `.env` file reading
- Generated `state.json` contains only structural metadata (no credentials)

### Findings

| Severity | Count | Details |
|----------|-------|---------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 0 | — |
| Info | 0 | — |

---

## Dependency Audit

```
npm audit report:
  Vulnerabilities: 0
    info: 0
    low: 0
    moderate: 0
    high: 0
    critical: 0
  Dependencies: 35 prod, 39 optional, 73 total
```

REQ-0089 adds no new dependencies. All filesystem operations use Node.js built-ins (`node:fs/promises`, `node:path`) or existing `lib/utils/fs-helpers.js` wrappers.

---

## Constitutional Compliance

| Article | Status | Notes |
|---------|--------|-------|
| Article III: Security by Design | COMPLIANT | No secrets, all inputs validated, no injection vectors |
| Article V: Security by Design | COMPLIANT | Fail-safe defaults (dry-run support, preservation of user artifacts) |
| Article X: Fail-Safe Defaults | COMPLIANT | Missing directories handled gracefully, missing state.json non-fatal |
