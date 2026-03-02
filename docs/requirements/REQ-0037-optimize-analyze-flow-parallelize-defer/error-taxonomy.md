---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Error Taxonomy: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Error Codes

No new error codes are introduced by this change. All error conditions use existing error handling and messaging. This document catalogs how existing errors map to the new parallel execution model.

| Code | Description | Trigger Condition | Severity | Recovery Action |
|------|-------------|-------------------|----------|-----------------|
| (existing) | "Could not fetch issue #N" | `gh issue view` fails in Group 1 (network, auth, not found) | Error | Fail fast. Display error. Stop. |
| (existing) | "GitHub CLI not available" | `gh` not installed or not authenticated | Error | Fail fast. Display error with reason. Stop. |
| (existing) | "No matching item found" | Non-external-ref input has no backlog match | Warning | Prompt user to add (existing behavior, non-fast-path only) |
| (existing) | "This item already has a folder" | Slug collision during add handler | Warning | Present [U] Update / [R] Rename / [C] Cancel options |
| (existing) | Persona file not found | Read tool fails on persona file path | Error | Fail fast. Cannot proceed without personas. |
| (existing) | Topic file read fails | Individual topic file read error | Warning | Proceed with successfully read topics. Roundtable handles missing topics via fallback. |

## 2. Error Evaluation Timing

In the parallel model, errors from Group 1 are evaluated after all Group 1 calls complete:

```
Group 1 fires (all parallel)
  |
  v
All results return
  |
  v
Check for fatal errors:
  - gh issue view failed? --> Fail fast, stop
  - Persona file missing? --> Fail fast, stop
  |
  v
Check for non-fatal conditions:
  - Grep found no match? --> Set existingMatch = null (proceed to add)
  - Glob returned empty? --> Set folderList = [] (sequence starts at 0001)
  - Topic glob failed? --> Set topicPaths = [] (roundtable uses fallback)
  |
  v
Proceed to Group 2
```

This preserves fail-fast behavior: if any fatal error occurs in Group 1, execution stops before Group 2 begins. Non-fatal conditions are handled gracefully with fallback values.

## 3. Graceful Degradation

| Component Failure | Degraded Behavior | User Impact |
|-------------------|-------------------|-------------|
| Topic pre-read fails | Roundtable falls back to reading topic files itself | ~7s additional delay at roundtable startup |
| Persona pre-read fails | Fatal: cannot proceed | Analyze stops with error |
| Codebase scan fails (roundtable) | Alex has no codebase evidence | Maya continues solo; Alex contributes general observations only |
| BACKLOG.md write fails (add handler) | Item folder exists but backlog entry missing | User can manually add or re-run `/isdlc add` |

## 4. Error Propagation Strategy

- **Fatal errors**: Thrown immediately. Execution halts. User sees error message.
- **Non-fatal errors**: Logged as warnings. Execution continues with fallback values.
- **Add handler errors**: Propagated to analyze handler. Analyze fails fast with add handler's error message.
- **Roundtable errors**: Propagated via Task tool. Analyze handler displays the error.

No changes to the error propagation strategy. The parallel model evaluates errors after group completion rather than inline, but the same errors produce the same messages and the same stop/continue decisions.
