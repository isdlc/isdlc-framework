# Requirements Summary: User-Space Hooks

**Accepted**: 2026-03-10

---

## Problem

The iSDLC framework has no user-extensible hook mechanism. Teams with domain-specific needs (XML validation, SAST scanning, Slack notifications) cannot plug into the workflow lifecycle without modifying framework source.

## Stakeholders

- **Framework Developer** -- extend the workflow with domain-specific tooling
- **Team Lead / DevOps** -- enforce team-level quality gates and notifications

## Functional Requirements (14 FRs)

| ID | Title | Priority |
|----|-------|----------|
| FR-001 | Hook Discovery (scan `.isdlc/hooks/` subdirectories, match triggers) | Must |
| FR-002 | Hook Execution (child process, stdout/stderr capture) | Must |
| FR-003 | Exit Code Protocol (0=pass, 1=warn, 2=block) | Must |
| FR-004 | Hook Points (general `pre-/post-{phase}` pattern via checklist) | Must |
| FR-005 | Phase Name Resolution (friendly aliases in `hook.yaml` triggers) | Must |
| FR-006 | Agent Retry Before User Escalation (3 retries/hook, then escalate) | Must |
| FR-007 | Per-Hook Timeout Configuration | Should |
| FR-008 | Context Passing (env vars: `ISDLC_PHASE`, `ISDLC_SLUG`, etc.) | Should |
| FR-009 | Hook Authoring Guide (brief reference, links to Claude Code docs) | Should |
| FR-010 | Update Safety (preserve user hooks, refresh template) | Must |
| FR-011 | Hook Execution Logging (per-hook `logs/` directory) | Could |
| FR-012 | Hook Configuration Schema (`hook.yaml` with triggers checklist) | Must |
| FR-013 | Hook Template Delivery (shipped with install/update) | Must |
| FR-014 | Runtime Misconfiguration Detection (warn at session start) | Must |

## Key Decisions

- Hook blocks are governance/quality signals: agent retries fixes (3x per hook) before escalating to user
- `hook.yaml` includes severity field (minor/major/critical) guiding agent fix scope
- Hooks don't fire unless explicitly configured via triggers checklist
- Brief authoring guide links to Claude Code docs for detailed concepts

## Assumptions

- Severity granularity (minor/major/critical) is sufficient -- Medium confidence
- Claude Code's built-in retry is sufficient without custom infrastructure -- High confidence (user confirmed)
