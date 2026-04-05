# Error Taxonomy: REQ-GH-216

## ATDD-Specific Error Codes

| Code | Description | Trigger | Severity | Recovery |
|------|-------------|---------|----------|----------|
| ATDD-001 | Config read failed | `.isdlc/config.json` missing, unreadable, or invalid JSON | warning | Fail-open: return all-true defaults. Log warning to stderr. Article X. |
| ATDD-002 | Config field type mismatch | `atdd.enabled` or other field is not a boolean | warning | Use default for invalid field; preserve other fields. Log warning. |
| ATDD-003 | Non-GWT AC detected (require_gwt: true) | Phase 05 encounters an AC without Given/When/Then structure in requirements-spec.md | error | BLOCK Phase 05. Emit actionable error identifying non-GWT AC. User must fix AC or set `require_gwt: false`. |
| ATDD-004 | Non-GWT AC detected (require_gwt: false) | Same as ATDD-003 but require_gwt is false | info | Generate best-effort scaffold. Flag AC as `non_gwt: true` in atdd-checklist.json. |
| ATDD-005 | Out-of-order test completion | Phase 06 observes a P1 test pass while a P0 test still fails (enforce_priority_order: true) | error | BLOCK Phase 06 advancement via checkpoint-router. User must complete P0 first or set `enforce_priority_order: false`. |
| ATDD-006 | atdd-checklist.json write failed | Filesystem error creating/updating the checklist | warning | Log error to stderr. Continue phase work. Phase 08 review will flag missing checklist. |
| ATDD-007 | ATDD_CONFIG injection block missing from agent prompt | phase-loop controller injection failed | info | Agent operates with all-true defaults. Log warning. |

## Graceful Degradation Levels

### Level 0: Full ATDD (all defaults)

- All 4 knobs true.
- All ATDD behaviors active: scaffolds generated, GWT enforced, transitions tracked, priority order enforced.

### Level 1: Relaxed strictness (user opt-out of one or more sub-knobs)

- `atdd.enabled: true` + one or more sub-knobs flipped to false.
- Corresponding behaviors skipped; others continue.
- Checklist still created; other scaffolds still generated.

### Level 2: Kill switch active

- `atdd.enabled: false`.
- No ATDD scaffolds generated.
- No atdd-checklist.json created.
- Phase 06 does not enforce priority order or track transitions.
- discover sub-phase 1d skipped.

### Level 3: Config read failure

- ConfigService cannot read `.isdlc/config.json`.
- Return all-true defaults (equivalent to Level 0).
- Warning logged.

### Level 4: Injection failure

- Phase-loop controller fails to inject ATDD_CONFIG block.
- Agent operates with all-true defaults (equivalent to Level 0 from the agent's perspective).
- Hooks still gate on actual config values.

## Error Propagation Strategy

- **Config read errors**: Caught at ConfigService boundary; never propagate to callers.
- **Hook errors**: Caught at hook entry; fail-open per Article X (hook exits 0 with no output, does not block workflow).
- **Phase 05 non-GWT errors**: Propagate as a blocking hook error (atdd-completeness-validator exits nonzero with blocking message).
- **Phase 06 out-of-order errors**: Propagate as a blocking checkpoint-router decision.

## User-Facing Error Messages

### ATDD-003: Non-GWT AC detected (blocking)

```
ATDD-003: Acceptance criterion lacks Given/When/Then structure.

File: docs/requirements/{slug}/requirements-spec.md
AC: AC-001-02: "User should be able to log in"

Action required:
  - Rewrite the AC in Given/When/Then format:
    AC-001-02: Given a registered user, When they submit valid credentials,
               Then they are authenticated and redirected to the dashboard
  - OR set "atdd.require_gwt": false in .isdlc/config.json (accepts best-effort scaffolds)
```

### ATDD-005: Out-of-order test completion (blocking)

```
ATDD-005: Test priority order violated.

Expected: P0 tests complete before P1.
Observed:
  P0 test "login-with-valid-credentials" : FAILING
  P1 test "remember-me-checkbox"         : PASSING

Action required:
  - Complete P0 tests before advancing to P1
  - OR set "atdd.enforce_priority_order": false in .isdlc/config.json (accepts any order)
```

### ATDD-001: Config read failed (warning)

```
ATDD-001 (warning): Could not read .isdlc/config.json. Using default ATDD config.
  Defaults: { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }
```
