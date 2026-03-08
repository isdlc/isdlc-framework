# Requirements Specification: REQ-0049 — Gate Profiles

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-08
**Coverage**: 95%

---

## 1. Business Context

iSDLC currently enforces a single strictness level for all gates across all projects, workflows, and developers. This one-size-fits-all approach creates friction: side projects are burdened with 80% coverage requirements, while regulated codebases may need 95%. There is no way for a developer to express their desired level of rigor.

Gate profiles introduce named, configurable strictness levels that adjust gate thresholds. This is part of the Hackability Roadmap (Tier 1 — Foundation, Layer 1 — Configure) and represents the first step toward making iSDLC a platform developers can make their own.

### Success Metrics

- Developers can create and apply a custom profile within 2 minutes (file creation + workflow start)
- Zero breaking changes to existing workflows — `standard` profile matches current behavior exactly
- Profile resolution adds < 100ms to workflow startup

---

## 2. Stakeholders and Personas

### Primary: Individual Developer
- **Interest**: Control over gate strictness to match project context
- **Pain point**: Forced to endure full rigor on side projects; cannot increase rigor on critical code
- **Interaction**: Creates profile files, selects profiles via natural language at workflow start

### Secondary: Team Lead
- **Interest**: Optionally enforce minimum thresholds across a team's project
- **Pain point**: No way to prevent developers from skipping important gates
- **Interaction**: Sets `enforce_minimum: true` in project config (opt-in, not default)

### Automated Consumer: Workflow Engine
- **Interest**: Receives resolved profile and applies thresholds to gate checks
- **Interaction**: Calls `resolveProfile()` at workflow start, merges into requirement chain

---

## 3. User Journeys

### Journey 1: Developer Uses Built-in Profile
1. Developer says "quick build for this fix"
2. Framework detects `rapid` profile from "quick" trigger
3. Framework confirms: "Using rapid profile — minimal gates. Override?"
4. Developer confirms, workflow proceeds with rapid thresholds

### Journey 2: Developer Creates Custom Profile
1. Developer creates `.isdlc/profiles/spike.json` with minimal thresholds
2. Developer says "spike build" at next workflow start
3. Framework finds `spike` profile, confirms selection
4. Workflow proceeds with custom thresholds

### Journey 3: Invalid Profile Self-Healing
1. Developer creates a profile with a typo (`min_coverge_percent`)
2. Framework detects unrecognized field at load time
3. Framework shows error, offers to fix: "Did you mean min_coverage_percent?"
4. Developer agrees, framework corrects the file and continues

### Journey 4: Ambiguous Profile Selection
1. Developer says "careful build"
2. No profile matches "careful"
3. Framework lists available profiles and asks which one to use
4. Developer selects `strict`, workflow proceeds

---

## 4. Technical Context

### Existing Infrastructure
- `mergeRequirements()` in `gate-logic.cjs` already deep-merges base requirements with workflow overrides
- `loadIterationRequirements()` in `common.cjs` is the single loading point used by 12+ hooks
- `workflow_overrides` in `iteration-requirements.json` demonstrates per-context threshold adjustment
- External skills follow a file-based, auto-discovered pattern at `.claude/skills/external/`

### Constraints
- Profile merge must not break existing `workflow_overrides` behavior
- Profile schema must be a strict subset of `phase_requirements` fields
- Profile resolution must complete before workflow phase delegation begins
- Personal profiles (`~/.isdlc/profiles/`) must not leak into project git history

---

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Backward compatibility | Must Have | `standard` profile produces identical behavior to current system |
| Performance | Must Have | Profile resolution < 100ms |
| Discoverability | Should Have | `isdlc profiles list` shows all available profiles with source |
| Extensibility | Should Have | Profile schema supports future workflow binding |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Developers disable all gates and ship broken code | Medium | Low (their project, their choice) | Warn below recommended minimums; document consequences |
| Profile name collisions across tiers | Low | Medium | Clear precedence: personal > project > built-in; `profiles list` shows source |
| Invalid profile blocks workflow start | Medium | High | Self-healing: offer to fix, fall back to `standard` if declined |
| Merge order bugs produce unexpected thresholds | Low | High | Comprehensive test coverage for merge chain; debug command shows resolved thresholds |

---

## 6. Functional Requirements

### FR-001: Built-in Profile Definitions
**Priority**: Must Have
**Confidence**: High

The framework SHALL ship with three built-in profiles: `rapid`, `standard`, and `strict`.

- **AC-001-01**: `rapid` profile reduces `min_coverage_percent` to 60, disables `constitutional_validation`, sets `min_menu_interactions` to 1, sets `max_iterations` to 3
- **AC-001-02**: `standard` profile matches current default behavior exactly (no threshold changes)
- **AC-001-03**: `strict` profile increases `min_coverage_percent` to 95 and enables `require_mutation_testing`
- **AC-001-04**: Built-in profiles are always available regardless of project or personal profile configuration

### FR-002: Custom Profile Definition
**Priority**: Must Have
**Confidence**: High

Developers SHALL be able to define custom named profiles as JSON files.

- **AC-002-01**: Project profiles are loaded from `.isdlc/profiles/*.json`
- **AC-002-02**: Personal profiles are loaded from `~/.isdlc/profiles/*.json`
- **AC-002-03**: Each profile file contains: `name`, `description`, `triggers` (array of natural language keywords), and threshold overrides
- **AC-002-04**: Profile threshold overrides use the same schema as `phase_requirements` fields in `iteration-requirements.json`
- **AC-002-05**: No registration command is required — dropping a file in the directory makes it available

### FR-003: Profile Resolution Order
**Priority**: Must Have
**Confidence**: High

When multiple profile sources define a profile with the same name, the framework SHALL resolve using a defined precedence order.

- **AC-003-01**: Resolution order: personal (`~/.isdlc/profiles/`) overrides project (`.isdlc/profiles/`) overrides built-in
- **AC-003-02**: When a name collision occurs, only the highest-precedence profile is used
- **AC-003-03**: `profiles list` command shows the source tier for each available profile

### FR-004: Natural Language Profile Selection
**Priority**: Must Have
**Confidence**: High

The framework SHALL detect profile selection from natural language at workflow start.

- **AC-004-01**: Each profile defines a `triggers` array of keyword strings
- **AC-004-02**: Framework matches user input against all available profile triggers
- **AC-004-03**: On exact or unambiguous match, the profile is selected
- **AC-004-04**: On no match, the framework lists available profiles and asks the user to choose
- **AC-004-05**: On ambiguous match (multiple profiles match), the framework asks the user to disambiguate

### FR-005: Profile Confirmation at Workflow Start
**Priority**: Must Have
**Confidence**: High

The framework SHALL confirm the active profile to the developer before proceeding.

- **AC-005-01**: After profile resolution, display: "Using [profile name] profile — [one-line description]. Override?"
- **AC-005-02**: Developer can accept (proceed) or override (select different profile)
- **AC-005-03**: If no explicit profile is selected, the project default is applied and confirmed
- **AC-005-04**: The profile name is recorded in the workflow state for audit/traceability

### FR-006: Profile Merge into Gate Logic
**Priority**: Must Have
**Confidence**: High

The resolved profile SHALL be merged into the gate requirement chain as a new layer.

- **AC-006-01**: Merge order: base `phase_requirements` -> profile overlay -> `workflow_overrides`
- **AC-006-02**: The existing `mergeRequirements()` function is reused for the profile merge
- **AC-006-03**: Profile overrides apply to all phases unless the profile specifies per-phase overrides
- **AC-006-04**: Existing workflow override behavior is unchanged when no profile is selected (backward compatibility)

### FR-007: Profile Validation and Self-Healing
**Priority**: Must Have
**Confidence**: High

The framework SHALL validate profile files on load and offer to fix errors.

- **AC-007-01**: Profile JSON is validated against the profile schema on load
- **AC-007-02**: Unrecognized fields are flagged with suggested corrections (e.g., typo detection)
- **AC-007-03**: Type errors (string where number expected) are flagged with the expected type
- **AC-007-04**: Framework offers to fix detected errors; if developer accepts, file is corrected and reloaded
- **AC-007-05**: If developer declines the fix, framework falls back to `standard` profile and proceeds

### FR-008: Threshold Warnings
**Priority**: Must Have
**Confidence**: High

The framework SHALL warn when a profile sets thresholds below recommended minimums.

- **AC-008-01**: Built-in `standard` profile defines the recommended minimums
- **AC-008-02**: When a custom profile drops below any `standard` threshold, a one-line warning is emitted
- **AC-008-03**: Warnings do not block the workflow — they are informational only
- **AC-008-04**: An opt-in `enforce_minimum: true` project setting converts warnings to hard blocks

### FR-009: Profile Listing Command
**Priority**: Should Have
**Confidence**: High

The framework SHALL provide a way to list all available profiles.

- **AC-009-01**: `isdlc profiles list` (or natural language equivalent) displays all profiles
- **AC-009-02**: Each entry shows: name, source tier (built-in/project/personal), description, trigger keywords
- **AC-009-03**: Active profile for the current project default is highlighted

### FR-010: Project Default Profile
**Priority**: Should Have
**Confidence**: High

Projects SHALL be able to declare a default profile.

- **AC-010-01**: Default profile is set in `.isdlc/config.json` under `"default_profile": "profile-name"`
- **AC-010-02**: When no explicit profile is selected at workflow start, the project default is used
- **AC-010-03**: If no project default is configured, `standard` is used
- **AC-010-04**: Personal profiles can override the project default (developer autonomy)

### FR-011: Workflow Definition Binding (Forward Compatibility)
**Priority**: Should Have
**Confidence**: Medium

Profile schema SHALL support future binding to custom workflow definitions.

- **AC-011-01**: Profile resolution accepts an optional `workflow_type` parameter
- **AC-011-02**: Workflow definitions can declare `"default_profile": "profile-name"` to set a default
- **AC-011-03**: Explicit user selection always overrides workflow default

### FR-012: Monorepo Support
**Priority**: Should Have
**Confidence**: Medium

In monorepo installations, profiles SHALL be scoped per-project.

- **AC-012-01**: Monorepo project profiles live in `.isdlc/projects/{project-id}/profiles/*.json`
- **AC-012-02**: Resolution order in monorepo: personal > project-scoped > built-in
- **AC-012-03**: Different projects in the same monorepo can have different default profiles

---

## 7. Out of Scope

- **Custom workflow definitions**: Profiles support future binding (FR-011) but custom workflows are a separate feature
- **Role-based access control**: No user/role distinction for profile access — any developer can use any available profile
- **Profile inheritance**: Profiles do not extend other profiles — each is self-contained
- **Remote/shared profile repositories**: Profiles are local files only (project or personal filesystem)
- **CI/CD profile enforcement**: Profiles apply to interactive workflows only; CI/CD pipeline gates are managed separately

---

## 8. MoSCoW Prioritization

| Priority | Requirements |
|----------|-------------|
| **Must Have** | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008 |
| **Should Have** | FR-009, FR-010, FR-011, FR-012 |
| **Could Have** | — |
| **Won't Have** | Role-based access, profile inheritance, remote profile repos |
