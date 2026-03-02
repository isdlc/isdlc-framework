# Impact Analysis: Multi-Agent Design Team (REQ-0016)

**Generated**: 2026-02-15T00:20:00Z
**Feature**: Creator/Critic/Refiner debate loop for Phase 04 design specifications -- 8-category Design Critic, 9-strategy Design Refiner, DEBATE_ROUTING extension, Creator awareness, debate artifacts, constitutional compliance, edge case handling
**Based On**: Phase 01 Requirements (finalized -- 7 FRs, 34 ACs, 4 NFRs)
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | Creator/Critic/Refiner debate loop for Phase 04 (Design Specifications) | Design Critic (8 check categories), Design Refiner (9 fix strategies), DEBATE_ROUTING extension, Creator DEBATE_CONTEXT awareness, debate artifacts with design-specific metrics, constitutional compliance (Articles I/IV/V/VII/IX), edge case handling (non-REST, malformed critique, unconverged debate) |
| Keywords | debate, critic, refiner, design, Phase 04 | debate, critic, refiner, design, Phase 04, OpenAPI, module-designs, validation-rules, error-taxonomy, idempotency, accessibility, ARIA, STRIDE-analog, constitutional, convergence |
| Estimated Files | 6-10 (2 new + 3-5 modified) | 5 source files + ~5 test files (~10 total) |
| Scope Change | - | REFINED (same core, much more specific about check categories and fix strategies) |

---

## Executive Summary

REQ-0016 extends the Creator/Critic/Refiner debate pattern (established in REQ-0014 for Phase 01, REQ-0015 for Phase 03) to Phase 04 (Design Specifications). The blast radius is MEDIUM -- 5 source files across 3 modules (agents, commands, tests), with 2 entirely new agent files and 3 modified files. The pattern is well-established after two prior iterations, making this the third and most predictable instance. The primary complexity lies in adapting the 8 Critic check categories and 9 Refiner fix strategies to Phase 04's structurally different artifacts (OpenAPI specs, module-designs/, validation-rules.json, error-taxonomy.md) rather than the debate machinery itself, which is already generalized. Risk is LOW-MEDIUM with the only notable gap being zero existing test coverage on `03-system-designer.md`.

**Blast Radius**: MEDIUM (5 source files, 3 modules)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 5 source + ~5 test files
**Affected Modules**: agents, commands, tests

---

## Impact Analysis

### Files Directly Affected

| # | File | Action | Lines Changed (est.) | FR Trace | Rationale |
|---|------|--------|---------------------|----------|-----------|
| 1 | `src/claude/agents/03-design-critic.md` | NEW | ~170 | FR-001, FR-006 | Design Critic agent: 8 mandatory check categories (incomplete APIs, inconsistent patterns, module overlap, validation gaps, missing idempotency, accessibility, error taxonomy holes, data flow bottlenecks) + 5 constitutional compliance checks (Articles I/IV/V/VII/IX) |
| 2 | `src/claude/agents/03-design-refiner.md` | NEW | ~130 | FR-002 | Design Refiner agent: 9 fix strategies (complete OpenAPI contracts, unify patterns, clarify boundaries, boundary validation, idempotency keys, unified error taxonomy, WARNING triage, no-remove rule, change log) |
| 3 | `src/claude/agents/00-sdlc-orchestrator.md` | MODIFY | ~3 | FR-003 | Add Phase 04 row to DEBATE_ROUTING table: `04-design -> 03-system-designer.md / 03-design-critic.md / 03-design-refiner.md` with phase artifacts and critical artifact |
| 4 | `src/claude/agents/03-system-designer.md` | MODIFY | ~20 | FR-004 | Add DEBATE_CONTEXT Creator awareness: self-assessment section when mode=creator, no-op when no DEBATE_CONTEXT |
| 5 | `src/claude/commands/isdlc.md` | MODIFY | ~2 | FR-003 | Update debate-enabled phases description from "Phase 01 (Requirements) and Phase 03 (Architecture)" to include "Phase 04 (Design)" |

### Outward Dependencies (What depends on affected files)

| Affected File | Dependents | Impact |
|--------------|-----------|--------|
| `00-sdlc-orchestrator.md` | All phase agents (delegation), all hooks (state reads) | LOW -- adding a table row does not change orchestrator behavior for non-Phase-04 paths |
| `03-system-designer.md` | Orchestrator (delegates to it), test files | LOW -- DEBATE_CONTEXT is additive; no-DEBATE_CONTEXT path unchanged (AC-004-02) |
| `isdlc.md` | User-facing command processing | LOW -- text description update only |

### Inward Dependencies (What affected files depend on)

| Affected File | Dependencies | Impact |
|--------------|-------------|--------|
| `03-design-critic.md` (NEW) | Phase 04 artifacts (interface-spec.yaml/openapi.yaml, module-designs/, error-taxonomy.md, validation-rules.json), requirements-spec.md, constitution | NONE -- new file, no existing code depends on it |
| `03-design-refiner.md` (NEW) | Phase 04 artifacts, Critic critique report, requirements-spec.md | NONE -- new file |
| `00-sdlc-orchestrator.md` | DEBATE_ROUTING lookup logic (already generalized) | LOW -- existing logic already handles table lookups; adding a row works without code changes |

### Change Propagation

```
FR-001 (Design Critic) ──> NEW 03-design-critic.md
                           ──> NEW test file(s)
FR-002 (Design Refiner) ──> NEW 03-design-refiner.md
                            ──> NEW test file(s)
FR-003 (DEBATE_ROUTING) ──> MODIFY 00-sdlc-orchestrator.md (1 table row)
                            ──> MODIFY isdlc.md (1 description line)
                            ──> NEW/MODIFY orchestrator debate test file(s)
FR-004 (Creator Aware)  ──> MODIFY 03-system-designer.md (~20 lines)
                            ──> NEW test file(s)
FR-005 (Debate Artifacts) ──> Covered by debate engine (already generalized)
FR-006 (Constitutional)   ──> Covered by 03-design-critic.md checks
FR-007 (Edge Cases)       ──> Covered by orchestrator + critic behavior
```

---

## Entry Points

### Existing Entry Points Affected

| Entry Point | File | Change Type | AC Trace |
|------------|------|-------------|----------|
| DEBATE_ROUTING table | `00-sdlc-orchestrator.md` line 1029-1034 | Add row | AC-003-01, AC-003-02, AC-003-03, AC-003-04 |
| Debate-enabled phases description | `isdlc.md` line 276-278 | Update text | AC-003-01 |
| System designer Phase 03 handler | `03-system-designer.md` | Add DEBATE_CONTEXT section | AC-004-01, AC-004-02 |

### New Entry Points Required

| Entry Point | File | Purpose | AC Trace |
|------------|------|---------|----------|
| Design Critic agent | `src/claude/agents/03-design-critic.md` | Receives Phase 04 artifacts, produces critique report | AC-001-01 through AC-001-08, AC-006-01 through AC-006-05 |
| Design Refiner agent | `src/claude/agents/03-design-refiner.md` | Receives artifacts + critique, produces improved artifacts | AC-002-01 through AC-002-09 |

### Implementation Chain

```
1. Orchestrator receives Phase 04 delegation with debate_mode=true
2. Looks up DEBATE_ROUTING["04-design"]
3. Delegates to Creator: 03-system-designer.md (with DEBATE_CONTEXT)
4. Creator produces artifacts with self-assessment section
5. Delegates to Critic: 03-design-critic.md
6. Critic reviews artifacts, produces round-N-critique.md
7. If BLOCKING > 0 and round < max_rounds:
   8. Delegates to Refiner: 03-design-refiner.md
   9. Refiner addresses BLOCKING findings, updates artifacts
   10. Loop back to step 5 (next round)
11. Generates debate-summary.md with design-specific metrics
```

### Recommended Implementation Order

| Order | Module | Rationale |
|-------|--------|-----------|
| 1 | `03-design-critic.md` (NEW) | Core new functionality -- 8 check categories + 5 constitutional checks. Template from `02-architecture-critic.md` |
| 2 | `03-design-refiner.md` (NEW) | Depends on Critic output format. Template from `02-architecture-refiner.md` |
| 3 | `00-sdlc-orchestrator.md` DEBATE_ROUTING | 1 table row addition. Connects Critic and Refiner to the debate engine |
| 4 | `03-system-designer.md` DEBATE_CONTEXT | Add Creator awareness. Small, isolated change |
| 5 | `isdlc.md` debate description | Text update. Lowest risk |
| 6 | Test files | Write tests for all 5 modules following REQ-0014/REQ-0015 test patterns |

---

## Risk Assessment

### Test Coverage Analysis

| File | Current Coverage | Tests | Risk |
|------|-----------------|-------|------|
| `03-design-critic.md` | N/A (new file) | 0 (will need ~20-25) | LOW -- new file with established template |
| `03-design-refiner.md` | N/A (new file) | 0 (will need ~18-20) | LOW -- new file with established template |
| `00-sdlc-orchestrator.md` | Partial (18 orchestrator-loop tests) | 18 | LOW -- 1 table row; existing tests verify routing logic |
| `03-system-designer.md` | 0% | 0 | MEDIUM -- no existing tests; DEBATE_CONTEXT is additive but untested |
| `isdlc.md` | Partial (10 flag-parsing tests) | 10 | LOW -- text description change |

### Coverage Gap Summary

- **Files with zero test coverage affected by this change**: 1 (`03-system-designer.md`)
- **Recommendation**: Write tests for the DEBATE_CONTEXT additions to system-designer; do NOT attempt to retroactively test the entire 347-line file (out of scope)

### Complexity Hotspots

| Hotspot | File | Complexity | Mitigation |
|---------|------|-----------|------------|
| 8 Critic check categories | `03-design-critic.md` | MEDIUM -- domain-specific checks for OpenAPI, module designs, validation rules, error taxonomy, accessibility, data flow | Template from `02-architecture-critic.md` (8 checks there too); same structure, different domain |
| 9 Refiner fix strategies | `03-design-refiner.md` | MEDIUM -- must correctly address each check category | Template from `02-architecture-refiner.md` (8 strategies); same pattern |
| Non-REST adaptation (AC-007-04) | `03-design-critic.md` | LOW-MEDIUM -- Critic must adapt checks for CLI/library interfaces, not just REST | Add conditional check logic; document supported interface types |
| Design-specific metrics (AC-005-03) | Debate summary | LOW -- new metric fields (API endpoint count, validation rule count, error code count, module count, pattern consistency score) | Straightforward counting from artifacts |

### Technical Debt Markers

| Debt Item | File | Severity | Notes |
|-----------|------|----------|-------|
| Zero test coverage on system designer | `03-system-designer.md` | MEDIUM | Pre-existing debt. REQ-0016 adds ~20 lines; should add targeted tests for those lines |
| 43 pre-existing test failures | Various | LOW | Documented debt from REQ-0014/REQ-0015; not caused by or affected by REQ-0016 |

### Risk Recommendations per FR

| FR | Risk | Recommendation |
|----|------|---------------|
| FR-001 (Design Critic) | LOW-MEDIUM | Use `02-architecture-critic.md` as template. Validate each of 8 categories produces correct BLOCKING/WARNING classifications |
| FR-002 (Design Refiner) | LOW-MEDIUM | Use `02-architecture-refiner.md` as template. Validate no-remove rule (AC-002-08) and change log (AC-002-09) |
| FR-003 (DEBATE_ROUTING) | LOW | Single table row. Verify routing lookup works for "04-design" key |
| FR-004 (Creator Awareness) | LOW | Small additive change. Verify both DEBATE_CONTEXT and no-DEBATE_CONTEXT paths |
| FR-005 (Debate Artifacts) | LOW | Debate engine already handles artifact storage generically. Verify design-specific metrics |
| FR-006 (Constitutional) | LOW | 5 article checks added to Critic. Same pattern as architecture critic |
| FR-007 (Edge Cases) | LOW | 4 edge cases. Most handled by existing orchestrator logic. Verify non-REST adaptation |

### Overall Risk Assessment

| Dimension | Level | Justification |
|-----------|-------|---------------|
| Pattern Risk | LOW | Third iteration of established debate pattern |
| Integration Risk | LOW | DEBATE_ROUTING table extension is mechanical |
| Domain Risk | MEDIUM | Phase 04 artifacts (OpenAPI, module-designs, validation-rules) are structurally different from Phase 01/03 artifacts |
| Test Risk | LOW-MEDIUM | 1 affected file with zero coverage; new files will have dedicated test suites |
| Regression Risk | LOW | NFR-003 requires backward compatibility; AC-004-02 ensures no-DEBATE_CONTEXT path unchanged |
| **Overall** | **LOW-MEDIUM** | Well-established pattern with domain-specific adaptation |

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: (1) Design Critic agent, (2) Design Refiner agent, (3) Orchestrator DEBATE_ROUTING row, (4) System Designer DEBATE_CONTEXT, (5) isdlc.md description, (6) Test suites -- mirrors REQ-0015 implementation order
2. **High-Risk Areas**: `03-system-designer.md` has 0% test coverage -- add targeted tests for DEBATE_CONTEXT additions before broader modifications
3. **Dependencies to Resolve**: None -- all dependencies are on existing, stable files. The debate engine is already generalized from REQ-0015
4. **Template Sources**: `02-architecture-critic.md` (165 lines) and `02-architecture-refiner.md` (125 lines) provide direct structural templates
5. **Test Estimation**: ~80-90 new tests based on REQ-0014 (90 tests) and REQ-0015 (87 tests) precedent
6. **Effort Split**: ~85% markdown/prompt changes, ~15% JavaScript test code (consistent with prior art)

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-15T00:20:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0016-multi-agent-design-team/requirements-spec.md",
  "quick_scan_used": "docs/requirements/REQ-0016-multi-agent-design-team/quick-scan.md",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["debate", "critic", "refiner", "design", "Phase 04", "OpenAPI", "module-designs", "validation-rules", "error-taxonomy", "idempotency", "accessibility", "constitutional", "convergence"],
  "files_directly_affected": 5,
  "modules_affected": 3,
  "risk_level": "low-medium",
  "blast_radius": "medium",
  "coverage_gaps": 1
}
```
