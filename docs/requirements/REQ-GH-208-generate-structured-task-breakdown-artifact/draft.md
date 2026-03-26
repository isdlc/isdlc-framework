# Generate structured task breakdown artifact from analysis before build

**Source**: GitHub Issue #208
**Type**: Enhancement (hackability)

## Problem

After analysis completes (requirements, architecture, design accepted), there is no structured task breakdown artifact that maps the work into ordered, file-path-specific implementation tasks. Phase agents plan their own work internally but this is ephemeral (in-context, not persisted).

The plan-surfacer hook (`src/claude/hooks/plan-surfacer.cjs`) already checks for `docs/isdlc/tasks.md` before allowing delegation to implementation phases — but nothing in the analyze or pre-build workflow generates this file.

## Expected Behavior

After analysis acceptance (all three domains confirmed), generate a `tasks.md` artifact in the requirement folder that includes:

- Tasks organized by implementation phase (setup → foundational → feature work → polish)
- Each task with: ID, description, exact file path(s), user story/FR mapping
- Dependency ordering between tasks
- Parallelism markers for tasks that can run concurrently
- MVP-first implementation strategy

This artifact becomes the contract between analysis and build — the software developer agent reads it and executes tasks in order.

## Inspiration

spec-kit's `/speckit.tasks` phase produces a structured `tasks.md` with format:
```
- [ ] T001 [P] [US1] Description with exact file path
```
Organized into phases: Setup → Foundational → User Story phases → Polish, with dependency sections and parallel execution markers.

## Scope

- Add a task breakdown step after design acceptance in the analyze workflow (or as a separate pre-build step)
- Read requirements-spec.md, architecture-overview.md, and module-design.md to derive tasks
- Generate `tasks.md` in the requirement artifact folder
- Wire plan-surfacer hook to validate the generated tasks.md format
- Software developer agent should consume tasks.md for implementation ordering
