# Design Summary: State.json Pruning at Workflow Completion

**Feature**: GH-39 -- State.json Pruning at Workflow Completion
**Phase**: 04-design (ANALYSIS MODE) -- COMPLETE
**Designer**: Jordan Park (System Designer)
**Date**: 2026-02-21

---

## 1. Design Overview

This design implements a hot/cold data architecture for iSDLC state management. State.json (hot) holds only the active workflow and durable configuration. State-archive.json (cold) accumulates compact records of every completed, cancelled, and abandoned workflow. At workflow completion, the enforcer hook archives a record to the cold store, then prunes and clears transient fields from the hot store.

The design follows existing codebase patterns throughout: synchronous I/O, pure-function mutations, fail-open error handling, and no new dependencies.

---

## 2. Design Metrics

| Metric | Count |
|--------|-------|
| Modules modified | 2 (`common.cjs`, `workflow-completion-enforcer.cjs`) |
| Modules referenced (prompt changes) | 1 (`00-sdlc-orchestrator.md`) |
| New runtime files | 1 (`state-archive.json`, created on first use) |
| New public functions | 4 (`resolveArchivePath`, `clearTransientFields`, `appendToArchive`, `seedArchiveFromHistory`) |
| New private helpers | 2 (`_deriveOutcome`, `_compactPhaseSnapshots`) |
| New exports | 4 |
| Existing function modifications | 2 (default parameter changes: `20->50`, `50->100`) |
| Public interface contracts | 4 (fully specified with types, constraints, examples) |
| Data structure schemas | 4 (`ArchiveFile`, `ArchiveRecord`, `PhaseSummary`, `LegacyWorkflowEntry`) |
| Architecture decisions (ADRs) | 10 (ADR-001 through ADR-010) |
| Error conditions catalogued | 28 (across 9 error categories) |
| Error boundary layers | 4 (Layer 0: parse, Layer 1: function, Layer 2: archive block, Layer 3: top-level) |
| Data flow paths | 4 (completed, abandoned, migration, re-trigger) |
| Unit test cases (archive functions) | 33 |
| Unit test cases (prune functions) | ~20 (existing functions, currently 0% coverage) |
| Integration test cases (enforcer) | 10 |
| Error path test cases | 16 (13 unit + 3 integration) |
| **Total test cases** | **~79** |
| Estimated new lines of code | ~130 (common.cjs: ~110, enforcer: ~20) |
| New dependencies | 0 |

---

## 3. Artifact Inventory

| Artifact | Step | Contents |
|----------|------|----------|
| `module-design-common-cjs.md` | 04-01 | 4 new functions with complete code, 2 default changes, exports, data structures, test strategy (42 cases), dependency graph |
| `module-design-enforcer.md` | 04-01 | Import changes, execution sequence, archive record construction, ordering constraint, data flow diagram, error boundary analysis, re-triggering analysis, test strategy (10 cases) |
| `interface-spec.md` | 04-02 | TypeScript-style signatures for 4 public functions, 4 data structure schemas, boundary validation rules, error propagation map, integration contract, versioning considerations |
| `data-flow.md` | 04-03 | 4 runtime data flow paths with sequence diagrams, state transitions for both files, I/O budget analysis, concurrency/atomicity analysis, cross-path decision tree |
| `error-handling.md` | 04-04 | 28 error conditions in 9 categories, 3-layer defense model, recovery matrix, debug log catalog, "everything fails" scenario, 16 required error path tests |
| `design-summary.md` | 04-05 | This document. Executive summary and readiness assessment. |

**Prior phase artifacts** (consumed by design):

| Artifact | Phase | Key Contribution |
|----------|-------|------------------|
| `requirements-spec.md` | 01-requirements | 15 FRs, 10 NFRs, acceptance criteria, build order |
| `impact-analysis.md` | 02-impact-analysis | Blast radius, 13 risks, test coverage gaps |
| `architecture-overview.md` | 03-architecture | 10 ADRs, system context, integration architecture |
| `quick-scan.md` | 00-quick-scan | Initial scope and complexity assessment |

---

## 4. Implementation Readiness Checklist

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Every FR has function-level design | PASS | FR-003 -> clearTransientFields, FR-004 -> default changes, FR-005 -> enforcer call, FR-010 -> enforcer archive block, FR-011 -> appendToArchive, FR-013 -> orchestrator init (prompt), FR-014 -> seedArchiveFromHistory, FR-015 -> resolveArchivePath |
| Every function has complete code | PASS | module-design-common-cjs.md Sections 2.1-2.4 |
| Every function has typed interface | PASS | interface-spec.md Sections 1.1-1.4 |
| Every function has test cases | PASS | module-design-common-cjs.md Section 7 (42 cases), module-design-enforcer.md Section 7 (10 cases) |
| Every error condition documented | PASS | error-handling.md Section 2.2 (28 conditions) |
| Every error has recovery strategy | PASS | error-handling.md Sections 2.2 + 7.1 |
| Data flow paths traced | PASS | data-flow.md Sections 2-5 (4 paths with sequence diagrams) |
| Insert locations specified | PASS | module-design-common-cjs.md (line numbers for each function) |
| Build order defined | PASS | requirements-spec.md FR Dependency Chain + architecture-overview.md |
| No new dependencies | PASS | architecture-overview.md Section 18 |
| Fail-open verified at every boundary | PASS | error-handling.md Section 4 (every row shows allow) |
| Idempotency verified | PASS | interface-spec.md invariants + data-flow.md Path D analysis |

---

## 5. Build Order (Implementation Sequence)

From the FR dependency chain:

```
Phase 1 (parallel, no dependencies):
  FR-015: resolveArchivePath()          ~12 LOC + 4 tests
  FR-003: clearTransientFields()        ~10 LOC + 7 tests

Phase 2 (depends on FR-015):
  FR-011: appendToArchive()             ~50 LOC + 11 tests

Phase 3 (depends on FR-011):
  FR-014: seedArchiveFromHistory()      ~45 LOC + 11 tests
  FR-004: Default parameter changes     2 LOC + included in prune tests

Phase 4 (depends on Phase 1-3):
  FR-005: Enforcer calls clearTransientFields    1 LOC + 10 tests
  FR-010: Enforcer archive block                 ~20 LOC + (same test file)
  FR-006: Orchestrator prompt changes            Prose update

Phase 5 (depends on Phase 1-4):
  FR-009: Migration at orchestrator init         Prompt update + seedArchiveFromHistory call
  FR-013: Abandoned workflow archiving           Prompt update + appendToArchive call
```

---

## 6. Risk Summary (Carried Forward)

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Syntax error in common.cjs breaks all 27 hooks | LOW | CRITICAL | TDD: write tests first, run after every function addition |
| Zero test coverage for existing prune functions | MEDIUM | HIGH | Write prune tests in Phase 1 (before modifying defaults) |
| Corrupt archive on partial write | LOW | LOW | Accept data loss; archive is convenience, not source of truth |
| Migration I/O for large workflow_history | LOW | LOW | One-time cost; 18 entries = 36 file ops = negligible |

---

## 7. Design Decisions Summary

| # | Decision | Rationale |
|---|----------|-----------|
| ADR-001 | Pure function pattern for all new functions | Matches existing pruneX() pattern; testable in isolation |
| ADR-002 | Explicit allowlist for transient fields (6 fields) | No wildcards, no iteration; adding a field requires code change (intentional friction) |
| ADR-003 | Dual-path pruning (orchestrator + enforcer) | Defense-in-depth; enforcer catches what orchestrator misses |
| ADR-004 | Updated retention limits (50/100/50) | Based on observed 18-workflow usage data |
| ADR-005 | Migration via orchestrator init | One-time, idempotent, flag-guarded |
| ADR-006 | Archive-and-prune (not in-place FIFO only) | Preserves complete history in cold store while keeping hot store lean |
| ADR-007 | Indexed-array archive format | Append-only with O(1) lookup by source_id or slug |
| ADR-008 | Enforcer owns archive write path | Enforcer already manages completion detection and state write |
| ADR-009 | Dedup inside appendToArchive (O(1) on last record) | Handles re-trigger and migration re-run without caller coordination |
| ADR-010 | Index maintained on write (not rebuilt on read) | Zero additional I/O; forward-compatible with future lookupArchive |

---

## Metadata

- **Step**: 04-05 (Design Review & Approval)
- **Depth**: brief
- **Persona**: Jordan Park (System Designer)
- **Phase Status**: 04-design COMPLETE
- **Analysis Status**: ALL PHASES COMPLETE (00 through 04)
