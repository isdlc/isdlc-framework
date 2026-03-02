# ADR-0004: Artifact Naming Convention

## Status

Accepted

## Context

Debate artifacts (critique reports, debate summary) need a naming convention that works across phases. Phase 01 established `round-N-critique.md` and `debate-summary.md` in REQ-0014. Phase 03 must decide whether to use the same names, add phase prefixes, or use a different scheme.

**Requirements driving this decision:**
- FR-006 (AC-006-01): Critique saved as `round-{N}-critique.md`
- FR-006 (AC-006-02): Summary saved as `debate-summary.md`
- FR-006 (AC-006-03): Summary includes architecture-specific metrics
- NFR-002: Pattern consistency with REQ-0014

## Decision

Use **phase-agnostic naming** for debate artifacts. Both Phase 01 and Phase 03 use the same artifact names:

- `round-{N}-critique.md` -- Critic's findings for round N
- `debate-summary.md` -- Post-convergence summary

**Phase-specific content** is inside the files, not in the filenames:

- Phase 01 debate-summary.md contains requirements-specific metrics (FR count, AC count)
- Phase 03 debate-summary.md contains architecture-specific metrics (ADR count, threat coverage %, NFR alignment score)

**No collision risk:** Debate artifacts are stored in the feature's artifact folder (`docs/requirements/REQ-NNNN-{name}/`). Each phase runs debate within one workflow, and debate artifacts are produced during that phase's execution. Phase 01 and Phase 03 debate artifacts coexist in the same folder without collision because:

1. Debate runs for Phase 01 first, producing `round-{N}-critique.md` and `debate-summary.md`
2. When Phase 03 debate runs later, it overwrites these files with Phase 03 content

**If both phases' debate history must be preserved:** The debate-summary.md for each phase can be renamed during post-loop finalization (e.g., `debate-summary-phase01.md`, `debate-summary-phase03.md`). This is a future enhancement, not required by current requirements.

## Consequences

**Positive:**
- Consistent naming across phases (NFR-002)
- Simple file management -- no phase prefix parsing needed
- Debate-summary.md is self-describing (contains phase identifier in its header)
- Follows established pattern from REQ-0014

**Negative:**
- Phase 03 debate artifacts overwrite Phase 01 debate artifacts in the same folder. This is acceptable because the final artifacts (requirements-spec.md, architecture-overview.md) are phase-specific and do not collide. Only the debate meta-artifacts overlap.
- If audit trail of Phase 01 debate rounds is needed after Phase 03 debate runs, it would be lost. Mitigation: state.json preserves debate_state history for both phases.

## Alternatives Considered

### Alternative: Phase-Prefixed Naming

Use `phase01-round-{N}-critique.md` and `phase03-round-{N}-critique.md`.

**Rejected because:**
- Adds complexity to the naming convention without demonstrated need
- The orchestrator would need phase-aware artifact name generation
- Violates the established pattern from REQ-0014 (NFR-002)
- The debate loop is generic -- making artifact names phase-specific couples the naming to phases
