# Security Architecture: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 03-architecture
**Created:** 2026-02-15
**Status:** Accepted

---

## Context

This feature adds two new markdown agent files and modifies three existing files. The security implications are minimal because:

1. **No new runtime code** -- all changes are to prompt instructions (markdown)
2. **No new network endpoints** -- agents are invoked via Claude Code's Task tool, not HTTP
3. **No new data storage** -- state.json debate_state already exists
4. **No new credentials** -- no authentication or secrets involved
5. **No new user input handling** -- agents receive context from the orchestrator, not directly from users

---

## Threat Model (Article III)

### Applicable Threats

| Threat | Category | Likelihood | Impact | Mitigation |
|--------|----------|-----------|--------|------------|
| Prompt injection via feature description | Tampering | LOW | MEDIUM | The orchestrator sanitizes feature descriptions before passing to agents. Design Critic receives artifacts, not raw user input. Same mitigation as REQ-0014/REQ-0015. |
| Agent file tampering on disk | Tampering | LOW | HIGH | Agent files are version-controlled in git. Any modification is visible in `git diff`. Constitution Article VI requires code review. |
| State.json corruption during debate | Information Disclosure / Denial of Service | LOW | LOW | debate_state writes are additive. Fail-open per Article X: if state.json is corrupted, debate falls back to single-agent mode. |
| Design Critic producing false findings to stall progress | Denial of Service | LOW | LOW | Max 3 debate rounds (convergence limit). Malformed critique = 0 BLOCKING (fail-open, AC-007-02). |

### Non-Applicable Threats

| Threat | Reason Not Applicable |
|--------|----------------------|
| SQL Injection | No database |
| XSS / CSRF | No web UI |
| Authentication bypass | No authentication layer -- agents are local prompt files |
| Privilege escalation | No privilege model -- all agents run in same Claude Code context |
| Data exfiltration | No network calls from agents |

---

## Constitutional Compliance (Article III: Security by Design)

### Design Critic's Security Role (FR-006)

The Design Critic validates that the **target project's design** follows security best practices, not that the debate infrastructure itself is secure. The Critic's security-related checks include:

| Check | Security Aspect |
|-------|-----------------|
| DC-01: Incomplete API Specs | Missing error responses can leak internal details |
| DC-04: Validation Gaps | Insufficient input validation is a common attack vector |
| DC-05: Missing Idempotency | Replay attacks on non-idempotent state changes |
| DC-07: Error Taxonomy Holes | Inconsistent error codes can leak implementation details |

### Constitutional Articles Enforced by Design Critic

| Article | Enforcement |
|---------|-------------|
| Article I (Specification Primacy) | Designs must trace to requirements -- prevents undocumented endpoints that could be attack surface |
| Article IV (Explicit Over Implicit) | No hidden assumptions -- prevents security gaps from unstated trust boundaries |
| Article V (Simplicity First) | Over-engineering creates larger attack surface |
| Article VII (Artifact Traceability) | Orphan designs with no requirement backing are flagged |
| Article IX (Quality Gate Integrity) | Incomplete design artifacts are BLOCKING -- prevents skipping security review |

---

## Access Control

No changes to access control. All agents operate within the same Claude Code process with the same filesystem permissions. The Design Critic and Refiner follow the same security boundaries as all other agents:

- Read access to: project files, state.json, artifacts
- Write access to: artifact folder, state.json
- No access to: credentials, external services, network

---

## Data Protection

No sensitive data is processed by the debate agents. Design artifacts may contain:
- API endpoint definitions (not secrets)
- Validation rules (not user data)
- Error codes (not stack traces)
- Module boundaries (not implementation code)

All artifacts are stored in the project's `docs/requirements/` folder, which is version-controlled.

---

## Summary

Security impact of this feature: **NEGLIGIBLE**. This is a prompt-engineering change to markdown files, operating entirely within the local filesystem. The primary security value is that the Design Critic **improves** the security posture of target projects by catching validation gaps, incomplete error handling, and missing idempotency in design specifications.
