# Interface Specification: Multi-Agent Requirements Team

**Feature:** REQ-0014-multi-agent-requirements-team
**Phase:** 04-design
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Overview

This feature has no HTTP API, no CLI commands, and no library API. All interfaces are:
1. **Prompt interface specifications** (DEBATE_CONTEXT block, critique report format, refiner change log)
2. **State schema extensions** (active_workflow.debate_mode, active_workflow.debate_state)
3. **Artifact format specifications** (round-N-critique.md, debate-summary.md)
4. **Flag interface** (--debate, --no-debate via isdlc.md)

This document defines each interface with precision sufficient for implementation.

---

## 2. Prompt Interface Specifications

### 2.1 DEBATE_CONTEXT Block

The DEBATE_CONTEXT block is included in the Task prompt when delegating to any debate agent. It is the sole mechanism for passing debate loop state from the orchestrator to sub-agents.

**Format (YAML-style, embedded in Task prompt):**

```
DEBATE_CONTEXT:
  mode: creator|critic|refiner
  round: {integer, 1-3}
  prior_critique: {path to round-N-critique.md, only for refiner mode}
  artifacts:
    requirements_spec: {absolute path}
    user_stories: {absolute path}
    nfr_matrix: {absolute path}
    traceability_matrix: {absolute path}
  feature_description: |
    {multi-line feature description from user}
  convergence_target: zero-blocking
  max_rounds: 3
```

**Field Definitions:**

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `mode` | string | Yes | `creator`, `critic`, `refiner` | Which debate role this agent plays |
| `round` | integer | Yes | 1-3 | Current debate round number |
| `prior_critique` | string | Refiner only | File path | Path to the Critic's critique report for this round |
| `artifacts.requirements_spec` | string | Critic, Refiner | File path | Path to requirements-spec.md |
| `artifacts.user_stories` | string | Critic, Refiner | File path | Path to user-stories.json |
| `artifacts.nfr_matrix` | string | Critic, Refiner | File path | Path to nfr-matrix.md |
| `artifacts.traceability_matrix` | string | Critic, Refiner | File path | Path to traceability-matrix.csv |
| `feature_description` | string | Creator (R1) | Multi-line | The user's feature description |
| `convergence_target` | string | All | `zero-blocking` | How convergence is determined |
| `max_rounds` | integer | All | 3 | Maximum rounds before forced exit |

**Mode-Specific Required Fields:**

| Mode | Required Fields | Optional Fields |
|------|----------------|-----------------|
| `creator` | mode, round, feature_description | artifacts (Round > 1 only) |
| `critic` | mode, round, artifacts (all 4) | feature_description |
| `refiner` | mode, round, artifacts (all 4), prior_critique | feature_description |

**Absence Detection:**
Agents detect debate mode by checking for the literal string `DEBATE_CONTEXT:` in their Task prompt. If absent, the agent operates in single-agent mode (backward compatible).

### 2.2 Critique Report Format (round-N-critique.md)

The Critic agent produces this file. The orchestrator parses it for convergence checking.

**Complete Format:**

```markdown
# Round {N} Critique Report

**Round:** {N}
**Reviewed At:** {ISO timestamp}
**Artifacts Reviewed:**
- requirements-spec.md (Round {N} Draft)
- user-stories.json
- nfr-matrix.md
- traceability-matrix.csv

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | {X} |
| BLOCKING | {Y} |
| WARNING | {Z} |

## BLOCKING Findings

### B-{NNN}: {Short Title}

**Target:** {FR-NNN | AC-NNN-NN | NFR-NNN | US-NNN}
**Category:** {MC-01 | MC-02 | MC-03 | MC-04 | MC-05 | DC-01..DC-07}
**Issue:** {Specific description of the defect}
**Recommendation:** {Concrete fix recommendation}

### B-{NNN}: ...

## WARNING Findings

### W-{NNN}: {Short Title}

**Target:** {FR-NNN | AC-NNN-NN | NFR-NNN | US-NNN}
**Category:** {DC-01..DC-07}
**Issue:** {Specific description of the issue}
**Recommendation:** {Concrete improvement recommendation}

### W-{NNN}: ...
```

**Parsing Rules (for orchestrator convergence check):**

The orchestrator extracts the BLOCKING count from the Summary table:
1. Find the line matching `| BLOCKING | {Y} |`
2. Extract the integer value of Y
3. If Y == 0: converged
4. If Y > 0: not converged, continue loop
5. If the Summary section cannot be parsed: treat as 0 BLOCKING (fail-open, Article X)

**Finding ID Format:**

| Prefix | Meaning | Numbering |
|--------|---------|-----------|
| `B-` | BLOCKING finding | Sequential per round: B-001, B-002, ... |
| `W-` | WARNING finding | Sequential per round: W-001, W-002, ... |

Finding IDs reset each round (Round 2 starts at B-001 again). Cross-round references use the format `Round-{N}/B-{NNN}`.

### 2.3 Debate Summary Format (debate-summary.md)

The orchestrator generates this file after the debate loop ends (converged or unconverged).

**Complete Format:**

```markdown
# Debate Summary: {artifact_folder}

**Feature:** {feature description (first 100 chars)}
**Debate Mode:** {ON}
**Generated:** {ISO timestamp}
**Convergence:** {Yes (round N) | No (max rounds reached)}

## Overview

| Metric | Value |
|--------|-------|
| Rounds | {N} |
| Converged | {Yes/No} |
| Total BLOCKING Findings | {sum across all rounds} |
| Total WARNING Findings | {sum across all rounds} |
| BLOCKING Resolved | {count resolved by Refiner} |
| WARNING Resolved | {count resolved by Refiner} |
| Remaining BLOCKING | {0 if converged, N if not} |

## Round History

### Round 1
- **Creator:** Initial draft produced ({count} FRs, {count} ACs, {count} NFRs)
- **Critic:** {blocking_count} BLOCKING, {warning_count} WARNING
- **Action:** {converge | refine | max-rounds-reached}

### Round 2
- **Critic:** {blocking_count} BLOCKING, {warning_count} WARNING
- **Refiner:** Addressed {count} BLOCKING, {count} WARNING findings
- **Action:** {converge | refine | max-rounds-reached}

### Round 3 (if applicable)
- **Critic:** {blocking_count} BLOCKING, {warning_count} WARNING
- **Action:** {converge | max-rounds-reached}

## Key Changes

{Numbered list of the most significant changes made during refinement:}

1. {AC-NNN-NN rewritten in Given/When/Then format (was vague)}
2. {NFR-NNN quantified: "p95 < 200ms" (was "fast")}
3. {FR-NNN linked to US-NNN (was orphan)}
...

## Unconverged Findings (if applicable)

{Only present if converged == No}

| Finding | Round | Target | Issue |
|---------|-------|--------|-------|
| Round-3/B-001 | 3 | {target} | {brief description} |
```

### 2.4 Refiner Change Log Format

The Refiner appends this to requirements-spec.md after each round.

**Format:**

```markdown
---

## Changes in Round {N}

**Round:** {N}
**Refiner Action:** {ISO timestamp}
**Findings Addressed:** {count} BLOCKING, {count} WARNING

| Finding | Severity | Action | Target | Description |
|---------|----------|--------|--------|-------------|
| B-001 | BLOCKING | Rewritten | AC-003-02 | Given/When/Then format applied |
| B-002 | BLOCKING | Quantified | NFR-001 | Added "p95 < 200ms" metric |
| W-001 | WARNING | Added | FR-001, AC-001-04 | Empty input edge case |
| W-003 | WARNING | Skipped | - | Style preference, no action needed |
| B-004 | BLOCKING | Escalated | FR-007 | [NEEDS CLARIFICATION]: Requires user input on auth model |
```

---

## 3. State Schema Extensions

### 3.1 active_workflow.debate_mode

**Type:** boolean
**Default:** absent (treated as false)
**Set by:** Orchestrator (M4, Step 1)
**Read by:** All debate agents (via DEBATE_CONTEXT), state.json consumers

```json
{
  "active_workflow": {
    "debate_mode": true
  }
}
```

**Absence semantics:** If `debate_mode` is absent from `active_workflow`, treat as `false` (debate off). This ensures backward compatibility with workflows started before this feature.

### 3.2 active_workflow.debate_state

**Type:** object
**Default:** absent (debate off or not yet initialized)
**Set by:** Orchestrator (M4, Steps 2-5)
**Read by:** Orchestrator (convergence logic), debate-summary.md generator

```json
{
  "active_workflow": {
    "debate_state": {
      "round": 2,
      "max_rounds": 3,
      "converged": true,
      "blocking_findings": 0,
      "rounds_history": [
        {
          "round": 1,
          "blocking": 5,
          "warnings": 2,
          "action": "refine",
          "timestamp": "2026-02-14T18:00:00Z"
        },
        {
          "round": 2,
          "blocking": 0,
          "warnings": 1,
          "action": "converge",
          "timestamp": "2026-02-14T18:05:00Z"
        }
      ]
    }
  }
}
```

**Field Definitions:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `round` | integer | 0-3 | Current round number (0 = initialized, not started) |
| `max_rounds` | integer | 3 | Maximum rounds allowed |
| `converged` | boolean | true/false | Whether the loop achieved convergence |
| `blocking_findings` | integer or null | 0+ or null | Latest BLOCKING count from Critic |
| `rounds_history` | array | See below | Per-round tracking |

**rounds_history Entry:**

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| `round` | integer | 1-3 | Round number |
| `blocking` | integer | 0+ | BLOCKING findings in this round |
| `warnings` | integer | 0+ | WARNING findings in this round |
| `action` | string | `refine`, `converge`, `max-rounds-reached` | What happened after this round |
| `timestamp` | string | ISO 8601 | When this round completed |

### 3.3 workflow_history Extension

When a debate-mode workflow completes and moves to `workflow_history`, the debate summary is preserved:

```json
{
  "workflow_history": [
    {
      "type": "feature",
      "status": "completed",
      "debate_mode": true,
      "debate_summary": {
        "rounds": 2,
        "converged": true,
        "total_blocking": 5,
        "total_warnings": 3,
        "blocking_resolved": 5
      }
    }
  ]
}
```

### 3.4 phases["01-requirements"] Extension

The Phase 01 state entry gains awareness of debate completion:

```json
{
  "phases": {
    "01-requirements": {
      "status": "completed",
      "debate_used": true,
      "debate_rounds": 2,
      "debate_converged": true
    }
  }
}
```

These fields are informational (not read by hooks). They appear in the phase snapshot for workflow_history.

---

## 4. Flag Interface

### 4.1 CLI Flag Specification

| Flag | Long Form | Type | Default | Description |
|------|-----------|------|---------|-------------|
| n/a | `--debate` | boolean (presence) | false | Force debate mode ON |
| n/a | `--no-debate` | boolean (presence) | false | Force debate mode OFF |

**Usage Examples:**
```
/isdlc feature "Add user authentication"                    # debate ON (standard sizing default)
/isdlc feature "Add user authentication" --no-debate        # debate OFF (explicit)
/isdlc feature "Quick fix" -light                            # debate OFF (light implies no debate)
/isdlc feature "Quick fix" -light --debate                   # debate ON (--debate overrides -light)
/isdlc feature "Add user authentication" --debate --no-debate  # debate OFF (--no-debate wins)
```

### 4.2 Flag Precedence Resolution

The orchestrator resolves the final debate_mode value using this priority chain:

```
resolveDebateMode(flags, sizing):
  1. IF flags.no_debate == true:  RETURN false    // --no-debate always wins
  2. IF flags.debate == true:     RETURN true     // --debate explicit enable
  3. IF flags.light == true:      RETURN false    // -light implies no debate
  4. IF sizing == "standard":     RETURN true     // default for standard
  5. IF sizing == "epic":         RETURN true     // default for epic
  6. ELSE:                        RETURN true     // debate is the new default
```

### 4.3 Flag Passing Protocol

Flags are passed from isdlc.md to the orchestrator via the Task prompt:

```
FLAGS:
  debate: {true|false}
  no_debate: {true|false}
  light: {true|false}
  supervised: {true|false}
```

The orchestrator reads `FLAGS.debate` and `FLAGS.no_debate` to resolve debate mode. The existing `FLAGS.light` flag is also used in the resolution chain.

---

## 5. Finding Classification Taxonomy

### 5.1 Severity Levels

| Severity | Code Prefix | Convergence Impact | Description |
|----------|------------|-------------------|-------------|
| **BLOCKING** | `B-` | Prevents convergence | Must be fixed before the debate can end |
| **WARNING** | `W-` | Does not prevent convergence | Recommended improvement, not required |

### 5.2 Finding Categories

#### Mandatory Checks (always produce BLOCKING if they fail)

| ID | Category | BLOCKING Condition | Example |
|----|----------|-------------------|---------|
| MC-01 | Given/When/Then Format | AC not in Given/When/Then | "AC-003-02 uses 'should handle errors'" |
| MC-02 | Quantified NFRs | NFR without measurable metric | "NFR-001 says 'fast' without a number" |
| MC-03 | Orphan Requirements | FR not linked to any US | "FR-005 not in traceability matrix" |
| MC-04 | Contradictions | Two requirements conflict | "FR-002 and FR-007 are incompatible" |
| MC-05 | Missing Compliance | Data handling without compliance req | "User data but no GDPR requirement" |

#### Discretionary Checks (severity assigned per instance)

| ID | Category | Typical Severity | Example |
|----|----------|-----------------|---------|
| DC-01 | Missing Edge Cases | WARNING | "No AC for empty input" |
| DC-02 | Scope Creep | WARNING | "FR-008 beyond stated problem" |
| DC-03 | Unstated Assumptions | WARNING or BLOCKING | "Assumes admin privileges" |
| DC-04 | Ambiguous Language | BLOCKING | "Uses 'appropriate', 'reasonable'" |
| DC-05 | Missing Error Handling | WARNING | "No timeout behavior defined" |
| DC-06 | Incomplete Personas | WARNING | "1 persona for multi-role system" |
| DC-07 | Missing Security | BLOCKING | "Auth mentioned but no security req" |

### 5.3 Finding Reference Format

Every finding must reference a specific target using the established ID format:

| Target Type | ID Format | Example |
|------------|-----------|---------|
| Functional Requirement | `FR-NNN` | FR-001, FR-005 |
| Acceptance Criterion | `AC-NNN-NN` | AC-003-02 |
| Non-Functional Requirement | `NFR-NNN` | NFR-001 |
| User Story | `US-NNN` | US-003 |
| Constraint | `CON-NNN` | CON-001 |

---

## 6. Artifact Naming Convention

### 6.1 Round-Scoped Artifacts

| Artifact | Pattern | Example | Created By |
|----------|---------|---------|-----------|
| Critique report | `round-{N}-critique.md` | `round-1-critique.md` | Critic |

### 6.2 Standard Artifacts (Overwritten Each Round)

| Artifact | Name | Example | Updated By |
|----------|------|---------|-----------|
| Requirements specification | `requirements-spec.md` | As-is | Creator (R1), Refiner (R2+) |
| User stories | `user-stories.json` | As-is | Creator (R1), Refiner (R2+) |
| NFR matrix | `nfr-matrix.md` | As-is | Creator (R1), Refiner (R2+) |
| Traceability matrix | `traceability-matrix.csv` | As-is | Creator (R1), Refiner (R2+) |

### 6.3 Post-Convergence Artifacts

| Artifact | Name | Created By |
|----------|------|-----------|
| Debate summary | `debate-summary.md` | Orchestrator |

### 6.4 Artifact Location

All artifacts live in:
```
docs/requirements/{artifact_folder}/
```

Where `{artifact_folder}` is read from `active_workflow.artifact_folder` (e.g., `REQ-0014-multi-agent-requirements-team`).

---

## 7. Gate-Blocker Compatibility Interface

### 7.1 Existing Gate Requirements (01-requirements Phase)

From `iteration-requirements.json`:
```json
{
  "interactive_elicitation": {
    "enabled": true,
    "min_menu_interactions": 3,
    "required_final_selection": ["save", "continue"]
  },
  "constitutional_validation": {
    "enabled": true,
    "max_iterations": 5
  },
  "artifact_validation": {
    "enabled": true,
    "paths": ["docs/requirements/{artifact_folder}/requirements-spec.md"]
  }
}
```

### 7.2 Debate Mode Compatibility

The gate-blocker validates Phase 01 at completion time (after the entire debate loop). The Creator's interactions during Round 1 satisfy the interactive_elicitation requirement:

| Gate Requirement | How Satisfied in Debate Mode |
|-----------------|------------------------------|
| `min_menu_interactions: 3` | Creator (Round 1) presents A/R/C menus to the user. The 3+ interactions happen during Creator's requirements capture. |
| `required_final_selection: ["save", "continue"]` | The orchestrator signals "save" after the debate loop completes. |
| `artifact_validation: requirements-spec.md` | The final requirements-spec.md exists after the debate loop (written by Creator or Refiner). |
| `constitutional_validation` | Runs after the debate loop, on the final artifacts. |

### 7.3 No Changes Required to iteration-requirements.json

The existing Phase 01 configuration works unchanged because:
1. The Creator still performs menu interactions (A/R/C pattern) during initial capture
2. The orchestrator signals "save" completion after the debate loop
3. The final artifacts exist at the expected paths
4. Constitutional validation runs on final artifacts

If this assumption proves incorrect during implementation (e.g., Critic/Refiner delegations reset the elicitation counter), a `debate_mode_override` field can be added to iteration-requirements.json as a fallback (ADR-0004).

---

## 8. Interface Versioning

### 8.1 DEBATE_CONTEXT Version

The DEBATE_CONTEXT block is **v1.0** (initial version). Version is implicit in the format.

**Forward compatibility:** Additional fields can be added without breaking existing agents (agents ignore unknown fields).

### 8.2 State Schema Version

The `debate_mode` and `debate_state` fields follow the existing ad-hoc extension pattern in state.json. No formal versioning is applied (consistent with existing practice).

**Forward compatibility:** If fields are absent, consumers treat the workflow as non-debate. This ensures state.json files from before this feature work unchanged.

### 8.3 Critique Report Version

The critique report format is **v1.0**. The Summary table structure (`| BLOCKING | {Y} |`) is the parsing contract. The orchestrator relies only on this table for convergence decisions.

---

## 9. Requirement Traceability

| Interface | Requirement | Acceptance Criteria |
|-----------|-------------|-------------------|
| DEBATE_CONTEXT block | FR-001, FR-004, FR-008 | AC-001-01, AC-004-01, AC-008-01 |
| Critique report format | FR-002 | AC-002-01 through AC-002-05 |
| Refiner change log | FR-003 | AC-003-01 through AC-003-04 |
| debate_mode state field | FR-005, FR-008 | AC-005-01, AC-008-02 |
| debate_state state field | FR-004, FR-008 | AC-004-02, AC-008-03 |
| Flag interface | FR-005 | AC-005-01, AC-005-02, AC-005-03 |
| round-N-critique.md naming | FR-006 | AC-006-01 |
| debate-summary.md format | FR-006 | AC-006-02, AC-006-03 |
| Gate-blocker compatibility | FR-004 | AC-004-04 |
