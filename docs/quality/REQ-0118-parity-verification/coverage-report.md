# Coverage Report -- REQ-0118 Parity Verification

**Date**: 2026-03-22
**Tool**: NOT CONFIGURED (no coverage instrumentation)

---

## Coverage Status

No code coverage tool is configured for this project. The `node:test` runner does not
include built-in coverage instrumentation.

## Functional Coverage (Manual Assessment)

### Production Files

| File | Functions | Tested | Coverage |
|------|-----------|--------|----------|
| `src/core/providers/support-matrix.js` | 3 | 3 | 100% |
| `src/core/bridge/support-matrix.cjs` | 3 (async wrappers) | Indirect | N/A |

### Function-Level Detail

| Function | Test File | Test IDs | Tested |
|----------|-----------|----------|--------|
| `getProviderSupportMatrix()` | support-matrix.test.js | SMX-01..06 | Yes |
| `getGovernanceDeltas()` | support-matrix.test.js | SMX-07..14 | Yes |
| `getKnownLimitations()` | support-matrix.test.js | SMX-15..19 | Yes |
| Bridge: `getProviderSupportMatrix` | Indirect via ESM tests | -- | Indirect |
| Bridge: `getGovernanceDeltas` | Indirect via ESM tests | -- | Indirect |
| Bridge: `getKnownLimitations` | Indirect via ESM tests | -- | Indirect |

### Test Coverage by Requirement

| Requirement | FRs | ACs Covered | Test Count |
|-------------|-----|-------------|------------|
| REQ-0118 | FR-001, FR-002 | AC-001-01..03, AC-002-01..03 | 28 |
| REQ-0119 | FR-001, FR-002, FR-003 | AC-001-01..03, AC-002-01..03, AC-003-01..03 | 46 |
| REQ-0120 | FR-001, FR-002, FR-003 | AC-001-01..04, AC-002-01..04, AC-003-01..02 | 15 |
| REQ-0121 | FR-001, FR-003, FR-004 | AC-001-01..04, AC-003-01..02, AC-004-01..03 | 14 |
| REQ-0122 | FR-001, FR-002, FR-003 | AC-001-01..03, AC-002-01..03, AC-003-01..03 | 19 |

**Recommendation**: Consider adding `--experimental-test-coverage` flag to node:test
for automated line-level coverage in future builds.
