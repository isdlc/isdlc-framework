# Module Design: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 04-design
**Created:** 2026-02-15
**Status:** Draft
**Prior Art:** REQ-0014 (Phase 01 debate loop modules), REQ-0015 (Phase 03 debate loop modules)

---

## Overview

This document specifies the detailed module designs for all 5 components of the
multi-agent design team feature. Since this is a prompt-engineering project
(agents are .md files, tests are CJS files reading .md content), "modules" are
sections of markdown agent files, and "interfaces" are the prompt-level contracts
(DEBATE_CONTEXT blocks, artifact output formats, critique report schemas).

Each module design specifies:
- Exact section structure (headings, content blocks)
- Input/output contracts (what the agent receives, what it produces)
- Validation rules (what tests must verify in the .md content)
- Traceability to requirements

**Structural Parity Note (NFR-002):** All designs follow the exact same structure
as REQ-0015 module-design.md. The Design Critic mirrors the Architecture Critic,
the Design Refiner mirrors the Architecture Refiner, and the Creator awareness
mirrors the Solution Architect's DEBATE_CONTEXT handling. Only domain-specific
content differs.

---

## M1: Orchestrator DEBATE_ROUTING Extension

**File:** `src/claude/agents/00-sdlc-orchestrator.md`
**Section:** 7.5 DEBATE LOOP ORCHESTRATION (Multi-Phase)
**Change Type:** Minor modification (~3 lines added: 1 new table row)
**Traces:** FR-003, AC-003-01..AC-003-04

### M1.1 Routing Table Row Addition

The DEBATE_ROUTING table in Section 7.5 gains one row. No changes to the debate
loop pseudocode, convergence logic, step definitions, or state management.

**Current table (2 rows):**

```
| Phase Key | Creator Agent | Critic Agent | Refiner Agent | Phase Artifacts | Critical Artifact |
|-----------|--------------|-------------|--------------|----------------|------------------|
| 01-requirements | 01-requirements-analyst.md | 01-requirements-critic.md | 01-requirements-refiner.md | requirements-spec.md, user-stories.json, nfr-matrix.md, traceability-matrix.csv | requirements-spec.md |
| 03-architecture | 02-solution-architect.md | 02-architecture-critic.md | 02-architecture-refiner.md | architecture-overview.md, tech-stack-decision.md, database-design.md, security-architecture.md | architecture-overview.md |
```

**New table (3 rows -- add after 03-architecture row):**

```
| 04-design | 03-system-designer.md | 03-design-critic.md | 03-design-refiner.md | interface-spec.yaml, module-designs/, error-taxonomy.md, validation-rules.json | interface-spec.yaml |
```

### M1.2 No Other Changes Required

The debate loop logic (Steps 1-5), convergence check, edge cases table, and
state management are already generalized from REQ-0015. Adding a routing table
row does not require any structural changes to Section 7.5.

**Invariants preserved:**
- Step 1 (resolveDebateMode): flag precedence unchanged
- Step 2 (Conditional Delegation): routing lookup logic unchanged
- Step 3 (Creator Delegation): `routing.creator` reference unchanged
- Step 4 (Critic-Refiner Loop): `routing.critic` / `routing.refiner` references unchanged
- Step 5 (Post-Loop Finalization): `routing.critical_artifact` reference unchanged
- Edge cases table: all entries use generic `routing.*` references

### M1.3 Validation Rules for M1

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M1-V01 | Routing table contains Phase 04 entry | Contains "04-design" in routing table | AC-003-01 |
| M1-V02 | Phase 04 creator maps to system-designer | Contains "03-system-designer.md" in 04-design row | AC-003-01 |
| M1-V03 | Phase 04 critic maps to design-critic | Contains "03-design-critic.md" in 04-design row | AC-003-01 |
| M1-V04 | Phase 04 refiner maps to design-refiner | Contains "03-design-refiner.md" in 04-design row | AC-003-01 |
| M1-V05 | Phase 04 artifacts listed correctly | Contains "interface-spec.yaml" AND "module-designs/" AND "error-taxonomy.md" AND "validation-rules.json" | AC-003-02 |
| M1-V06 | Phase 04 critical artifact is interface-spec.yaml | Contains "interface-spec.yaml" as critical artifact in 04-design row | AC-003-03 |
| M1-V07 | Existing Phase 01 row unchanged | Contains "01-requirements" row with same agent names | NFR-003 |
| M1-V08 | Existing Phase 03 row unchanged | Contains "03-architecture" row with same agent names | NFR-003 |
| M1-V09 | Convergence logic unchanged (zero BLOCKING) | Contains "blocking_count == 0" in Step 4b | AC-003-04 |
| M1-V10 | Max rounds unchanged (3) | Contains "max_rounds" AND "3" | AC-003-04 |

---

## M2: Design Critic Agent

**File:** `src/claude/agents/03-design-critic.md` (NEW)
**Change Type:** New file (~170 lines)
**Traces:** FR-001, AC-001-01..AC-001-08, FR-006, AC-006-01..AC-006-05, NFR-002, NFR-004
**Template:** `src/claude/agents/02-architecture-critic.md`

### M2.1 Frontmatter

```yaml
---
name: design-critic
description: "Use this agent for reviewing Phase 04 design artifacts
  during the debate loop. This agent acts as the Critic role, reviewing
  Creator output for incomplete API specifications, inconsistent patterns,
  module overlap, validation gaps, missing idempotency, accessibility issues,
  error taxonomy holes, and data flow bottlenecks.
  Produces a structured critique report with BLOCKING and WARNING findings.

  This agent is ONLY invoked by the orchestrator during debate mode.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - DES-002  # api-contracts
  - DES-006  # error-handling
  - DES-009  # validation
---
```

**Design decisions:**
- `name: design-critic` follows the naming pattern of `architecture-critic` (NFR-002).
- `model: opus` matches all debate agents.
- `owned_skills` includes the 3 most relevant design skills. The critic
  does not own all DES skills since it only reviews, not creates.

### M2.2 Identity Section

```markdown
# DESIGN CRITIC -- REVIEW ROLE

You are the Design Critic in a multi-agent debate loop. Your role is to
review design artifacts and identify defects that would cause problems
in downstream SDLC phases (Test Strategy, Implementation, Deployment).

## IDENTITY

> "I am a meticulous design reviewer. I find specification gaps, pattern
> inconsistencies, and validation holes in designs so they are fixed now,
> not discovered during implementation or testing."
```

Mirrors the architecture-critic identity pattern (NFR-002).

### M2.3 Input Section

```markdown
## INPUT

You receive via the Task prompt:
- DEBATE_CONTEXT: { round: N }
- All Phase 04 artifacts:
  - interface-spec.yaml (or openapi.yaml for REST APIs)
  - module-designs/ (directory of per-module design files)
  - error-taxonomy.md
  - validation-rules.json
- The feature description (for scope reference)
- The requirements-spec.md (for requirement cross-reference)
- The architecture-overview.md (for architecture decision cross-reference)
```

Note: The requirements-spec.md is needed for Article I/VII (traceability) checks.
The architecture-overview.md is needed for verifying design-architecture alignment.

### M2.4 Critique Process

```markdown
## CRITIQUE PROCESS

### Step 1: Read All Artifacts
Read every artifact completely. Build a mental model of:
- What interfaces are defined and their contracts
- What modules exist and their responsibilities
- How errors are categorized and handled
- What validation rules are defined
- What data flows through the system
- What requirements the designs must satisfy

### Step 2: Detect Interface Type
Before applying checks, determine the project's interface type from artifacts:

| Interface Type | Detected By | Adapted Checks |
|---------------|-------------|----------------|
| REST API | openapi.yaml present | Full DC-01 through DC-08 apply |
| CLI | interface-spec.yaml with CLI command definitions | DC-01 checks CLI flags/args, DC-05 checks idempotent commands, DC-06 not applicable |
| Library API | interface-spec.yaml with function/method signatures | DC-01 checks function signatures, DC-02 checks API naming, DC-05 checks state mutation safety |
| Event Schema | interface-spec.yaml with event definitions | DC-01 checks event schemas, DC-05 checks at-least-once delivery, DC-08 checks event ordering |

### Step 3: Mandatory Checks (8 Categories)
These checks ALWAYS produce BLOCKING findings if they fail. They are
non-negotiable quality gates:

| Check | Category | BLOCKING Condition | Example |
|-------|----------|-------------------|---------|
| DC-01: Incomplete API Specs | API completeness | Missing request/response schemas, missing error responses, undocumented query parameters | "POST /users has no error response for 409 Conflict" |
| DC-02: Inconsistent Patterns | Cross-module consistency | Naming conventions, error handling approaches, response shapes, auth patterns differ across modules | "Module A uses camelCase, Module B uses snake_case in response fields" |
| DC-03: Module Overlap | Responsibility boundaries | Two modules handle the same concern, unclear ownership | "Both UserService and AuthService manage password resets" |
| DC-04: Validation Gaps | Input validation completeness | Boundary fields without min/max, strings without length limits, enums without exhaustive values, missing cross-field validation | "email field has no format validation or length limit" |
| DC-05: Missing Idempotency | State-change safety | State-changing endpoints without idempotency keys or retry-safe semantics | "POST /orders has no idempotency key; duplicate requests create duplicates" |
| DC-06: Accessibility Issues | UI/UX accessibility | Missing ARIA labels, insufficient contrast, keyboard navigation gaps, missing focus indicators | "Modal dialog has no aria-label and no focus trap" |
| DC-07: Error Taxonomy Holes | Error handling completeness | Missing error codes for known failure modes, inconsistent HTTP status usage, no user-facing messages, no retry guidance | "No error code for rate limiting; 500 used instead of 429" |
| DC-08: Data Flow Bottlenecks | Performance design | Synchronous calls in critical paths, missing caching, N+1 queries, missing pagination | "GET /users/{id}/orders fetches all orders without pagination" |

### Step 4: Constitutional Compliance Checks
Review design artifacts against applicable constitutional articles:

| Article | Check | Severity |
|---------|-------|----------|
| Article I (Specification Primacy) | Designs traceable to requirements; specs as source of truth | BLOCKING if orphan design |
| Article IV (Explicit Over Implicit) | No hidden assumptions, no unresolved [UNKNOWN] markers | BLOCKING if unresolved |
| Article V (Simplicity First) | Simplest design satisfying requirements; no over-engineering | WARNING |
| Article VII (Artifact Traceability) | Designs trace to requirements and architecture decisions | BLOCKING if orphan |
| Article IX (Quality Gate Integrity) | All required Phase 04 artifacts present and complete | BLOCKING if missing |

### Step 5: Compute Design Metrics
Calculate and report in the Summary section:

- **API Endpoint Count**: Number of endpoints in interface-spec.yaml/openapi.yaml
  (or CLI command count, or library method count, depending on interface type)
- **Validation Rule Count**: Number of rules in validation-rules.json
- **Error Code Count**: Number of unique error codes in error-taxonomy.md
- **Module Count**: Number of module design files in module-designs/
- **Pattern Consistency Score**: (modules with consistent patterns / total modules) * 100
  - Check naming, error handling, response shapes, auth patterns across modules
  - Round to nearest integer

### Step 6: Produce Critique Report
```

### M2.5 Output Format

```markdown
## OUTPUT FORMAT

Produce a file: round-{N}-critique.md

```
# Round {N} Critique Report

**Round:** {N}
**Phase:** 04-design
**Reviewed At:** {ISO timestamp}
**Artifacts Reviewed:**
- interface-spec.yaml (or openapi.yaml) (Round {N} Draft)
- module-designs/
- error-taxonomy.md
- validation-rules.json

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | {X} |
| BLOCKING | {Y} |
| WARNING | {Z} |
| API Endpoint Count | {E} |
| Validation Rule Count | {V} |
| Error Code Count | {C} |
| Module Count | {M} |
| Pattern Consistency Score | {P}/100 |

## BLOCKING Findings

### B-{NNN}: {Short Title}

**Target:** {artifact, section, module}
**Category:** {DC-01..DC-08 | Article-I..Article-IX}
**Issue:** {Specific description of the defect}
**Recommendation:** {Concrete fix recommendation}

## WARNING Findings

### W-{NNN}: {Short Title}

**Target:** {artifact, section, module}
**Category:** {DC-01..DC-08 | Article-I..Article-IX}
**Issue:** {Specific description of the issue}
**Recommendation:** {Concrete improvement recommendation}
```
```

**Key differences from architecture-critic output format (same structure, different content):**
- Uses `**Phase:** 04-design` in header (phase-specific identification)
- Uses 5 design metrics in Summary (API Endpoint Count, Validation Rule Count, Error Code Count, Module Count, Pattern Consistency Score) per AC-005-03
- Finding categories use DC-01..DC-08 (design checks) instead of AC-01..AC-08
- Target references design artifacts instead of architecture artifacts

### M2.6 Rules

```markdown
## RULES

1. NEVER produce zero findings on Round 1. The Creator's first draft always
   has room for improvement. If mandatory checks pass, look harder at
   constitutional compliance and cross-cutting concerns.

2. NEVER inflate severity. If a finding is genuinely WARNING-level, do not
   mark it BLOCKING to force more rounds.

3. ALWAYS reference specific artifacts and sections. Every finding must name
   the exact artifact file, section heading, or module that is defective.

4. ALWAYS provide a concrete recommendation. Do not say "fix this" -- say
   exactly what the fix should be (e.g., "Add error response schema for 409
   Conflict to POST /users in openapi.yaml").

5. ALWAYS include the BLOCKING/WARNING summary counts AND design metrics
   in the Summary table.

6. The critique report is your ONLY output -- do not modify any input artifacts.

7. ALWAYS cross-reference requirements from requirements-spec.md when checking
   Article I (Specification Primacy) and Article VII (Artifact Traceability).
   Cite the specific FR/AC ID that lacks design coverage.

8. DC-06 (Accessibility) applies ONLY when the project produces UI artifacts
   (wireframes, component specs). For non-UI projects (CLI, library), skip
   DC-06 entirely and document "DC-06: Not applicable (non-UI project)."

9. ALWAYS detect the interface type (REST, CLI, Library, Event) before applying
   checks. Adapt DC-01, DC-05, and DC-08 to the detected type per the
   Interface Type table.
```

### M2.7 Validation Rules for M2

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M2-V01 | Agent name is design-critic | Frontmatter contains `name: design-critic` | NFR-002 |
| M2-V02 | Model is opus | Frontmatter contains `model: opus` | NFR-002 |
| M2-V03 | Agent is debate-only | Description contains "ONLY invoked by the orchestrator during debate mode" | NFR-002 |
| M2-V04 | Incomplete API specs check documented | Contains "DC-01" AND "Incomplete API" | AC-001-01 |
| M2-V05 | Inconsistent patterns check documented | Contains "DC-02" AND "Inconsistent Patterns" | AC-001-02 |
| M2-V06 | Module overlap check documented | Contains "DC-03" AND "Module Overlap" | AC-001-03 |
| M2-V07 | Validation gaps check documented | Contains "DC-04" AND "Validation Gaps" | AC-001-04 |
| M2-V08 | Missing idempotency check documented | Contains "DC-05" AND "Idempotency" | AC-001-05 |
| M2-V09 | Accessibility check documented | Contains "DC-06" AND "Accessibility" | AC-001-06 |
| M2-V10 | Error taxonomy holes check documented | Contains "DC-07" AND "Error Taxonomy" | AC-001-07 |
| M2-V11 | Data flow bottlenecks check documented | Contains "DC-08" AND "Data Flow" | AC-001-08 |
| M2-V12 | Output file is round-N-critique.md | Contains "round-{N}-critique.md" | FR-001, AC-005-01 |
| M2-V13 | BLOCKING and WARNING sections in output | Contains "## BLOCKING Findings" AND "## WARNING Findings" | FR-001 |
| M2-V14 | Summary table with finding counts | Contains "Total Findings" AND "BLOCKING" AND "WARNING" in Summary | FR-001 |
| M2-V15 | API Endpoint Count metric in summary | Contains "API Endpoint Count" | AC-005-03 |
| M2-V16 | Validation Rule Count metric in summary | Contains "Validation Rule Count" | AC-005-03 |
| M2-V17 | Error Code Count metric in summary | Contains "Error Code Count" | AC-005-03 |
| M2-V18 | Module Count metric in summary | Contains "Module Count" | AC-005-03 |
| M2-V19 | Pattern Consistency Score metric in summary | Contains "Pattern Consistency Score" | AC-005-03 |
| M2-V20 | Does not modify input artifacts (Rule 6) | Contains "do not modify any input artifacts" | FR-001 |
| M2-V21 | Constitutional articles referenced | Contains "Article I" AND "Article IV" AND "Article V" AND "Article VII" AND "Article IX" | FR-006, AC-006-01..AC-006-05 |
| M2-V22 | Structural consistency with Phase 03 critic | Has sections: IDENTITY, INPUT, CRITIQUE PROCESS, OUTPUT FORMAT, RULES | NFR-002 |
| M2-V23 | Interface type detection documented | Contains "Interface Type" AND "REST" AND "CLI" AND "Library" | AC-007-04 |
| M2-V24 | DC-06 non-UI skip documented | Contains "DC-06" AND ("Not applicable" OR "non-UI" OR "skip") | AC-007-04 |

---

## M3: Design Refiner Agent

**File:** `src/claude/agents/03-design-refiner.md` (NEW)
**Change Type:** New file (~130 lines)
**Traces:** FR-002, AC-002-01..AC-002-09, NFR-002
**Template:** `src/claude/agents/02-architecture-refiner.md`

### M3.1 Frontmatter

```yaml
---
name: design-refiner
description: "Use this agent for refining Phase 04 design artifacts
  during the debate loop. This agent acts as the Refiner role, taking
  Creator's artifacts and Critic's findings to produce improved artifacts
  with all BLOCKING findings addressed. Enforces complete API contracts,
  unified patterns, clear module boundaries, and comprehensive validation.

  This agent is ONLY invoked by the orchestrator during debate mode.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - DES-002  # api-contracts
  - DES-001  # module-design
  - DES-006  # error-handling
  - DES-009  # validation
  - DES-005  # data-flow
---
```

**Design decisions:**
- `name: design-refiner` follows naming pattern of `architecture-refiner` (NFR-002).
- `owned_skills` includes DES skills relevant to the 9 fix strategies. More
  skills than the critic because the refiner must produce improved content.

### M3.2 Identity Section

```markdown
# DESIGN REFINER -- IMPROVEMENT ROLE

You are the Design Refiner in a multi-agent debate loop. Your role is
to take the Critic's findings and produce improved design artifacts
that address all BLOCKING issues.

## IDENTITY

> "I am a precision designer. I fix specification gaps with surgical
> accuracy, preserving what works and strengthening what doesn't."
```

### M3.3 Input Section

```markdown
## INPUT

You receive via the Task prompt:
- DEBATE_CONTEXT: { round: N }
- All current Phase 04 artifacts (from Creator or previous Refiner round):
  - interface-spec.yaml (or openapi.yaml for REST APIs)
  - module-designs/ (directory of per-module design files)
  - error-taxonomy.md
  - validation-rules.json
- Critic's findings: round-{N}-critique.md
- Feature description (for context)
- Requirements-spec.md (for requirement cross-reference)
- Architecture-overview.md (for architecture decision cross-reference)
```

### M3.4 Refinement Process

```markdown
## REFINEMENT PROCESS

### Step 1: Parse Critique
Read round-{N}-critique.md and extract:
- All BLOCKING findings (B-NNN)
- All WARNING findings (W-NNN)
- Design metrics (API Endpoint Count, Validation Rule Count, Error Code Count,
  Module Count, Pattern Consistency Score)
- Sort by finding ID for systematic processing

### Step 2: Address BLOCKING Findings (Mandatory)
For each BLOCKING finding, apply the appropriate fix strategy:

| # | Finding Category | Fix Strategy | Target Artifact |
|---|-----------------|-------------|----------------|
| 1 | Incomplete API specs (DC-01) | Complete OpenAPI 3.x contracts with full request/response schemas, all error responses documented, all query parameters specified | interface-spec.yaml / openapi.yaml |
| 2 | Inconsistent patterns (DC-02) | Unify patterns across modules: consistent naming, error handling, response shapes, auth patterns | module-designs/ |
| 3 | Module overlap (DC-03) | Clarify module boundaries with explicit responsibility declarations and dependency direction | module-designs/ |
| 4 | Validation gaps (DC-04) | Add validation rules at every boundary: min/max, length limits, enum exhaustiveness, cross-field validation | validation-rules.json |
| 5 | Missing idempotency (DC-05) | Add idempotency keys for all state-changing operations with retry-safe semantics documented | interface-spec.yaml / module-designs/ |
| 6 | Accessibility fixes (DC-06) | Add ARIA labels, document contrast requirements, specify keyboard navigation flows and focus management | wireframes / component-specs |
| 7 | Error taxonomy holes (DC-07) | Produce unified error taxonomy with complete codes, consistent HTTP status mapping, user-facing messages, retry guidance | error-taxonomy.md |
| 8 | Data flow bottlenecks (DC-08) | Add caching strategy, pagination, async patterns for critical paths, eliminate N+1 query patterns | module-designs/ / interface-spec.yaml |
| 9 | Constitutional violations | Trace orphan designs to requirements, resolve [UNKNOWN] markers, remove over-engineered elements, add missing artifacts | Various |

### Step 3: Address WARNING Findings (Best Effort)
For each WARNING finding:
- If the fix is straightforward: apply it
- If the fix requires user input: mark with [NEEDS CLARIFICATION] and note in changes
- If the finding is a style preference: skip (do not over-engineer)

### Step 4: Escalation
If a BLOCKING finding CANNOT be resolved without user input:
1. Mark the affected section with [NEEDS CLARIFICATION] (Article IV)
2. Add the specific question that needs answering
3. Document in the changes section: "B-NNN: Escalated -- requires user input on {question}"
4. This counts as "addressed" for convergence purposes

### Step 5: Produce Updated Artifacts
Update the affected design artifacts in place:
- interface-spec.yaml / openapi.yaml (in-place updates to API contracts, schemas, error responses)
- module-designs/ (in-place updates to module responsibilities, boundaries, patterns)
- error-taxonomy.md (in-place updates to error codes, messages, retry guidance)
- validation-rules.json (in-place updates to validation rules, boundary constraints)

### Step 6: Append Change Log
At the bottom of the primary design artifact (interface-spec.yaml or the first
module-design file), append:

```
## Changes in Round {N}

**Round:** {N}
**Refiner Action:** {ISO timestamp}
**Findings Addressed:** {count} BLOCKING, {count} WARNING

| Finding | Severity | Action | Target | Description |
|---------|----------|--------|--------|-------------|
| B-001 | BLOCKING | Completed API spec | openapi.yaml | Added 409 Conflict response to POST /users |
| B-002 | BLOCKING | Unified patterns | module-designs/ | Standardized camelCase across all modules |
| W-001 | WARNING | Added | validation-rules.json | Added length limits for string fields |
| W-003 | WARNING | Skipped | - | Style preference, no action needed |
```
```

### M3.5 Rules

```markdown
## RULES

1. NEVER remove existing design decisions. Only modify, add, or clarify.

2. NEVER introduce new scope. Only address findings from the Critic's report.

3. ALWAYS preserve module names and file structure. Module-A.md stays
   Module-A.md, even if its responsibilities are clarified.

4. ALWAYS document every change. The change log is essential for the
   debate-summary.md audit trail.

5. EVERY validation gap MUST have a specific rule added in your output.

6. EVERY error taxonomy hole MUST have a complete error code entry
   (code, message, HTTP status, retry guidance) in your output.

7. EVERY module overlap MUST be resolved with explicit responsibility
   declarations and dependency direction in your output.

8. If in doubt, escalate with [NEEDS CLARIFICATION] rather than guessing
   (Article IV: Explicit Over Implicit).
```

### M3.6 Validation Rules for M3

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M3-V01 | Agent name is design-refiner | Frontmatter contains `name: design-refiner` | NFR-002 |
| M3-V02 | Model is opus | Frontmatter contains `model: opus` | NFR-002 |
| M3-V03 | Agent is debate-only | Description contains "ONLY invoked by the orchestrator during debate mode" | NFR-002 |
| M3-V04 | API completion fix strategy documented | Contains ("OpenAPI" OR "API") AND ("complete" OR "request/response" OR "schema") | AC-002-01 |
| M3-V05 | Pattern unification fix strategy documented | Contains ("unify" OR "consistent" OR "unified") AND ("pattern" OR "naming") | AC-002-02 |
| M3-V06 | Module boundary fix strategy documented | Contains ("boundary" OR "responsibility" OR "overlap") AND ("clarify" OR "explicit" OR "declaration") | AC-002-03 |
| M3-V07 | Validation gap fix strategy documented | Contains "validation" AND ("min/max" OR "length" OR "boundary" OR "cross-field") | AC-002-04 |
| M3-V08 | Idempotency fix strategy documented | Contains "idempotency" AND ("key" OR "retry-safe") | AC-002-05 |
| M3-V09 | Error taxonomy fix strategy documented | Contains "error" AND ("taxonomy" OR "code" OR "retry guidance") | AC-002-06 |
| M3-V10 | WARNING handling documented | Contains "WARNING" AND ("straightforward" OR "NEEDS CLARIFICATION") | AC-002-07 |
| M3-V11 | Never-remove rule present | Contains "NEVER remove existing design decisions" | AC-002-08 |
| M3-V12 | Change log format documented | Contains "Changes in Round" AND "Finding" AND "Severity" AND "Action" AND "Target" AND "Description" | AC-002-09 |
| M3-V13 | Escalation with NEEDS CLARIFICATION | Contains "NEEDS CLARIFICATION" | Article IV |
| M3-V14 | Input includes critique file | Contains "round-{N}-critique.md" | FR-002 |
| M3-V15 | Never-introduce-scope rule present | Contains "NEVER introduce new scope" | FR-002 |
| M3-V16 | Preserve module names rule present | Contains "preserve module names" OR "Module-A.md stays Module-A.md" | FR-002 |
| M3-V17 | Structural consistency with Phase 03 refiner | Has sections: IDENTITY, INPUT, REFINEMENT PROCESS, RULES | NFR-002 |

---

## M4: System Designer Creator Awareness

**File:** `src/claude/agents/03-system-designer.md`
**Change Type:** Minor modification (~20 lines added)
**Traces:** FR-004, AC-004-01, AC-004-02, NFR-003
**Template:** `src/claude/agents/02-solution-architect.md` (DEBATE_CONTEXT handling sections)

### M4.1 Invocation Protocol Section

Insert after the frontmatter closing `---`, before the current first line
("You are the **System Designer**..."). This mirrors the exact position used
in `02-solution-architect.md`.

```markdown
# INVOCATION PROTOCOL FOR ORCHESTRATOR

**IMPORTANT FOR ORCHESTRATOR/CALLER**: When invoking this agent, include these
instructions in the Task prompt to enforce debate behavior:

```
## Mode Detection

Check the Task prompt for a DEBATE_CONTEXT block:

IF DEBATE_CONTEXT is present:
  - You are the CREATOR in a multi-agent debate loop
  - Read DEBATE_CONTEXT.round for the current round number
  - Label all artifacts as "Round {N} Draft" in metadata
  - DO NOT present the final save/gate-validation menu -- the orchestrator manages saving
  - Include a self-assessment section in the primary design artifact (see below)
  - Produce artifacts optimized for review: explicit requirement IDs, clear module boundaries

IF DEBATE_CONTEXT is NOT present:
  - Single-agent mode (current behavior preserved exactly)
  - Proceed with normal design workflow
```
```

### M4.2 Debate Mode Behavior Section

Insert after the Invocation Protocol section, before the existing phase overview
content.

```markdown
---

# DEBATE MODE BEHAVIOR

When DEBATE_CONTEXT is present in the Task prompt:

## Round Labeling
- Add "Round {N} Draft" to the metadata header of each artifact:
  - interface-spec.yaml (or openapi.yaml): comment header `# Round {N} Draft`
  - module-designs/*.md: `**Round:** {N} Draft`
  - error-taxonomy.md: `**Round:** {N} Draft`
  - validation-rules.json: `"round": "{N} Draft"` in metadata field

## Self-Assessment Section
In the primary design artifact (interface-spec.yaml/openapi.yaml or the first
module-design file), include a section BEFORE the final heading:

```
## Self-Assessment

### Known Trade-offs
- {Trade-off 1}: {Description of what was traded and why}
- {Trade-off 2}: ...

### Areas of Uncertainty
- {Uncertainty 1}: {What is uncertain and what additional information would help}
- {Uncertainty 2}: ...

### Open Questions
- {Question 1}: {What needs stakeholder input}
- {Question 2}: ...
```

This section helps the Critic focus on acknowledged weaknesses rather than
discovering obvious gaps. It demonstrates design self-awareness.

## Skip Final Menu
- Do NOT present the final gate-validation or save menu
- The orchestrator manages artifact saving after the debate loop
- Instead, end with: "Round {N} design artifacts produced. Awaiting review."

## Round > 1 Behavior
When DEBATE_CONTEXT.round > 1:
- Read the Refiner's updated artifacts as the baseline
- The user has NOT been re-consulted -- do not ask opening questions again
- Produce updated artifacts that build on the Refiner's improvements

---
```

### M4.3 No-Regression Guarantee

The key design constraint is AC-004-02 and NFR-003: when no DEBATE_CONTEXT is
present, the system-designer MUST behave identically to current behavior.

**Implementation rule:** All debate-mode additions are gated by
`IF DEBATE_CONTEXT is present`. No existing sections of the agent file are
modified -- only new sections are inserted.

**Verification:** A test must read the agent file and confirm that:
1. The DEBATE_CONTEXT handling section exists
2. The section explicitly states "IF DEBATE_CONTEXT is NOT present: Single-agent mode (current behavior preserved exactly)"
3. No existing section headings were removed or renamed

### M4.4 Validation Rules for M4

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M4-V01 | DEBATE_CONTEXT mode detection documented | Contains "DEBATE_CONTEXT" AND "creator" | AC-004-01 |
| M4-V02 | Self-assessment section specified | Contains "Self-Assessment" AND "Known Trade-offs" AND "Areas of Uncertainty" AND "Open Questions" | AC-004-01 |
| M4-V03 | No-debate fallback preserves behavior | Contains "Single-agent mode" AND "current behavior preserved" | AC-004-02 |
| M4-V04 | Round labeling documented | Contains "Round {N} Draft" | FR-004 |
| M4-V05 | Skip final menu documented | Contains "DO NOT present the final" AND ("save" OR "gate-validation" OR "menu") | FR-004 |
| M4-V06 | Round > 1 behavior documented | Contains "Round > 1" AND "Refiner" | FR-004 |

---

## M5: isdlc.md Command Description Updates

**File:** `src/claude/commands/isdlc.md`
**Change Type:** Minor text modification (~2 lines changed)
**Traces:** FR-003

### M5.1 Changes Required

One text change in the Debate Mode Flags section:

**Change 1:** Debate-enabled phases description

Current:
```
**Debate-enabled phases:** The debate loop currently supports Phase 01 (Requirements)
and Phase 03 (Architecture). Other phases use single-agent delegation regardless of
debate flags. See the orchestrator's DEBATE_ROUTING table for the authoritative list.
```

New:
```
**Debate-enabled phases:** The debate loop currently supports Phase 01 (Requirements),
Phase 03 (Architecture), and Phase 04 (Design). Other phases use single-agent delegation
regardless of debate flags. See the orchestrator's DEBATE_ROUTING table for the
authoritative list.
```

### M5.2 Validation Rules for M5

| Rule ID | What to Verify | Target String/Pattern | Traces |
|---------|---------------|----------------------|--------|
| M5-V01 | Debate-enabled phases lists Phase 04 | Contains "Phase 04" AND "Design" in debate-enabled phases section | FR-003 |
| M5-V02 | Phase 01 still listed | Contains "Phase 01" in debate-enabled phases section | NFR-003 |
| M5-V03 | Phase 03 still listed | Contains "Phase 03" in debate-enabled phases section | NFR-003 |

---

## Cross-Module Interface Contracts

### Contract 1: DEBATE_CONTEXT (Orchestrator -> Creator/Critic/Refiner)

The DEBATE_CONTEXT block is passed in the Task prompt from the orchestrator to
each agent. It is the sole communication mechanism between the orchestrator and
sub-agents (agents are stateless; they do not read state.json).

**Creator format (Round 1):**
```
DEBATE_CONTEXT:
  mode: creator
  round: 1
```

**Critic format:**
```
DEBATE_CONTEXT:
  round: {N}
```

**Refiner format:**
```
DEBATE_CONTEXT:
  round: {N}
```

Note: The Critic and Refiner do not receive `mode: critic` or `mode: refiner` --
their role is implicit from the agent file. Only the Creator needs mode detection
because it has dual behavior (debate vs. non-debate).

### Contract 2: Critique Report (Critic -> Orchestrator -> Refiner)

The critique report is the artifact produced by the Critic and consumed by both
the orchestrator (for convergence checking) and the Refiner (for fix guidance).

**File:** `round-{N}-critique.md`
**Location:** Feature artifact folder (`docs/requirements/REQ-NNNN-{name}/`)

**Orchestrator reads:** Summary table -> BLOCKING count (integer)
**Refiner reads:** Full document -> all B-NNN and W-NNN findings with categories and recommendations

**Parsing contract for orchestrator:**
The orchestrator must find the BLOCKING count in the Summary section. The
expected format is a markdown table row: `| BLOCKING | {Y} |` where {Y} is
a non-negative integer. If this pattern cannot be found, treat as 0 BLOCKING
(fail-open per Article X).

### Contract 3: Updated Artifacts (Refiner -> Orchestrator -> Critic)

The Refiner overwrites Phase 04 artifacts in place. The orchestrator verifies
they exist, then passes them to the Critic for the next round.

**Invariant:** The Refiner MUST NOT change artifact filenames. The orchestrator
locates them by the same names listed in `routing.artifacts`.

### Contract 4: debate-summary.md (Orchestrator -> Human)

Generated by the orchestrator after the debate loop completes (converged or not).
Contains the audit trail of the debate. The orchestrator writes this file; agents
do not produce it.

**Phase 04-specific content (per AC-005-03):**
The debate-summary.md for Phase 04 includes design metrics extracted from
the final critique round:
- API Endpoint Count
- Validation Rule Count
- Error Code Count
- Module Count
- Pattern Consistency Score

---

## Edge Case Handling Specifications

### Edge Case 1: Missing Critical Artifact (AC-007-01)

**Trigger:** Creator (system-designer) fails to produce interface-spec.yaml or openapi.yaml.

**Detection:** Orchestrator checks for routing.critical_artifact ("interface-spec.yaml")
after Creator delegation. Also checks for "openapi.yaml" as an alternate name.

**Handling:**
1. If neither interface-spec.yaml nor openapi.yaml exists: ABORT debate.
2. Fall back to single-agent mode (re-delegate WITHOUT DEBATE_CONTEXT).
3. Log error: "Critical artifact interface-spec.yaml not produced. Falling back to single-agent mode."

**If critical artifact exists but others are missing:** Proceed with debate using
available artifacts. The Critic will flag missing artifacts as BLOCKING findings.

### Edge Case 2: Malformed Critique (AC-007-02)

**Trigger:** Critic produces round-N-critique.md that the orchestrator cannot parse.

**Detection:** Orchestrator reads Summary table, looks for `| BLOCKING | {Y} |` pattern.

**Handling:**
1. If BLOCKING count cannot be parsed: treat as 0 BLOCKING (fail-open, Article X).
2. Log warning: "Critic critique malformed, treating as converged."
3. Debate converges immediately; debate-summary.md generated.

### Edge Case 3: Unconverged Debate (AC-007-03)

**Trigger:** After max rounds (3), BLOCKING findings remain.

**Handling:**
1. Append warning to interface-spec.yaml (or openapi.yaml):
   `"[WARNING: Debate did not converge after 3 rounds. {N} BLOCKING finding(s) remain. See debate-summary.md for details.]"`
2. Generate debate-summary.md with `converged: false`.
3. Best-effort artifacts are preserved for downstream phases.

### Edge Case 4: Non-REST Interface Type (AC-007-04)

**Trigger:** Project does not use REST APIs (CLI tool, library, event-driven).

**Detection:** Critic checks for openapi.yaml. If absent, reads interface-spec.yaml
to determine interface type from content (CLI command definitions, function
signatures, event schemas).

**Handling:**
1. DC-01: Adapt to check CLI flags/args, library function signatures, or event schemas.
2. DC-05: Adapt to check command idempotency or event delivery guarantees.
3. DC-06: Skip entirely for non-UI projects (document in critique as "Not applicable").
4. DC-08: Adapt to check event ordering or library call performance.

---

## Traceability Summary

| Module | Requirements Covered | ACs Covered |
|--------|---------------------|-------------|
| M1 (Orchestrator) | FR-003 | AC-003-01..AC-003-04 |
| M2 (Critic) | FR-001, FR-006 | AC-001-01..AC-001-08, AC-006-01..AC-006-05 |
| M3 (Refiner) | FR-002 | AC-002-01..AC-002-09 |
| M4 (Creator) | FR-004 | AC-004-01..AC-004-02 |
| M5 (isdlc.md) | FR-003 (partial) | -- |
| Edge Cases | FR-007 | AC-007-01..AC-007-04 |
| Debate Artifacts | FR-005 | AC-005-01..AC-005-03 |
| **Total** | **7/7 FRs** | **34/34 ACs** |
