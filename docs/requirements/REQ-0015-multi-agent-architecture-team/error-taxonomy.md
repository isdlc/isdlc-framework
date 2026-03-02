# Error Taxonomy: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 04-design
**Created:** 2026-02-14
**Traces:** FR-007 (AC-007-01..AC-007-03), NFR-003, NFR-004

---

## Overview

This document defines all error conditions, edge cases, and failure modes for
the multi-agent architecture team feature. Since this is a prompt-engineering
project (no HTTP APIs or runtime code), "errors" are conditions detected by
the orchestrator during debate loop execution that require specific handling.

Error handling follows Article X (Fail-Safe Defaults): when in doubt, the
system degrades gracefully rather than failing catastrophically.

---

## Error Categories

### Category 1: Debate Resolution Errors (DRE)

Errors that occur during debate mode resolution (Step 1 of the debate loop).

| Error Code | Condition | Handling | Severity | Traces |
|-----------|-----------|---------|----------|--------|
| DRE-001 | Both `--debate` and `--no-debate` flags present | `--no-debate` wins (conservative override per Article X) | INFO | AC-003-01 |
| DRE-002 | Phase not in DEBATE_ROUTING | Delegate to phase's standard agent (no DEBATE_CONTEXT, no debate). Not an error -- expected for non-debate phases. | INFO | FR-005 |
| DRE-003 | `-light` flag with `--debate` flag | `-light` implies `--no-debate`, but explicit `--debate` takes precedence over implicit `--no-debate` from `-light` | INFO | AC-003-01 |

### Category 2: Creator Errors (CRE)

Errors that occur during Creator delegation (Step 3).

| Error Code | Condition | Handling | Severity | Traces |
|-----------|-----------|---------|----------|--------|
| CRE-001 | Creator fails to produce critical artifact (architecture-overview.md for Phase 03) | Abort debate loop. Fall back to single-agent mode (re-delegate WITHOUT DEBATE_CONTEXT). Log error in state.json. | ERROR | AC-007-01 |
| CRE-002 | Creator produces partial artifacts (some missing, but critical artifact exists) | Attempt debate with available artifacts. Critic reviews what exists; findings about missing artifacts are natural BLOCKING results. | WARNING | AC-007-01 |
| CRE-003 | Creator produces artifacts but without Self-Assessment section (debate mode) | Not an error -- Critic can still review. The self-assessment is "should" behavior, not "must" for the orchestrator. | INFO | AC-004-01 |

### Category 3: Critic Errors (CKE)

Errors that occur during Critic review (Step 4a).

| Error Code | Condition | Handling | Severity | Traces |
|-----------|-----------|---------|----------|--------|
| CKE-001 | Critic produces malformed critique (BLOCKING count cannot be parsed from Summary table) | Treat as 0 BLOCKING (fail-open per Article X). Log warning in state.json. Debate converges immediately. | WARNING | AC-007-02 |
| CKE-002 | Critic fails to produce round-N-critique.md | Treat as 0 BLOCKING (fail-open). Log warning. Same handling as CKE-001. | WARNING | AC-007-02 |
| CKE-003 | Critic produces critique with negative BLOCKING count | Treat as 0 BLOCKING. Log warning. | WARNING | -- |
| CKE-004 | Critic produces critique with BLOCKING findings listed but Summary shows 0 BLOCKING | Trust the Summary table count (it is the machine-readable interface). The detailed findings serve as documentation. | INFO | -- |

### Category 4: Refiner Errors (RFE)

Errors that occur during Refiner improvement (Step 4c).

| Error Code | Condition | Handling | Severity | Traces |
|-----------|-----------|---------|----------|--------|
| RFE-001 | Refiner does not address all BLOCKING findings | Not an error at the orchestrator level. The next Critic round will re-flag unaddressed findings. Eventually hits max-rounds limit. | INFO | -- |
| RFE-002 | Refiner removes existing architectural decisions (violates AC-002-07) | Cannot be detected by the orchestrator at prompt level. Enforcement is in the Refiner agent's rules. Test coverage verifies the rule exists. | N/A | AC-002-07 |
| RFE-003 | Refiner introduces new scope (violates rule 2) | Cannot be detected by orchestrator. Critic should flag scope creep in next round. | N/A | -- |
| RFE-004 | Refiner fails to produce updated artifacts | Next Critic round reviews the old (unchanged) artifacts. Findings will persist. | WARNING | -- |

### Category 5: Convergence Errors (CVE)

Errors related to the convergence check (Step 4b).

| Error Code | Condition | Handling | Severity | Traces |
|-----------|-----------|---------|----------|--------|
| CVE-001 | Debate does not converge after max rounds (3) | Append warning to routing.critical_artifact (architecture-overview.md for Phase 03). Generate debate-summary.md with unconverged status. Preserve best-effort artifacts. | WARNING | AC-007-03 |
| CVE-002 | Convergence on Round 1 (Critic finds 0 BLOCKING immediately) | Refiner is NOT invoked. debate-summary.md notes "Converged on first review." Valid outcome. | INFO | -- |

### Category 6: State Errors (STE)

Errors related to state.json management.

| Error Code | Condition | Handling | Severity | Traces |
|-----------|-----------|---------|----------|--------|
| STE-001 | state.json does not exist when debate starts | Orchestrator should create state.json (standard orchestrator behavior). Not debate-specific. | ERROR | -- |
| STE-002 | debate_state already exists in state.json (re-entry) | Overwrite with new debate_state. Previous debate state is lost. | INFO | -- |
| STE-003 | debate_state.phase field missing (Phase 01 legacy state) | Tolerate missing field. Phase 01 debate state without `phase` field is valid (backward compatibility). | INFO | NFR-003 |

---

## Error Response Patterns

Since this is a prompt-engineering project, "error responses" are the specific
actions the orchestrator takes when an error is detected. There are no HTTP
status codes or API error payloads.

### Pattern 1: Fail-Open (Article X)

Used for: CKE-001, CKE-002, CKE-003

```
Orchestrator detects: Cannot parse BLOCKING count from critique
Action: Treat as BLOCKING = 0 (converge)
State update: rounds_history[last].action = "converge-failopen"
Log: "Warning: Critic critique malformed or missing. Treating as converged (fail-open per Article X)."
Result: debate-summary.md generated; no unconverged warning appended
```

### Pattern 2: Abort and Fallback

Used for: CRE-001

```
Orchestrator detects: routing.critical_artifact not found after Creator delegation
Action: Abort debate loop; re-delegate to Creator WITHOUT DEBATE_CONTEXT
State update: debate_state = null; debate_mode remains true but debate not executed
Log: "Error: Critical artifact {name} not produced. Falling back to single-agent mode."
Result: Phase proceeds as if debate mode were off
```

### Pattern 3: Unconverged Continuation

Used for: CVE-001

```
Orchestrator detects: round >= max_rounds AND BLOCKING > 0
Action: Append warning to routing.critical_artifact; generate debate-summary.md
State update: debate_state.converged = false; rounds_history[last].action = "max-rounds-reached"
Log: "Warning: Debate did not converge after {max_rounds} rounds. {N} BLOCKING finding(s) remain."
Result: Phase proceeds with best-effort artifacts; warning visible in architecture-overview.md
```

### Pattern 4: Tolerate and Continue

Used for: CRE-002, CRE-003, RFE-001, RFE-004, CVE-002, STE-002, STE-003

```
Orchestrator detects: Non-critical anomaly
Action: Continue debate loop normally
State update: No special update (normal flow)
Log: Optional info/warning in state.json history
Result: Debate proceeds; anomaly may surface as Critic finding in next round
```

---

## Severity Definitions

| Severity | Definition | Orchestrator Action |
|----------|-----------|-------------------|
| ERROR | Debate loop cannot proceed as designed | Abort debate, fall back to single-agent, log error |
| WARNING | Debate loop can proceed but quality may be degraded | Log warning, continue with degraded behavior |
| INFO | Expected condition, handled by design | No special action needed |
| N/A | Cannot be detected at orchestrator level | Handled by agent rules or test coverage |

---

## Relationship to Critique Finding Severities

The error taxonomy above describes orchestrator-level errors (infrastructure
errors in the debate loop itself). These are distinct from critique finding
severities (domain-level defects in architecture artifacts):

| Concern | Severity System | Owner | Example |
|---------|----------------|-------|---------|
| Debate loop infrastructure | ERROR/WARNING/INFO | Orchestrator | "Critic produced malformed critique" |
| Architecture artifact quality | BLOCKING/WARNING | Critic | "STRIDE threat model incomplete" |

These two severity systems do not overlap. A BLOCKING critique finding is a
domain defect that the Refiner must fix. An ERROR in the error taxonomy is an
infrastructure problem in the debate loop itself.
