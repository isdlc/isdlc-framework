# Impact Analysis: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## 1. Blast Radius

### Tier 1: Direct Changes

| File | Module | Change Type | FR Traces |
|------|--------|-------------|-----------|
| `src/claude/commands/isdlc.md` | Analyze handler | Modify | FR-001, FR-004, FR-005 |
| `src/claude/agents/bug-gather-analyst.md` | New agent | New | FR-002, FR-003 |

### Tier 2: Transitive Impact

| File | Module | Impact | Change Needed |
|------|--------|--------|---------------|
| `src/claude/agents/tracing/tracing-orchestrator.md` | Tracing | Consumes bug-report.md and requirements-spec.md produced by bug-gather agent | None -- input format is already compatible |
| `src/claude/hooks/lib/three-verb-utils.cjs` | Auto-detection | `computeStartPhase` detects existing Phase 01 artifacts for fix workflow | None -- existing logic handles this |
| `src/isdlc/config/workflows.json` | Fix workflow | Fix workflow phases consumed after handoff | None -- phase sequence unchanged |
| `docs/AGENTS.md` | Documentation | New agent must be documented | Modify (add entry) |

### Tier 3: Side Effects

| Area | Potential Impact | Risk Level |
|------|-----------------|------------|
| Roundtable analyst | No longer dispatched for bugs -- still dispatched for features | Low |
| Session cache | Bug-gather agent may need to be included in cache if it reads persona/topic files | Low |
| Skills manifest | Bug-gather agent's owned skills may need registration | Low |

### Blast Radius Summary

- **Direct modifications**: 1 file (isdlc.md)
- **New files**: 1 file (bug-gather-analyst.md)
- **Transitive modifications**: 1 file (AGENTS.md)
- **Test files**: 2 files (bug detection tests, gather flow tests)
- **Total affected**: ~5-6 files

---

## 2. Entry Points

| Entry Point | Rationale |
|-------------|-----------|
| `src/claude/commands/isdlc.md` (analyze handler, step 7) | The bug detection gate must be added before the roundtable dispatch. This is where the routing decision happens. |
| `src/claude/agents/bug-gather-analyst.md` | New agent file -- the core new component. Can be developed independently of the handler change. |

---

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel? | Depends On |
|-------|-----|-------------|------|-----------|------------|
| 1 | FR-002, FR-003 | Create the bug-gather agent with gather, playback, and artifact production | Medium | Yes | None |
| 2 | FR-001, FR-005 | Add bug detection gate to analyze handler with classification and fallback | Medium | Yes (with #1) | None |
| 3 | FR-004 | Add "should I fix it?" handoff gate and fix workflow invocation | Low | No | #1, #2 |
| 4 | FR-006 | Verify live progress works end-to-end (integration test) | Low | No | #1, #2, #3 |

**Parallel opportunity**: Steps 1 and 2 can be developed concurrently (no file overlap).

---

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|----|------|------|-----------|--------|------------|
| RZ-001 | Bug-gather artifacts don't match tracing orchestrator expectations | Artifact compatibility | Low | High | Follow existing bug-report.md format from tracing-orchestrator.md; validate against pre-phase check |
| RZ-002 | LLM bug detection is too aggressive (classifies features as bugs) | Analyze handler | Medium | Medium | Always confirm with user; user override to roundtable; description-based inference not keyword-based |
| RZ-003 | Fix workflow `computeStartPhase` doesn't detect bug-gather artifacts as Phase 01 completion | Auto-detection | Low | High | Bug-gather produces same artifacts Phase 01 produces (bug-report.md, requirements-spec.md); verify `computeStartPhase` logic |
| RZ-004 | Analyze handler's non-workflow constraint violated by fix invocation | Architecture boundary | Low | High | Analyze only produces artifacts and asks "should I fix it?"; the fix invocation is a separate user-confirmed action through the existing fix verb |

### Overall Risk Assessment

- **Overall risk**: Medium
- **Key concern**: Artifact compatibility between bug-gather output and tracing orchestrator input (RZ-001)
- **Go/no-go**: Go -- risks are well-mitigated and the existing infrastructure handles most of the downstream flow

---

## 5. Summary

**Executive Summary**: This change introduces a bug-detection gate in the analyze handler and a new lightweight bug-gather agent. When a user analyzes a bug, the system skips the roundtable and instead gathers bug context, plays back understanding, and offers to launch the fix workflow. The fix workflow's existing auto-detection starts from Phase 02 (tracing). Total blast radius is ~5-6 files, with most downstream infrastructure unchanged.

**Key Decisions**:

| Decision | Rationale |
|----------|-----------|
| LLM inference over keyword matching | Labels can be wrong; LLM reads description content and understands context |
| Always confirm bug classification | User override prevents misclassification from blocking the correct flow |
| Analyze stays non-workflow | Clean separation: analyze produces artifacts, fix creates the workflow |
| Reuse existing fix auto-detection | REQ-0026 `computeStartPhase` already handles starting from Phase 02 |

**Implementation Recommendation**: Start with the bug-gather agent (step 1) and analyze handler routing (step 2) in parallel, then wire the handoff (step 3) and integration-test end-to-end (step 4).
