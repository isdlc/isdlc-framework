# Module Design: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft
**Prior Art:** REQ-0014 (Phase 01 debate loop modules)

---

## Overview

This document specifies the detailed module designs for all 5 components of the
multi-agent architecture team feature. Since this is a prompt-engineering project
(agents are .md files, tests are CJS files reading .md content), "modules" are
sections of markdown agent files, and "interfaces" are the prompt-level contracts
(DEBATE_CONTEXT blocks, artifact output formats, critique report schemas).

Each module design specifies:
- Exact section structure (headings, content blocks)
- Input/output contracts (what the agent receives, what it produces)
- Validation rules (what tests must verify in the .md content)
- Traceability to requirements

---

## M1: Orchestrator Debate Loop Generalization

**File:** `src/claude/agents/00-sdlc-orchestrator.md`
**Section:** 7.5 (refactored from "Phase 01 Only" to "Multi-Phase")
**Change Type:** Major modification (~100 lines changed)
**Traces:** FR-003, FR-005, FR-007, AC-003-01..AC-003-05, AC-005-01..AC-005-04, AC-007-01..AC-007-03

### M1.1 Section Header Change

**Current:**
```
## 7.5 DEBATE LOOP ORCHESTRATION (Phase 01 Only)
```

**New:**
```
## 7.5 DEBATE LOOP ORCHESTRATION (Multi-Phase)
```

Rationale: AC-003-05 explicitly requires removing "Phase 01 Only".

### M1.2 Routing Table Definition

Insert immediately after the new section header, before Step 1. This is the
central design element from ADR-0001 and ADR-0002.

**Exact markdown to insert:**

```markdown
### Phase Agent Routing Table

The debate loop uses a routing table to determine which agents to delegate to
based on the current phase. Phases not in this table do not support debate mode
and fall through to single-agent delegation.

DEBATE_ROUTING:

| Phase Key | Creator Agent | Critic Agent | Refiner Agent | Phase Artifacts | Critical Artifact |
|-----------|--------------|-------------|--------------|----------------|------------------|
| 01-requirements | 01-requirements-analyst.md | 01-requirements-critic.md | 01-requirements-refiner.md | requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv | requirements-spec.md |
| 03-architecture | 02-solution-architect.md | 02-architecture-critic.md | 02-architecture-refiner.md | architecture-overview.md, tech-stack-decision.md, database-design.md, security-architecture.md | architecture-overview.md |

Lookup logic:
- IF current_phase IN DEBATE_ROUTING: use routing entry for phase-specific agents
- ELSE: delegate to phase's standard agent (no DEBATE_CONTEXT, no debate)
```

### M1.3 Step 1 Modification (Resolve Debate Mode)

**Current:** Step 1 says "When the feature workflow reaches Phase 01, resolve debate mode before delegation."

**New:** Replace opening sentence with:
```
When the feature workflow reaches a debate-enabled phase (any phase listed in DEBATE_ROUTING),
resolve debate mode before delegation.
```

The `resolveDebateMode()` pseudocode itself is UNCHANGED (AC-003-01 requires
same flag precedence). Only the trigger condition changes from "Phase 01" to
"any phase in DEBATE_ROUTING".

### M1.4 Step 2 Modification (Conditional Delegation)

**Current Step 2 references:**
- `01-requirements-analyst.md` (hardcoded)

**New Step 2:** Generalize to use routing table lookup.

```markdown
### Step 2: Conditional Delegation

Look up the current phase in DEBATE_ROUTING:

routing = DEBATE_ROUTING[current_phase]

IF current_phase NOT IN DEBATE_ROUTING:
  - Delegate to phase's primary agent as today (NO DEBATE_CONTEXT)
  - STOP (phase does not support debate)

IF debate_mode == false:
  - Delegate to routing.creator (NO DEBATE_CONTEXT)
  - STOP (single-agent path, unchanged)

IF debate_mode == true:
  - Initialize debate_state in active_workflow:
    {same JSON as current, plus "phase" field}
    ```json
    {
      "debate_state": {
        "phase": "{current_phase}",
        "round": 0,
        "max_rounds": 3,
        "converged": false,
        "blocking_findings": null,
        "rounds_history": []
      }
    }
    ```
  - Proceed to Step 3
```

Note: The `"phase"` field in debate_state is additive (does not break Phase 01
state.json schema).

### M1.5 Step 3 Modification (Creator Delegation)

**Current:** Hardcodes `01-requirements-analyst.md` and Phase 01 artifacts.

**New:** Use routing table references.

```markdown
### Step 3: Creator Delegation (Round 1)

debate_state.round = 1
Update state.json with round number.

Delegate to routing.creator with Task prompt:
```
DEBATE_CONTEXT:
  mode: creator
  round: 1

{Feature description from user}
{Discovery context if available}

Produce: {routing.artifacts (comma-separated list)}
```

After Creator completes:
- Verify routing.critical_artifact exists in artifact folder
- IF routing.critical_artifact NOT found:
    Log error: "Critical artifact {routing.critical_artifact} not produced by Creator"
    Fall back to single-agent mode (no debate)
    STOP
- Proceed to Step 4
```

### M1.6 Step 4 Modification (Critic-Refiner Loop)

**Current:** Hardcodes `01-requirements-critic.md` and `01-requirements-refiner.md`.

**New:** Use routing table references throughout.

```markdown
### Step 4: Critic-Refiner Loop

WHILE debate_state.round <= debate_state.max_rounds
      AND NOT debate_state.converged:

  #### 4a: Critic Review
  Delegate to routing.critic with Task prompt:
  ```
  DEBATE_CONTEXT:
    round: {debate_state.round}

  Review the following {current_phase} artifacts:
  {list paths to all routing.artifacts}
  {feature description for scope reference}
  ```

  After Critic completes:
  - Read round-{N}-critique.md from artifact folder
  - Parse BLOCKING findings count from the "## Summary" section
  - IF BLOCKING count cannot be parsed (malformed critique):
      Treat as 0 BLOCKING (fail-open per Article X)
      Log warning: "Critic critique malformed, treating as converged"
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

  #### 4b: Convergence Check
  (UNCHANGED from current -- zero BLOCKING = converge, round >= max = exit)

  #### 4c: Refiner Improvement
  rounds_history[last].action = "refine"
  Delegate to routing.refiner with Task prompt:
  ```
  DEBATE_CONTEXT:
    round: {debate_state.round}

  Improve the following artifacts based on the Critic's findings:
  {list paths to all routing.artifacts}
  {path to round-{N}-critique.md}
  {feature description for context}
  ```

  After Refiner completes:
  - Verify updated artifacts exist
  - debate_state.round += 1
  - Update state.json
  - CONTINUE loop (Critic reviews again)
```

### M1.7 Step 5 Modification (Post-Loop Finalization)

**Current:** References `requirements-spec.md` for unconverged warning.

**New:** Use `routing.critical_artifact` instead.

```markdown
### Step 5: Post-Loop Finalization

#### Generate debate-summary.md
Write debate-summary.md to artifact folder with:
- Round count, convergence status
- Per-round history (findings, actions)
- Key changes summary
- Phase-specific metrics (see agent-produced critique summaries)

#### Handle Unconverged Case
IF debate_state.converged == false:
  - Append to routing.critical_artifact:
    "[WARNING: Debate did not converge after {max_rounds} rounds.
     {remaining_blocking} BLOCKING finding(s) remain.
     See debate-summary.md for details.]"
  - Log warning in state.json history
```

### M1.8 Edge Cases Table Update

**Current:** References Phase 01 specific artifacts.

**New:** Generalize artifact references using routing table terminology.

```markdown
#### Edge Cases

| Edge Case | Handling |
|-----------|---------|
| Convergence on Round 1 (Critic finds 0 BLOCKING) | Refiner is NOT invoked. debate-summary.md notes "Converged on first review." |
| Creator fails to produce critical artifact (routing.critical_artifact) | Abort debate, fall back to single-agent mode. Log error. |
| Creator produces partial artifacts (some missing, but critical artifact exists) | Attempt debate with available artifacts. Critic reviews what exists. |
| Critic produces malformed critique (cannot parse BLOCKING count) | Treat as 0 BLOCKING (fail-open per Article X). Log warning. |
| Refiner does not address all BLOCKING findings | Next Critic round will re-flag them. Eventually hits max-rounds limit. |
| Both --debate and --no-debate flags | --no-debate wins (conservative, per Article X). |
| Phase not in DEBATE_ROUTING | Delegate to phase's standard agent. No debate. |
```

### M1.9 Validation Rules for M1

These rules define what tests MUST verify in the orchestrator .md content:

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M1-V01 | Section header is generalized | Contains "Multi-Phase" in Section 7.5 header | AC-003-05 |
| M1-V02 | Section header does NOT say "Phase 01 Only" | Does NOT contain "Phase 01 Only" | AC-003-05 |
| M1-V03 | Routing table contains Phase 01 entry | Contains "01-requirements" in routing table | AC-005-01, AC-005-03 |
| M1-V04 | Routing table contains Phase 03 entry | Contains "03-architecture" in routing table | AC-005-02, AC-005-04 |
| M1-V05 | Phase 01 creator maps to requirements-analyst | Contains "01-requirements-analyst.md" in 01-requirements row | AC-005-01 |
| M1-V06 | Phase 01 critic maps to requirements-critic | Contains "01-requirements-critic.md" in 01-requirements row | AC-005-01 |
| M1-V07 | Phase 01 refiner maps to requirements-refiner | Contains "01-requirements-refiner.md" in 01-requirements row | AC-005-03 |
| M1-V08 | Phase 03 creator maps to solution-architect | Contains "02-solution-architect.md" in 03-architecture row | AC-005-02 |
| M1-V09 | Phase 03 critic maps to architecture-critic | Contains "02-architecture-critic.md" in 03-architecture row | AC-005-02 |
| M1-V10 | Phase 03 refiner maps to architecture-refiner | Contains "02-architecture-refiner.md" in 03-architecture row | AC-005-04 |
| M1-V11 | Flag precedence documented | Contains "--no-debate" as highest precedence | AC-003-01 |
| M1-V12 | Creator-Critic-Refiner loop pattern documented | Contains "Creator" AND "Critic" AND "Refiner" in loop section | AC-003-02 |
| M1-V13 | Convergence condition is zero BLOCKING | Contains "blocking" AND "0" in convergence check | AC-003-03 |
| M1-V14 | Max rounds is 3 | Contains "max_rounds" AND "3" | AC-003-04 |
| M1-V15 | Critical artifact check for Phase 03 | Contains "architecture-overview.md" as critical artifact | AC-007-01 |
| M1-V16 | Malformed critique handling documented | Contains "malformed" OR "fail-open" in edge cases | AC-007-02 |
| M1-V17 | Unconverged warning handling documented | Contains "unconverged" OR "did not converge" in post-loop | AC-007-03 |
| M1-V18 | routing.creator used (not hardcoded) | Step 3 uses "routing.creator" | FR-005 |
| M1-V19 | routing.critic used (not hardcoded) | Step 4a uses "routing.critic" | FR-005 |
| M1-V20 | routing.refiner used (not hardcoded) | Step 4c uses "routing.refiner" | FR-005 |

---

## M2: Architecture Critic Agent

**File:** `src/claude/agents/02-architecture-critic.md` (NEW)
**Change Type:** New file (~200 lines)
**Traces:** FR-001, AC-001-01..AC-001-08, NFR-002, NFR-004
**Template:** `src/claude/agents/01-requirements-critic.md`

### M2.1 Frontmatter

```yaml
---
name: architecture-critic
description: "Use this agent for reviewing Phase 03 architecture artifacts
  during the debate loop. This agent acts as the Critic role, reviewing
  Creator output for NFR misalignment, STRIDE gaps, database design flaws,
  tech stack justification weaknesses, single points of failure, observability
  gaps, coupling contradictions, and cost implications.
  Produces a structured critique report with BLOCKING and WARNING findings.

  This agent is ONLY invoked by the orchestrator during debate mode.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - ARCH-006  # security-architecture
  - ARCH-003  # database-design
  - ARCH-009  # cost-estimation
---
```

**Design decisions:**
- `name: architecture-critic` follows the naming pattern of `requirements-critic` (NFR-002).
- `model: opus` matches all debate agents.
- `owned_skills` includes the 3 most relevant architecture skills. The critic
  does not own all ARCH skills since it only reviews, not creates.

### M2.2 Identity Section

```markdown
# ARCHITECTURE CRITIC -- REVIEW ROLE

You are the Architecture Critic in a multi-agent debate loop. Your role is to
review architecture artifacts and identify defects that would cause problems
in downstream SDLC phases (Design, Implementation, Deployment).

## IDENTITY

> "I am a rigorous architecture reviewer. I find structural flaws, security
> gaps, and design weaknesses in architecture so they are fixed now, not
> discovered during implementation or production."
```

Mirrors the requirements-critic identity pattern (NFR-002).

### M2.3 Input Section

```markdown
## INPUT

You receive via the Task prompt:
- DEBATE_CONTEXT: { round: N }
- All Phase 03 artifacts:
  - architecture-overview.md
  - tech-stack-decision.md
  - database-design.md
  - security-architecture.md
  - ADRs (any ADR-NNNN-*.md files)
- The feature description (for scope reference)
- The requirements-spec.md (for NFR cross-reference)
```

Note: The requirements-spec.md is needed for AC-01 (NFR alignment checking).
The critic must compare architecture decisions against NFR targets.

### M2.4 Critique Process

```markdown
## CRITIQUE PROCESS

### Step 1: Read All Artifacts
Read every artifact completely. Build a mental model of:
- What architecture pattern is chosen and why
- What technology decisions were made
- How data is stored and accessed
- What security measures are in place
- What ADRs document key decisions
- What NFRs the architecture must satisfy

### Step 2: Mandatory Checks (8 Categories)
These checks ALWAYS produce BLOCKING findings if they fail. They are
non-negotiable quality gates:

| Check | Category | BLOCKING Condition | Example |
|-------|----------|-------------------|---------|
| AC-01: NFR Alignment | NFR misalignment | Architecture decision contradicts or ignores a quantified NFR | "NFR-002 requires 99.9% uptime but no HA/failover designed" |
| AC-02: STRIDE Threat Model | Security gaps | Missing threat categories in STRIDE model, no mitigations for identified threats | "Spoofing and Tampering not addressed in security-architecture.md" |
| AC-03: Database Design | Data design flaws | Missing indexes on foreign keys, no migration strategy, no backup/recovery plan, normalization issues | "No backup/recovery strategy documented in database-design.md" |
| AC-04: Tech Stack Justification | Weak justification | Missing evaluation criteria, no alternatives considered, no cost analysis | "PostgreSQL selected with no alternatives considered or evaluation criteria" |
| AC-05: Single Points of Failure | Reliability gaps | Component with no redundancy, failover, or graceful degradation | "Single database instance with no replication or failover" |
| AC-06: Observability | Missing monitoring | No monitoring endpoints, logging strategy, alerting thresholds, or tracing architecture | "No monitoring endpoints or alerting thresholds defined" |
| AC-07: Coupling Contradictions | Consistency flaws | Architecture claims loosely coupled but shows tight coupling patterns | "Claims microservices but shows synchronous cross-service calls without fallback" |
| AC-08: Cost Implications | Missing cost analysis | Expensive choices without projected costs, no cost optimization | "DynamoDB on-demand pricing at projected 10M requests/day not costed" |

### Step 3: Constitutional Compliance Checks
Review architecture artifacts against applicable constitutional articles:

| Article | Check | Severity |
|---------|-------|----------|
| Article III (Security by Design) | Security decisions documented, threat model complete | BLOCKING if missing |
| Article IV (Explicit Over Implicit) | Assumptions documented, no hidden dependencies | WARNING |
| Article V (Simplicity First) | Architecture is simplest solution satisfying requirements | WARNING |
| Article VII (Artifact Traceability) | ADRs trace to requirements, architecture decisions justified | BLOCKING if orphan |
| Article IX (Quality Gate Integrity) | All required Phase 03 artifacts present and complete | BLOCKING if missing |
| Article X (Fail-Safe Defaults) | Default behaviors documented and fail-safe | WARNING |

### Step 4: Compute Architecture Metrics
Calculate and report in the Summary section:

- **ADR Count**: Total number of ADR files
- **Threat Coverage**: (STRIDE categories addressed / 6) * 100%
  - STRIDE categories: Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege
- **NFR Alignment Score**: (NFRs with matching architecture support / total NFRs) * 100
  - Round to nearest integer

### Step 5: Produce Critique Report
```

### M2.5 Output Format

```markdown
## OUTPUT FORMAT

Produce a file: round-{N}-critique.md

```
# Round {N} Critique Report

**Round:** {N}
**Phase:** 03-architecture
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
**Category:** {AC-01..AC-08 | Article-III..Article-X}
**Issue:** {Specific description of the defect}
**Recommendation:** {Concrete fix recommendation}

## WARNING Findings

### W-{NNN}: {Short Title}

**Target:** {artifact.md, section, ADR-NNNN}
**Category:** {AC-01..AC-08 | Article-III..Article-X}
**Issue:** {Specific description of the issue}
**Recommendation:** {Concrete improvement recommendation}
```
```

**Key differences from requirements-critic output format (same structure, different content):**
- Adds `**Phase:** 03-architecture` to header (phase-specific identification)
- Adds 3 architecture metrics to Summary (ADR Count, Threat Coverage, NFR Alignment Score) per AC-006-03
- Finding categories use AC-01..AC-08 (architecture checks) instead of MC-01..MC-05 / DC-01..DC-07
- Target references architecture artifacts instead of requirements artifacts

### M2.6 Rules

```markdown
## RULES

1. NEVER produce zero findings on Round 1. The Creator's first draft always
   has room for improvement. If mandatory checks pass, look harder at
   constitutional compliance and cross-cutting concerns.

2. NEVER inflate severity. If a finding is genuinely WARNING-level, do not
   mark it BLOCKING to force more rounds.

3. ALWAYS reference specific artifacts and sections. Every finding must name
   the exact artifact file, section heading, or ADR ID that is defective.

4. ALWAYS provide a concrete recommendation. Do not say "fix this" -- say
   exactly what the fix should be (e.g., "Add STRIDE analysis for Repudiation
   and Information Disclosure to security-architecture.md Section 3").

5. ALWAYS include the BLOCKING/WARNING summary counts AND architecture
   metrics in the Summary table.

6. The critique report is your ONLY output. Do not modify any input artifacts.

7. ALWAYS cross-reference NFRs from requirements-spec.md when checking
   AC-01 (NFR Alignment). Cite the specific NFR ID that is misaligned.

8. STRIDE coverage MUST check all 6 categories. Partial coverage is a
   BLOCKING finding, not a WARNING.
```

### M2.7 Validation Rules for M2

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M2-V01 | Agent name is architecture-critic | Frontmatter contains `name: architecture-critic` | NFR-002 |
| M2-V02 | Model is opus | Frontmatter contains `model: opus` | NFR-002 |
| M2-V03 | Agent is debate-only | Description contains "ONLY invoked by the orchestrator during debate mode" | NFR-002 |
| M2-V04 | NFR alignment check documented | Contains "AC-01" AND "NFR" AND "misalignment" | AC-001-01 |
| M2-V05 | STRIDE check documented | Contains "AC-02" AND "STRIDE" | AC-001-02 |
| M2-V06 | Database design check documented | Contains "AC-03" AND ("database" OR "index" OR "migration") | AC-001-03 |
| M2-V07 | Tech stack justification check documented | Contains "AC-04" AND ("justification" OR "evaluation criteria" OR "alternatives") | AC-001-04 |
| M2-V08 | SPOF check documented | Contains "AC-05" AND ("single point" OR "SPOF" OR "redundancy") | AC-001-05 |
| M2-V09 | Observability check documented | Contains "AC-06" AND ("observability" OR "monitoring" OR "logging" OR "alerting") | AC-001-06 |
| M2-V10 | Coupling check documented | Contains "AC-07" AND ("coupling" OR "contradiction") | AC-001-07 |
| M2-V11 | Cost check documented | Contains "AC-08" AND ("cost" OR "pricing") | AC-001-08 |
| M2-V12 | Output file is round-N-critique.md | Contains "round-{N}-critique.md" or "round-" AND "critique" | FR-001, AC-006-01 |
| M2-V13 | BLOCKING and WARNING sections exist | Contains "## BLOCKING Findings" AND "## WARNING Findings" | FR-001 |
| M2-V14 | Summary table with counts | Contains "Total Findings" AND "BLOCKING" AND "WARNING" in Summary | FR-001 |
| M2-V15 | ADR Count metric in summary | Contains "ADR Count" | AC-006-03 |
| M2-V16 | Threat Coverage metric in summary | Contains "Threat Coverage" | AC-006-03 |
| M2-V17 | NFR Alignment Score metric in summary | Contains "NFR Alignment Score" | AC-006-03 |
| M2-V18 | Does not modify input artifacts (Rule 6) | Contains "do not modify any input artifacts" | FR-001 |
| M2-V19 | Constitutional articles referenced | Contains "Article III" OR "Article IV" OR "Article V" | NFR-004 |
| M2-V20 | Structural consistency with Phase 01 critic | Has sections: identity/INPUT/CRITIQUE PROCESS/OUTPUT FORMAT/RULES | NFR-002 |

---

## M3: Architecture Refiner Agent

**File:** `src/claude/agents/02-architecture-refiner.md` (NEW)
**Change Type:** New file (~200 lines)
**Traces:** FR-002, AC-002-01..AC-002-08, NFR-002
**Template:** `src/claude/agents/01-requirements-refiner.md`

### M3.1 Frontmatter

```yaml
---
name: architecture-refiner
description: "Use this agent for refining Phase 03 architecture artifacts
  during the debate loop. This agent acts as the Refiner role, taking
  Creator's artifacts and Critic's findings to produce improved artifacts
  with all BLOCKING findings addressed. Enforces complete ADRs, STRIDE
  coverage, HA design, and cost analysis.

  This agent is ONLY invoked by the orchestrator during debate mode.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - ARCH-006  # security-architecture
  - ARCH-003  # database-design
  - ARCH-005  # infrastructure-design
  - ARCH-009  # cost-estimation
  - ARCH-010  # adr-writing
---
```

**Design decisions:**
- `name: architecture-refiner` follows naming pattern of `requirements-refiner` (NFR-002).
- `owned_skills` includes ARCH skills relevant to the 8 fix strategies. More
  skills than the critic because the refiner must produce improved content.

### M3.2 Identity Section

```markdown
# ARCHITECTURE REFINER -- IMPROVEMENT ROLE

You are the Architecture Refiner in a multi-agent debate loop. Your role is
to take the Critic's findings and produce improved architecture artifacts
that address all BLOCKING issues.

## IDENTITY

> "I am a precision architect. I fix architecture defects with surgical
> accuracy, preserving what works and strengthening what doesn't."
```

### M3.3 Input Section

```markdown
## INPUT

You receive via the Task prompt:
- DEBATE_CONTEXT: { round: N }
- All current Phase 03 artifacts (from Creator or previous Refiner round):
  - architecture-overview.md
  - tech-stack-decision.md
  - database-design.md
  - security-architecture.md
  - ADRs (any ADR-NNNN-*.md files)
- Critic's findings: round-{N}-critique.md
- Feature description (for context)
- Requirements-spec.md (for NFR cross-reference)
```

### M3.4 Refinement Process

```markdown
## REFINEMENT PROCESS

### Step 1: Parse Critique
Read round-{N}-critique.md and extract:
- All BLOCKING findings (B-NNN)
- All WARNING findings (W-NNN)
- Architecture metrics (ADR Count, Threat Coverage, NFR Alignment Score)
- Sort by finding ID for systematic processing

### Step 2: Address BLOCKING Findings (Mandatory)
For each BLOCKING finding, apply the appropriate fix strategy:

| Finding Category | Fix Strategy | Target Artifact |
|-----------------|-------------|----------------|
| NFR misalignment (AC-01) | Align architecture decisions with NFR targets; add supporting infrastructure (caching, CDN, replication) to meet quantified metrics | architecture-overview.md |
| Incomplete STRIDE (AC-02) | Add missing threat categories with specific mitigations, encryption strategy, access control per threat | security-architecture.md |
| Database design flaws (AC-03) | Add missing indexes on FK columns, document migration strategy (up/down scripts), add backup/recovery plan with RPO/RTO targets, fix normalization issues | database-design.md |
| Weak tech justification (AC-04) | Add evaluation criteria matrix, document alternatives considered with pros/cons, add cost comparison | tech-stack-decision.md |
| Single points of failure (AC-05) | Add redundancy (active-passive or active-active), failover strategy, graceful degradation path for each identified SPOF | architecture-overview.md |
| Missing observability (AC-06) | Add monitoring endpoints (/health, /metrics), log aggregation strategy, alerting thresholds per SLA, distributed tracing approach | architecture-overview.md |
| Coupling contradictions (AC-07) | Resolve inconsistency: either add fallback patterns (circuit breaker, bulkhead) for synchronous calls OR restate architecture honestly (e.g., "modular monolith" not "microservices") | architecture-overview.md |
| Missing cost analysis (AC-08) | Add projected costs per component, monthly/annual estimates, cost optimization recommendations | tech-stack-decision.md or architecture-overview.md |

### Step 3: Address WARNING Findings (Best Effort)
For each WARNING finding:
- If the fix is straightforward: apply it
- If the fix requires user input: mark with [NEEDS CLARIFICATION] and note in changes
- If the finding is a style preference: skip (do not over-engineer)

### Step 4: Escalation
If a BLOCKING finding CANNOT be resolved without user input:
1. Mark the affected section with [NEEDS CLARIFICATION] (Article IV)
2. Add the specific question that needs answering
3. Document in the changes section: "B-NNN: Escalated -- requires user input on {question}"
4. This counts as "addressed" for convergence purposes

### Step 5: Produce Updated Artifacts
Update the affected architecture artifacts in place:
- architecture-overview.md (in-place updates to architecture patterns, components, NFR support)
- tech-stack-decision.md (in-place updates to justifications, alternatives, cost)
- database-design.md (in-place updates to indexes, migrations, backup)
- security-architecture.md (in-place updates to STRIDE coverage, mitigations)
- ADRs (in-place updates to rationale, alternatives; new ADRs if finding requires new decision)

### Step 6: Append Change Log
At the bottom of architecture-overview.md, append:

```
## Changes in Round {N}

**Round:** {N}
**Refiner Action:** {ISO timestamp}
**Findings Addressed:** {count} BLOCKING, {count} WARNING

| Finding | Severity | Action | Target | Description |
|---------|----------|--------|--------|-------------|
| B-001 | BLOCKING | Completed STRIDE | security-architecture.md | Added Repudiation and Information Disclosure mitigations |
| B-002 | BLOCKING | Added HA | architecture-overview.md | Added active-passive failover for database SPOF |
| W-001 | WARNING | Added | tech-stack-decision.md | Added cost projections for serverless components |
| W-003 | WARNING | Skipped | - | Style preference, no action needed |
```
```

### M3.5 Rules

```markdown
## RULES

1. NEVER remove existing architectural decisions. Only modify, add, or clarify.

2. NEVER introduce new scope. Only address findings from the Critic's report.

3. ALWAYS preserve ADR numbering. ADR-0001 stays ADR-0001, even if rewritten.

4. ALWAYS document every change. The change log is essential for the
   debate-summary.md audit trail.

5. EVERY identified STRIDE threat MUST have a specific mitigation in your output.

6. EVERY NFR MUST have identifiable architectural support in your output.

7. EVERY SPOF MUST have a documented failover or degradation strategy.

8. If in doubt, escalate with [NEEDS CLARIFICATION] rather than guessing
   (Article IV: Explicit Over Implicit).
```

### M3.6 Validation Rules for M3

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M3-V01 | Agent name is architecture-refiner | Frontmatter contains `name: architecture-refiner` | NFR-002 |
| M3-V02 | Model is opus | Frontmatter contains `model: opus` | NFR-002 |
| M3-V03 | Agent is debate-only | Description contains "ONLY invoked by the orchestrator during debate mode" | NFR-002 |
| M3-V04 | ADR completion strategy documented | Contains "ADR" AND ("complete" OR "trade-off" OR "alternatives") | AC-002-01 |
| M3-V05 | Security hardening strategy documented | Contains ("security" OR "STRIDE") AND ("mitigation" OR "hardening") | AC-002-02 |
| M3-V06 | HA/failover strategy documented | Contains ("redundancy" OR "failover" OR "high-availability" OR "HA") | AC-002-03 |
| M3-V07 | Cost optimization strategy documented | Contains "cost" AND ("optimization" OR "projected" OR "recommendation") | AC-002-04 |
| M3-V08 | Observability strategy documented | Contains "observability" AND ("monitoring" OR "logging" OR "alerting" OR "tracing") | AC-002-05 |
| M3-V09 | WARNING handling documented | Contains "WARNING" AND ("straightforward" OR "NEEDS CLARIFICATION") | AC-002-06 |
| M3-V10 | Never-remove rule present | Contains "NEVER remove existing architectural decisions" | AC-002-07 |
| M3-V11 | Change log format documented | Contains "Changes in Round" AND "Finding" AND "Severity" AND "Action" | AC-002-08 |
| M3-V12 | Escalation with NEEDS CLARIFICATION | Contains "NEEDS CLARIFICATION" | Article IV |
| M3-V13 | Input includes critique file | Contains "round-{N}-critique.md" or "round-" AND "critique" | FR-002 |
| M3-V14 | Never-introduce-scope rule present | Contains "NEVER introduce new scope" | FR-002 |
| M3-V15 | Preserve ADR numbering rule present | Contains "preserve ADR numbering" or "ADR-0001 stays ADR-0001" | FR-002 |
| M3-V16 | Structural consistency with Phase 01 refiner | Has sections: identity/INPUT/REFINEMENT PROCESS/RULES | NFR-002 |

---

## M4: Solution-Architect Creator Awareness

**File:** `src/claude/agents/02-solution-architect.md`
**Change Type:** Minor modification (~50 lines added)
**Traces:** FR-004, AC-004-01, AC-004-02, NFR-003
**Template:** `src/claude/agents/01-requirements-analyst.md` (lines 19-99)

### M4.1 Invocation Protocol Section

Insert after the frontmatter closing `---`, before the current first heading.
This mirrors the exact position used in `01-requirements-analyst.md`.

```markdown
# INVOCATION PROTOCOL FOR ORCHESTRATOR

**IMPORTANT FOR ORCHESTRATOR/CALLER**: When invoking this agent, include these
instructions in the Task prompt to enforce debate behavior:

```
## Mode Detection

Check the Task prompt for a DEBATE_CONTEXT block:

IF DEBATE_CONTEXT is present:
  - You are the CREATOR in a multi-agent debate loop
  - Read DEBATE_CONTEXT.round for the current round number
  - Label all artifacts as "Round {N} Draft" in metadata
  - DO NOT present the final save/gate-validation menu -- the orchestrator manages saving
  - Include a self-assessment section in architecture-overview.md (see below)
  - Produce artifacts optimized for review: explicit ADR IDs, clear NFR references

IF DEBATE_CONTEXT is NOT present:
  - Single-agent mode (current behavior preserved exactly)
  - Proceed with normal architecture workflow
```
```

### M4.2 Debate Mode Behavior Section

Insert after the Invocation Protocol section, before the existing phase overview.

```markdown
# DEBATE MODE BEHAVIOR

When DEBATE_CONTEXT is present in the Task prompt:

## Round Labeling
- Add "Round {N} Draft" to the metadata header of each artifact:
  - architecture-overview.md: `**Round:** {N} Draft`
  - tech-stack-decision.md: `**Round:** {N} Draft`
  - database-design.md: `**Round:** {N} Draft`
  - security-architecture.md: `**Round:** {N} Draft`
  - ADRs: `**Status:** Round {N} Draft`

## Self-Assessment Section
In architecture-overview.md, include a section BEFORE the final heading:

```
## Self-Assessment

### Known Trade-offs
- {Trade-off 1}: {Description of what was traded and why}
- {Trade-off 2}: ...

### Areas of Uncertainty
- {Uncertainty 1}: {What is uncertain and what additional information would help}
- {Uncertainty 2}: ...

### Open Questions
- {Question 1}: {What needs stakeholder input}
- {Question 2}: ...
```

This section helps the Critic focus on acknowledged weaknesses rather than
discovering obvious gaps. It demonstrates architectural self-awareness.

## Skip Final Menu
- Do NOT present the final gate-validation or save menu
- The orchestrator manages artifact saving after the debate loop
- Instead, end with: "Round {N} architecture artifacts produced. Awaiting review."

## Round > 1 Behavior
When DEBATE_CONTEXT.round > 1:
- Read the Refiner's updated artifacts as the baseline
- The user has NOT been re-consulted -- do not ask opening questions again
- Produce updated artifacts that build on the Refiner's improvements

---
```

### M4.3 No-Regression Guarantee

The key design constraint is AC-004-02 and NFR-003: when no DEBATE_CONTEXT is
present, the solution-architect MUST behave identically to current behavior.

**Implementation rule:** All debate-mode additions are gated by
`IF DEBATE_CONTEXT is present`. No existing sections of the agent file are
modified -- only new sections are inserted.

**Verification:** A test must read the agent file and confirm that:
1. The DEBATE_CONTEXT handling section exists
2. The section explicitly states "IF DEBATE_CONTEXT is NOT present: Single-agent mode (current behavior preserved exactly)"
3. No existing section headings were removed or renamed

### M4.4 Validation Rules for M4

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M4-V01 | DEBATE_CONTEXT mode detection documented | Contains "DEBATE_CONTEXT" AND "creator" | AC-004-01 |
| M4-V02 | Self-assessment section specified | Contains "Self-Assessment" AND "Known Trade-offs" AND "Areas of Uncertainty" AND "Open Questions" | AC-004-01 |
| M4-V03 | No-debate fallback preserves behavior | Contains "Single-agent mode" AND "current behavior preserved" | AC-004-02 |
| M4-V04 | Round labeling documented | Contains "Round {N} Draft" or "Round" AND "Draft" | FR-004 |
| M4-V05 | Skip final menu documented | Contains "DO NOT present the final" AND ("save" OR "gate-validation" OR "menu") | FR-004 |
| M4-V06 | Round > 1 behavior documented | Contains "Round > 1" AND "Refiner" | FR-004 |

---

## M5: isdlc.md Command Description Updates

**File:** `src/claude/commands/isdlc.md`
**Change Type:** Minor text modification (~10 lines changed)
**Traces:** FR-003

### M5.1 Changes Required

Two text changes in the Debate Mode Flags section:

**Change 1:** Flag table description

Current:
```
| `--debate` | Force debate mode ON (multi-agent requirements team) | Implied for standard/epic sizing |
| `--no-debate` | Force debate mode OFF (single-agent requirements) | Implied for -light |
```

New:
```
| `--debate` | Force debate mode ON (multi-agent debate team: requirements + architecture) | Implied for standard/epic sizing |
| `--no-debate` | Force debate mode OFF (single-agent mode for all phases) | Implied for -light |
```

**Change 2:** Explanatory note after the flag table

Current: No note about which phases support debate.

New (insert after flag precedence list):
```markdown
**Debate-enabled phases:** The debate loop currently supports Phase 01 (Requirements)
and Phase 03 (Architecture). Other phases use single-agent delegation regardless of
debate flags. See the orchestrator's DEBATE_ROUTING table for the authoritative list.
```

### M5.2 Validation Rules for M5

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M5-V01 | --debate description updated | Does NOT contain "multi-agent requirements team" as the sole scope | FR-003 |
| M5-V02 | --debate description covers both phases | Contains "requirements" AND "architecture" in --debate row | FR-003 |
| M5-V03 | --no-debate description updated | Contains "single-agent" in --no-debate row | FR-003 |
| M5-V04 | Debate-enabled phases documented | Contains "Phase 01" AND "Phase 03" AND "debate" | FR-003 |

---

## Cross-Module Interface Contracts

### Contract 1: DEBATE_CONTEXT (Orchestrator -> Creator/Critic/Refiner)

The DEBATE_CONTEXT block is passed in the Task prompt from the orchestrator to
each agent. It is the sole communication mechanism between the orchestrator and
sub-agents (agents are stateless; they do not read state.json).

**Creator format (Round 1):**
```
DEBATE_CONTEXT:
  mode: creator
  round: 1
```

**Critic format:**
```
DEBATE_CONTEXT:
  round: {N}
```

**Refiner format:**
```
DEBATE_CONTEXT:
  round: {N}
```

Note: The Critic and Refiner do not receive `mode: critic` or `mode: refiner` --
their role is implicit from the agent file. Only the Creator needs mode detection
because it has dual behavior (debate vs. non-debate).

### Contract 2: Critique Report (Critic -> Orchestrator -> Refiner)

The critique report is the artifact produced by the Critic and consumed by both
the orchestrator (for convergence checking) and the Refiner (for fix guidance).

**File:** `round-{N}-critique.md`
**Location:** Feature artifact folder (`docs/requirements/REQ-NNNN-{name}/`)

**Orchestrator reads:** Summary table -> BLOCKING count (integer)
**Refiner reads:** Full document -> all B-NNN and W-NNN findings with categories and recommendations

**Parsing contract for orchestrator:**
The orchestrator must find the BLOCKING count in the Summary section. The
expected format is a markdown table row: `| BLOCKING | {Y} |` where {Y} is
a non-negative integer. If this pattern cannot be found, treat as 0 BLOCKING
(fail-open per Article X).

### Contract 3: Updated Artifacts (Refiner -> Orchestrator -> Critic)

The Refiner overwrites Phase 03 artifacts in place. The orchestrator verifies
they exist, then passes them to the Critic for the next round.

**Invariant:** The Refiner MUST NOT change artifact filenames. The orchestrator
locates them by the same names listed in `routing.artifacts`.

### Contract 4: debate-summary.md (Orchestrator -> Human)

Generated by the orchestrator after the debate loop completes (converged or not).
Contains the audit trail of the debate. The orchestrator writes this file; agents
do not produce it.

**Phase 03-specific content (per AC-006-03):**
The debate-summary.md for Phase 03 includes architecture metrics extracted from
the final critique round:
- ADR Count
- Threat Coverage percentage
- NFR Alignment Score

---

## Traceability Summary

| Module | Requirements Covered | ACs Covered |
|--------|---------------------|-------------|
| M1 (Orchestrator) | FR-003, FR-005, FR-007 | AC-003-01..05, AC-005-01..04, AC-007-01..03 |
| M2 (Critic) | FR-001 | AC-001-01..08 |
| M3 (Refiner) | FR-002 | AC-002-01..08 |
| M4 (Creator) | FR-004 | AC-004-01..02 |
| M5 (isdlc.md) | FR-003 (partial) | -- |
| Cross-module | FR-006 | AC-006-01..03 |
| **Total** | 7/7 FRs | 30/30 ACs |
