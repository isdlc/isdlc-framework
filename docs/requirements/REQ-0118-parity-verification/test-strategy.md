# Test Strategy: Verification Suite (REQ-0118 through REQ-0122)

**Phase**: 05-test-strategy | **Date**: 2026-03-22
**Covers**: REQ-0118, REQ-0119, REQ-0120, REQ-0121, REQ-0122

---

## 1. Scope

This test strategy covers the final verification layer of the Codex integration (Phase 9). Five requirements are tested:

| REQ | Name | Type | Estimated Tests |
|-----|------|------|----------------|
| REQ-0118 | Parity Verification | Pure test | ~30 |
| REQ-0119 | Golden Fixture Suite | Fixture + test | ~25 |
| REQ-0120 | State Migration Verification | Integration test | ~15 |
| REQ-0121 | Performance Validation | Benchmark test | ~15 |
| REQ-0122 | Provider Support Matrix | Unit test (production + test) | ~15 |

**Total**: ~100 new tests.

## 2. Test Framework

- **Runner**: `node:test` (existing project standard)
- **Assertions**: `node:assert/strict` (existing project standard)
- **Pattern**: `describe/it` with test ID prefixes
- **Timing**: `performance.now()` for benchmarks

## 3. Test Organization

```
tests/
  verification/
    parity/
      config-parity.test.js        # REQ-0118: Config structure comparison
      installer-parity.test.js     # REQ-0118: Installer signature comparison
      governance-parity.test.js    # REQ-0118: Governance checkpoint parity
      projection-parity.test.js    # REQ-0118: Projection path parity
    fixtures/
      discover_existing/           # REQ-0119: 3 JSON files each
      feature/
      fix/
      test_generate/
      test_run/
      upgrade/
      analyze/
      implementation_loop/
      quality_loop/
    golden.test.js                 # REQ-0119: Golden fixture runner
    migration/
      migration-integration.test.js # REQ-0120: Migration path + in-flight + doctor
    performance/
      benchmarks.test.js           # REQ-0121: Timing assertions
      baselines.json               # REQ-0121: Threshold config
  core/
    providers/
      support-matrix.test.js       # REQ-0122: Matrix completeness
src/
  core/
    providers/
      support-matrix.js            # REQ-0122: Production code
    bridge/
      support-matrix.cjs           # REQ-0122: CJS bridge
```

## 4. Parity Test Strategy (REQ-0118)

**Approach**: Import matching functions from both providers, call with identical inputs, assert structural equivalence on strict fields while ignoring flexible fields.

| Test File | Strict Assertions | Flexible (Not Asserted) |
|-----------|-------------------|------------------------|
| config-parity | provider name, frameworkDir presence | config field names may differ |
| installer-parity | function count, parameter arity | implementation details |
| governance-parity | block/allow decisions, violation count | violation message wording |
| projection-parity | getProjectionPaths() key count | path values may differ per provider |

## 5. Golden Fixture Strategy (REQ-0119)

Each fixture directory contains `initial-state.json`, `context.json`, `expected.json`. The golden test runner:
1. Loads each fixture directory dynamically
2. Runs `migrateState(initialState)` to normalize schema version
3. Validates `expected_state_mutations` against the migrated state
4. Validates `expected_artifacts` is a well-formed array

Fixtures are minimal snapshots covering all 9 workflow types.

## 6. Migration Strategy (REQ-0120)

Integration tests beyond existing `schema.test.js` unit coverage:
- Real-world state snapshots with in-flight workflows
- Preservation of `active_workflow`, `phases`, `workflow_history` through migration
- Doctor detection of migration-needed vs. corrupted states

## 7. Performance Strategy (REQ-0121)

- Frozen thresholds in `baselines.json` and test constants
- `performance.now()` timing with generous CI-safe margins
- Cache efficiency: cold vs warm call comparison
- Regression detection: current run vs baseline within 20% tolerance

## 8. Support Matrix Strategy (REQ-0122)

- Frozen data module pattern (matches `src/core/teams/registry.js`)
- All three exports tested for structure, completeness, and immutability
- Governance deltas cross-referenced against `getGovernanceModel()`

## 9. Run Commands

```bash
# All verification tests
node --test tests/verification/**/*.test.js

# Individual suites
node --test tests/verification/parity/*.test.js
node --test tests/verification/golden.test.js
node --test tests/verification/migration/*.test.js
node --test tests/verification/performance/*.test.js

# Support matrix unit tests
node --test tests/core/providers/support-matrix.test.js

# Full project suite
npm run test:all
```

## 10. Coverage Target

Minimum 80% line coverage on new production code (`src/core/providers/support-matrix.js`). Verification tests are pure test files with no production code of their own.
