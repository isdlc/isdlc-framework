# Test Data Plan: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## Overview

This change modifies prompt files (`.md`), not executable code. Test data consists of the `.md` file content itself, which is read and asserted against expected content patterns. No mock data, fixtures, or generated test data are required.

## Test Data Sources

| Source | Description | Used By |
|--------|-------------|---------|
| `src/claude/commands/isdlc.md` | The analyze handler prompt file | TG-01 through TG-05, TG-08, TG-09 |
| `src/claude/agents/roundtable-analyst.md` | The roundtable agent prompt file | TG-06, TG-07, TG-09 |
| `src/claude/hooks/*.cjs` | Hook file list (for count assertion) | TC-09.3 |
| `package.json` | Dependency list (for count assertion) | TC-09.4 |

## Content Patterns Tested

### Boundary Values

| Pattern | Boundary | Test Case |
|---------|----------|-----------|
| Group 1 / Group 2 notation | Must be present (not zero groups) | TC-01.1, TC-01.2 |
| PERSONA_CONTEXT / TOPIC_CONTEXT | Must exist as literal strings | TC-05.1, TC-05.2, TC-06.1, TC-06.2 |
| Hook file count | Exactly 28 (no new hooks) | TC-09.3 |
| Dependency count | Exactly 4 (no new deps) | TC-09.4 |
| Persona file references | At least 1 persona filename present | TC-05.4, TC-09.5 |

### Invalid Inputs

Since these are prompt content verification tests reading static files, "invalid input" scenarios are:

| Scenario | Expected Behavior | Test Case |
|----------|-------------------|-----------|
| PERSONA_CONTEXT absent | Roundtable falls back to file reads | TC-06.3 |
| TOPIC_CONTEXT absent | Roundtable falls back to file reads | TC-06.3 |
| Non-external ref input | Confirmation prompt preserved (no auto-add) | TC-02.3 |
| Sequential step numbering in optimized path | Should not be the only notation (groups required) | TC-01.6 |
| New error codes | Should not exist (no new error paths) | TC-08.3 |

### Maximum-Size Inputs

Not applicable for this test type. The `.md` files are read in full and string-searched. There is no size limit concern for prompt content verification tests. The largest file (`isdlc.md`) is approximately 30KB, well within Node.js string handling limits.

## Test Data Lifecycle

1. **Setup**: None required. Tests read production files directly.
2. **During test**: Files are read once and cached in memory per test suite.
3. **Teardown**: None required. Tests are read-only and make no modifications.

## Test Data Refresh

Test data (the `.md` file contents) changes only when:
- Implementation modifies the prompt files (Phase 06)
- Tests should then transition from failing to passing

No test data generation, seeding, or cleanup is needed at any point.
