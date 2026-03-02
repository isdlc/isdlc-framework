# Architecture Overview: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted
**Prior Art:** REQ-0014 (Multi-Agent Requirements Team -- Phase 01 debate loop)

---

## 1. Architecture Approach

This feature **extends** the existing prompt-driven agent architecture and the debate loop pattern established in REQ-0014. The iSDLC framework operates through agent prompt files (markdown) delegated via the Task tool. This feature is predominantly a prompt/instruction change (~85% markdown, ~15% CJS test code).

**Key Architectural Constraint:** No new runtime code, no new hooks, no new npm dependencies. The debate loop generalization is orchestrated at the prompt level by the sdlc-orchestrator, extending the pattern from REQ-0014. (Article V: Simplicity First)

**Prior Art (REQ-0014):** The Phase 01 debate loop (Creator/Critic/Refiner) was implemented in REQ-0014 with the orchestrator managing sequential delegation within Section 7.5. REQ-0015 generalizes that section from Phase 01-only to a multi-phase debate engine with phase-specific agent routing.

| Existing Component | Extension | FR(s) |
|-------------------|-----------|-------|
| `00-sdlc-orchestrator.md` (Section 7.5) | Generalize from "Phase 01 Only" to multi-phase debate engine with routing table. Add Phase 03 agent mappings. | FR-003, FR-005, FR-007 |
| `02-solution-architect.md` | Add DEBATE_CONTEXT handling (Creator role awareness). Include self-assessment section when in debate mode. | FR-004 |
| `src/claude/commands/isdlc.md` | Update flag descriptions from "multi-agent requirements team" to "multi-agent debate team" covering both phases. | FR-003 |

| New Component | Type | FR(s) |
|--------------|------|-------|
| `02-architecture-critic.md` | New agent (markdown) | FR-001 |
| `02-architecture-refiner.md` | New agent (markdown) | FR-002 |

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
            |  |  - IF debate ON: route to phase agents    | |
            |  |  - IF debate OFF: delegate single agent   | |
            |  |  - Phase routing table (01 + 03)          | |
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
            |  | 02-architecture-critic.md  (Critic) [NEW] | |
            |  | 02-architecture-refiner.md (Refiner)[NEW] | |
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
| Debate loop generalization approach | Single routing table in orchestrator Section 7.5 (not duplicated per-phase sections) | ADR-0001 |
| Agent routing strategy | Phase-keyed lookup table mapping current_phase to Creator/Critic/Refiner agents | ADR-0002 |
| Convergence strategy reuse | Same convergence logic as Phase 01 (blocking-findings-zero, max-3-rounds) | ADR-0003 |
| Artifact naming convention | Phase-agnostic naming for debate artifacts (round-N-critique.md, debate-summary.md) | ADR-0004 |

---

## 4. Component Architecture

### 4.1 Generalized Debate Engine (FR-003, FR-005)

The orchestrator's Section 7.5 is refactored from "DEBATE LOOP ORCHESTRATION (Phase 01 Only)" to "DEBATE LOOP ORCHESTRATION (Multi-Phase)". The key change is replacing hardcoded agent names with a phase-specific routing table.

**Phase Routing Table:**

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
  }
}
```

**Key Design Principle:** The orchestrator is the sole coordinator. The Creator, Critic, and Refiner are stateless sub-agents -- they receive all context as input and produce all output as artifacts. They do not communicate with each other directly. The orchestrator reads artifacts after each delegation and decides the next step.

**Generalized Debate Loop Pseudocode:**

```
function delegateWithDebate(phase, context):
  // Step 1: Resolve debate mode (unchanged from REQ-0014)
  debate_mode = resolveDebateMode(flags, sizing)
  write active_workflow.debate_mode to state.json

  // Step 2: Check if this phase supports debate
  IF phase NOT IN DEBATE_ROUTING:
    delegate to phase's primary agent (no debate)
    return

  routing = DEBATE_ROUTING[phase]

  IF debate_mode == false:
    delegate to routing.creator (NO DEBATE_CONTEXT)
    return

  // Step 3: Initialize debate state
  debate_state = { round: 0, converged: false, max_rounds: 3, phase: phase }
  write active_workflow.debate_state to state.json

  // Step 4: Creator delegation (Round 1)
  debate_state.round = 1
  delegate to routing.creator with:
    DEBATE_CONTEXT: { mode: "creator", round: 1 }
    {Feature description}

  // Verify critical artifact exists
  IF routing.critical_artifact NOT found:
    abort debate, fall back to single-agent
    return

  // Step 5: Critic-Refiner loop
  WHILE debate_state.round <= debate_state.max_rounds
        AND NOT debate_state.converged:

    // 5a: Critic review
    delegate to routing.critic with:
      DEBATE_CONTEXT: { round: debate_state.round }
      All routing.artifacts
    // Critic produces: round-{N}-critique.md

    // 5b: Convergence check
    parse critique for BLOCKING count
    IF blocking_count == 0: converged = true; BREAK
    IF round >= max_rounds: BREAK (unconverged)

    // 5c: Refiner improvement
    delegate to routing.refiner with:
      DEBATE_CONTEXT: { round: debate_state.round }
      All routing.artifacts + round-{N}-critique.md
    // Refiner produces: updated artifacts

    debate_state.round += 1

  // Step 6: Post-loop finalization (same for all phases)
  generate debate-summary.md
  IF NOT converged: append warning to routing.critical_artifact
  update state.json
```

**Why a Routing Table (Not Per-Phase Sections):**
Duplicating Section 7.5 for each phase (Section 7.5a for Phase 01, Section 7.5b for Phase 03) was considered and rejected. A routing table keeps the debate loop logic in one place -- the only variable is which agents to delegate to. This follows Article V (Simplicity First) and makes adding future debate-enabled phases trivial (add a row to the table). See ADR-0001 for full analysis.

### 4.2 Architecture Critic Agent (FR-001) -- New Agent

A new agent file `02-architecture-critic.md` following the existing agent naming convention.

**Input:** All Phase 03 artifacts (architecture-overview.md, tech-stack-decision.md, database-design.md, security-architecture.md, ADRs), round number.

**Output:** `round-{N}-critique.md` -- a structured critique report.

**Architecture Critique Taxonomy (8 Mandatory Check Categories):**

| Check | Category | BLOCKING Condition | Example |
|-------|----------|-------------------|---------|
| AC-01: NFR Alignment | NFR misalignment | Architecture decision contradicts or ignores an NFR | "NFR-002 requires 99.9% uptime but no HA/failover designed" |
| AC-02: STRIDE Threat Model | Security gaps | Missing threat categories, no mitigations for identified threats | "Spoofing and Tampering not addressed in security-architecture.md" |
| AC-03: Database Design | Data design flaws | Missing indexes on FKs, no migration strategy, no backup plan, normalization issues | "No backup/recovery strategy documented" |
| AC-04: Tech Stack Justification | Weak justification | Missing evaluation criteria, no alternatives considered, no cost analysis | "PostgreSQL selected with no alternatives considered or evaluation criteria" |
| AC-05: Single Points of Failure | Reliability gaps | SPOF with no redundancy or failover | "Single database instance with no replication or failover" |
| AC-06: Observability | Missing monitoring | No monitoring, logging, alerting, or tracing architecture | "No monitoring endpoints or alerting thresholds defined" |
| AC-07: Coupling Contradictions | Consistency flaws | Architecture claims loosely coupled but shows tight coupling patterns | "Claims microservices but shows synchronous cross-service calls without fallback" |
| AC-08: Cost Implications | Missing cost analysis | Serverless at high scale without cost projections, expensive choices without justification | "DynamoDB on-demand pricing at projected 10M requests/day not costed" |

**Structural Pattern:** The critique output format is identical to `01-requirements-critic.md` (NFR-002: Pattern Consistency):

```markdown
# Round {N} Critique Report

**Round:** {N}
**Reviewed At:** {ISO timestamp}
**Artifacts Reviewed:**
- architecture-overview.md (Round {N} Draft)
- tech-stack-decision.md
- database-design.md
- security-architecture.md
- ADRs

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | {X} |
| BLOCKING | {Y} |
| WARNING | {Z} |
| ADR Count | {A} |
| Threat Coverage | {T}% |
| NFR Alignment Score | {S}/100 |

## BLOCKING Findings

### B-{NNN}: {Short Title}

**Target:** {artifact.md, section, ADR-NNNN}
**Category:** {AC-01..AC-08}
**Issue:** {Specific description}
**Recommendation:** {Concrete fix}

## WARNING Findings

### W-{NNN}: {Short Title}
...
```

### 4.3 Architecture Refiner Agent (FR-002) -- New Agent

A new agent file `02-architecture-refiner.md` following the existing agent naming convention.

**Input:** All Phase 03 artifacts, Critic's `round-{N}-critique.md`, round number.

**Output:** Updated architecture-overview.md, tech-stack-decision.md, database-design.md, security-architecture.md, ADRs with all BLOCKING findings addressed.

**Architecture Refiner Fix Strategies (8 Categories):**

| Finding Category | Fix Strategy |
|-----------------|-------------|
| Incomplete ADRs (AC-04) | Produce complete ADRs with trade-off analysis, alternatives considered, decision rationale |
| Security gaps (AC-02) | Add security hardening: specific mitigations for each identified threat, encryption strategy, access control |
| Single points of failure (AC-05) | Add HA adjustments: redundancy, failover, graceful degradation |
| Cost implications (AC-08) | Add cost optimization recommendations with projected costs |
| Missing observability (AC-06) | Add observability architecture: monitoring endpoints, log aggregation, alerting thresholds, distributed tracing |
| NFR misalignment (AC-01) | Align architecture decisions with NFR targets; add supporting infrastructure |
| Database design flaws (AC-03) | Add missing indexes, migration strategy, backup plan; fix normalization |
| Coupling contradictions (AC-07) | Resolve coupling claims vs. reality; add fallback patterns or restate architecture honestly |

**Refiner Enforcement Rules:**

1. **NEVER remove existing architectural decisions** -- only modify, add, or clarify (AC-002-07)
2. **NEVER introduce new scope** -- only address findings from the Critic's report
3. **ALWAYS document every change** -- append a Changes section with finding ID, action taken, target artifact (AC-002-08)
4. **ALWAYS preserve ADR numbering** -- ADR-0001 stays ADR-0001 even if rewritten
5. **Escalate if cannot resolve** -- mark with [NEEDS CLARIFICATION] (Article IV)
6. **WARNING findings** -- address straightforward fixes, mark complex ones [NEEDS CLARIFICATION] (AC-002-06)

### 4.4 Creator Role Enhancement (FR-004)

The existing `02-solution-architect.md` gains debate-mode awareness, modeled exactly on the pattern added to `01-requirements-analyst.md` in REQ-0014.

**DEBATE_CONTEXT Handling:**
- A new section at the top of the agent (after the frontmatter) describes the Invocation Protocol
- If `DEBATE_CONTEXT.mode == "creator"` is present in the Task prompt:
  - Label artifacts as "Round {N} Draft" in metadata
  - Include a self-assessment section in architecture-overview.md noting known trade-offs, areas of uncertainty, and open questions (AC-004-01)
  - Skip final save menu (orchestrator manages saving)
  - Produce artifacts optimized for review: explicit ADR IDs, clear NFR references
- If no `DEBATE_CONTEXT` is present: current behavior unchanged (AC-004-02, NFR-003)

### 4.5 Debate Artifacts for Phase 03 (FR-006)

The artifact naming pattern is identical to Phase 01 (NFR-002: Pattern Consistency):

**Per-Round Artifacts:**
- `round-{N}-critique.md` -- Critic's findings for that round

**Final Artifacts (standard names, overwritten by Refiner):**
- `architecture-overview.md`
- `tech-stack-decision.md`
- `database-design.md`
- `security-architecture.md`
- ADRs in `adrs/` subdirectory (if applicable)

**Post-Convergence Artifact:**
- `debate-summary.md` -- Summary with architecture-specific metrics:

```markdown
# Debate Summary: REQ-NNNN (Phase 03 Architecture)

## Overview
- Rounds: 2
- Converged: Yes (round 2)
- Total findings: 5 BLOCKING, 3 WARNING
- Findings resolved: 5 BLOCKING, 2 WARNING
- ADR Count: 4 (3 original + 1 added by Refiner)
- Threat Coverage: 100% (STRIDE complete)
- NFR Alignment Score: 95/100

## Round History
...
```

### 4.6 Edge Case Handling (FR-007)

| Edge Case | Handling | Rationale |
|-----------|---------|-----------|
| Creator fails to produce architecture-overview.md | Abort debate, fall back to single-agent mode | architecture-overview.md is the critical artifact (AC-007-01) |
| Creator produces partial artifacts (missing some but has architecture-overview.md) | Attempt debate with available artifacts | Best-effort review is better than no review (AC-007-01) |
| Critic produces malformed critique (cannot parse BLOCKING count) | Treat as 0 BLOCKING (converge immediately) | Fail-open per Article X (AC-007-02); log warning |
| Debate does not converge after max rounds | Append warning to architecture-overview.md; save best-effort artifacts | Preserve progress, flag risk (AC-007-03) |
| Both --debate and --no-debate flags | --no-debate wins | Conservative default per Article X, consistent with Phase 01 (ADR-0003 from REQ-0014) |

---

## 5. Data Flow

### 5.1 Generalized Debate Loop (Happy Path -- Phase 03, Converges in Round 2)

```
User: /isdlc feature "Architecture feature" (standard sizing)
  |
  v
isdlc.md: parse flags (no --no-debate, standard sizing)
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = true
  |
  v
Orchestrator: current_phase = "03-architecture"
              DEBATE_ROUTING["03-architecture"] found --> debate-enabled
  |
  v
--- ROUND 1 ---
  |
  v
Delegate to Creator (02-solution-architect.md):
  DEBATE_CONTEXT: { mode: "creator", round: 1 }
  |
  v
Creator produces: architecture-overview.md (Round 1 Draft, with self-assessment),
                  tech-stack-decision.md, database-design.md, security-architecture.md,
                  ADRs
  |
  v
Delegate to Critic (02-architecture-critic.md):
  Artifacts: architecture-overview.md + other Phase 03 artifacts, round: 1
  |
  v
Critic reviews all 8 check categories --> round-1-critique.md (3 BLOCKING, 2 WARNING)
  |
  v
Orchestrator: blocking_count = 3 > 0, round < 3 --> continue
  |
  v
Delegate to Refiner (02-architecture-refiner.md):
  Artifacts: all Phase 03 artifacts + round-1-critique.md, round: 1
  |
  v
Refiner addresses 3 BLOCKING findings:
  - Completes missing STRIDE mitigations
  - Adds HA failover for identified SPOF
  - Adds cost projections for serverless components
Produces updated artifacts + changes section
  |
  v
--- ROUND 2 ---
  |
  v
Delegate to Critic (02-architecture-critic.md):
  Artifacts: updated Phase 03 artifacts, round: 2
  |
  v
Critic reviews --> round-2-critique.md (0 BLOCKING, 1 WARNING)
  |
  v
Orchestrator: blocking_count = 0 --> CONVERGED
  |
  v
Generate debate-summary.md (with ADR count, threat coverage, NFR alignment score)
Update state.json: debate_state.converged = true
  |
  v
Phase 03 complete. Proceed to GATE-02.
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
Delegate to 02-solution-architect.md (NO DEBATE_CONTEXT)
  |
  v
Current single-agent behavior -- unchanged from today (NFR-003)
  |
  v
Phase 03 complete. Proceed to GATE-02.
```

### 5.3 Phase 01 Path (Unchanged by This Feature)

```
Orchestrator: current_phase = "01-requirements"
              DEBATE_ROUTING["01-requirements"] found --> debate-enabled
  |
  v
Uses same generalized debate loop but routes to:
  Creator:  01-requirements-analyst.md
  Critic:   01-requirements-critic.md
  Refiner:  01-requirements-refiner.md
  |
  v
All behavior identical to REQ-0014 (NFR-003: zero regression)
```

---

## 6. Backward Compatibility Strategy (NFR-003)

The architectural invariant is: **when debate mode is OFF, all phase behavior is identical to the current production behavior. When debate mode is ON for Phase 01, behavior is identical to REQ-0014.**

| Component | Invariant | Verification |
|-----------|-----------|-------------|
| `02-solution-architect.md` | No DEBATE_CONTEXT in prompt = current behavior unchanged | Regression test: single-agent mode |
| `00-sdlc-orchestrator.md` | Phase 01 agent routing produces identical agents to REQ-0014 hardcoded paths | Regression test: Phase 01 debate path |
| `00-sdlc-orchestrator.md` | `debate_mode == false` = delegates to primary agent as today | Regression test: orchestrator single-agent path |
| Existing 90 debate tests | All 90 tests from REQ-0014 continue passing | Full test suite run |
| state.json | `debate_state.phase` field is additive; Phase 01 debate state unchanged | No migration needed |

**Migration:** No migration needed. All changes are additive. The routing table replaces hardcoded agent names but produces identical behavior for Phase 01.

---

## 7. Extensibility Strategy

The generalized debate engine is designed to accommodate future debate-enabled phases with zero code changes to the debate loop logic.

**Adding a New Debate-Enabled Phase (e.g., Phase 04 Design):**

1. Create `XX-{phase}-critic.md` and `XX-{phase}-refiner.md` agent files
2. Add Creator awareness to the phase's primary agent
3. Add a new row to `DEBATE_ROUTING` in the orchestrator

No changes to the debate loop pseudocode, convergence logic, artifact versioning, or state management.

---

## 8. Files Changed Summary

| File | Change Type | Lines Changed (est.) | Risk |
|------|------------|---------------------|------|
| `src/claude/agents/00-sdlc-orchestrator.md` | Major modification (generalize Section 7.5 from Phase 01-only to routing table) | ~100 | High |
| `src/claude/agents/02-architecture-critic.md` | **New file** (full agent definition) | ~200 | Medium |
| `src/claude/agents/02-architecture-refiner.md` | **New file** (full agent definition) | ~200 | Medium |
| `src/claude/agents/02-solution-architect.md` | Minor modification (add DEBATE_CONTEXT handling) | ~50 | Low |
| `src/claude/commands/isdlc.md` | Minor modification (flag description updates) | ~10 | Low |

Total estimated: ~560 lines across 5 files (3 modified, 2 new).

---

## 9. Requirement Traceability

| Requirement | Architectural Component | Section |
|-------------|------------------------|---------|
| FR-001 (Critic agent, 8 ACs) | New 02-architecture-critic.md | 4.2 |
| FR-002 (Refiner agent, 8 ACs) | New 02-architecture-refiner.md | 4.3 |
| FR-003 (Debate loop extension, 5 ACs) | Generalized debate engine in orchestrator | 4.1 |
| FR-004 (Creator awareness, 2 ACs) | DEBATE_CONTEXT handling in solution-architect | 4.4 |
| FR-005 (Agent routing, 4 ACs) | Phase routing table (DEBATE_ROUTING) | 4.1 |
| FR-006 (Debate artifacts, 3 ACs) | Artifact naming and storage | 4.5 |
| FR-007 (Edge cases, 3 ACs) | Edge case handling table | 4.6 |
| NFR-001 (Performance) | Sequential delegation (no parallel overhead) | 4.1 |
| NFR-002 (Pattern consistency) | Identical structure to Phase 01 agents | 4.2, 4.3 |
| NFR-003 (Backward compatibility) | Routing table preserves Phase 01 paths exactly | 6 |
| NFR-004 (Constitutional compliance) | Critic checks Articles III, IV, V, VII, IX, X | 4.2 |

---

## 10. Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Orchestrator Section 7.5 refactoring breaks Phase 01 | Existing 90 debate tests serve as regression guard. Routing table produces identical Phase 01 agents. | Test Strategy (Phase 05) |
| Architecture Critic checks are too domain-specific | Model on existing requirements critic (5 checks) but with architecture-specific domain knowledge (8 checks). Test each category independently. | Implementation (Phase 06) |
| Routing table lookup fails for unknown phase | Phase not in DEBATE_ROUTING = no debate (single-agent path). Fail-safe per Article X. | Architecture (this doc) |
| Generalization introduces subtle Phase 01 behavioral changes | All 90 existing debate tests from REQ-0014 must pass with zero changes. Any test failure blocks merge. | Test Strategy (Phase 05) |
| Architecture Refiner removes existing decisions | Rule 1 in refiner agent: "NEVER remove existing architectural decisions" (AC-002-07). Test coverage verifies presence of this rule. | Implementation (Phase 06) |
