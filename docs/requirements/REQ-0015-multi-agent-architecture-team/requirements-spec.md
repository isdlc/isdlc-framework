# Requirements Specification: Multi-agent Architecture Team

**REQ ID:** REQ-0015
**Feature:** Multi-agent Architecture Team -- Creator/Critic/Refiner debate loop for Phase 03 architecture design
**Backlog Item:** 4.1 Phase 03
**Created:** 2026-02-14
**Status:** Draft

## Problem Statement

Phase 03 (Architecture) currently uses a single agent (solution-architect) to produce all architecture artifacts. The Creator/Critic/Refiner debate loop pattern, established in REQ-0014 for Phase 01 (Requirements), improves artifact quality through structured multi-perspective review. This feature extends that same pattern to Phase 03 to catch NFR misalignment, incomplete threat models, database design flaws, weak tech stack justification, single points of failure, and missing observability before downstream phases consume the architecture.

## Personas

- **P-001: Framework Developer** -- Developer using iSDLC to build software. Wants architecture artifacts that are thorough and have been stress-tested by multiple perspectives before implementation begins.
- **P-002: Orchestrator Agent** -- The SDLC Orchestrator that manages the debate loop. Needs a consistent, generalizable debate protocol that works across phases.

## Functional Requirements

### FR-001: Architecture Critic Agent

Given the debate loop is active for Phase 03,
When the orchestrator delegates to the architecture critic after the Creator (solution-architect) produces artifacts,
Then the critic MUST review all Phase 03 artifacts and produce a structured critique report with BLOCKING and WARNING findings.

**Acceptance Criteria:**

- AC-001-01: Given a round-N set of architecture artifacts (architecture-overview.md, tech-stack-decision.md, database-design.md, security-architecture.md, ADRs), When the architecture critic reviews them, Then it MUST check for NFR misalignment between requirements and architecture decisions.
- AC-001-02: Given architecture artifacts with a security-architecture.md, When the critic reviews the STRIDE threat model, Then it MUST flag incomplete threat models as BLOCKING (missing threat categories, no mitigations for identified threats).
- AC-001-03: Given a database-design.md, When the critic reviews the database design, Then it MUST check for missing indexes on foreign keys, absent migration strategy, no backup/recovery plan, and normalization issues.
- AC-001-04: Given a tech-stack-decision.md, When the critic reviews the technology selections, Then it MUST flag weak justifications (missing evaluation criteria, no alternatives considered, no cost analysis).
- AC-001-05: Given architecture artifacts, When the critic reviews for reliability, Then it MUST identify single points of failure with no redundancy or failover strategy.
- AC-001-06: Given architecture artifacts, When the critic reviews for observability, Then it MUST flag missing monitoring, logging, alerting, or tracing architecture as WARNING or BLOCKING depending on NFR requirements.
- AC-001-07: Given architecture artifacts, When the critic reviews for consistency, Then it MUST flag coupling contradictions (e.g., claiming "loosely coupled microservices" while showing synchronous cross-service calls without fallback).
- AC-001-08: Given architecture artifacts, When the critic reviews cost implications, Then it MUST flag unaddressed cost implications (e.g., serverless at high scale without cost projections).

### FR-002: Architecture Refiner Agent

Given the debate loop is active and the critic has produced findings,
When the orchestrator delegates to the architecture refiner,
Then the refiner MUST address all BLOCKING findings and produce improved architecture artifacts.

**Acceptance Criteria:**

- AC-002-01: Given BLOCKING findings about incomplete ADRs, When the refiner addresses them, Then it MUST produce complete ADRs with trade-off analysis, alternatives considered, and decision rationale.
- AC-002-02: Given BLOCKING findings about security gaps, When the refiner addresses them, Then it MUST add security hardening (specific mitigations for each identified threat, encryption strategy, access control).
- AC-002-03: Given BLOCKING findings about single points of failure, When the refiner addresses them, Then it MUST add high-availability adjustments (redundancy, failover, graceful degradation).
- AC-002-04: Given BLOCKING findings about cost implications, When the refiner addresses them, Then it MUST add cost optimization recommendations with projected costs.
- AC-002-05: Given BLOCKING findings about missing observability, When the refiner addresses them, Then it MUST add observability architecture (monitoring endpoints, log aggregation, alerting thresholds, distributed tracing).
- AC-002-06: Given WARNING findings, When the refiner processes them, Then it SHOULD address straightforward fixes and mark complex ones with [NEEDS CLARIFICATION].
- AC-002-07: Given all refiner output, When producing updated artifacts, Then it MUST NOT remove existing architectural decisions -- only modify, add, or clarify.
- AC-002-08: Given all refiner output, When producing updated artifacts, Then it MUST append a changes section documenting every finding addressed with finding ID, action taken, and target artifact.

### FR-003: Orchestrator Debate Loop Extension for Phase 03

Given the orchestrator currently supports debate mode for Phase 01 only,
When this feature is complete,
Then the debate loop MUST also support Phase 03 with the same resolution logic.

**Acceptance Criteria:**

- AC-003-01: Given the debate mode resolution logic in the orchestrator, When resolving debate mode for Phase 03, Then it MUST use the same flag precedence as Phase 01 (--no-debate > --debate > -light=false > sizing-based default).
- AC-003-02: Given debate mode is active for Phase 03, When the orchestrator runs the debate loop, Then it MUST follow the same Creator-Critic-Refiner pattern: Creator produces artifacts, Critic reviews, Refiner improves, loop until convergence or max rounds.
- AC-003-03: Given debate mode for Phase 03, When the critic produces findings, Then the convergence condition MUST be zero BLOCKING findings (same as Phase 01).
- AC-003-04: Given debate mode for Phase 03, When running the debate loop, Then the maximum rounds MUST be 3 (same as Phase 01).
- AC-003-05: Given the section header in the orchestrator currently reads "Phase 01 Only", When this feature is complete, Then the debate loop section MUST be generalized to support both Phase 01 and Phase 03 with phase-specific agent routing.

### FR-004: Creator Role Awareness for Solution Architect

Given the solution-architect agent currently has no awareness of the debate loop,
When this feature is complete,
Then the solution-architect MUST recognize the Creator role context and produce artifacts optimized for subsequent critique.

**Acceptance Criteria:**

- AC-004-01: Given a DEBATE_CONTEXT with mode=creator in the Task prompt, When the solution-architect produces artifacts, Then it MUST include a self-assessment section in architecture-overview.md noting known trade-offs, areas of uncertainty, and open questions.
- AC-004-02: Given no DEBATE_CONTEXT in the Task prompt, When the solution-architect produces artifacts, Then it MUST behave exactly as it does today (no regression).

### FR-005: Phase-Specific Agent Routing in Debate Loop

Given the debate loop is generalized for multiple phases,
When the orchestrator needs to delegate to Critic or Refiner agents,
Then it MUST route to the correct phase-specific agent based on the current phase.

**Acceptance Criteria:**

- AC-005-01: Given current_phase is "01-requirements" and debate mode is active, When delegating to the Critic, Then the orchestrator MUST delegate to `01-requirements-critic.md`.
- AC-005-02: Given current_phase is "03-architecture" and debate mode is active, When delegating to the Critic, Then the orchestrator MUST delegate to `02-architecture-critic.md`.
- AC-005-03: Given current_phase is "01-requirements" and debate mode is active, When delegating to the Refiner, Then the orchestrator MUST delegate to `01-requirements-refiner.md`.
- AC-005-04: Given current_phase is "03-architecture" and debate mode is active, When delegating to the Refiner, Then the orchestrator MUST delegate to `02-architecture-refiner.md`.

### FR-006: Debate Artifacts for Phase 03

Given the debate loop runs for Phase 03,
When debate rounds produce artifacts,
Then they MUST be stored in the correct location with Phase 03-specific naming.

**Acceptance Criteria:**

- AC-006-01: Given a debate round N for Phase 03, When the critic produces a critique, Then it MUST be saved as `round-{N}-critique.md` in the artifact folder.
- AC-006-02: Given a completed debate loop for Phase 03, When generating the summary, Then it MUST be saved as `debate-summary.md` in the artifact folder.
- AC-006-03: Given a completed debate loop for Phase 03, When the debate summary includes architecture-specific metrics, Then it MUST include ADR count, threat coverage percentage, and NFR alignment score.

### FR-007: Edge Case Handling for Architecture Debate

Given the debate loop operates on architecture artifacts,
When edge cases arise specific to Phase 03,
Then they MUST be handled correctly.

**Acceptance Criteria:**

- AC-007-01: Given the Creator (solution-architect) fails to produce all required artifacts, When the orchestrator detects missing artifacts, Then it MUST attempt debate with available artifacts and only abort if architecture-overview.md is missing.
- AC-007-02: Given the Critic produces a malformed critique, When the orchestrator cannot parse the BLOCKING count, Then it MUST treat as 0 BLOCKING (fail-open per Article X) and log a warning.
- AC-007-03: Given the debate does not converge after max rounds, When the orchestrator generates the debate summary, Then it MUST append a warning to architecture-overview.md noting the unconverged state and remaining BLOCKING findings.

## Non-Functional Requirements

### NFR-001: Debate Round Performance

Given a debate round for Phase 03,
When measuring execution time,
Then each Critic review MUST complete within 5 minutes and each Refiner pass MUST complete within 5 minutes.

### NFR-002: Pattern Consistency

Given the debate loop pattern from REQ-0014 (Phase 01),
When implementing the Phase 03 extension,
Then the agent file structure, critique report format, refiner change log format, and convergence logic MUST be identical in structure to Phase 01 (only domain-specific content differs).

### NFR-003: Backward Compatibility

Given existing workflows that do not use debate mode,
When this feature is deployed,
Then all existing Phase 03 behavior MUST be preserved when debate mode is off (--no-debate or light sizing).

### NFR-004: Constitutional Compliance

Given the iSDLC constitution (16 articles),
When the architecture critic and refiner operate,
Then they MUST validate applicable articles (III, IV, V, VII, IX, X) and flag violations as BLOCKING findings.

## Traceability

| Requirement | Backlog Item | User Story |
|-------------|-------------|------------|
| FR-001 | 4.1 Phase 03 | US-001 |
| FR-002 | 4.1 Phase 03 | US-002 |
| FR-003 | 4.1 Phase 03 | US-003 |
| FR-004 | 4.1 Phase 03 | US-004 |
| FR-005 | 4.1 Phase 03 | US-003 |
| FR-006 | 4.1 Phase 03 | US-005 |
| FR-007 | 4.1 Phase 03 | US-006 |
