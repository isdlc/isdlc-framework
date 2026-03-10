# REQ-0056: Architecture Overview

## 1. Architecture Options

### Option A: Config Read at Init Only (Selected)

**Summary**: `workflow-init.cjs` reads `.isdlc/process.json` at workflow start, computes the full phase array (active + skipped), and writes it to state.json. No further config reads during the workflow.

| Aspect | Assessment |
|--------|-----------|
| Pros | Simple, predictable, phase array visible upfront, no mid-workflow surprises |
| Cons | Cannot react to data discovered during earlier phases |
| Pattern Alignment | Matches existing `--light` flag behavior exactly |
| Verdict | **Selected** |

### Option B: Per-Boundary Re-evaluation (Eliminated)

**Summary**: Before each phase starts, re-read config and re-evaluate skip conditions against current state data.

| Aspect | Assessment |
|--------|-----------|
| Pros | Conditions can reference data from earlier phases |
| Cons | Phase array changes mid-workflow, harder to reason about, touches phase-advance.cjs, developer can't predict which phases will run |
| Pattern Alignment | No existing precedent in the framework |
| Verdict | **Eliminated** — developer explicitly said mid-workflow changes should not affect running workflows |

## 2. Selected Architecture

### ADR-001: Static Phase Array Override via Config File

**Status**: Accepted

**Context**: Developers need to customize which phases run per workflow type without forking the framework. The current `-light` flag is a binary, framework-imposed opinion.

**Decision**: Add `.isdlc/process.json` as an optional config file that declares phase arrays per workflow type. The framework reads it once at workflow init, computes active vs skipped phases, and locks the array for the duration of the workflow.

**Rationale**: Static override is the simplest mechanism that satisfies all requirements. No expression language, no condition evaluation, no runtime re-reads. The developer declares exactly what they want and gets exactly that.

**Consequences**:
- `workflow-init.cjs` gains ~40 lines for config reading and phase merging
- `phase-advance.cjs` gains ~10 lines to skip over `"skipped"` phases
- `common.cjs` phase status validation adds `"skipped"` as valid status
- `--light` flag continues to work but process.json takes precedence when both are present
- No new dependencies

### ADR-002: Skipped Phases in State Array

**Status**: Accepted

**Context**: When phases are removed from a workflow, we need to decide whether to omit them from the array or include them with a skip marker.

**Decision**: Include all default phases in the state.json phases array. Phases not in the config's phase list are marked with `status: "skipped"` and a `reason` field.

**Rationale**: Preserves full audit trail (Article VII). Enables the visual phase list showing all phases with skip markers. The existing `--light` approach (omit entirely) loses traceability.

**Consequences**:
- `phase-advance.cjs` must skip over `"skipped"` phases when finding the next phase
- State.json is slightly larger (includes skipped phase entries)
- `workflow-finalize.cjs` may need minor updates to handle skipped phases in summaries

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|-----------|---------|-----------|------------------------|
| JSON config format | N/A | Matches existing `.isdlc/` config conventions (state.json, roundtable.yaml is YAML but process config is structural, not narrative) | YAML (inconsistent — most .isdlc configs are JSON), JS module (overkill for static data) |

**Zero new dependencies** — pure JSON parsing with `fs.readFileSync` + `JSON.parse`.

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|---------------|
| I-1 | `workflow-init.cjs` | `.isdlc/process.json` | File read | JSON | Warn + fallback to defaults |
| I-2 | `workflow-init.cjs` | `state.json` | File write | JSON (active_workflow.phases, phase_status) | Existing atomic write |
| I-3 | `phase-advance.cjs` | `state.json` | File read/write | JSON (skip over skipped phases) | Existing error handling |
| I-4 | `workflow-init.cjs` | stdout | Console output | Text (visual phase list) | N/A |

### Data Flow

```
workflow-init.cjs:
  1. Read built-in default phases for workflow type (WORKFLOW_PHASES constant)
  2. Read .isdlc/process.json (if exists)
  3. If config has matching workflow type key:
     a. Validate phase names against full phase library
     b. Warn and ignore unknown phases
     c. Config phases → status "pending" or "in_progress"
     d. Default phases NOT in config → status "skipped", reason "process.json override"
     e. Config phases NOT in defaults → added as "pending" (recomposition)
  4. Merge with --light flag (--light applies first, process.json overrides)
  5. Print visual phase list
  6. Write to state.json (locked for workflow duration)

phase-advance.cjs:
  1. After gate validation passes for current phase
  2. Find next phase: scan forward in phases array, skip entries with status "skipped"
  3. If no more non-skipped phases → WORKFLOW_COMPLETE
  4. Otherwise → advance to next non-skipped phase
```

### Precedence Order

When multiple mechanisms affect phases:
1. `.isdlc/process.json` (highest — developer's explicit choice)
2. `--light` flag (applies only if no process.json for that workflow type)
3. Built-in defaults from `WORKFLOW_PHASES` (lowest)

## 5. Summary

| Metric | Value |
|--------|-------|
| Files modified | 4 (workflow-init.cjs, phase-advance.cjs, common.cjs, new template) |
| New files | 1 (src/isdlc/templates/process.json) |
| New dependencies | 0 |
| Risk level | Low — extends existing phase filtering pattern |
| Estimated scope | Light-medium |

### Key Decisions

| Decision | Rationale |
|----------|-----------|
| Static config, not condition language | Hackable > configurable — developer declares what they want |
| Include skipped phases in array | Article VII traceability + visual phase list |
| JSON format | Matches existing .isdlc conventions |
| process.json overrides --light | Developer's explicit config takes precedence over flags |

### Trade-offs Accepted

- Developer can skip any phase including implementation — full trust, no guardrails
- No runtime condition evaluation — simpler but less adaptive
- Mid-workflow config changes ignored — predictable but inflexible
