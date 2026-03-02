# Security Architecture: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 03-architecture
**Created:** 2026-02-14
**Status:** Accepted

---

## Context

This is a **prompt-engineering feature**. The security surface is limited to agent prompt content, orchestrator delegation logic, and state management. There is no network communication, no user authentication, no database, and no API endpoints. Security considerations are scoped accordingly per Article V (Simplicity First).

---

## 1. Agent Delegation Security

### Threat: Prompt Injection via Debate Artifacts

**Risk:** A malicious or corrupted critique report (`round-N-critique.md`) could contain prompt injection content that influences the Refiner agent's behavior in unintended ways.

**Mitigation:**
- The Refiner agent's instructions explicitly define its scope: "NEVER introduce new scope -- only address findings from the Critic's report" (Rule 2)
- The Refiner operates on the content of artifacts, not arbitrary user input
- The orchestrator does not execute arbitrary content from critique reports -- it only parses the BLOCKING count from the structured Summary section
- All three debate agents (Creator, Critic, Refiner) are invoked by the orchestrator, not by external users

**Residual Risk:** Low. The Critic and Refiner are prompt-driven agents operating on framework-generated content within a controlled delegation chain.

### Threat: Unauthorized Agent Invocation

**Risk:** A user or agent could invoke `02-architecture-critic.md` or `02-architecture-refiner.md` directly, outside the debate loop.

**Mitigation:**
- Both agent descriptions include: "This agent is ONLY invoked by the orchestrator during debate mode. It should NOT be invoked directly by users."
- This is an advisory control (prompt-level), not enforced by runtime hooks. This is consistent with all other agents in the framework.
- Direct invocation would produce a critique report or refined artifacts but would not affect the debate state in state.json (no state corruption risk).

**Residual Risk:** Low. Direct invocation is harmless -- it produces output but does not alter workflow state.

---

## 2. State Management Security

### Threat: State Corruption via Debate State

**Risk:** The debate loop writes `debate_state` to `state.json`. Malformed writes could corrupt the workflow state.

**Mitigation:**
- `debate_state` is a well-defined JSON structure with known fields (round, max_rounds, converged, blocking_findings, rounds_history, phase)
- The orchestrator writes state using the same pattern as all other state updates (history entry + field update)
- The `state-write-validator` hook (REQ-0004) validates state.json writes
- `debate_state` is scoped under `active_workflow` -- corruption is isolated to the current workflow

**Residual Risk:** Low. State writes follow established patterns validated by existing hooks.

### Threat: Debate State Leaking Between Phases

**Risk:** Phase 01 debate state could leak into Phase 03 debate execution or vice versa.

**Mitigation:**
- The debate loop initializes `debate_state` fresh at the start of each phase's debate (Step 3 in pseudocode)
- The `debate_state.phase` field explicitly records which phase the debate is for
- Each phase's debate is sequential -- Phase 03 runs only after Phase 01 completes

**Residual Risk:** None. Sequential execution and fresh initialization prevent cross-phase contamination.

---

## 3. Constitutional Compliance (Article III, Article X)

### Article III: Security by Design

The architecture critic (AC-02) explicitly checks for STRIDE threat model completeness. This ensures that any architecture produced through the debate loop has been reviewed for security threats before downstream phases consume it.

### Article X: Fail-Safe Defaults

Three fail-safe defaults are designed into the architecture:

| Scenario | Fail-Safe Behavior | Reference |
|----------|-------------------|-----------|
| Critic produces malformed critique | Treat as 0 BLOCKING (converge immediately) | AC-007-02, Article X |
| Both --debate and --no-debate flags | --no-debate wins (conservative) | ADR-0003 (REQ-0014) |
| Phase not in DEBATE_ROUTING | No debate, single-agent delegation | ADR-0001 |
| Critical artifact missing after Creator | Abort debate, fall back to single-agent | AC-007-01 |

---

## 4. Data Protection

### Sensitive Data Handling

- Debate artifacts (critique reports, debate summaries) are stored in the project's `docs/` directory alongside other workflow artifacts
- No secrets, credentials, or PII are involved in the debate loop
- State.json contains debate metadata (round counts, convergence status) -- no sensitive content
- All artifacts are version-controlled with the project (no additional encryption needed)

---

## 5. Summary

| Security Area | Assessment | Controls |
|--------------|-----------|----------|
| Prompt injection | Low risk | Scoped agent instructions, structured parsing |
| Unauthorized access | Low risk | Advisory prompt-level controls |
| State corruption | Low risk | Existing state-write-validator hook |
| Cross-phase contamination | No risk | Sequential execution, fresh initialization |
| Fail-safe defaults | Compliant | 4 explicit fail-safe behaviors |
| STRIDE review | Built-in | Critic AC-02 checks threat model completeness |
| Data protection | N/A | No sensitive data involved |
