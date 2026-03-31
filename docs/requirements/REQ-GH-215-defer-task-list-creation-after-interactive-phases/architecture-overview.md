# Architecture Overview: GH-215

**Slug**: REQ-GH-215-defer-task-list-creation-after-interactive-phases
**Status**: Analyzed
**Confidence**: High
**Last Updated**: 2026-03-31
**Coverage**: Complete

---

## 1. Architecture Options

### Option A: Defer TaskCreate timing (original GH-215 proposal)
- **Summary**: Keep fix/feature commands, defer STEP 2 TaskCreate until first non-interactive phase
- **Pros**: Minimal change, solves the immediate UX issue
- **Cons**: Leaves redundant code paths (fix/feature/build), doesn't simplify the command model
- **Pattern alignment**: Incremental fix, doesn't align with GH-218's analyze-first pattern
- **Verdict**: Eliminated — treats symptom not cause

### Option B: Simplify to add/analyze/build (selected)
- **Summary**: Remove fix/feature commands entirely, canonical flow is add -> analyze -> build. Build always starts at Phase 05.
- **Pros**: Eliminates redundant code paths, solves UX issue by design, aligns with GH-218 pattern, clear 3-command API
- **Cons**: Larger change scope, removes backward compatibility for fix/feature commands
- **Pattern alignment**: Extends GH-218's proven analyze-first pattern to all workflows
- **Verdict**: Selected

## 2. Selected Architecture

### ADR-001: Build infers workflow type from artifact folder prefix
- **Status**: Accepted
- **Context**: With fix/feature commands removed, build needs to determine branch naming without an explicit workflow type
- **Decision**: Read artifact folder name prefix — BUG-* -> bugfix/ branch, REQ-* -> feature/ branch
- **Rationale**: The prefix is already set during add/analyze and is reliable. No new config or metadata needed.
- **Consequences**: Build handler gains a prefix-parsing step during init. Unknown prefixes default to feature/ (Article X fail-safe).

### ADR-002: Intent detection routes through analyze
- **Status**: Accepted
- **Context**: Users saying "fix this bug" need to reach the right flow without /isdlc fix
- **Decision**: "Fix" signals -> /isdlc analyze (auto-adds, classifies, kicks off build). "Build" signals -> /isdlc analyze for unanalyzed items, /isdlc build for analyzed items.
- **Rationale**: The analyze command already handles bug vs feature classification (step 6.5) and auto-add (step 3a).
- **Consequences**: Intent detection table in CLAUDE.md simplified. Consent step wording updated.

### ADR-003: Standalone commands for both providers
- **Status**: Accepted
- **Context**: Users shouldn't need to know about /isdlc as a namespace
- **Decision**: Create thin skill wrappers (add.md, analyze.md, build.md) for Claude Code and equivalent Codex projections. Both delegate to isdlc action handlers.
- **Rationale**: Keeps implementation in one place (isdlc.md) while giving users clean top-level commands.
- **Consequences**: /isdlc add still works for power users; /add is the friendly alias.

### ADR-004: 3d-relay preserved for extensibility
- **Status**: Accepted
- **Context**: Custom workflows may have interactive phases
- **Decision**: Keep the 3d-relay in the Phase-Loop Controller. Built-in build workflow never triggers it.
- **Rationale**: The framework is hackable — users can define custom workflows with interactive phases.
- **Consequences**: Dead code for built-in workflows, but essential infrastructure for extensibility.

### ADR-005: Build workflow replaces feature and fix workflows
- **Status**: Accepted
- **Context**: Feature workflow covered phases 00-08, fix workflow covered 01-08 with tracing. With analyze handling early phases, only implementation phases remain.
- **Decision**: Define a single build workflow in workflows.json with phases 05 -> 06 -> 16 -> 08. Remove feature, feature-light, and fix workflow definitions.
- **Rationale**: Analyze handles classification and early phases. Build is the common execution path for both bugs and features.
- **Consequences**: workflows.json simplified. Custom workflows unaffected. test-run, test-generate, upgrade workflows unchanged.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| Skill markdown files | N/A | Thin wrappers for /add /analyze /build (Claude Code) | Hardcoded aliases in settings.json — rejected, less flexible |
| Codex projections | N/A | Equivalent entry points for Codex provider | Shared skill files — rejected, providers have different formats |

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| INT-01 | /add skill | isdlc.md add handler | Skill delegation | ARGUMENTS string | Skill displays error |
| INT-02 | /analyze skill | isdlc.md analyze handler | Skill delegation | ARGUMENTS string | Skill displays error |
| INT-03 | /build skill | isdlc.md build handler | Skill delegation | ARGUMENTS string | Skill displays error |
| INT-04 | Build handler | Artifact folder | File read (prefix) | Folder name string | Default to feature/ |
| INT-05 | Build handler | tasks.md | BUILD-INIT COPY (GH-212) | File copy | Retry 3x, fallback to 3e-plan |
| INT-06 | Phase-Loop Controller | Phase agents | TASK_CONTEXT INJECTION (GH-212) | Formatted string | Fail-open |

### Data Flow

```
User command -> Skill wrapper -> isdlc.md handler -> (analyze: inline roundtable | build: Phase-Loop Controller) -> Phase agents
```

### Hooks Impact

| Hook | Change | Risk |
|------|--------|------|
| gate-blocker.cjs | Remove fix/feature workflow overrides | Low — overrides are keyed by workflow type string |
| state-write-validator.cjs | Add "build" to allowed workflow types | Low — simple string addition |
| phase-sequence-guard.cjs | Verify no hardcoded fix/feature refs | Low — reads from workflows.json dynamically |
| branch-guard.cjs | Verify bugfix/ branches accepted for build workflow | Medium — may have pattern matching |
| common.cjs | Search for fix/feature string literals | Low — utility functions |

## 5. Summary

| Metric | Value |
|--------|-------|
| Files modified | ~15 |
| Files created | ~6 (3 Claude skills + 3 Codex projections) |
| Files removed | 0 (content removed from existing files) |
| Workflow definitions removed | 3 (feature, feature-light, fix) |
| Workflow definitions added | 1 (build) |
| Risk level | Medium — broad but shallow changes |
