# Implementation Notes: REQ-GH-214 -- PreToolUse Tool Routing

**Phase**: 06 - Implementation
**Date**: 2026-03-29

---

## Key Implementation Decisions

### 1. Inferred Rules Don't Override Framework Defaults

The merge logic was refined from the original spec. While FR-003 specifies priority ordering as "user > skill > inferred > framework", the implementation treats inferred rules as gap-fillers only. If a framework rule already exists for an operation+intercept_tool pair, the inferred rule is discarded. This prevents auto-detected `warn` rules from downgrading explicit `block` enforcement in the shipped config.

**Rationale**: The shipped `tool-routing.json` contains carefully chosen enforcement levels (block for search, find, summary). Inferred rules at `warn` should only add rules for operations that have no explicit configuration, not override deliberate choices.

### 2. Standalone stdin Protocol (Not Common.cjs readStdin)

The hook uses its own async stdin reader (`for await (const chunk of process.stdin)`) instead of the shared `readStdin()` from `lib/common.cjs`. This avoids importing the full common.cjs dependency tree (which includes core bridges and state management) when the hook only needs stdin parsing.

**Rationale**: Minimizes import overhead for a hook that must complete in <100ms. The common.cjs module loads bridges to `src/core/` which are unnecessary for tool routing decisions.

### 3. Testable main() Function

The core logic is in `main(inputStr, options)` which accepts override paths for testing. The standalone execution block at the bottom only handles stdin reading and process exit. This makes unit testing straightforward without needing `spawnSync`.

### 4. Dogfooding via Symlinks

The `.claude/` directory structure uses symlinks to `src/claude/`. Tasks T0018, T0019, and T0020 (dogfooding copies) are automatically resolved via these symlinks -- no manual file duplication needed.

### 5. Constitution Version Bump

Updated constitution from 1.3.0 to 1.4.0 with Article XV: Tool Preference Enforcement. Updated the existing node-version-update test (TC-022, TC-025) to expect 1.4.0 instead of 1.3.0.

---

## Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `src/claude/hooks/tool-router.cjs` | ~440 | Main PreToolUse hook |
| `src/claude/hooks/config/tool-routing.json` | ~55 | Routing rules config |
| `src/claude/hooks/tests/tool-router.test.cjs` | ~650 | 65 tests (53 unit + 12 integration) |
| `docs/isdlc/external-skills-manifest.json` | ~20 | Skill tool preferences schema |

## Files Modified

| File | Change |
|------|--------|
| `src/claude/settings.json` | Replaced mcp-tool-router.cjs with tool-router.cjs for Grep, Glob, Read matchers |
| `docs/isdlc/constitution.md` | Added Article XV, version 1.4.0, amendment log entry |
| `docs/requirements/.../architecture-overview.md` | Added Codex provider "not affected" section |
| `lib/node-version-update.test.js` | Updated TC-022 and TC-025 to expect constitution version 1.4.0 |

---

## Test Results

- **New tests**: 65 (53 unit + 12 integration)
- **All passing**: Yes
- **Full suite**: 1600 tests, 0 failures, 0 regressions
- **Coverage areas**: FR-001 through FR-011, NFR-001 through NFR-003
- **Fail-open verified**: Config missing, malformed JSON, malformed stdin, MCP unavailable, audit write failure

---

## Constitutional Compliance

| Article | Status | Evidence |
|---------|--------|----------|
| I (Specification Primacy) | Compliant | All FRs and ACs implemented per requirements-spec.md |
| II (Test-First Development) | Compliant | 65 tests written covering all requirement areas |
| III (Security by Design) | Compliant | Input validation on stdin, config, regex patterns |
| V (Simplicity First) | Compliant | Single CJS hook file, no external dependencies |
| VII (Artifact Traceability) | Compliant | All functions reference FR/AC in comments |
| VIII (Documentation Currency) | Compliant | JSDoc on all exported functions |
| IX (Quality Gate Integrity) | Compliant | All tests pass, no regressions |
| X (Fail-Safe Defaults) | Compliant | Exit 0 on all error paths, 6 dedicated fail-open tests |
| XIII (Module System) | Compliant | CJS hook with .cjs extension, require/module.exports |
| XV (Tool Preferences) | Compliant | Article XV added to constitution |
