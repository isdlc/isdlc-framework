# Test Strategy: Discover Execution Model (Batch REQ-0103..0107)

## 1. Scope

Unit tests for 6 ESM modules + 1 CJS bridge in `src/core/discover/`:

| Module | Tests | Key Assertions |
|--------|-------|----------------|
| modes.js | modes.test.js | 4 modes exist, correct fields, frozen |
| agent-groups.js | agent-groups.test.js | 7 groups exist, correct members, parallelism |
| ux-flows.js | ux-flows.test.js | menus have correct options, walkthroughs have steps |
| discover-state-schema.js | discover-state-schema.test.js | createInitial, computeResume, isComplete, markStep |
| skill-distillation.js | skill-distillation.test.js | config, rules, priority |
| projection-chain.js | projection-chain.test.js | 4 steps, provider classification |
| bridge/discover.cjs | bridge-discover.test.js | CJS bridge parity with ESM |

## 2. Framework

- **Test runner**: `node:test` (project standard)
- **Assertions**: `node:assert/strict` (project standard)
- **Command**: `npm run test:core`

## 3. Test ID Prefixes

| Prefix | Module |
|--------|--------|
| DM- | Discover Modes |
| AG- | Agent Groups |
| UX- | UX Flows |
| DS- | Discover State Schema |
| SD- | Skill Distillation |
| PC- | Projection Chain |
| DB- | Discover Bridge |

## 4. Coverage Targets

- Line coverage: >= 80%
- Branch coverage: >= 80%
- All frozen objects verified immutable
- All registry lookups tested (positive + negative)

## 5. Test Categories

### 5.1 Data Shape Tests
Verify each frozen config has required fields, correct types, correct values.

### 5.2 Immutability Tests
Verify Object.isFrozen on all exported configs, mutation throws TypeError.

### 5.3 Function Tests
Verify registry lookups, state functions, and helper functions.

### 5.4 Error Handling Tests
Verify unknown IDs throw with helpful messages, invalid inputs rejected.

### 5.5 CJS Bridge Parity Tests
Verify CJS bridge returns same data as ESM exports.

## 6. Traceability

| Requirement | Acceptance Criteria | Test IDs |
|-------------|-------------------|----------|
| REQ-0103 FR-001 | AC-001-01..02 | DM-01..DM-06 |
| REQ-0103 FR-002 | AC-002-01..04 | AG-01..AG-09 |
| REQ-0103 FR-003 | AC-003-01..03 | AG-10..AG-12 |
| REQ-0103 FR-004 | AC-004-01..03 | DM-07..DM-09 |
| REQ-0104 FR-001 | AC-001-01..03 | UX-01..UX-04 |
| REQ-0104 FR-002 | AC-002-01..02 | UX-05..UX-08 |
| REQ-0104 FR-003 | AC-003-01 | UX-09 |
| REQ-0105 FR-001 | AC-001-01..03 | DS-01..DS-03 |
| REQ-0105 FR-002 | AC-002-01..02 | DS-04..DS-05 |
| REQ-0105 FR-003 | AC-003-01 | DS-06..DS-07 |
| REQ-0106 FR-001 | AC-001-01..03 | SD-01..SD-03 |
| REQ-0106 FR-002 | AC-002-01..02 | SD-04..SD-05 |
| REQ-0107 FR-001 | AC-001-01..02 | PC-01..PC-03 |
| REQ-0107 FR-002 | AC-002-01..02 | PC-04..PC-05 |

## 7. Constitutional Compliance

- **Article I**: Tests verify exact spec compliance (modes, groups, fields)
- **Article II**: Tests written before production code (TDD Red-Green)
- **Article V**: Minimal test surface, no over-testing
- **Article VII**: Test IDs trace to requirement ACs
- **Article IX**: All artifacts exist, coverage >= 80%
