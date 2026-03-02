# Quick Scan: REQ-0003 Hooks API Contract

**Scanned:** 2026-02-08
**Scope Estimate:** Medium
**Feature:** Formalize hooks API contract -- define explicit JSON schema for stdin/stdout between hooks and Claude Code

## Scope Summary

This feature formalizes the implicit API contract between iSDLC hooks and Claude Code by defining explicit JSON schemas for stdin/stdout communication and fixing field name mismatches that cause false gate blocks.

## Files in Scope

### Primary (will be modified)
- `src/claude/hooks/gate-blocker.cjs` -- constitutional_validation and interactive_elicitation field name fixes
- `src/claude/hooks/constitution-validator.cjs` -- ensure written fields match expected contract
- `src/claude/hooks/iteration-corridor.cjs` -- alignment with contract
- `src/claude/hooks/menu-tracker.cjs` -- interactive_elicitation.final_selection writer
- `src/claude/hooks/test-watcher.cjs` -- test iteration state writes
- `src/claude/hooks/lib/common.cjs` -- shared utilities for state read/write
- `src/claude/hooks/config/iteration-requirements.json` -- requirements config

### Secondary (schema documentation)
- New: JSON schema files for hook stdin/stdout contracts
- New: API contract documentation

### Test Files
- `src/claude/hooks/tests/gate-blocker.test.cjs` -- update for new field names
- `src/claude/hooks/tests/constitution-validator.test.cjs`
- `src/claude/hooks/tests/iteration-corridor.test.cjs`
- `src/claude/hooks/tests/menu-tracker.test.cjs`

## Known Bug (from CLAUDE.md)

gate-blocker.cjs expects:
- `constitutional_validation.completed` (boolean) + `iterations_used` (number)
- `interactive_elicitation.final_selection` (string)

But orchestrator agents write:
- `final_status` + `total_iterations`
- Omit `final_selection`

## Risk Assessment

- **Impact:** Medium -- touches core gate enforcement but is a fix + formalization
- **Regression Risk:** Low -- comprehensive test suite exists (284+ CJS tests)
- **Complexity:** Medium -- schema design + backward compatibility
