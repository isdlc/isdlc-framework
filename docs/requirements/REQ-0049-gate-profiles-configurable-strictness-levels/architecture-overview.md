# Architecture Overview: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 90%

---

## 1. Architecture Options

### Option A: Profile as a New Merge Layer (Recommended)

Add profiles as a third layer in the existing requirement merge chain:

```
base phase_requirements -> profile overlay -> workflow_overrides -> resolved requirements
```

**Pros**:
- Reuses existing `mergeRequirements()` function
- No changes to downstream hooks — they receive already-merged requirements
- Backward compatible — omitting a profile produces identical behavior to today
- Profile schema is a subset of existing `phase_requirements` schema

**Cons**:
- Three-layer merge increases debugging complexity
- Must ensure merge order is well-documented and testable

**Existing pattern alignment**: Directly extends the `workflow_overrides` pattern already in `iteration-requirements.json`

### Option B: Profile Replaces Base Requirements

Profiles define complete requirement sets (not overlays). The active profile *replaces* `phase_requirements` entirely.

**Pros**:
- Simpler mental model — what you see in the profile is what you get
- No merge ordering ambiguity

**Cons**:
- Massive duplication — every profile must define all 17 phases
- Updating a base threshold requires updating every profile
- Breaks `workflow_overrides` pattern (overrides would need to reference profile, not base)
- Not backward compatible without migration

**Existing pattern alignment**: None — contradicts the overlay pattern used everywhere else

### Selected: Option A — Profile as a New Merge Layer

**Rationale**: The overlay approach is consistent with how `workflow_overrides` already work, requires minimal code changes, and preserves backward compatibility. The debugging complexity is mitigated by a `profiles resolve` debug command that shows the full merge chain.

---

## 2. Technology Decisions

### ADR-001: File-Based Profile Discovery

**Decision**: Profiles are discovered by globbing JSON files from known directories, not by explicit registration.

**Context**: External skills use a manifest (`external-skills-manifest.json`) for registration. Profiles are simpler (no activation events, no dependencies) and benefit from the lowest possible friction.

**Alternatives considered**:
1. Manifest-based registration (like skills) — rejected: unnecessary overhead for simple config files
2. Single config file with all profiles — rejected: harder to share individual profiles, messier git diffs

**Consequences**: Profile loader must handle directory-not-found gracefully. No manifest to validate against — schema validation happens per-file on load.

### ADR-002: Profile Schema as Subset of phase_requirements

**Decision**: Profile override fields must exist in the `phase_requirements` schema. Unknown fields are flagged as errors.

**Context**: This prevents profiles from inventing new gate types and ensures the merge always produces valid requirements.

**Consequences**: Adding new gate types to iSDLC requires updating the profile schema. This is acceptable because new gate types are rare framework-level changes.

### ADR-003: Three-Tier Resolution Order

**Decision**: Personal profiles (`~/.isdlc/profiles/`) override project profiles (`.isdlc/profiles/`) override built-in profiles (`src/claude/hooks/config/profiles/`).

**Context**: Developer autonomy is the core principle. A developer's personal preference should always win over project defaults, and project defaults should always win over framework defaults.

**Consequences**: A team cannot force a profile on a developer (by design). The opt-in `enforce_minimum` flag provides a guardrail for teams that need it.

---

## 3. Integration Architecture

### Profile Resolution Flow

```
Workflow Start
  |
  v
Intent Detection (isdlc.md)
  |-- Extract profile signal from natural language
  |-- Match against available profile triggers
  |
  v
Profile Resolution (profile-loader.cjs)
  |-- Glob built-in profiles: src/claude/hooks/config/profiles/*.json
  |-- Glob project profiles: .isdlc/profiles/*.json
  |-- Glob personal profiles: ~/.isdlc/profiles/*.json
  |-- Deduplicate by name (personal > project > built-in)
  |-- Validate matched profile against schema
  |-- If invalid: offer self-healing
  |-- If no match: list available profiles, ask user
  |
  v
Profile Confirmation (orchestrator)
  |-- Display: "Using [name] profile — [description]. Override?"
  |-- Record selected profile in workflow state
  |
  v
Requirement Merge (gate-logic.cjs / common.cjs)
  |-- Load base phase_requirements
  |-- Deep-merge profile overlay
  |-- Deep-merge workflow_overrides
  |-- Return resolved requirements
  |
  v
Gate Checks (all hooks)
  |-- Receive resolved requirements as today
  |-- No hook changes needed
```

### Merge Chain Detail

```
loadIterationRequirements()
  |
  +-- Read iteration-requirements.json (base)
  |
  +-- loadProfiles() -> resolveProfile(profileName)
  |     |
  |     +-- Glob all profile directories
  |     +-- Parse + validate each file
  |     +-- Return matched profile overrides
  |
  +-- mergeRequirements(base.phase_requirements, profile.overrides)
  |     |
  |     +-- Deep merge per existing function
  |     +-- Result: profile-adjusted requirements
  |
  +-- (workflow_overrides applied later in gate-logic.cjs check())
  |
  +-- Return merged requirements to calling hook
```

### Integration Points

| Component | Integration | Direction |
|-----------|-------------|-----------|
| `common.cjs` | Calls `profile-loader.cjs` during `loadIterationRequirements()` | common -> profile-loader |
| `gate-logic.cjs` | Receives profile-merged requirements; applies workflow overrides on top | common -> gate-logic |
| `isdlc.md` | Parses natural language for profile triggers; passes profile name to orchestrator | user -> isdlc.md -> orchestrator |
| `00-sdlc-orchestrator.md` | Confirms profile with user; records in workflow state | orchestrator -> state |
| `validate-gate.cjs` (Antigravity) | Calls same `loadIterationRequirements()` — gets profile-merged results | antigravity -> common |

---

## 4. Data Flow

```
User Input ("quick build")
  --> isdlc.md (intent + profile trigger extraction)
  --> orchestrator (profile confirmation)
  --> workflow state (profile name stored)
  --> common.cjs (loadIterationRequirements + profile merge)
  --> gate-logic.cjs (workflow override merge + gate check)
  --> hook response (allow/block based on resolved thresholds)
```

---

## 5. Summary

The architecture is an incremental extension of the existing merge-based gate system. One new module (`profile-loader.cjs`) handles discovery, validation, and resolution. One new merge step in the requirements loading chain applies profile overrides. The UX integration adds profile awareness to the orchestrator's workflow start sequence. No existing hooks require modification — they receive already-merged requirements transparently.
