# Bug Report: BUG-0057

**Bug ID**: BUG-0057-fix-prompt-format-tests
**External Link**: None (internal test maintenance)
**Severity**: Medium
**Status**: Open
**Reported**: 2026-03-27

## Summary

3 tests fail due to stale content expectations in test assertions that no longer match current CLAUDE.md and README.md content. Production code is correct; only test expectations are stale.

## Expected Behavior

All tests in `lib/invisible-framework.test.js`, `lib/node-version-update.test.js`, and `lib/prompt-format.test.js` pass without errors.

## Actual Behavior

3 tests fail with `AssertionError`:

| Test ID | File | Line | Assertion | Problem |
|---------|------|------|-----------|---------|
| T46 | `lib/invisible-framework.test.js` | 692 | Expects `"primary_prompt"` in CLAUDE.md | String no longer exists in CLAUDE.md |
| TC-028 | `lib/node-version-update.test.js` | 346 | Expects `"**Node.js 20+**"` in README.md | String no longer matches README content |
| TC-09-03 | `lib/prompt-format.test.js` | 632 | Expects `"Start a new workflow"` in CLAUDE.md | String no longer exists in CLAUDE.md |

## Reproduction Steps

1. Run: `node --test lib/invisible-framework.test.js` — T46 fails
2. Run: `node --test lib/node-version-update.test.js` — TC-028 fails
3. Run: `node --test lib/prompt-format.test.js` — TC-09-03 fails

## Root Cause

Production files (CLAUDE.md, README.md) were updated in previous workflows but the corresponding test assertions were not updated to match the new content.

## Fix Requirement

Update the 3 test assertions to match the current content of CLAUDE.md and README.md. Either update the expected strings to match what currently exists, or remove assertions for content that was intentionally removed.
