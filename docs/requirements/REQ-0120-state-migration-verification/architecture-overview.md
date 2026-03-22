# Architecture Overview: State Migration Verification

**Item**: REQ-0120 | **GitHub**: #184 | **CODEX**: CODEX-051

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Dedicated verification tests | Separate test files in tests/verification/migration/ | Clear separation from unit tests, real-world scenarios | Additional test directory | **Selected** |
| B: Extend existing unit tests | Add cases to tests/core/state/schema.test.js | Fewer files | Mixes unit and integration concerns, file grows large | Eliminated |
| C: Migration test framework | Generic migration tester with config | Reusable for future migrations | Over-engineered for current needs | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-026: Verification-Level Migration Tests

- **Status**: Accepted
- **Context**: `src/core/state/schema.js` (77 lines) has `migrateState()` with 1 migration. `tests/core/state/schema.test.js` (137 lines) covers basic cases. Integration-level verification — real-world snapshots, in-flight workflows, doctor repair — needs a dedicated test location.
- **Decision**: Create `tests/verification/migration/` with test files that exercise migration with real-world state snapshots, verify in-flight workflow preservation, and test doctor repair detection.
- **Rationale**: Verification tests operate at a higher level than unit tests. They use realistic state snapshots rather than minimal test objects, catching issues that unit tests miss (e.g., field ordering, optional field preservation).
- **Consequences**: Both unit tests (tests/core/) and verification tests (tests/verification/) cover migration — unit tests for logic correctness, verification tests for real-world compatibility.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| `node:test` | Framework standard test runner |
| Real-world state snapshots | Captured from actual framework runs |
| Core schema.js imports | Direct migrateState() calls |
| Core doctor imports | doctorCore() for repair detection |

## 4. Integration Architecture

### File Layout

```
tests/verification/migration/
  migration-paths.test.js     (v0→v1, future v1→v2, missing version, no-op)
  in-flight-state.test.js     (mid-workflow migration preservation)
  doctor-repair.test.js       (incompatible state detection)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| Test files | src/core/state/schema.js | Import | migrateState(state) |
| Test files | src/core/doctor/ | Import | doctorCore(projectRoot) |
| Test files | src/core/state/resume.js | Import | computeResumePoint(state) |
| Test files | State snapshots | Inline JSON or fixture files | Real-world state.json content |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test location | `tests/verification/migration/` | Separate from unit tests |
| Test scope | Migration paths + in-flight + doctor | Three verification dimensions |
| Size estimate | ~200 lines across 3 test files | Focused verification scenarios |
