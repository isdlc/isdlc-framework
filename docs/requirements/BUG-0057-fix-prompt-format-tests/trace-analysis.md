# Trace Analysis: Fix 3 failing prompt-format tests (BUG-0057)

**Generated**: 2026-03-27T20:20:00.000Z
**Bug**: 3 tests fail due to stale content expectations in test assertions
**External ID**: None (internal test maintenance)
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

All three test failures share the same root cause pattern: production files (CLAUDE.md, README.md) were refactored in prior workflows, but the corresponding test assertions were not updated to match. The CLAUDE.md SUGGESTED PROMPTS section was consolidated from a multi-line format (with `primary_prompt` variable and `Start a new workflow` fallback) into a single-paragraph protocol. The README.md prerequisites were restructured from a bullet list (containing `**Node.js 20+**`) into a markdown table (with `**Node.js**` and `20+` in separate cells). All three fixes are mechanical string replacements in test files with no production code changes needed.

**Root Cause Confidence**: High
**Severity**: Medium
**Estimated Complexity**: Low

---

## Symptom Analysis

### T46: `lib/invisible-framework.test.js:692`

- **Failing assertion**: `claudeMd.includes('primary_prompt')` returns `false`
- **Error message**: `CLAUDE.md must contain "primary_prompt"`
- **Test group**: Group 13: SUGGESTED PROMPTS Protocol (T44-T46)
- **Test description**: "T46: SUGGESTED PROMPTS content preserved"
- **File under test**: `/CLAUDE.md` (read at line 59 via `CLAUDE_MD_PATH`)

**Verification**: `CLAUDE.md` does NOT contain the string `primary_prompt` (with underscore). It does contain `primary prompt` (two words, no underscore) at line 95 in the compact protocol paragraph.

### TC-028: `lib/node-version-update.test.js:346`

- **Failing assertion**: `readmeContent.includes('**Node.js 20+**')` returns `false`
- **Error message**: `README does not contain "**Node.js 20+**" in system requirements`
- **Test group**: Category 5: README (REQ-005)
- **Test description**: "TC-028: README system requirements shows 'Node.js 20+' (AC-17, P0)"
- **File under test**: `/README.md` (read at line 321 via `README` constant)

**Verification**: `README.md` does NOT contain the substring `**Node.js 20+**`. The prerequisites section was restructured from a bullet list to a markdown table. The table at line 322 has `| **Node.js** | 20+ |` -- the bold markers close before the version number, so the concatenated string `**Node.js 20+**` does not appear.

### TC-09-03: `lib/prompt-format.test.js:632`

- **Failing assertion**: `claudeMd.includes('Start a new workflow')` returns `false`
- **Error message**: `CLAUDE.md Fallback missing "Start a new workflow"`
- **Test group**: TC-09: Fallback Presence
- **Test description**: "TC-09-03: CLAUDE.md contains Fallback with 'Start a new workflow'"
- **File under test**: `/CLAUDE.md` (read at line 631 via `resolve(AGENTS_DIR, '..', '..', '..', 'CLAUDE.md')`)

**Verification**: `CLAUDE.md` does NOT contain the string `Start a new workflow`. The old fallback block was removed entirely. The no-workflow fallback is now `"Show project status"` (which TC-09-02 already asserts successfully).

---

## Execution Path

### T46 Execution Path

1. **Entry**: `node --test lib/invisible-framework.test.js`
2. **Setup** (line 59): `const claudeMd = readFileSync(CLAUDE_MD_PATH, 'utf-8')` reads `/CLAUDE.md`
3. **Test T46** (line 687): Enters `describe('Group 13: SUGGESTED PROMPTS Protocol')`
4. **Assertion 1** (line 689): `claudeMd.includes('SUGGESTED NEXT STEPS')` -- PASSES (string exists at line 95)
5. **Assertion 2** (line 693): `claudeMd.includes('primary_prompt')` -- FAILS (string was changed to `primary prompt`)
6. **Failure**: `AssertionError` thrown with message `CLAUDE.md must contain "primary_prompt"`

### TC-028 Execution Path

1. **Entry**: `node --test lib/node-version-update.test.js`
2. **Setup** (line 321): `const readmeContent = readFileSync(README, 'utf8')` reads `/README.md`
3. **Test TC-028** (line 345): Enters test case
4. **Assertion** (line 346): `readmeContent.includes('**Node.js 20+**')` -- FAILS (table format separates bold name from version)
5. **Failure**: `AssertionError` thrown with message `README does not contain "**Node.js 20+**" in system requirements`

### TC-09-03 Execution Path

1. **Entry**: `node --test lib/prompt-format.test.js`
2. **Setup** (line 631): `const claudeMd = readFileSync(resolve(AGENTS_DIR, '..', '..', '..', 'CLAUDE.md'), 'utf-8')` reads `/CLAUDE.md`
3. **Test TC-09-03** (line 629): Enters test case
4. **Assertion** (line 632): `claudeMd.includes('Start a new workflow')` -- FAILS (string removed from CLAUDE.md)
5. **Failure**: `AssertionError` thrown with message `CLAUDE.md Fallback missing "Start a new workflow"`

---

## Root Cause Analysis

### Primary Hypothesis: Stale test expectations after production refactoring

**Confidence**: High (confirmed by evidence)

**Root Cause**: Commit `b1c7bb2` ("Finalize workflow") refactored the CLAUDE.md SUGGESTED PROMPTS section from a detailed multi-line format into a compact single-paragraph protocol. This changed:
- `primary_prompt` (underscore, code-style) to `primary prompt` (natural language)
- Removed the `Start a new workflow` fallback line entirely

Separately, commit `9edd9bb` ("docs: restructure README") converted the README.md prerequisites from a bullet list format (`- **Node.js 20+** (required)`) to a markdown table format (`| **Node.js** | 20+ |`), which broke the substring match for `**Node.js 20+**`.

In both cases, the production file changes were correct and intentional. The test assertions were simply not updated to match.

### Evidence

| Evidence | Supports Hypothesis |
|----------|-------------------|
| `git log -S 'primary_prompt' -- CLAUDE.md` shows removal in `b1c7bb2` | Yes |
| `git log -S 'Start a new workflow' -- CLAUDE.md` shows removal in `b1c7bb2` | Yes |
| README.md line 322 has table format `\| **Node.js** \| 20+ \|` (no `**Node.js 20+**` substring) | Yes |
| `CLAUDE.md` line 95 contains `primary prompt` (no underscore) | Yes |
| `CLAUDE.md` line 95 fallback is `"Show project status"`, not `"Start a new workflow"` | Yes |
| TC-09-02 (which checks `"Show project status"`) passes successfully | Yes |

### Alternative Hypotheses

None. The root cause is deterministic and fully confirmed by string matching against the production files.

---

## Suggested Fixes

### Fix 1: T46 in `lib/invisible-framework.test.js:693`

**Current** (line 693):
```javascript
claudeMd.includes('primary_prompt'),
```

**Suggested replacement**:
```javascript
claudeMd.includes('primary prompt'),
```

**Rationale**: The CLAUDE.md SUGGESTED PROMPTS protocol at line 95 contains `primary prompt` (natural language, two words) instead of the old `primary_prompt` (underscore). The assertion should match the current content.

### Fix 2: TC-028 in `lib/node-version-update.test.js:346`

**Current** (line 346):
```javascript
assert.ok(readmeContent.includes('**Node.js 20+**'),
```

**Suggested replacement**:
```javascript
assert.ok(readmeContent.includes('**Node.js**') && readmeContent.includes('20+'),
```

**Rationale**: The README.md prerequisites table has `**Node.js**` and `20+` in separate cells. The test should check that both the bold name and the version number exist, matching the current table format.

### Fix 3: TC-09-03 in `lib/prompt-format.test.js:632`

**Option A -- Update assertion to match current content**:

Replace `'Start a new workflow'` with `'Show workflow status'` since that is the remaining fallback-related string in the SUGGESTED PROMPTS protocol.

**Current** (line 632):
```javascript
assert.ok(claudeMd.includes('Start a new workflow'), 'CLAUDE.md Fallback missing "Start a new workflow"');
```

**Suggested replacement**:
```javascript
assert.ok(claudeMd.includes('Show workflow status'), 'CLAUDE.md Fallback missing "Show workflow status"');
```

**Rationale**: The old fallback block had two entries: `Show project status` (tested by TC-09-02) and `Start a new workflow` (tested by TC-09-03). The new protocol mentions `"Show project status"` (for no-workflow state) and `"Show workflow status"` (in the numbered list format). TC-09-02 already covers `Show project status`. TC-09-03 should verify `Show workflow status` -- the other fallback-related prompt.

**Option B -- Remove the test entirely**:

If the `Start a new workflow` prompt was intentionally removed and there is no replacement, delete TC-09-03. However, Option A is preferred because it preserves test coverage of the SUGGESTED PROMPTS fallback content.

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-03-27T20:20:00.000Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "error_keywords": ["primary_prompt", "**Node.js 20+**", "Start a new workflow"],
  "files_traced": {
    "test_files": [
      "lib/invisible-framework.test.js:692-695",
      "lib/node-version-update.test.js:344-348",
      "lib/prompt-format.test.js:629-633"
    ],
    "production_files": [
      "CLAUDE.md:95",
      "README.md:322"
    ],
    "causal_commits": [
      "b1c7bb2 (removed primary_prompt and Start a new workflow from CLAUDE.md)",
      "9edd9bb (restructured README prerequisites from bullet list to table)"
    ]
  },
  "constitutional_validation": {
    "article_iv": "Tracing is read-only; no production files modified",
    "article_vii": "All findings reference specific file paths and line numbers",
    "article_ix": "All three test traces completed with high confidence"
  }
}
```
