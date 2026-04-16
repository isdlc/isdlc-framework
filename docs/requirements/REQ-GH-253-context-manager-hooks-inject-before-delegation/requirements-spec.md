# Requirements Specification: REQ-GH-253 — Context-Manager Hooks

**Source**: GitHub Issue #253
**Status**: Analyzed
**Amendment Cycles**: 2

---

## Problem Statement

The LLM orchestrator in iSDLC (Claude or Codex) must remember a large body of protocol rules, memory constraints, templates, conversation styles, tool preferences, and skill bindings during analyze + bug-gather roundtables. Under cognitive load — long sessions, context compression, competing instructions — rules drop inconsistently. Semantic search sometimes used, sometimes missed; templates sometimes right, sometimes wrong; confirmation sequences sometimes honored, sometimes collapsed; conversation style drifts between bulleted-by-domain and prose.

BUG-0028 / GH-64 already documented the root causes at the gate-requirements level: context dilution, low salience, competing instructions, no feedback loop. Their fix (CRITICAL CONSTRAINTS prelude + REMINDER footer) shipped but variance persists — empirical evidence that "inject more text" has diminishing returns.

**Design Principle** (binding constraint): preserve specification fidelity while reducing LLM recall load. Every cut from prose must be matched by a mechanism that holds the same specification. Complement the LLM's strengths; don't force more to remember.

**Users/Stakeholders**: iSDLC dogfooding users (primary), external iSDLC consumers on Claude Code and Codex (secondary), framework developers maintaining the roundtable protocol (tertiary).

---

## Functional Requirements

### FR-001: Two-Layer Affordance Model
**Confidence**: High
**Priority**: Must Have

The framework MUST express affordance surfaces at two granularities: (a) user-facing state (conversation / confirmation / documentation) as a **state card**, and (b) background sub-task (scan, blast radius, research, tracing, dependency check) as a **task card**. At any moment the LLM's complete affordance context = state card + active task card.

- AC-001-01: Given an active analyze or bug-gather roundtable, when a user-facing state is current, then a state card naming active personas, rendering mode, invariants, valid transitions, active template, and preferred tool hierarchy is composed and surfaced.
- AC-001-02: Given a background sub-task fires within a state, when the LLM begins the sub-task, then a task card naming applicable shipped/project/user skills, preferred tools, expected output shape, and completion marker is composed alongside the outer state card.
- AC-001-03: Given a sub-task completion marker is observed, when the handler processes it, then the task card retires while the outer state card persists.

### FR-002: State-Machine-Driven Composition
**Confidence**: High
**Priority**: Must Have

Conversation progression MUST be driven by an explicit machine-readable state machine definition in `src/core/`, not by LLM recall of prose protocol. Three definition files (core + analyze-specific + bug-gather-specific) are merged by a definition loader.

- AC-002-01: Given the state machine definition files exist, when the analyze handler initializes a roundtable, then it reads and merges the definitions, composing the entry card for the initial state.
- AC-002-02: Given the current state has an enumerated sub-task graph, when the handler's rolling state satisfies a transition trigger, then the relevant sub-task activates and its task card composes.
- AC-002-03: Given state machine definitions are missing or malformed, when initialization runs, then the handler falls back to today's prose-driven protocol (Article X).

### FR-003: Hybrid Rolling State Updates
**Confidence**: High
**Priority**: Must Have

The rolling roundtable state (handler source-of-truth) MUST be updated through two complementary mechanisms: (a) LLM-emitted lightweight trailer per turn (best-effort, non-binding), and (b) handler-side marker extraction parsing natural LLM output for domain signals.

- AC-003-01: Given an LLM turn ends with a valid trailer block, when the handler reads it, then the trailer updates the rolling state.
- AC-003-02: Given an LLM turn ends without a trailer, when the handler parses natural output, then known markers trigger state updates.
- AC-003-03: Given the trailer disagrees with the marker parse, when the handler reconciles, then the trailer wins (explicit over inferred).
- AC-003-04: Given both mechanisms fail to determine state, when the handler can't transition, then it waits for the next user turn (fail-safe).

### FR-004: Skills Fire at Background-Task Granularity
**Confidence**: High
**Priority**: Must Have

The existing skill manifest and injection infrastructure (REQ-0022 + SKILL INJECTION A/B/C) MUST be reused (not replaced) at sub-task granularity. Task cards compose skills via the same manifest query mechanism. User-configurable `max_skills_total` budget (default 8) stored in `.isdlc/config.json`.

- AC-004-01: Given a sub-task definition references skill IDs, when the handler composes the task card, then it queries the manifest, filters by availability/phase/agent/sub-task bindings, and embeds active skills per delivery_type.
- AC-004-02: Given a referenced skill is missing or unloadable, when composition runs, then the skill is omitted and composition continues (fail-open).
- AC-004-03: Given a project or user skill's binding matches the current sub-task, when composition runs, then the external skill is included per its manifest entry.

### FR-005: Provider Parity
**Confidence**: High
**Priority**: Must Have

State machine definition, sub-task to skill mapping, card composers, marker extractors, and rolling state schema MUST live in `src/core/` and produce provider-neutral output. Provider adapters only transport the composed strings.

- AC-005-01: Given the roundtable runs under Claude Code, when a card is composed, then it is injected via existing Task tool_input mutation.
- AC-005-02: Given the roundtable runs under Codex, when a card is composed, then it is injected via existing projection bundle header.
- AC-005-03: Given the same definition runs on both providers with the same conversation, then both see identical card content and produce equivalent behavior.

### FR-006: Boundary — Analyze + Bug-Gather Only
**Confidence**: High
**Priority**: Must Have

The state machine mechanism MUST apply to analyze and bug-gather roundtables only. Build phase-loop delegation keeps its existing Task-tool injection unchanged.

- AC-006-01: Given a build workflow phase dispatches, when the phase agent is invoked, then existing injection (STEP 3d skill injection, gate-requirements-injector, protocol injection) fires unchanged.
- AC-006-02: Given analyze or bug-gather roundtable is active, when sub-tasks fire, then the new state-machine-driven composition is used.

### FR-007: Simplification via Bucketed Audit
**Confidence**: High
**Priority**: Must Have

Protocol prose (roundtable-analyst.md, bug-roundtable-analyst.md) MUST be reduced by auditing every section into five buckets: (1) already enforced by code, (2) expressible as validator, (3) template-bound, (4) LLM-prose-needed, (5) dead/dormant. Final line count emerges from classification, not a pre-committed target.

- AC-007-01: Given the audit runs, when every section is classified, then buckets 1/2/3/5 are cuttable with content migrating to the appropriate mechanism.
- AC-007-02: Given sections in bucket 4 remain, when the cut lands, then LLM-prose-needed material stays with explicit rationale.
- AC-007-03: Given the audit is inconclusive for a section, when the cut lands, then the section defaults to keep (fail-safe toward specification fidelity).

### FR-008: Phased Migration with Parallel-Run Safety
**Confidence**: High
**Priority**: Must Have

The mechanism MUST land in phases with fall-back paths: introduce alongside existing protocol, parallel runs comparing outputs, cutover only when converged, bug-gather migrates after analyze stabilizes, prose deletions only after mechanism stable.

- AC-008-01: Given the state machine runs in parallel with prose protocol, when outputs diverge materially, then a diagnostic log captures the divergence.
- AC-008-02: Given migration fails at any phase, when fallback triggers, then the prose protocol continues unchanged (no regression path).

---

## Assumptions and Inferences

- Inferred: the LLM can reliably follow a 2-3 line trailer format because it's non-binding and backed by marker extraction. Confidence: Medium.
- Assumed: src/core/ has sufficient substrate (template-loader, compliance engine, skill manifest bridge) to host the new composers without major restructuring. Confidence: High.
- Inferred: marker extraction will cover enough of the common case that the trailer can truly be best-effort. Confidence: Medium.
- Inferred: the audit will yield enough bucket-1/2/3/5 content to meaningfully reduce prose length. Confidence: Medium.
- Assumed: shipped skills already cover common background tasks. Confidence: Medium.

---

## Non-Functional Requirements

- **NFR-001 Fail-open everywhere (Article X)**: any failure in definition loading, card composition, marker extraction, skill lookup, or trailer parsing MUST degrade to prose protocol.
- **NFR-002 Provider parity**: behavior on Claude Code and Codex MUST be equivalent for identical definitions and inputs.
- **NFR-003 Performance budget**: per-turn card composition overhead MUST NOT exceed 200ms.
- **NFR-004 Observability**: every state transition, sub-task activation, task card composition, and rolling state update MUST be loggable.
- **NFR-005 Specification fidelity preservation**: every protocol rule removed from prose has a corresponding mechanism.

---

## Out of Scope

- Build phase-loop delegation mechanism changes
- Discover flow and free-conversation flows
- Embedding-search hierarchy content authoring (downstream consumer, not design target)
- Systemic feedback-loop for auto-detecting state card incompleteness
- Novel sub-task escape-hatch (LLM-declared fallback) detailed design

---

## Prioritization

- **Must Have**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008
- **Could Have**: extended observability dashboards, automated parallel-run diff tools, state-machine visualizer
- **Won't Have (this ticket)**: feedback-loop auto-detection, build phase-loop changes, discover/free-conversation changes
