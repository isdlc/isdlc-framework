# Test Strategy: Phase 4 Batch (REQ-0095, REQ-0096, REQ-0097, REQ-0126)

**Phase**: 05 - Test Strategy & Design
**Artifact Folder**: REQ-0095-impact-analysis-team-port
**Date**: 2026-03-22
**Constitutional Articles**: II (Test-First), VII (Traceability), IX (Gate Integrity), XI (Integration Testing)

---

## Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion library**: `node:assert/strict`
- **Module pattern**: ESM imports in test files, `createRequire` for CJS bridge tests
- **Current test count**: 1585 total (1582 passing, 3 pre-existing failures)
- **Existing patterns**: `tests/core/teams/specs.test.js`, `tests/core/teams/registry.test.js`, `tests/core/teams/bridge-team-specs.test.js`
- **Naming convention**: Test IDs with prefix (TS-, TR-, TB-), FR/AC references in comments

## Strategy for This Batch

- **Approach**: Extend existing test suite following established patterns from REQ-0094
- **New test files**: 5 (see Test Files below)
- **Coverage target**: 100% of acceptance criteria across all 4 requirements
- **Estimated new test count**: ~55 tests

---

## Test Pyramid

| Level | Count | Scope |
|-------|-------|-------|
| Unit tests | ~40 | Instance configs (field values, schema, immutability), registry lookup, injection planner logic |
| Integration tests | ~10 | Registry-to-instance roundtrip, bridge-to-ESM parity, planner manifest resolution |
| E2E tests | 0 | Not applicable (pure data modules, no runtime or UI) |

**Rationale**: These modules are pure data objects and stateless functions. Unit tests provide the highest value. Integration tests validate the registry lookup and CJS bridge wiring. No E2E tests are needed because there is no user-facing behavior -- these modules are consumed programmatically by the orchestrator.

---

## Test Files

| File | Prefix | Covers | Est. Tests |
|------|--------|--------|------------|
| `tests/core/teams/instances.test.js` | TI- | REQ-0095 FR-001..FR-004, REQ-0096 FR-001..FR-003, REQ-0097 FR-001..FR-004 | ~25 |
| `tests/core/teams/instance-registry.test.js` | IR- | Instance registry (getTeamInstance, listTeamInstances, getTeamInstancesByPhase) | ~10 |
| `tests/core/teams/bridge-team-instances.test.js` | IB- | CJS bridge parity for team instances | ~5 |
| `tests/core/skills/injection-planner.test.js` | IP- | REQ-0126 FR-001..FR-004 | ~10 |
| `tests/core/skills/bridge-skill-planner.test.js` | PB- | CJS bridge parity for skill planner | ~5 |

---

## Test Conventions (from REQ-0094 patterns)

1. **Imports**: `import { describe, it } from 'node:test'; import assert from 'node:assert/strict';`
2. **Test ID format**: `{PREFIX}-NN: description (AC-NNN-NN)` in the `it()` string
3. **Section headers**: FR/AC grouping with `// ---------------------------------------------------------------------------` separators
4. **Positive/Negative grouping**: Separate `describe` blocks for positive and negative cases
5. **CJS bridge tests**: Use `createRequire(import.meta.url)` to test CJS bridges from ESM test runner
6. **Frozen object validation**: Test `Object.isFrozen()`, mutation rejection, and property addition rejection

---

## Flaky Test Mitigation

- **No async side effects**: All instance config tests are synchronous (frozen object assertions)
- **No file I/O in unit tests**: Instance configs are pure data; no disk reads needed
- **Injection planner tests**: Use explicit `options.manifestPath` / `options.externalManifestPath` to point at test fixtures rather than relying on project-root resolution
- **CJS bridge tests**: Use `createRequire` for deterministic module resolution
- **No shared mutable state**: Each test function is independent; no `before`/`after` hooks that could leak state
- **Deterministic ordering**: Tests within each `describe` block are independent and order-insensitive

---

## Performance Test Plan

- **Not applicable for this batch**: These modules are pure data lookups and manifest JSON reads. There is no performance-sensitive code path.
- **Injection planner**: The manifest files are <50KB JSON. File read latency is negligible. No performance benchmarks are warranted.
- **If future concern arises**: Add a timing assertion that `computeInjectionPlan()` completes in <50ms (well within the ~5ms expected).

---

## Security Considerations

- **No secrets**: These modules handle team composition metadata and skill manifest lookups. No credentials, tokens, or user data involved.
- **Path validation**: The injection planner resolves manifest file paths. Tests verify that missing manifests produce empty plans (fail-open) rather than exposing filesystem errors.
- **Input validation**: Registry functions throw descriptive errors on invalid input. Negative tests verify this behavior.

---

## Test Data Strategy

### Instance Config Tests
- **Positive data**: Expected field values from requirements specs (instance_id, team_type, members, output_artifact, etc.)
- **Negative data**: Unknown instance IDs, null/undefined inputs, empty strings
- **Boundary data**: Not applicable (enum-like field values, no numeric ranges)

### Injection Planner Tests
- **Fixture files**: Create minimal JSON fixtures for skills-manifest.json and external-skills-manifest.json in `tests/core/skills/fixtures/`
- **Positive data**: Valid workflow/phase/agent combinations that resolve skills
- **Negative data**: Missing manifests, unknown agents, empty ownership sections
- **Boundary data**: Skill content at exactly 10000 chars (at threshold) and 10001 chars (above threshold) to test delivery_type forcing

---

## Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Acceptance criteria coverage | 100% (all 30 ACs) | Article VII requires complete traceability |
| Line coverage (new code) | >=80% | Article II standard threshold |
| Branch coverage | >=80% | Covers all conditional paths in planner |
| Mutation score | >=80% | Article XI requirement |

---

## GATE-04 Checklist

- [x] Test strategy covers unit, integration (E2E, security, performance addressed as N/A with rationale)
- [x] Test cases exist for all requirements (30 ACs across 4 REQs)
- [x] Traceability matrix complete (100% requirement coverage)
- [x] Coverage targets defined (80% line, 80% branch, 80% mutation)
- [x] Test data strategy documented (fixtures for planner, inline values for configs)
- [x] Critical paths identified (registry lookup, planner fail-open, bridge parity)
