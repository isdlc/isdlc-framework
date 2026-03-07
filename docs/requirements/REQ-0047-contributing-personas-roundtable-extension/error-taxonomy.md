---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: specification 90%
Amendment: 2 (hackability review — disabled_personas, skipped-file feedback, per-analysis flags, silent mode suppression)
Source: REQ-0047 / GH-108a
---

# Error Taxonomy: Contributing Personas -- Roundtable Extension

## 1. Error Categories

### E1: Persona File Errors

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E1-001 | Warning | Persona file has no YAML frontmatter | Skip file, log warning, continue loading other personas |
| E1-002 | Warning | Persona file missing `name` field in frontmatter | Skip file, log warning |
| E1-003 | Warning | Persona file has malformed YAML | Skip file, log warning |
| E1-004 | Info | Persona file missing `version` field | Skip drift check for this file, load normally |
| E1-005 | Info | Persona file missing `triggers` array | Persona never auto-proposed, but available for manual add or `default_personas` |
| E1-006 | Info | Persona file missing `role_type` | Default to `contributing` (user) or infer from filename (built-in) |

### E2: Config File Errors

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E2-001 | Info | `.isdlc/roundtable.yaml` does not exist | Use defaults: `verbosity: bulleted`, `default_personas: []` |
| E2-002 | Warning | Config file has malformed YAML | Use defaults, log warning |
| E2-003 | Warning | `verbosity` field has invalid value | Default to `bulleted`, log warning |
| E2-004 | Warning | `default_personas` is not an array | Default to `[]`, log warning |
| E2-005 | Info | Unknown keys in config file | Ignore, no warning (forward-compatible) |
| E2-006 | Warning | `disabled_personas` is not an array | Default to `[]`, log warning |
| E2-007 | Info | Persona appears in both `default_personas` and `disabled_personas` | `disabled_personas` wins; persona excluded from auto-proposal |

### E3: Roster Errors

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E3-001 | Info | User adds persona to roster that has no file | Note gap: "No persona file found for [domain]. Create one in .isdlc/personas/?" |
| E3-002 | Info | `default_personas` references non-existent persona | Skip, log info. Do not fail roster proposal. |
| E3-003 | Info | No trigger matches found for any contributing persona | Propose only the 3 primaries + any `default_personas`; list all others under "Also available" |
| E3-004 | Info | User manually adds a disabled persona during roster confirmation | Allow it -- manual override wins over `disabled_personas` config |
| E3-005 | Info | `--personas` flag references non-existent persona | Note gap: "No persona file found for '[name]'. Create one in .isdlc/personas/?" Proceed with remaining valid personas. |

### E4: Override Errors

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E4-001 | Info | User override detected, no version drift | Load user version silently |
| E4-002 | Info | User override detected, shipped version is newer | Non-blocking notification at roundtable startup |
| E4-003 | Warning | User override has `role_type: primary` but is not one of 3 built-in primaries | Load as contributing, log warning. Primary artifact ownership cannot be changed by user overrides. |
| E4-004 | Info | Drift warning exists but verbosity is `silent` | Log internally, do not display to user (consistent with no-persona-framing contract) |

### E5: Mid-Conversation Errors

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E5-001 | Info | Late-join requested but persona file not found | Note gap to user, continue without |
| E5-002 | Warning | Late-join persona file is malformed | Note failure, continue without |

### E6: Per-Analysis Override Errors

| Code | Severity | Condition | Recovery |
|------|----------|-----------|----------|
| E6-001 | Info | `--verbose` and `--silent` both provided | Last flag wins |
| E6-002 | Info | `--personas` includes non-existent persona | Note gap, proceed with valid ones |
| E6-003 | Info | User requests verbosity change mid-analysis via natural language | Agent adjusts rendering mode; no config modification |

## 2. Error Propagation Strategy

All persona-related errors follow the **fail-open** pattern:
- Errors in individual persona files never prevent the roundtable from starting
- Errors in config file never prevent the roundtable from starting
- The 3 primary personas are always loaded (they are framework-internal, not user-editable via this mechanism)
- Warnings are collected and surfaced to the roundtable lead for optional mention to the user
- No errors write to `state.json`

## 3. Graceful Degradation

| Failure | Degraded State | User Experience |
|---------|---------------|-----------------|
| All user personas malformed | Only built-in personas available; skipped files mentioned in roster proposal | User sees what failed and why |
| Config file missing | Default verbosity (bulleted), no default/disabled personas | Clean defaults, no user impact |
| No trigger matches | Only 3 primaries proposed; all others listed under "Also available" | User discovers available personas and can add manually |
| `.isdlc/personas/` directory missing | Only built-in personas available | No change from current behavior |
| Per-analysis flag references invalid persona | Valid personas loaded; gap noted to user | User can create missing persona file |
| `disabled_personas` conflicts with `default_personas` | Disabled wins; persona excluded from auto-proposal | Deterministic, documented precedence |
