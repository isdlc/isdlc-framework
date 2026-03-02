# Requirements Specification: Multi-agent Design Team

**REQ ID:** REQ-0016
**Feature:** Multi-agent Design Team -- Creator/Critic/Refiner debate loop for Phase 04 design specifications
**Backlog Item:** 4.1 Phase 04
**Created:** 2026-02-15
**Status:** Draft

## Problem Statement

Phase 04 (Design & Specifications) currently uses a single agent (system-designer) to produce all design artifacts: interface-spec.yaml/openapi.yaml, module-designs/, wireframes/, error-taxonomy.md, and validation-rules.json. The Creator/Critic/Refiner debate loop pattern, established in REQ-0014 for Phase 01 (Requirements) and extended in REQ-0015 for Phase 03 (Architecture), improves artifact quality through structured multi-perspective review. This feature extends that same pattern to Phase 04 to catch incomplete API specs, inconsistent patterns across modules, module overlap, validation gaps, missing idempotency, accessibility issues, error taxonomy holes, and data flow bottlenecks before implementation begins.

## Personas

- **P-001: Framework Developer** -- Developer using iSDLC to build software. Wants design specifications that are thorough, internally consistent, and have been stress-tested by multiple perspectives before implementation begins.
- **P-002: Orchestrator Agent** -- The SDLC Orchestrator that manages the debate loop. Needs Phase 04 added to the existing DEBATE_ROUTING table with the same protocol used for Phase 01 and Phase 03.

## Functional Requirements

### FR-001: Design Critic Agent

Given the debate loop is active for Phase 04,
When the orchestrator delegates to the design critic after the Creator (system-designer) produces artifacts,
Then the critic MUST review all Phase 04 artifacts and produce a structured critique report with BLOCKING and WARNING findings.

**Acceptance Criteria:**

- AC-001-01: Given a round-N set of design artifacts (interface-spec.yaml or openapi.yaml, module-designs/, error-taxonomy.md, validation-rules.json), When the design critic reviews them, Then it MUST check for incomplete API specifications (missing request/response schemas, missing error responses, undocumented query parameters).
- AC-001-02: Given module-designs/ containing multiple module design documents, When the design critic reviews them, Then it MUST check for inconsistent patterns across modules (naming conventions, error handling approaches, response shapes, authentication patterns).
- AC-001-03: Given module-designs/ containing multiple module design documents, When the design critic reviews them, Then it MUST check for module overlap and responsibility bleed (two modules handling the same concern, unclear ownership boundaries).
- AC-001-04: Given validation-rules.json, When the design critic reviews the validation rules, Then it MUST check for validation gaps (boundary fields without min/max, string fields without length limits, enum fields without exhaustive values, missing cross-field validation).
- AC-001-05: Given design artifacts for state-changing operations, When the design critic reviews for idempotency, Then it MUST flag state-changing endpoints/operations without idempotency keys or retry-safe semantics.
- AC-001-06: Given wireframes or UI design artifacts, When the design critic reviews for accessibility, Then it MUST check for accessibility issues (missing ARIA labels, insufficient contrast ratios, keyboard navigation gaps, missing focus indicators).
- AC-001-07: Given error-taxonomy.md, When the design critic reviews the error taxonomy, Then it MUST check for error taxonomy holes (missing error codes for known failure modes, inconsistent HTTP status code usage, missing user-facing error messages, no retry guidance).
- AC-001-08: Given data flow diagrams or module interaction designs, When the design critic reviews data flows, Then it MUST check for data flow bottlenecks (synchronous calls in critical paths, missing caching strategy, N+1 query patterns, missing pagination).

### FR-002: Design Refiner Agent

Given the debate loop is active and the critic has produced findings,
When the orchestrator delegates to the design refiner,
Then the refiner MUST address all BLOCKING findings and produce improved design artifacts.

**Acceptance Criteria:**

- AC-002-01: Given BLOCKING findings about incomplete API specs, When the refiner addresses them, Then it MUST produce OpenAPI 3.x contracts with complete request/response schemas, all error responses documented, and query parameters fully specified.
- AC-002-02: Given BLOCKING findings about inconsistent module patterns, When the refiner addresses them, Then it MUST unify patterns across modules (consistent naming, error handling, response shapes, auth patterns).
- AC-002-03: Given BLOCKING findings about module overlap, When the refiner addresses them, Then it MUST clarify module boundaries with explicit responsibility declarations and dependency direction.
- AC-002-04: Given BLOCKING findings about validation gaps, When the refiner addresses them, Then it MUST produce validation rules at every boundary with min/max, length limits, enum exhaustiveness, and cross-field validation.
- AC-002-05: Given BLOCKING findings about missing idempotency, When the refiner addresses them, Then it MUST add idempotency keys for all state-changing operations and document retry-safe semantics.
- AC-002-06: Given BLOCKING findings about error taxonomy holes, When the refiner addresses them, Then it MUST produce a unified error taxonomy with complete error codes, consistent HTTP status mapping, user-facing messages, and retry guidance.
- AC-002-07: Given WARNING findings, When the refiner processes them, Then it SHOULD address straightforward fixes and mark complex ones with [NEEDS CLARIFICATION].
- AC-002-08: Given all refiner output, When producing updated artifacts, Then it MUST NOT remove existing design decisions -- only modify, add, or clarify.
- AC-002-09: Given all refiner output, When producing updated artifacts, Then it MUST append a changes section documenting every finding addressed with finding ID, action taken, and target artifact.

### FR-003: Orchestrator DEBATE_ROUTING Extension for Phase 04

Given the orchestrator DEBATE_ROUTING table currently has entries for Phase 01 (01-requirements) and Phase 03 (03-architecture),
When this feature is complete,
Then the table MUST also include Phase 04 (04-design) with the correct agent routing.

**Acceptance Criteria:**

- AC-003-01: Given the DEBATE_ROUTING table in 00-sdlc-orchestrator.md, When this feature is complete, Then a new row MUST exist mapping Phase Key "04-design" to Creator "03-system-designer.md", Critic "03-design-critic.md", Refiner "03-design-refiner.md".
- AC-003-02: Given the Phase 04 DEBATE_ROUTING entry, When specifying Phase Artifacts, Then they MUST list: interface-spec.yaml (or openapi.yaml), module-designs/, error-taxonomy.md, validation-rules.json.
- AC-003-03: Given the Phase 04 DEBATE_ROUTING entry, When specifying the Critical Artifact, Then it MUST be "interface-spec.yaml" (or "openapi.yaml" if the project uses REST APIs).
- AC-003-04: Given debate mode is active for Phase 04, When the orchestrator runs the debate loop, Then it MUST follow the same Creator-Critic-Refiner pattern with the same convergence logic (zero BLOCKING = converged, max 3 rounds).

### FR-004: Creator Role Awareness for System Designer

Given the system-designer agent currently has no awareness of the debate loop,
When this feature is complete,
Then the system-designer MUST recognize the Creator role context and produce artifacts optimized for subsequent critique.

**Acceptance Criteria:**

- AC-004-01: Given a DEBATE_CONTEXT with mode=creator in the Task prompt, When the system-designer produces artifacts, Then it MUST include a self-assessment section in the primary design artifact noting known trade-offs, areas of uncertainty, and open questions.
- AC-004-02: Given no DEBATE_CONTEXT in the Task prompt, When the system-designer produces artifacts, Then it MUST behave exactly as it does today (no regression).

### FR-005: Debate Artifacts for Phase 04

Given the debate loop runs for Phase 04,
When debate rounds produce artifacts,
Then they MUST be stored in the correct location with Phase 04-specific naming and content.

**Acceptance Criteria:**

- AC-005-01: Given a debate round N for Phase 04, When the critic produces a critique, Then it MUST be saved as `round-{N}-critique.md` in the artifact folder.
- AC-005-02: Given a completed debate loop for Phase 04, When generating the summary, Then it MUST be saved as `debate-summary.md` in the artifact folder.
- AC-005-03: Given a completed debate loop for Phase 04, When the debate summary includes design-specific metrics, Then it MUST include: API endpoint count, validation rule count, error code count, module count, and pattern consistency score.

### FR-006: Design Critic Constitutional Compliance Checks

Given the design critic operates during Phase 04,
When reviewing design artifacts,
Then it MUST validate applicable constitutional articles.

**Acceptance Criteria:**

- AC-006-01: Given design artifacts, When the design critic checks constitutional compliance, Then it MUST validate Article I (Specification Primacy -- designs must be traceable to requirements).
- AC-006-02: Given design artifacts, When the design critic checks constitutional compliance, Then it MUST validate Article IV (Explicit Over Implicit -- no hidden assumptions, no [UNKNOWN] markers left unresolved).
- AC-006-03: Given design artifacts, When the design critic checks constitutional compliance, Then it MUST validate Article V (Simplicity First -- designs should be simplest solution satisfying requirements, no over-engineering).
- AC-006-04: Given design artifacts, When the design critic checks constitutional compliance, Then it MUST validate Article VII (Artifact Traceability -- designs trace to requirements and architecture decisions).
- AC-006-05: Given design artifacts, When the design critic checks constitutional compliance, Then it MUST validate Article IX (Quality Gate Integrity -- all required Phase 04 artifacts present and complete).

### FR-007: Edge Case Handling for Design Debate

Given the debate loop operates on design artifacts,
When edge cases arise specific to Phase 04,
Then they MUST be handled correctly.

**Acceptance Criteria:**

- AC-007-01: Given the Creator (system-designer) fails to produce all required artifacts, When the orchestrator detects missing artifacts, Then it MUST attempt debate with available artifacts and only abort if the critical artifact (interface-spec.yaml or openapi.yaml) is missing.
- AC-007-02: Given the Critic produces a malformed critique, When the orchestrator cannot parse the BLOCKING count, Then it MUST treat as 0 BLOCKING (fail-open per Article X) and log a warning.
- AC-007-03: Given the debate does not converge after max rounds, When the orchestrator generates the debate summary, Then it MUST append a warning to the critical artifact noting the unconverged state and remaining BLOCKING findings.
- AC-007-04: Given the project does not use REST APIs (e.g., CLI tool, library), When Phase 04 runs with debate mode, Then the Critic MUST adapt its checks to the actual interface type (CLI flags, library API, event schema) rather than assuming REST.

## Non-Functional Requirements

### NFR-001: Debate Round Performance

Given a debate round for Phase 04,
When measuring execution time,
Then each Critic review MUST complete within 5 minutes and each Refiner pass MUST complete within 5 minutes.

### NFR-002: Pattern Consistency with REQ-0014 and REQ-0015

Given the debate loop pattern from REQ-0014 (Phase 01) and REQ-0015 (Phase 03),
When implementing the Phase 04 extension,
Then the agent file structure, critique report format, refiner change log format, and convergence logic MUST be identical in structure to Phase 01 and Phase 03 (only domain-specific content differs).

### NFR-003: Backward Compatibility

Given existing workflows that do not use debate mode,
When this feature is deployed,
Then all existing Phase 04 behavior MUST be preserved when debate mode is off (--no-debate or light sizing).

### NFR-004: Constitutional Compliance

Given the iSDLC constitution (16 articles),
When the design critic and refiner operate,
Then they MUST validate applicable Phase 04 articles (I, IV, V, VII, IX) and flag violations as BLOCKING findings.

## Traceability

| Requirement | Backlog Item | User Story |
|-------------|-------------|------------|
| FR-001 | 4.1 Phase 04 | US-001 |
| FR-002 | 4.1 Phase 04 | US-002 |
| FR-003 | 4.1 Phase 04 | US-003 |
| FR-004 | 4.1 Phase 04 | US-004 |
| FR-005 | 4.1 Phase 04 | US-005 |
| FR-006 | 4.1 Phase 04 | US-001 |
| FR-007 | 4.1 Phase 04 | US-006 |
