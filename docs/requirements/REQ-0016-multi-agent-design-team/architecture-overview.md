# Architecture Overview: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 03-architecture
**Created:** 2026-02-15
**Status:** Accepted
**Prior Art:** REQ-0014 (Phase 01 debate loop), REQ-0015 (Phase 03 debate loop, generalized routing)

---

## 1. Architecture Approach

This feature **extends** the existing generalized debate loop infrastructure established in REQ-0014 and REQ-0015. The debate engine in the orchestrator's Section 7.5 already supports multi-phase routing via the DEBATE_ROUTING table. This feature adds the third routing entry (Phase 04) plus two new agent files.

**Key Architectural Constraint:** No new runtime code, no new hooks, no new npm dependencies. The debate loop generalization was completed in REQ-0015. This feature is purely additive: 2 new agent files, 3 modified files. (Article V: Simplicity First)

**Prior Art Summary:**
- REQ-0014 created the debate loop for Phase 01 (requirements) with hardcoded agents
- REQ-0015 generalized Section 7.5 into a multi-phase routing table with Phase 01 + Phase 03 entries
- REQ-0016 adds a Phase 04 entry and two domain-specific agents

| Existing Component | Extension | FR(s) |
|-------------------|-----------|-------|
| `00-sdlc-orchestrator.md` (Section 7.5, DEBATE_ROUTING table) | Add one row for Phase 04: `04-design -> 03-system-designer.md / 03-design-critic.md / 03-design-refiner.md` | FR-003 |
| `03-system-designer.md` | Add DEBATE_CONTEXT Creator role awareness (self-assessment section when mode=creator) | FR-004 |
| `src/claude/commands/isdlc.md` | Update debate-enabled phases description to include "Phase 04 (Design)" | FR-003 |

| New Component | Type | FR(s) |
|--------------|------|-------|
| `03-design-critic.md` | New agent (markdown) | FR-001, FR-006 |
| `03-design-refiner.md` | New agent (markdown) | FR-002 |

---

## 2. System Context (C4 Level 1)

```
                         +-----------------------+
                         |      Developer         |
                         | (iSDLC User)           |
                         +----------+------------+
                                    |
                   /isdlc feature "description" [--debate|--no-debate]
                                    |
                         +----------v------------+
                         |    Claude Code CLI     |
                         | (CLAUDE.md loaded)     |
                         +----------+------------+
                                    |
                     Phase-Loop Controller (Task tool delegation)
                                    |
            +-----------------------v-----------------------+
            |              iSDLC Framework                   |
            |                                               |
            |  +------------------------------------------+ |
            |  | isdlc.md (command spec)                   | |
            |  |  - Parse --debate / --no-debate flags     | |
            |  |  - Pass debate config to orchestrator     | |
            |  +------------------------------------------+ |
            |                                               |
            |  +------------------------------------------+ |
            |  | 00-sdlc-orchestrator.md                   | |
            |  |  - Resolve debate_mode (flag > sizing)    | |
            |  |  - DEBATE_ROUTING table (3 phases)        | |
            |  |  - IF debate ON: Creator-Critic-Refiner   | |
            |  |  - IF debate OFF: single-agent mode       | |
            |  +------------------------------------------+ |
            |                                               |
            |  PHASE 01 AGENTS:                             |
            |  +------------------------------------------+ |
            |  | 01-requirements-analyst.md (Creator)      | |
            |  | 01-requirements-critic.md  (Critic)       | |
            |  | 01-requirements-refiner.md (Refiner)      | |
            |  +------------------------------------------+ |
            |                                               |
            |  PHASE 03 AGENTS:                             |
            |  +------------------------------------------+ |
            |  | 02-solution-architect.md   (Creator)      | |
            |  | 02-architecture-critic.md  (Critic)       | |
            |  | 02-architecture-refiner.md (Refiner)      | |
            |  +------------------------------------------+ |
            |                                               |
            |  PHASE 04 AGENTS:                             |
            |  +------------------------------------------+ |
            |  | 03-system-designer.md      (Creator) [MOD]| |
            |  | 03-design-critic.md        (Critic) [NEW] | |
            |  | 03-design-refiner.md       (Refiner)[NEW] | |
            |  +------------------------------------------+ |
            |                                               |
            |  +---------------------+                      |
            |  | state.json          |  (debate_state)      |
            |  +---------------------+                      |
            +-----------------------------------------------+
```

---

## 3. Key Architectural Decisions Summary

| Decision | Choice | ADR |
|----------|--------|-----|
| Extend existing DEBATE_ROUTING vs. new mechanism | Add one row to existing routing table (no loop logic changes) | ADR-0001 |
| Agent naming convention for Phase 04 debate agents | `03-design-critic.md`, `03-design-refiner.md` (prefix matches Phase 04 agent numbering) | ADR-0002 |
| Design-specific critique taxonomy (8 categories) | Domain-adapted from architecture critic pattern, not copied verbatim | ADR-0003 |
| Critical artifact for Phase 04 debate | `interface-spec.yaml` (or `openapi.yaml` for REST projects) | ADR-0004 |

---

## 4. Component Architecture

### 4.1 DEBATE_ROUTING Extension (FR-003)

The orchestrator's DEBATE_ROUTING table gains one row. No changes to the debate loop pseudocode, convergence logic, or state management are required -- these were generalized in REQ-0015.

**Updated Phase Routing Table:**

```
DEBATE_ROUTING = {
  "01-requirements": {
    "creator":  "01-requirements-analyst.md",
    "critic":   "01-requirements-critic.md",
    "refiner":  "01-requirements-refiner.md",
    "artifacts": ["requirements-spec.md", "user-stories.json", "nfr-matrix.md", "traceability-matrix.csv"],
    "critical_artifact": "requirements-spec.md"
  },
  "03-architecture": {
    "creator":  "02-solution-architect.md",
    "critic":   "02-architecture-critic.md",
    "refiner":  "02-architecture-refiner.md",
    "artifacts": ["architecture-overview.md", "tech-stack-decision.md", "database-design.md", "security-architecture.md"],
    "critical_artifact": "architecture-overview.md"
  },
  "04-design": {
    "creator":  "03-system-designer.md",
    "critic":   "03-design-critic.md",
    "refiner":  "03-design-refiner.md",
    "artifacts": ["interface-spec.yaml", "module-designs/", "error-taxonomy.md", "validation-rules.json"],
    "critical_artifact": "interface-spec.yaml"
  }
}
```

**Design Note on Critical Artifact:** The critical artifact is `interface-spec.yaml` (or `openapi.yaml` depending on project type). Per AC-003-03, the orchestrator checks for the existence of this artifact after Creator delegation. If the project uses REST APIs, the Creator may produce `openapi.yaml` instead -- the Critic adapts its checks to the actual interface type (AC-007-04).

**Key Design Principle (unchanged from REQ-0015):** The orchestrator is the sole coordinator. The Creator, Critic, and Refiner are stateless sub-agents. They receive all context as input and produce all output as artifacts. They do not communicate directly with each other.

### 4.2 Design Critic Agent (FR-001, FR-006) -- New Agent

A new agent file `03-design-critic.md` following the established critic agent pattern.

**Input:** All Phase 04 artifacts (interface-spec.yaml or openapi.yaml, module-designs/, error-taxonomy.md, validation-rules.json), requirements-spec.md, constitution, round number.

**Output:** `round-{N}-critique.md` -- structured critique report.

**Design Critique Taxonomy (8 Mandatory Check Categories):**

| Check | Category | BLOCKING Condition | Example |
|-------|----------|-------------------|---------|
| DC-01: Incomplete API Specs | API completeness | Missing request/response schemas, missing error responses, undocumented query parameters | "POST /users has no error response for 409 Conflict" |
| DC-02: Inconsistent Patterns | Cross-module consistency | Naming conventions, error handling approaches, response shapes, auth patterns differ across modules | "Module A uses camelCase, Module B uses snake_case in response fields" |
| DC-03: Module Overlap | Responsibility boundaries | Two modules handle the same concern, unclear ownership | "Both UserService and AuthService manage password resets" |
| DC-04: Validation Gaps | Input validation completeness | Boundary fields without min/max, strings without length limits, enums without exhaustive values, missing cross-field validation | "email field has no format validation or length limit" |
| DC-05: Missing Idempotency | State-change safety | State-changing endpoints without idempotency keys or retry-safe semantics | "POST /orders has no idempotency key; duplicate requests create duplicates" |
| DC-06: Accessibility Issues | UI/UX accessibility | Missing ARIA labels, insufficient contrast, keyboard navigation gaps, missing focus indicators | "Modal dialog has no aria-label and no focus trap" |
| DC-07: Error Taxonomy Holes | Error handling completeness | Missing error codes for known failure modes, inconsistent HTTP status usage, no user-facing messages, no retry guidance | "No error code for rate limiting; 500 used instead of 429" |
| DC-08: Data Flow Bottlenecks | Performance design | Synchronous calls in critical paths, missing caching, N+1 queries, missing pagination | "GET /users/{id}/orders fetches all orders without pagination" |

**Constitutional Compliance Checks (5 Articles):**

| Article | Check | Severity |
|---------|-------|----------|
| Article I (Specification Primacy) | Designs traceable to requirements; specs as source of truth | BLOCKING if orphan design |
| Article IV (Explicit Over Implicit) | No hidden assumptions, no unresolved [UNKNOWN] markers | BLOCKING if unresolved |
| Article V (Simplicity First) | Simplest design satisfying requirements; no over-engineering | WARNING |
| Article VII (Artifact Traceability) | Designs trace to requirements and architecture decisions | BLOCKING if orphan |
| Article IX (Quality Gate Integrity) | All required Phase 04 artifacts present and complete | BLOCKING if missing |

**Design-Specific Metrics (AC-005-03):**

| Metric | Measurement |
|--------|-------------|
| API Endpoint Count | Number of endpoints in interface-spec.yaml/openapi.yaml |
| Validation Rule Count | Number of rules in validation-rules.json |
| Error Code Count | Number of unique error codes in error-taxonomy.md |
| Module Count | Number of module design files in module-designs/ |
| Pattern Consistency Score | (modules with consistent patterns / total modules) * 100 |

**Critique Report Format:** Identical structure to Phase 01 and Phase 03 critics (NFR-002: Pattern Consistency):

```markdown
# Round {N} Critique Report

**Round:** {N}
**Phase:** 04-design
**Reviewed At:** {ISO timestamp}
**Artifacts Reviewed:**
- interface-spec.yaml (or openapi.yaml) (Round {N} Draft)
- module-designs/
- error-taxonomy.md
- validation-rules.json

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | {X} |
| BLOCKING | {Y} |
| WARNING | {Z} |
| API Endpoint Count | {E} |
| Validation Rule Count | {V} |
| Error Code Count | {C} |
| Module Count | {M} |
| Pattern Consistency Score | {P}/100 |

## BLOCKING Findings

### B-{NNN}: {Short Title}

**Target:** {artifact, section, module}
**Category:** {DC-01..DC-08 | Article-I..Article-IX}
**Issue:** {Specific description}
**Recommendation:** {Concrete fix}

## WARNING Findings

### W-{NNN}: {Short Title}
...
```

### 4.3 Design Refiner Agent (FR-002) -- New Agent

A new agent file `03-design-refiner.md` following the established refiner agent pattern.

**Input:** All Phase 04 artifacts, Critic's `round-{N}-critique.md`, requirements-spec.md, round number.

**Output:** Updated Phase 04 artifacts with all BLOCKING findings addressed, plus change log.

**Design Refiner Fix Strategies (9 Categories):**

| # | Finding Category | Fix Strategy | Target Artifact |
|---|-----------------|-------------|----------------|
| 1 | Incomplete API specs (DC-01) | Complete OpenAPI 3.x contracts with full request/response schemas, all error responses, all query parameters documented | interface-spec.yaml / openapi.yaml |
| 2 | Inconsistent patterns (DC-02) | Unify patterns across modules: consistent naming, error handling, response shapes, auth patterns | module-designs/ |
| 3 | Module overlap (DC-03) | Clarify module boundaries with explicit responsibility declarations and dependency direction | module-designs/ |
| 4 | Validation gaps (DC-04) | Add validation rules at every boundary: min/max, length limits, enum exhaustiveness, cross-field validation | validation-rules.json |
| 5 | Missing idempotency (DC-05) | Add idempotency keys for all state-changing operations with retry-safe semantics documented | interface-spec.yaml / module-designs/ |
| 6 | Error taxonomy holes (DC-07) | Produce unified error taxonomy with complete codes, consistent HTTP status mapping, user-facing messages, retry guidance | error-taxonomy.md |
| 7 | WARNING triage | Address straightforward fixes, mark complex ones with [NEEDS CLARIFICATION] | Various |
| 8 | No-remove rule (AC-002-08) | Never remove existing design decisions -- only modify, add, or clarify | All |
| 9 | Change log (AC-002-09) | Append changes section documenting every finding addressed with finding ID, action taken, target artifact | Primary design artifact |

**Note on accessibility fixes (DC-06):** The Refiner addresses accessibility BLOCKING findings by adding ARIA labels, documenting contrast requirements, and specifying keyboard navigation flows. This only applies when the project produces UI artifacts (wireframes, component specs). For non-UI projects (CLI, library), DC-06 is not applicable and the Critic skips it (AC-007-04).

**Refiner Enforcement Rules:**

1. NEVER remove existing design decisions -- only modify, add, or clarify (AC-002-08)
2. NEVER introduce new scope -- only address findings from the Critic's report
3. ALWAYS document every change -- append Changes section with finding ID, action, target (AC-002-09)
4. ALWAYS preserve module names and file structure
5. Escalate with [NEEDS CLARIFICATION] if cannot resolve (Article IV)
6. WARNING findings -- address straightforward fixes, mark complex ones [NEEDS CLARIFICATION] (AC-002-07)

### 4.4 Creator Role Enhancement (FR-004)

The existing `03-system-designer.md` gains debate-mode awareness, following the same pattern used for `01-requirements-analyst.md` (REQ-0014) and `02-solution-architect.md` (REQ-0015).

**DEBATE_CONTEXT Handling:**
- A new section near the top of the agent describes the Invocation Protocol
- If `DEBATE_CONTEXT.mode == "creator"` is present in the Task prompt:
  - Label artifacts as "Round {N} Draft" in metadata
  - Include a self-assessment section in the primary design artifact noting known trade-offs, areas of uncertainty, and open questions (AC-004-01)
  - Skip final save menu (orchestrator manages saving)
  - Produce artifacts optimized for review: explicit requirement IDs referenced, clear module boundaries stated
- If no `DEBATE_CONTEXT` is present: current behavior unchanged (AC-004-02, NFR-003)

**Estimated Change:** ~20 lines added to `03-system-designer.md` (a DEBATE_CONTEXT invocation protocol section before the main workflow).

### 4.5 Debate Artifacts for Phase 04 (FR-005)

The artifact naming pattern is identical to Phase 01 and Phase 03 (NFR-002: Pattern Consistency):

**Per-Round Artifacts:**
- `round-{N}-critique.md` -- Critic's findings for that round

**Final Artifacts (standard Phase 04 names, overwritten by Refiner):**
- `interface-spec.yaml` (or `openapi.yaml`)
- `module-designs/` (directory of per-module design files)
- `error-taxonomy.md`
- `validation-rules.json`

**Post-Convergence Artifact:**
- `debate-summary.md` -- Summary with design-specific metrics:

```markdown
# Debate Summary: REQ-NNNN (Phase 04 Design)

## Overview
- Rounds: {N}
- Converged: {Yes/No} (round {N})
- Total findings: {B} BLOCKING, {W} WARNING
- Findings resolved: {Br} BLOCKING, {Wr} WARNING
- API Endpoint Count: {E}
- Validation Rule Count: {V}
- Error Code Count: {C}
- Module Count: {M}
- Pattern Consistency Score: {P}/100

## Round History
...
```

### 4.6 Edge Case Handling (FR-007)

| Edge Case | Handling | Rationale |
|-----------|---------|-----------|
| Creator fails to produce interface-spec.yaml / openapi.yaml | Abort debate, fall back to single-agent mode | Critical artifact missing (AC-007-01) |
| Creator produces partial artifacts (some missing, but critical artifact exists) | Attempt debate with available artifacts | Best-effort review is better than no review (AC-007-01) |
| Critic produces malformed critique (cannot parse BLOCKING count) | Treat as 0 BLOCKING (converge immediately) | Fail-open per Article X (AC-007-02); log warning |
| Debate does not converge after max rounds (3) | Append warning to interface-spec.yaml; save best-effort artifacts | Preserve progress, flag risk (AC-007-03) |
| Project does not use REST APIs (CLI, library, event-driven) | Critic adapts checks to actual interface type (CLI flags, library API, event schema) | AC-007-04; DC-06 (accessibility) not applicable for non-UI |
| Both --debate and --no-debate flags | --no-debate wins | Conservative default per Article X |

### 4.7 Non-REST Interface Adaptation (AC-007-04)

The Design Critic MUST detect the interface type from the artifacts and adapt its checks:

| Interface Type | Detected By | Adapted Checks |
|---------------|-------------|----------------|
| REST API | `openapi.yaml` present | Full DC-01 through DC-08 apply |
| CLI | `interface-spec.yaml` with CLI command definitions | DC-01 checks CLI flags/args, DC-05 checks idempotent commands, DC-06 not applicable |
| Library API | `interface-spec.yaml` with function/method signatures | DC-01 checks function signatures, DC-02 checks API naming, DC-05 checks state mutation safety |
| Event Schema | `interface-spec.yaml` with event definitions | DC-01 checks event schemas, DC-05 checks at-least-once delivery, DC-08 checks event ordering |

---

## 5. Data Flow

### 5.1 Phase 04 Debate Loop (Happy Path -- Converges in Round 2)

```
User: /isdlc feature "Design feature" (standard sizing)
  |
  v
isdlc.md: parse flags (no --no-debate, standard sizing)
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = true
  |
  v
Orchestrator: current_phase = "04-design"
              DEBATE_ROUTING["04-design"] found --> debate-enabled
  |
  v
--- ROUND 1 ---
  |
  v
Delegate to Creator (03-system-designer.md):
  DEBATE_CONTEXT: { mode: "creator", round: 1 }
  |
  v
Creator produces: interface-spec.yaml (Round 1 Draft, with self-assessment),
                  module-designs/, error-taxonomy.md, validation-rules.json
  |
  v
Delegate to Critic (03-design-critic.md):
  Artifacts: all Phase 04 artifacts, round: 1
  |
  v
Critic reviews all 8 check categories + 5 constitutional checks
  --> round-1-critique.md (4 BLOCKING, 3 WARNING)
  |
  v
Orchestrator: blocking_count = 4 > 0, round < 3 --> continue
  |
  v
Delegate to Refiner (03-design-refiner.md):
  Artifacts: all Phase 04 artifacts + round-1-critique.md, round: 1
  |
  v
Refiner addresses 4 BLOCKING findings:
  - Completes missing API error responses (DC-01)
  - Unifies naming across modules (DC-02)
  - Adds missing validation rules for boundary fields (DC-04)
  - Adds idempotency keys for POST endpoints (DC-05)
Produces updated artifacts + changes section
  |
  v
--- ROUND 2 ---
  |
  v
Delegate to Critic (03-design-critic.md):
  Artifacts: updated Phase 04 artifacts, round: 2
  |
  v
Critic reviews --> round-2-critique.md (0 BLOCKING, 2 WARNING)
  |
  v
Orchestrator: blocking_count = 0 --> CONVERGED
  |
  v
Generate debate-summary.md (with design-specific metrics)
Update state.json: debate_state.converged = true
  |
  v
Phase 04 complete. Proceed to GATE-03.
```

### 5.2 Debate OFF (Single-Agent Path)

```
User: /isdlc feature "Small change" -light
  |
  v
isdlc.md: -light flag detected
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = false
  |
  v
Delegate to 03-system-designer.md (NO DEBATE_CONTEXT)
  |
  v
Current single-agent behavior -- unchanged from today (NFR-003)
  |
  v
Phase 04 complete. Proceed to GATE-03.
```

### 5.3 Phase 01 and Phase 03 Paths (Unchanged)

```
Phase 01: DEBATE_ROUTING["01-requirements"] --> same agents as REQ-0014/REQ-0015
Phase 03: DEBATE_ROUTING["03-architecture"] --> same agents as REQ-0015
All behavior identical -- zero regression (NFR-003)
```

---

## 6. Backward Compatibility Strategy (NFR-003)

The architectural invariant: **when debate mode is OFF, all phase behavior is identical to current production. When debate mode is ON for Phase 01/03, behavior is identical to REQ-0014/REQ-0015.**

| Component | Invariant | Verification |
|-----------|-----------|-------------|
| `03-system-designer.md` | No DEBATE_CONTEXT = current behavior unchanged | Regression test: single-agent mode (AC-004-02) |
| `00-sdlc-orchestrator.md` | Phase 01 and Phase 03 routing entries unchanged | Existing 177 debate tests pass |
| `00-sdlc-orchestrator.md` | `debate_mode == false` = single-agent delegation as today | Regression test: orchestrator single-agent path |
| Existing 177 debate tests | All tests from REQ-0014 (90) and REQ-0015 (87) pass | Full test suite run |
| state.json | debate_state.phase="04-design" is additive; existing phase states unchanged | No migration needed |

**Migration:** None required. All changes are additive. Adding a routing table row does not alter existing entries. The two new agent files have no inward dependencies.

---

## 7. Extensibility Strategy

The generalized debate engine (from REQ-0015) is designed to accommodate future debate-enabled phases with zero code changes to the debate loop logic.

**Adding a New Debate-Enabled Phase (e.g., Phase 05 Test Strategy):**

1. Create `XX-{phase}-critic.md` and `XX-{phase}-refiner.md` agent files
2. Add Creator awareness to the phase's primary agent
3. Add a new row to `DEBATE_ROUTING` in the orchestrator

No changes to debate loop pseudocode, convergence logic, artifact versioning, or state management.

REQ-0016 validates this extensibility claim -- it is the second phase added to the generalized debate engine (after REQ-0015 generalized the engine for Phase 03), and requires zero debate loop logic changes.

---

## 8. Files Changed Summary

| File | Change Type | Lines Changed (est.) | Risk |
|------|------------|---------------------|------|
| `src/claude/agents/03-design-critic.md` | **New file** (full agent definition) | ~170 | Medium (domain-specific) |
| `src/claude/agents/03-design-refiner.md` | **New file** (full agent definition) | ~130 | Medium (domain-specific) |
| `src/claude/agents/00-sdlc-orchestrator.md` | Minor modification (add 1 table row) | ~3 | Low |
| `src/claude/agents/03-system-designer.md` | Minor modification (add DEBATE_CONTEXT handling) | ~20 | Low |
| `src/claude/commands/isdlc.md` | Minor modification (description text update) | ~2 | Low |

Total estimated: ~325 lines across 5 files (3 modified, 2 new).

---

## 9. Requirement Traceability

| Requirement | Architectural Component | Section |
|-------------|------------------------|---------|
| FR-001 (Design Critic, 8 ACs) | New 03-design-critic.md | 4.2 |
| FR-002 (Design Refiner, 9 ACs) | New 03-design-refiner.md | 4.3 |
| FR-003 (DEBATE_ROUTING extension, 4 ACs) | One new row in DEBATE_ROUTING table | 4.1 |
| FR-004 (Creator awareness, 2 ACs) | DEBATE_CONTEXT handling in system-designer | 4.4 |
| FR-005 (Debate artifacts, 3 ACs) | Artifact naming and design-specific metrics | 4.5 |
| FR-006 (Constitutional compliance, 5 ACs) | Constitutional checks in design critic | 4.2 |
| FR-007 (Edge cases, 4 ACs) | Edge case handling table + non-REST adaptation | 4.6, 4.7 |
| NFR-001 (Performance) | Sequential delegation (no parallel overhead) | 4.1 |
| NFR-002 (Pattern consistency) | Identical structure to Phase 01/03 agents | 4.2, 4.3, 4.5 |
| NFR-003 (Backward compatibility) | Additive changes only; existing routing unchanged | 6 |
| NFR-004 (Constitutional compliance) | Critic checks Articles I, IV, V, VII, IX | 4.2 |

---

## 10. Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Adding DEBATE_ROUTING row breaks Phase 01/03 paths | Existing 177 debate tests serve as regression guard. Adding a row does not modify existing rows. | Test Strategy (Phase 05) |
| Design Critic checks too domain-specific for non-REST projects | AC-007-04 requires Critic to adapt to interface type. Section 4.7 documents adaptation table. | Implementation (Phase 06) |
| Phase 04 artifact names vary (interface-spec.yaml vs openapi.yaml) | Routing table uses "interface-spec.yaml" as critical artifact; Critic handles both names. | Architecture (this doc) |
| System designer DEBATE_CONTEXT change breaks non-debate path | AC-004-02 explicitly requires no regression; test coverage for both paths. | Test Strategy (Phase 05) |
| Design Refiner removes existing decisions | Rule 1 in refiner: "NEVER remove existing design decisions" (AC-002-08). Test coverage verifies rule presence. | Implementation (Phase 06) |
| 8 Critic check categories may not all apply to every project | Critic adapts to available artifacts; non-applicable checks produce zero findings (not false positives). | Architecture (this doc) |
