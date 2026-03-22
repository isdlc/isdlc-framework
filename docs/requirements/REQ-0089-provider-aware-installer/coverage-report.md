# Coverage Report — REQ-0089: Provider-Aware Installer

**Date**: 2026-03-22
**Tool**: Manual test-count coverage (node:test without c8/istanbul)

---

## New Modules

### src/core/installer/index.js — 22 tests

| Function | Tests | Positive | Negative | Edge Cases |
|----------|-------|----------|----------|------------|
| `installCore()` | 8 | creates .isdlc/, state.json, phases, docs, constitution, BACKLOG.md, config | dry-run no-op | preserves existing BACKLOG.md |
| `updateCore()` | 3 | preserves project data, adds history entry | dry-run no-op | — |
| `uninstallCore()` | 4 | removes config/, templates/ | dry-run no-op | preserves state.json, BACKLOG.md |
| `doctorCore()` | 5 | healthy for valid install | missing .isdlc/, missing state.json, missing constitution | returns arrays (warnings, passed) |

### src/providers/claude/installer.js — 20 tests

| Function | Tests | Positive | Negative | Edge Cases |
|----------|-------|----------|----------|------------|
| `installClaude()` | 9 | creates .claude/, agents/, skills/, hooks/, commands/, settings.json | dry-run no-op | merges settings preserving user keys, returns installedFiles |
| `updateClaude()` | 3 | preserves user keys, updates framework dirs | — | returns updated files list |
| `uninstallClaude()` | 3 | strips hooks from settings | dry-run no-op | preserves settings.local.json |
| `doctorClaude()` | 5 | healthy for valid install | missing .claude/ | missing settings.json, missing subdirs, returns arrays |

### tests/providers/claude/adapter.test.js — 8 tests

| Function | Tests | Positive | Edge Cases |
|----------|-------|----------|------------|
| `getClaudeConfig()` | 3 | returns object with required fields, provider=claude, frameworkDir=.claude | — |
| `getHookRegistration()` | 3 | returns array, each has name/event/command, includes gate-blocker | — |
| `getProjectionPaths()` | 2 | returns required path keys, all relative strings | — |

---

## Existing Modules (Regression Coverage)

| Suite | Tests | Pass | Fail | Regression? |
|-------|-------|------|------|-------------|
| `npm test` (lib/) | 1585 | 1582 | 3 | No — 3 pre-existing |
| `npm run test:core` | 445 | 445 | 0 | No |
| `npm run test:providers` | 28 | 28 | 0 | No |

---

## Coverage Gaps

1. **Integration test gap**: No end-to-end test that calls `install()` from lib/installer.js and verifies it delegates to `installCore()` + `installClaude()`. This is expected — the lib/ functions currently import but do not yet call the new modules (phase 1 of refactoring).

2. **No c8/istanbul instrumentation**: Line-level and branch-level coverage percentages are not measured. This is a project-wide gap, not specific to REQ-0089.
