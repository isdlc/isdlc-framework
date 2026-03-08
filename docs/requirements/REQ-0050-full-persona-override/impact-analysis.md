---
Status: Draft
Confidence: High
Last Updated: 2026-03-08
Coverage: blast-radius 100%, entry-points 100%, risk-zones 100%
---

# Impact Analysis: Full Persona Override

## 1. Blast Radius

### Tier 1 — Direct Modifications

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| `src/claude/agents/roundtable-analyst.md` | Agent definitions | Modify | FR-005 (remove hardcoded 3-persona refs, dynamic roster) |
| `src/claude/hooks/lib/persona-loader.cjs` | Hook libs | Modify | FR-005 (remove PRIMARY_PERSONAS always-include enforcement) |
| `src/claude/hooks/lib/roundtable-config.cjs` | Hook libs | Modify | FR-006 (config as pre-population, not silent default) |
| `src/antigravity/analyze-item.cjs` | Antigravity bridge | Modify | FR-001, FR-002 (mode selection flags, dispatch context changes) |
| `src/claude/hooks/lib/common.cjs` | Hook libs | Modify | FR-005 (ROUNDTABLE_CONTEXT includes full roster, not just primaries) |
| `docs/isdlc/persona-authoring-guide.md` | Documentation | New | FR-007 |

### Tier 2 — Transitive Impact

| File | Module | Impact | Change Needed |
|------|--------|--------|---------------|
| `src/claude/hooks/tests/persona-loader.test.cjs` | Tests | Test updates for removed always-include behavior | Modify |
| `src/claude/hooks/tests/persona-config-integration.test.cjs` | Tests | Test updates for config-as-preference semantics | Modify |
| `src/claude/hooks/tests/persona-override-integration.test.cjs` | Tests | New test cases for primary persona removal | Modify |
| `src/antigravity/ANTIGRAVITY.md.template` | Antigravity instructions | Update "Read all three persona files" to dynamic | Modify |
| `CLAUDE.md` | Project instructions | Update analyze protocol with mode selection | Modify |
| `src/claude/hooks/tests/persona-schema-validation.test.cjs` | Tests | May need updates if frontmatter schema changes | Review |

### Tier 3 — Potential Side Effects

| Area | Potential Impact | Risk Level |
|------|-----------------|------------|
| Session cache builder | ROUNDTABLE_CONTEXT section in system prompt changes shape | Medium |
| Existing roundtable.yaml configs | Must continue working — behavioral change from "default" to "pre-populate" | Low |
| analyze-item.cjs output format | New fields in READY response (analysis_mode, verbosity_choice) | Low |
| meta.json schema | New `analysis_mode` field | Low |

## 2. Entry Points

**Recommended starting point**: `roundtable-analyst.md`

This is the central orchestrator. All other changes flow from how this file handles persona loading and conversation flow. Start by making this file dynamic, then update the infrastructure (`persona-loader.cjs`, `roundtable-config.cjs`) to support it, then update the analyze verb entry point.

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel | Depends On |
|-------|-----|-------------|------|----------|------------|
| 1 | FR-005 | Remove hardcoded primary persona references in roundtable-analyst.md and persona-loader.cjs | Medium | No | — |
| 2 | FR-004 | Implement no-persona analysis path in roundtable-analyst.md | Low | No | FR-005 |
| 3 | FR-001, FR-002 | Upfront mode and verbosity selection in analyze verb + roundtable-analyst.md | Medium | No | FR-005 |
| 4 | FR-003 | Dynamic roster selection with primaries as recommendations | Medium | No | FR-001, FR-005 |
| 5 | FR-006 | Config as preference pre-population | Low | Yes (with FR-007) | FR-001, FR-002, FR-003 |
| 6 | FR-007 | Persona authoring documentation | Low | Yes (with FR-006) | FR-001, FR-003 |

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|----|------|------|-----------|--------|------------|
| R1 | Roundtable-analyst.md is 800+ lines — large edit surface | roundtable-analyst.md | Medium | High | Focused edits replacing "three" with "active", not full rewrite |
| R2 | Session cache ROUNDTABLE_CONTEXT shape change breaks existing sessions | common.cjs | Low | High | Backward-compatible additions only; existing fields preserved |
| R3 | No-persona mode produces lower quality artifacts than roundtable | Analysis quality | Medium | Medium | User's explicit choice — document the trade-off |
| R4 | Mode selection adds friction to the analyze flow | UX | Medium | Medium | Keep to ≤ 2 questions; flags bypass the questions entirely |

## 5. Summary

| Metric | Count |
|--------|-------|
| Direct modifications | 5 files + 1 new |
| Test file updates | 3-4 files |
| Transitive modifications | 2 files |
| Total affected | ~11 files |
| Overall risk | Medium |
| Recommendation | Proceed — changes are well-scoped to existing infrastructure |
