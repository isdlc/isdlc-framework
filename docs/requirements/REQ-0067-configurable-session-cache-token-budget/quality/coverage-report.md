# Coverage Report -- REQ-0067 Configurable Session Cache Token Budget

**Date**: 2026-03-15
**Tool**: node:test (no c8/istanbul configured)

---

## Coverage by Test Count

| Category | Tests | Pass | Fail | Coverage |
|----------|-------|------|------|----------|
| readConfig() unit tests (TC-CFG) | 15 | 15 | 0 | 100% ACs |
| Budget allocation tests (TC-BDG) | 9 | 9 | 0 | 100% ACs |
| Integration tests (TC-INT) | 5 | 5 | 0 | 100% ACs |
| Behavioral tests (TC-BEH) | 3 | 3 | 0 | 100% ACs |
| **Total** | **32** | **32** | **0** | **100%** |

## Acceptance Criteria Coverage

| AC ID | Test ID(s) | Status |
|-------|-----------|--------|
| AC-001-01 | TC-CFG-01 | Covered |
| AC-001-02 | TC-CFG-02 | Covered |
| AC-001-03 | TC-CFG-03 | Covered |
| AC-002-01 | TC-CFG-04 | Covered |
| AC-002-02 | TC-CFG-05 | Covered |
| AC-002-03 | TC-CFG-06 | Covered |
| AC-002-04 | TC-CFG-07 | Covered |
| AC-003-01 | TC-BDG-01 | Covered |
| AC-003-02 | TC-BDG-02 | Covered |
| AC-003-03 | TC-BDG-03 | Covered |
| AC-003-04 | TC-BDG-04 | Covered |
| AC-004-01 | TC-BDG-05 | Covered |
| AC-004-02 | TC-BDG-06 | Covered |
| AC-005-01 | TC-BDG-07 | Covered |
| AC-005-02 | TC-BDG-08 | Covered |
| AC-005-03 | TC-BDG-09 | Covered |
| AC-006-01 | TC-CFG-08 | Covered |
| AC-006-02 | TC-CFG-09 | Covered |
| AC-007-01 | TC-CFG-10 | Covered |
| AC-007-02 | TC-CFG-11 | Covered |
| AC-008-01 | TC-INT-05 | Covered |
| AC-008-02 | TC-INT-05 | Covered |

## Edge Cases Covered

- Empty config file (TC-CFG-12)
- JSON array instead of object (TC-CFG-13)
- Zero budget_tokens (TC-CFG-14)
- Non-numeric priority values (TC-CFG-15)
- String budget_tokens (TC-CFG-11)
- Negative budget_tokens (TC-CFG-06)
- Malformed JSON (TC-CFG-05)
- Unknown section names (TC-CFG-07)
- No external packages (TC-BEH-03)

## Note

Line/branch/function coverage metrics are not available because this project uses `node:test` without c8 or istanbul instrumentation. Coverage is tracked by test count and AC coverage, which shows 100% coverage of all acceptance criteria.
