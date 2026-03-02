# ADR-0004: Critical Artifact Selection for Phase 04 Debate

## Status

Accepted

## Context

The DEBATE_ROUTING table requires a `critical_artifact` for each phase -- the artifact that must exist for the debate loop to proceed. If the Creator fails to produce this artifact, the debate is aborted and falls back to single-agent mode (AC-007-01).

Phase 01 uses `requirements-spec.md`. Phase 03 uses `architecture-overview.md`.

**Requirements driving this decision:**
- AC-003-03: Critical Artifact MUST be "interface-spec.yaml" (or "openapi.yaml" if REST)
- AC-007-01: Debate aborts only if critical artifact is missing; partial artifacts proceed

## Decision

Use **`interface-spec.yaml`** as the critical artifact for Phase 04. The orchestrator checks for this file after Creator delegation. If the project uses REST APIs, the Creator may produce `openapi.yaml` instead -- both names are acceptable. The Critic adapts to whichever exists.

**Rationale:** The interface specification is the foundational Phase 04 artifact. Module designs, error taxonomy, and validation rules are all derived from or constrained by the interface specification. Without it, the Critic cannot perform meaningful checks on DC-01 (incomplete API specs) or DC-05 (missing idempotency).

## Consequences

**Positive:**
- Clear abort criterion: debate proceeds only when the core design artifact exists
- Allows partial debate when secondary artifacts (module-designs/, error-taxonomy.md, validation-rules.json) are missing
- The Critic can still provide valuable feedback on the interface spec alone

**Negative:**
- Two possible file names (`interface-spec.yaml` and `openapi.yaml`) require the orchestrator to check both. This is a minor implementation detail handled by the Creator or detected by the Critic.

## Alternatives Considered

### Alternative A: Use `module-designs/` Directory as Critical Artifact

Require the module-designs directory to exist.

**Rejected because:**
- A directory can exist but be empty
- Module designs are derived from the interface spec, not vice versa
- The interface spec is the primary contract artifact

### Alternative B: Require All Four Artifacts

Only proceed if all four Phase 04 artifacts exist.

**Rejected because:**
- Too strict -- partial debate is valuable (AC-007-01 explicitly allows partial artifacts)
- The Critic can still identify gaps in missing artifacts by noting their absence
- The Refiner can create missing artifacts as part of addressing findings

### Alternative C: Use `error-taxonomy.md` as Critical Artifact

**Rejected because:**
- Error taxonomy is a supporting artifact, not the core design contract
- Interface spec is the primary input to downstream phases (test strategy, implementation)
