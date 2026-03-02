# Impact Analysis: Multi-agent Implementation Team

**Generated**: 2026-02-15T02:10:00Z
**Feature**: Writer/Reviewer/Updater per-file debate loop for Phase 06 implementation
**Based On**: Phase 01 Requirements (finalized) -- 7 FRs, 34 ACs, 4 NFRs
**Phase**: 02-impact-analysis
**REQ ID**: REQ-0017

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | Writer/Reviewer/Updater per-file debate loop for Phase 06 | 7 FRs covering Reviewer (8 checks), Updater (fix/dispute), per-file loop, Writer awareness, phase restructuring, IMPLEMENTATION_ROUTING, edge cases |
| Keywords | Writer, Reviewer, Updater, per-file loop, DEBATE_ROUTING | IMPLEMENTATION_ROUTING, WRITER_CONTEXT, verdict PASS/REVISE, BLOCKING/WARNING/INFO, implementation_loop_state, final sweep, human review |
| Estimated Files | 8-14 files (2-4 new) | 12 files (2 new agents + 4 modified agents + 1 config + 5 new tests) |
| Scope Change | - | REFINED (same boundary, more precise definitions) |

---

## Executive Summary

This feature introduces a fundamentally different debate pattern into Phase 06 (implementation): a per-file Writer/Reviewer/Updater loop that reviews each file immediately after writing, replacing the current batch approach where all code is written first and reviewed later in Phases 16/08. The blast radius is MEDIUM, touching 7 existing files across 3 modules (agents, config, tests) and adding 7 new files (2 agents, 5 tests). The primary risk is the phase restructuring (FR-005) which narrows the scope of Phases 16 and 08 -- this is a semantic change that must preserve backward compatibility when debate_mode is disabled (NFR-002). The IMPLEMENTATION_ROUTING table is intentionally separate from DEBATE_ROUTING because the loop pattern is per-file rather than per-artifact. The orchestrator file (00-sdlc-orchestrator.md, already 1478 lines) will grow by approximately 150-200 lines, making it the highest complexity target.

**Blast Radius**: MEDIUM (12 files, 3 modules)
**Risk Level**: MEDIUM
**Affected Files**: 12 (7 existing + 5 new, but 2 of the "new" are agent files counted separately)
**Affected Modules**: 3 (agents, hooks/config, hooks/tests)

---

## Impact Analysis

### M1: Files Directly Affected

#### New Files (7)

| # | File | Type | Purpose | Size Estimate | Traces To |
|---|------|------|---------|---------------|-----------|
| 1 | `src/claude/agents/05-implementation-reviewer.md` | Agent | Per-file Reviewer with 8 check categories | 200-300 lines | FR-001 (AC-001-01..AC-001-08) |
| 2 | `src/claude/agents/05-implementation-updater.md` | Agent | Targeted fix applicator with test re-run | 200-300 lines | FR-002 (AC-002-01..AC-002-06) |
| 3 | `src/claude/hooks/tests/implementation-debate-reviewer.test.cjs` | Test | Verify Reviewer agent prompt content | ~120 lines | FR-001 |
| 4 | `src/claude/hooks/tests/implementation-debate-updater.test.cjs` | Test | Verify Updater agent prompt content | ~120 lines | FR-002 |
| 5 | `src/claude/hooks/tests/implementation-debate-orchestrator.test.cjs` | Test | Verify IMPLEMENTATION_ROUTING + loop protocol | ~150 lines | FR-003, FR-006 |
| 6 | `src/claude/hooks/tests/implementation-debate-writer.test.cjs` | Test | Verify Writer awareness in software-developer | ~100 lines | FR-004 |
| 7 | `src/claude/hooks/tests/implementation-debate-integration.test.cjs` | Test | Cross-agent integration: phase restructuring, backward compat | ~130 lines | FR-005, FR-007, NFR-002 |

#### Modified Files (5)

| # | File | Current Size | Change Type | Lines Added/Modified | Traces To |
|---|------|-------------|-------------|---------------------|-----------|
| 8 | `src/claude/agents/00-sdlc-orchestrator.md` | 1478 lines | ADD section | +150-200 lines (IMPLEMENTATION_ROUTING table + per-file loop protocol after Section 7.5) | FR-003, FR-006, FR-007 |
| 9 | `src/claude/agents/05-software-developer.md` | 860 lines | ADD section | +50-80 lines (WRITER_CONTEXT Mode Detection section near top) | FR-004 |
| 10 | `src/claude/agents/16-quality-loop-engineer.md` | 230 lines | MODIFY scope | ~30-50 lines modified (narrow to "final sweep" -- batch checks only) | FR-005 (AC-005-01, AC-005-02) |
| 11 | `src/claude/agents/07-qa-engineer.md` | 211 lines | MODIFY scope | ~30-50 lines modified (narrow to "human review only" scope) | FR-005 (AC-005-03, AC-005-04) |
| 12 | `src/claude/hooks/config/iteration-requirements.json` | ~800 lines | ADD entries | +20-30 lines (config entries for new reviewer/updater agents) | NFR-004 |

### Dependency Map

#### Outward Dependencies (what depends on affected files)

```
00-sdlc-orchestrator.md
  <- ALL phase agents (delegation source)
  <- All active workflows (state management)
  <- gate-blocker.cjs (reads phase status)

05-software-developer.md
  <- Phase 06 implementation workflows
  <- fix workflows (06-implementation phase)
  <- test-generate workflows

16-quality-loop-engineer.md
  <- All workflows that include Phase 16
  <- Orchestrator (delegates to this agent)

07-qa-engineer.md
  <- All workflows that include Phase 08
  <- Orchestrator (delegates to this agent)

iteration-requirements.json
  <- gate-blocker.cjs hook
  <- All phase gate validations
```

#### Inward Dependencies (what affected files depend on)

```
05-implementation-reviewer.md (NEW)
  <- Depends on: state.json (tech stack), constitution (articles I, II, V, VII)
  <- Receives: file path + file content from orchestrator

05-implementation-updater.md (NEW)
  <- Depends on: Reviewer output format (verdict, findings list)
  <- Receives: file path, findings, BLOCKING/WARNING list from orchestrator

00-sdlc-orchestrator.md
  <- Depends on: state.json, iteration-requirements.json
  <- Depends on: All agent files it delegates to

05-software-developer.md
  <- Depends on: state.json, design specs, test strategy
  <- Receives: WRITER_CONTEXT from orchestrator (new dependency)
```

### Change Propagation Paths

1. **Orchestrator -> New Agents**: Orchestrator adds IMPLEMENTATION_ROUTING, delegates to Reviewer/Updater. No cascading impact beyond the loop.
2. **Orchestrator -> Software Developer**: Orchestrator passes WRITER_CONTEXT when debate_mode is true. Software developer responds by producing files sequentially.
3. **Phase 16 Scope Change -> Existing Workflows**: When debate_mode is true, Phase 16 narrows to batch-only checks. When false, Phase 16 is unchanged (NFR-002).
4. **Phase 08 Scope Change -> Existing Workflows**: When debate_mode is true, Phase 08 narrows to human review. When false, Phase 08 is unchanged (NFR-002).

---

## Entry Points

### M2: Implementation Entry Points

#### Existing Entry Points Affected

| # | Entry Point | File | How Affected |
|---|------------|------|-------------|
| 1 | Section 7.5 DEBATE LOOP ORCHESTRATION | `00-sdlc-orchestrator.md` line ~1018 | New Section 7.6 IMPLEMENTATION LOOP ORCHESTRATION must be added after this section |
| 2 | Agent Delegation Table | `00-sdlc-orchestrator.md` line ~980 | IMPLEMENTATION_ROUTING references must be added or noted |
| 3 | Phase 06 delegation path | `00-sdlc-orchestrator.md` line ~989 | Currently delegates to `software-developer` unconditionally; must now check debate_mode and route to IMPLEMENTATION_ROUTING |
| 4 | Top of software-developer agent | `05-software-developer.md` line ~22 | Add WRITER_CONTEXT Mode Detection (like DEBATE_CONTEXT in requirements-analyst) |
| 5 | Phase 16 scope definition | `16-quality-loop-engineer.md` lines ~19-80 | Narrow scope when debate_mode is true; add conditional behavior |
| 6 | Phase 08 scope definition | `07-qa-engineer.md` lines ~33-68 | Narrow review checklist when debate_mode is true; add conditional behavior |

#### New Entry Points to Create

| # | Entry Point | File | Purpose |
|---|------------|------|---------|
| 1 | Reviewer agent file | `05-implementation-reviewer.md` | Entire file is new; entry point for per-file review delegation |
| 2 | Updater agent file | `05-implementation-updater.md` | Entire file is new; entry point for fix application delegation |
| 3 | IMPLEMENTATION_ROUTING table | `00-sdlc-orchestrator.md` (new section ~7.6) | Routing table parallel to DEBATE_ROUTING but for per-file pattern |
| 4 | Per-file loop protocol | `00-sdlc-orchestrator.md` (new section ~7.6) | Step-by-step: Writer->Reviewer->Updater cycle per file |
| 5 | implementation_loop_state | `00-sdlc-orchestrator.md` (new section ~7.6) | State tracking schema for per-file loop progress |

#### Implementation Chain (Entry to Data Layer)

```
User invokes /isdlc feature
  -> Orchestrator initializes workflow
    -> Phase 06 reached
      -> Check debate_mode (resolveDebateMode())
        -> IF true: IMPLEMENTATION_ROUTING lookup
          -> Initialize implementation_loop_state in state.json
          -> FOR each file in task plan:
            -> Delegate to Writer (software-developer + WRITER_CONTEXT)
            -> Writer produces file
            -> Delegate to Reviewer (implementation-reviewer)
            -> IF verdict == PASS: next file
            -> IF verdict == REVISE: Delegate to Updater (implementation-updater)
              -> Updater fixes file + re-runs tests
              -> Loop back to Reviewer (max 3 cycles)
            -> Update implementation_loop_state
          -> Produce per-file-loop-summary.md
        -> IF false: Delegate to software-developer as today (no change)
    -> Phase 16 reached
      -> IF debate_mode was true: "final sweep" scope (batch only)
      -> IF debate_mode was false: full scope (unchanged)
    -> Phase 08 reached
      -> IF debate_mode was true: "human review only" scope
      -> IF debate_mode was false: full scope (unchanged)
```

#### Recommended Implementation Order

| Order | Module | File | Rationale |
|-------|--------|------|-----------|
| M1 | Reviewer Agent | `05-implementation-reviewer.md` | Standalone, no dependencies. Establishes output format used by Updater. |
| M2 | Updater Agent | `05-implementation-updater.md` | Standalone, depends on Reviewer output format (defined in M1). |
| M3 | Writer Awareness | `05-software-developer.md` | Modify only. Adds WRITER_CONTEXT section. Does not depend on loop logic. |
| M4 | Orchestrator Routing | `00-sdlc-orchestrator.md` | Most complex change. Depends on M1/M2 agent file paths. Adds IMPLEMENTATION_ROUTING + loop protocol. |
| M5 | Phase 16 Adjustment | `16-quality-loop-engineer.md` | Scope narrowing. Depends on M4 for semantic clarity of what Phase 06 now covers. |
| M6 | Phase 08 Adjustment | `07-qa-engineer.md` | Scope narrowing. Depends on M4 for semantic clarity. |
| M7 | Config Update | `iteration-requirements.json` | Add entries for new agents. Depends on M1/M2 for agent names. |

---

## Risk Assessment

### M3: Risk Analysis

#### Test Coverage Gaps in Affected Modules

| File | Existing Test Coverage | Risk |
|------|----------------------|------|
| `00-sdlc-orchestrator.md` | PARTIAL -- debate-orchestrator-loop.test.cjs covers DEBATE_ROUTING only; no coverage for IMPLEMENTATION_ROUTING (new) | MEDIUM |
| `05-software-developer.md` | NONE -- no test file exists for this agent | HIGH |
| `16-quality-loop-engineer.md` | NONE -- no test file exists for this agent | HIGH |
| `07-qa-engineer.md` | NONE -- no test file exists for this agent | HIGH |
| `iteration-requirements.json` | PARTIAL -- gate-blocker tests validate schema but not new agent entries | LOW |
| `05-implementation-reviewer.md` (NEW) | N/A -- will have dedicated test file | LOW |
| `05-implementation-updater.md` (NEW) | N/A -- will have dedicated test file | LOW |

**Coverage gap count**: 3 files with zero test coverage (software-developer, quality-loop-engineer, qa-engineer)

#### Complexity Hotspots

| Hotspot | Metric | Risk | Mitigation |
|---------|--------|------|-----------|
| `00-sdlc-orchestrator.md` | 1478 lines, will grow to ~1650-1680 | HIGH | New section (7.6) is self-contained. Use same structure as Section 7.5. |
| Per-file loop protocol | New loop pattern (no precedent in codebase) | MEDIUM | Follow DEBATE_ROUTING pattern for state management. Well-defined in requirements (FR-003, 7 ACs). |
| Phase restructuring (FR-005) | Semantic change to 2 existing phases | MEDIUM | Conditional behavior gated on debate_mode. NFR-002 requires backward compat. |
| Phase key naming | Orchestrator uses both `05-implementation` and `06-implementation` | LOW | Existing inconsistency. This feature uses `06-implementation` consistently (per state.json). |

#### Technical Debt Markers

| Debt Item | Location | Impact on This Feature |
|-----------|----------|----------------------|
| No tests for software-developer agent | `src/claude/hooks/tests/` | Must add tests for WRITER_CONTEXT awareness. New test file addresses this partially. |
| No tests for quality-loop-engineer agent | `src/claude/hooks/tests/` | Must add tests for "final sweep" scope. Integration test file addresses this. |
| No tests for qa-engineer agent | `src/claude/hooks/tests/` | Must add tests for "human review only" scope. Integration test file addresses this. |
| Orchestrator file size (1478 lines) | `00-sdlc-orchestrator.md` | Adding ~150-200 lines increases prompt size. Monitor for context window pressure. |
| Phase key naming inconsistency | `00-sdlc-orchestrator.md` | Minor. Use `06-implementation` consistently in IMPLEMENTATION_ROUTING. |

#### Risk Zones (Breaking Changes x Low Coverage)

| Risk Zone | Severity | Description |
|-----------|----------|-------------|
| Phase 16 scope narrowing + zero test coverage | HIGH | Phase 16 behavior changes when debate_mode=true, but no existing tests to catch regressions. New integration tests MUST cover both debate_mode=true and debate_mode=false paths. |
| Phase 08 scope narrowing + zero test coverage | HIGH | Same as above for Phase 08. |
| IMPLEMENTATION_ROUTING in orchestrator + partial test coverage | MEDIUM | Orchestrator DEBATE_ROUTING tests exist but IMPLEMENTATION_ROUTING is entirely new. Must verify they don't interfere with each other. |

#### Risk Recommendations

1. **Add tests for Phase 16/08 backward compatibility BEFORE modifying scopes** -- The integration test file (implementation-debate-integration.test.cjs) should verify that when debate_mode=false, Phase 16 and 08 behavior descriptions are unchanged from current baseline.
2. **Test IMPLEMENTATION_ROUTING isolation from DEBATE_ROUTING** -- The orchestrator test file should verify that DEBATE_ROUTING entries remain unchanged and that IMPLEMENTATION_ROUTING only activates for Phase 06.
3. **Verify WRITER_CONTEXT conditional behavior** -- Writer awareness tests must verify AC-004-02 (no regression when WRITER_CONTEXT absent).
4. **Monitor orchestrator file size** -- At ~1650+ lines after this feature, consider if the orchestrator needs structural refactoring in a future REQ. Not blocking for this feature.

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: M1 (Reviewer) -> M2 (Updater) -> M3 (Writer awareness) -> M4 (Orchestrator routing) -> M5 (Phase 16 adjustment) -> M6 (Phase 08 adjustment) -> M7 (Config)
2. **High-Risk Areas**: Phase 16 and Phase 08 scope changes (zero existing test coverage + semantic change). Add backward compatibility tests in implementation-debate-integration.test.cjs FIRST.
3. **Dependencies to Resolve**: Reviewer output format (verdict + findings schema) must be defined in M1 before M2 (Updater) and M4 (Orchestrator) can reference it.
4. **Pattern Precedent**: Follow the established debate team file naming (`05-implementation-{role}.md`) and test naming (`implementation-debate-{role}.test.cjs`) per NFR-003.
5. **Key Design Decision**: IMPLEMENTATION_ROUTING is intentionally SEPARATE from DEBATE_ROUTING (AC-006-03) because the per-file loop is fundamentally different from the per-artifact debate loop.

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-15T02:10:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0017-multi-agent-implementation-team/requirements-spec.md",
  "quick_scan_used": "docs/requirements/REQ-0017-multi-agent-implementation-team/quick-scan.md",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["writer", "reviewer", "updater", "per-file loop", "implementation team", "debate", "phase restructuring", "final sweep", "human review", "IMPLEMENTATION_ROUTING", "WRITER_CONTEXT"],
  "files_directly_affected": 12,
  "modules_affected": 3,
  "risk_level": "medium",
  "blast_radius": "medium",
  "coverage_gaps": 3
}
```
