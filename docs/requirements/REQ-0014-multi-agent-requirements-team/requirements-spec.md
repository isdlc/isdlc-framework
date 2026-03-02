# Requirements Specification: Multi-Agent Requirements Team

**ID:** REQ-0014
**Artifact Folder:** REQ-0014-multi-agent-requirements-team
**Status:** Draft
**Created:** 2026-02-14
**Priority:** Must Have
**BACKLOG.md Reference:** Item 4.1 (Phase 01), related to 8.3 (elicitation redesign)

---

## 1. Project Overview

### Problem Statement
Phase 01 (Requirements) currently uses a single agent (requirements-analyst) to produce all requirements artifacts. This agent operates in isolation -- it cannot self-critique, challenge its own assumptions, or catch its own blind spots. The result is requirements that may contain vague acceptance criteria, unmeasured NFRs, missing edge cases, and unstated assumptions. These defects propagate through the entire SDLC and are only caught (if at all) in later phases when the cost of rework is significantly higher.

The deep discovery Inception Party (`/discover --new`) already demonstrates that a multi-agent debate produces substantially better artifacts than single-agent generation. This feature extends that proven pattern to Phase 01 of the feature workflow.

### Business Drivers
- **Quality of requirements**: Vague ACs and unmeasured NFRs cause rework in Phases 03-06. A Critic catching these at Phase 01 eliminates downstream waste.
- **Completeness**: A dedicated Critic checks for orphan requirements, missing edge cases, contradictions, and unstated assumptions -- defects a single agent consistently misses.
- **Testability**: A Refiner ensures every AC uses Given/When/Then format with quantified NFRs, making Phase 05 (test strategy) and Phase 06 (implementation) significantly more effective.
- **Proven pattern**: The Inception Party precedent (party-personas.json, discover-orchestrator.md) demonstrates multi-agent debate works within the framework.

### Success Criteria
1. When debate mode is active, Phase 01 produces requirements with zero vague/untestable ACs (Critic catches all)
2. Every AC in the final output uses Given/When/Then format (Refiner ensures)
3. All NFRs have quantified metrics (Refiner ensures)
4. Single-agent mode (current behavior) is preserved and works unchanged for `-light` workflows and `--no-debate` flag
5. Max 3 debate rounds with convergence when Critic has zero blocking findings
6. Each round produces a versioned diff so progress is visible

### Scope
- **In scope**: Phase 01 debate loop (Creator/Critic/Refiner), `--debate`/`--no-debate` flags, convergence logic, round tracking, artifact versioning, backlog 8.3 integration (conversational Creator)
- **Out of scope**: Phase 03/04/06 debate loops (future backlog items), new hooks for debate enforcement, Inception Party refactoring

---

## 2. Stakeholders & Personas

### Primary Persona: Framework Developer
- **Role:** Developer using iSDLC for feature development (dogfooding)
- **Goal:** Produce high-quality, testable requirements without manual review iteration
- **Context:** Solo developer running standard feature workflows
- **Pain point:** Requirements artifacts occasionally have vague ACs, unmeasured NFRs, or missing edge cases that only surface in Phase 05-06

### Secondary Persona: Framework User (Future)
- **Role:** External developer who installed iSDLC via npm
- **Goal:** Benefit from improved requirements quality automatically
- **Context:** May use `-light` mode where debate is off, or standard mode where debate is on
- **Pain point:** Doesn't know what good requirements look like; needs the framework to enforce quality

---

## 3. Functional Requirements

### FR-001: Creator Role (Enhanced Requirements-Analyst)
- **Description:** The existing requirements-analyst agent acts as Creator in debate mode. It produces the initial requirements-spec.md, user-stories.json, NFR matrix, and traceability matrix.
- **Behavior change:** When debate mode is active, Creator produces artifacts labeled as "Round 1 Draft" and passes them to the Critic. Creator also incorporates the conversational, context-aware interaction pattern from backlog item 8.3 -- reflecting the user's description back, asking targeted follow-ups rather than generic questions, and using the 5 discovery lenses organically.
- **No behavior change when debate is off:** Single-agent mode works exactly as today.
- **Priority:** Must Have

### FR-002: Critic Role (New Agent)
- **Description:** A new agent (`01-requirements-critic`) that reviews Creator's output and produces a structured critique report.
- **Critic catches:** Vague/untestable ACs, orphan requirements (no user story link), unmeasured NFRs (qualitative instead of quantitative), scope creep (requirements beyond stated problem), missing compliance requirements, contradictions between requirements, missing edge cases, unstated assumptions.
- **Output:** Structured critique with findings classified as BLOCKING (must fix) or WARNING (recommended improvement). Each finding references a specific requirement ID, AC ID, or NFR ID.
- **Priority:** Must Have

### FR-003: Refiner Role (New Agent)
- **Description:** A new agent (`01-requirements-refiner`) that takes Creator's artifacts + Critic's findings and produces improved artifacts.
- **Refiner produces:** Testable Given/When/Then for every AC, quantified NFRs (with measurable metrics), complete traceability (all requirements linked to stories), risk mitigation for identified risks, explicit assumption register.
- **Output:** Updated requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv with all blocking findings addressed.
- **Priority:** Must Have

### FR-004: Debate Loop Orchestration
- **Description:** The orchestrator manages the Creator-Critic-Refiner loop within Phase 01.
- **Flow:**
  1. Creator produces Round 1 artifacts
  2. Critic reviews and produces findings report
  3. If blocking findings > 0: Refiner improves artifacts, round increments, go to step 2
  4. If blocking findings == 0 (warnings allowed): Debate converges, final artifacts saved
  5. Max 3 rounds -- if not converged by round 3, save latest artifacts with unconverged warnings noted
- **Round tracking:** Each round's artifacts and critique stored with round number for visibility
- **Priority:** Must Have

### FR-005: Debate Mode Configuration
- **Description:** Debate mode is configurable via flags and workflow settings.
- **Activation rules:**
  - ON by default for `standard` and `epic` sizing
  - OFF by default for `-light` flag
  - Override with `--debate` to force ON (even for light)
  - Override with `--no-debate` to force OFF (even for standard)
  - Per-phase opt-in via constitution `debate_phases` article (future-ready, not enforced in this feature)
- **Configuration storage:** `active_workflow.debate_mode` in state.json (boolean)
- **Priority:** Must Have

### FR-006: Artifact Versioning per Round
- **Description:** Each debate round produces a versioned snapshot of the artifacts so progress is visible.
- **Storage:** Within the artifact folder, round snapshots stored as `round-N-critique.md` files. Final artifacts overwrite the standard names (requirements-spec.md, user-stories.json, etc.).
- **Visibility:** After convergence, a `debate-summary.md` summarizes rounds, findings per round, and what changed.
- **Priority:** Should Have

### FR-007: Conversational Creator (8.3 Integration)
- **Description:** The Creator role (requirements-analyst) uses a conversational, context-aware interaction pattern instead of the cold generic 3-question opening.
- **Behavior:**
  1. Reflect first -- acknowledge and summarize the feature description the user already provided
  2. Contextual follow-up -- ask ONE targeted question based on what's actually missing, not 3 generic ones
  3. Organic lens exploration -- use the 5 lenses (Business/User/UX/Tech/Quality) naturally as conversation flows, not as rigid sequential stages
  4. Discovery context integration -- leverage discovery_context from state.json to skip already-known tech stack details
- **Backward compatible:** When debate is OFF, the conversational pattern still applies (it improves single-agent mode too)
- **Priority:** Should Have

### FR-008: Orchestrator Delegation Updates
- **Description:** The sdlc-orchestrator's Phase 01 delegation must support debate mode.
- **Changes:**
  1. When debate is ON: delegate to Creator, then Critic, then Refiner in a loop
  2. When debate is OFF: delegate to requirements-analyst as today (single agent)
  3. Pass debate configuration in delegation context
  4. Track debate state (round number, convergence status) in active_workflow
- **Priority:** Must Have

---

## 4. Non-Functional Requirements

### NFR-001: Debate Loop Performance
- **Category:** Performance
- **Requirement:** A 3-round debate must complete within 15 minutes total
- **Metric:** Wall clock time from Creator start to final artifact save
- **Measurement:** Workflow metrics in state.json
- **Priority:** Should Have

### NFR-002: Backward Compatibility
- **Category:** Compatibility
- **Requirement:** All existing Phase 01 behavior must be preserved when debate mode is OFF
- **Metric:** Existing test suite passes with zero regressions
- **Measurement:** CI pipeline, existing test assertions
- **Priority:** Must Have

### NFR-003: Single-Agent Mode Parity
- **Category:** Compatibility
- **Requirement:** `-light` workflows must produce identical artifacts to current behavior
- **Metric:** No behavioral differences when `--no-debate` or `-light` is active
- **Measurement:** Diff of artifacts between debate-off and current production
- **Priority:** Must Have

### NFR-004: Convergence Guarantee
- **Category:** Reliability
- **Requirement:** The debate loop must always terminate (max 3 rounds hard limit)
- **Metric:** No infinite loops, no hangs. Loop exits on convergence OR round limit.
- **Measurement:** Unit tests for convergence logic
- **Priority:** Must Have

### NFR-005: Extensibility
- **Category:** Maintainability
- **Requirement:** The debate loop pattern must be extensible to Phases 03, 04, 06 without structural changes
- **Metric:** Debate orchestration logic is generic (not Phase-01-specific). Agent roles are injected, not hardcoded.
- **Measurement:** Architecture review -- could Phase 03 reuse this with different Creator/Critic/Refiner agents?
- **Priority:** Should Have

---

## 5. Constraints

### CON-001: No New Runtime Dependencies
- The debate loop must use existing framework capabilities (Task tool, state.json, agent delegation). No new npm packages.

### CON-002: CJS Hook Compatibility
- Any new hooks must be `.cjs` files per Article XII. However, this feature does not require new hooks -- debate orchestration is prompt-level.

### CON-003: Agent File Convention
- New Critic and Refiner agents must follow existing naming convention: `NN-agent-name.md` in `src/claude/agents/`.

---

## 6. Assumptions

- A-001: The Task tool can run sub-agents sequentially within a single Phase 01 delegation (Creator -> Critic -> Refiner loop managed by orchestrator or a debate-orchestrator sub-agent)
- A-002: Three debate rounds are sufficient for convergence in typical feature workflows (based on Inception Party precedent)
- A-003: The Critic can operate on artifacts alone (does not need direct user interaction)
- A-004: The Refiner can address all blocking findings without user input (escalates to user only if stuck)

---

## 7. Out of Scope

- Phase 03 (Architecture) debate loop -- future backlog item
- Phase 04 (Design) debate loop -- future backlog item
- Phase 06 (Implementation) Writer/Reviewer/Updater loop -- future backlog item (different pattern)
- New hooks for debate enforcement
- Inception Party refactoring to share debate infrastructure
- Constitution `debate_phases` article enforcement (placeholder only)

---

## 8. Glossary

| Term | Definition |
|------|-----------|
| Creator | The agent that produces the initial artifact draft (requirements-analyst in Phase 01) |
| Critic | The agent that reviews and challenges the Creator's output |
| Refiner | The agent that synthesizes improvements from Critic's findings |
| Debate round | One complete Creator -> Critic -> Refiner cycle |
| Convergence | When the Critic produces zero BLOCKING findings (warnings allowed) |
| Debate mode | The configuration toggle that enables/disables the multi-agent debate loop |
| BLOCKING finding | A critique that must be addressed before convergence (vague AC, unmeasured NFR) |
| WARNING finding | A recommended improvement that does not block convergence |
