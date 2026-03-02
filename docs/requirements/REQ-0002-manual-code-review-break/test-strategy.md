# Test Strategy: Manual Code Review Break

**Document ID**: REQ-0002-TEST
**Feature**: Manual Code Review Break (Pause Point Before Merge)
**Date**: 2026-02-08
**Engineer**: Test Design Engineer (Phase 05)

---

## 1. Test Scope

| Module | Test Type | Runner | Priority |
|--------|-----------|--------|----------|
| M1: State Schema (`generateState()`) | Unit | node:test | P0 |
| M2: Team Size Prompt (installer) | Unit | node:test | P1 |
| M3: Common Utility (`readCodeReviewConfig()`) | Unit | node:test | P0 |
| M4: Review Reminder Hook | Unit | node:test | P0 |
| M6: Hook Registration | Declarative check | node:test | P1 |
| M5: Orchestrator Review Protocol | E2E (manual) | Workflow test | P1 |

---

## 2. Unit Test Cases: M1 - State Schema

**File**: `test/lib/installer-code-review.test.js`

| ID | Test Case | Input | Expected | AC |
|----|-----------|-------|----------|-----|
| T01 | Default state has code_review section | `generateState('test', false, ts)` | `code_review.enabled === false`, `code_review.team_size === 1` | AC-07.1 |
| T02 | Team size 1 sets enabled false | `generateState('test', false, ts, 1)` | `code_review.enabled === false` | AC-07.3 |
| T03 | Team size 2 sets enabled true | `generateState('test', false, ts, 2)` | `code_review.enabled === true` | AC-07.2 |
| T04 | Team size 5 sets enabled true | `generateState('test', false, ts, 5)` | `code_review.enabled === true`, `team_size === 5` | AC-07.2 |
| T05 | Team size preserved as number | `generateState('test', false, ts, 3)` | `typeof code_review.team_size === 'number'` | AC-07.1 |
| T06 | Monorepo state has code_review | `generateProjectState('test', '.', ts)` | `code_review` section exists | AC-07.1 |

---

## 3. Unit Test Cases: M2 - Team Size Prompt

**File**: `test/lib/installer-team-prompt.test.js`

| ID | Test Case | Input | Expected | AC |
|----|-----------|-------|----------|-----|
| T07 | Numeric input parsed correctly | `"3"` | `teamSize === 3` | AC-08.1 |
| T08 | Default empty input becomes 1 | `""` | `teamSize === 1` | AC-08.2 |
| T09 | Non-numeric input defaults to 1 | `"abc"` | `teamSize === 1` | AC-08.5 |
| T10 | Zero defaults to 1 | `"0"` | `teamSize === 1` | AC-08.5 |
| T11 | Negative defaults to 1 | `"-2"` | `teamSize === 1` | AC-08.5 |
| T12 | Float truncated to integer | `"2.7"` | `teamSize === 2` | AC-08.5 |

---

## 4. Unit Test Cases: M3 - `readCodeReviewConfig()`

**File**: `test/hooks/common-code-review.test.cjs`

| ID | Test Case | Setup | Expected | AC |
|----|-----------|-------|----------|-----|
| T13 | Returns config when present | state.json: `{code_review: {enabled: true, team_size: 3}}` | `{enabled: true, team_size: 3}` | AC-09.1 |
| T14 | Returns defaults when section missing | state.json: `{}` | `{enabled: false, team_size: 1}` | AC-09.1 |
| T15 | Returns defaults when state.json missing | No file | `{enabled: false, team_size: 1}` | AC-09.1 |
| T16 | Returns defaults on parse error | state.json: invalid JSON | `{enabled: false, team_size: 1}` | AC-10.5 |
| T17 | Handles non-boolean enabled | state.json: `{code_review: {enabled: "yes"}}` | `{enabled: false, team_size: 1}` | AC-09.1 |
| T18 | Handles non-number team_size | state.json: `{code_review: {enabled: true, team_size: "three"}}` | `{enabled: true, team_size: 1}` | AC-09.1 |

---

## 5. Unit Test Cases: M4 - Review Reminder Hook

**File**: `test/hooks/review-reminder.test.cjs`

| ID | Test Case | Input Command | State | Expected | AC |
|----|-----------|--------------|-------|----------|-----|
| T19 | Warns when disabled + team > 1 | `git commit -m "msg"` | `{enabled: false, team_size: 3}` | Warning message output | AC-10.2 |
| T20 | Silent when disabled + team == 1 | `git commit -m "msg"` | `{enabled: false, team_size: 1}` | No output | AC-10.3 |
| T21 | Silent when enabled | `git commit -m "msg"` | `{enabled: true, team_size: 3}` | No output | AC-10.2 |
| T22 | Silent on non-commit commands | `git push origin main` | `{enabled: false, team_size: 3}` | No output | AC-10.1 |
| T23 | Silent on non-git commands | `npm test` | `{enabled: false, team_size: 3}` | No output | AC-10.1 |
| T24 | Matches `git commit` variants | `git commit --amend` | `{enabled: false, team_size: 2}` | Warning message | AC-10.1 |
| T25 | Fail-open on state read error | `git commit -m "msg"` | No state file | No output, exit 0 | AC-10.5 |
| T26 | Fail-open on invalid stdin | `(empty stdin)` | Any | No output, exit 0 | AC-10.5 |
| T27 | Completes in < 100ms | `git commit -m "msg"` | `{enabled: false, team_size: 2}` | Execution time < 100ms | NFR-04 |
| T28 | Warning message matches spec | `git commit -m "msg"` | `{enabled: false, team_size: 2}` | Contains "bypassed" and "code_review.enabled" | AC-10.4 |

---

## 6. Declarative Check: M6 - Hook Registration

**File**: `test/hooks/settings-registration.test.cjs` (extend existing)

| ID | Test Case | Expected | AC |
|----|-----------|----------|-----|
| T29 | settings.json has review-reminder.cjs in PostToolUse[Bash] | Hook entry exists with correct path | AC-10.1 |
| T30 | Hook timeout is reasonable | timeout <= 10000 | NFR-04 |

---

## 7. Traceability Matrix

| AC | Test IDs |
|----|----------|
| AC-07.1 | T01, T05, T06 |
| AC-07.2 | T03, T04 |
| AC-07.3 | T02 |
| AC-08.1 | T07 |
| AC-08.2 | T08 |
| AC-08.5 | T09, T10, T11, T12 |
| AC-09.1 | T13, T14, T15, T17, T18 |
| AC-10.1 | T22, T23, T24, T29 |
| AC-10.2 | T19, T21 |
| AC-10.3 | T20 |
| AC-10.4 | T28 |
| AC-10.5 | T16, T25, T26 |
| NFR-04 | T27, T30 |

---

## 8. Coverage Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Unit test coverage (new code) | >= 90% | New hook and utility are small, fully testable |
| Branch coverage (review-reminder.cjs) | 100% | All 4 code paths must be exercised |
| Integration coverage | N/A for this feature | Orchestrator logic tested via E2E workflow runs |

---

## 9. Test Data

### State.json Fixtures

```javascript
// Fixture: code_review enabled, team of 3
const enabledTeam = {
  code_review: { enabled: true, team_size: 3 }
};

// Fixture: code_review disabled, solo dev
const disabledSolo = {
  code_review: { enabled: false, team_size: 1 }
};

// Fixture: code_review disabled, team > 1 (bypassed)
const disabledTeam = {
  code_review: { enabled: false, team_size: 3 }
};

// Fixture: missing code_review section (legacy state)
const legacy = {};
```

### Stdin Fixtures (PostToolUse[Bash])

```javascript
// Fixture: git commit command
const commitStdin = JSON.stringify({
  tool_input: { command: 'git commit -m "feat: add feature"' },
  tool_result: { stdout: '', stderr: '', exit_code: 0 }
});

// Fixture: non-commit git command
const pushStdin = JSON.stringify({
  tool_input: { command: 'git push origin main' },
  tool_result: { stdout: '', stderr: '', exit_code: 0 }
});

// Fixture: non-git command
const npmStdin = JSON.stringify({
  tool_input: { command: 'npm test' },
  tool_result: { stdout: '', stderr: '', exit_code: 0 }
});
```

---

## 10. Test Execution Plan

1. **Phase 06**: Write tests FIRST (TDD per Article II)
   - Create `test/hooks/review-reminder.test.cjs` with T19-T28
   - Create `test/hooks/common-code-review.test.cjs` with T13-T18
   - Extend `test/lib/installer-code-review.test.js` with T01-T06
   - All tests should FAIL initially (red)

2. **Phase 06**: Implement modules
   - Implement M3 (`readCodeReviewConfig()`) -- T13-T18 go green
   - Implement M4 (`review-reminder.cjs`) -- T19-T28 go green
   - Implement M1 (`generateState()` changes) -- T01-T06 go green
   - Verify all 30 tests pass (green)

3. **Phase 07**: Integration testing
   - Run full test suite to verify no regressions
   - Verify hook fires correctly in real workflow

---

## 11. Risks

| Risk | Mitigation |
|------|-----------|
| PostToolUse stdin format changes in Claude Code | Pin to known format; fail-open on unknown |
| node:test assertion differences across Node versions | Use `assert.strictEqual` exclusively |
| Flaky timing test (T27) | Use generous threshold (100ms); retry once |
