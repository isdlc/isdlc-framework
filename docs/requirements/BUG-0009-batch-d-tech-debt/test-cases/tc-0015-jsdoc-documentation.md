# Test Cases: Item 0.15 -- Document detectPhaseDelegation()

**File Under Test**: `src/claude/hooks/lib/common.cjs`
**Test File**: `src/claude/hooks/tests/batch-d-jsdoc-documentation.test.cjs`
**Traces To**: AC-0015-1 through AC-0015-4

---

## TC-15.01: detectPhaseDelegation JSDoc contains @example block (AC-0015-1)

**Priority**: P1
**Type**: Unit (content verification)
**Input**: Read `lib/common.cjs` source, extract the JSDoc comment above `detectPhaseDelegation`
**Expected**: JSDoc contains `@example` tag with at least one usage example
**Assertion**: `assert.ok(jsdocBlock.includes('@example'))`

## TC-15.02: detectPhaseDelegation JSDoc documents return shape (AC-0015-2)

**Priority**: P1
**Type**: Unit (content verification)
**Input**: Read `lib/common.cjs` source
**Expected**: JSDoc contains `isDelegation`, `targetPhase`, and `agentName` in the @returns block
**Assertion**: Assert all three field names appear in the JSDoc

## TC-15.03: detectPhaseDelegation JSDoc contains @see references to callers (AC-0015-1)

**Priority**: P1
**Type**: Unit (content verification)
**Input**: Read `lib/common.cjs` source
**Expected**: JSDoc contains `@see` tags referencing the 6 known callers: gate-blocker, constitution-validator, phase-loop-controller, test-adequacy-blocker, phase-sequence-guard, iteration-corridor
**Assertion**: At least 6 `@see` tags present, each naming a caller hook

## TC-15.04: detectPhaseDelegation JSDoc documents never-throws behavior (AC-0015-3)

**Priority**: P1
**Type**: Unit (content verification)
**Input**: Read `lib/common.cjs` source
**Expected**: JSDoc mentions that the function never throws (returns NOT_DELEGATION on all error paths)
**Assertion**: JSDoc contains `@throws` tag indicating "Never throws" or similar, OR a note about fail-safe behavior

## TC-15.05: detectPhaseDelegation JSDoc documents edge cases (AC-0015-3)

**Priority**: P1
**Type**: Unit (content verification)
**Input**: Read `lib/common.cjs` source
**Expected**: JSDoc explicitly calls out edge cases:
- Non-Task tool calls return NOT_DELEGATION
- Setup commands are excluded
- Agents with phase 'all' or 'setup' are excluded
- Manifest-based agent scanning as fallback
- Phase pattern regex fallback
**Assertion**: At least 3 of these edge cases are mentioned in the JSDoc (text pattern matching)

## TC-15.06: No code changes -- function signature unchanged (AC-0015-4)

**Priority**: P0
**Type**: Unit (regression)
**Input**: `require('../lib/common.cjs').detectPhaseDelegation`
**Expected**: Function exists, is callable, returns expected NOT_DELEGATION shape for non-Task tool call
**Assertion**: `assert.strictEqual(typeof common.detectPhaseDelegation, 'function')`, then call it and verify shape
