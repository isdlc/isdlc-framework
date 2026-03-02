# Quick Scan: Coverage Threshold Discrepancy

**Generated**: 2026-02-19T20:15:00Z
**Bug ID**: #52
**Phase**: 00-quick-scan

---

## Problem Statement

Article II of the iSDLC Framework Constitution mandates minimum coverage thresholds:
- Unit tests: **100% line coverage**
- Integration tests: **100% of cross-module interactions**
- Critical paths: **100% coverage**

However, Phase 16 (Quality Loop) in `iteration-requirements.json` enforces only **80% minimum coverage** (`min_coverage_percent: 80`). This creates a gap: code can pass all framework gates while violating the constitutional requirement.

**Impact**: The constitution is treated as aspirational guidance with no enforcement mechanism.

---

## Scope Estimate

**Estimated Scope**: **SMALL** (3-5 files)
**File Count Estimate**: ~5 files
**Confidence**: HIGH
**Complexity**: Low (configuration change, no refactoring)

### Rationale

This is a localized configuration fix affecting:
1. Coverage threshold configuration
2. Intensity-based dispatching
3. Constitutional alignment documentation

No core logic changes required — only threshold values and documentation.

---

## Current State - Threshold Values

### Constitution (docs/isdlc/constitution.md)

**Article II: Test-First Development**

```
2. Minimum coverage thresholds:
   - Unit tests: 100% line coverage
   - Integration tests: 100% of cross-module interactions
   - Critical paths: 100% coverage (installation, hook execution, gate enforcement)
```

**Status**: Aspirational target, not enforced.

### Phase 16 Enforcement (src/claude/hooks/config/iteration-requirements.json)

**Phase 16 - Quality Loop**

```json
"16-quality-loop": {
  "test_iteration": {
    "enabled": true,
    "max_iterations": 10,
    "circuit_breaker_threshold": 3,
    "success_criteria": {
      "all_tests_passing": true,
      "lint_passing": true,
      "type_check_passing": true,
      "no_critical_vulnerabilities": true,
      "min_coverage_percent": 80
    }
  }
}
```

**Status**: Currently enforces 80% across all workflows.

### Phase 06 Enforcement (src/claude/hooks/config/iteration-requirements.json)

**Phase 06 - Implementation**

```json
"06-implementation": {
  "test_iteration": {
    "success_criteria": {
      "all_tests_passing": true,
      "min_coverage_percent": 80
    }
  }
}
```

**Status**: Also enforces 80%.

### Existing Intensity System (src/isdlc/config/workflows.json)

The **feature workflow** already defines intensity-based performance budgets:

```json
"sizing": {
  "enabled": true,
  "thresholds": {
    "light_max_files": 5,
    "epic_min_files": 20
  },
  "light_skip_phases": ["03-architecture", "04-design"],
  "performance_budgets": {
    "light": { "max_total_minutes": 30, ... },
    "standard": { "max_total_minutes": 90, ... },
    "epic": { "max_total_minutes": 180, ... }
  }
}
```

**Status**: Intensity framework exists but is NOT applied to coverage thresholds.

---

## Recommended Fix - Option C

**Tiered enforcement by intensity level:**

- **Light** (≤5 files): 60% minimum coverage
- **Standard** (6-20 files): 80% minimum coverage
- **Epic** (≥20 files): 95% minimum coverage

**Rationale**:
- Matches the existing intensity system in workflows.json
- Constitution remains the north star (95% is the aspiration for complex work)
- Pragmatic enforcement prevents false blocking on simple bug fixes or refactors
- Enables parallel dogfooding (Pair 1 can use light intensity; Pair 2 can use standard)

---

## Keyword Matches

| Keyword | File Matches | Notes |
|---------|--------------|-------|
| `min_coverage_percent` | 5 files | config/iteration-requirements.json (2 hits), gate-requirements-injector.cjs, BACKLOG.md, docs/ARCHITECTURE.md |
| `Article II` | 2 files | constitution.md, tasks.md |
| `intensity` / `sizing` | 3 files | workflows.json (3+ hits), BACKLOG.md, agent_modifiers |
| `coverage` | 8+ files | Scattered in docs and config |

---

## Affected Components

### Primary Files (Must Change)

1. **src/claude/hooks/config/iteration-requirements.json**
   - Add intensity-based `min_coverage_percent` values to Phase 06 and Phase 16
   - Structure: conditionally apply 60/80/95 based on workflow intensity

2. **docs/isdlc/constitution.md** (Optional but recommended)
   - Add clarifying note under Article II explaining intensity-based enforcement
   - Document that 95% is target for critical/complex workflows, lower thresholds for light work

### Secondary Files (Informational)

3. **src/claude/hooks/lib/gate-requirements-injector.cjs**
   - May need enhancement to display intensity-aware coverage thresholds in gate output
   - Currently displays as "coverage >= {coverage}%" — could show "(light: 60%, standard: 80%, epic: 95%)"

4. **src/claude/hooks/lib/common.cjs**
   - Check if intensity detection logic exists
   - May need utility function to resolve coverage threshold based on project intensity

5. **BACKLOG.md**
   - Already documents the issue and recommended approach

### No Changes Required

- Hook execution logic (gate-blocker.cjs, test-watcher.cjs)
- Phase state machine
- Artifact generation

---

## Risk Assessment

**Risk Level**: LOW

### Why Low Risk

1. **Scope**: Isolated to configuration values
2. **Backward Compatibility**: Existing projects with `min_coverage_percent: 80` in Phase 16 will continue to work (standard intensity default)
3. **Gate Logic**: No changes to gate-blocker enforcement — only threshold values change
4. **Testing**: Can be validated with unit tests in common.cjs (intensity detection) and gate-requirements-injector.cjs (threshold lookup)

### Potential Issues

1. **Intensity Detection**: Need reliable way to determine workflow intensity at gate-check time
   - Stored in state.json? Passed as environment variable? Derived from file count?
2. **Backward Compatibility**: Projects with custom `min_coverage_percent` values in state.json may be affected
3. **Documentation**: Must clearly explain that threshold applies based on detected intensity, not hardcoded per-phase

---

## Questions for Requirements Phase

1. **Intensity Detection**: How should the gate-blocker know the current intensity level when enforcing Phase 06 and Phase 16?
   - Option A: Store in state.json during phase 00 or 01
   - Option B: Derive from file count estimate at gate-check time
   - Option C: Pass as environment variable

2. **Enforcement**: Should light intensity workflows with <60% coverage still pass gates, or hard-fail?
   - Current behavior: hard-fail if threshold not met
   - Desired: Same (fail-safe)

3. **Documentation in Constitution**: Should Article II be updated to explicitly state intensity-based enforcement, or keep as aspirational?

4. **Phase 07 (Testing)**: Should integration test coverage also have tiered thresholds, or stay fixed?
   - Currently Phase 07 has `min_coverage_percent: 70` (line 279 in iteration-requirements.json)

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-19T20:15:00Z",
  "search_duration_ms": 2850,
  "keywords_searched": 6,
  "files_matched": 15,
  "scope_estimate": "small",
  "confidence": "high",
  "complexity_level": "low",
  "option_selected": "C - Tiered enforcement by intensity",
  "discovery_status": "completed"
}
```

---

## References

- **Constitution**: /Users/vihang/projects/isdlc/isdlc-framework/docs/isdlc/constitution.md (Article II)
- **Threshold Config**: /Users/vihang/projects/isdlc/isdlc-framework/src/claude/hooks/config/iteration-requirements.json (lines 219, 279, 676)
- **Intensity System**: /Users/vihang/projects/isdlc/isdlc-framework/src/isdlc/config/workflows.json (sizing section, lines 43-73)
- **Backlog**: /Users/vihang/projects/isdlc/isdlc-framework/BACKLOG.md (#52, line 266)

---

**Next Phase**: 01-requirements
**Estimated Duration**: 2-3 hours (includes intensity detection design + implementation)
