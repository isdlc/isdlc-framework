# Impact Analysis: Quality Loop True Parallelism

**Generated**: 2026-02-15T09:15:00Z
**Feature**: Quality Loop true parallelism -- spawn Track A (testing) + Track B (automated QA) as separate sub-agents with internal parallelism via logical grouping
**Based On**: Phase 01 Requirements (finalized)
**Phase**: 02-impact-analysis
**Artifact**: REQ-0018

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | Quality Loop true parallelism -- Track A + Track B as separate sub-agents with internal parallelism | Same -- 7 FRs, 23 ACs, 4 NFRs covering parallel spawning, internal sub-grouping, logical grouping strategy, consolidated merging, iteration loop, FINAL SWEEP compat, scope detection |
| Keywords | parallel, sub-agent, Track A, Track B, grouping | parallel, sub-agent, Track A, Track B, logical grouping, task count, group, consolidation, FINAL SWEEP, iteration, circuit breaker |
| Estimated Files | 5-8 files (quick-scan) | 3-5 files (1 modified agent, 1 new test, 1-2 docs) |
| Scope Change | - | NONE |

---

## Executive Summary

This feature modifies a single agent prompt file (`16-quality-loop-engineer.md`) to replace advisory "should run in parallel" language with explicit sub-agent spawning instructions using parallel Task tool calls. The blast radius is LOW -- only one file is modified, no JavaScript code or hooks are changed, and no new agents or skills are created. The primary risk is the ZERO existing test coverage for this agent, which is mitigated by the creation of a new test file. The change follows established parallelism patterns already used by the Impact Analysis orchestrator (Phase 02) and the debate teams (REQ-0014 through REQ-0017).

**Blast Radius**: LOW (1 file modified, 1 new test file, 1 module)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 2-3 (1 modified, 1-2 new)
**Affected Modules**: 1 (quality-loop agent prompt)

---

## Impact Analysis

### Files Directly Affected

| File | Change Type | ACs Covered | Lines Affected (est.) |
|------|-------------|-------------|----------------------|
| `src/claude/agents/16-quality-loop-engineer.md` | MODIFIED | AC-001 through AC-023 | ~150-200 lines rewritten/added |
| `src/claude/hooks/tests/quality-loop-parallelism.test.cjs` | NEW | All ACs (verification) | ~200-300 lines |

### Files Indirectly Referenced (No Modification Needed)

| File | Relationship | Why No Change |
|------|-------------|---------------|
| `src/claude/agents/00-sdlc-orchestrator.md` | Delegates to quality-loop-engineer | Delegation mechanism unchanged |
| `src/claude/agents/05-software-developer.md` | Referenced by quality-loop for fix delegation | Fix delegation mechanism unchanged |
| `src/claude/hooks/lib/common.cjs` | Phase-to-agent mapping | Mapping unchanged (same agent name) |
| `src/claude/hooks/config/iteration-requirements.json` | Circuit breaker config | Config values unchanged |
| `src/claude/skills/quality-loop/parallel-track-orchestration/SKILL.md` | Skill documentation | May need minor description update |
| `docs/AGENTS.md` | Agent catalog | Description unchanged |
| `docs/ARCHITECTURE.md` | Architecture docs | No structural change |

### Outward Dependencies (What Depends on 16-quality-loop-engineer.md)

1. **sdlc-orchestrator** (Agent 00) -- delegates to Phase 16 via Task tool call. The orchestrator sends a delegation prompt; the quality-loop-engineer processes it. **No change to delegation interface.**
2. **software-developer** (Agent 05) -- receives fix requests from quality-loop-engineer during iteration. **No change to fix delegation interface.**
3. **GATE-16 checklist** -- consumed by orchestrator to verify phase completion. **Checklist items unchanged.**
4. **state.json `phases[16-quality-loop]`** -- written by quality-loop-engineer. NFR-004 adds a `parallel_execution` sub-field for track-level timing. **Additive change only (backward compatible).**

### Inward Dependencies (What 16-quality-loop-engineer.md Depends On)

1. **state.json `active_workflow.implementation_loop_state`** -- read for FINAL SWEEP mode detection. **No change.**
2. **iteration-requirements.json `16-quality-loop`** -- read for circuit breaker thresholds. **No change.**
3. **Task tool** -- used to spawn sub-agents. **Already available, no new capability needed.**
4. **Project tooling** (npm test, eslint, etc.) -- detected at runtime. **No change.**

### Change Propagation Analysis

```
16-quality-loop-engineer.md
  |
  +-- [MODIFIED] Parallel Execution Protocol section
  |     +-- Track A: explicit Task tool call with full prompt
  |     +-- Track B: explicit Task tool call with full prompt
  |     +-- Both launched in single response (parallel)
  |
  +-- [ADDED] Grouping Strategy section
  |     +-- Lookup table: Groups A1, A2, A3, B1, B2
  |     +-- Two modes: logical grouping (default) + task count
  |
  +-- [MODIFIED] Consolidation section
  |     +-- Group-level result merging
  |     +-- Parallel Execution Summary in quality-report.md
  |
  +-- [MODIFIED] Iteration Loop
  |     +-- Both tracks re-run in parallel after fixes
  |
  +-- [MODIFIED] Task List section
  |     +-- Explicit parallel Task tool call instructions
  |
  +-- [MODIFIED] FINAL SWEEP Mode section
  |     +-- Grouping strategy applied to FINAL SWEEP checks
  |
  +-- [MODIFIED] State Tracking section
        +-- parallel_execution extended with track timing + groups
```

Propagation stops at the agent prompt boundary. No cascading changes to hooks, JavaScript, or other agents.

---

## Entry Points

### Existing Entry Points (Relevant to Feature)

| Entry Point | Location | ACs | Notes |
|-------------|----------|-----|-------|
| Parallel Execution Protocol | Lines 127-211 | AC-001 to AC-008 | Core section to rewrite with explicit parallel spawning |
| Task List | Lines 243-255 | AC-001 | "Tasks [2] and [3] should run in parallel" -- needs explicit mechanism |
| Consolidation | Lines 203-211 | AC-013 to AC-015 | Update for group-level result merging |
| FINAL SWEEP Mode | Lines 38-100 | AC-019 to AC-021 | Add grouping strategy awareness |
| Parallel Test Execution | Lines 147-201 | AC-022 to AC-023 | Already exists -- integrate with Track A internal parallelism |
| Parallel Execution State Tracking | Lines 175-192 | NFR-004 | Extend with track timing and group composition |

### New Sections to Create

| Section | Purpose | ACs |
|---------|---------|-----|
| Grouping Strategy Lookup Table | Define Group A1/A2/A3 and Group B1/B2 | AC-009 to AC-012 |
| Internal Track Parallelism Guidance | Instruct each track to optionally spawn sub-groups | AC-005 to AC-008 |
| Parallel Execution Summary Template | Template for quality-report.md | AC-015 |

### Implementation Chain

```
Agent Prompt (16-quality-loop-engineer.md)
  |
  +-- Grouping Strategy Table (new)          [FR-003]
  +-- Track A Definition (rewritten)         [FR-001, FR-002, FR-007]
  +-- Track B Definition (rewritten)         [FR-001, FR-002]
  +-- Consolidation Logic (updated)          [FR-004]
  +-- Iteration Loop (updated)               [FR-005]
  +-- FINAL SWEEP Compatibility (updated)    [FR-006]
  +-- Task List (updated)                    [FR-001]
  +-- State Tracking (extended)              [NFR-004]
```

No data layer. No API layer. No hook layer. Pure prompt engineering.

### Recommended Implementation Order

| Priority | Module | Description | Dependencies |
|----------|--------|-------------|-------------|
| M1 | Grouping Strategy Table | Define lookup table with Group A1/A2/A3 and B1/B2 | None (foundational) |
| M2 | Parallel Track Spawning | Rewrite Track A + B to use explicit parallel Task tool calls | M1 (references groups) |
| M3 | Internal Sub-Grouping | Add guidance for internal parallelism within each track | M1 (uses group definitions) |
| M4 | Consolidated Result Merging | Update consolidation for group-level results + summary template | M2, M3 (needs track structure) |
| M5 | Iteration Loop Update | Ensure both tracks re-run in parallel after fixes | M2 (uses parallel spawning) |
| M6 | FINAL SWEEP Compatibility | Apply grouping strategy to FINAL SWEEP mode | M1 (uses group definitions) |
| M7 | Scope Detection + State Tracking | Integrate scope detection with Track A + extend state schema | M2 (uses track structure) |

---

## Risk Assessment

### Test Coverage Analysis

| File | Existing Tests | Coverage | Risk |
|------|---------------|----------|------|
| `src/claude/agents/16-quality-loop-engineer.md` | 0 test files | 0% | MEDIUM -- no regression safety net |

**Coverage Gap**: The quality-loop-engineer agent has ZERO existing tests in `src/claude/hooks/tests/`. This is the primary risk mitigant gap. The new test file (`quality-loop-parallelism.test.cjs`) will be created during Phase 05/06 to verify prompt content.

### Complexity Analysis

| Factor | Assessment | Notes |
|--------|-----------|-------|
| Architectural Complexity | LOW | Single-file prompt change, no structural changes |
| Integration Complexity | LOW | No new inter-agent contracts, no new hooks |
| Behavioral Complexity | LOW-MEDIUM | Parallel spawning is well-established but consolidation logic needs care |
| Testing Complexity | LOW | Prompt content verification (string matching), well-established pattern |

### Technical Debt Assessment

| Debt Item | Location | Severity | Impact on Feature |
|-----------|----------|----------|-------------------|
| "Tasks [2] and [3] should run in parallel" (advisory only) | Line 255 | MEDIUM | This IS the debt being resolved |
| No existing tests for quality-loop agent | tests/ directory | MEDIUM | New tests created as part of feature |
| `parallel_execution` state field partially defined | Lines 179-192 | LOW | Extended with track/group data per NFR-004 |

### Risk Zones

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Prompt change breaks sequential fallback path | LOW | MEDIUM | Test both parallel and sequential paths |
| Grouping strategy incompatible with FINAL SWEEP | LOW | LOW | AC-019 through AC-021 explicitly cover this |
| Internal sub-grouping adds no measurable speedup | MEDIUM | LOW | FR-002 uses MAY (optional), not MUST |
| Circuit breaker interaction with parallel re-run | LOW | MEDIUM | AC-018 explicitly references iteration-requirements.json |
| State schema additive change breaks hook readers | VERY LOW | LOW | No hooks read `test_results.parallel_execution` |

### Risk Recommendations Per Acceptance Criterion

| AC | Risk | Recommendation |
|----|------|---------------|
| AC-001 to AC-004 | LOW | Follow established pattern from Phase 02 (impact-analysis-orchestrator uses same parallel Task pattern) |
| AC-005 to AC-008 | LOW | Advisory guidance (MAY) -- test that prompt includes grouping instructions |
| AC-009 to AC-012 | LOW | Verify lookup table is well-formatted markdown; test for table presence |
| AC-013 to AC-015 | LOW | Verify consolidation template includes group-level breakdown |
| AC-016 to AC-018 | LOW-MEDIUM | Critical to test: both tracks must re-run, not just failing track |
| AC-019 to AC-021 | LOW | Verify FINAL SWEEP exclusion list still applies with grouping |
| AC-022 to AC-023 | LOW | Verify scope detection thresholds (50+ files, 10 file minimum) |

### Recommended Test Additions Before Implementation

1. Create `src/claude/hooks/tests/quality-loop-parallelism.test.cjs` with tests for:
   - Prompt contains explicit parallel Task tool call instructions
   - Grouping strategy lookup table is present and correctly formatted
   - Both Track A and Track B have full prompt definitions
   - Consolidation section references group-level results
   - Iteration loop specifies parallel re-execution of both tracks
   - FINAL SWEEP mode is compatible with grouping strategy
   - State tracking schema includes track-level timing fields
   - Scope detection thresholds are documented

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: M1 (Grouping Strategy) -> M2 (Parallel Spawning) -> M3 (Internal Sub-Grouping) -> M4 (Consolidation) -> M5 (Iteration Loop) -> M6 (FINAL SWEEP) -> M7 (Scope + State)
2. **High-Risk Areas**: Zero existing tests -- create test file first (ATDD approach per Constitution Article II)
3. **Dependencies to Resolve**: None -- all dependencies are read-only and unchanged
4. **Precedent**: The parallel Task tool call pattern is well-established:
   - Phase 02 Impact Analysis (M1/M2/M3 parallel sub-agents)
   - REQ-0014/0015/0016 debate loops (Creator/Critic/Refiner parallel in later iterations)
   - REQ-0017 Implementation Team (Writer/Reviewer/Updater)

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-15T09:15:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0018-quality-loop-true-parallelism/requirements-spec.md",
  "quick_scan_used": "N/A (Phase 00 summary only, no quick-scan.md artifact)",
  "scope_change_from_original": "none",
  "requirements_keywords": ["parallel", "sub-agent", "Track A", "Track B", "logical grouping", "task count", "consolidation", "FINAL SWEEP", "iteration", "circuit breaker", "quality-loop"],
  "files_directly_affected": 2,
  "modules_affected": 1,
  "risk_level": "low-medium",
  "blast_radius": "low",
  "coverage_gaps": 1
}
```
