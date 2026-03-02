# ADR-0004: Agent Naming for Implementation Team

## Status

Accepted

## Context

Two new agents are needed for the implementation team: a Reviewer and an Updater. The existing agent naming convention uses `{NN}-{role-name}.md` where NN is a number prefix that groups agents by phase responsibility.

The existing Phase 06 agent is `05-software-developer.md` (prefix 05). The debate team agents for Phases 01/03/04 use the same prefix as their phase's primary agent:
- Phase 01: `01-requirements-analyst.md`, `01-requirements-critic.md`, `01-requirements-refiner.md`
- Phase 03: `02-solution-architect.md`, `02-architecture-critic.md`, `02-architecture-refiner.md`
- Phase 04: `03-system-designer.md`, `03-design-critic.md`, `03-design-refiner.md`

## Decision

Name the new agents with prefix `05` to match the Phase 06 software-developer agent:
- `05-implementation-reviewer.md` (Reviewer role)
- `05-implementation-updater.md` (Updater role)

Use "implementation" as the domain prefix (not "code" or "software") to clearly distinguish from the existing Creator/Critic/Refiner naming pattern.

## Consequences

**Positive:**
- Consistent with established pattern: prefix matches the phase's primary agent number
- Clear role distinction: "reviewer" and "updater" are distinct from "critic" and "refiner" (which are Creator/Critic/Refiner debate roles)
- Alphabetically groups all Phase 06 agents together when sorted by filename
- NFR-003 compliance: follows `{NN}-{role}.md` pattern

**Negative:**
- Prefix `05` maps to Phase 06 in the orchestrator's delegation table, which is a known naming inconsistency in the codebase (agent numbering and phase numbering are offset by 1). This is pre-existing debt, not introduced by this feature.

## Alternatives Considered

**1. Use prefix `06` to match the phase key `06-implementation`:**
Rejected -- breaks the established pattern. `05-software-developer.md` is the Phase 06 agent, so companion agents should share the `05` prefix.

**2. Use prefix `05` with "code-reviewer" and "code-updater" names:**
Rejected -- "code-reviewer" could be confused with the qa-engineer (Phase 08 code review). "implementation-reviewer" is more specific to the per-file loop context.

**3. Use prefix `05` with "debate-reviewer" and "debate-updater" names:**
Rejected -- this is NOT a debate (Creator/Critic/Refiner) pattern. Using "debate" would create confusion with the existing debate infrastructure. The implementation team uses Writer/Reviewer/Updater roles, which are intentionally distinct.

## Test File Naming

Following NFR-003, test files use the pattern `implementation-debate-{role}.test.cjs`:
- `implementation-debate-reviewer.test.cjs`
- `implementation-debate-updater.test.cjs`
- `implementation-debate-orchestrator.test.cjs`
- `implementation-debate-writer.test.cjs`
- `implementation-debate-integration.test.cjs`

Note: the "debate" prefix in test file names is for grouping consistency with the existing debate test files (e.g., `debate-orchestrator-loop.test.cjs`), not because this is a debate pattern.

## Requirement Traces

- NFR-003: "Agent file naming MUST follow the established pattern: `{NN}-{role}.md`"
- NFR-003: "Test file naming MUST follow the pattern: `implementation-debate-{role}.test.cjs`"
- AC-006-01: Maps Writer to 05-software-developer.md, Reviewer to 05-implementation-reviewer.md, Updater to 05-implementation-updater.md
