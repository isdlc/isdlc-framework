---
Status: Draft
Confidence: High
Last Updated: 2026-03-08
Coverage: problem-discovery 100%, requirements-definition 95%
Source: REQ-0050 / GH-108b
---

# Requirements Specification: Full Persona Override

## 1. Business Context

The roundtable analysis currently hardcodes three primary personas (Maya/BA, Alex/Architect, Jordan/Designer) as always-present. Users cannot disable them, choose whether to use personas at all, or control the analysis mode upfront. This limits hackability — users who want a straight analysis pass or a custom persona roster are forced into the framework's defaults.

REQ-0047 (#108a) shipped contributing personas and the infrastructure for user personas (`.isdlc/personas/`, override-by-copy, trigger matching, verbosity modes). But the three primaries remain mandatory, the analysis always assumes roundtable mode, and the user is never explicitly asked how they want to run the analysis.

**Principle**: Control belongs to the user. No hidden default behaviour.

**Success metric**: Users explicitly choose their analysis mode (personas or no personas) and persona roster before every analysis. No persona is forced. Artifacts are always produced regardless of mode.

## 2. Stakeholders and Personas

| User Type | Description | Pain Points |
|-----------|-------------|-------------|
| Framework user (primary) | Developer using iSDLC for analysis | Cannot skip roundtable; cannot remove primary personas; analysis mode is chosen for them silently; no upfront control over how analysis runs |
| Framework customizer (secondary) | Developer who has created custom personas | Cannot disable built-in primaries to use their own exclusively; no documentation on how to author personas |

## 3. User Journeys

### Journey 1: Straight analysis (no personas)

1. User runs analyze on a backlog item
2. Framework asks: "How do you want to run this analysis? With personas (roundtable) or straight analysis?"
3. User chooses "straight analysis"
4. Framework runs a clean analysis pass — no persona files loaded, no persona influence
5. Artifacts produced: requirements-spec.md, impact-analysis.md, architecture-overview.md, module-design.md

### Journey 2: Roundtable with custom roster

1. User runs analyze on a backlog item
2. Framework asks: "How do you want to run this analysis?"
3. User chooses "with personas"
4. Framework asks: "Which conversation style? Conversational / Bulleted / Silent"
5. User chooses "bulleted"
6. Framework recommends a roster based on issue content: "Based on this issue, I recommend: BA, Architecture, System Design, Security. Add/remove as you like."
7. User removes BA, adds DevOps
8. Analysis proceeds with Architecture, System Design, Security, DevOps personas in bulleted mode
9. Artifacts produced as normal

### Journey 3: Roundtable with all defaults accepted

1. User runs analyze on a backlog item
2. Framework asks how to run analysis
3. User chooses "with personas"
4. User chooses "conversational"
5. Framework recommends roster — user says "looks good"
6. Full conversational roundtable proceeds
7. Artifacts produced as normal

## 4. Technical Context

### Existing Infrastructure (from REQ-0047)

- `persona-loader.cjs` — discovers built-in + user personas, override-by-copy, version drift detection
- `roundtable-config.cjs` — reads `.isdlc/roundtable.yaml` (verbosity, default_personas, disabled_personas)
- `roundtable-analyst.md` — orchestrates roundtable with persona loading, roster proposal, verbosity rendering
- `analyze-item.cjs` — resolves backlog items, assembles dispatch context including persona paths
- `common.cjs` session cache — inlines ROUNDTABLE_CONTEXT into system prompt
- `--personas` flag on analyze — pre-selects roster
- `--verbose` / `--silent` flags — per-analysis verbosity override

### Constraints

- Antigravity platform: single-threaded, no parallel sub-agents
- Persona files are markdown with YAML frontmatter — no code execution
- Session cache is rebuilt by `prime-session.cjs` — persona context is inlined at cache build time
- The `PERSONA_CONTEXT` in the session cache currently includes all 3 primary personas always

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Usability | Critical | Mode selection adds ≤ 2 questions to the analyze flow |
| Backward compatibility | High | Existing `roundtable.yaml` configs continue to work as preference pre-population |
| Fail-open | High | If mode selection is skipped (e.g., direct `/isdlc analyze --silent`), framework proceeds with the flag's intent |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Users always skip personas, missing valuable analysis | Medium | Medium | Recommend personas by default; make the "with personas" path easy |
| Removing all personas produces shallow artifacts | Medium | Low | "No personas" mode is explicitly a user choice — they accept the trade-off |
| Breaking existing analyze flows that expect roundtable | Low | High | Flags (`--silent`, `--personas`) continue to work and bypass the mode question |

## 6. Functional Requirements

### FR-001: Upfront Analysis Mode Selection
**Priority**: Must Have | **Confidence**: High

When the analyze verb starts, the framework SHALL ask the user how they want to run the analysis before proceeding.

**Acceptance Criteria**:
- AC-001-01: Framework presents two options: "with personas (roundtable)" or "straight analysis (no personas)"
- AC-001-02: If user chooses "no personas", no persona files are loaded and no persona influence is applied
- AC-001-03: If user chooses "with personas", framework proceeds to verbosity selection (FR-002) then roster selection (FR-003)
- AC-001-04: The question is conversational, not a numbered menu (consistent with roundtable UX)
- AC-001-05: If `--silent` flag is passed, mode is "personas + silent" — skip the mode question
- AC-001-06: If `--personas` flag is passed, mode is "with personas" — skip the mode question, proceed to verbosity then roster with pre-selection
- AC-001-07: If `--no-roundtable` flag is passed, mode is "no personas" — skip the mode question entirely

### FR-002: Verbosity Selection
**Priority**: Must Have | **Confidence**: High

When the user chooses "with personas", the framework SHALL ask which conversation style they want.

**Acceptance Criteria**:
- AC-002-01: Three options presented: conversational, bulleted, silent
- AC-002-02: If `.isdlc/roundtable.yaml` has a `verbosity` preference, it is shown as the pre-selected default
- AC-002-03: User's choice applies for the entire analysis session
- AC-002-04: The question is skipped if a verbosity flag was passed (`--verbose`, `--silent`)

### FR-003: Dynamic Roster Selection
**Priority**: Must Have | **Confidence**: High

The framework SHALL recommend a persona roster based on issue content and allow the user to freely add or remove any persona, including the three primaries.

**Acceptance Criteria**:
- AC-003-01: All available personas (built-in + user) are considered for recommendation
- AC-003-02: Primary personas (Maya, Alex, Jordan) are recommended by default but NOT forced — user can remove any of them
- AC-003-03: Trigger-keyword matching determines which contributing personas are recommended
- AC-003-04: Roster proposal shows: recommended personas, uncertain matches ("also considering"), and remaining available personas
- AC-003-05: User can add or remove any persona from the recommendation
- AC-003-06: If user removes all personas, framework confirms intent and falls back to "no personas" mode
- AC-003-07: `disabled_personas` from `roundtable.yaml` are excluded from recommendations but still shown under "available" so the user can override
- AC-003-08: `default_personas` from `roundtable.yaml` are included in recommendations alongside trigger matches

### FR-004: No-Persona Analysis Mode
**Priority**: Must Have | **Confidence**: High

When the user chooses "no personas", the framework SHALL run a clean analysis pass that produces all standard artifacts without loading or being influenced by any persona files.

**Acceptance Criteria**:
- AC-004-01: No persona files are loaded (not even internally)
- AC-004-02: No persona voice, framing, or identity appears in conversation or artifacts
- AC-004-03: All standard artifacts are produced: requirements-spec.md, impact-analysis.md, architecture-overview.md, module-design.md
- AC-004-04: The analysis uses the topic files and analytical knowledge directly, without persona mediation
- AC-004-05: Meta.json records `analysis_mode: "no-personas"` for traceability

### FR-005: Remove Primary Persona Hardcoding
**Priority**: Must Have | **Confidence**: High

The framework SHALL treat primary personas (Maya, Alex, Jordan) as recommended defaults, not mandatory participants.

**Acceptance Criteria**:
- AC-005-01: `PRIMARY_PERSONAS` constant in `persona-loader.cjs` is no longer used to force inclusion
- AC-005-02: `roundtable-analyst.md` references "active personas" instead of "three personas" throughout
- AC-005-03: Section 1.1 loads personas dynamically from the roster, not from hardcoded file paths
- AC-005-04: Section 2.2 rule "All three personas engage within first 3 exchanges" becomes "All active personas engage within first 3 exchanges"
- AC-005-05: Confirmation sequence (Section 2.5) adapts to whichever personas are active — domains without an active persona still get artifacts but without persona-specific review
- AC-005-06: Session cache ROUNDTABLE_CONTEXT includes all available personas (for recommendation), not just the three primaries

### FR-006: Config as Preference Pre-population
**Priority**: Should Have | **Confidence**: High

`.isdlc/roundtable.yaml` SHALL serve as preference pre-population for the upfront questions, not as silent defaults.

**Acceptance Criteria**:
- AC-006-01: `verbosity` value pre-selects the verbosity option but user is still asked
- AC-006-02: `default_personas` pre-populate the recommendation but user is still asked
- AC-006-03: `disabled_personas` exclude personas from recommendation but they remain available for manual addition
- AC-006-04: Existing roundtable.yaml files continue to work without modification
- AC-006-05: If no roundtable.yaml exists, framework uses sensible defaults for pre-population (bulleted, 3 primaries recommended)

### FR-007: Persona Authoring Documentation
**Priority**: Must Have | **Confidence**: High

The framework SHALL include documentation explaining how to create, override, and configure personas.

**Acceptance Criteria**:
- AC-007-01: Documentation covers: creating a new persona from the Domain Expert template
- AC-007-02: Documentation covers: overriding a built-in persona (copy to `.isdlc/personas/`, modify)
- AC-007-03: Documentation covers: disabling personas via `roundtable.yaml`
- AC-007-04: Documentation covers: the four analysis modes and when to use each
- AC-007-05: Documentation covers: the frontmatter schema (name, description, role_type, triggers, owned_skills, version)
- AC-007-06: Documentation is placed in a discoverable location (linked from main README or CLAUDE.md)

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Persona management CLI (`/isdlc persona list/add/remove`) | User explicitly decided against this — file-based management is sufficient |
| Expanded built-in persona catalog | Current 8 personas (3 primary + 5 contributing) are sufficient. Users extend via `.isdlc/personas/` |
| Artifact ownership model changes | Artifacts are produced by the analysis phase, not owned by personas. No transfer needed |
| Persona parameter tuning layer | Override-by-copy is sufficient — users modify the full file |
| Per-analysis persona memory/learning | Deferred to #113 (roundtable memory layer) |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Upfront Analysis Mode Selection | Must Have | Core user control — the entry point for all other changes |
| FR-002 | Verbosity Selection | Must Have | Required for personas mode — user must choose conversation style |
| FR-003 | Dynamic Roster Selection | Must Have | Core hackability — removing primary persona forcing |
| FR-004 | No-Persona Analysis Mode | Must Have | Clean alternative to roundtable — validates artifact independence |
| FR-005 | Remove Primary Persona Hardcoding | Must Have | Technical enabler for FR-003 — without this, primaries can't be removed |
| FR-006 | Config as Preference Pre-population | Should Have | Quality of life — remembers user preferences without hiding control |
| FR-007 | Persona Authoring Documentation | Must Have | Users need to know how to extend the system |

## Pending Sections

*All sections complete.*
