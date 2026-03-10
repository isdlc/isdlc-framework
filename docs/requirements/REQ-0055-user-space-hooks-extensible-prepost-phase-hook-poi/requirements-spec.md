# Requirements Specification: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## 1. Business Context

### 1.1 Problem Statement

The iSDLC framework cannot anticipate every domain-specific need. Teams working with proprietary formats, internal compliance tools, or notification systems have no way to plug their tooling into the workflow lifecycle. The framework's 26 hooks are internal enforcement mechanisms -- not user-extensible.

This limits the framework's value as a platform. Without user-extensible hook points, teams must either work outside the framework or request framework changes for every domain-specific need.

### 1.2 Success Criteria

- A developer can create a hook subdirectory in `.isdlc/hooks/`, configure its `hook.yaml`, and it executes automatically at the right moment -- no registration, no framework changes
- The framework remains stable regardless of what user hooks do (isolation)
- Hook blocks are treated as quality/governance signals: the agent retries fixes before escalating to the user
- Users retain final authority over hook outcomes after agent retry exhaustion

### 1.3 Strategic Context

Part of the Hackability & Extensibility Roadmap -- Tier 2 (Extension Points), Layer 3 (Extend). Tier 1 (Foundation) is complete: gate profiles, workflow recovery, roundtable depth, and contributing personas are all shipped.

User-space hooks are part of the Claude Code ecosystem. The authoring guide is a brief reference with links to Claude Code documentation for detailed hook concepts.

---

## 2. Stakeholders and Personas

### 2.1 Primary: Framework Developer

- **Role**: Developer using iSDLC to build software
- **Interest**: Plug domain-specific tooling into the workflow without modifying the framework
- **Pain point**: Must work outside the framework for domain-specific validation, notifications, and compliance checks

### 2.2 Secondary: Team Lead / DevOps

- **Role**: Sets up project conventions for a team
- **Interest**: Enforce team-specific quality gates and notifications across all team members' workflows
- **Pain point**: No mechanism to add team-level automation to the workflow lifecycle

---

## 3. User Journeys

### 3.1 Create and Configure a Hook

1. Developer copies `.isdlc/hooks/hook-template.yaml` to `.isdlc/hooks/my-validator/hook.yaml`
2. Developer creates `.isdlc/hooks/my-validator/hook.sh` with their validation logic
3. Developer edits `hook.yaml`, setting `post-implementation: true` in the triggers checklist
4. Developer runs a workflow that reaches the implementation phase
5. After implementation completes, the framework discovers and executes `hook.sh`
6. Developer sees the script's stdout output

### 3.2 Hook Blocks with Agent Retry

1. Developer creates a pre-gate hook that runs a SAST scanner
2. Scanner finds a critical vulnerability, exits with code 2
3. Framework reports the block to the orchestrator agent
4. Agent reads the hook output, assesses the issue, and attempts a fix
5. Agent re-triggers gate advancement (hook re-runs)
6. If the hook passes: workflow continues
7. If the hook blocks 3 times: agent escalates to the user with a bulleted summary of failures
8. User decides: fix manually, skip the hook, or override the block

### 3.3 Misconfigured Hook Detection

1. Developer creates `.isdlc/hooks/my-hook/hook.sh` but forgets `hook.yaml`
2. At session start, the harness scans `.isdlc/hooks/` subdirectories
3. Harness warns: "Found `my-hook` without configuration. See the hook authoring guide to set up hook.yaml."
4. Workflow continues -- misconfigured hooks are warnings, not blocks

---

## 4. Technical Context

### 4.1 Existing Infrastructure

- **Framework hooks**: 26 hooks in `src/claude/hooks/` using Claude Code's JSON stdin/stdout protocol
- **Phase advancement**: `src/antigravity/phase-advance.cjs` runs gate validation before advancing
- **Workflow lifecycle**: `workflow-init.cjs` (start), `workflow-finalize.cjs` (end)
- **Phase identifiers**: String-based (e.g., `00-quick-scan`, `01-requirements`, `06-implementation`)
- **Claude Code retry pattern**: Agent reads tool output, assesses failure, adjusts, retries -- built-in behavior

### 4.2 Constraints

- User hooks execute as child processes (shell commands) -- any language
- User hooks must not modify `.isdlc/state.json` directly
- Hook timeout is configurable per-hook (default 60 seconds)
- Hook execution must not crash the framework on failure
- Hook template must be shipped with install/update process

---

## 5. Quality Attributes and Risks

### 5.1 Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Discoverability | Must | Copy template, configure triggers, it works |
| Isolation | Must | Bad hook cannot corrupt framework state |
| Transparency | Must | User sees what ran, what passed, what failed |
| Governance | Must | Blocks drive agent to fix the issue before escalating |
| User control | Must | User can bypass or override any hook outcome after escalation |
| Performance | Should | Hook engine overhead < 5s per trigger point (excluding user script time) |

### 5.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Broken hook stalls all workflows | Medium | High | 3-retry-per-hook with agent fix attempts; user escalation after exhaustion |
| Hook modifies state.json directly | Low | High | State.json is managed by framework; hooks receive context via env vars, not direct access |
| Hook timeout blocks workflow indefinitely | Low | Medium | Per-hook configurable timeout with kill-after enforcement |
| Misconfigured hooks cause confusion | Medium | Low | Runtime misconfiguration detection with actionable warnings |
| Ambiguous phase name resolution | Low | Low | Template uses friendly names; engine logs resolved name |

---

## 6. Functional Requirements

### FR-001: Hook Discovery
**Priority**: Must Have
**Confidence**: High

The framework SHALL discover user-space hooks by scanning `.isdlc/hooks/` subdirectories at each trigger point. Each hook lives in its own subdirectory with a `hook.yaml` configuration and entry point script.

**AC-001-01**: Given a hook subdirectory exists at `.isdlc/hooks/{hook-name}/` with a valid `hook.yaml`, when a trigger point fires that matches the hook's configured triggers, then the hook is discovered and queued for execution.

**AC-001-02**: Given no `.isdlc/hooks/` directory exists, when any trigger point fires, then the framework proceeds normally with no errors.

**AC-001-03**: Given multiple hook subdirectories have triggers matching the same hook point, when the trigger fires, then hooks execute in alphabetical order by subdirectory name.

**AC-001-04**: Given a hook subdirectory exists without a `hook.yaml`, when the trigger fires, then the hook is skipped (not executed).

### FR-002: Hook Execution
**Priority**: Must Have
**Confidence**: High

The framework SHALL execute discovered hooks as child processes using the system shell, capturing stdout and stderr.

**AC-002-01**: Given a hook with a valid config and script, when executed, then its stdout is captured and shown to the developer.

**AC-002-02**: Given a hook script, when it exceeds the hook's configured timeout, then the process is killed and the framework reports a timeout to the user.

**AC-002-03**: Given a hook script, when it throws an unhandled error or crashes, then the framework catches the failure and reports it without crashing itself.

### FR-003: Exit Code Protocol
**Priority**: Must Have
**Confidence**: High

The framework SHALL interpret hook exit codes as follows: 0 = pass, 1 = warning, 2 = block.

**AC-003-01**: Given a hook exits with code 0, when processing results, then the framework records success and continues.

**AC-003-02**: Given a hook exits with code 1, when processing results, then the framework shows the warning to the user and continues.

**AC-003-03**: Given a hook exits with code 2, when processing results, then the framework reports a block to the orchestrator agent, which attempts to fix the issue and retry (up to 3 times per hook) before escalating to the user.

**AC-003-04**: Given a hook exits with any other code (3+), when processing results, then the framework treats it as a warning (same as exit 1).

### FR-004: Hook Points (General Pattern)
**Priority**: Must Have
**Confidence**: High

The framework SHALL support hook points following a general `pre-/post-{phase}` naming pattern. Hooks declare their trigger points in `hook.yaml` via a checklist of all phases.

**AC-004-01**: The framework SHALL support `pre-workflow` hooks, executed before workflow initialization completes.

**AC-004-02**: The framework SHALL support `pre-{phase-name}` hooks, executed before the named phase begins.

**AC-004-03**: The framework SHALL support `post-{phase-name}` hooks, executed after the named phase completes.

**AC-004-04**: The framework SHALL support `pre-gate` hooks, executed before gate validation in `phase-advance.cjs`.

**AC-004-05**: The framework SHALL support `post-workflow` hooks, executed after workflow finalization completes.

### FR-005: Phase Name Resolution
**Priority**: Must Have
**Confidence**: High

The framework SHALL accept both internal phase identifiers and friendly aliases in `hook.yaml` trigger checklists.

**AC-005-01**: Given a trigger key `post-implementation` in `hook.yaml`, when resolving, then the framework maps it to `post-06-implementation` internally.

**AC-005-02**: Given a trigger key `post-06-implementation` in `hook.yaml`, when resolving, then the framework uses the name directly.

**AC-005-03**: Given a trigger key with an unrecognized phase name, when resolving, then the framework logs a warning at runtime and skips that trigger.

**AC-005-04**: The framework SHALL maintain a phase alias map that resolves friendly names to internal identifiers, used for resolving `hook.yaml` trigger keys.

### FR-006: Agent Retry Before User Escalation
**Priority**: Must Have
**Confidence**: High

When a hook exits with code 2 (block), the orchestrator agent SHALL attempt to fix the issue and retry, up to 3 times per hook, before escalating to the user.

**AC-006-01**: Given a hook blocks, when the agent receives the `HOOK_BLOCKED` result, then the agent reads the hook's stdout/stderr output to assess the issue.

**AC-006-02**: The agent SHALL use its judgment based on hook output and severity to determine the scope of the fix (targeted file fix vs. broader rework).

**AC-006-03**: After the agent's fix attempt, it SHALL re-trigger gate advancement, which re-runs the blocking hook.

**AC-006-04**: Given a hook has blocked 3 times, when it blocks again, then the agent escalates to the user with a bulleted summary of all failure attempts and hook output.

**AC-006-05**: The user retains final authority over whether to proceed, skip, or fix manually after escalation.

**AC-006-06**: The retry mechanism SHALL leverage Claude Code's built-in self-correction capabilities rather than custom retry infrastructure.

### FR-007: Timeout Configuration
**Priority**: Should Have
**Confidence**: High

The framework SHALL allow per-hook timeout configuration via `hook.yaml`.

**AC-007-01**: Given `timeout_ms` is set in a hook's `hook.yaml`, when executing the hook, then the framework uses the configured timeout.

**AC-007-02**: Given no timeout is configured in `hook.yaml`, when executing the hook, then the framework uses a default of 60 seconds.

### FR-008: Context Passing
**Priority**: Should Have
**Confidence**: High

The framework SHALL pass workflow context to hooks via environment variables.

**AC-008-01**: The framework SHALL set `ISDLC_PHASE` to the current phase identifier.

**AC-008-02**: The framework SHALL set `ISDLC_WORKFLOW_TYPE` to the workflow type (feature, fix, upgrade, etc.).

**AC-008-03**: The framework SHALL set `ISDLC_SLUG` to the workflow slug.

**AC-008-04**: The framework SHALL set `ISDLC_PROJECT_ROOT` to the project root directory.

**AC-008-05**: The framework SHALL set `ISDLC_ARTIFACT_FOLDER` to the artifact folder path (if applicable).

### FR-009: Hook Authoring Guide
**Priority**: Should Have
**Confidence**: High

A brief reference document SHALL be created at `docs/isdlc/user-hooks.md` covering hook setup, `hook.yaml` schema, and exit code protocol. Detailed hook concepts link to Claude Code documentation.

**AC-009-01**: The guide documents the directory structure and `hook.yaml` schema.

**AC-009-02**: The guide includes a quick-start example (copy template, create directory, configure, write script).

**AC-009-03**: The guide links to Claude Code documentation for detailed hook concepts and advanced patterns.

### FR-010: Update Safety
**Priority**: Must Have
**Confidence**: High

The user's hook scripts in `.isdlc/hooks/` SHALL be preserved when the framework is updated. The hook template SHALL be refreshed on update.

**AC-010-01**: Given user hook subdirectories exist in `.isdlc/hooks/`, when the framework is updated, then the subdirectories and their contents are not modified, overwritten, or deleted.

**AC-010-02**: The update scripts (`update.sh` and `lib/updater.js`) SHALL document `.isdlc/hooks/` in their "preserved" (never touched) list.

**AC-010-03**: The `hook-template.yaml` file SHALL be refreshed on install/update to reflect the latest phase list.

### FR-011: Hook Execution Logging
**Priority**: Could Have
**Confidence**: Medium

The framework SHOULD log hook execution results to each hook's own `logs/` subdirectory.

**AC-011-01**: Given hooks execute, when logging, then each execution's timestamp, exit code, duration, stdout, and stderr are recorded in the hook's `logs/` directory.

**AC-011-02**: Log files default to the hook's own subdirectory (e.g., `.isdlc/hooks/my-validator/logs/`).

**AC-011-03**: Log entries are accessible for debugging but do not clutter normal workflow output.

### FR-012: Hook Configuration Schema
**Priority**: Must Have
**Confidence**: High

Each hook SHALL be configured via a `hook.yaml` file in its subdirectory, defining triggers, metadata, and behavior.

**AC-012-01**: The `hook.yaml` schema SHALL include: `name`, `description`, `entry_point`, `triggers` (full phase checklist), `timeout_ms`, `retry_limit`, `severity`, and `outputs`.

**AC-012-02**: The `triggers` field SHALL be a checklist of every phase with `pre-` and `post-` timing, defaulting to `false` (hooks do not trigger unless explicitly configured).

**AC-012-03**: The `entry_point` field SHALL default to `hook.sh` if not specified.

**AC-012-04**: The `severity` field SHALL accept values `minor`, `major`, or `critical`, guiding the agent's fix scope during retry.

### FR-013: Hook Template Delivery
**Priority**: Must Have
**Confidence**: High

A `hook-template.yaml` SHALL be shipped with the framework install and update process.

**AC-013-01**: The template SHALL be placed at `.isdlc/hooks/hook-template.yaml` during install.

**AC-013-02**: The template SHALL include all phases with all `pre-`/`post-` combinations, all set to `false`.

**AC-013-03**: The template SHALL be refreshed on framework update to reflect any new phases.

**AC-013-04**: The hook authoring guide SHALL document copying the template as the first step in hook creation.

### FR-014: Runtime Misconfiguration Detection
**Priority**: Must Have
**Confidence**: High

The framework SHALL detect misconfigured hooks at session start and warn the user.

**AC-014-01**: Given a hook subdirectory exists but is missing `hook.yaml`, when the session starts, then the framework warns the user to configure the hook.

**AC-014-02**: Given a `hook.yaml` exists but has no triggers set to `true`, when the session starts, then the framework warns that the hook will never fire.

**AC-014-03**: Given a `hook.yaml` has triggers but no entry point script exists, when the session starts, then the framework warns that the hook has no script to execute.

**AC-014-04**: Misconfiguration warnings are informational -- they do not block workflow execution.

---

## 7. Out of Scope

- **Hook marketplace or sharing mechanism**: Hooks are project-local files. Sharing is via normal file distribution (git, copy).
- **GUI for hook management**: Hooks are managed by file system operations.
- **Framework hook extensibility**: The 26 existing Claude Code hooks remain framework-internal. This feature adds a separate user-space hook system.
- **Hook dependency ordering**: Hooks execute alphabetically by subdirectory name. If a developer needs ordering, they use name prefixes (e.g., `01-lint`, `02-test`).
- **Hook-to-hook communication**: Each hook runs independently. No shared state between hooks at the same hook point.

---

## 8. MoSCoW Prioritization

| Priority | Requirements |
|----------|-------------|
| **Must Have** | FR-001 (Discovery), FR-002 (Execution), FR-003 (Exit Codes), FR-004 (Hook Points), FR-005 (Phase Name Resolution), FR-006 (Agent Retry), FR-010 (Update Safety), FR-012 (Config Schema), FR-013 (Template Delivery), FR-014 (Misconfiguration Detection) |
| **Should Have** | FR-007 (Timeout Config), FR-008 (Context Passing), FR-009 (Authoring Guide) |
| **Could Have** | FR-011 (Execution Logging) |
| **Won't Have** | Hook marketplace, GUI management, framework hook extensibility, hook dependencies, hook-to-hook communication |
