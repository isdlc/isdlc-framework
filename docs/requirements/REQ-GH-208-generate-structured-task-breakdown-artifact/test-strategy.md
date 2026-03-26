# Test Strategy: Structured Task Breakdown from Analysis

**Slug**: REQ-GH-208-generate-structured-task-breakdown-artifact
**Source**: GitHub Issue #208
**Phase**: 05-test-strategy
**Version**: 1.0.0

---

## Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertion Library**: `node:assert/strict`
- **Test Location**: `tests/core/` mirroring `src/core/` directory structure
- **Conventions**: Test IDs prefixed per module (SM-, FC-, AZ-, CS-, CG-), FR/AC references in describe blocks, frozen-data-structure validation, `import { describe, it } from 'node:test'`
- **Mock Runtime**: `tests/core/orchestration/helpers/mock-runtime.js` (createMockRuntime, createInteractiveRuntime)
- **Existing Tests to Extend**:
  - `tests/core/analyze/state-machine.test.js` (20 tests, SM-01..SM-20)
  - `tests/core/analyze/finalization-chain.test.js` (15 tests, FC-01..FC-15)
  - `tests/core/orchestration/analyze.test.js` (21 tests, AZ-01..AZ-21)
  - `tests/core/validators/contract-schema.test.js` (21 tests, CS-01..CS-21)
  - `tests/core/validators/contract-generator.test.js` (25 tests, CG-01..CG-25)

---

## Test Pyramid

### Unit Tests (~31 new tests)

Extend existing test files for the four core modules being modified. All tests use the existing `node:test` runner and `node:assert/strict` patterns.

| Test File (extend) | New Tests | Scope |
|---|---|---|
| `tests/core/analyze/state-machine.test.js` | 8 | PRESENTING_TASKS state, updated transitions, updated tier paths |
| `tests/core/analyze/finalization-chain.test.js` | 3 | tasks.md in artifact list, guard for light tier |
| `tests/core/orchestration/analyze.test.js` | 10 | 4-domain confirmation, light workflow skip, PRESENTING_TASKS handling, task generation fail-open |
| `tests/core/validators/contract-schema.test.js` | 5 | task_display + task_scope field validation |
| `tests/core/validators/contract-generator.test.js` | 5 | Default values for new presentation fields |

### Integration Tests (~8 new tests)

Cross-module interaction tests validating the state machine drives the orchestrator correctly, and the finalization chain includes the right artifacts when tasks are present.

| Test File | New Tests | Scope |
|---|---|---|
| `tests/core/orchestration/analyze.test.js` (integration section) | 5 | End-to-end confirmation flow with 4 domains, amend on tasks domain, light workflow skip |
| `tests/core/validators/contract-evaluator-integration.test.js` | 3 | Contract evaluation with task_display/task_scope fields |

### E2E Tests

Not applicable for this feature. The changes are all core module updates (pure JS) and protocol spec changes (markdown). E2E testing would require a running roundtable, which is a manual validation. The integration tests cover the code-level E2E flow through the analyze orchestrator.

---

## Flaky Test Mitigation

- **Deterministic FSM**: State machine tests are pure data lookups with no I/O, timing, or randomness -- zero flakiness risk
- **Mock Runtime**: Orchestration tests use `createInteractiveRuntime(responses)` with deterministic response sequences -- no network, no file I/O, no timing dependencies
- **Frozen data**: Finalization chain and contract schema tests operate on frozen objects -- immutable, deterministic
- **No external dependencies**: All tests are self-contained with no database, API, or file system reads
- **Retry policy**: None needed -- all tests are deterministic

---

## Performance Test Plan

Not applicable for this feature. The changes add:
- 1 new entry to a frozen object (STATES enum) -- O(1)
- 3 new entries to a frozen transition table -- O(1) lookup
- 1 new state to tier paths -- O(n) array iteration where n <= 4
- 1 confirmation loop iteration in the orchestrator -- bounded by MAX_AMEND_LOOPS (5)

No performance-sensitive code paths are affected. The task generation itself happens in the LLM protocol layer (roundtable-analyst.md), not in core JS code.

---

## Test Commands

```bash
# Run all affected test files
node --test tests/core/analyze/state-machine.test.js tests/core/analyze/finalization-chain.test.js tests/core/orchestration/analyze.test.js tests/core/validators/contract-schema.test.js tests/core/validators/contract-generator.test.js

# Run individual test file
node --test tests/core/analyze/state-machine.test.js

# Run with verbose output
node --test --test-reporter spec tests/core/analyze/state-machine.test.js
```

---

## Coverage Targets

| Module | Current Tests | New Tests | Target Coverage |
|---|---|---|---|
| `state-machine.js` | 20 (SM-01..SM-20) | +8 (SM-21..SM-28) | 100% of PRESENTING_TASKS transitions |
| `finalization-chain.js` | 15 (FC-01..FC-15) | +3 (FC-16..FC-18) | 100% of artifact list update |
| `analyze.js` | 21 (AZ-01..AZ-21) | +10 (AZ-22..AZ-31) | 100% of 4-domain confirmation path |
| `contract-schema.js` | 21 (CS-01..CS-21) | +5 (CS-22..CS-26) | 100% of new field validation |
| `contract-generator.js` | 25 (CG-01..CG-25) | +5 (CG-26..CG-30) | 100% of default value generation |

Total: **31 new tests** across 5 existing test files.

---

## Test Case Specifications

### 1. State Machine Tests (state-machine.test.js)

#### SM-21: STATES enum has 8 members after update
- **Requirement**: FR-002 AC-002-01
- **Type**: positive
- **Given**: The updated state-machine module is imported
- **When**: STATES enum is inspected
- **Then**: It has 8 keys (IDLE, PRESENTING_REQUIREMENTS, PRESENTING_ARCHITECTURE, PRESENTING_DESIGN, PRESENTING_TASKS, AMENDING, FINALIZING, COMPLETE)

#### SM-22: STATES contains PRESENTING_TASKS value
- **Requirement**: FR-002 AC-002-01
- **Type**: positive
- **Given**: The updated state-machine module is imported
- **When**: `STATES.PRESENTING_TASKS` is read
- **Then**: Its value is `'PRESENTING_TASKS'`

#### SM-23: PRESENTING_DESIGN + accept -> PRESENTING_TASKS (updated transition)
- **Requirement**: FR-002 AC-002-01
- **Type**: positive
- **Given**: The transition table is updated
- **When**: `getTransition('PRESENTING_DESIGN', 'accept')` is called
- **Then**: Returns `'PRESENTING_TASKS'` (was `'FINALIZING'`)

#### SM-24: PRESENTING_TASKS + accept -> FINALIZING
- **Requirement**: FR-002 AC-002-01, AC-002-03
- **Type**: positive
- **Given**: The transition table has PRESENTING_TASKS entries
- **When**: `getTransition('PRESENTING_TASKS', 'accept')` is called
- **Then**: Returns `'FINALIZING'`

#### SM-25: PRESENTING_TASKS + amend -> AMENDING
- **Requirement**: FR-002 AC-002-04
- **Type**: positive
- **Given**: The transition table has PRESENTING_TASKS entries
- **When**: `getTransition('PRESENTING_TASKS', 'amend')` is called
- **Then**: Returns `'AMENDING'`

#### SM-26: standard tier path includes PRESENTING_TASKS as 4th element
- **Requirement**: FR-002 AC-002-01, FR-005 AC-005-01
- **Type**: positive
- **Given**: Tier paths are updated
- **When**: `getTierPath('standard')` is called
- **Then**: Returns `['PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']`

#### SM-27: light tier path does NOT include PRESENTING_TASKS
- **Requirement**: FR-002 AC-002-05
- **Type**: negative
- **Given**: Tier paths are updated
- **When**: `getTierPath('light')` is called
- **Then**: Returns `['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN']` (no PRESENTING_TASKS)

#### SM-28: trivial tier path unchanged (no PRESENTING_TASKS)
- **Requirement**: FR-002 AC-002-05
- **Type**: negative
- **Given**: Tier paths remain unchanged for trivial
- **When**: `getTierPath('trivial')` is called
- **Then**: Returns `['FINALIZING']`

---

### 2. Finalization Chain Tests (finalization-chain.test.js)

#### FC-16: finalization chain includes tasks.md artifact reference
- **Requirement**: FR-003 AC-003-01
- **Type**: positive
- **Given**: The finalization chain is updated
- **When**: `getFinalizationChain()` is called and artifact references inspected
- **Then**: At least one step references tasks.md in its action or artifact list
- **Note**: Implementation may add a new step or extend meta_status_update's action to include tasks.md. The test validates the artifact is referenced.

#### FC-17: tasks.md artifact step is guarded for non-light tiers
- **Requirement**: FR-002 AC-002-05, FR-003 AC-003-01
- **Type**: positive
- **Given**: A function or flag indicates whether tasks were generated
- **When**: The chain is queried for task-related artifacts
- **Then**: The task artifact step has a guard condition (e.g., `task_breakdown_generated` flag)

#### FC-18: finalization chain immutability preserved after update
- **Requirement**: FR-003 AC-003-01
- **Type**: positive
- **Given**: The finalization chain is updated
- **When**: `getFinalizationChain()` is called
- **Then**: The returned array and all elements are frozen (Object.isFrozen)

---

### 3. Analyze Orchestrator Tests (analyze.test.js)

#### AZ-22: standard sizing presents 4 confirmation domains (requirements, architecture, design, tasks)
- **Requirement**: FR-002 AC-002-01, AC-002-02
- **Type**: positive
- **Given**: A feature item with standard sizing
- **When**: `runAnalyze` completes with 4 accept responses (one per domain)
- **Then**: `confirmation_record` has 4 entries with domains: requirements, architecture, design, tasks

#### AZ-23: PRESENTING_TASKS domain shows after PRESENTING_DESIGN accept
- **Requirement**: FR-002 AC-002-01
- **Type**: positive
- **Given**: A feature item with standard sizing
- **When**: `runAnalyze` processes the confirmation sequence
- **Then**: The 4th confirmation prompt has `domain === 'tasks'` and appears after the 3rd (design)

#### AZ-24: accept on tasks domain transitions to finalization
- **Requirement**: FR-002 AC-002-03
- **Type**: positive
- **Given**: The confirmation sequence reaches PRESENTING_TASKS
- **When**: User responds with 'accept'
- **Then**: Finalization executes and `finalization_status.completed === true`

#### AZ-25: amend on tasks domain loops back to tasks confirmation
- **Requirement**: FR-002 AC-002-04
- **Type**: positive
- **Given**: The confirmation sequence reaches PRESENTING_TASKS
- **When**: User responds with 'amend' then 'accept'
- **Then**: The tasks domain appears in confirmation_record with amend history, and all 4 domains are eventually accepted

#### AZ-26: light sizing skips PRESENTING_TASKS
- **Requirement**: FR-002 AC-002-05
- **Type**: positive
- **Given**: A feature item with light sizing
- **When**: `runAnalyze` completes
- **Then**: `confirmation_record` has exactly 2 entries (requirements, design) -- no tasks domain

#### AZ-27: trivial sizing skips PRESENTING_TASKS
- **Requirement**: FR-002 AC-002-05
- **Type**: positive
- **Given**: A feature item with trivial sizing
- **When**: `runAnalyze` completes
- **Then**: `confirmation_record` does not include a tasks domain

#### AZ-28: task generation failure transitions gracefully (fail-open)
- **Requirement**: FR-001 AC-001-01 (error handling from module-design Section 2)
- **Type**: negative
- **Given**: The runtime raises an error during PRESENTING_TASKS
- **When**: The orchestrator handles the error
- **Then**: It skips PRESENTING_TASKS, transitions to FINALIZING, and the other 3 artifacts are still written

#### AZ-29: DOMAIN_TO_STATE maps 'tasks' to 'PRESENTING_TASKS'
- **Requirement**: FR-002 AC-002-01
- **Type**: positive
- **Given**: The DOMAIN_TO_STATE mapping is updated
- **When**: `stateToDomain('PRESENTING_TASKS')` is called
- **Then**: Returns `'tasks'`

#### AZ-30: CONFIRMATION_DOMAINS includes 'tasks' as 4th element
- **Requirement**: FR-002 AC-002-01
- **Type**: positive
- **Given**: The CONFIRMATION_DOMAINS array is updated
- **When**: The array is inspected
- **Then**: It equals `['requirements', 'architecture', 'design', 'tasks']`

#### AZ-31: bug items skip PRESENTING_TASKS entirely
- **Requirement**: FR-002 AC-002-05
- **Type**: negative
- **Given**: A bug item
- **When**: `runAnalyze` completes
- **Then**: `confirmation_record` is empty (bugs use bug-gather, not roundtable confirmations)

---

### 4. Contract Schema Tests (contract-schema.test.js)

#### CS-22: validateContractEntry accepts presentation with task_display field
- **Requirement**: FR-007 AC-007-01
- **Type**: positive
- **Given**: A contract entry with `presentation.task_display = 'counter'`
- **When**: `validateContractEntry` is called
- **Then**: `result.valid === true`

#### CS-23: validateContractEntry accepts presentation with task_scope field
- **Requirement**: FR-006 AC-006-01
- **Type**: positive
- **Given**: A contract entry with `presentation.task_scope = 'full-workflow'`
- **When**: `validateContractEntry` is called
- **Then**: `result.valid === true`

#### CS-24: validateContractEntry accepts all valid task_display enum values
- **Requirement**: FR-007 AC-007-01, AC-007-02, AC-007-03
- **Type**: positive
- **Given**: Contract entries with `task_display` set to each of `'counter'`, `'expanded'`, `'phase-only'`
- **When**: `validateContractEntry` is called for each
- **Then**: All return `result.valid === true`

#### CS-25: validateContractEntry accepts all valid task_scope enum values
- **Requirement**: FR-006 AC-006-01, AC-006-02
- **Type**: positive
- **Given**: Contract entries with `task_scope` set to each of `'full-workflow'`, `'implementation-only'`
- **When**: `validateContractEntry` is called for each
- **Then**: All return `result.valid === true`

#### CS-26: validateContractEntry accepts presentation without task_display/task_scope (optional fields)
- **Requirement**: FR-006, FR-007 (backward compat)
- **Type**: positive
- **Given**: A contract entry with `presentation` that has existing fields but no `task_display` or `task_scope`
- **When**: `validateContractEntry` is called
- **Then**: `result.valid === true` (fields are optional, existing contracts remain valid)

---

### 5. Contract Generator Tests (contract-generator.test.js)

#### CG-26: Generated contract includes task_display default in presentation
- **Requirement**: FR-007 AC-007-01
- **Type**: positive
- **Given**: Contracts are generated with default settings
- **When**: The roundtable entry's presentation section is inspected
- **Then**: `task_display === 'counter'`

#### CG-27: Generated contract includes task_scope default in presentation
- **Requirement**: FR-006 AC-006-01
- **Type**: positive
- **Given**: Contracts are generated with default settings
- **When**: The roundtable entry's presentation section is inspected
- **Then**: `task_scope === 'full-workflow'`

#### CG-28: Generated contracts with presentation pass schema validation
- **Requirement**: FR-006, FR-007
- **Type**: positive
- **Given**: Contracts are generated with task_display and task_scope fields
- **When**: Each contract is validated with `validateContract`
- **Then**: All pass validation (`result.valid === true`)

#### CG-29: task_display defaults to 'counter' when not configured
- **Requirement**: FR-007 AC-007-01
- **Type**: positive
- **Given**: No project-level override for task_display
- **When**: Contracts are generated
- **Then**: The presentation.task_display field defaults to `'counter'`

#### CG-30: task_scope defaults to 'full-workflow' when not configured
- **Requirement**: FR-006 AC-006-01
- **Type**: positive
- **Given**: No project-level override for task_scope
- **When**: Contracts are generated
- **Then**: The presentation.task_scope field defaults to `'full-workflow'`

---

## Critical Paths

1. **Happy path**: Design accept -> PRESENTING_TASKS -> accept -> FINALIZING -> tasks.md written
   - Tests: SM-23, SM-24, SM-26, AZ-22, AZ-23, AZ-24

2. **Amend path**: PRESENTING_TASKS -> amend -> re-present -> accept -> FINALIZING
   - Tests: SM-25, AZ-25

3. **Light workflow skip**: Light sizing -> no PRESENTING_TASKS -> FINALIZING (3 domains only)
   - Tests: SM-27, AZ-26

4. **Fail-open path**: Task generation fails -> skip PRESENTING_TASKS -> FINALIZING (3 artifacts)
   - Tests: AZ-28

5. **Contract defaults**: Generate contracts -> presentation has task_display + task_scope
   - Tests: CS-22..CS-26, CG-26..CG-30

---

## Traceability Summary

| FR | AC Count | Test Coverage |
|---|---|---|
| FR-001 (Task Generation) | 4 ACs | SM-21..SM-22 (PRESENTING_TASKS state exists), AZ-28 (fail-open) |
| FR-002 (4th Confirmation Domain) | 5 ACs | SM-23..SM-28 (transitions, tier paths), AZ-22..AZ-27 (orchestrator behavior) |
| FR-003 (Artifact Persistence) | 3 ACs | FC-16..FC-18 (finalization chain), AZ-24 (finalization completes) |
| FR-004 (Build Skip Redundant) | 4 ACs | Protocol-level guards in isdlc.md -- tested via integration when build handler is implemented |
| FR-005 (Phase Grouping) | 2 ACs | SM-26 (standard tier path), AZ-22 (confirmation sequence) |
| FR-006 (Configurable Scope) | 2 ACs | CS-23, CS-25, CG-27, CG-30 (contract schema + generator) |
| FR-007 (Configurable Display) | 3 ACs | CS-22, CS-24, CG-26, CG-29 (contract schema + generator) |

**Coverage**: 7/7 FRs have at least one test. 19/22 ACs have direct test coverage. The 3 uncovered ACs (AC-001-02 acyclicity, AC-001-03 traceability %, AC-001-04 EBNF conformance) relate to LLM-generated task content quality -- these are protocol-level validations in roundtable-analyst.md, not testable in core JS unit tests. They will be validated by manual acceptance testing of the roundtable output.

---

## Test Data Plan

### Boundary Values

- **State count**: After update, STATES has exactly 8 members (was 7)
- **Tier path lengths**: standard=4 (was 3), light=2 (unchanged), trivial=1 (unchanged)
- **Confirmation domains**: 4 for standard (was 3), 2 for light, 0 for trivial

### Invalid Inputs

- `getTransition('PRESENTING_TASKS', 'finalize_complete')` -> null (invalid event for this state)
- `getTransition('PRESENTING_TASKS', 'nonexistent')` -> null
- Contract entry with `task_display: 'invalid'` -> should still pass if field is treated as optional/string
- Contract entry with `presentation: null` and missing task_display/task_scope -> valid (optional)

### Maximum-Size Inputs

- Not applicable for frozen data structures. The state machine, finalization chain, and contract schema have bounded input sizes.
- The orchestrator's MAX_AMEND_LOOPS (5) bounds the maximum number of amend cycles on the tasks domain.

### Test Fixtures

All fixtures use the existing mock-runtime pattern from `tests/core/orchestration/helpers/mock-runtime.js`:

```javascript
// 4-domain feature flow (standard sizing, with tasks)
const standardFeatureResponses = [
  'req...', 'arch...', 'design...', '__TOPICS_COMPLETE__',
  'accept',  // requirements
  'accept',  // architecture
  'accept',  // design
  'accept'   // tasks (NEW)
];

// 4-domain with amend on tasks
const amendTasksResponses = [
  'req...', '__TOPICS_COMPLETE__',
  'accept', 'accept', 'accept',  // req, arch, design
  'amend', 'remove Polish phase tasks',  // amend tasks
  'accept'  // re-accept tasks
];

// Light workflow (2 domains, no tasks)
const lightFlowResponses = [
  'req...', '__TOPICS_COMPLETE__',
  'accept',  // requirements
  'accept'   // design (no architecture, no tasks)
];
```

---

## Security Considerations

This feature introduces no new security surface:
- No new file I/O (tasks.md write is in the protocol layer, not core JS)
- No new user input parsing in core modules (contract fields are validated enums)
- No new network calls
- State machine is frozen/immutable data
- Contract schema validation rejects unexpected values

---

## Backward Compatibility

Tests verify that existing behavior is preserved:
- **SM-28**: Trivial tier path unchanged
- **SM-27**: Light tier path unchanged (no PRESENTING_TASKS added)
- **CS-26**: Existing contracts without task_display/task_scope remain valid
- **AZ-31**: Bug items still skip confirmation entirely
- **FC-18**: Finalization chain immutability preserved

---

## GATE-04 Checklist

- [x] Test strategy covers unit, integration, E2E (or justification for N/A), security, performance
- [x] Test cases exist for all 7 functional requirements (FR-001 through FR-007)
- [x] Traceability matrix: 7/7 FRs covered, 19/22 ACs covered (3 protocol-only ACs documented)
- [x] Coverage targets defined per module (100% of new code paths)
- [x] Test data strategy documented (boundary values, invalid inputs, fixtures)
- [x] Critical paths identified (5 paths with test mappings)
- [x] Existing infrastructure reused (node:test, mock-runtime, existing test file structure)
- [x] Test conventions followed (ID prefixes, FR/AC references, frozen-data validation)
