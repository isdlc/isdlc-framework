# Test Cases: REQ-GH-217 — Task Formatter

## Scope

This document covers test cases for `formatPhaseSummary()` in `src/core/tasks/task-formatter.js` (FR-003, AC-003-01). The function is a pure function that formats a parsed task plan into a human-readable phase summary string.

## Test Strategy

- **Framework**: Node.js built-in test runner (`node:test`)
- **Assertions**: `node:assert/strict`
- **Test file**: `tests/core/tasks/task-formatter.test.js`
- **Fixtures**: `tests/core/tasks/fixtures/formatter-*.md` (4 fixture files)
- **Approach**: ATDD scaffolds with `it.skip()` -- implementation in Phase 06

## Acceptance Criteria (Given-When-Then)

### AC-003-01: Formatted summary with stable order, grouping, progress counts

**Given** a phase completes
**When** STEP 3f runs
**Then** a formatted summary table is printed showing all tasks in stable order with status, grouped by category, with progress counts

## Test Cases

### Module Export (P0)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-01 | Module exports formatPhaseSummary as a function | positive | P0 | FR-003, AC-003-01 |

### Mixed Task Statuses (P0)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-02 | Returns a string with all tasks in stable document order | positive | P0 | FR-003, AC-003-01 |
| TF-03 | Completed tasks shown with done icon | positive | P0 | FR-003, AC-003-01 |
| TF-04 | Pending tasks shown with pending icon | positive | P0 | FR-003, AC-003-01 |

### Category Grouping (P0)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-05 | Tasks grouped under category headers from tasks.md | positive | P0 | FR-003, AC-003-01 |
| TF-06 | Tasks without category header still included | positive | P1 | FR-003, AC-003-01 |

### Edge Cases — Empty (P1)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-07 | Zero tasks in phase produces appropriate empty summary | negative | P1 | FR-003, AC-003-01 |
| TF-08 | Non-existent phase key returns empty or graceful message | negative | P1 | FR-003, AC-003-01 |
| TF-09 | Null plan handled gracefully without throwing | negative | P1 | FR-003, AC-003-01 |

### Edge Cases — Single Task (P1)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-10 | Single pending task formats correctly with 0/1 progress | positive | P1 | FR-003, AC-003-01 |

### All Tasks Completed (P0)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-11 | 100% completion shown when all tasks done | positive | P0 | FR-003, AC-003-01 |
| TF-12 | All task lines show done icon, no pending icons | positive | P0 | FR-003, AC-003-01 |

### Progress Count Accuracy (P0)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-13 | Done count matches completed task count | positive | P0 | FR-003, AC-003-01 |
| TF-14 | Pending count matches incomplete task count | positive | P0 | FR-003, AC-003-01 |
| TF-15 | Total count equals done + pending | positive | P0 | FR-003, AC-003-01 |
| TF-16 | Percentage is mathematically correct | positive | P0 | FR-003, AC-003-01 |

### Output Format (P1)

| ID | Test | Type | Priority | Traces |
|----|------|------|----------|--------|
| TF-17 | Output contains phase name in header | positive | P1 | FR-003, AC-003-01 |
| TF-18 | Output includes task descriptions | positive | P1 | FR-003, AC-003-01 |
| TF-19 | Pure function produces identical output on repeated calls | positive | P1 | FR-003, AC-003-01 |

## Coverage Summary

- **Total test cases**: 19
- **Positive tests**: 14 (74%)
- **Negative tests**: 3 (16%)
- **Edge case tests**: 5 (26%)
- **P0 (Critical)**: 11
- **P1 (High)**: 8

## Fixture Files

| Fixture | Description | Tasks | Completed |
|---------|-------------|-------|-----------|
| `formatter-mixed.md` | Mix of complete/pending across 3 categories | 5 | 2 |
| `formatter-empty-phase.md` | Phase with zero tasks | 0 | 0 |
| `formatter-single-task.md` | Exactly one pending task | 1 | 0 |
| `formatter-all-complete.md` | All tasks completed | 3 | 3 |
