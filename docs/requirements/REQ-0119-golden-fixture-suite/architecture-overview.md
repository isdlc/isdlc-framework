# Architecture Overview: Golden Fixture Suite

**Item**: REQ-0119 | **GitHub**: #183 | **CODEX**: CODEX-050

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Fixture directories + single runner | Each workflow type gets a fixture dir; one test runner loads all | Simple runner, clear fixture isolation | Fixture maintenance on schema changes | **Selected** |
| B: Inline fixtures in test file | Fixtures defined as JS objects in the test | No separate files | Large test file, hard to review fixtures | Eliminated |
| C: Factory-generated fixtures | Programmatic fixture generation | Auto-updates with schema | Hides test data, harder to reason about | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-025: Fixture Directory Pattern

- **Status**: Accepted
- **Context**: Core model functions (migrateState, computeResumePoint, etc.) need deterministic test data for every workflow type. Test data must be inspectable, version-controlled, and independent of agent behavior.
- **Decision**: Create 9 fixture directories under `tests/verification/fixtures/` (one per workflow type) and a single `tests/verification/golden.test.js` (~150 lines) that iterates over all fixtures.
- **Rationale**: Fixture directories are human-readable, diffable, and self-documenting. The runner is generic — adding a new workflow type means adding a fixture directory, not modifying test logic.
- **Consequences**: Fixtures must be updated when state schema changes. Migration verification (REQ-0120) catches schema drift.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| `node:test` | Framework standard test runner |
| `node:fs` | Load fixture JSON files |
| JSON fixture files | Human-readable, diffable, version-controlled |
| Core model imports | Direct function calls (migrateState, computeResumePoint) |

## 4. Integration Architecture

### File Layout

```
tests/verification/fixtures/
  discover_existing/
    initial-state.json
    context.json
    expected.json
  feature/
    initial-state.json
    context.json
    expected.json
  fix/
    initial-state.json
    context.json
    expected.json
  test_generate/
    initial-state.json
    context.json
    expected.json
  test_run/
    initial-state.json
    context.json
    expected.json
  upgrade/
    initial-state.json
    context.json
    expected.json
  analyze/
    initial-state.json
    context.json
    expected.json
  implementation_loop/
    initial-state.json
    context.json
    expected.json
  quality_loop/
    initial-state.json
    context.json
    expected.json

tests/verification/
  golden.test.js  (~150 lines)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| golden.test.js | Fixture directories | node:fs readFileSync | JSON files |
| golden.test.js | Core state/schema.js | Import | migrateState(state) |
| golden.test.js | Core state/resume.js | Import | computeResumePoint(state) |
| golden.test.js | node:assert | Import | deepStrictEqual for expected vs actual |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Fixture storage | `tests/verification/fixtures/` with 9 subdirs | One per workflow type, inspectable |
| Runner | Single `golden.test.js` (~150 lines) | Generic iterator over fixture dirs |
| Size estimate | ~150 lines test code + 9x3 JSON fixtures | Compact runner, data-driven |
