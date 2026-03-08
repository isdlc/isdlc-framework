# Architecture Summary: REQ-0049 — Gate Profiles

**Accepted**: 2026-03-08

## Key Decision

Profiles implemented as a new merge layer in the existing requirement chain:

```
base phase_requirements -> profile overlay -> workflow_overrides -> resolved requirements
```

Reuses existing `mergeRequirements()` function. No changes to downstream hooks.

## Architecture Decisions

- **ADR-001**: File-based discovery over manifest registration -- lowest friction for simple config files
- **ADR-002**: Profile schema as subset of `phase_requirements` -- prevents invalid merges
- **ADR-003**: Three-tier resolution (personal > project > built-in) -- developer autonomy

## Integration Points

- `common.cjs`: Calls `profile-loader.cjs` during `loadIterationRequirements()`
- `gate-logic.cjs`: Profile merge before workflow override merge
- `isdlc.md`: Profile trigger parsing alongside workflow type detection
- `00-sdlc-orchestrator.md`: Profile confirmation dialogue
- `validate-gate.cjs` (Antigravity): Receives profile-merged results transparently

## Risk Assessment

- 12+ downstream hooks require zero changes
- `standard` profile is identity merge -- zero regression guaranteed
- Antigravity path needs verification during implementation

## Assumptions

- `validate-gate.cjs` calls the same `loadIterationRequirements()` from common.cjs
