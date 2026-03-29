# Requirements Specification: REQ-GH-116 — Protocol Delivery and Compliance

**Source**: GitHub Issue #116
**Status**: Analyzed

---

## Functional Requirements

- **FR-001: Protocol-Phase Mapping Config** — A JSON config file mapping CLAUDE.md protocol section headers to the phases/agents that need them
  - **Assumption**: CLAUDE.md section headers (`### Protocol Name`) are stable identifiers that can be used as keys
  - AC-001-01: Given a mapping entry with `"phases": ["all"]`, then that protocol is forwarded to every subagent
  - AC-001-02: Given a mapping entry with `"phases": ["06-implementation"]`, then that protocol is only forwarded to Phase 06

- **FR-002: Subagent Protocol Injection** — The Phase-Loop Controller (STEP 3d) reads CLAUDE.md, extracts sections mapped to the current phase using the mapping config, and includes them in the subagent delegation prompt
  - **Assumption**: Subagent prompts have room for ~400-800 tokens of protocol content
  - AC-002-01: Given a phase agent is delegated to, then the delegation prompt includes all CLAUDE.md protocol sections mapped to that phase
  - AC-002-02: Given CLAUDE.md is missing or unreadable, then delegation proceeds without protocol injection (fail-open)

- **FR-003: User Instruction Forwarding** — User-written content in CLAUDE.md (sections outside framework-managed `<!-- SECTION: -->` blocks and outside the mapped protocol sections) is extracted and forwarded to subagents
  - **Assumption**: User sections identified by exclusion — not in `<!-- SECTION: -->` markers and not in the protocol mapping
  - AC-003-01: Given a user adds custom instructions to CLAUDE.md, then subagents receive them

- **FR-004: Dual-Provider Support** — For Claude, reads CLAUDE.md. For Codex, reads AGENTS.md. Same mapping config, different source file
  - **Assumption**: AGENTS.md follows the same section header convention
  - AC-004-01: Given Claude provider, protocols extracted from CLAUDE.md
  - AC-004-02: Given Codex provider, protocols extracted from AGENTS.md

- **FR-005: Selective Loading** — Only phase-relevant sections injected, not entire CLAUDE.md
  - AC-005-01: Given 3 of 9 protocols mapped to Phase 06, only those 3 injected (~300 tokens)

- **FR-006: Protocol Compliance Detection** — After a subagent returns, the Phase-Loop Controller checks whether the injected protocols were followed. Detection is based on observable signals (e.g., git commits during phase work, direct state.json writes).
  - **Assumption**: Not all protocols are machine-checkable. Only protocols with observable signals are enforced.
  - AC-006-01: Given a subagent ran `git commit` during a non-final phase and the Git Commit Prohibition was injected, then a violation is detected
  - AC-006-02: Given a protocol violation is detected, then it is logged to the audit trail

- **FR-007: Violation Response** — When a protocol violation is detected, the Phase-Loop Controller blocks advancement and re-delegates to the same agent with a remediation prompt (same pattern as 3f-gate-blocker).
  - **Assumption**: Reuses the existing 3f-retry-protocol with max 2 retries before escalating to user
  - AC-007-01: Given a protocol violation is detected, then the phase is re-delegated with a prompt identifying the violation and requiring remediation
  - AC-007-02: Given 2 remediation retries fail, then the violation is escalated to the user with Skip/Retry/Cancel options

---

## Non-Functional Requirements

- **NFR-001: Fail-Open** — Protocol loading failure → agent proceeds without injected protocols (Article X)
- **NFR-002: Token Budget** — Per-subagent protocol injection <=800 tokens
- **NFR-003: No Behavioral Change** — Extraction is verbatim, no rewording

---

## Out of Scope

| Item | Reason |
|------|--------|
| Moving protocols to separate files | Unnecessary — protocols stay in CLAUDE.md |
| Session cache changes | Main agent already gets CLAUDE.md natively (Claude Code) or via INSTRUCTIONS section (Codex) |
| New enforcement hooks | Compliance detection uses existing git log and audit data |
| Protocol versioning | Stable content |
| Selective user instruction forwarding | Full user sections forwarded, no filtering |

---

## Prioritization

| FR | Priority | Rationale |
|----|----------|-----------|
| FR-001 | Must Have | Foundation — mapping config |
| FR-002 | Must Have | Core gap — subagents are protocol-blind |
| FR-003 | Must Have | User instructions must reach subagents |
| FR-004 | Must Have | Dual-provider constraint |
| FR-005 | Must Have | Token efficiency |
| FR-006 | Must Have | Detection — know when protocols are violated |
| FR-007 | Must Have | Response — block and retry on violation |
