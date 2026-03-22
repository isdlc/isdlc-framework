# Architecture Overview: Parity Verification

**Item**: REQ-0118 | **GitHub**: #182 | **CODEX**: CODEX-049

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Per-subsystem test files | One test file per parity dimension (state, artifacts, governance, etc.) | Clear isolation, easy to run subsets | More files | **Selected** |
| B: Single monolithic test | All parity checks in one file | Fewer files | Hard to isolate failures, long file | Eliminated |
| C: Snapshot testing | Record Claude output, replay against Codex | Low maintenance | Brittle to any change, hard to debug | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-024: Per-Subsystem Parity Tests

- **Status**: Accepted
- **Context**: Both Claude and Codex adapters must produce equivalent results for governance decisions, phase sequencing, state mutations, and artifact generation. Differences in prompt wording and timing are acceptable.
- **Decision**: Create `tests/verification/parity/` with ~8 test files, each comparing one subsystem's output between adapters. Tests import adapter functions directly and call them with identical inputs.
- **Rationale**: Per-subsystem isolation makes failures actionable — a failing governance parity test points directly to the governance subsystem. Strict vs. flexible parity is encoded per-test, not as a global config.
- **Consequences**: Adding a new parity dimension requires a new test file. If a third provider is added, the pattern extends naturally (test each pair).

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| `node:test` | Framework standard test runner |
| `node:assert` | Strict deep equality for strict parity checks |
| ES modules | Consistent with `src/` convention |
| Direct adapter imports | No CLI overhead, tests call functions directly |

## 4. Integration Architecture

### File Layout

```
tests/verification/parity/
  state-mutations.test.js       (state.json field-level comparison)
  artifact-generation.test.js   (output file list comparison)
  backlog-mutations.test.js     (BACKLOG.md mutation comparison)
  meta-mutations.test.js        (meta.json field comparison)
  governance-decisions.test.js  (block/allow outcome comparison)
  phase-sequencing.test.js      (phase order comparison)
  schema-conformance.test.js    (state schema comparison)
  integration.test.js           (cross-subsystem scenarios)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| Test files | Claude adapter modules | Import | Function calls with test inputs |
| Test files | Codex adapter modules | Import | Function calls with same test inputs |
| Test files | Core state schema | Import | Schema validation for both outputs |
| Test files | Codex governance.js (REQ-0117) | Import | getGovernanceModel() for checkpoint list |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Test location | `tests/verification/parity/` | Separate from unit tests |
| Test granularity | ~8 files, one per subsystem | Isolated, actionable failures |
| Size estimate | ~200 lines total across all test files | Focused assertions per file |
