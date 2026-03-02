# Impact Analysis: Multi-Agent Architecture Team

**Generated**: 2026-02-14T21:15:00Z
**Feature**: Architecture Critic/Refiner debate loop for Phase 03, generalized debate engine, Creator awareness for solution-architect
**Based On**: Phase 01 Requirements (finalized -- 7 FRs, 33 ACs, 4 NFRs)
**Phase**: 02-impact-analysis
**Prior Art**: REQ-0014 (Multi-Agent Requirements Team -- identical pattern for Phase 01)

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | Creator/Critic/Refiner debate loop for Phase 03 architecture design | Architecture Critic (8 ACs: NFR alignment, STRIDE, DB design, tech justification, SPOF, observability, coupling, cost), Refiner (8 ACs), Generalized Debate Engine (5 ACs), Creator Awareness (2 ACs), Phase-Specific Agent Routing (4 ACs), Debate Artifacts (3 ACs), Edge Cases (3 ACs) |
| Keywords | debate, creator, critic, refiner, architecture | debate, critic, refiner, architecture, STRIDE, NFR alignment, SPOF, observability, coupling, cost, ADR, convergence, agent routing |
| Estimated Files | 6-10 files, 2 new | 5 files modified/created, 4-6 test files |
| Scope Change | - | REFINED (same scope, more precise ACs) |

---

## Executive Summary

This feature extends the Creator/Critic/Refiner debate pattern (established in REQ-0014 for Phase 01 requirements) to Phase 03 architecture design. The implementation requires 2 new agent files (architecture critic and refiner), modifications to 3 existing files (orchestrator debate loop generalization, solution-architect Creator awareness, isdlc command descriptions), and approximately 4-6 new test files. The blast radius is **MEDIUM** because the orchestrator's debate loop section must be refactored from Phase 01-only to a generalized multi-phase engine, which is the single most complex change. Risk is **LOW-MEDIUM** because REQ-0014 provides a complete structural template -- approximately 85% of the work is markdown/prompt content following established patterns, with only 15% being JS test code.

**Blast Radius**: MEDIUM (5 source files, 3 modules, plus 4-6 test files)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 5 source files (2 new, 3 modified) + 4-6 test files
**Affected Modules**: 3 (agents, commands, tests)

---

## Impact Analysis

### Files Directly Affected

| # | File | Action | Requirements | Change Description |
|---|------|--------|-------------|-------------------|
| 1 | `src/claude/agents/02-architecture-critic.md` | NEW | FR-001 (8 ACs) | Architecture Critic agent. Modeled on `01-requirements-critic.md` but with architecture-specific checks: NFR misalignment, STRIDE threat model completeness, database design review, tech stack justification, SPOF identification, observability gaps, coupling contradictions, cost implications. |
| 2 | `src/claude/agents/02-architecture-refiner.md` | NEW | FR-002 (8 ACs) | Architecture Refiner agent. Modeled on `01-requirements-refiner.md` but addressing architecture-specific findings: ADR completion, security hardening, HA adjustments, cost optimization, observability architecture. Must not remove existing decisions. |
| 3 | `src/claude/agents/00-sdlc-orchestrator.md` | MODIFY | FR-003 (5 ACs), FR-005 (4 ACs), FR-007 (3 ACs) | **Most complex change.** Refactor Section 7.5 "DEBATE LOOP ORCHESTRATION (Phase 01 Only)" to a generalized debate engine supporting both Phase 01 and Phase 03. Add phase-specific agent routing table. Update debate mode resolution to apply for Phase 03. Add Phase 03-specific edge case handling. |
| 4 | `src/claude/agents/02-solution-architect.md` | MODIFY | FR-004 (2 ACs) | Add DEBATE_CONTEXT handling (Creator role awareness). When debate mode active: include self-assessment section in architecture-overview.md with known trade-offs, uncertainty areas, open questions. When no debate: unchanged behavior. |
| 5 | `src/claude/commands/isdlc.md` | MODIFY | FR-003 | Update debate flag descriptions from "multi-agent requirements team" to cover both phases. Minor text changes to table descriptions and comments. |

### Outward Dependencies (What Depends on Modified Files)

| Modified File | Dependents | Impact |
|--------------|-----------|--------|
| `00-sdlc-orchestrator.md` | All phase agents (indirectly), 18 existing debate tests | Debate loop generalization must preserve Phase 01 behavior exactly (NFR-003). Existing tests must still pass. |
| `02-solution-architect.md` | Downstream phases (03-system-designer, 04-test-design-engineer) | No structural change to output artifacts. Self-assessment section is additive only. |
| `isdlc.md` | CLI users, orchestrator init | Flag descriptions change only; no behavioral change. |

### Inward Dependencies (What Modified Files Depend On)

| Modified File | Dependencies | Impact |
|--------------|-------------|--------|
| `02-architecture-critic.md` (NEW) | Phase 03 artifacts (architecture-overview.md, tech-stack-decision.md, database-design.md, security-architecture.md, ADRs) | Must understand all Phase 03 artifact formats. |
| `02-architecture-refiner.md` (NEW) | Phase 03 artifacts + critic's round-N-critique.md | Must be able to modify all Phase 03 artifacts. |
| `00-sdlc-orchestrator.md` | New critic/refiner agents, existing analyst/critic/refiner | Must route to correct agents based on current_phase. |

### Change Propagation Paths

```
isdlc.md (flag descriptions)
    |
    v
00-sdlc-orchestrator.md (debate loop generalization)
    |
    +---> 02-solution-architect.md (Creator with DEBATE_CONTEXT)
    |         |
    |         v
    |     Phase 03 artifacts (architecture-overview.md + self-assessment)
    |
    +---> 02-architecture-critic.md (NEW) (reviews Phase 03 artifacts)
    |         |
    |         v
    |     round-{N}-critique.md
    |
    +---> 02-architecture-refiner.md (NEW) (improves Phase 03 artifacts)
              |
              v
          Updated Phase 03 artifacts + change log
```

---

## Entry Points

### Existing Entry Points Affected

| Entry Point | File | How Affected |
|------------|------|-------------|
| Debate Mode Resolution | `00-sdlc-orchestrator.md` Section 7.5, Step 1 | Must apply to Phase 03 in addition to Phase 01. The `resolveDebateMode()` pseudocode itself is unchanged, but the section header and conditional delegation must be generalized. |
| Debate Conditional Delegation | `00-sdlc-orchestrator.md` Section 7.5, Step 2 | Must add Phase 03 delegation path alongside Phase 01. |
| Creator Delegation | `00-sdlc-orchestrator.md` Section 7.5, Step 3 | Must route to `02-solution-architect.md` when current_phase is `03-architecture`. |
| Critic-Refiner Loop | `00-sdlc-orchestrator.md` Section 7.5, Step 4 | Must route to `02-architecture-critic.md` / `02-architecture-refiner.md` for Phase 03. |
| Debate Flag Parsing | `src/claude/commands/isdlc.md` | Description updates only; no logic change. |

### New Entry Points to Create

| Entry Point | File | Purpose |
|------------|------|---------|
| Architecture Critic Agent | `src/claude/agents/02-architecture-critic.md` | Invoked by orchestrator to review Phase 03 artifacts. 8 mandatory check categories. |
| Architecture Refiner Agent | `src/claude/agents/02-architecture-refiner.md` | Invoked by orchestrator to improve Phase 03 artifacts based on critique. |
| Creator DEBATE_CONTEXT Handler | `src/claude/agents/02-solution-architect.md` (new section) | Invocation protocol + debate mode behavior section, modeled on `01-requirements-analyst.md` lines 19-99. |

### Implementation Chain (Entry to Data Layer)

```
CLI (/isdlc feature --debate)
  -> isdlc.md (parse flags)
    -> 00-sdlc-orchestrator.md (resolve debate mode)
      -> Phase routing table:
           Phase 01: 01-requirements-analyst -> 01-requirements-critic -> 01-requirements-refiner
           Phase 03: 02-solution-architect   -> 02-architecture-critic -> 02-architecture-refiner
      -> State: .isdlc/state.json (debate_state, rounds_history)
      -> Artifacts: docs/requirements/{artifact-folder}/ (round-N-critique.md, debate-summary.md)
```

### Recommended Implementation Order

| Order | Module | Rationale |
|-------|--------|-----------|
| 1 | Generalize orchestrator debate loop (FR-003, FR-005) | Foundation -- all other changes depend on the orchestrator routing correctly. |
| 2 | Create architecture critic agent (FR-001) | Can be done in parallel with #3. Direct analog of `01-requirements-critic.md`. |
| 3 | Create architecture refiner agent (FR-002) | Can be done in parallel with #2. Direct analog of `01-requirements-refiner.md`. |
| 4 | Add Creator awareness to solution-architect (FR-004) | Depends on understanding the DEBATE_CONTEXT format from #1. |
| 5 | Update isdlc.md command descriptions (FR-003) | Minor -- text-only changes. |
| 6 | Debate artifacts naming + edge cases (FR-006, FR-007) | Integrated into #1-#4 but verified separately. |
| 7 | Tests | After implementation to verify prompt content. |

---

## Risk Assessment

### Test Coverage for Affected Files

| File | Existing Tests | Coverage | Gap |
|------|---------------|----------|-----|
| `00-sdlc-orchestrator.md` | 18 debate loop tests (`debate-orchestrator-loop.test.cjs`) | Phase 01 debate loop fully tested | No Phase 03 routing tests exist |
| `02-solution-architect.md` | 0 debate-mode tests | 0% debate coverage | No DEBATE_CONTEXT handling tests |
| `01-requirements-critic.md` | 14 tests (`debate-critic-agent.test.cjs`) | Phase 01 critic fully tested | N/A (reference only) |
| `01-requirements-refiner.md` | 10 tests (`debate-refiner-agent.test.cjs`) | Phase 01 refiner fully tested | N/A (reference only) |
| `isdlc.md` | 10 tests (`debate-flag-parsing.test.cjs`) | Flag parsing tested | Descriptions not tested |
| `02-architecture-critic.md` (NEW) | 0 tests | 0% | All tests needed |
| `02-architecture-refiner.md` (NEW) | 0 tests | 0% | All tests needed |

### Complexity Hotspots

| File | Complexity | Reason |
|------|-----------|--------|
| `00-sdlc-orchestrator.md` | **HIGH** | Largest file in the codebase (~1400 lines). Section 7.5 is ~160 lines of pseudocode that must be refactored without breaking Phase 01 behavior. Phase-specific agent routing adds conditional logic. |
| `02-architecture-critic.md` (NEW) | **MEDIUM** | 8 mandatory check categories with domain-specific architecture knowledge (STRIDE, database normalization, SPOF detection, cost analysis). More complex than the 5-check requirements critic. |
| `02-architecture-refiner.md` (NEW) | **MEDIUM** | 8 fix strategies for architecture-specific findings. Must preserve existing architectural decisions (AC-002-07). |
| `02-solution-architect.md` | **LOW** | Additive change only -- add DEBATE_CONTEXT detection and self-assessment section. |
| `isdlc.md` | **LOW** | Text description updates only. |

### Technical Debt Markers

| Area | Debt | Impact on This Feature |
|------|------|----------------------|
| Orchestrator Section 7.5 heading says "Phase 01 Only" | Must be renamed | Direct requirement (AC-003-05) |
| Hardcoded agent paths in orchestrator (`01-requirements-critic.md`, `01-requirements-refiner.md`) | Must be generalized to a routing table | Core of FR-005 |
| Existing debate tests reference Phase 01 agents by name | Tests are Phase 01-specific, not generalizable | New tests needed for Phase 03; existing tests preserved |
| No debate-mode tests for solution-architect | 0% coverage gap | FR-004 tests must be added |

### Risk Zones (Intersection of Complexity + Low Coverage)

| Risk Zone | Files | Severity | Mitigation |
|-----------|-------|----------|------------|
| Orchestrator debate loop refactoring | `00-sdlc-orchestrator.md` | **MEDIUM** | Existing 18 tests serve as regression guard for Phase 01. Add Phase 03-specific routing tests before modifying. |
| Architecture critic checks | `02-architecture-critic.md` (NEW) | **LOW** | Template from `01-requirements-critic.md` reduces novelty risk. Test each of 8 check categories. |
| Backward compatibility | All modified files | **LOW** | NFR-003 explicitly requires no regression. Existing 90 debate tests cover Phase 01 path. |

### Recommendations

1. **Add orchestrator routing tests FIRST** -- Before modifying Section 7.5, add tests that verify Phase 01 agent routing still works correctly after generalization.
2. **Use REQ-0014 as structural template** -- All new files should follow the exact structure of their Phase 01 analogs (NFR-002).
3. **Test each critic check category independently** -- The 8 architecture-specific checks in FR-001 are the most novel content; each needs dedicated test coverage.
4. **Preserve existing debate test suite** -- All 90 existing tests from REQ-0014 must continue passing (NFR-003).

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: Orchestrator generalization (foundation) -> Critic + Refiner agents (parallel) -> Solution-architect Creator awareness -> Command updates -> Tests
2. **High-Risk Areas**: Orchestrator Section 7.5 refactoring (add Phase 03 routing tests before modifying)
3. **Dependencies to Resolve**: Phase-specific agent routing table design must be agreed upon before any implementation begins
4. **Lines of Change Estimate**: ~800-1000 lines across all files (2 new agent files ~200 lines each, orchestrator diff ~100 lines, solution-architect diff ~50 lines, command diff ~10 lines, tests ~400 lines)
5. **Effort Split**: ~85% markdown/prompt content, ~15% CJS test code (consistent with project norms)

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-14T21:15:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0015-multi-agent-architecture-team/requirements-spec.md",
  "quick_scan_used": "none (Phase 00 was inline)",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["debate", "critic", "refiner", "architecture", "STRIDE", "NFR alignment", "SPOF", "observability", "coupling", "cost", "ADR", "convergence", "agent routing", "Creator", "debate loop"],
  "files_directly_affected": 5,
  "modules_affected": 3,
  "risk_level": "low-medium",
  "blast_radius": "medium",
  "coverage_gaps": 2
}
```
