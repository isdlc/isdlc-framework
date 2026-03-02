# Impact Analysis: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Complete

---

## 1. Blast Radius

### Tier 1 -- Direct Changes (Modify)

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| `src/claude/commands/isdlc.md` | CLI Commands | Modify | FR-014 |
| `src/claude/agents/roundtable-analyst.md` | Agents | Delete (replaced by split files) | FR-008 |

### Tier 1 -- Direct Changes (New Files)

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| `src/claude/agents/roundtable-lead.md` | Agents | New | FR-008 AC-008-01 |
| `src/claude/agents/persona-business-analyst.md` | Agents | New | FR-008 AC-008-02 |
| `src/claude/agents/persona-solutions-architect.md` | Agents | New | FR-008 AC-008-03 |
| `src/claude/agents/persona-system-designer.md` | Agents | New | FR-008 AC-008-04 |

### Tier 1 -- Restructured Files (24 step files -> topic files)

All 24 files under `src/claude/skills/analysis-steps/` across 5 phase directories reorganized into topic-based directories. Content preserved; organization, frontmatter schema, and consumption model change.

| Source Directory | File Count | Target (TBD in Phase 03) | Traces |
|-----------------|------------|--------------------------|--------|
| `src/claude/skills/analysis-steps/00-quick-scan/` | 3 | Topic-based directory | FR-009 |
| `src/claude/skills/analysis-steps/01-requirements/` | 8 | Topic-based directory | FR-009 |
| `src/claude/skills/analysis-steps/02-impact-analysis/` | 4 | Topic-based directory | FR-009 |
| `src/claude/skills/analysis-steps/03-architecture/` | 4 | Topic-based directory | FR-009 |
| `src/claude/skills/analysis-steps/04-design/` | 5 | Topic-based directory | FR-009 |

### Tier 2 -- Transitive Impact

| File | Module | Impact | Change Type |
|------|--------|--------|-------------|
| `src/claude/hooks/lib/three-verb-utils.cjs` | Hooks/Utils | `deriveAnalysisStatus()` depends on `phases_completed` counting model. **Decision: keep 5-phase array model unchanged.** Lead orchestrator populates `phases_completed` progressively as artifacts are written. Functions `readMetaJson()`, `writeMetaJson()`, `deriveAnalysisStatus()`, `parseSizingFromImpactAnalysis()`, `computeRecommendedTier()` all remain untouched. | None (no modification needed) |
| `docs/requirements/{slug}/meta.json` (all existing) | Artifacts | `phases_completed` array schema preserved. `steps_completed` array becomes internal to agent (may change to `topics_covered`). Existing analyzed items remain readable with no migration. | None (backward compatible) |

### Tier 3 -- Potential Side Effects

| File/Area | Impact | Risk Level |
|-----------|--------|------------|
| Build verb artifact consumption (`isdlc.md` build section) | Reads artifacts from `docs/requirements/{slug}/`. Artifact format unchanged per requirements spec. No modification needed. | Low |
| Sizing trigger (`isdlc.md` lines 633-658) | Currently fires at Phase 02->03 boundary in phase loop. **Decision: keep sizing in `isdlc.md`, fire after single dispatch returns.** `-light` flag remains a pre-dispatch short-circuit. Interactive sizing runs before concurrent session begins. | Medium -- logic relocation within same file |
| Tier computation (`isdlc.md` lines 660-668) | Same file, same function calls. Fires after dispatch returns instead of mid-loop. | Low -- timing change only |
| Quality/lint reports (4 files in `docs/quality/`) | Reference `roundtable-analyst.md` by name. Documentation only. | Low |
| `BACKLOG.md` | References agent by name. | Low |

### Blast Radius Summary

- **Direct modifications**: 2 files (isdlc.md, roundtable-analyst.md)
- **New files**: 4 (persona split)
- **Restructured files**: 24 (step files -> topic files)
- **New topic file**: 1 (security considerations, FR-009 AC-009-04)
- **Transitive impact**: 0 files require modification (decisions preserve existing interfaces)
- **Total affected**: ~31 files

### Key Architectural Decisions (Blast Radius)

1. **Sizing logic stays in `isdlc.md`**: Fires after single dispatch returns instead of mid-phase-loop. `-light` flag is a pre-dispatch short-circuit. Interactive sizing runs before concurrent session begins. This keeps orchestration concerns out of the lead orchestrator.

2. **`phases_completed` 5-phase array preserved**: Lead orchestrator populates the array progressively as it writes each artifact type. `deriveAnalysisStatus()`, `readMetaJson()`, `writeMetaJson()`, and all downstream consumers (build verb, BACKLOG.md markers, GitHub label sync) remain completely untouched.

3. **Trivial sizing: accept overhead for initial implementation**: Quick-scan estimate can be wrong. Running full analysis catches surprises. Adding a trivial short-circuit would introduce a third flow path, adding complexity to an already large change. Users who know it's trivial can skip analyze and go straight to `build --trivial`. Trivial short-circuit is a follow-on enhancement.

## 2. Entry Points

The recommended starting point for implementation is the **persona file split (FR-008)** combined with **dual execution mode design (FR-006, FR-007)**. The persona files are the foundation: every other change depends on them existing. Designing them with agent teams in mind from the start avoids a retrofit -- each persona file must work both as a supplement to the lead (single-agent) and as a standalone spawn prompt (agent teams).

## 3. Implementation Order

### Dependency Chain

```
Step 1: FR-008 + FR-006 + FR-007 (Persona File Split with Dual-Mode Design)
  |
  +--[parallel]--> Step 2a: FR-009 (Topic-Based Step Restructuring)
  |
  +--[parallel]--> Step 2b: FR-001, FR-003, FR-004, FR-005, FR-010, FR-011,
  |                         FR-013, FR-015, FR-016, FR-017 (Lead Orchestrator)
  |
  +--------------> Step 3: FR-002 (Silent Codebase Scan) -- depends on 2b
  |
  +--------------> Step 4: FR-014 (Single Dispatch from isdlc.md) -- integration point
  |
  +--------------> Step 5: FR-012 (Artifact Cross-Check) -- depends on 2b
```

### Ordered Implementation Plan

| Order | FR(s) | Description | Risk | Parallel? | Depends On |
|-------|-------|-------------|------|-----------|------------|
| 1 | FR-008, FR-006, FR-007 | Persona file split with dual-mode design. Split monolithic `roundtable-analyst.md` (559 lines) into 4 files: lead orchestration, business analyst, solutions architect, system designer. Design each persona file to work as both a lead supplement (single-agent) and standalone spawn prompt (agent teams). Remove elaboration mode (FR-016) and menu system (FR-017) during the split. | Medium-High | No -- foundation | None |
| 2a | FR-009 | Topic-based step file restructuring. Reorganize 24 step files from phase directories to topic directories. Add `coverage_criteria` frontmatter. Remove phase sequencing metadata. Create new security considerations topic file. | Medium | Yes (with 2b) | Step 1 |
| 2b | FR-001, FR-003, FR-004, FR-005, FR-010, FR-011, FR-013, FR-015, FR-016, FR-017 | Lead orchestrator. Unified conversation model, progressive artifact production, information threshold engine, invisible coverage tracker, organic persona interaction, confidence indicators, conversation completion model, adaptive artifact depth. Single unit of work -- the core behavioral change. | High | Yes (with 2a) | Step 1 |
| 3 | FR-002 | Silent codebase scan. Wire into lead orchestrator's first-turn behavior. In agent teams mode, runs as a teammate task concurrent with the opening conversation. | Low | No | Step 2b |
| 4 | FR-014 | Single dispatch from isdlc.md. Replace phase loop with single dispatch to lead orchestrator. Relocate sizing trigger to fire after dispatch returns. Keep `-light` as pre-dispatch short-circuit. Relocate tier computation. | Medium | No | Steps 2b, 3 |
| 5 | FR-012 | Artifact cross-check before finalization. Lead announces cross-check, each persona verifies consistency, corrections applied. | Low | No | Step 2b |

### Proof-of-Concept Strategy

The minimum viable proof-of-concept targets Steps 1 and 2b only, with the lead initially consuming existing step files in their current phase-based structure:

1. Split `roundtable-analyst.md` into 4 persona files (FR-008) with agent teams awareness (FR-006/FR-007)
2. Write the lead orchestrator with basic conversation flow (FR-001, FR-003, FR-010)
3. **Skip FR-009** -- the lead reads existing step files in `src/claude/skills/analysis-steps/{phase_key}/` as a temporary measure
4. Validate the concurrent conversation model works end-to-end
5. Then layer on topic restructuring (FR-009), `isdlc.md` dispatch change (FR-014), and remaining FRs

This gets a working concurrent model without the file restructuring, reducing initial risk and enabling early validation of the core behavioral change.

### Critical Path

The lead orchestrator (Step 2b) is the critical path. It is the largest single piece of work, the highest risk, and the most novel -- replacing a deterministic step execution engine with a conversation-driven model. It is tackled as one unit because its sub-components (coverage tracker, threshold engine, progressive artifacts) are tightly interdependent and cannot be tested in isolation.

### Parallel Opportunities

Steps 2a and 2b can be developed simultaneously by two people (or on two laptops). They share no files:
- Step 2a touches only files under `src/claude/skills/analysis-steps/`
- Step 2b produces a new file `src/claude/agents/roundtable-lead.md`
- The integration point is the topic file frontmatter schema (coverage_criteria), which should be agreed in the Phase 03 architecture step before parallel work begins

## 4. Risk Zones

### Risk Matrix

| # | Risk | Area | Likelihood | Impact | Mitigation |
|---|------|------|-----------|--------|------------|
| R1 | Phase loop replacement breaks analyze entry point | `isdlc.md` FR-014 | Low | Critical | Keep the replacement minimal -- single dispatch replaces the loop, sizing/tier logic relocates within the same file. The roundtable routing check (line 609) already exists. Test manually with end-to-end analyze run before merging. |
| R2 | Voice blending -- personas lose distinct identities in single-agent mode | Lead orchestrator, persona files | Medium | Medium | Separate persona files with strict voice integrity rules (FR-008). Anti-blending rule: persona stays silent rather than echoing another. Review persona outputs during PoC. |
| R3 | Coverage tracker miscalibration -- topics missed or conversation over-extended | Lead orchestrator FR-005 | Medium | Medium | Topic files define explicit `coverage_criteria` in frontmatter. Lead checks criteria rather than relying on pure judgment. **Start conservative** (lower thresholds -- accept lighter coverage on early exit, let user ask for more). Iterative tuning based on usage. |
| R4 | Information threshold miscalibration -- artifacts written too early or too late | Lead orchestrator FR-004 | Medium | Medium | Confidence indicators (FR-011) flag low-confidence sections. Cross-check (FR-012) catches inconsistencies before finalization. **Start conservative** (higher thresholds -- write later rather than earlier). Partial artifacts from early exit are preferable to low-quality artifacts from premature writes. |
| R5 | Agent teams race conditions on shared artifact files | Agent teams mode FR-007 | Medium | High | Partition artifact ownership: Maya owns `requirements-spec.md`, Alex owns `impact-analysis.md` and `architecture-overview.md`, Jordan owns design files. Only the lead writes `meta.json`. No shared writes. If two personas need to contribute to the same file, the lead merges their contributions. |
| R6 | Agent teams instability (experimental feature) | FR-006, FR-007 | Medium | High | Agent teams is opt-in, not default. Single-agent mode is the default and delivers the full UX. Agent teams failures don't affect the default experience. Graceful degradation: if a teammate fails, the lead continues in single-agent mode for that persona's work. |
| R7 | Progressive artifact writes produce corrupt/incomplete files on crash | FR-003 | Low | High | Write complete file contents on each update (not appending). Each write is atomic from the filesystem perspective. If the session crashes, the last complete write is preserved. Worst case: user re-runs analyze and the conversation resumes from where topics were last covered. |
| R8 | `isdlc.md` sizing trigger timing change causes incorrect sizing decisions | Sizing relocation in FR-014 | Low | Medium | The sizing trigger reads `impact-analysis.md` and computes a recommendation. In the concurrent model, this file is fully written before the dispatch returns. Same functions (`parseSizingFromImpactAnalysis`, `computeSizingRecommendation`) called with the same input. Unit tests for these functions in `test-three-verb-utils.test.cjs` provide the safety net. |
| R9 | Monolithic lead orchestrator prompt too large for context window | Lead orchestrator FR-001 | Low | High | Current `roundtable-analyst.md` is 559 lines and works. Lead file will be comparable (orchestration logic replaces step engine logic). Persona details move to separate files, reducing lead size. If lead + all persona files exceed context, single-agent mode reads only the lead + relevant persona (not all three). |
| R10 | Topic file restructuring breaks PoC if done concurrently with lead development | FR-009 parallel with lead | Low | Medium | PoC strategy explicitly avoids this: lead initially reads existing step files. Topic restructuring happens after PoC validates. Integration point (frontmatter schema) agreed in Phase 03 before parallel work begins. |

### Risk Summary

- **Overall risk level**: High (due to scope and novelty, not due to any single critical risk)
- **Highest-risk area**: Lead orchestrator (R3, R4) -- threshold calibration depends on emergent LLM behavior, not deterministic code
- **Highest-impact risks**: R5, R6 (agent teams) -- fully mitigated by being opt-in with single-agent as default
- **Best-mitigated risks**: R1, R8 (isdlc.md changes) -- minimal scope, existing test coverage on utility functions

### Test Coverage Assessment

| Area | Coverage | Notes |
|------|----------|-------|
| `three-verb-utils.cjs` utility functions | Good | `test-three-verb-utils.test.cjs` covers `deriveAnalysisStatus`, `readMetaJson`, `writeMetaJson`, `deriveBacklogMarker`, `computeRecommendedTier`, `getTierDescription`. These functions are not modified. |
| Roundtable agent behavior | None | Prompt files (markdown) -- no automated tests exist or are feasible. Validation is manual end-to-end testing. |
| Agent teams integration | None | No existing agent teams code in the codebase. Entirely new territory. Experimental feature. |
| `isdlc.md` analyze flow | None (prompt file) | Phase loop logic is in a markdown command file. No automated tests. Manual validation required. |
| Step file / topic file consumption | None | Internal to agent prompt. Validated by agent behavior, not unit tests. |

### Calibration Decision

**Conservative thresholds** for initial implementation:
- Coverage tracker (R3): Lower thresholds -- accept lighter coverage on early exit. The lead suggests continuation toward uncovered topics but does not block completion. If the user says "that's enough," respect it and produce artifacts with honest confidence indicators reflecting the gaps.
- Information thresholds (R4): Higher thresholds -- write artifacts later rather than earlier. Require stronger signal before committing to artifact writes. Partial artifacts from early exit are preferable to low-quality artifacts from premature writes. Iterative tuning based on real usage after initial deployment.

## 5. Summary

### Executive Summary

This change rearchitects the sequential 5-phase analyze pipeline into a unified conversation model. The blast radius covers ~31 files but is well-contained: zero transitive modifications are needed because key architectural decisions (preserving `phases_completed` array, keeping sizing in `isdlc.md`) maintain all existing interfaces. The overall risk level is high due to scope and novelty, but no single risk is unmitigated. The highest uncertainty is in threshold calibration (coverage tracker, information thresholds), which depends on emergent LLM behavior rather than deterministic code -- conservative thresholds and iterative tuning address this.

| Metric | Value |
|--------|-------|
| Total files affected | ~31 |
| Direct modifications | 2 |
| New files | 4 (persona split) + 1 (security topic) |
| Restructured files | 24 (step files to topic files) |
| Transitive modifications | 0 |
| Overall risk level | High |
| High-impact risks | 4 (R5, R6, R7, R9) -- all mitigated |
| Go/No-go | Go -- blast radius is contained, risks are mitigated, scope confirmed as large/high-complexity |

### Key Concerns

1. Lead orchestrator is the critical path -- largest, highest-risk, most novel piece of work
2. No automated test coverage for behavioral changes (prompt files) -- manual end-to-end validation required
3. Agent teams mode introduces real concurrency risks -- mitigated by artifact ownership partitioning and opt-in design

## 6. Implementation Recommendations

| # | Step | FRs | Risk | Notes |
|---|------|-----|------|-------|
| 1 | Persona file split with dual-mode design | FR-008, FR-006, FR-007 | Medium-High | Foundation -- everything depends on this. Remove elaboration (FR-016) and menus (FR-017) during split. |
| 2a | Topic-based step file restructuring | FR-009 | Medium | Parallel with 2b. Agree frontmatter schema first. |
| 2b | Lead orchestrator | FR-001, FR-003, FR-004, FR-005, FR-010, FR-011, FR-013, FR-015 | High | Critical path. Single unit. Conservative thresholds. PoC reads existing step files. |
| 3 | Silent codebase scan | FR-002 | Low | Wire into lead's first turn. |
| 4 | Single dispatch from isdlc.md | FR-014 | Medium | Integration point. Sizing/tier logic relocates within same file. |
| 5 | Artifact cross-check | FR-012 | Low | Quality safeguard. |

### Decisions Log

| # | Decision | Rationale | Traces |
|---|----------|-----------|--------|
| D1 | Sizing logic stays in `isdlc.md` | Orchestration concern, not analysis concern. Minimizes blast radius. | FR-014 |
| D2 | `phases_completed` 5-phase array preserved | Zero changes to downstream consumers. Lead populates progressively. | FR-014, FR-003 |
| D3 | Trivial sizing: accept overhead, defer short-circuit | Reduces complexity. `build --trivial` exists for known-trivial items. | FR-014 |
| D4 | FR-006/FR-007 bundled with FR-008 | Persona files serve dual purpose. Design for both modes from start. | FR-008, FR-006, FR-007 |
| D5 | PoC: lead reads existing step files first | Reduces initial risk. Topic restructuring validated separately. | FR-009 |
| D6 | Lead orchestrator as single unit | Sub-components too interdependent to split. | FR-001, FR-003, FR-004, FR-005 |
| D7 | Conservative thresholds | Write later, accept lighter early-exit coverage. Tune from usage. | FR-004, FR-005 |
| D8 | Artifact ownership partitioning | No shared writes in agent teams mode. Lead merges cross-persona contributions. | FR-007 |
