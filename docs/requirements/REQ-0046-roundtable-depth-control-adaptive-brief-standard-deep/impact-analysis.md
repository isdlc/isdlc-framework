# Impact Analysis — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 95%

---

## 1. Blast Radius

### Tier 1: Direct Changes

| File | Change Type | Description |
|------|------------|-------------|
| `src/claude/agents/roundtable-analyst.md` | Modify | Add dynamic depth sensing instructions, assumption tracking protocol, tiered confirmation views, scope recommendation output. Remove static sizing-tier-to-depth mapping table. |
| `ANTIGRAVITY.md` | Modify | Update Analyze Protocol: remove `--light` depth references, add depth sensing guidance to roundtable protocol section. |
| `src/claude/skills/analysis-topics/problem-discovery/problem-discovery.md` | Modify | Restructure `depth_guidance` from prescriptive counts to behavioral calibration. |
| `src/claude/skills/analysis-topics/requirements/requirements-definition.md` | Modify | Restructure `depth_guidance`. |
| `src/claude/skills/analysis-topics/technical-analysis/technical-analysis.md` | Modify | Restructure `depth_guidance`. |
| `src/claude/skills/analysis-topics/architecture/architecture.md` | Modify | Restructure `depth_guidance`. |
| `src/claude/skills/analysis-topics/specification/specification.md` | Modify | Restructure `depth_guidance`. |
| `src/claude/skills/analysis-topics/security/security.md` | Modify | Restructure `depth_guidance`. |

### Tier 2: Transitive Changes (--light deprecation)

| File | Change Type | Description |
|------|------------|-------------|
| `src/claude/commands/isdlc.md` | Modify | Add deprecation notice for `--light` flag at sizing pre-check (line ~699). Modify to accept `recommended_scope` from meta.json as alternative to flag-based sizing. |
| `src/claude/hooks/lib/three-verb-utils.cjs` | Modify | Update `applySizingDecision` to accept roundtable-originated scope recommendations. |
| `src/claude/hooks/lib/common.cjs` | Modify | Update `deriveAnalysisStatus` if scope recommendation changes phase completion logic. |

### Tier 3: Side Effects

| File | Risk | Description |
|------|------|-------------|
| `src/claude/hooks/tests/test-sizing.test.cjs` | Test updates | Existing sizing tests may need updates for deprecation path. |
| `src/claude/hooks/tests/sizing-consent.test.cjs` | Test updates | Consent flow tests may need updates for recommended_scope path. |
| `src/claude/agents/persona-business-analyst.md` | None | No changes needed -- personas are already flexible on depth. |
| `src/claude/agents/persona-solutions-architect.md` | None | No changes needed. |
| `src/claude/agents/persona-system-designer.md` | None | No changes needed. |

---

## 2. Entry Points

| Entry Point | Type | Description |
|-------------|------|-------------|
| `roundtable-analyst.md` Section 3.4 (Steering Strategy) | Primary | Where depth-aware sufficiency is currently defined. Replace static table with dynamic sensing instructions. |
| `roundtable-analyst.md` Section 2.5 (Confirmation Sequence) | Primary | Where assumption views are added to domain summaries. |
| Topic files `depth_guidance` YAML blocks | Primary | Restructure all 6 files' frontmatter. |
| `isdlc.md` Step 6 (Sizing Pre-Check) | Secondary | Where --light flag is processed. Add deprecation path. |
| `isdlc.md` Step 3e (Sizing Decision Point) | Secondary | Where sizing feeds into build workflow. Wire recommended_scope consumption. |

---

## 3. Risk Zones

| Risk Zone | Likelihood | Impact | Mitigation |
|-----------|-----------|--------|------------|
| **Prompt regression**: Changes to roundtable-analyst.md could degrade existing analysis quality | Medium | High | Test with diverse scenarios (trivial, light, standard, complex). Compare artifact quality pre/post. |
| **Sizing flow disruption**: --light deprecation could break existing workflows that depend on the flag | Low | High | Transition period: flag continues to work but pre-sets scope as suggestion. Deprecation notice warns users. |
| **Topic file parse errors**: Restructured depth_guidance could break topic parsing in roundtable | Low | Medium | Maintain YAML structure compatibility. Only change content within existing depth_guidance keys. |
| **Confirmation sequence bloat**: Assumption sections could make confirmation too verbose | Medium | Low | Topic-level default keeps it concise. FR-level only on demand. |

---

## 4. Implementation Order

| Order | Component | Rationale |
|-------|-----------|-----------|
| 1 | Topic file depth_guidance restructuring (FR-007) | Foundation -- all other changes reference these descriptions |
| 2 | Roundtable-analyst.md dynamic depth sensing (FR-001, FR-002) | Core feature -- replaces static depth mapping |
| 3 | Roundtable-analyst.md inference tracking (FR-003) | Required before confirmation changes |
| 4 | Roundtable-analyst.md tiered confirmation views (FR-004) | Depends on inference tracking |
| 5 | Roundtable-analyst.md scope recommendation (FR-005) | Can be done in parallel with 3-4 |
| 6 | ANTIGRAVITY.md updates | Mirror roundtable changes for Antigravity platform |
| 7 | isdlc.md --light deprecation (FR-006) | Last -- depends on scope recommendation being in place |
| 8 | three-verb-utils.cjs / common.cjs updates | Last -- wiring changes for recommended_scope |

---

## 5. Dependency Chain

```
Topic files (FR-007)
    |
    v
roundtable-analyst.md depth sensing (FR-001, FR-002)
    |
    +---> inference tracking (FR-003)
    |         |
    |         v
    |     tiered confirmation (FR-004)
    |
    +---> scope recommendation (FR-005)
              |
              v
         ANTIGRAVITY.md updates
              |
              v
         isdlc.md --light deprecation (FR-006)
              |
              v
         three-verb-utils.cjs / common.cjs
```
