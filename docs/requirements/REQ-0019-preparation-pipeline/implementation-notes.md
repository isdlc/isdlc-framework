# Implementation Notes: REQ-0019 Preparation Pipeline

**Phase**: 06-implementation
**Date**: 2026-02-16
**Intensity**: Light (standard-skip: architecture, design)

---

## Summary

Implemented the Phase A/B preparation pipeline across 4 production files and 1 test file. All changes are prompt/markdown only -- zero JavaScript code changes. The feature enables decoupled requirements capture (Phase A) that runs outside the workflow machinery, and execution (Phase B) that consumes prepared requirements starting from Phase 02.

## Files Modified

### 1. `BACKLOG.md` (RESTRUCTURED)

Restructured from ~650 lines (inline spec repository) to ~100 lines (lightweight index):
- Each open item is now a single line: `- {id} [{status}] {title} -> [requirements](docs/requirements/{slug}/)`
- Completed items are single lines with `[x]` checkbox and date
- Inline specs removed (will be migrated to `docs/requirements/` folders when items go through Phase A)
- Section headers preserved (## Open, ## Completed, subsection ### headers)
- All 35+ open items and 39 completed items preserved in condensed format

**Note**: The `docs/requirements/{slug}/` folders referenced in BACKLOG.md links do NOT all exist yet. They are placeholder links. Folders will be created when items go through Phase A intake.

### 2. `src/claude/commands/isdlc.md` (+~150 lines)

Added three major sections:

**SCENARIO 5: Phase A -- Preparation Pipeline** (after SCENARIO 4):
- Step 1 (Intake): Source detection (Jira/GitHub/manual), slug derivation, duplicate detection, folder creation with `draft.md` and `meta.json`, BACKLOG.md index entry
- Step 2 (Deep Analysis): Optional quick-scan + requirements capture
- Phase A Constraints: Explicit prohibition of state.json, hooks, branches, .isdlc/ writes

**`analyze` action**: Runs Phase A directly, no orchestrator needed, no active workflow check

**`start` action**: Phase B consumption with full NFR-001 validation:
- meta.json missing/malformed/incomplete checks with remediation commands
- Staleness detection via codebase_hash comparison
- Proceed/Refresh/Cancel menu for stale requirements
- Workflow initialization from Phase 02 (skipping 00/01)

Also updated: Workflows table (+2 rows), examples (+6 lines), flow summary (+2 lines), STEP 1 Phase B consumption handling.

### 3. `src/claude/CLAUDE.md.template` (+15 lines)

- Added 3 new intent detection rows: Intake, Analyze, Start (Phase B)
- Added Preparation Pipeline explanation paragraph with `docs/requirements/{slug}/` reference
- Updated "Let's work on" backlog operation to check for prepared requirements

### 4. `CLAUDE.md` (project root, +12 lines)

- Added "Preparation Pipeline (Phase A / Phase B)" subsection under Workflow-First Development
- 3-row intent table mirroring template patterns
- Phase A/B explanation with docs/requirements/ reference

### 5. `tests/prompt-verification/preparation-pipeline.test.js` (NEW, 46 tests)

- 14 test groups covering all 9 FRs, 4 NFRs, cross-file consistency, and regression safety
- All P0 (25 tests) and P1 (21 tests) test cases from the test strategy
- Pattern: readFileSync + content.includes() / regex assertions
- ESM module format following established project conventions

## Key Decisions

1. **BACKLOG.md links are placeholders**: Per the requirements spec, we do NOT create `docs/requirements/` folders for existing items during migration. The links are forward references.

2. **"add" signal word moved from Feature to Intake**: In CLAUDE.md.template, "add" was previously a Feature signal word. It now routes to Intake ("add to backlog") because the preparation pipeline is a more natural match for "add X to the backlog" intent.

3. **NFR-001 error messages include remediation**: Every Phase B validation error includes the specific file path, what is wrong, and the exact command to fix it (e.g., `/isdlc analyze "{item}"`).

4. **Staleness threshold**: 10 commits between codebase_hash and current HEAD triggers the staleness warning, matching the requirements spec.

## Test Results

- New tests: 46/46 passing
- Regression (5 backlog test files): 59/59 passing
- All ESM prompt-verification tests: 95/95 passing
- Pre-existing CJS failures (workflow-finalizer): 28 failing (unchanged from before)
- Total regressions introduced: 0

## Traceability

| Requirement | Implementation Location | Test Coverage |
|-------------|------------------------|---------------|
| FR-001 (Phase A Intake) | isdlc.md SCENARIO 5 Step 1 | TG-01: 4 tests |
| FR-002 (Deep Analysis) | isdlc.md SCENARIO 5 Step 2 | TG-02: 5 tests |
| FR-003 (Source-Agnostic) | isdlc.md SCENARIO 5 Step 1.1 | TG-03: 2 tests |
| FR-004 (Meta Tracking) | isdlc.md SCENARIO 5 Steps 4, 9 | TG-04: 2 tests |
| FR-005 (Phase B Consumption) | isdlc.md `start` action | TG-05: 7 tests |
| FR-006 (Artifact Unification) | isdlc.md `start` action step 6 | TG-06: 1 test |
| FR-007 (BACKLOG Restructure) | BACKLOG.md | TG-07: 6 tests |
| FR-008 (Intent Detection) | CLAUDE.md.template + CLAUDE.md | TG-08: 4 tests |
| NFR-001 (Reliability) | isdlc.md `start` action step 2 | TG-09: 5 tests |
| NFR-002 (Zero Contention) | isdlc.md SCENARIO 5 Constraints | TG-10: 3 tests |
| NFR-003 (Idempotent Intake) | isdlc.md SCENARIO 5 Step 3 | TG-11: 1 test |
| NFR-004 (Graceful Degradation) | isdlc.md SCENARIO 5 Step 1.1 | TG-12: 2 tests |
| Cross-file consistency | All 4 files | TG-14: 4 tests |
