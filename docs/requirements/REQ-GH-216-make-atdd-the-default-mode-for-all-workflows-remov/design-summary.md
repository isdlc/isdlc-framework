# Design Summary: REQ-GH-216

## Executive Summary

REQ-GH-216 is a surgical config refactor that removes two CLI flags (`--atdd`, `--atdd-ready`) and replaces flag-scoped conditionals with a config-driven behavior surface in `.isdlc/config.json`. ATDD becomes the default everywhere Phase 05 runs or the discover atdd-bridge sub-phase fires, with four user-configurable knobs providing escape hatches for edge cases.

The design adds one new method (`ConfigService.getAtdd()`) to an existing module, introduces no new modules, and modifies ~20 existing files. All changes preserve existing ATDD protocol semantics — the change is purely about *when* ATDD is active (always, by default) and *how* users tune its behavior (via config file, not CLI flags).

## Key Design Decisions

| Decision | Choice | ADR |
|----------|--------|-----|
| ATDD activation model | Config-driven via `.isdlc/config.json`, defaults all-true | ADR-001 |
| GWT enforcement semantics | Hard-block when `require_gwt: true` | ADR-002 |
| Master kill switch precedence | `enabled: false` supersedes all sub-knobs | ADR-003 |
| Config schema validation | Trust-the-user (type-coerce, no strict schema) | (implicit, matches GH-231 convention) |
| Granularity | 4 global knobs (not per-phase) | (user decision) |
| Backward compat layer | None (framework unreleased) | (user decision) |

## Cross-Check Results

### Requirements ↔ Architecture

- All 9 FRs map to ADR-001 (config surface) or ADR-003 (kill switch).
- FR-005 (GWT hard-block) is covered by ADR-002.
- No requirement is unaddressed by the architecture.

### Architecture ↔ Module Design

- ADR-001's `ConfigService.getAtdd()` is realized in module design §1 (new accessor on existing module).
- ADR-002's hard-block behavior is realized in atdd-completeness-validator.cjs gating (module design §5).
- ADR-003's kill-switch precedence is realized uniformly: every ATDD-aware module checks `enabled` first.

### Module Design ↔ Interface Specification

- `ConfigService.getAtdd()` signature in interface-spec.md matches module design §1.
- CJS bridge and common.cjs helper contracts match module design §§2-3.
- Hook invocation contract (interface-spec.md) matches hook gating pattern (module design §5).

### Data Flow ↔ Error Taxonomy

- All data-flow boundaries (config read, prompt injection, checklist write) have corresponding error codes.
- Graceful degradation levels (error-taxonomy.md) align with knob combinations described in data-flow.md.

## Implementation Readiness

| Aspect | Status |
|--------|--------|
| Module boundaries | Clear — no circular dependencies |
| Interface contracts | Fully specified (getAtdd, CJS bridge, helper, prompt injection block) |
| Error paths | All defined with recovery strategies |
| Test strategy | 4 knobs × {true,false} matrix; core states covered by unit + integration tests |
| Dependencies | Zero new dependencies |
| Breaking changes | None (additive accessor on ConfigService) |

## Open Questions

**None**. All design decisions are made. All inferences are explicit in the "Assumptions and Inferences" sections of each artifact.

## Article Alignment

| Article | How the design aligns |
|---------|-----------------------|
| Article I (Specification Primacy) | Every design element traces to an FR; no speculative abstractions |
| Article II (Test-First Development) | Test tasks precede implementation tasks in Phase 05 → 06 ordering |
| Article V (Simplicity First) | One new method, no new modules, minimal config schema |
| Article X (Fail-Safe Defaults) | All config-read paths fail-open to all-true defaults |
| Article XIII (Module System Consistency) | getAtdd() is ESM; bridged via .cjs for hook consumers |
| Article XIV (State Management Integrity) | No new state files; atdd-checklist.json lifecycle documented |

## Handoff to Test Strategy (Phase 05)

**Critical test areas**:
1. ConfigService.getAtdd() — defaults, partial merge, error fail-open
2. Hook gating — each hook × {enabled=true, enabled=false}
3. Sub-knob precedence — enabled=false overrides sub-knobs
4. Phase 05/06 injection — atdd.* values present in delegation prompts
5. discover sub-phase 1d — runs by default, skipped when enabled=false

**Test data needs**:
- Fixtures with various `atdd` config states (missing, empty, partial, full, invalid types)
- Fixtures with GWT-formatted and non-GWT ACs
- Fixtures simulating RED→GREEN transitions
