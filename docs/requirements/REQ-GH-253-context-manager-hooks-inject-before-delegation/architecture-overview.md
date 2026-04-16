# Architecture Overview: REQ-GH-253 — Context-Manager Hooks

**Source**: GitHub Issue #253
**Status**: Accepted

---

## Architecture Options

### Option A: Additive Injection Everywhere (Rejected)
Keep all protocol docs as-is, add more PreToolUse injection points. BUG-0028 empirical evidence shows this approach has diminishing returns — context dilution worsens as protocol grows.

### Option B: Reductive Simplification Only (Rejected)
Audit and cut protocol docs aggressively, trust LLM to follow simpler protocol. Insufficient alone — no injection at points where it's currently zero (inline analyze loop background tasks); doesn't solve long-session recall problem.

### Option C: Hybrid State-Machine-Driven Composition + Bucketed Audit (Selected)
State machine in src/core/ drives explicit state + sub-task composition. Two-layer affordance cards. Skill infrastructure reused at sub-task granularity. Bucketed audit migrates prose to mechanism. Hybrid rolling state updates (LLM trailer + handler marker parsing). Addresses root cause (recall load) by composing context just-in-time.

---

## Selected Architecture

The system decomposes into composition layers running before every LLM turn during analyze + bug-gather roundtables:

- **State machine runtime** (src/core/roundtable/state-machine.js) — reads merged definition, tracks current state, evaluates transitions
- **Definition loader** (src/core/roundtable/definition-loader.js) — loads core + workflow-specific files, merges, validates
- **State card composer** (src/core/roundtable/state-card-composer.js) — outer affordance card per user-facing state
- **Task card composer** (src/core/roundtable/task-card-composer.js) — inner affordance card per background sub-task
- **Rolling state store** (src/core/roundtable/rolling-state.js) — structured in-memory state, updated by trailer + marker extractor
- **Trailer parser** (src/core/roundtable/trailer-parser.js) — parses LLM structured trailer per schema
- **Marker extractors** (src/core/roundtable/markers/) — pluggable per-sub-task rule-based extraction

### Validated Design Decision: Shared Core + Workflow-Specific Definitions

Direct comparison of roundtable-analyst.md and bug-roundtable-analyst.md confirmed that the abstract roundtable structure (IDLE, Opening, deferred scan, participation gate, sequential PRESENTING_* states, AMENDING restart-from-top, FINALIZING batch write, COMPLETE emit) holds across both workflows.

However, concrete state graphs differ materially: confirmation state names and templates differ (requirements/architecture/design/tasks vs bug-summary/root-cause/fix-strategy/tasks); bug-gather has a pre-confirmation write exception (bug-report.md) and external delegation (tracing-orchestrator) that analyze lacks; tier semantics differ (analyze light skips PRESENTING_ARCHITECTURE; bug light folds ROOT_CAUSE into FIX_STRATEGY).

Design: three definition files — core.json (shared invariants), analyze.json (analyze state graph), bug-gather.json (bug state graph). Merged by definition-loader.js at roundtable start. External delegation expressed declaratively via optional external_delegation field on state transitions.

---

## Technology Decisions

- **State machine format**: JSON — consistent with src/isdlc/config/ convention
- **Definition location**: src/isdlc/config/roundtable/ shipped, .isdlc/config/roundtable/ user override (REQ-GH-213 ADR-007 pattern)
- **Sub-task skill bindings**: extension of REQ-0022 manifest with additive bindings.sub_tasks[] field
- **Marker extraction**: rule-based regex + key phrases per sub-task; deterministic, testable
- **Trailer schema**: 3 required fields (state, sub_task, status) + version; JSON Schema at src/core/roundtable/schemas/trailer.schema.json
- **Language**: ESM for src/core/ modules; optional CJS bridge if hook layer needs access
- **Audit tooling**: manual classification first, scripted mechanism-for-cut traceability verification second
- **max_skills_total**: user-configurable total budget in .isdlc/config.json, default 8; no per-source bucketing

---

## Integration Architecture

| Existing Component | Role | Change |
|---|---|---|
| src/core/validators/template-loader.js | Scaffold primitive | Consumed by state-card composer; no change |
| src/core/compliance/engine.cjs | Runtime validators | Receives migrated bucket-2 rules |
| src/claude/hooks/gate-requirements-injector.cjs | Build-path gate composer | Unchanged |
| REQ-0022 skill manifest + session cache | Skill discovery | Consumed by task-card composer; manifest gains bindings.sub_tasks[] |
| src/providers/claude/runtime.js | Claude prompt construction | Receives composed card string |
| src/providers/codex/runtime.js | Codex prompt construction | Receives composed card string |
| src/claude/commands/isdlc.md | Analyze + bug-gather handlers | Step 7 and step 6.5d restructured |
| src/claude/agents/roundtable-analyst.md | Protocol reference | Audited per FR-007 |
| src/claude/agents/bug-roundtable-analyst.md | Bug protocol reference | Audited per FR-007 |
| Phase-loop controller | Build workflow | Unchanged per FR-006 |

---

## Risks

- **Sub-task graph incompleteness**: escape hatch to outer state card only on novel sub-tasks
- **Marker extraction brittleness**: trailer provides backup; handler waits on both-fail
- **Parallel-run divergence**: FR-008 requires convergence before cutover
- **Audit misclassification**: AC-007-03 defaults to keep; NFR-005 requires mechanism traceability
- **Performance**: NFR-003 200ms budget; sync file reads + in-memory only
- **Provider divergence**: NFR-002 parity tests; parallel-run comparison across providers
- **State machine schema churn**: version field + migration scripts

---

## Assumptions and Inferences

- Assumed: src/core/ substrate sufficient for new composers without cross-cutting refactor. Confidence: High.
- Inferred: both providers' existing injection mechanisms can carry composed card strings. Confidence: Medium (Codex path needs validation).
- Inferred: rule-based marker extraction covers high fraction of natural output. Confidence: Medium.
- Assumed: sub-task to skill mapping reuses REQ-0022 manifest with additive field. Confidence: Medium.
- Validated: abstract roundtable structure shared across analyze and bug-gather. Confidence: High.
- Inferred: core + workflow-specific definition split cleanly captures shared vs divergent content. Confidence: High.
