# ADR-0001: Extend Existing DEBATE_ROUTING Table for Phase 04

## Status

Accepted

## Context

The orchestrator's Section 7.5 ("DEBATE LOOP ORCHESTRATION (Multi-Phase)") already contains a generalized DEBATE_ROUTING table with entries for Phase 01 (requirements) and Phase 03 (architecture). REQ-0016 requires adding Phase 04 (design) debate support. We must decide whether to use the existing routing mechanism or introduce a new one.

**Requirements driving this decision:**
- FR-003 (AC-003-01): DEBATE_ROUTING must include Phase 04 entry
- FR-003 (AC-003-04): Same convergence logic (zero BLOCKING = converged, max 3 rounds)
- NFR-002: Pattern consistency -- identical structure to Phase 01 and Phase 03

## Decision

**Add one row** to the existing DEBATE_ROUTING table. No changes to the debate loop pseudocode, convergence logic, or state management.

The new row:

```
| 04-design | 03-system-designer.md | 03-design-critic.md | 03-design-refiner.md | interface-spec.yaml, module-designs/, error-taxonomy.md, validation-rules.json | interface-spec.yaml |
```

## Consequences

**Positive:**
- Zero changes to debate engine logic -- validates REQ-0015's extensibility claim
- Adding a routing row is the simplest possible change (~3 lines)
- All existing debate behavior (Phase 01, Phase 03) is completely unaffected
- Follows Article V (Simplicity First): no new mechanisms when existing ones suffice

**Negative:**
- Phase 04's artifacts are structurally different from Phase 01/03 (directory `module-designs/` vs. individual files). The routing table's `artifacts` list includes a directory path, which the debate engine handles generically.

## Alternatives Considered

### Alternative A: New Debate Mechanism for Structured Artifacts

Create a specialized debate handler for phases with structured artifacts (YAML, JSON) that validates schema compliance in addition to content quality.

**Rejected because:**
- Over-engineering for current needs -- the Critic agent handles schema validation as part of its domain-specific checks
- Violates Article V (adding mechanism not immediately needed)
- Would require runtime code, violating the "prompt-engineering only" constraint

### Alternative B: Separate Orchestrator Section

Add a Section 7.6 specifically for Phase 04 debate, with custom convergence logic for design artifacts.

**Rejected because:**
- The generalized debate engine was specifically designed (REQ-0015, ADR-0001) to avoid per-phase sections
- All three debate-enabled phases use identical convergence logic
- Violates DRY principle
