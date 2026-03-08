# Impact Analysis: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 95%

---

## 1. Blast Radius

### Tier 1 — Direct Changes (5 files)

| File | Change Type | Description |
|------|-------------|-------------|
| `src/claude/hooks/lib/common.cjs` | Modify | Add `loadProfiles()`, `resolveProfile()`, `validateProfileSchema()` functions |
| `src/claude/hooks/lib/gate-logic.cjs` | Modify | Insert profile merge layer in `check()` between base requirements and workflow overrides |
| `src/claude/commands/isdlc.md` | Modify | Add profile resolution step to workflow intent detection |
| `src/claude/agents/00-sdlc-orchestrator.md` | Modify | Add profile selection/confirmation dialogue at workflow start |
| `src/claude/hooks/config/iteration-requirements.json` | Modify | Add `profile_defaults` section with recommended minimums reference |

### Tier 2 — Transitive Impact (12+ files)

All hooks that call `loadIterationRequirements()` are transitively affected but require NO code changes. The profile merge happens inside the loading layer, so consumers receive already-merged requirements:

- `src/claude/hooks/constitution-validator.cjs`
- `src/claude/hooks/iteration-corridor.cjs`
- `src/claude/hooks/log-skill-usage.cjs`
- `src/claude/hooks/phase-transition-enforcer.cjs`
- `src/claude/hooks/atdd-completeness-validator.cjs`
- `src/claude/hooks/review-reminder.cjs`
- `src/claude/hooks/blast-radius-validator.cjs`
- `src/claude/hooks/state-file-guard.cjs`
- `src/claude/hooks/plan-surfacer.cjs`
- `src/claude/hooks/constitutional-iteration-validator.cjs`
- `src/claude/hooks/state-write-validator.cjs`
- `src/claude/hooks/output-format-validator.cjs`

### Tier 3 — Side Effects

| Area | Risk | Mitigation |
|------|------|------------|
| Existing workflow behavior | Profile merge could alter default thresholds | `standard` profile is identity (no changes); comprehensive regression tests |
| Antigravity bridge | `src/antigravity/validate-gate.cjs` uses gate logic | Validate that Antigravity path also receives profile-merged requirements |
| Test suite | Existing gate-blocker tests assume fixed thresholds | Tests must be profile-aware or pin to `standard` profile |

### New Files (3-5)

| File | Purpose |
|------|---------|
| `src/claude/hooks/config/profiles/rapid.json` | Built-in rapid profile definition |
| `src/claude/hooks/config/profiles/standard.json` | Built-in standard profile definition |
| `src/claude/hooks/config/profiles/strict.json` | Built-in strict profile definition |
| `src/claude/hooks/config/profile-schema.json` | JSON schema for profile validation |
| `src/claude/hooks/lib/profile-loader.cjs` | Profile discovery, loading, validation, and resolution logic |

---

## 2. Entry Points

| Order | Entry Point | Rationale |
|-------|-------------|-----------|
| 1 | Profile schema + built-in definitions | Foundation — everything else depends on the schema |
| 2 | Profile loader (`profile-loader.cjs`) | Discovery, validation, self-healing — can be tested independently |
| 3 | Gate logic merge layer | Core integration — `check()` in `gate-logic.cjs` |
| 4 | Orchestrator profile selection | UX layer — intent detection and confirmation dialogue |
| 5 | Profiles list command | Discoverability — can ship after core functionality |

---

## 3. Implementation Order

```
Phase 1: Schema + Definitions
  profile-schema.json
  rapid.json, standard.json, strict.json

Phase 2: Loader
  profile-loader.cjs (glob, validate, resolve, self-heal)
  Unit tests for loader

Phase 3: Gate Integration
  common.cjs — wire loadProfiles() into requirements loading
  gate-logic.cjs — add profile merge layer
  Integration tests for merge chain

Phase 4: UX Integration
  isdlc.md — profile trigger matching
  00-sdlc-orchestrator.md — confirmation dialogue
  End-to-end tests

Phase 5: Polish
  profiles list command
  Monorepo path support
  Warning system for below-minimum thresholds
```

---

## 4. Risk Zones

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Merge order produces unexpected thresholds | Low | High | Test all merge permutations: base-only, base+profile, base+profile+workflow, base+workflow (no profile) |
| `standard` profile diverges from current behavior | Low | Critical | `standard.json` should be empty overrides (identity merge); test with snapshot comparison |
| Profile loader performance on large profile directories | Very Low | Low | Glob + JSON parse is fast; add performance budget test if > 50ms |
| Antigravity path bypasses profile resolution | Medium | Medium | Ensure `validate-gate.cjs` calls the same `loadIterationRequirements()` that includes profile merge |
| Personal profile path (`~/.isdlc/profiles/`) doesn't exist | High | Low | Graceful handling — skip personal profiles if directory doesn't exist |

---

## 5. Summary

This is a well-scoped standard change. The existing `mergeRequirements()` infrastructure and `workflow_overrides` pattern mean the core architecture is already in place. The primary work is:

1. A new profile loader module with file-based discovery
2. One new merge layer in the gate logic chain
3. UX integration for profile selection and confirmation
4. Three built-in profile definitions

The blast radius is contained: 5 files change directly, 12+ are transitively affected but require no code changes, and the risk of regression is mitigated by the identity-merge design of the `standard` profile.
