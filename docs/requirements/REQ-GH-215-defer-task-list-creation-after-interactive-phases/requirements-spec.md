# Requirements Specification: GH-215

**Slug**: REQ-GH-215-defer-task-list-creation-after-interactive-phases
**Status**: Analyzed
**Confidence**: High
**Last Updated**: 2026-03-31
**Coverage**: Complete

---

## 1. Business Context

The iSDLC framework currently supports three separate workflow entry points: `/isdlc fix`, `/isdlc feature`, and `/isdlc build`. The fix and feature commands launch the Phase-Loop Controller with interactive Phase 01 (requirements capture), causing the task status bar to clutter the screen during conversational phases. GH-218 demonstrated that routing bugs through analyze-then-build eliminates this problem. This item extends that pattern to all workflows: the canonical flow becomes add -> analyze -> build, with fix and feature commands removed entirely.

**Success metric**: Zero interactive phases in the Phase-Loop Controller for built-in workflows. Three clear commands (add/analyze/build) replace five overlapping ones (add/analyze/build/fix/feature).

**Driving factors**: UX simplification, elimination of redundant code paths, alignment with GH-218's proven analyze-first pattern.

## 2. Stakeholders and Personas

**Primary user**: Developer using iSDLC framework
- Role: Uses slash commands to drive development workflows
- Pain point: Confusing overlap between fix/feature/build commands; task list cluttering screen during interactive phases
- Proficiency: Familiar with add/analyze/build flow from recent usage

## 3. User Journeys

**Entry**: User identifies a bug or feature to work on
**Flow**:
1. `/add "description"` or `/analyze "#42"` (auto-adds if needed)
2. `/analyze "item"` — runs bug or feature roundtable, produces artifacts
3. `/build "item"` — starts Phase-Loop Controller at Phase 05 (non-interactive)
**Exit**: Build completes, branch merged

**Error path**: User invokes removed command (`/isdlc fix` or `/isdlc feature`) — clear error message directs them to use analyze/build instead.

## 4. Technical Context

- GH-218 established the bug analyze -> auto-build pattern (Phase 01+02 in analyze, Phase 05+ in build)
- GH-208 established task list generation as the 4th confirmation domain during analyze
- GH-212 established task consumption by build phase agents (BUILD-INIT COPY, TASK_CONTEXT INJECTION)
- The Phase-Loop Controller's 3d-relay (interactive phase relay) remains for custom workflows but is never triggered by built-in workflows
- Dual-provider support required (Claude Code + Codex)

**Constraints**:
- Custom workflows in workflows.json must not break
- BUILD-INIT COPY (GH-212 FR-004) and TASK_CONTEXT INJECTION (GH-212 FR-007) must be preserved
- 3d-relay stays as infrastructure for custom interactive workflows

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Simplicity | Critical | 3 commands replace 5 |
| Backward compat (custom workflows) | High | Custom workflow entries in workflows.json unaffected |
| Dual-provider parity | High | Claude and Codex both support /add /analyze /build |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Hooks hardcode fix/feature workflow types | Medium | High | Search all hooks for string literals before removal |
| Custom workflows use fix-specific phases | Low | Medium | Custom workflows define their own phases; fix removal only affects built-in |
| Build handler regression from START_PHASE removal | Medium | High | Comprehensive test coverage for build auto-detection |

## 6. Functional Requirements

### FR-001: Remove /isdlc fix command
**Confidence**: High

Remove the fix action handler, fix workflow definition from workflows.json, fix-specific agent_modifiers, fix-specific iteration requirement overrides, and fix branch naming logic from the Phase-Loop Controller path.

- AC-001-01: Given a user invokes `/isdlc fix "desc"`, when the command is parsed, then an error message is displayed directing the user to use `/analyze` and `/build` instead
- AC-001-02: Given workflows.json is loaded, when the fix workflow is looked up, then it does not exist
- AC-001-03: Given iteration-requirements.json is loaded, when fix workflow overrides are looked up, then they do not exist
- AC-001-04: Given the gate-blocker hook runs, when it reads workflow overrides, then no fix-specific overrides are applied

### FR-002: Remove /isdlc feature command
**Confidence**: High

Remove the feature action handler (currently an alias for build) and the feature-light workflow definition.

- AC-002-01: Given a user invokes `/isdlc feature "desc"`, when the command is parsed, then an error message is displayed directing the user to use `/analyze` and `/build` instead
- AC-002-02: Given workflows.json is loaded, when feature and feature-light workflows are looked up, then they do not exist

### FR-003: Update intent detection table
**Confidence**: High

Reroute "fix" signals to `/isdlc analyze`. Reroute "build/feature" signals to `/isdlc analyze` for new items or `/isdlc build` for already-analyzed items.

- AC-003-01: Given a user says "fix this crash", when intent is detected, then `/isdlc analyze` is invoked (not `/isdlc fix`)
- AC-003-02: Given a user says "build the auth feature", when the item is already analyzed, then `/isdlc build` is invoked
- AC-003-03: Given a user says "implement dark mode", when the item is not yet analyzed, then `/isdlc analyze` is invoked

### FR-004: Update SCENARIO 3 menu
**Confidence**: High

Replace Feature/Fix entries with Add/Analyze/Build. Full menu: Add, Analyze, Build, Run Tests, Generate Tests, View Status, Upgrade.

- AC-004-01: Given `/isdlc` is invoked with no args and constitution is configured, when the menu is presented, then it shows Add/Analyze/Build/Run Tests/Generate Tests/View Status/Upgrade
- AC-004-02: Given the menu is presented, when Feature or Fix are looked for, then they do not appear

### FR-005: Phase-Loop Controller 3d-relay preserved for custom workflows
**Confidence**: High

The 3d-relay remains in the Phase-Loop Controller as infrastructure for custom workflows that may have interactive phases. Built-in workflows never trigger it.

- AC-005-01: Given a custom workflow with interactive_elicitation.enabled: true on a phase, when the Phase-Loop Controller runs that phase, then the 3d-relay activates
- AC-005-02: Given the built-in build workflow runs, when Phase 05 starts, then the 3d-relay is not triggered

### FR-006: Build infers branch naming from artifact folder prefix
**Confidence**: High

Read artifact folder name prefix during build init to determine branch naming: BUG-* -> bugfix/, REQ-* -> feature/.

- AC-006-01: Given an artifact folder named BUG-GH-42-login-crash, when build init creates a branch, then the branch is named bugfix/BUG-GH-42-login-crash
- AC-006-02: Given an artifact folder named REQ-GH-100-add-search, when build init creates a branch, then the branch is named feature/REQ-GH-100-add-search
- AC-006-03: Given an artifact folder with unknown prefix, when build init creates a branch, then it defaults to feature/ (fail-safe, Article X)

### FR-007: Update GH-215 issue description
**Confidence**: High

Update the GitHub issue to reflect the new scope (workflow simplification, not just task deferral).

- AC-007-01: Given GH-215 on GitHub, when the issue is viewed, then the description reflects the add/analyze/build simplification

### FR-008: Create standalone /add, /analyze, /build commands
**Confidence**: High

Create top-level slash commands for both Claude Code and Codex providers that delegate to the corresponding isdlc actions.

- AC-008-01: Given a user types `/add "desc"`, when the skill is invoked, then it delegates to `/isdlc add "desc"`
- AC-008-02: Given a user types `/analyze "#42"`, when the skill is invoked, then it delegates to `/isdlc analyze "#42"`
- AC-008-03: Given a user types `/build "item"`, when the skill is invoked, then it delegates to `/isdlc build "item"`
- AC-008-04: Given Codex provider is active, when `/add` is invoked, then the Codex projection handles it equivalently

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Removing 3d-relay from Phase-Loop Controller | Needed for custom workflows with interactive phases |
| Changing analyze behavior | Analyze already handles both bugs and features correctly |
| Changing add behavior | Add already works for both bugs and features |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Remove /isdlc fix | Must Have | Core simplification |
| FR-002 | Remove /isdlc feature | Must Have | Core simplification |
| FR-003 | Update intent detection | Must Have | Users need correct routing |
| FR-004 | Update SCENARIO 3 menu | Must Have | Menu must reflect available commands |
| FR-005 | 3d-relay preserved | Must Have | Custom workflow support |
| FR-006 | Branch naming inference | Must Have | Build needs to create branches |
| FR-007 | Update GH-215 issue | Should Have | Documentation accuracy |
| FR-008 | Standalone commands | Must Have | User-facing API clarity |
