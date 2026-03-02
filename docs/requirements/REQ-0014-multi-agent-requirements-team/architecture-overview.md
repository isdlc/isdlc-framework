# Architecture Overview: Multi-Agent Requirements Team

**Feature:** REQ-0014-multi-agent-requirements-team
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## 1. Architecture Approach

This feature **extends** the existing prompt-driven agent architecture. The iSDLC framework operates through agent prompt files (markdown) delegated via the Task tool. This feature is predominantly a prompt/instruction change (~85% markdown, ~15% configuration).

**Key Architectural Constraint:** No new runtime code, no new hooks, no new npm dependencies (CON-001). The debate loop is orchestrated at the prompt level by the sdlc-orchestrator, following the precedent set by the Inception Party in discover-orchestrator.md.

**Precedent:** The Inception Party deep discovery flow (discover-orchestrator.md, Phase 2: Stack Debate) demonstrates a propose-critique-converge interaction pattern across multiple agents. This feature adapts that pattern for Phase 01 requirements: Creator proposes, Critic reviews, Refiner improves -- iterated up to 3 rounds until convergence.

| Existing Component | Extension | FR(s) |
|-------------------|-----------|-------|
| `01-requirements-analyst.md` | Add debate-mode awareness (Round N labeling), conversational opening (FR-007), conditional behavior fork | FR-001, FR-007 |
| `00-sdlc-orchestrator.md` | Add Creator->Critic->Refiner delegation loop within Phase 01, debate_mode resolution, round tracking, convergence check | FR-004, FR-008 |
| `isdlc.md` command spec | Add `--debate` and `--no-debate` flag parsing, pass to orchestrator | FR-005 |
| `iteration-requirements.json` | Add `debate_mode_override` to Phase 01 config for gate-blocker compatibility | FR-004 |
| `CLAUDE.md.template` | Document --debate/--no-debate flags in workflow section | FR-005 |

| New Component | Type | FR(s) |
|--------------|------|-------|
| `01-requirements-critic.md` | New agent (markdown) | FR-002 |
| `01-requirements-refiner.md` | New agent (markdown) | FR-003 |

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
            |  |  - IF debate ON: run debate loop          | |
            |  |  - IF debate OFF: delegate single agent   | |
            |  |  - Track debate_state in active_workflow  | |
            |  +------------------------------------------+ |
            |                                               |
            |  +------------------------------------------+ |
            |  | 01-requirements-analyst.md (Creator)      | |
            |  |  - Produce Round N artifacts              | |
            |  |  - Conversational opening (FR-007)        | |
            |  +------------------------------------------+ |
            |                                               |
            |  +------------------------------------------+ |
            |  | 01-requirements-critic.md (Critic) [NEW]  | |
            |  |  - Review artifacts                       | |
            |  |  - Produce BLOCKING/WARNING findings      | |
            |  +------------------------------------------+ |
            |                                               |
            |  +------------------------------------------+ |
            |  | 01-requirements-refiner.md (Refiner) [NEW]| |
            |  |  - Address BLOCKING findings              | |
            |  |  - Enforce Given/When/Then, quantified NFR| |
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
| Debate loop delegation model | Orchestrator-managed sequential delegation (not parallel, not sub-orchestrator) | ADR-0001 |
| Convergence strategy | Blocking-findings-zero exit, max-3-rounds hard limit | ADR-0002 |
| Flag precedence | Explicit flag > sizing-based default > light default | ADR-0003 |
| Gate-blocker compatibility | Debate mode overrides interactive_elicitation requirements | ADR-0004 |

---

## 4. Component Architecture

### 4.1 Debate Loop Orchestration (FR-004, FR-008)

The orchestrator manages the entire debate loop within its Phase 01 delegation logic. This is a new section added to `00-sdlc-orchestrator.md`, positioned alongside the existing Phase 01 delegation path.

**Key Design Principle:** The orchestrator is the sole coordinator. The Creator, Critic, and Refiner are stateless sub-agents -- they receive all context as input and produce all output as artifacts. They do not communicate with each other directly. The orchestrator reads artifacts after each delegation and decides the next step.

**Debate Loop Pseudocode:**

```
function delegatePhase01(context):
  debate_mode = resolveDebateMode(flags, sizing)
  write active_workflow.debate_mode to state.json

  IF debate_mode == false:
    // Current behavior -- single agent, unchanged
    delegate to 01-requirements-analyst.md
    return

  // Debate mode ON
  debate_state = { round: 0, converged: false, max_rounds: 3 }
  write active_workflow.debate_state to state.json

  // Round 1: Creator produces initial draft
  debate_state.round = 1
  delegate to 01-requirements-analyst.md with:
    - DEBATE_CONTEXT: { mode: "creator", round: 1 }
    - User's feature description
    - Discovery context (if available)
  // Creator produces: requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv

  // Loop: Critic -> Refiner (rounds 1..3)
  WHILE debate_state.round <= debate_state.max_rounds AND NOT debate_state.converged:

    // Critic reviews
    delegate to 01-requirements-critic.md with:
      - All current artifacts (requirements-spec.md, user-stories.json, nfr-matrix.md)
      - Round number
    // Critic produces: round-N-critique.md

    // Check convergence
    parse critique for BLOCKING findings count
    IF blocking_count == 0:
      debate_state.converged = true
      break

    IF debate_state.round >= debate_state.max_rounds:
      // Max rounds reached without convergence
      debate_state.converged = false
      note unconverged findings in debate-summary.md
      break

    // Refiner improves
    delegate to 01-requirements-refiner.md with:
      - All current artifacts
      - Critic's findings (round-N-critique.md)
      - Round number
    // Refiner produces: updated requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv

    debate_state.round += 1

  // Post-loop: generate debate-summary.md
  write debate-summary.md with round count, findings per round, changes made
  update active_workflow.debate_state with final status
```

**Why Orchestrator-Managed (Not Sub-Orchestrator):**
A separate "debate-orchestrator" sub-agent was considered and rejected. The orchestrator already handles Phase 01 delegation and reads state.json. Adding a sub-orchestrator would add an unnecessary layer of indirection -- the orchestrator can simply loop its delegation calls. This follows Article V (Simplicity First).

### 4.2 Creator Role Enhancement (FR-001, FR-007)

The existing `01-requirements-analyst.md` gains two new behaviors:

**Debate-Mode Awareness:**
- A new `DEBATE_CONTEXT` block is read from the Task prompt
- If `DEBATE_CONTEXT.mode == "creator"`, the analyst:
  - Labels all artifacts as "Round N Draft" in their metadata
  - Skips the final "Save artifacts" confirmation (the orchestrator manages saving)
  - Produces artifacts optimized for review (clear requirement IDs, explicit AC references)
- If no `DEBATE_CONTEXT` is present, current single-agent behavior is unchanged (NFR-002)

**Conversational Opening (FR-007):**
This is a standalone improvement that applies regardless of debate mode:
- Replace the 3 generic opening questions with a contextual reflect-and-ask pattern
- Detect if the user provided a rich feature description (from BACKLOG.md or /isdlc feature "description")
- If rich description exists: reflect it back, ask ONE targeted follow-up
- If minimal description: fall back to a shorter version of the current opening
- Use the 5 discovery lenses (Business/User/UX/Tech/Quality) organically as conversation flows, not as rigid sequential stages
- If discovery_context exists and is fresh (< 24h), use it as baseline

### 4.3 Critic Role (FR-002) -- New Agent

A new agent file `01-requirements-critic.md` following the existing agent naming convention (`NN-agent-name.md`).

**Input:** All Phase 01 artifacts (requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv), round number.

**Output:** `round-N-critique.md` -- a structured critique report.

**Critique Taxonomy:**

| Category | Severity | Example |
|----------|----------|---------|
| Vague AC | BLOCKING | "AC lacks Given/When/Then structure, uses 'should handle errors appropriately'" |
| Unmeasured NFR | BLOCKING | "NFR-003 says 'fast response time' with no quantified metric" |
| Orphan Requirement | BLOCKING | "FR-005 has no linked user story in traceability matrix" |
| Contradiction | BLOCKING | "FR-002 requires 'always online' but FR-007 specifies 'offline mode'" |
| Missing Edge Case | WARNING | "FR-001 does not address what happens when input is empty" |
| Scope Creep | WARNING | "FR-008 appears to be beyond the stated problem in Section 1" |
| Unstated Assumption | WARNING | "FR-003 assumes user has admin privileges but this is not stated" |
| Missing Compliance | BLOCKING | "GDPR/data retention requirements not addressed for user data" |

**Critique Output Format:**

```markdown
# Round N Critique Report

## Summary
- Total findings: X
- BLOCKING: Y (must fix before convergence)
- WARNING: Z (recommended improvements)

## BLOCKING Findings

### B-001: Vague AC in AC-003-02
**Target:** AC-003-02 (in US-003)
**Issue:** Uses ambiguous language "should handle gracefully" without defining what graceful handling means
**Recommendation:** Rewrite as Given/When/Then with specific error response format

### B-002: ...

## WARNING Findings

### W-001: Missing edge case in FR-001
**Target:** FR-001
**Issue:** Does not specify behavior when feature description is empty
**Recommendation:** Add AC covering empty/missing input
```

### 4.4 Refiner Role (FR-003) -- New Agent

A new agent file `01-requirements-refiner.md` following the existing agent naming convention.

**Input:** All Phase 01 artifacts, Critic's `round-N-critique.md`, round number.

**Output:** Updated requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv with all BLOCKING findings addressed.

**Refiner Enforcement Rules:**

1. **Every AC must be Given/When/Then** -- no exceptions
2. **Every NFR must have a quantified metric** -- no "fast", "scalable", "reliable" without numbers
3. **Every FR must link to at least one US** -- no orphan requirements
4. **All contradictions must be resolved** -- with rationale documented
5. **BLOCKING findings that cannot be resolved without user input** are escalated with `[NEEDS CLARIFICATION]` marker (Article IV)

**Change Tracking:** The Refiner appends a "Changes in Round N" section to each artifact, documenting what changed and why. This provides audit trail for the debate-summary.md.

### 4.5 Flag Precedence Resolution (FR-005)

The `isdlc.md` command spec parses `--debate` and `--no-debate` flags. The orchestrator resolves the final debate_mode value using this priority chain:

```
Priority (highest to lowest):
  1. --no-debate flag       --> debate_mode = false (explicit user override)
  2. --debate flag           --> debate_mode = true  (explicit user override)
  3. -light flag             --> debate_mode = false (light = minimal process)
  4. sizing == "standard"    --> debate_mode = true  (default for standard)
  5. sizing == "epic"        --> debate_mode = true  (default for epic)
  6. fallback               --> debate_mode = true  (debate is the new default)
```

**Note:** If both `--debate` and `--no-debate` are provided, `--no-debate` wins (conservative default per Article X).

**State.json Extension:**

```json
{
  "active_workflow": {
    "debate_mode": true,
    "debate_state": {
      "round": 2,
      "max_rounds": 3,
      "converged": false,
      "blocking_findings": 3,
      "rounds_history": [
        { "round": 1, "blocking": 5, "warnings": 2, "action": "refine" },
        { "round": 2, "blocking": 0, "warnings": 1, "action": "converge" }
      ]
    }
  }
}
```

### 4.6 Artifact Versioning (FR-006)

Each debate round produces a versioned snapshot for audit trail:

**Per-Round Artifacts:**
- `round-N-critique.md` -- Critic's findings for that round (saved by orchestrator after Critic delegation)

**Final Artifacts (standard names, overwritten):**
- `requirements-spec.md` -- Final version
- `user-stories.json` -- Final version
- `nfr-matrix.md` -- Final version
- `traceability-matrix.csv` -- Final version

**Post-Convergence Artifact:**
- `debate-summary.md` -- Summary of all rounds, generated by the orchestrator:

```markdown
# Debate Summary: REQ-NNNN

## Overview
- Rounds: 2
- Converged: Yes (round 2)
- Total findings: 7 BLOCKING, 3 WARNING
- Findings resolved: 7 BLOCKING, 1 WARNING

## Round History

### Round 1
- Creator: Initial draft produced
- Critic: 5 BLOCKING, 2 WARNING
- Refiner: All 5 BLOCKING addressed, 1 WARNING addressed

### Round 2
- Critic: 0 BLOCKING, 1 WARNING
- Converged: Yes (zero blocking findings)

## Key Changes
1. AC-003-02 rewritten in Given/When/Then format (was vague)
2. NFR-001 quantified: "p95 < 200ms" (was "fast")
3. FR-005 linked to US-003 (was orphan)
```

### 4.7 Gate-Blocker Hook Compatibility (FR-004)

The existing `iteration-requirements.json` Phase 01 config requires:
- `interactive_elicitation.min_menu_interactions: 3`
- `interactive_elicitation.required_final_selection: ["save", "continue"]`

**Problem:** In debate mode, the Creator interacts with the user (menu interactions count toward the gate requirement). The Critic and Refiner operate without user interaction. The gate-blocker must not block Phase 01 completion because Critic/Refiner did not present menus.

**Solution:** The Creator's user interactions (initial requirements capture) satisfy the interactive_elicitation requirement. The Critic and Refiner are orchestrator-internal delegations that do not need separate gate validation. The gate-blocker validates Phase 01 as a whole, after the debate loop completes. No changes to iteration-requirements.json are needed because:
1. The Creator still performs menu interactions (A/R/C pattern) during initial capture
2. The final "save" selection happens after the debate loop completes (orchestrator signals completion)
3. The gate-blocker reads the Phase 01 state at completion time, which already has menu_interactions >= 3

**If this assumption is wrong** (i.e., the Critic/Refiner delegations reset the elicitation counter): add a `debate_mode_override` field to iteration-requirements.json that tells the gate-blocker to accept the Creator's elicitation state as sufficient for the whole Phase 01.

---

## 5. Data Flow

### 5.1 Debate Loop (Happy Path -- Converges in Round 2)

```
User: /isdlc feature "Multi-agent requirements team"
  |
  v
isdlc.md: parse flags (no --no-debate, standard sizing)
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = true
  |
  v
Write state.json: active_workflow.debate_mode = true
  |
  v
--- ROUND 1 ---
  |
  v
Delegate to Creator (01-requirements-analyst.md):
  DEBATE_CONTEXT: { mode: "creator", round: 1 }
  |
  v
Creator interacts with user (A/R/C menus, 3+ interactions)
Creator produces: requirements-spec.md (Round 1 Draft),
                  user-stories.json, nfr-matrix.md, traceability-matrix.csv
  |
  v
Delegate to Critic (01-requirements-critic.md):
  Artifacts: all 4 files, round: 1
  |
  v
Critic reviews --> round-1-critique.md (3 BLOCKING, 2 WARNING)
  |
  v
Orchestrator: blocking_count = 3 > 0, round < 3 --> continue
  |
  v
Delegate to Refiner (01-requirements-refiner.md):
  Artifacts: all 4 files + round-1-critique.md, round: 1
  |
  v
Refiner addresses 3 BLOCKING findings, produces updated artifacts
  |
  v
--- ROUND 2 ---
  |
  v
Delegate to Critic (01-requirements-critic.md):
  Artifacts: updated 4 files, round: 2
  |
  v
Critic reviews --> round-2-critique.md (0 BLOCKING, 1 WARNING)
  |
  v
Orchestrator: blocking_count = 0 --> CONVERGED
  |
  v
Save final artifacts (overwrite standard names)
Generate debate-summary.md
Update state.json: debate_state.converged = true
  |
  v
Phase 01 complete. Proceed to GATE-01.
```

### 5.2 Debate OFF (Single-Agent Path)

```
User: /isdlc feature "Small fix" -light
  |
  v
isdlc.md: -light flag detected
  |
  v
Orchestrator: resolveDebateMode() --> debate_mode = false
  |
  v
Write state.json: active_workflow.debate_mode = false
  |
  v
Delegate to 01-requirements-analyst.md (NO DEBATE_CONTEXT)
  |
  v
Current single-agent behavior -- unchanged from today
  |
  v
Phase 01 complete. Proceed to GATE-01.
```

### 5.3 Max Rounds Reached (Unconverged)

```
--- ROUND 3 ---
  |
  v
Critic reviews --> round-3-critique.md (1 BLOCKING, 0 WARNING)
  |
  v
Orchestrator: blocking_count = 1 > 0 BUT round == 3 == max_rounds
  |
  v
Save latest artifacts (best effort)
Generate debate-summary.md with "UNCONVERGED" status
Append warning to requirements-spec.md:
  "[WARNING: Debate did not converge. 1 BLOCKING finding remains. See debate-summary.md.]"
Update state.json: debate_state.converged = false
  |
  v
Phase 01 complete (with warning). Proceed to GATE-01.
```

---

## 6. Backward Compatibility Strategy (NFR-002, NFR-003)

The architectural invariant is: **when debate mode is OFF, Phase 01 behavior is identical to the current production behavior**.

| Component | Invariant | Verification |
|-----------|-----------|-------------|
| `01-requirements-analyst.md` | No DEBATE_CONTEXT in prompt = current behavior unchanged | Regression test: single-agent mode |
| `00-sdlc-orchestrator.md` | `debate_mode == false` = delegates to analyst as today | Regression test: orchestrator single-agent path |
| `isdlc.md` | No `--debate`/`--no-debate` flags = default resolution only | Existing tests pass |
| `iteration-requirements.json` | Phase 01 gate validation unchanged for single-agent mode | Existing hook tests pass |
| state.json | `debate_mode` and `debate_state` fields are additive; absence = debate off | No migration needed |

**Migration:** No migration needed. All changes are additive. The absence of `debate_mode` in state.json is treated as `false` (debate off).

---

## 7. Extensibility Strategy (NFR-005)

The debate loop is designed to be reusable for future phases (03-Architecture, 04-Design, 06-Implementation).

**Extensibility Points:**

1. **Agent roles are injected, not hardcoded:** The orchestrator's debate loop section uses role names (Creator, Critic, Refiner) that map to specific agents per phase. Adding debate to Phase 03 means mapping Creator=solution-architect, Critic=architecture-critic, Refiner=architecture-refiner.

2. **Debate orchestration logic is generic:** The convergence check (blocking findings == 0), max rounds limit (configurable per phase), and artifact versioning pattern (round-N-critique.md) work for any phase.

3. **Configuration per phase:** A future `debate_config` section in state.json or iteration-requirements.json can define per-phase debate settings:

```json
{
  "debate_config": {
    "01-requirements": { "max_rounds": 3, "creator": "01-requirements-analyst", "critic": "01-requirements-critic", "refiner": "01-requirements-refiner" },
    "03-architecture": { "max_rounds": 2, "creator": "03-solution-architect", "critic": "03-architecture-critic", "refiner": "03-architecture-refiner" }
  }
}
```

This is not implemented in this feature but the architecture accommodates it without structural changes.

---

## 8. Files Changed Summary

| File | Change Type | Lines Changed (est.) | Risk |
|------|------------|---------------------|------|
| `src/claude/agents/01-requirements-analyst.md` | Major modification (debate awareness + conversational opening) | ~200 | High |
| `src/claude/agents/00-sdlc-orchestrator.md` | Significant addition (debate loop section) | ~150 | High |
| `src/claude/agents/01-requirements-critic.md` | **New file** (full agent definition) | ~300 | Medium |
| `src/claude/agents/01-requirements-refiner.md` | **New file** (full agent definition) | ~250 | Medium |
| `src/claude/commands/isdlc.md` | Minor modification (flag parsing) | ~30 | Low |
| `src/claude/CLAUDE.md.template` | Minor addition (flag documentation) | ~15 | Low |
| `docs/AGENTS.md` | Minor edit (agent count update) | ~5 | Low |

Total estimated: ~950 lines across 7 files (5 modified, 2 new).

---

## 9. Requirement Traceability

| Requirement | Architectural Component | Section |
|-------------|------------------------|---------|
| FR-001 | Creator debate-mode awareness in requirements-analyst.md | 4.2 |
| FR-002 | New Critic agent (01-requirements-critic.md) | 4.3 |
| FR-003 | New Refiner agent (01-requirements-refiner.md) | 4.4 |
| FR-004 | Debate loop orchestration in sdlc-orchestrator.md | 4.1 |
| FR-005 | Flag precedence resolution in isdlc.md + orchestrator | 4.5 |
| FR-006 | Artifact versioning (round-N-critique.md, debate-summary.md) | 4.6 |
| FR-007 | Conversational Creator opening in requirements-analyst.md | 4.2 |
| FR-008 | Orchestrator delegation updates | 4.1 |
| NFR-001 | Sequential delegation (no parallel overhead) | 4.1 |
| NFR-002 | Backward compatibility (no DEBATE_CONTEXT = current behavior) | 6 |
| NFR-003 | -light flag = debate OFF | 4.5 |
| NFR-004 | Max 3 rounds hard limit in orchestrator | 4.1 |
| NFR-005 | Generic debate loop, agent roles injected | 7 |
| CON-001 | No new npm dependencies | 1 |
| CON-002 | No new hooks (debate is prompt-level) | 1 |
| CON-003 | New agents follow NN-agent-name.md convention | 4.3, 4.4 |

---

## 10. Risk Mitigation

| Risk | Mitigation | Owner |
|------|-----------|-------|
| Creator rewrite breaks single-agent mode | Write regression tests BEFORE modifying analyst; DEBATE_CONTEXT absence = no change | Test Strategy (Phase 05) |
| Debate loop does not converge | Max 3 rounds hard limit; unconverged path saves best-effort artifacts | Architecture (this doc) |
| Gate-blocker rejects Phase 01 in debate mode | Creator's menu interactions satisfy elicitation requirements; debate_mode_override as fallback | Implementation (Phase 06) |
| Critic is too strict (always finds BLOCKING) | Calibrate Critic prompt with examples; Critic must justify BLOCKING severity | Implementation (Phase 06) |
| Critic is too lenient (never finds BLOCKING) | Include mandatory checks (Given/When/Then, quantified NFRs) as non-negotiable BLOCKING criteria | Implementation (Phase 06) |
| Orchestrator prompt becomes too large | Debate loop section is self-contained; can be extracted to a debate-orchestrator sub-agent if needed (not needed now per Article V) | Future |
