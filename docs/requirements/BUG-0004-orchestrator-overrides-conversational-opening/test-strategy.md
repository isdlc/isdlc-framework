# Test Strategy - BUG-0004: Orchestrator Overrides Conversational Opening

**Workflow:** fix
**Bug ID:** BUG-0004
**Phase:** 05-test-strategy
**Date:** 2026-02-15
**Scope:** bug-fix (TDD required)

---

## Existing Infrastructure

- **Framework**: `node:test` (Article II mandate)
- **Test Pattern**: Prompt content verification -- read `.md` files, assert content patterns
- **Test Runner Commands**: `node --test tests/prompt-verification/*.test.js`
- **Module System**: ESM (`import`/`export`, `.test.js` extension)
- **Assertion Library**: `node:assert/strict`
- **Existing Precedent**: `tests/prompt-verification/parallel-execution.test.js` (same pattern: read agent `.md`, verify content)

## Strategy for This Bug Fix

- **Approach**: Extend existing `tests/prompt-verification/` suite with a new test file
- **Test Type**: Prompt content verification (unit-level, file content assertions)
- **Coverage Target**: 100% of 9 ACs and 2 NFRs
- **Pattern**: Follow `parallel-execution.test.js` conventions exactly

## Test Types

### Unit Tests (Prompt Verification)
All tests for this fix are prompt content verification tests. They read the orchestrator `.md` file and verify:
1. **Negative assertions**: Old protocol text is absent (FR-1: AC-1.1, AC-1.2)
2. **Positive assertions**: New protocol text is present (FR-1: AC-1.3 through AC-1.6)
3. **Consistency assertions**: Orchestrator protocol matches requirements analyst (FR-2: AC-2.1 through AC-2.3)
4. **Stability assertions**: Other sections unchanged (NFR-1, NFR-2)

### Integration Tests
Not applicable. This is a single-file text replacement with no cross-module logic.

### E2E Tests
Not applicable. The fix changes prompt content only; no CLI or runtime behavior changes.

### Security Tests
Not applicable. No security-sensitive changes.

### Performance Tests
Not applicable. No performance-sensitive changes.

## Test File Location

```
tests/prompt-verification/orchestrator-conversational-opening.test.js
```

Following the established naming convention in `tests/prompt-verification/`.

## Test Commands

```bash
# Run just the BUG-0004 tests
node --test tests/prompt-verification/orchestrator-conversational-opening.test.js

# Run all prompt verification tests
node --test tests/prompt-verification/*.test.js
```

## Critical Paths

1. **Old protocol removal** (AC-1.1, AC-1.2) -- must verify the exact old text is gone
2. **New protocol presence** (AC-1.3 through AC-1.6) -- must verify new text includes all required elements
3. **Cross-file consistency** (AC-2.1 through AC-2.3) -- orchestrator must match requirements analyst

## Risk Assessment

- **Regression risk**: NONE -- prompt content change only, no code logic
- **False positive risk**: LOW -- assertions are on specific text patterns
- **Flakiness risk**: NONE -- file content tests are deterministic
