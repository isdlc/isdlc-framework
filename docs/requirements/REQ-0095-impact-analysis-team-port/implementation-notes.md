# Implementation Notes: Phase 4 Batch (REQ-0095, REQ-0096, REQ-0097, REQ-0126)

**Phase**: 06 - Implementation
**Date**: 2026-03-22
**Artifact Folder**: REQ-0095-impact-analysis-team-port

---

## Summary

Implemented 4 requirements in a single batch:

1. **REQ-0095**: Impact analysis team instance config (fan_out, M1-M4, fail-open M4 policy)
2. **REQ-0096**: Tracing team instance config (fan_out, T1-T3, no fail-open)
3. **REQ-0097**: Quality loop team instance config (dual_track, Track A/B, fan-out policy, retry)
4. **REQ-0126**: Skill injection planner (computeInjectionPlan with manifest resolution)

Plus shared infrastructure: instance registry, CJS bridges, and test fixtures.

## Files Created

### Production Code (7 files)

| File | Lines | Purpose |
|------|-------|---------|
| `src/core/teams/instances/impact-analysis.js` | 28 | Frozen impact_analysis instance config |
| `src/core/teams/instances/tracing.js` | 18 | Frozen tracing instance config |
| `src/core/teams/instances/quality-loop.js` | 33 | Frozen quality_loop instance config |
| `src/core/teams/instance-registry.js` | 68 | Map-based registry with phase index |
| `src/core/skills/injection-planner.js` | 137 | Provider-neutral injection plan computation |
| `src/core/bridge/team-instances.cjs` | 43 | CJS bridge-first-with-fallback for instances |
| `src/core/bridge/skill-planner.cjs` | 33 | CJS bridge-first-with-fallback for planner |

### Test Code (5 files + 2 fixtures)

| File | Tests | Prefix |
|------|-------|--------|
| `tests/core/teams/instances.test.js` | 30 | TI- |
| `tests/core/teams/instance-registry.test.js` | 11 | IR- |
| `tests/core/teams/bridge-team-instances.test.js` | 5 | IB- |
| `tests/core/skills/injection-planner.test.js` | 12 | IP- |
| `tests/core/skills/bridge-skill-planner.test.js` | 4 | PB- |
| **Total** | **62** | |

Fixtures:
- `tests/core/skills/fixtures/fixture-skills-manifest.json`
- `tests/core/skills/fixtures/fixture-external-manifest.json`

## Key Design Decisions

### Deep Freeze Pattern

Instance configs use `Object.freeze()` at every nesting level (members arrays, policy objects, tracks). This follows the same pattern as the team spec objects from REQ-0094 but is more aggressive because instance configs have deeper nesting (e.g., `policies.fail_open.tier_1`).

### Phase Index in Registry

The instance registry builds a phase-to-instances mapping at module load from each instance's `input_dependency` field. This provides O(1) phase-based lookup without requiring a scan of all instances. The `getTeamInstancesByPhase()` function uses this index.

### Injection Planner -- Fail-Open Design

The planner uses `safeReadJSON()` which catches all errors (missing file, parse error) and returns null. This means:
- Missing skills-manifest.json produces empty `builtIn` array
- Missing external-skills-manifest.json produces empty `external` array
- Both missing produces empty plan `{ builtIn: [], external: [], merged: [] }`
- The planner never throws (per Article X: Fail-Safe Defaults)

### Injection Planner -- Content Length Override

The `contentLengthOverrides` option allows tests to simulate large skill content without creating actual large files. When a skill's content length exceeds 10,000 characters, `deliveryType` is forced to `'reference'` per FR-003 AC-003-03. At exactly 10,000, the original `deliveryType` is preserved (boundary behavior tested by IP-10).

### Built-In Skill File Paths

The planner sets `file: null` for built-in skills because the exact SKILL.md path cannot be derived from the skills-manifest.json alone (it contains skill_id -> agent_name mappings, not file paths). The file path resolution is the provider adapter's responsibility, which has filesystem access and can scan the `src/claude/skills/` directory.

## Test Results

- **New tests**: 62 (all passing)
- **Core test suite**: 537 pass, 0 fail
- **Main test suite**: 1582 pass, 3 fail (pre-existing)
- **Regressions**: 0

## Constitutional Compliance

| Article | Status | Evidence |
|---------|--------|----------|
| I (Specification Primacy) | Compliant | All ACs from REQ-0095..0097, REQ-0126 implemented exactly per spec |
| II (Test-First Development) | Compliant | Tests written before production code, 62 tests, all passing |
| III (Security by Design) | Compliant | No secrets, input validation on registry lookups, fail-open on missing files |
| V (Simplicity First) | Compliant | Pure data objects, minimal logic, follows existing patterns |
| VII (Artifact Traceability) | Compliant | All test IDs reference FR/AC numbers, JSDoc comments trace to requirements |
| VIII (Documentation Currency) | Compliant | JSDoc on all exports, module-level requirement references |
| IX (Quality Gate Integrity) | Compliant | 62 tests pass, 0 regressions, implementation notes written |
| X (Fail-Safe Defaults) | Compliant | Frozen configs, fail-open planner, descriptive error messages |
| XIII (Module System Consistency) | Compliant | ESM production + CJS bridges following team-specs.cjs pattern |
