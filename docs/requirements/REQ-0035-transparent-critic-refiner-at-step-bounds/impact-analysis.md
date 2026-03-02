# Impact Analysis: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## 1. Blast Radius

### Tier 1: Direct Modifications

| File | Module | Change Type | Requirement Traces |
|------|--------|------------|-------------------|
| `src/claude/agents/roundtable-analyst.md` | Roundtable Lead | Modify | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007 |
| `src/claude/commands/isdlc.md` | CLI Commands (analyze verb) | Modify | FR-008 (meta.json acceptance field) |

### Tier 2: Transitive Impact

| File | Module | Impact Description | Change Type |
|------|--------|-------------------|-------------|
| `src/claude/agents/persona-business-analyst.md` | Maya Persona | May need guidance on summary content generation for requirements domain | None expected |
| `src/claude/agents/persona-solutions-architect.md` | Alex Persona | May need guidance on summary content generation for architecture domain | None expected |
| `src/claude/agents/persona-system-designer.md` | Jordan Persona | May need guidance on summary content generation for design domain | None expected |
| `docs/requirements/{slug}/meta.json` | Per-item metadata | New `acceptance` field added at runtime | Schema extension |

### Tier 3: Side Effects

| Area | Potential Impact | Risk Level |
|------|-----------------|------------|
| Build flow (`/isdlc build`) | New `acceptance` field in meta.json; build currently ignores unknown fields | Low |
| Existing roundtable conversations | Completion detection changes; existing behavior replaced by confirmation sequence | Medium |
| Summary artifact files | 3 new files written to artifact folder; no conflicts with existing artifacts | Low |
| Agent Teams mode | Confirmation sequence runs in the lead orchestrator; teammate coordination unchanged | Low |

### Blast Radius Summary

| Metric | Count |
|--------|-------|
| Direct modifications | 2 |
| New files (runtime) | 3 per analysis (summary artifacts) |
| Restructured files | 0 |
| Transitive modifications | 0 (persona files not modified, only referenced) |
| Total affected | 2 files modified + 3 runtime artifacts |

## 2. Entry Points

**Recommended entry point**: `src/claude/agents/roundtable-analyst.md` -- Section 2.5 (Completion Detection)

**Rationale**: This is where the current completion flow lives. The confirmation sequence replaces the existing "provide a summary of produced artifacts with their status and confidence levels" with the new sequential summary-and-accept flow. All confirmation logic is self-contained within the roundtable analyst.

**Secondary entry point**: `src/claude/commands/isdlc.md` -- Section 7.8 (Finalize meta.json)

**Rationale**: The `acceptance` field needs to be preserved during finalization. This is a minor addition.

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel | Depends On |
|-------|-----|-------------|------|----------|------------|
| 1 | FR-001, FR-006 | Implement the confirmation sequence state machine in `roundtable-analyst.md`, replacing Section 2.5. Include tier-based scoping logic. | Low | No | -- |
| 2 | FR-002, FR-003, FR-004 | Define summary content generation for each domain (requirements, architecture, design). Summaries are generated from existing artifacts. | Low | Yes (all 3 can be defined in parallel) | Step 1 |
| 3 | FR-005 | Implement the amendment flow -- reopening conversation with all three personas, restarting the confirmation sequence from requirements. | Medium | No | Steps 1, 2 |
| 4 | FR-007 | Implement summary caching and persistence. Summaries cached in memory during confirmation, written to disk on full acceptance. | Low | No | Steps 1, 2 |
| 5 | FR-008 | Add acceptance state to meta.json. Update `isdlc.md` finalization to preserve the field. | Low | Yes (with Step 4) | Step 1 |

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|----|------|------|-----------|--------|------------|
| RZ-001 | Confirmation sequence breaks the relay-and-resume loop | `roundtable-analyst.md` / `isdlc.md` relay | Low | High | The confirmation exchanges use the same RETURN-FOR-INPUT pattern as regular conversation exchanges. The orchestrator relay in `isdlc.md` Section 7b does not need modification -- it already relays whatever the roundtable outputs. |
| RZ-002 | Amendment flow creates inconsistent artifacts | All artifact files | Medium | High | All three personas participate in every amendment. Full confirmation sequence restarts from requirements after amendment. Cross-check protocol (Section 5.3) runs during amendment cycles. |
| RZ-003 | Summary content generation produces low-quality summaries | Summary artifacts | Medium | Medium | Define explicit content requirements per domain (FR-002, FR-003, FR-004). Requirements: FRs with priorities. Architecture: decisions with rationale. Design: data flow and sequence. |
| RZ-004 | Tier detection incorrect -- wrong summaries presented | `roundtable-analyst.md` | Low | Medium | Tier information is available from `SIZING_INFO` in the dispatch prompt and from `meta.json`. Use `sizing_decision.effective_intensity` as the authoritative source. |
| RZ-005 | Persisted summaries become stale if detailed artifacts are modified outside the analyze flow | Summary artifact files | Low | Low | Summaries are regenerated on each analysis run. Staleness is already handled by the codebase hash check in the analyze verb. |

### Overall Risk Assessment

**Overall risk level**: Low-Medium

**Key concerns**: The amendment flow (RZ-002) requires careful implementation to ensure all three personas stay engaged and artifacts remain consistent. The relay-and-resume pattern (RZ-001) is well-tested but the confirmation state machine adds new states.

**Go/No-Go**: Go. The blast radius is small (2 files), the architecture is well-contained, and the existing relay-and-resume infrastructure handles the new exchanges without modification.

## 5. Summary

This feature has a small, well-contained blast radius. The primary change is to `roundtable-analyst.md`, replacing the current completion detection with a sequential confirmation sequence. The orchestrator relay in `isdlc.md` requires no structural changes -- confirmation exchanges flow through the same relay-and-resume loop as regular conversation.

The highest-risk area is the amendment flow, which must keep all three personas engaged and restart the full confirmation sequence. This is mitigated by the existing cross-check protocol and the "all three personas participate" rule.

No new agents, no hooks, no config changes, no build flow modifications. Implementation effort is concentrated in one agent file with a minor meta.json schema extension.

### Decision Log

| Decision | Rationale |
|----------|-----------|
| Confirmation sequence in roundtable analyst, not in isdlc.md | Keeps the logic self-contained in the agent that owns the conversation. The isdlc.md relay remains a simple pass-through. |
| Full sequence restart on amendment | Simpler than tracking which specific areas were affected by ripple effects. Shows everything in context. |
| Summaries as standalone artifacts | Enables fast revisit and provides a human-readable record of what was confirmed. |
| No Critic/Refiner pass in this feature | Deferred to a separate ticket to keep blast radius manageable. |
