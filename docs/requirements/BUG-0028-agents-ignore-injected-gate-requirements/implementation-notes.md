# Implementation Notes: BUG-0028 -- Agents Ignore Injected Gate Requirements

**Bug ID**: BUG-0028 / GH-64
**Phase**: 06-implementation
**Date**: 2026-02-22
**Artifact Folder**: `BUG-0028-agents-ignore-injected-gate-requirements`

---

## Summary

Implemented all 6 functional requirements across 8 modified files (7 specified + 1 pre-existing test fix). The fix strengthens the constraint delivery pipeline at three layers:

1. **Injection format** (Layer 1): Added CRITICAL CONSTRAINTS section and REMINDER footer to gate-requirements-injector output
2. **Delegation prompt** (Layer 2): Updated isdlc.md STEP 3d to pass phases array and add acknowledgment instruction
3. **Agent instructions** (Layer 3): Replaced dead cross-references with inline commit prohibition text
4. **Enforcement feedback** (Layer 4): Improved branch-guard block message to reference CRITICAL CONSTRAINTS

---

## Files Modified

| # | File | FR | Change Description |
|---|------|----|--------------------|
| 1 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | FR-001, FR-002 | Added `buildCriticalConstraints()`, `buildConstraintReminder()`, modified `formatBlock()` and `buildGateRequirementsBlock()` |
| 2 | `src/claude/hooks/tests/gate-requirements-injector.test.cjs` | FR-006 | Added 18 new tests in 3 describe blocks (suites 12-14), updated 1 existing test for backward compatibility |
| 3 | `src/claude/commands/isdlc.md` | FR-003 | Updated STEP 3d to read phases array, describe enhanced format, add acknowledgment instruction |
| 4 | `src/claude/agents/05-software-developer.md` | FR-004 | Replaced dead `See **Git Commit Prohibition** in CLAUDE.md` with 3-line inline prohibition |
| 5 | `src/claude/agents/16-quality-loop-engineer.md` | FR-004 | Replaced dead `See **Git Commit Prohibition** in CLAUDE.md` with 3-line inline prohibition |
| 6 | `src/claude/agents/06-integration-tester.md` | FR-004 | Added 3-line inline commit prohibition (preventive) |
| 7 | `src/claude/hooks/branch-guard.cjs` | FR-005 | Added CRITICAL CONSTRAINTS reference and "Do NOT retry" bullet to block message |
| 8 | `src/claude/hooks/tests/branch-guard.test.cjs` | (regression fix) | Fixed 3 pre-existing test failures (T28, T29, T31) that checked CLAUDE.md for content that never existed there |

---

## Key Decisions

### 1. Default `isIntermediatePhase` to `true` (fail-safe)

When `formatBlock()` is called without the `isIntermediatePhase` parameter (or when `buildGateRequirementsBlock()` is called without the `phases` array), the code defaults to treating the phase as intermediate. This means the git commit prohibition is included by default. This is intentional: it is safer to show a prohibition that is not needed than to omit one that is needed.

### 2. Pre-existing test failures (T28, T29, T31) in branch-guard.test.cjs

These tests were checking for Git Commit Prohibition content in CLAUDE.md, but CLAUDE.md never contained this content. This was the exact bug we are fixing (dead cross-reference). The tests were already failing on main before our changes. We updated them to check the agent files instead of CLAUDE.md, which aligns with the new inline prohibition design.

### 3. 40% character growth budget

The injection block size test (Suite 12, Test 6) verifies that the enhanced format stays within 40% growth of the baseline. With `isIntermediatePhase=true` and the full 06-implementation phase config, the actual growth is well within budget.

### 4. Backward compatibility

- The `GATE REQUIREMENTS FOR PHASE` header is preserved for backward compatibility with `includes()` checks
- The `DO NOT attempt to advance the gate` footer is preserved after the REMINDER line
- Existing tests that use `includes()` assertions continue to pass without modification (except the first-line check in the integration test)

---

## Test Results

- **Total tests**: 108 (73 gate-requirements-injector + 35 branch-guard)
- **Passing**: 108
- **Failing**: 0
- **New tests added**: 18 (gate-requirements-injector) + 3 updated (branch-guard)
- **Pre-existing regressions fixed**: 3 (T28, T29, T31 in branch-guard)

---

## Verification Checklist

- [X] FR-001: CRITICAL CONSTRAINTS section appears before Iteration Requirements (Test 1)
- [X] FR-001: REMINDER footer appears after all sections (Test 2)
- [X] FR-001: Constitutional validation reminder in CRITICAL CONSTRAINTS (Test 3)
- [X] FR-001: Character growth within 40% budget (Test 6)
- [X] FR-002: Git commit prohibition for intermediate phases (Test 4)
- [X] FR-002: No git commit prohibition for final phase (Test 5)
- [X] FR-002: Artifact constraint when artifact_validation enabled (Suite 13, Test 5)
- [X] FR-002: Failing test constraint from workflow modifiers (Suite 13, Test 6)
- [X] FR-003: isdlc.md STEP 3d updated with phases array and acknowledgment instruction
- [X] FR-004: 05-software-developer.md dead cross-reference replaced
- [X] FR-004: 16-quality-loop-engineer.md dead cross-reference replaced
- [X] FR-004: 06-integration-tester.md inline prohibition added
- [X] FR-004: 07-qa-engineer.md existing prohibition verified adequate
- [X] FR-005: branch-guard.cjs block message references CRITICAL CONSTRAINTS
- [X] FR-005: "Do NOT retry" bullet added to block message
- [X] FR-005: gate-blocker.cjs `action_required` fields verified present (AC-005-02)
- [X] FR-006: 18 new tests added and passing
- [X] NFR-001: Character growth within 40% budget
- [X] NFR-002: All functions fail-open (try/catch with safe defaults)
- [X] CON-003: Unconstrained phases produce unchanged output format
