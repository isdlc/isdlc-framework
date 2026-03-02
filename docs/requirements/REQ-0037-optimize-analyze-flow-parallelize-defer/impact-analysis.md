---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Impact Analysis: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Blast Radius

### Tier 1: Direct Modifications

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| `src/claude/commands/isdlc.md` | CLI commands | Modify | FR-001, FR-002, FR-003, FR-004, FR-005, FR-008 |
| `src/claude/agents/roundtable-analyst.md` | Roundtable agent | Modify | FR-006, FR-007 |

### Tier 2: Transitive Impact

| File | Module | Impact | Change Needed |
|------|--------|--------|---------------|
| `src/claude/agents/persona-business-analyst.md` | Persona | Content now inlined in dispatch prompt; file still read by fallback path | None (read-only dependency) |
| `src/claude/agents/persona-solutions-architect.md` | Persona | Content now inlined in dispatch prompt; file still read by fallback path | None (read-only dependency) |
| `src/claude/agents/persona-system-designer.md` | Persona | Content now inlined in dispatch prompt; file still read by fallback path | None (read-only dependency) |
| `src/claude/skills/analysis-topics/**/*.md` | Topic files (6) | Content now inlined in dispatch prompt; files still read by fallback path | None (read-only dependency) |

### Tier 3: Side Effects

| Area | Potential Impact | Risk Level |
|------|------------------|------------|
| `BACKLOG.md` | Timing of backlog entry creation changes (runs in parallel with other Group 2 work) but final state is identical | Low |
| Roundtable conversation quality | Alex's first contribution shifts from exchange 1 to exchange 2 due to deferred scan | Low (accepted trade-off) |
| Dispatch prompt size | ~1100 additional lines of persona and topic content inlined | Low (within context limits) |

### Summary

| Metric | Count |
|--------|-------|
| Direct modifications | 2 |
| New files | 0 |
| Restructured files | 0 |
| Transitive modifications | 0 (read-only dependencies, no file changes) |
| **Total affected** | **2** |

## 2. Entry Points

**Recommended starting point**: `src/claude/commands/isdlc.md` -- the analyze handler (lines 608-741).

**Rationale**: The analyze handler is the orchestrator of the entire flow. Restructuring it into dependency groups establishes the new execution model. The roundtable-analyst changes (accepting inlined context, deferring scan) are driven by and dependent on the analyze handler changes.

**Implementation order**:
1. Restructure analyze handler's pre-dispatch pipeline into dependency groups (FR-001)
2. Add auto-add fast path for external refs within the dependency groups (FR-002, FR-003, FR-004)
3. Add persona/topic pre-reading and inlined dispatch fields (FR-005)
4. Update roundtable-analyst to accept inlined context (FR-006)
5. Update roundtable-analyst to defer codebase scan (FR-007)
6. Verify error handling is unchanged (FR-008)

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel? | Depends On |
|-------|-----|-------------|------|-----------|------------|
| 1 | FR-001 | Restructure analyze handler into dependency groups | Medium | No | -- |
| 2 | FR-002, FR-003, FR-004 | Auto-add fast path with pre-fetched data and no re-read | Low | Yes (with step 3) | Step 1 |
| 3 | FR-005 | Pre-read persona/topic files in analyze handler | Low | Yes (with step 2) | Step 1 |
| 4 | FR-006 | Roundtable accepts inlined context | Low | No | Step 3 |
| 5 | FR-007 | Roundtable defers codebase scan | Low | Yes (with step 4) | -- |
| 6 | FR-008 | Verify error handling unchanged | Low | No | Steps 1-5 |

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|----|------|------|-----------|--------|------------|
| RZ-001 | LLM serializes despite parallel group instructions | `isdlc.md` analyze handler | Medium | Medium | Use explicit "fire these in parallel" language; test with actual invocations; iterate on prompt wording if needed |
| RZ-002 | Dispatch prompt size exceeds effective context window | `isdlc.md` dispatch section | Low | Medium | ~1100 lines added; monitor for truncation; persona/topic content is well-structured and compressible |
| RZ-003 | Pre-fetched data shape mismatch with `add` handler expectations | `isdlc.md` add handler | Low | Medium | `add` handler validates its inputs; use same field names as `gh issue view` output |
| RZ-004 | Roundtable fallback path (no inlined context) regresses | `roundtable-analyst.md` | Low | Low | Fallback path is existing code, unchanged; only new code path is the inlined context acceptance |
| RZ-005 | Alex contributing from exchange 2 instead of exchange 1 confuses users | `roundtable-analyst.md` | Low | Low | Accepted trade-off; Maya carries exchange 1 with draft knowledge; exchange 1 is typically problem discovery which is Maya's domain anyway |

### Overall Risk Assessment

- **Overall risk level**: Low-Medium
- **Key concern**: RZ-001 (LLM honoring parallelism hints) is the primary uncertainty. This is an empirical question that can only be resolved by testing.
- **Go/no-go recommendation**: Go. The changes are contained, backward compatible, and the worst case is partial improvement (some parallelism achieved, not all).

## 5. Summary

### Executive Summary

This is a prompt-restructuring change affecting 2 files (`isdlc.md` and `roundtable-analyst.md`) with zero changes to executable code. The analyze handler's pre-dispatch pipeline is restructured from sequential steps to dependency groups, enabling the LLM to fire independent tool calls in parallel. The roundtable-analyst gains the ability to accept pre-read context in the dispatch prompt and defers its codebase scan to after the first user exchange. Expected improvement: ~90s to ~11s first-message latency (8x).

### Decision Log

| Decision | Rationale |
|----------|-----------|
| Dependency group notation over inline hints | Groups make parallelism unambiguous; numbered lists imply sequence |
| Auto-add for all external refs (#N, PROJECT-N) | Intent is unambiguous when user references a specific issue |
| `add` handler accepts pre-fetched data | Avoids duplicate fetch while keeping `add` as sole owner of folder creation |
| Scan deferred, not background | Simplest approach; Alex joins exchange 2; no new files or processes |
| Label sync stays at end | Already non-blocking; doesn't affect first-message latency |
| BACKLOG.md update runs in parallel (Group 2) | User has context during the brief consistency window |
| Error handling unchanged | Fail-fast with same messages; no new error paths |
