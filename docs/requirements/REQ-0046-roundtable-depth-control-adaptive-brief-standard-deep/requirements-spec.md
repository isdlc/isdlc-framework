# Requirements Specification — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 95%

---

## 1. Business Context

### 1.1 Problem Statement

The roundtable analysis has one depth: thorough. Developers working on straightforward changes (e.g., "add a config flag", "change button color") endure 8+ rounds of probing questions that provide diminishing value. Conversely, complex or critical changes may benefit from deeper analysis than the default provides. The roundtable currently has no mechanism to adapt its depth to the user's engagement level or the task's actual complexity.

### 1.2 Success Metrics

- Developers perceive analysis depth as appropriate to their task complexity
- Simple tasks complete roundtable analysis in fewer exchanges than today (target: 3-5 total vs current 8+)
- Complex tasks receive deeper probing when the user signals engagement
- No increase in assumption-related amendments during confirmation (assumptions are surfaced, not hidden)

### 1.3 Driving Factors

- Part of the Hackability & Extensibility Roadmap (Tier 1 Foundation, Layer 1 Configure)
- Early user feedback: "Many questions at roundtable" identified as friction point
- Invisible framework principle: depth should adapt without explicit flags or commands

---

## 2. Stakeholders and Personas

### 2.1 Primary User: Developer Running Analysis

- **Role**: Software developer using iSDLC to analyze a backlog item before building
- **Goals**: Get through analysis at a pace matching the task's actual complexity; avoid repetitive probing on straightforward work; receive thorough analysis on complex work without asking for it
- **Pain Points**: Currently forced into thorough analysis regardless of task simplicity; no way to signal "this is straightforward" without using the --light flag (which also skips phases)
- **Proficiency**: Familiar with the roundtable flow; may or may not know about --light flag

### 2.2 Secondary Stakeholder: Framework Maintainer

- **Role**: Developer maintaining the iSDLC framework itself
- **Interest**: Clean separation of depth (how deep per topic) from scope (which phases to run); maintainable prompt instructions; consistent behavior across Claude Code and Antigravity

---

## 3. User Journeys

### 3.1 Simple Task Journey

- **Entry**: Developer says "build -- just add a config flag for retry behavior"
- **Flow**: Roundtable opens with Maya. Developer gives brief, direct answers. Roundtable senses brevity, reduces probing depth across topics. Analysis completes in 3-5 exchanges. Confirmation shows topic-level assumptions. Developer accepts. Scope recommendation: light (skip architecture/design).
- **Exit**: Artifacts written, meta.json updated with scope recommendation.

### 3.2 Complex Task Journey

- **Entry**: Developer says "build -- redesign the authentication flow"
- **Flow**: Roundtable opens with Maya. Developer gives detailed, engaged answers. Roundtable senses engagement, probes deeper on security and architecture topics. Developer signals fatigue on error handling -- roundtable accelerates there, logs assumptions. Confirmation shows topic-level assumptions with 2 inferred items on error handling. Developer expands to FR-level detail on error handling, amends one assumption. Scope recommendation: standard.
- **Exit**: Artifacts written with amendments incorporated.

### 3.3 Mixed Depth Journey

- **Entry**: Developer analyzes a feature touching both familiar and unfamiliar areas
- **Flow**: Developer gives terse answers on familiar topics (roundtable goes brief), engages deeply on unfamiliar topics (roundtable goes deep). Each topic independently calibrated. Confirmation surfaces assumptions from brief topics prominently.
- **Exit**: Artifacts reflect mixed confidence -- high on deeply explored topics, medium on briefly explored ones.

---

## 4. Functional Requirements

### FR-001: Dynamic Depth Sensing

The roundtable agent MUST dynamically adjust its probing depth per topic based on the user's conversational signals within the current session. Depth is determined by LLM judgment reading the user's tone, answer length, engagement level, and explicit language cues -- not by flags, keyword detection rules, or static tier mappings.

**Priority**: Must Have
**Confidence**: High

**AC-001-01**: When a user provides terse, single-sentence answers on a topic, the roundtable reduces probing depth for that topic within the current exchange (observable: fewer follow-up questions, acceptance of surface-level answers).

**AC-001-02**: When a user provides detailed, multi-sentence answers with questions of their own, the roundtable increases probing depth for that topic (observable: deeper follow-ups, edge case exploration, assumption challenging).

**AC-001-03**: Depth sensing operates independently per topic -- brief on one topic does not force brief on all topics within the same session.

**AC-001-04**: The `depth_guidance` content in topic files is used as calibration reference (what brief/standard/deep behavior looks like for each topic) rather than as prescriptive exchange count rules.

### FR-002: Bidirectional Depth Adjustment

The roundtable agent MUST support depth adjustment in both directions during a single session -- deepening when the user engages and accelerating when the user signals fatigue or disinterest.

**Priority**: Must Have
**Confidence**: High

**AC-002-01**: If a user who was previously engaged begins giving shorter answers or signals like "yeah that's fine", "sure", "whatever you think", the roundtable accelerates remaining topics (observable: fewer probing questions, more inference-based coverage).

**AC-002-02**: If a user who was previously brief begins engaging with longer answers or asks clarifying questions, the roundtable deepens its probing (observable: more follow-up questions, edge case exploration).

### FR-003: Inference Tracking

The roundtable agent MUST track every inference made during analysis where the roundtable filled a gap rather than receiving explicit user input. Each inference record includes: what was assumed, why (the signal that triggered it), confidence level (Medium or Low), and which topic and FR(s) it affects.

**Priority**: Must Have
**Confidence**: High

**AC-003-01**: Every inference is recorded internally during the conversation with: assumption text, trigger reason (e.g., "user gave brief answer on error handling", "inferred from codebase patterns"), confidence level (Medium or Low), affected topic ID, and affected FR ID(s) if applicable.

**AC-003-02**: Inferences made because the user was brief on a topic are tagged with trigger reason referencing the depth acceleration.

**AC-003-03**: Inferences made from codebase analysis alone (no user input on the topic) are tagged as Low confidence.

### FR-004: Tiered Assumption Views in Confirmation

During the confirmation sequence, each domain summary MUST include an "Assumptions and Inferences" section. The default view shows topic-level summaries. The user can request FR-level detail on demand.

**Priority**: Must Have
**Confidence**: High

**AC-004-01**: Each confirmation summary (requirements, architecture, design) includes an "Assumptions and Inferences" section after the main content.

**AC-004-02**: The default view presents assumptions grouped by topic with a count and summary (e.g., "Error Handling: 3 assumptions -- inferred standard error propagation pattern from codebase").

**AC-004-03**: When the user requests detail (e.g., "show me the details", "what did you assume about error handling"), the roundtable expands to FR-level detail showing each individual inference with its confidence level and rationale.

**AC-004-04**: The tiered view is conversational -- the user asks naturally and the persona responds with the appropriate level of detail. No menus or UI toggles.

### FR-005: Scope Recommendation as Analysis Output

The roundtable MUST produce a scope recommendation (trivial, light, standard, or epic) as an output of the analysis conversation, based on complexity assessed during the discussion. This recommendation is confirmed with the user before being recorded.

**Priority**: Must Have
**Confidence**: High

**AC-005-01**: Before entering the confirmation sequence, the roundtable presents its scope assessment to the user: "This looks like a [trivial/light/standard/epic] change -- [brief rationale]. Does that match your sense?"

**AC-005-02**: The user can agree or override the scope recommendation.

**AC-005-03**: The accepted scope is recorded in meta.json as `recommended_scope` with fields: `scope` (trivial/light/standard/epic), `rationale`, `user_confirmed` (boolean), `user_override` (null or the original recommendation if overridden).

**AC-005-04**: The scope recommendation determines which downstream build phases are warranted (trivial: skip all analysis phases; light: skip architecture/design; standard: all phases; epic: all phases with deep treatment).

### FR-006: Deprecation of --light Flag for Depth/Scope

The `--light` flag MUST be decoupled from depth control. Depth is determined dynamically (FR-001). Scope is determined by the roundtable's recommendation (FR-005). The `--light` flag is deprecated as an input mechanism for controlling analysis depth or phase skipping.

**Priority**: Should Have
**Confidence**: Medium

**AC-006-01**: The roundtable agent ignores the `--light` flag for depth calibration purposes. Depth is always LLM-judged.

**AC-006-02**: If `--light` is passed, the framework emits a deprecation notice: "The --light flag is deprecated. The roundtable now adapts depth automatically and recommends scope based on the conversation."

**AC-006-03**: The `--light` flag continues to function during a transition period (it pre-sets the scope recommendation to "light" as a starting suggestion that the roundtable can confirm or override with the user).

**AC-006-04**: The `effective_intensity` field in `sizing_decision` remains functional for build workflow phase skipping but is populated from the roundtable's `recommended_scope` output rather than from the `--light` flag.

### FR-007: Topic File Depth Guidance Restructuring

The `depth_guidance` blocks in all 6 topic files MUST be restructured from prescriptive exchange counts to behavioral calibration descriptions that the LLM uses as reference for what brief, standard, and deep engagement looks like per topic.

**Priority**: Must Have
**Confidence**: High

**AC-007-01**: Each topic file's `depth_guidance` section describes behavioral characteristics rather than exchange counts (e.g., "brief: Accept the user's framing. Validate for testability. Fill gaps from codebase analysis." rather than "brief: 1-2 questions max").

**AC-007-02**: The roundtable-analyst.md depth-aware sufficiency table (current lines 354-360) is replaced with instructions for dynamic depth sensing that reference the topic files' behavioral descriptions.

---

## 5. Non-Functional Requirements

### NFR-001: No Perceptible Latency

Dynamic depth sensing MUST NOT add perceptible latency to roundtable exchanges. All depth calibration happens within the LLM's normal response generation -- no external lookups, no additional tool calls for depth decisions.

### NFR-002: Invisible Framework Compliance

Depth adaptation MUST be invisible to the user. The roundtable never announces depth changes ("I'm switching to brief mode") or exposes internal depth state. The user experiences a natural conversation that happens to match their pace.

### NFR-003: Backward Compatibility During Transition

Existing workflows using `--light` MUST continue to function during the deprecation period. The flag pre-sets scope but does not override dynamic depth sensing.

### NFR-004: Platform Parity

Dynamic depth sensing and assumption tracking MUST work identically in Claude Code (Task-based roundtable) and Antigravity (single-thread roundtable).

---

## 6. Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Responsiveness | Must Have | No additional latency per exchange |
| Transparency | Must Have | All assumptions surfaced during confirmation |
| Adaptiveness | Must Have | Depth adjusts within 1-2 exchanges of user signal change |
| Consistency | Should Have | Similar tasks produce similar depth patterns (enhanced by future memory layer GH-113) |

---

## 7. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM inconsistency: same input produces different depth across sessions | Medium | Medium | Topic file calibration descriptions provide guardrails; future memory layer (GH-113) adds consistency |
| Over-acceleration: roundtable goes too brief and misses critical requirements | Low | High | Assumption tracking + confirmation views ensure nothing is hidden; user can amend |
| Under-acceleration: roundtable doesn't sense fatigue signals well enough | Medium | Low | Iterative prompt tuning; behavioral descriptions in topic files can be refined |
| Scope recommendation disagreements: user and roundtable disagree on complexity | Low | Low | User always has final say via confirmation; explicit "agreed?" step |

---

## 8. Out of Scope

- **Roundtable memory layer** (user-level and project-level memory across sessions) -- deferred to GH-113
- **Build workflow changes** to consume `recommended_scope` from meta.json -- separate follow-on (build workflow currently reads `effective_intensity` from `sizing_decision`)
- **Signal word detection rules** -- explicitly rejected in favor of LLM judgment
- **Per-user configuration files** for depth preferences -- deferred to memory layer
- **Gate profile system** -- separate hackability roadmap item
- **Workflow recovery (retry/redo/rollback)** -- separate hackability roadmap item

---

## 9. Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Semantic search backend (REQ-0045) | Future enhancement (for GH-113 memory layer) | Shipped (all 6 groups complete) |
| Roundtable analyst agent (REQ-0027) | Foundation | Shipped |
| Topic files with depth_guidance | Foundation | Exist in codebase |
| Confirmation sequence in roundtable | Foundation | Implemented |
| Confidence indicators on FRs | Foundation | Implemented |

---

## 10. Traceability

| FR | Source | Draft Reference |
|----|--------|----------------|
| FR-001 | User conversation (dynamic over flag-based) | Replaces draft's "wire --light flag" approach |
| FR-002 | User conversation (fatigue sensing) | New -- not in original draft |
| FR-003 | User conversation (assumption surfacing) | New -- not in original draft |
| FR-004 | User conversation (tiered views) | New -- not in original draft |
| FR-005 | User conversation (scope as output) | Replaces draft's flag-based scope |
| FR-006 | User conversation (deprecate --light) | Replaces draft's "wire --light flag" approach |
| FR-007 | User conversation + codebase analysis | Extends draft's "topic files have depth_guidance" |
