# Code Review Report: Phase 2 Batch 3

**Phase**: 08-code-review
**Date**: 2026-03-22
**Artifact Folder**: REQ-0085-decompose-common-cjs
**Reviewer**: QA Engineer (Phase 08)

## Scope

Batch 3 of the Phase 2 decomposition covers three work items:
- **REQ-0086**: Wire three-verb-utils.cjs bridge delegation (5 functions)
- **REQ-0084**: Create search/memory service boundaries in src/core/
- **REQ-0085**: Extract skills module to core, add remaining bridge loaders to common.cjs

## Verdict

**APPROVED** -- No blocking issues. Code follows established ADR-CODEX-006 patterns (ESM core + CJS bridge), all 38 new tests pass, and 0 regressions across the 324-test core suite.

---

## REQ-0086: Three-Verb-Utils Bridge Wiring

### Files Modified
- `src/claude/hooks/lib/three-verb-utils.cjs`

### Review

**Bridge pattern**: Correctly implements lazy-load bridge at lines 26-40. The `_getBacklogBridge()` function resolves the backlog bridge CJS file from `src/core/bridge/backlog.cjs` using a relative path from `__dirname`. Caches the result in `_backlogBridge` (undefined = not attempted, null = unavailable). This matches the pattern used in `common.cjs` for the state bridge.

**Delegated functions** (5 total):
1. `generateSlug` (line 97) -- delegates with `_b?.generateSlug`
2. `detectSource` (line 134) -- delegates with `_b?.detectSource`
3. `deriveAnalysisStatus` (line 338) -- delegates with `_b?.deriveAnalysisStatus`
4. `deriveBacklogMarker` (line 377) -- delegates with `_b?.deriveBacklogMarker`
5. `parseBacklogLine` (line 1063) -- delegates with `_b?.parseBacklogLine`

**Fallback behavior**: Each function retains its original inline implementation. If the bridge is unavailable (e.g., file copied to temp dir for tests), the inline code runs. This is the correct fail-open pattern per ADR-CODEX-006.

**Finding**: NONE -- Implementation is clean and follows the established bridge pattern.

---

## REQ-0084: Search/Memory Service Boundaries

### Files Created
- `src/core/search/index.js`
- `src/core/memory/index.js`
- `src/core/bridge/search.cjs`
- `src/core/bridge/memory.cjs`

### Review

**Search service** (`src/core/search/index.js`):
- Exports `SearchSetupService` as an object with `buildSearchConfig()` method
- Exports `KnowledgeSetupService` with lazy-loaded async `setup()` method
- Correctly delegates to `lib/setup-search.js` (existing implementation)
- `KnowledgeSetupService.setup()` uses dynamic import to avoid loading heavy deps at import time -- good practice
- `MODULE_ID` constant exported for service identification

**Memory service** (`src/core/memory/index.js`):
- Exports `MemoryService` as an object with 6 methods: readUserProfile, readProjectMemory, mergeMemory, formatMemoryContext, writeSessionRecord, compact
- Directly re-exports from `lib/memory.js`
- Clean, minimal delegation layer

**Search bridge** (`src/core/bridge/search.cjs`):
- Lazy-loads ESM module via `import('../search/index.js')`
- `buildSearchConfig` has inline sync fallback (`_buildSearchConfigSync`) for pre-preload use
- Sync fallback correctly implements the search config defaults (grep-glob backend, lexical modality)
- `preload()` caches the ESM module for sync access

**Memory bridge** (`src/core/bridge/memory.cjs`):
- Lazy-loads ESM module via `import('../memory/index.js')`
- Async functions (readUserProfile, readProjectMemory, writeSessionRecord) await the ESM load
- Sync functions (mergeMemory, formatMemoryContext) use cached module with inline fallbacks
- `mergeMemory` fallback returns a valid empty MemoryContext object -- correct
- `formatMemoryContext` fallback returns empty string -- correct

**Finding**: NONE -- Both bridges follow the established ADR-CODEX-006 pattern consistently.

---

## REQ-0085: Skills Extraction + Common.cjs Bridge Loaders

### Files Created
- `src/core/skills/index.js`

### Files Modified
- `src/claude/hooks/lib/common.cjs` (bridge loaders added)

### Review

**Skills module** (`src/core/skills/index.js`):
- Extracts 2 constants (SKILL_KEYWORD_MAP, PHASE_TO_AGENT_MAP) and 6 functions from common.cjs
- Functions extracted: validateSkillFrontmatter, analyzeSkillContent, suggestBindings, formatSkillInjectionBlock, removeSkillFromManifest, reconcileSkillsBySource
- All functions are pure or use only `readFileSync`/`existsSync` for file I/O
- JSDoc annotations preserved and enhanced with @module tag
- REQ-0085 trace in file header
- Uses `node:fs` and `node:path` imports (ESM style)

**Extraction quality**:
- `validateSkillFrontmatter`: Exact behavioral copy of common.cjs original. Uses `existsSync` guard before `readFileSync`. Collects all errors (not fail-fast) per NFR-006.
- `analyzeSkillContent`: Exact behavioral copy. Handles null/non-string input gracefully. Low confidence default to '06-implementation'.
- `suggestBindings`: Exact behavioral copy. Enhances confidence with frontmatter hints. Maps phases to agents via PHASE_TO_AGENT_MAP.
- `formatSkillInjectionBlock`: Pure function, exact copy. Switch statement with empty string default for unknown types.
- `removeSkillFromManifest`: Pure function, handles null manifest safely.
- `reconcileSkillsBySource`: Complex but well-structured reconciliation. Validates source, normalizes manifest, partitions by source, processes updates/additions/removals. Pure function on inputs.

**Common.cjs bridge loaders** (lines 37-91):
- Three new bridge loader functions added: `_getValidatorsBridge()`, `_getWorkflowBridge()`, `_getBacklogBridge()`
- All follow the identical pattern as the existing `_getCoreBridge()`: lazy-load with `require()`, cache undefined/null, fail-open
- Resolve paths relative to `__dirname` using `path.resolve()` with correct directory traversal
- Note: The skill functions in common.cjs still retain their inline implementations (no bridge delegation yet). This is the correct incremental approach -- the ESM canonical module is created first, bridge wiring happens as a follow-up.

**Finding (LOW, informational)**: The skills functions in `common.cjs` are not yet delegating to the skills bridge. This is expected and aligns with the incremental extraction strategy. The bridge loader for a future `src/core/bridge/skills.cjs` is not yet present, which is consistent with the scope boundary -- REQ-0085 creates the ESM module; a future item would wire the CJS delegation.

---

## Test Quality Review

### New Test Files (4 files, 38 tests)

**tests/core/search/search-boundary.test.js** (5 tests):
- Tests SearchSetupService interface presence and behavior
- Tests KnowledgeSetupService interface presence
- Tests buildSearchConfig with null detection and custom detection
- Tests MODULE_ID constant
- Good boundary testing: verifies contract without testing implementation details

**tests/core/memory/memory-boundary.test.js** (5 tests):
- Tests MemoryService interface presence and all method types
- Tests mergeMemory with null inputs (boundary case)
- Tests formatMemoryContext with empty context
- Tests MODULE_ID constant
- Clean interface-level tests

**tests/core/skills/skill-management.test.js** (21 tests):
- Tests all 8 exported functions and 2 constants
- validateSkillFrontmatter: tests missing file, non-.md file (with cleanup)
- analyzeSkillContent: tests empty content, keyword detection
- suggestBindings: tests null analysis defaults
- formatSkillInjectionBlock: tests all 3 delivery types (context, instruction, reference)
- removeSkillFromManifest: tests removal and null manifest
- reconcileSkillsBySource: tests invalid source rejection and new skill addition
- Good coverage of error paths and edge cases

**tests/core/config/config-service.test.js** (7 tests):
- Tests loadCoreProfile for nonexistent and standard profiles
- Tests loadCoreSchema export
- Tests normalizePhaseKey for legacy aliases and canonical pass-through
- Clean, focused tests

### Test Quality Assessment

- All tests use `node:test` with `describe`/`it` pattern (consistent with project)
- All tests use `assert/strict` (consistent with project)
- Dynamic imports used (ESM modules in test runner)
- Proper cleanup in skill-management.test.js (temp file deleted in `finally` block)
- Tests cover both happy path and error/edge cases
- No test interdependencies detected

---

## Cross-Cutting Concerns

### Architecture Compliance (Article III)
- New modules follow ADR-CODEX-006 (ESM core + CJS bridge)
- Service boundary pattern is consistent across search, memory, skills
- Module IDs follow `core/{domain}` naming convention

### Security (Article V)
- No eval, exec, or dangerous patterns in new code
- File operations guarded by existence checks
- Input validation present in validateSkillFrontmatter

### Code Quality (Article VI)
- JSDoc on all public functions
- Consistent code style across all new files
- Pure functions where possible (formatSkillInjectionBlock, removeSkillFromManifest, reconcileSkillsBySource)

### Traceability (Article IX)
- All files contain REQ trace annotations in headers
- Test files reference their target REQ
- Function-level @traces annotations in skills module

### Module System Consistency (Article XIII)
- ESM modules in src/core/ use `import`/`export`
- CJS bridges use `require()`/`module.exports`
- No mixed module patterns

---

## Summary

| Category | Count |
|----------|-------|
| BLOCKING | 0 |
| WARNING | 0 |
| LOW (informational) | 1 (skills bridge delegation is future work) |
| Files reviewed | 11 (7 source + 4 test) |
| Tests reviewed | 38 |
| Regressions | 0 |

**APPROVED** for merge.
