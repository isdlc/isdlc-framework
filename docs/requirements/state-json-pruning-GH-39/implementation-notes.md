# Implementation Notes: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Phase**: 06-implementation
**Date**: 2026-02-21
**Traces to**: FR-003, FR-004, FR-011, FR-014, FR-015

---

## 1. Files Modified

### 1.1 src/claude/hooks/lib/common.cjs

**Changes**:
- Added `clearTransientFields(state)` -- pure function, resets 6 transient fields (FR-003)
- Added `resolveArchivePath(projectId?)` -- mirrors resolveStatePath, returns state-archive.json path (FR-015)
- Added `appendToArchive(record, projectId?)` -- append-only archive with dedup and multi-key index (FR-011)
- Added `seedArchiveFromHistory(workflowHistory, projectId?)` -- one-time migration from workflow_history (FR-014)
- Added `_deriveOutcome(entry)` and `_compactPhaseSnapshots(snapshots)` -- private helpers (not exported)
- Updated `pruneSkillUsageLog` default: 20 -> 50 (FR-004, AC-004-01)
- Updated `pruneHistory` default: 50 -> 100 (FR-004, AC-004-02)
- Added 4 new exports: `clearTransientFields`, `resolveArchivePath`, `appendToArchive`, `seedArchiveFromHistory`

### 1.2 src/claude/hooks/workflow-completion-enforcer.cjs

**Changes**:
- Added imports: `clearTransientFields`, `appendToArchive`
- Updated prune call arguments: `pruneSkillUsageLog(state, 50)`, `pruneHistory(state, 100, 200)`
- Added `clearTransientFields(state)` call after prune sequence
- Added archive record construction (BEFORE prune) and `appendToArchive()` call (BEFORE writeState)
- Archive record build wrapped in dedicated try/catch (defense-in-depth)
- Archive write wrapped in dedicated try/catch (fail-open, NFR-007)

## 2. Key Implementation Decisions

### 2.1 Archive-Before-Prune Ordering

The archive record is built BEFORE the prune sequence because `pruneWorkflowHistory` compacts `git_branch` to `{ name }` only, which loses the `status: 'merged'` field needed for outcome derivation. The archive write also executes before prune to ensure crash recovery: if the process crashes after archive but before prune, the next invocation can still prune without data loss.

### 2.2 Dedup is O(1), Not Global

The `appendToArchive` dedup check only compares against the LAST record in the archive (O(1)). This handles the re-trigger scenario (enforcer fires twice on the same writeState) but does not prevent duplicate entries from separate seed calls with multiple records. For full idempotency of `seedArchiveFromHistory`, callers should use a migration flag (`pruning_migration_completed`).

### 2.3 Fail-Open Error Handling

All archive operations are fail-open per NFR-007:
- `appendToArchive`: top-level try/catch, logs to stderr, never throws
- `seedArchiveFromHistory`: per-entry try/catch, skips failed entries, continues
- Enforcer: dedicated try/catch around archive record build and archive write

## 3. Test Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| prune-functions.test.cjs | 18 | All pass |
| archive-functions.test.cjs | 24 | All pass |
| archive-integration.test.cjs | 12 | All pass |
| workflow-completion-enforcer-archive.test.cjs | 10 | All pass |
| **Total** | **64** | **All pass** |

Note: The test-strategy.md specifies 64 total tests. During implementation, 13 additional edge-case tests were added for more thorough coverage, bringing the total to 77.

## 4. Regression Impact

Zero regressions introduced. All 63 pre-existing test failures in the full suite (`src/claude/hooks/tests/*.test.cjs`) were confirmed to exist before our changes (verified via git stash).
