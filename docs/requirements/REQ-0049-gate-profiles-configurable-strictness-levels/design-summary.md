# Design Summary: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 90%
**Accepted**: 2026-03-08

---

## Overview

Gate profiles add a configurable strictness layer to iSDLC's gate system. Developers define named profiles as JSON files that adjust gate thresholds (coverage, iterations, validation toggles). Profiles merge into the existing requirement chain between base `phase_requirements` and `workflow_overrides`, preserving full backward compatibility.

## Key Design Decisions

1. **Overlay merge, not replacement**: Profiles override specific fields, not entire requirement sets. This reuses `mergeRequirements()` and avoids duplication across profiles.

2. **File-based discovery**: Drop a JSON file in `.isdlc/profiles/` (project) or `~/.isdlc/profiles/` (personal) -- no registration command needed. Same pattern as external skills.

3. **Three-tier resolution**: Personal > project > built-in. Developer autonomy always wins.

4. **Warn, don't enforce**: Below-minimum thresholds get a warning. Hard enforcement is opt-in via `enforce_minimum: true` in project config.

5. **Self-healing validation**: Invalid profile files get schema-checked with typo detection and suggested fixes, offered to the developer conversationally.

## Module Structure

| Module | File | Responsibility |
|--------|------|----------------|
| ProfileLoader | `src/claude/hooks/lib/profile-loader.cjs` | Discover, load, validate, resolve, heal profiles |
| ProfileSchema | `src/claude/hooks/config/profile-schema.json` | JSON schema for profile validation |
| Built-in Profiles | `src/claude/hooks/config/profiles/*.json` | rapid, standard, strict defaults |
| Gate Logic (mod) | `src/claude/hooks/lib/gate-logic.cjs` | Profile merge layer in `check()` |
| Common (mod) | `src/claude/hooks/lib/common.cjs` | Wire profile loading into `loadIterationRequirements()` |

## Key Data Structures

- `ProfileDefinition`: name, description, triggers, per-phase overrides, global_overrides
- `ProfileResolutionResult`: resolved profile + source tier + warnings + self-healing status
- `ProfileRegistry`: deduplicated map of all available profiles with source tracking

## Interface Contracts

- `loadAllProfiles(projectRoot?)` -- glob, parse, validate, deduplicate
- `resolveProfile(name, registry?)` -- lookup by name with precedence
- `matchProfileByTrigger(input, registry?)` -- NL matching, null on ambiguity
- `validateProfile(filePath)` -- schema check with typo detection
- `healProfile(filePath, fixes)` -- apply corrections to disk
- `checkThresholdWarnings(profile, baseRequirements)` -- compare against standard

## Data Flow Summary

```
User input -> intent detection -> profile trigger match -> confirmation ->
  state recording -> requirement merge (base + profile + workflow) ->
  gate checks (unchanged hooks)
```

## Error Handling

- 6 error categories (E-PROF-001 through E-PROF-006)
- Every error has graceful degradation -- never hard-stops unless `enforce_minimum` opted in
- Hardcoded `standard` fallback protects against framework corruption

## Forward Compatibility

Profile schema includes an optional `workflow_type` binding field for future custom workflow definitions. Profiles work standalone today and will integrate with custom workflows when that feature ships.

## Assumptions

- Levenshtein distance < 3 for typo detection (may need tuning)
- `global_overrides` convenience field inferred from conversation about simple authoring
- Monorepo profile path follows existing `.isdlc/projects/{id}/` pattern
