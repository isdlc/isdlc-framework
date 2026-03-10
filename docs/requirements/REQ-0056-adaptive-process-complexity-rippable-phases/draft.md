# Adaptive process complexity (rippable phases)

## Problem

The phase lifecycle is fixed regardless of model capability. As models improve, certain phases become less necessary — a sufficiently capable model may not need a separate architecture phase for a small feature, or may produce code that passes review on the first try. Harness engineering explicitly designs for "rippable" components that can be removed as models improve. iSDLC's `-light` flag is binary (skip arch+design or don't), not adaptive.

## Design

Extend the existing sizing/tier system with a **model confidence** dimension:

- After Phase 00 Quick Scan, assess not just scope but model confidence for each phase
- High confidence + small scope → auto-skip phase (with audit trail in state.json)
- Medium confidence → run phase in abbreviated mode (shorter iteration budget)
- Low confidence → full phase

**Phase-level skip conditions** (configurable in `.isdlc/process.json`):
```json
{
  "adaptive_phases": {
    "03-architecture": { "skip_when": "scope <= light AND no_new_dependencies" },
    "04-design": { "skip_when": "scope <= light AND single_module_change" },
    "08-code-review": { "abbreviate_when": "all_quality_checks_pass AND iteration_count == 1" }
  }
}
```

**Audit trail**: Skipped/abbreviated phases logged in state.json with reason, so the decision is traceable (Article VII)

**Override**: User can always force full process with `--strict`

## Builds On

- REQ-0011 (adaptive workflow sizing)
- #28 (progressive disclosure / lite mode)
- #97 (gate profiles)
- Existing tier system (trivial/light/standard/epic)

## Complexity

Medium — extends existing sizing infrastructure, main work is skip-condition evaluation and audit trail

## Priority

Should Have

**Labels**: enhancement, hackability, harness-engineering