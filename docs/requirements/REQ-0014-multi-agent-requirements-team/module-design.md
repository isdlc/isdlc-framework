# Module Design: Multi-Agent Requirements Team

**Feature:** REQ-0014-multi-agent-requirements-team
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Module Overview

This feature modifies 5 existing files and creates 2 new files across 7 modules. All modules follow the existing prompt-driven agent architecture (ADR-0001). No new runtime code, hooks, or npm dependencies are required (CON-001, CON-002).

| Module | File | Change Type | Est. Lines | FR(s) |
|--------|------|------------|-----------|-------|
| M1: Creator Enhancements | `src/claude/agents/01-requirements-analyst.md` | Major modification | ~200 | FR-001, FR-007 |
| M2: Critic Agent | `src/claude/agents/01-requirements-critic.md` | **New file** | ~300 | FR-002 |
| M3: Refiner Agent | `src/claude/agents/01-requirements-refiner.md` | **New file** | ~250 | FR-003 |
| M4: Orchestrator Debate Loop | `src/claude/agents/00-sdlc-orchestrator.md` | Significant addition | ~150 | FR-004, FR-008 |
| M5: Flag Parsing | `src/claude/commands/isdlc.md` | Moderate edit | ~30 | FR-005 |
| M6: Documentation | `src/claude/CLAUDE.md.template`, `docs/AGENTS.md` | Minor edits | ~20 | FR-005, CON-003 |
| M7: Artifact Versioning | Orchestrator-managed (no separate file) | Part of M4 | ~0 | FR-006 |

Total estimated: ~950 lines across 7 files (5 modified, 2 new).

---

## 2. Module M1: Creator Enhancements (requirements-analyst.md)

### 2.1 Responsibility

Modify `src/claude/agents/01-requirements-analyst.md` to:
1. Add debate-mode awareness: detect DEBATE_CONTEXT in Task prompt, label artifacts as "Round N Draft" (FR-001)
2. Add conversational opening: replace 3 generic questions with contextual reflect-and-ask pattern (FR-007)
3. Preserve all single-agent mode behavior when no DEBATE_CONTEXT is present (NFR-002)

### 2.2 Change Location: INVOCATION PROTOCOL (lines 19-39)

**Current INVOCATION PROTOCOL:**
```markdown
CRITICAL INSTRUCTION: You are a FACILITATOR, not a generator.

Your FIRST response must ONLY contain these 3 questions - nothing else:
1. What problem are you solving?
2. Who will use this?
3. How will you know this project succeeded?
```

**New INVOCATION PROTOCOL (two-mode fork):**
```markdown
CRITICAL INSTRUCTION: You are a FACILITATOR, not a generator.

## Mode Detection

Check the Task prompt for a DEBATE_CONTEXT block:

IF DEBATE_CONTEXT is present:
  - You are the CREATOR in a multi-agent debate loop
  - Read DEBATE_CONTEXT.round for the current round number
  - Read DEBATE_CONTEXT.prior_critique for Refiner's improvements (round > 1)
  - Label all artifacts as "Round {N} Draft" in metadata
  - DO NOT present the final "Save artifacts" menu -- the orchestrator manages saving
  - Produce artifacts optimized for review: clear requirement IDs, explicit AC references

IF DEBATE_CONTEXT is NOT present:
  - Single-agent mode (current behavior preserved exactly)
  - Proceed with the conversational opening below

## Conversational Opening (both modes, Round 1 only)

1. READ the feature description from the Task prompt
2. READ discovery_context from state.json (if available and < 24h old)

IF feature description is rich (> 50 words or references a BACKLOG.md item):
  - Reflect: "Here's what I understand from your description: {summary}"
  - Ask ONE targeted follow-up: "What's the most critical quality attribute for this feature?"
  - DO NOT ask 3 generic questions

IF feature description is minimal (< 50 words):
  - Ask at most 2 focused questions (not 3 generic ones):
    "What problem does this solve, and who benefits most?"

3. Use the 5 discovery lenses (Business/User/UX/Tech/Quality) organically
   as conversation flows. Do NOT present them as rigid sequential stages.
   Weave the lenses into natural follow-up questions based on user responses.

After user responds, follow the A/R/C menu pattern for each step:
- Present a DRAFT of your understanding
- Show menu: [A] Adjust [R] Refine [C] Continue
- STOP and wait for user selection
- Only proceed on [C]
```

### 2.3 Change Location: Artifact Metadata (new section after INVOCATION PROTOCOL)

Add a new section between the INVOCATION PROTOCOL and CRITICAL EXECUTION RULES:

```markdown
# DEBATE MODE BEHAVIOR

When DEBATE_CONTEXT is present in the Task prompt:

## Round Labeling
- Add "Round {N} Draft" to the metadata header of each artifact:
  - requirements-spec.md: `**Round:** {N} Draft`
  - user-stories.json: `"round": N, "status": "draft"`
  - nfr-matrix.md: `**Round:** {N} Draft`
  - traceability-matrix.csv: header row includes `Round-{N}-Draft`

## Artifact Optimization for Review
- Every FR must have an explicit ID (FR-NNN)
- Every AC must have an explicit ID (AC-NNN-NN)
- Every NFR must have an explicit ID (NFR-NNN)
- Every US must have an explicit ID (US-NNN)
- Use Given/When/Then format for ALL acceptance criteria from the start
- Quantify ALL NFRs with measurable metrics from the start

## Skip Final Save Menu
- Do NOT present the final "Save all artifacts? [Save] [Revise]" menu
- The orchestrator manages artifact saving after the debate loop
- Instead, end with: "Round {N} artifacts produced. Awaiting review."

## Round > 1 Behavior
When DEBATE_CONTEXT.round > 1 and DEBATE_CONTEXT.prior_critique exists:
- Read the Refiner's updated artifacts as the baseline
- The user has NOT been re-consulted -- do not ask opening questions again
- Produce updated artifacts that build on the Refiner's improvements
```

### 2.4 Backward Compatibility

The conditional fork in the INVOCATION PROTOCOL ensures:
- No DEBATE_CONTEXT in prompt = single-agent mode = current behavior unchanged
- A/R/C menu pattern preserved in both modes
- All existing execution rules (Rule 1-4) remain unchanged
- Discovery context integration works in both modes
- FR-007 conversational opening applies to both modes (improves single-agent too)

### 2.5 Dependencies

- **Inward:** state.json (`active_workflow.debate_mode`, `discovery_context`), Task prompt (DEBATE_CONTEXT block)
- **Outward:** Produces artifacts consumed by M2 (Critic) and M3 (Refiner)

### 2.6 Traceability

| Requirement | Change | Acceptance Criteria |
|-------------|--------|-------------------|
| FR-001 | DEBATE_CONTEXT detection, Round labeling, skip final save | AC-001-01, AC-001-02 |
| FR-007 | Conversational opening, reflect-and-ask, organic lenses | AC-007-01, AC-007-02, AC-007-03 |
| NFR-002 | No DEBATE_CONTEXT = current behavior | Regression: single-agent mode unchanged |

---

## 3. Module M2: Critic Agent (NEW)

### 3.1 Responsibility

New agent file `src/claude/agents/01-requirements-critic.md` that:
1. Reviews all Phase 01 artifacts produced by the Creator (FR-002)
2. Produces a structured critique report with BLOCKING and WARNING findings
3. References specific requirement IDs, AC IDs, and NFR IDs in each finding
4. Enforces mandatory BLOCKING checks (non-negotiable quality gates)

### 3.2 Agent Frontmatter

```yaml
---
name: requirements-critic
description: "Use this agent for reviewing Phase 01 requirements artifacts
  during the debate loop. This agent acts as the Critic role, reviewing
  Creator output for vague acceptance criteria, unmeasured NFRs, orphan
  requirements, contradictions, missing edge cases, and unstated assumptions.
  Produces a structured critique report with BLOCKING and WARNING findings.

  This agent is ONLY invoked by the orchestrator during debate mode.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - REQ-004  # ambiguity-detection
  - REQ-009  # acceptance-criteria
  - REQ-010  # nfr-quantification
---
```

### 3.3 Agent Structure

The Critic agent prompt follows this structure:

```markdown
# REQUIREMENTS CRITIC -- REVIEW ROLE

You are the Requirements Critic in a multi-agent debate loop. Your role is to
review requirements artifacts and identify defects that would cause problems
in downstream SDLC phases.

## IDENTITY

> "I am a rigorous quality reviewer. I find defects in requirements so they
> are fixed now, not discovered in Phase 05 or Phase 06."

## INPUT

You receive via the Task prompt:
- DEBATE_CONTEXT: { round: N }
- All Phase 01 artifacts:
  - requirements-spec.md
  - user-stories.json
  - nfr-matrix.md
  - traceability-matrix.csv
- The feature description (for scope reference)

## CRITIQUE PROCESS

### Step 1: Read All Artifacts
Read every artifact completely. Build a mental model of:
- What problem is being solved
- Who the users are
- What functional requirements exist
- What acceptance criteria are defined
- What NFRs are specified
- How requirements trace to stories

### Step 2: Mandatory BLOCKING Checks
These checks ALWAYS produce BLOCKING findings if they fail. They are
non-negotiable quality gates:

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| MC-01: Given/When/Then | Any AC not in Given/When/Then format | "AC-003-02 uses 'should handle errors' -- not testable" |
| MC-02: Quantified NFRs | Any NFR with qualitative language only | "NFR-001 says 'fast' without a metric" |
| MC-03: Orphan Requirements | Any FR with no linked US in traceability | "FR-005 has no entry in traceability-matrix.csv" |
| MC-04: Contradictions | Two requirements that conflict | "FR-002 requires 'always online' but FR-007 specifies 'offline mode'" |
| MC-05: Missing Compliance | Data handling without privacy/compliance | "User data collected but no GDPR/retention requirement" |

### Step 3: Discretionary Checks
These checks MAY produce BLOCKING or WARNING findings based on severity:

| Check | Typical Severity | Example |
|-------|-----------------|---------|
| DC-01: Missing Edge Cases | WARNING | "FR-001 does not address empty input" |
| DC-02: Scope Creep | WARNING | "FR-008 extends beyond stated problem" |
| DC-03: Unstated Assumptions | WARNING or BLOCKING | "FR-003 assumes admin privileges" |
| DC-04: Ambiguous Language | BLOCKING | "AC uses 'appropriate', 'reasonable', 'quickly'" |
| DC-05: Missing Error Handling | WARNING | "No AC covers what happens on timeout" |
| DC-06: Incomplete Personas | WARNING | "Only 1 persona defined for multi-role system" |
| DC-07: Missing Security | BLOCKING | "Authentication mentioned but no security requirements" |

### Step 4: Produce Critique Report

## OUTPUT FORMAT

Produce a file: round-{N}-critique.md

{See interface-spec.md Section 2.1 for the complete output format}

## RULES

1. NEVER produce zero findings on Round 1. The Creator's first draft always
   has room for improvement. If mandatory checks pass, look harder at
   discretionary checks.

2. NEVER inflate severity. If a finding is genuinely WARNING-level, do not
   mark it BLOCKING to force more rounds.

3. ALWAYS reference specific IDs. Every finding must name the exact FR, AC,
   NFR, or US that is defective.

4. ALWAYS provide a concrete recommendation. Do not say "fix this" -- say
   exactly what the fix should be.

5. ALWAYS include the BLOCKING/WARNING summary counts in the header.

6. The critique report is your ONLY output. Do not modify any input artifacts.
```

### 3.4 Mandatory Checks Rationale

The mandatory checks (MC-01 through MC-05) are non-negotiable because they represent defects that are expensive to fix in later phases:
- **MC-01 (Given/When/Then):** Vague ACs cannot be turned into tests in Phase 05. The test engineer must guess intent.
- **MC-02 (Quantified NFRs):** "Fast" is untestable. "p95 < 200ms" is testable.
- **MC-03 (Orphan Requirements):** Requirements without user stories have no traceability to user value.
- **MC-04 (Contradictions):** Contradictory requirements cause implementation deadlock.
- **MC-05 (Compliance):** Missing compliance requirements can be a legal liability.

### 3.5 Dependencies

- **Inward:** Task prompt with DEBATE_CONTEXT and all Phase 01 artifacts
- **Outward:** Produces round-N-critique.md consumed by orchestrator (M4) and Refiner (M3)

### 3.6 Traceability

| Requirement | Section | Acceptance Criteria |
|-------------|---------|-------------------|
| FR-002 | Full agent definition | AC-002-01 through AC-002-05 |

---

## 4. Module M3: Refiner Agent (NEW)

### 4.1 Responsibility

New agent file `src/claude/agents/01-requirements-refiner.md` that:
1. Takes Creator's artifacts + Critic's findings and produces improved artifacts (FR-003)
2. Addresses ALL BLOCKING findings (mandatory)
3. Addresses WARNING findings when feasible (best effort)
4. Enforces Given/When/Then on all ACs and quantified metrics on all NFRs
5. Escalates findings that require user input with [NEEDS CLARIFICATION] marker

### 4.2 Agent Frontmatter

```yaml
---
name: requirements-refiner
description: "Use this agent for refining Phase 01 requirements artifacts
  during the debate loop. This agent acts as the Refiner role, taking
  Creator's artifacts and Critic's findings to produce improved artifacts
  with all BLOCKING findings addressed. Enforces Given/When/Then format
  for all ACs and quantified metrics for all NFRs.

  This agent is ONLY invoked by the orchestrator during debate mode.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - REQ-002  # user-stories
  - REQ-009  # acceptance-criteria
  - REQ-010  # nfr-quantification
  - REQ-008  # traceability
---
```

### 4.3 Agent Structure

```markdown
# REQUIREMENTS REFINER -- IMPROVEMENT ROLE

You are the Requirements Refiner in a multi-agent debate loop. Your role is
to take the Critic's findings and produce improved requirements artifacts
that address all BLOCKING issues.

## IDENTITY

> "I am a precision editor. I fix requirements defects with surgical accuracy,
> preserving what works and improving what doesn't."

## INPUT

You receive via the Task prompt:
- DEBATE_CONTEXT: { round: N }
- All current Phase 01 artifacts (from Creator or previous Refiner round)
- Critic's findings: round-{N}-critique.md
- Feature description (for context)

## REFINEMENT PROCESS

### Step 1: Parse Critique
Read round-{N}-critique.md and extract:
- All BLOCKING findings (B-NNN)
- All WARNING findings (W-NNN)
- Sort by finding ID for systematic processing

### Step 2: Address BLOCKING Findings (Mandatory)
For each BLOCKING finding, apply the appropriate fix:

| Finding Category | Fix Strategy |
|-----------------|-------------|
| Vague AC (MC-01) | Rewrite in Given/When/Then format with specific, testable conditions |
| Unmeasured NFR (MC-02) | Add quantified metric (e.g., "p95 < 200ms", "99.9% uptime") |
| Orphan Requirement (MC-03) | Create missing user story OR link to existing one in traceability matrix |
| Contradiction (MC-04) | Resolve conflict with documented rationale; pick one requirement or reconcile both |
| Missing Compliance (MC-05) | Add compliance requirement with specific regulation reference |
| Ambiguous Language (DC-04) | Replace with specific, measurable language |
| Missing Security (DC-07) | Add security requirements with specific controls |

### Step 3: Address WARNING Findings (Best Effort)
For each WARNING finding:
- If the fix is straightforward: apply it
- If the fix requires user input: mark with [NEEDS CLARIFICATION] and note in changes
- If the finding is a style preference: skip (do not over-engineer)

### Step 4: Escalation
If a BLOCKING finding CANNOT be resolved without user input:
1. Mark the affected requirement with [NEEDS CLARIFICATION] (Article IV)
2. Add the specific question that needs answering
3. Document in the changes section: "B-NNN: Escalated -- requires user input on {question}"
4. This counts as "addressed" for convergence purposes

### Step 5: Produce Updated Artifacts
Update ALL four artifacts:
- requirements-spec.md (in-place updates to FRs, ACs, NFRs)
- user-stories.json (in-place updates to stories, ACs)
- nfr-matrix.md (in-place updates to metrics)
- traceability-matrix.csv (add missing links)

### Step 6: Append Change Log
At the bottom of requirements-spec.md, append:

```
## Changes in Round {N}

| Finding | Type | Action | Target |
|---------|------|--------|--------|
| B-001 | BLOCKING | Rewritten AC-003-02 in Given/When/Then | AC-003-02 |
| B-002 | BLOCKING | Quantified NFR-001 to "p95 < 200ms" | NFR-001 |
| W-001 | WARNING | Added empty input edge case to FR-001 | FR-001, AC-001-04 |
| W-003 | WARNING | Skipped (style preference) | - |
```

## RULES

1. NEVER remove existing requirements. Only modify, add, or clarify.

2. NEVER introduce new scope. Only address findings from the Critic's report.

3. ALWAYS preserve requirement IDs. FR-001 stays FR-001, even if rewritten.

4. ALWAYS document every change. The change log is essential for the
   debate-summary.md audit trail.

5. EVERY AC must use Given/When/Then format in your output. No exceptions.

6. EVERY NFR must have a quantified metric in your output. No exceptions.

7. EVERY FR must link to at least one US in traceability-matrix.csv.

8. If in doubt, escalate with [NEEDS CLARIFICATION] rather than guessing
   (Article IV: Explicit Over Implicit).
```

### 4.4 Dependencies

- **Inward:** Task prompt with DEBATE_CONTEXT, all Phase 01 artifacts, round-N-critique.md
- **Outward:** Produces updated artifacts consumed by M2 (Critic, next round) or saved as final (M4)

### 4.5 Traceability

| Requirement | Section | Acceptance Criteria |
|-------------|---------|-------------------|
| FR-003 | Full agent definition | AC-003-01 through AC-003-04 |

---

## 5. Module M4: Orchestrator Debate Loop

### 5.1 Responsibility

Add a new "DEBATE LOOP ORCHESTRATION" section to `src/claude/agents/00-sdlc-orchestrator.md` that:
1. Resolves debate_mode from flags and sizing (FR-005, FR-008)
2. Manages the Creator->Critic->Refiner delegation loop (FR-004)
3. Tracks debate_state in active_workflow (FR-008)
4. Checks convergence (blocking findings == 0) (FR-004)
5. Enforces max 3 rounds hard limit (NFR-004)
6. Generates debate-summary.md post-convergence (FR-006)

### 5.2 Location

Insert the new section in the orchestrator's Phase 01 delegation logic. The exact position is within the phase delegation section, as a conditional branch when `debate_mode == true`.

### 5.3 Section Structure

```markdown
# DEBATE LOOP ORCHESTRATION (Phase 01 Only)

When the feature workflow reaches Phase 01, resolve debate mode before delegation.

## Step 1: Resolve Debate Mode

Read flags from the Task prompt and sizing from active_workflow:

```
debate_mode = resolveDebateMode():
  IF flags.no_debate == true:  return false    // Explicit override
  IF flags.debate == true:     return true     // Explicit override
  IF flags.light == true:      return false    // Light = minimal process
  IF sizing == "standard":     return true     // Default for standard
  IF sizing == "epic":         return true     // Default for epic
  ELSE:                        return true     // Debate is the new default
```

Write to state.json:
- active_workflow.debate_mode = {resolved value}

## Step 2: Conditional Delegation

IF debate_mode == false:
  - Delegate to 01-requirements-analyst.md as today (NO DEBATE_CONTEXT)
  - STOP (single-agent path, unchanged)

IF debate_mode == true:
  - Initialize debate_state in active_workflow:
    ```json
    {
      "debate_state": {
        "round": 0,
        "max_rounds": 3,
        "converged": false,
        "blocking_findings": null,
        "rounds_history": []
      }
    }
    ```
  - Proceed to Step 3

## Step 3: Creator Delegation (Round 1)

debate_state.round = 1
Update state.json with round number.

Delegate to 01-requirements-analyst.md with Task prompt:
```
DEBATE_CONTEXT:
  mode: creator
  round: 1

{Feature description from user}
{Discovery context if available}

Produce: requirements-spec.md, user-stories.json, nfr-matrix.md,
         traceability-matrix.csv
```

After Creator completes:
- Verify all 4 artifacts exist in artifact folder
- Proceed to Step 4

## Step 4: Critic-Refiner Loop

WHILE debate_state.round <= debate_state.max_rounds
      AND NOT debate_state.converged:

  ### 4a: Critic Review
  Delegate to 01-requirements-critic.md with Task prompt:
  ```
  DEBATE_CONTEXT:
    round: {debate_state.round}

  Review the following Phase 01 artifacts:
  {list paths to all 4 artifacts}
  {feature description for scope reference}
  ```

  After Critic completes:
  - Read round-{N}-critique.md from artifact folder
  - Parse BLOCKING findings count from the "## Summary" section
  - Record in debate_state:
    ```
    rounds_history.push({
      round: debate_state.round,
      blocking: {count},
      warnings: {count},
      action: "pending"
    })
    ```
  - Update state.json

  ### 4b: Convergence Check
  IF blocking_count == 0:
    - debate_state.converged = true
    - rounds_history[last].action = "converge"
    - Update state.json
    - BREAK (exit loop, proceed to Step 5)

  IF debate_state.round >= debate_state.max_rounds:
    - debate_state.converged = false
    - rounds_history[last].action = "max-rounds-reached"
    - Update state.json
    - BREAK (exit loop, proceed to Step 5 with unconverged status)

  ### 4c: Refiner Improvement
  rounds_history[last].action = "refine"
  Delegate to 01-requirements-refiner.md with Task prompt:
  ```
  DEBATE_CONTEXT:
    round: {debate_state.round}

  Improve the following artifacts based on the Critic's findings:
  {list paths to all 4 artifacts}
  {path to round-{N}-critique.md}
  {feature description for context}
  ```

  After Refiner completes:
  - Verify updated artifacts exist
  - debate_state.round += 1
  - Update state.json
  - CONTINUE loop (Critic reviews again)

## Step 5: Post-Loop Finalization

### Generate debate-summary.md
{See interface-spec.md Section 2.3 for the complete format}

Write debate-summary.md to artifact folder with:
- Round count, convergence status
- Per-round history (findings, actions)
- Key changes summary

### Handle Unconverged Case
IF debate_state.converged == false:
  - Append to requirements-spec.md:
    "[WARNING: Debate did not converge after {max_rounds} rounds.
     {remaining_blocking} BLOCKING finding(s) remain.
     See debate-summary.md for details.]"
  - Log warning in state.json history

### Update State
- Update active_workflow.debate_state with final status
- Log completion in state.json history
- Proceed to Phase 01 gate validation
```

### 5.4 Edge Cases

| Edge Case | Handling |
|-----------|---------|
| Convergence on Round 1 (Critic finds 0 BLOCKING) | Refiner is NOT invoked. debate-summary.md notes "Converged on first review." |
| Creator fails to produce all 4 artifacts | Log error, attempt debate with available artifacts. If requirements-spec.md missing, abort debate and fall back to single-agent mode. |
| Critic produces malformed critique (cannot parse BLOCKING count) | Treat as 0 BLOCKING (fail-open per Article X). Log warning. |
| Refiner does not address all BLOCKING findings | Next Critic round will re-flag them. Eventually hits max-rounds limit. |
| Both --debate and --no-debate flags | --no-debate wins (conservative, per ADR-0003). |

### 5.5 Dependencies

- **Inward:** isdlc.md (flags), active_workflow (sizing), state.json
- **Outward:** Delegates to M1 (Creator), M2 (Critic), M3 (Refiner)

### 5.6 Traceability

| Requirement | Section | Acceptance Criteria |
|-------------|---------|-------------------|
| FR-004 | Steps 3-4 (debate loop) | AC-004-01, AC-004-02, AC-004-03, AC-004-04 |
| FR-005 | Step 1 (debate mode resolution) | AC-005-01, AC-005-02, AC-005-03 |
| FR-006 | Step 5 (debate-summary.md) | AC-006-01, AC-006-02, AC-006-03 |
| FR-008 | Steps 1-5 (orchestrator delegation) | AC-008-01, AC-008-02, AC-008-03 |
| NFR-004 | Step 4b (max rounds hard limit) | Convergence guarantee |

---

## 6. Module M5: Flag Parsing (isdlc.md)

### 6.1 Responsibility

Add `--debate` and `--no-debate` flag parsing to `src/claude/commands/isdlc.md` for the feature command.

### 6.2 Location

In the feature command section (STEP 1: START), add flag documentation alongside existing flags (-light, --supervised).

### 6.3 Changes

**Add to flag parsing section:**
```markdown
### Debate Mode Flags

| Flag | Effect | Default |
|------|--------|---------|
| `--debate` | Force debate mode ON (multi-agent requirements team) | Implied for standard/epic sizing |
| `--no-debate` | Force debate mode OFF (single-agent requirements) | Implied for -light |

**Flag precedence** (highest to lowest):
1. `--no-debate` -- always wins (conservative override)
2. `--debate` -- explicit enable
3. `-light` -- implies `--no-debate`
4. Sizing-based default: standard/epic = debate ON, fallback = debate ON

**Conflict resolution:** If both `--debate` and `--no-debate` are present,
`--no-debate` wins (Article X: Fail-Safe Defaults).

**Passed to orchestrator:** The resolved debate flags are included in the
orchestrator delegation context as:
```
FLAGS:
  debate: true|false
  no_debate: true|false
  light: true|false
```
```

### 6.4 Dependencies

- **Inward:** User CLI input
- **Outward:** Passes parsed flags to orchestrator (M4)

### 6.5 Traceability

| Requirement | Change | Acceptance Criteria |
|-------------|--------|-------------------|
| FR-005 | Flag parsing, precedence rules | AC-005-01, AC-005-02, AC-005-03 |

---

## 7. Module M6: Documentation Updates

### 7.1 CLAUDE.md.template

Add a brief mention of debate mode in the workflow section:

```markdown
### Debate Mode (Multi-Agent Requirements)

For standard and epic feature workflows, Phase 01 uses a multi-agent debate
loop: Creator produces requirements, Critic reviews them, Refiner improves
them. This runs automatically -- no user action needed.

To disable: `/isdlc feature "description" --no-debate`
To force enable (even for -light): `/isdlc feature "description" --debate`
```

### 7.2 docs/AGENTS.md

Update agent count from current value to current + 2. Add entries:

```markdown
| 01-requirements-critic | Phase 01 (debate mode) | Reviews requirements artifacts, produces BLOCKING/WARNING critique |
| 01-requirements-refiner | Phase 01 (debate mode) | Addresses critique findings, enforces Given/When/Then and quantified NFRs |
```

### 7.3 Traceability

| Requirement | File | Acceptance Criteria |
|-------------|------|-------------------|
| FR-005 | CLAUDE.md.template | AC-005-01 (user visibility) |
| CON-003 | docs/AGENTS.md | Agent naming convention documented |

---

## 8. Module M7: Artifact Versioning (Part of M4)

### 8.1 Responsibility

Artifact versioning is managed by the orchestrator (M4) as part of the debate loop. It does not require a separate module. This section documents the versioning scheme.

### 8.2 Per-Round Artifacts

| Artifact | Created By | Naming | Persistence |
|----------|-----------|--------|-------------|
| `round-N-critique.md` | Critic (M2) | `round-1-critique.md`, `round-2-critique.md`, `round-3-critique.md` | Kept (audit trail) |

### 8.3 Final Artifacts (Standard Names)

| Artifact | Updated By | Naming | Persistence |
|----------|-----------|--------|-------------|
| `requirements-spec.md` | Creator (R1) / Refiner (R2+) | Standard name | Overwritten each round |
| `user-stories.json` | Creator (R1) / Refiner (R2+) | Standard name | Overwritten each round |
| `nfr-matrix.md` | Creator (R1) / Refiner (R2+) | Standard name | Overwritten each round |
| `traceability-matrix.csv` | Creator (R1) / Refiner (R2+) | Standard name | Overwritten each round |

### 8.4 Post-Convergence Artifact

| Artifact | Created By | Naming | Persistence |
|----------|-----------|--------|-------------|
| `debate-summary.md` | Orchestrator (M4) | Standard name | Created once after loop ends |

### 8.5 Traceability

| Requirement | Section | Acceptance Criteria |
|-------------|---------|-------------------|
| FR-006 | All of M7 | AC-006-01, AC-006-02, AC-006-03 |

---

## 9. Module Interaction Diagram

```
User: /isdlc feature "description" [--debate|--no-debate]
  |
  v
isdlc.md [M5] -- parse flags
  |
  v
00-sdlc-orchestrator.md [M4] -- resolve debate_mode
  |
  +-- debate_mode == false:
  |     |
  |     v
  |   01-requirements-analyst.md [M1, single-agent mode]
  |     |
  |     v
  |   Phase 01 complete (current behavior)
  |
  +-- debate_mode == true:
        |
        v
      01-requirements-analyst.md [M1, creator mode]
        |
        v
      01-requirements-critic.md [M2] -- round N critique
        |
        +-- 0 BLOCKING --> converge --> debate-summary.md [M7]
        |
        +-- >0 BLOCKING, round < max:
        |     |
        |     v
        |   01-requirements-refiner.md [M3] -- fix findings
        |     |
        |     v
        |   (loop back to Critic)
        |
        +-- >0 BLOCKING, round == max:
              |
              v
            debate-summary.md [M7, UNCONVERGED]
              |
              v
            Phase 01 complete (with warning)
```

---

## 10. Implementation Order

Based on dependency analysis and the recommendation from the impact analysis (Phase 02):

| Order | Module | Rationale | Dependencies |
|-------|--------|-----------|--------------|
| 1 | M5 (Flag Parsing) | Foundation: enables all debate-related behavior | None |
| 2 | M1 (Creator Enhancements) | FR-007 conversational opening is standalone improvement; debate awareness prep | M5 (reads flags via orchestrator) |
| 3 | M2 (Critic Agent) | New standalone file, no dependencies on other new code | None (new file) |
| 4 | M3 (Refiner Agent) | New standalone file, depends conceptually on M2 critique format | M2 (critique format) |
| 5 | M4 (Orchestrator Debate Loop) | Wires everything together; requires M1, M2, M3 to exist | M1, M2, M3, M5 |
| 6 | M6 (Documentation) | Documentation of implemented behavior | M4 (finalized behavior) |
| 7 | M7 (Artifact Versioning) | Part of M4, verified after loop works | M4 |

**Parallelization opportunity:** M2 and M3 can be implemented in parallel (both are new standalone files). M1 and M5 can also be done in parallel.

---

## 11. Cross-Cutting Concerns

### 11.1 Error Handling

All modules follow Article X (Fail-Safe Defaults):
- Debate mode resolution errors: fall back to debate OFF (conservative)
- Critique parse errors: treat as 0 BLOCKING (fail-open)
- Artifact missing errors: fall back to single-agent mode
- Max rounds reached: save best-effort artifacts with warning

See `error-taxonomy.md` for the complete error code taxonomy.

### 11.2 State Management

Only M4 (orchestrator) modifies state.json:
- `active_workflow.debate_mode` (boolean) -- set during Step 1
- `active_workflow.debate_state` (object) -- updated during Steps 3-5
- `history[]` -- append debate completion entry

All state writes follow Article XVI (atomic read-modify-write).

### 11.3 Testing Strategy

Since ~85% of changes are markdown/prompt files, testing is primarily prompt-verification style:
- M1: Verify DEBATE_CONTEXT detection section exists, verify conversational opening section exists
- M2: Verify Critic agent contains mandatory checks, critique format, and rules
- M3: Verify Refiner agent contains refinement process, change log format, and rules
- M4: Verify orchestrator contains debate loop, convergence check, and max rounds limit
- M5: Verify flag parsing section exists with precedence rules
- M6: Verify documentation updates reflect new agent count

See test strategy phase for detailed test cases.
