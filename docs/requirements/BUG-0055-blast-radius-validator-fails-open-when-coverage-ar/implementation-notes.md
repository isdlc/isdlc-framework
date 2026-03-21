# Implementation Notes: BUG-0055 — Blast Radius Validator Fails Open

**Phase**: 06-implementation
**Date**: 2026-03-21
**Bug ID**: BUG-0055
**External**: GH-127

---

## Summary

Fixed the blast radius validator regex to correctly parse impact-analysis.md files produced by the roundtable analysis. The previous regex assumed a fixed 2-column layout (file | CHANGE_TYPE) but the roundtable produces 3-column and 4-column formats with variable column positions. Added a zero-file guard diagnostic, and defense-in-depth blast radius cross-checks in Phase 08 and Phase 16 agent prompts.

## Changes Made

### 1. `src/claude/hooks/blast-radius-validator.cjs` (FR-001, FR-002)

**Root cause fix**: Replaced the fixed-column `IMPACT_TABLE_ROW` regex with a two-step flexible matching approach:

- **`FILE_ROW`** (`/^\|.*\`([^\`]+)\`.*\|/`): Matches any table row with a backtick-wrapped file path in any column position.
- **`CHANGE_TYPE_KEYWORDS`** (`/\b(CREATE|MODIFY|DELETE|NEW|NO\s*CHANGE|MAJOR\s+MODIFY|MINOR\s+MODIFY)\b/i`): Scans all columns case-insensitively for recognized change type keywords.
- **`normalizeChangeType()`**: Maps synonyms to canonical forms: "New" -> "CREATE", "Major modify" -> "MODIFY", etc.
- **Zero-file guard**: When `parseImpactAnalysis()` returns empty from content >100 chars, emits a stderr warning while still allowing (fail-open per Article X).

The old `IMPACT_TABLE_ROW` regex is retained but marked `@deprecated` for reference.

### 2. `src/claude/hooks/tests/test-blast-radius-validator.test.cjs` (FR-003)

Added 24 new tests across 4 new describe blocks:
- **Section 14** (8 tests): 4-column format parsing (TC-PIA-13 through TC-PIA-20)
- **Section 15** (6 tests): Zero-file guard behavior (TC-ZFG-01 through TC-ZFG-06)
- **Section 16** (6 tests): Integration tests with temp git repos using 4-column fixtures (TC-INT-11 through TC-INT-16)
- **Section 17** (4 tests): Agent prompt verification for blast radius cross-checks (TC-AGT-01 through TC-AGT-04)

Added 7 new test fixtures matching real roundtable output formats from REQ-0063, REQ-0064, REQ-0066.

### 3. `src/claude/agents/07-qa-engineer.md` (FR-004)

Added "Blast Radius Cross-Check (BUG-0055 FR-004)" section requiring Phase 08 code review to independently verify Tier 1 files from impact-analysis.md appear in git diff. Unaddressed files are reported as BLOCKING findings.

### 4. `src/claude/agents/16-quality-loop-engineer.md` (FR-005)

Added "Blast Radius Coverage Check (BUG-0055 FR-005)" section requiring Phase 16 quality loop to verify Tier 1 file coverage. Unaddressed files are flagged as FAILING quality checks that block GATE-16.

## Test Results

- **Total tests**: 90 (66 existing + 24 new)
- **Passing**: 90
- **Failing**: 0
- **Regressions**: 0
- **Related tests (blast-radius-step3f)**: 66 passing, 0 failing

## TDD Compliance

1. Wrote 24 new failing tests first (TDD Red phase confirmed)
2. All new tests failed before fix was applied (verified by test run)
3. Applied fix (regex + zero-file guard + agent prompts)
4. All 90 tests pass after fix (TDD Green phase confirmed)
5. No refactoring needed (code is minimal and clean)

## Key Design Decisions

1. **Two-step regex over single regex**: A single regex cannot handle variable column counts. The two-step approach (find file, then scan for change type) is simpler and handles all observed formats.
2. **Case-insensitive matching**: The roundtable naturally produces mixed-case ("Modify", "New"). The `i` flag on `CHANGE_TYPE_KEYWORDS` handles this without normalization in the regex itself.
3. **Synonym normalization**: "New" -> "CREATE" mapping is explicit rather than adding "New" to the canonical vocabulary, maintaining backward compatibility with existing consumers.
4. **100-char threshold**: Below 100 chars, impact-analysis.md is likely a stub. Above 100 chars with zero parsed files is suspicious and warrants a diagnostic warning.
5. **Retained deprecated regex**: The old `IMPACT_TABLE_ROW` is kept for reference in case any other code imports it.

## FR-to-File Traceability

| FR | Files Modified | Tests |
|----|---------------|-------|
| FR-001 | blast-radius-validator.cjs | TC-PIA-13 through TC-PIA-20 |
| FR-002 | blast-radius-validator.cjs | TC-ZFG-01 through TC-ZFG-06 |
| FR-003 | test-blast-radius-validator.test.cjs | TC-PIA-13, TC-PIA-14, TC-ZFG-01 (dual-mapped) |
| FR-004 | 07-qa-engineer.md | TC-AGT-01, TC-AGT-02 |
| FR-005 | 16-quality-loop-engineer.md | TC-AGT-03, TC-AGT-04 |
