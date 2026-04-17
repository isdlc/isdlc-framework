# Code Review Report: REQ-GH-253 — Context-Manager Hooks

**Reviewer**: QA Engineer (Phase 08)
**Date**: 2026-04-15
**Scope**: Full code review of state-machine-driven composition system for analyze + bug-gather roundtables
**Review Mode**: Full Scope (implementation_loop_state not completed in Phase 06)

---

## Review Summary

| Category | Status |
|----------|--------|
| Logic correctness | PASS |
| Error handling | PASS |
| Security | PASS |
| Code quality | PASS (1 low finding) |
| Test quality | PASS (589 pass, 0 fail, 30 skip) |
| Tech stack compliance | PASS |
| Constitutional compliance | PASS |
| Specification fidelity (NFR-005) | PASS |
| Build integrity | PASS (0 GH-253-related failures) |

**Overall Verdict**: APPROVED

---

## 1. Logic Correctness

### 1.1 State Machine (state-machine.js)

- **Immutable graph, mutable cursor** pattern is correctly implemented. `deepFreeze` + `JSON.parse(JSON.stringify(...))` ensures the definition graph cannot be mutated after initialization.
- `evaluateTransitions()` correctly uses first-match-wins semantics for transition evaluation (line 379).
- Sub-task dependency resolution in `findActiveSubTask()` correctly checks `depends_on` array and only activates tasks whose dependencies are all complete.
- `isTriggerSatisfied()` handles all trigger types: `session_start`, `first_exchange`, `after_first_user_reply`, sub-task completion markers, and boolean flag lookups.
- `evaluateCondition()` correctly parses AND/OR combinations, tier-based conditions, equality/inequality, and boolean flag lookups.
- Transition result correctly includes `clearAcceptedDomains` for AMENDING state and `externalDelegation` for dispatch transitions.

**Finding**: The `evaluateTransitions()` method at line 356 references `definition.states[currentStateName]` (the unfrozen original) for sub-task evaluation while the rest of the method uses `frozenDef`. This is intentional (frozen arrays work for reads) and documented in the comment. However, this creates a closure over the `definition` parameter that persists for the lifetime of the instance. No bug -- the original definition is not mutated elsewhere -- but the design intent should be noted.

### 1.2 Definition Loader (definition-loader.js)

- Override resolution follows ADR-007 correctly: user override dir checked first, shipped dir as fallback.
- `deepMerge()` correctly replaces arrays (not concatenates) and recursively merges objects.
- Schema validation is advisory only (fail-open per Article X).
- `loadDefinition()` correctly composes core + workflow with merged result validation.

### 1.3 Card Composers (state-card-composer.js, task-card-composer.js)

- State card composer correctly loads templates with override resolution, merges personas and tools from template and context, resolves rendering mode with correct precedence (context > template > default).
- Task card composer correctly queries skill manifest via `computeInjectionPlan()` with the new `subTask` parameter, merges template skills with manifest skills, applies max_skills_total budget, and sorts with shipped-skill boost.
- Both composers enforce max line budgets (40 for state, 30 for task).
- Both composers return minimal fallback cards on any error.

### 1.4 Rolling State (rolling-state.js)

- `create()` correctly initializes all schema fields with defaults and pre-populates `sub_task_completion` from the definition.
- `update()` correctly implements trailer-wins conflict resolution (AC-003-03): markers applied first, trailer applied second.
- Returns new objects (immutable update pattern) -- original state is never mutated.
- `applyTrailerFields()` correctly maps trailer `sub_task` + `status: complete` to `sub_task_completion[subTaskId] = true` and sets well-known boolean flags (e.g., `scan_complete`).

### 1.5 Trailer Parser (trailer-parser.js)

- Correctly uses `lastIndexOf` for start delimiter (handles multiple trailer blocks, takes last one).
- Validates all required fields per trailer.schema.json.
- Validates status enum against the defined set.
- `stripTrailer()` correctly handles partial trailers (start delimiter without end).
- Correctly handles `sub_task: null` and empty string cases.

### 1.6 Marker Extractors (markers/*.js)

- All 6 extractors follow identical patterns: regex arrays for detection, return empty object on no signals.
- Dispatch index correctly routes by sub-task ID with both upper and lowercase variants.
- No false-positive risk identified -- patterns are specific enough for their respective domains.

### 1.7 CJS Bridge (roundtable.cjs)

- Lazy ESM module loading with caching is correctly implemented.
- `initializeRoundtable()` correctly checks `migration_mode` from config and returns null for "prose" mode (T040).
- `composeForTurn()` correctly composes state card + task card combination.
- `processAfterTurn()` correctly sequences: trailer parse -> marker extraction -> rolling state update -> transition evaluation.
- Every step has independent try/catch with fail-open behavior.

---

## 2. Error Handling (Article X — Fail-Safe Defaults)

All modules implement comprehensive fail-open behavior:

| Module | Fail-Open Pattern | Verified |
|--------|------------------|----------|
| definition-loader.js | Returns null on load/parse/validate failure | Yes |
| state-machine.js | Returns null on initialization validation failure | Yes |
| state-card-composer.js | Returns minimal card text on any error | Yes |
| task-card-composer.js | Returns minimal card text on any error | Yes |
| rolling-state.js | Returns shallow copy of original state when no updates | Yes |
| trailer-parser.js | Returns null on parse failure | Yes |
| markers/index.js | Returns empty object for unknown sub-task or error | Yes |
| roundtable.cjs | Each step has independent try/catch, returns safe defaults | Yes |
| config-service.js | Returns ROUNDTABLE_DEFAULTS on any error | Yes |
| config.cjs | Returns ROUNDTABLE_DEFAULTS on any error | Yes |

**No blocking findings.** The fail-open chain is complete from bridge initialization through per-turn composition.

---

## 3. Security Review

| Check | Result |
|-------|--------|
| Path traversal | No user-controlled paths reach fs operations. All paths are constructed from known constants (SHIPPED_DIR, SCHEMA_DIR) or validated config keys. |
| Injection | No `eval()`, no dynamic `require()` with user input, no template string interpolation into executable context. |
| Secrets exposure | No credentials, tokens, or sensitive data in any new module. |
| Prototype pollution | `deepMerge()` iterates `Object.keys()` only. `deepFreeze()` freezes all nested objects. `Object.assign()` targets freshly-copied objects only. |
| Regex DoS | Marker extractor patterns are bounded (no catastrophic backtracking). All use simple alternations and non-greedy quantifiers where applicable. |

**No blocking findings.**

---

## 4. Code Quality

### 4.1 ESM/CJS Consistency (Article XIII)

- New core modules (`definition-loader.js`, `state-machine.js`, `state-card-composer.js`, `task-card-composer.js`, `rolling-state.js`, `trailer-parser.js`, `markers/*.js`) are all ESM. Correct for `src/core/`.
- `roundtable.cjs` is CJS bridge, following the established ESM/CJS bridge pattern (same as `config.cjs`). Correct.
- Config additions in `config-service.js` (ESM) and `config.cjs` (CJS bridge) maintain parity. Correct.
- Compliance engine additions in `engine.cjs` are CJS. Correct for `src/core/compliance/`.

### 4.2 Naming

- Module names follow the existing `kebab-case.js` convention.
- Function names are descriptive and follow camelCase.
- Constants use UPPER_SNAKE_CASE.
- Schema files follow `name.schema.json` convention.
- State card templates follow `state-name.card.json` convention.
- Task card templates follow `task-name.task-card.json` convention.

### 4.3 DRY

**Finding (LOW — CR-001)**: `safeReadJson()` is duplicated in `definition-loader.js`, `state-card-composer.js`, and `task-card-composer.js` (identical implementation). Consider extracting to a shared utility. This is a minor DRY violation that does not warrant blocking.

- **Severity**: Low
- **Category**: Code quality / DRY
- **Files**: `src/core/roundtable/definition-loader.js:44-53`, `src/core/roundtable/state-card-composer.js:42-51`, `src/core/roundtable/task-card-composer.js:47-56`
- **Suggestion**: Extract to a shared `src/core/roundtable/utils.js` module. Not blocking.

### 4.4 JSDoc and Traces

All public functions have JSDoc with `@param`, `@returns`, and `Traces:` annotations linking to FRs/ACs. This is excellent for Article VII (Artifact Traceability).

### 4.5 Single Responsibility

Each module has a clear, single responsibility:
- `definition-loader.js`: load and merge definitions
- `state-machine.js`: drive state progression
- `state-card-composer.js`: compose outer affordance cards
- `task-card-composer.js`: compose inner task cards
- `rolling-state.js`: manage per-session rolling state
- `trailer-parser.js`: parse/strip trailers
- `markers/*.js`: per-sub-task marker extraction
- `roundtable.cjs`: CJS bridge for handler integration

---

## 5. Test Quality

| Metric | Value |
|--------|-------|
| Total GH-253 tests | 619 |
| Pass | 589 |
| Skip | 30 |
| Fail | 0 |
| NFR-003 performance | avg 0.09ms, P95 0.03ms (budget 200ms) |
| Provider parity tests | 10/10 pass |
| Regression tests | 29/29 pass |

The 30 skipped tests are appropriately documented (conditional mechanism tests that depend on runtime integration, not unit-testable in isolation).

All 66 test failures in the full suite are pre-existing (memory-store-adapter, embedding infrastructure, profile-loader, prompt-format agent count, README agent count). Zero GH-253-introduced failures.

---

## 6. Constitutional Compliance

### Article I (Specification Primacy)

Requirements-spec.md defines 8 FRs and 5 NFRs. The implementation covers:
- FR-001 (Two-Layer Affordance Model): state-card-composer.js + task-card-composer.js
- FR-002 (State-Machine-Driven Composition): state-machine.js + definition-loader.js + 3 definition files
- FR-003 (Hybrid Rolling State Updates): rolling-state.js + trailer-parser.js + markers/*
- FR-004 (Skills at Sub-Task Granularity): task-card-composer.js + injection-planner.js subTask filtering
- FR-005 (Provider Parity): roundtable.cjs bridge + claude/codex runtime.js composedCard injection
- FR-006 (Boundary — Analyze + Bug-Gather Only): isdlc.md sections for both workflows
- FR-007 (Simplification via Bucketed Audit): audit-traceability.md documents 42 + 46 deletions
- FR-008 (Phased Migration): migration_mode config in config-service.js

**PASS**: All 8 FRs implemented with traceability.

### Article II (Test-First Development)

Test strategy was designed in Phase 05 (12 scaffolds, 58 test.skip cases). Implementation filled tests. 589 pass, 0 fail.

**PASS**.

### Article V (Simplicity First)

The implementation uses straightforward patterns:
- Simple JSON definition files instead of a complex DSL
- Regex-based marker extraction instead of ML/NLP
- First-match-wins transition evaluation
- Immutable graph + mutable cursor state machine pattern
- No external dependencies added

**PASS**.

### Article VII (Artifact Traceability)

All modules have JSDoc `Traces:` annotations linking to FRs/ACs. The audit-traceability.md document maps every deleted prose section to its mechanism destination with verification.

**PASS**.

### Article VIII (Documentation Currency)

- `isdlc.md` updated with STATE-MACHINE-DRIVEN COMPOSITION sections for both analyze and bug-gather workflows.
- roundtable-analyst.md reduced from 889 to 733 lines (bucket-1/5 deletions).
- bug-roundtable-analyst.md reduced from 573 to 343 lines (bucket-1/5 deletions).
- audit-traceability.md documents every deletion with mechanism destination.

**PASS**.

### Article IX (Quality Gate Integrity)

All required artifacts exist:
- code-review-report.md (this document)
- 6 JSON schemas in src/core/roundtable/schemas/
- 3 definition files in src/isdlc/config/roundtable/
- 9 state card templates + 6 task card templates
- 7 core modules + 1 CJS bridge + 6 marker extractors
- Audit traceability log with 88 entries

**PASS**.

### Article X (Fail-Safe Defaults)

Verified in Section 2 above. Every module implements fail-open. The handler falls back to prose protocol on any failure.

**PASS**.

### Article XIII (Module System Consistency)

Verified in Section 4.1 above. ESM for src/core/, CJS bridges for hook/handler integration.

**PASS**.

---

## 7. Specification Fidelity (NFR-005)

The audit-traceability.md log documents 88 prose deletions (42 from roundtable-analyst.md, 46 from bug-roundtable-analyst.md) across 5 buckets:

| Bucket | Count | Mechanism |
|--------|-------|-----------|
| B1 (already enforced by code) | 12 | compliance engine hooks |
| B2 (expressible as validator) | 16 | compliance engine rules (conversational-rules.json) |
| B3 (template-bound) | 22 | definitions (core.json, workflow JSON, state cards) |
| B5 (dead/dormant/duplicate) | 38 | dead/deleted |
| **Total** | **88** | |

Every B1/B2/B3 entry has a named mechanism destination and verification column. B5 entries are confirmed dead/dormant with rationale.

The 8 new check types added to the compliance engine (`schema-fields`, `accept-amend-parser`, `confirmation-state-tracking`, `confidence-indicator`, `framework-internals-guard`, `contributing-persona-rules`, `persona-loading-validation`, `dispatch-payload-fields`) correspond to B2 bucket entries.

**No specification lost.** NFR-005 is satisfied.

---

## 8. Cross-Cutting Concerns

### 8.1 Integration Coherence

The modules form a clean dependency graph:

```
isdlc.md (handler instructions)
  -> roundtable.cjs (CJS bridge)
    -> definition-loader.js (loads definitions)
    -> state-machine.js (drives transitions)
    -> state-card-composer.js (composes state cards)
    -> task-card-composer.js (composes task cards)
      -> injection-planner.js (skill resolution with subTask filter)
      -> config-service.js (max_skills_total budget)
    -> rolling-state.js (manages session state)
    -> trailer-parser.js (parses LLM trailers)
    -> markers/index.js (dispatches marker extraction)
      -> 6 per-sub-task extractors
  -> claude/runtime.js (composedCard injection)
  -> codex/runtime.js (composedCard injection)
```

No circular dependencies. Provider runtimes only receive a `composedCard` string -- they are unaware of the composition internals.

### 8.2 Provider Parity (FR-005)

- Claude runtime: appends `composedCard` after instructions, before skills (line 75-78 of claude/runtime.js)
- Codex runtime: appends `composedCard` to projection bundle instructions content (line 228-231 of codex/runtime.js)
- Both use the same bridge for composition -- identical card content.

### 8.3 Backward Compatibility

- `migration_mode: "prose"` config causes `initializeRoundtable()` to return null, which causes the handler to skip all composition steps and fall through to the existing prose protocol. No regression.
- `injection-planner.js` subTask parameter is optional -- existing callers without subTask continue to work unchanged (the `!subTask` guard at line 103 ensures all skills pass).

---

## 9. Blast Radius Cross-Check

Impact-analysis.md does not exist in the artifact folder. This is not unusual for this workflow's timeline (impact analysis was folded into the architecture phase rather than being a standalone artifact). The review scope covers all files listed in the delegation prompt, which aligns with the implementation task list.

---

## 10. Build Integrity

| Check | Result |
|-------|--------|
| npm test (full suite) | 1857 pass, 66 fail, 16 skip |
| GH-253 specific failures | 0 |
| Pre-existing failures | 66 (memory-store-adapter, embedding infrastructure, profile-loader, prompt-format) |
| npm run test:core | 1613 pass, 39 fail |
| npm run test:providers | 256 pass, 0 fail |

All 66 failures are pre-existing and unrelated to GH-253. The build compiles and runs cleanly.

---

## Findings Summary

| ID | Severity | Category | File(s) | Description |
|----|----------|----------|---------|-------------|
| CR-001 | Low | Code quality / DRY | definition-loader.js, state-card-composer.js, task-card-composer.js | `safeReadJson()` duplicated across 3 files. Consider extracting to shared utility. |

**Blocking findings**: 0
**High findings**: 0
**Medium findings**: 0
**Low findings**: 1

---

## QA Sign-Off

**Verdict**: APPROVED

The GH-253 implementation is well-structured, follows all applicable constitutional articles, implements comprehensive fail-open behavior (Article X), maintains ESM/CJS consistency (Article XIII), preserves specification fidelity through auditable mechanism migration (NFR-005), and introduces zero test regressions. The single low-severity DRY finding is non-blocking.

Ready to proceed to Phase 09 (Independent Validation).

---

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
