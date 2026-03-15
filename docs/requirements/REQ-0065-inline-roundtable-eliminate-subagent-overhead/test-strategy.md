# Test Strategy: REQ-0065 -- Inline Roundtable Analysis

**Status**: Complete
**Requirement**: REQ-0065 / GH-124
**Last Updated**: 2026-03-15
**Phase**: 05-test-strategy

---

## 1. Existing Infrastructure

- **Framework**: Node.js built-in test runner (`node:test`)
- **Coverage Tool**: None configured for prompt-verification tests (N/A -- no executable JS)
- **Existing Patterns**: `tests/prompt-verification/*.test.js` -- read markdown files, assert content patterns with `node:assert/strict`
- **Current Coverage**: Prompt-level markdown changes have no line/branch coverage metrics. Validation is structural (grep-based content assertions).
- **Relevant Precedent**: `tests/prompt-verification/analyze-flow-optimization.test.js` (REQ-0037, 28 tests) uses identical pattern

## 2. Strategy for This Requirement

- **Approach**: Extend existing `tests/prompt-verification/` test suite with a new file `inline-roundtable-execution.test.js`
- **New Test Types Needed**: Structural content verification (positive + negative), cross-file consistency checks
- **Coverage Target**: 100% AC coverage (13/13 acceptance criteria), 100% FR coverage (7/7 functional requirements)
- **Coverage Type**: Content pattern assertion (not line coverage -- no executable JS code exists)

## 3. Test Approach

All changes in REQ-0065 are prompt-level markdown modifications to 3 files:
1. `src/claude/commands/isdlc.md` -- steps 7a-7b, 6.5c-6.5d, 7.5a
2. `src/claude/agents/roundtable-analyst.md` -- protocol reference header
3. `src/claude/agents/bug-gather-analyst.md` -- protocol reference header

There is NO executable JavaScript code to unit test. The test strategy uses **structural content verification** -- reading the modified markdown files and asserting that:
- Required patterns ARE present (positive tests)
- Removed patterns are NOT present (negative tests)
- Cross-file references are consistent (integration tests)

## 4. Test Pyramid

The test pyramid is inverted for prompt-level changes (no unit layer exists):

| Layer | Count | Description |
|-------|-------|-------------|
| Unit tests | 0 | N/A -- no executable JavaScript code |
| Structural verification | 22 | Content pattern assertions on 3 markdown files |
| Cross-file integration | 6 | Consistency checks across isdlc.md + roundtable-analyst.md + bug-gather-analyst.md |
| Behavioral validation | 0 | Covered by test case specifications (human-verified during implementation) |
| **Total automated** | **28** | All runnable via `node --test` |

## 5. Test Types

### 5.1 Structural Verification Tests (22 tests)

Read each modified file and assert content patterns using `readFileSync` + `assert.ok`/`assert.match`.

**Positive tests** verify that:
- Inline execution instructions are present in isdlc.md steps 7a-7b
- Inline bug-gather instructions are present in isdlc.md steps 6.5c-6.5d
- Protocol reference headers exist in roundtable-analyst.md and bug-gather-analyst.md
- Session cache reuse language is present (no re-reads, no re-serialization)
- In-memory session record construction is documented in step 7.5a
- Protocol file read instruction exists (Read tool reference)

**Negative tests** verify that:
- Task tool dispatch patterns are removed from steps 7a and 6.5c
- Relay-and-resume loop patterns are removed from steps 7b and 6.5d
- ROUNDTABLE_COMPLETE signal parsing is removed
- BUG_GATHER_COMPLETE signal parsing is removed
- SESSION_RECORD parsing from agent output is removed
- Dispatch prompt re-serialization blocks (PERSONA_CONTEXT, TOPIC_CONTEXT field construction) are removed from step 7a

### 5.2 Cross-File Integration Tests (6 tests)

Verify consistency across the 3 modified files:
- isdlc.md references reading roundtable-analyst.md as protocol reference
- isdlc.md references reading bug-gather-analyst.md as protocol reference
- roundtable-analyst.md protocol reference header matches what isdlc.md expects
- bug-gather-analyst.md protocol reference header matches what isdlc.md expects
- No new dependencies added (package.json unchanged)
- Only 3 files are test targets (scope containment)

### 5.3 Behavioral Validation (human-verified)

These are documented in test-cases.md but not automated -- they require running actual analyze sessions:
- First question appears within 15s (FR-004)
- Conversation quality identical to subagent flow (FR-005)
- Confirmation sequence works correctly (FR-005)
- Memory write-back succeeds (FR-007)

## 6. Test Commands

```bash
# Run REQ-0065 tests only
node --test tests/prompt-verification/inline-roundtable-execution.test.js

# Run all prompt-verification tests
node --test tests/prompt-verification/*.test.js

# Run full test suite (lib + prompt-verification)
npm test && node --test tests/prompt-verification/*.test.js
```

## 7. Flaky Test Mitigation

Flaky test risk is **minimal** for structural content verification:
- Tests read static files from disk (deterministic)
- No network calls, no timing dependencies, no random inputs
- File caching helper prevents redundant reads within a test run
- All assertions are string pattern matches (no floating-point or timing comparisons)

**Potential flaky source**: If tests run before implementation is complete, negative tests (checking removed patterns) will fail. Mitigation: tests are designed to run AFTER implementation, not during.

## 8. Performance Test Plan

Performance testing is **behavioral** for this requirement:
- FR-004 specifies first question < 15s after reaching roundtable step
- This cannot be automated in a structural test -- it requires running an actual analyze session
- Performance validation is documented as a behavioral test case (TC-B01) for human verification during implementation
- No load testing, stress testing, or benchmark automation is applicable

## 9. Security Considerations

No security tests needed:
- Changes are prompt-level markdown only
- No new inputs, outputs, or data flows
- No credentials, secrets, or sensitive data handling
- No new dependencies

## 10. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Incomplete pattern removal (old dispatch code remains) | Medium | High | Negative tests explicitly check for removed patterns |
| Protocol reference header missing or malformed | Low | Medium | Positive tests verify exact header content |
| Cross-file inconsistency (isdlc.md reads file that lacks header) | Low | High | Integration tests verify both sides of every reference |
| Quality regression (conversation output differs) | Low | High | Behavioral test cases for human verification |
