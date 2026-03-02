# ADR-0003: Design-Specific Critique Taxonomy (8 Categories)

## Status

Accepted

## Context

The Design Critic must review Phase 04 artifacts (interface-spec.yaml/openapi.yaml, module-designs/, error-taxonomy.md, validation-rules.json). We must decide the critique taxonomy -- the set of mandatory check categories.

Phase 01 Requirements Critic uses 5 mandatory checks + 7 discretionary checks.
Phase 03 Architecture Critic uses 8 mandatory checks.

**Requirements driving this decision:**
- FR-001 (AC-001-01 through AC-001-08): 8 specific check categories defined in requirements
- FR-006 (AC-006-01 through AC-006-05): 5 constitutional compliance checks
- NFR-002: Pattern consistency -- check categories must follow same BLOCKING/WARNING severity model

## Decision

Use **8 mandatory check categories** (DC-01 through DC-08) plus **5 constitutional compliance checks**, directly derived from the acceptance criteria in FR-001 and FR-006. All 8 checks produce BLOCKING findings when they fail.

| Check ID | Category | Source AC |
|----------|----------|-----------|
| DC-01 | Incomplete API Specifications | AC-001-01 |
| DC-02 | Inconsistent Patterns Across Modules | AC-001-02 |
| DC-03 | Module Overlap and Responsibility Bleed | AC-001-03 |
| DC-04 | Validation Gaps | AC-001-04 |
| DC-05 | Missing Idempotency | AC-001-05 |
| DC-06 | Accessibility Issues | AC-001-06 |
| DC-07 | Error Taxonomy Holes | AC-001-07 |
| DC-08 | Data Flow Bottlenecks | AC-001-08 |

**Domain Adaptation Note:** These 8 categories are domain-specific to design artifacts. They differ significantly from the architecture critic's 8 categories (NFR alignment, STRIDE, database design, tech stack justification, SPOF, observability, coupling, cost). This is intentional -- each phase's critique taxonomy reflects its domain expertise, not a copy of another phase.

**Non-REST Adaptation (AC-007-04):** When the project does not use REST APIs, the Critic adapts checks:
- DC-01 adapts to CLI flags, library function signatures, or event schemas
- DC-05 adapts to command idempotency or event delivery guarantees
- DC-06 is skipped entirely for non-UI projects

## Consequences

**Positive:**
- Direct 1:1 mapping from acceptance criteria to check categories ensures complete requirement coverage
- 8 categories match the architecture critic's count (structural consistency per NFR-002)
- BLOCKING/WARNING severity model is identical to Phase 01/03 critics
- Non-REST adaptation ensures the Critic is useful for all project types

**Negative:**
- 8 checks may produce a high number of findings on first round, requiring more Refiner effort
- DC-06 (Accessibility) may not be testable for all project types -- mitigated by the non-REST adaptation clause

## Alternatives Considered

### Alternative A: Copy Architecture Critic's 8 Categories

Use the same categories as `02-architecture-critic.md` (NFR alignment, STRIDE, database, tech stack, SPOF, observability, coupling, cost).

**Rejected because:**
- Architecture checks are not relevant to design artifacts (no STRIDE model in design phase, no tech stack justification)
- FR-001 explicitly defines 8 design-specific categories
- Would miss critical design concerns (validation gaps, idempotency, accessibility)

### Alternative B: Fewer Categories (5 Mandatory + Discretionary)

Follow the Phase 01 pattern: 5 mandatory checks + discretionary checks.

**Rejected because:**
- FR-001 explicitly defines 8 mandatory check categories, each with its own AC
- Reducing to 5 would leave 3 ACs unimplemented
- All 8 categories represent genuine BLOCKING concerns for design quality

### Alternative C: More Categories (12+)

Add additional categories for performance testing hints, security hardening details, deployment considerations.

**Rejected because:**
- Those concerns belong to other phases (Phase 05 test strategy, Phase 03 security architecture)
- Would cause scope creep beyond FR-001
- Violates Article V (Simplicity First)
