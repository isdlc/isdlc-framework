# Quick Scan: REQ-0032 Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21

## 1. Scope

**Classification**: Large
**Complexity**: High

**Rationale**: Rearchitects the sequential 5-phase analyze pipeline into a 2-stage model:
- Stage 1: Phase 00 (quick scan) runs standalone as today
- Stage 2: A single unified session where Phase 01 (requirements) drives the conversation while Phases 02 (impact), 03 (architecture), and 04 (design) produce artifacts concurrently

This is not a tweak to the phase loop -- it fundamentally changes how analysis works. The orchestration model shifts from sequential delegation (one phase at a time) to a single long-running session where all three personas actively ask questions and write their own phase artifacts simultaneously. By the end of Phase 01, all phases should be complete.

**Nature of change**: Modifying existing behavior (orchestration, agent instructions, artifact protocol)

## 2. Keywords

| Keyword / Pattern | Hits | Key Files |
|---|---|---|
| `phase_key` / phase loop / sequential | 67 | `src/claude/commands/isdlc.md` -- phase loop, delegation format, phase ordering |
| `roundtable` | 8 | `src/claude/agents/roundtable-analyst.md`, `src/claude/commands/isdlc.md`, quality docs |
| Phase identifiers (`00-quick-scan` .. `04-design`) | 52 | `isdlc.md`, `roundtable-analyst.md`, 30 step files under `src/claude/skills/analysis-steps/`, hooks |
| `analysis-steps` | 4 | `isdlc.md`, `roundtable-analyst.md` -- step file discovery path |
| `persona` / `elaboration` / `artifact` | 67 | Concentrated in `roundtable-analyst.md` -- persona definitions, elaboration mode, artifact protocol |
| `meta.json` / `writeMetaJson` / artifact folder | 63 | `roundtable-analyst.md`, step files, hook configs |

**Primary concentration** (3 files that matter most):
1. `src/claude/commands/isdlc.md` -- Phase loop dispatching sequential delegations
2. `src/claude/agents/roundtable-analyst.md` -- Single-phase-at-a-time agent instructions
3. `src/claude/skills/analysis-steps/` -- 30 step files across 5 phase directories (consumption model changes)

## 3. File Count

| Category | Count | Details |
|---|---|---|
| Modify | 2 | `src/claude/commands/isdlc.md` (phase loop / delegation logic), `src/claude/agents/roundtable-analyst.md` (concurrent execution model, multi-phase artifact production, interleaved persona questioning) |
| Potentially modify | 30 | `src/claude/skills/analysis-steps/**/*.md` -- 30 step files may need frontmatter changes for concurrent execution hints, or may remain untouched if changes are purely in the agent. Design decision for Phase 03. |
| New | 0-1 | Possibly a coordination config if concurrent model needs metadata |
| Test / Docs | 2-3 | Updated architecture docs, test scenarios for new flow |

**Estimates**:
- Minimum: 2 files modified (changes purely in orchestration + agent instructions)
- Maximum: ~35 files (if step files need frontmatter updates)
- Most likely: 2-5 files (2 core files + minor config/doc updates)
- Confidence: Medium

## 4. Final Scope

**Classification**: Large
**Complexity**: High
**Confidence**: Medium

**Summary**: This change rearchitects the sequential 5-phase analyze pipeline into a 2-stage model. Phase 00 remains standalone. Phases 01-04 collapse into a single unified conversation where all three personas (Maya, Alex, Jordan) actively ask questions and produce their phase artifacts concurrently. The primary changes concentrate in 2 files (`isdlc.md` and `roundtable-analyst.md`), but the architectural significance of those changes -- rewriting the orchestration model and the agent's execution engine -- makes this a large, high-complexity effort.

## 5. Related Items (Out of Scope)

- **Discover command -- new project flow**: The `/discover --new` pipeline (D7 product-analyst, D8 architecture-designer) follows a similar sequential pattern (vision -> requirements -> architecture -> scaffold). The concurrent model could benefit this flow as well, but it uses different agents, a different orchestrator, and produces different artifacts. Noted as a separate follow-on item.
