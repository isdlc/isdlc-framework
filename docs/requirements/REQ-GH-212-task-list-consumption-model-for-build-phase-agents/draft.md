# Task list consumption model for build phase agents (05/06/16/08)

**Source**: GitHub Issue #212
**Depends on**: #208 (REQ-GH-208 — task breakdown generation)

## Context

After REQ-GH-208 generates a structured tasks.md during analysis, the build phase agents need to consume it.

Currently scoped out of #208 (see Out of Scope table):
> "How Phase 05/06/16/08 consume the task list — Separate concern — consumption model is a different feature"

## Scope

- Phase 05 (Test Strategy): read tasks.md to generate test cases per task
- Phase 06 (Implementation): read tasks.md to execute tasks in dependency order
- Phase 16 (Quality Loop): read tasks.md to verify task completion
- Phase 08 (Code Review): read tasks.md to review per task unit
- Phase-loop controller: task progress display (counter/expanded/phase-only from FR-007 of #208)
