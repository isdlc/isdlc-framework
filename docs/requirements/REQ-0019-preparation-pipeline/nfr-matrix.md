# Non-Functional Requirements Matrix: REQ-0019 Preparation Pipeline

**Created:** 2026-02-16
**Status:** Approved

---

## Matrix

| NFR ID | Category | Requirement | Metric | Target | ACs | Priority |
|--------|----------|-------------|--------|--------|-----|----------|
| NFR-001 | Reliability | Phase B never silently consumes stale or incomplete Phase A artifacts | Silent failure count | 0 | AC-NFR-001-01 through AC-NFR-001-07 (7 ACs) | P0 -- PRIMARY |
| NFR-002 | Isolation | Phase A makes zero reads/writes to state.json, hooks, gates, branches | Resource contention events | 0 | AC-NFR-002-01, AC-NFR-002-02, AC-NFR-002-03 | P0 |
| NFR-003 | Idempotency | Re-running Phase A intake for the same item does not corrupt or duplicate data | Data corruption events | 0 | AC-NFR-003-01, AC-NFR-003-02 | P1 |
| NFR-004 | Graceful Degradation | System falls back to manual input when external sources are unavailable | Unhandled source errors | 0 | AC-NFR-004-01, AC-NFR-004-02 | P1 |

---

## Detailed Breakdown

### NFR-001: Reliability (PRIMARY)

**Category:** Reliability
**Priority:** P0 -- This is the primary quality attribute for the entire feature.

Phase B must never silently consume stale or incomplete Phase A artifacts. Every failure mode must produce a clear, actionable error message.

| AC ID | Failure Mode | Expected Behavior |
|-------|-------------|-------------------|
| AC-NFR-001-01 | meta.json missing | Fail with path + "Run Phase A first" |
| AC-NFR-001-02 | meta.json malformed JSON | Fail with path + "Re-run Phase A" |
| AC-NFR-001-03 | phase_a_completed field absent | Treat as false, block |
| AC-NFR-001-04 | codebase_hash null or empty | Treat as stale, warn |
| AC-NFR-001-05 | requirements.md missing despite meta.json complete | Fail with path + "Re-run deep analysis" |
| AC-NFR-001-06 | Phase A interrupted mid-execution | phase_a_completed stays false (set last) |
| AC-NFR-001-07 | Any validation failure | Error includes file path, problem, remediation |

**Verification:** All 7 failure modes must have corresponding test cases that verify the exact error message and that no workflow is initialized.

---

### NFR-002: Zero Resource Contention

**Category:** Isolation
**Priority:** P0

Phase A and Phase B share zero resources. This is the architectural foundation enabling parallel preparation and execution.

| AC ID | Resource | Constraint |
|-------|----------|-----------|
| AC-NFR-002-01 | state.json | Zero reads, zero writes during Phase A |
| AC-NFR-002-02 | .isdlc/ directory | No reads or writes (except docs/requirements/) |
| AC-NFR-002-03 | Git branches | No create, checkout, or commit operations |

**Verification:** Phase A execution must be tested with an active Phase B workflow in state.json to confirm zero interference.

---

### NFR-003: Idempotent Intake

**Category:** Idempotency
**Priority:** P1

| AC ID | Scenario | Expected Behavior |
|-------|----------|-------------------|
| AC-NFR-003-01 | Re-intake for existing item | Prompt user: update or skip |
| AC-NFR-003-02 | User confirms update | Overwrite draft.md, preserve created_at, set updated_at |

**Verification:** Run intake twice for the same slug, verify no duplicate folders or corrupted meta.json.

---

### NFR-004: Graceful Degradation on Source Unavailability

**Category:** Graceful Degradation
**Priority:** P1

| AC ID | Source | Fallback |
|-------|--------|----------|
| AC-NFR-004-01 | Jira MCP unavailable | Report error, fall back to manual |
| AC-NFR-004-02 | GitHub CLI unavailable | Report error, fall back to manual |

**Verification:** Simulate unavailable sources (no MCP server, unauthenticated gh), verify graceful fallback to manual entry.

---

## Summary

| Metric | Value |
|--------|-------|
| Total NFRs | 4 |
| Total NFR ACs | 10 |
| P0 NFRs | 2 (Reliability, Isolation) |
| P1 NFRs | 2 (Idempotency, Degradation) |
| Primary quality attribute | Reliability (NFR-001) |
