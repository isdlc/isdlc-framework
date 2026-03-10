# REQ-0056: Test Strategy — Adaptive Process Complexity

## Test Pyramid

| Level | Count | Focus |
|-------|-------|-------|
| Unit | 28 | `readProcessConfig()`, `computePhaseArray()`, `sanitizeCommand()`, phase-advance skip logic |
| Integration | 8 | Full workflow-init with process.json, phase-advance through skipped phases |
| E2E | 0 | Covered by existing workflow E2E tests |

## Test Files

| File | Module Under Test | Type |
|------|-------------------|------|
| `src/claude/hooks/tests/test-process-config.test.cjs` | `common.cjs` → `readProcessConfig()` | Unit |
| `src/claude/hooks/tests/test-workflow-init-process.test.cjs` | `workflow-init.cjs` → `computePhaseArray()`, `printPhaseList()` | Unit + Integration |
| `src/claude/hooks/tests/test-phase-advance-skip.test.cjs` | `phase-advance.cjs` → skip logic | Unit + Integration |

## Coverage Targets

- Line coverage: >=80% for modified functions
- Branch coverage: >=70% for `computePhaseArray()` (many branches)
- All 8 FRs have at least one test mapping to their AC

## AC-to-Test Traceability

| AC | Test | Priority |
|----|------|----------|
| AC-001-01 | Config override applies custom phases | P0 |
| AC-001-02 | Missing config uses defaults | P0 |
| AC-001-03 | Config missing workflow type uses defaults | P0 |
| AC-002-01 | Fix workflow with custom phases | P1 |
| AC-002-02 | Feature config doesn't affect fix | P1 |
| AC-003-01 | Skipped phases have status "skipped" with reason | P0 |
| AC-003-02 | All skipped phases have reason field | P0 |
| AC-004-01 | Visual output shows [x] for skipped phases | P1 |
| AC-004-02 | No skipped phases shows all [ ] | P1 |
| AC-005-01 | Mid-workflow config change ignored (locking) | P2 |
| AC-006-01 | Add phase not in defaults (recomposition) | P1 |
| AC-006-02 | Unknown phase warned and ignored | P1 |
| AC-007-01 | Malformed JSON warns and uses defaults | P0 |
| AC-008-01 | Template has comments for all phases | P2 |

## Key Test Scenarios

1. **No process.json** → defaults unchanged (backward compat)
2. **Valid process.json with feature key** → custom phases applied, skipped phases recorded
3. **Valid process.json without matching key** → defaults for that workflow type
4. **Malformed JSON** → warning + defaults
5. **Empty phase array** → warning + defaults
6. **Unknown phase names** → warning + ignored
7. **Phase recomposition** → add phase not in defaults
8. **Phase-advance skip** → advances past "skipped" phases correctly
9. **--light flag without process.json** → existing behavior preserved
10. **process.json overrides --light** → process.json takes precedence
