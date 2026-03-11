# Bug-aware analyze flow — inject Phase 02 tracing into analyze when subject is a bug

## Problem

Phase 02-tracing (symptom analyzer T1, execution path tracer T2, root cause identifier T3) is unreachable in the most common user journey. Users with a Jira bug ticket naturally say "analyze this" — which runs the roundtable (Maya/Alex/Jordan) for requirements/architecture/design. The tracing agents never fire. When the user then says "fix it", the analysis is already done, so the fix workflow skips to implementation. The most valuable debugging phase is permanently bypassed.

## Design

Make the analyze flow context-aware — detect when the subject is a bug and automatically run tracing alongside the roundtable:

1. **Bug detection signals**: Jira ticket type is Bug/Defect, keywords in description (error, crash, stack trace, 500, exception, failing), user explicitly says "bug" or "broken" alongside "analyze"
2. **Augmented analyze flow for bugs**: Roundtable runs as normal (Maya captures bug report, Alex assesses blast radius) → then tracing orchestrator (T0) spawns T1/T2/T3 in parallel → `trace-analysis.md` stored alongside roundtable artifacts
3. **Fix workflow artifact detection**: At Phase 01, check if `requirements-spec.md` AND `trace-analysis.md` already exist for this item. If both present, skip Phase 01 + Phase 02, jump to Phase 05 (test strategy)
4. **No intent detection changes**: Signal words remain the same. The difference is that analyze now does tracing too when the subject is a bug

## Context

- **Builds on**: Existing tracing orchestrator (T0) and sub-agents (T1/T2/T3), existing analyze-finalize flow
- **Complexity**: Medium
- **Priority**: Should Have
- **Backlog ref**: #117

**Labels**: enhancement
