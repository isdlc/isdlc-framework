# Module Design M2: Implementation Updater Agent

**Module:** `05-implementation-updater.md`
**Type:** New agent (markdown prompt file)
**Location:** `src/claude/agents/05-implementation-updater.md`
**Traces:** FR-002 (AC-002-01 through AC-002-06)
**Phase:** 04-design (REQ-0017)

---

## 1. Module Purpose

The Implementation Updater is a targeted fix agent that receives BLOCKING and WARNING findings from the Reviewer and applies minimal, surgical fixes to the reviewed file. It re-runs tests after modifications and produces an update report documenting each action taken. This agent is analogous to the Refiner role in the Creator/Critic/Refiner debate loop (Phases 01/03/04), but adapted for per-file scope with code modification capabilities.

## 2. Agent Identity

```yaml
---
name: implementation-updater
description: "Use this agent for applying targeted fixes to files flagged by the
  Implementation Reviewer during Phase 06 implementation. This agent acts as the
  Updater role in the Writer/Reviewer/Updater loop, addressing BLOCKING findings,
  re-running tests, and producing an update report.

  This agent is ONLY invoked by the orchestrator during the per-file implementation loop.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - DEV-009  # refactoring
  - DEV-010  # bug-fixing
  - DEV-002  # unit-testing
---
```

## 3. Input Specification

The Updater receives via the Task prompt from the orchestrator:

```
UPDATE_CONTEXT:
  file_path: {absolute or relative path to file}
  cycle: {1|2|3}
  reviewer_verdict: REVISE
  findings:
    blocking:
      - id: B-001
        category: IC-02
        line: 42
        issue: "Missing try/catch around JSON.parse"
        recommendation: "Wrap in try/catch with meaningful error message"
      - id: B-002
        category: IC-01
        line: 15
        issue: "Off-by-one in loop boundary"
        recommendation: "Change <= to < in for loop condition"
    warning:
      - id: W-001
        category: IC-04
        line: 78
        issue: "Variable name 'x' is non-descriptive"
        recommendation: "Rename to 'fileCount' based on usage context"

Address ALL BLOCKING findings. Re-run tests after fixes.
Produce an update report with each finding's disposition.
```

## 4. Fix Protocol

### Step 1: Parse Findings (AC-002-01)

Read all findings from the UPDATE_CONTEXT. Separate into:
- **BLOCKING findings**: MUST be addressed before returning
- **WARNING findings**: SHOULD be addressed if straightforward

### Step 2: Address BLOCKING Findings (AC-002-01, AC-002-06)

For each BLOCKING finding, apply a targeted fix:

| Finding Category | Fix Strategy |
|-----------------|-------------|
| IC-01 (Logic) | Fix the specific logic error at the referenced line. Add guard clauses, fix boundaries, fix return values. |
| IC-02 (Error handling) | Add try/catch, add error propagation, replace empty catches with logging. |
| IC-03 (Security) | Replace unsafe operations with safe alternatives. Add input validation. Remove hardcoded secrets. |
| IC-04 (Code quality) | Rename variables, extract duplicated code, split functions, reduce complexity. |
| IC-05 (Test quality) | Add meaningful assertions, fix test isolation, remove false positives. |
| IC-06 (Tech-stack) | Fix module system (require<->import), fix test runner usage, fix file extensions. |
| IC-07 (Constitutional) | Align implementation with spec, add traceability comments, simplify over-engineering. |

**Minimality rule (AC-002-06):** Each fix MUST be the smallest change that addresses the finding. The Updater MUST NOT:
- Refactor surrounding code that was not flagged
- Add features not requested by the finding
- Change code style in areas not flagged
- Restructure the file beyond what the finding requires

### Step 3: Address WARNING Findings (AC-002-02)

For each WARNING finding, evaluate complexity:

| Complexity | Action | Report Status |
|-----------|--------|---------------|
| Simple (rename, add comment, minor tweak) | Fix it | `fixed` |
| Medium (extract function, add edge case test) | Fix if cycle budget allows | `fixed` or `deferred` |
| Complex (major refactor, architectural change) | Defer to Phase 16 | `deferred` with `[DEFERRED]` tag |

The Updater uses judgment: if a WARNING fix takes <5 lines of change, fix it. If it requires >20 lines or touches multiple functions, defer it.

### Step 4: Dispute Mechanism (AC-002-05)

If the Updater believes a finding is incorrect or inapplicable, it may dispute instead of fix:

**Dispute criteria:**
- The finding references behavior that is intentionally designed this way
- The finding applies a rule that does not apply to this file type
- The finding describes a defect that does not exist (misread by Reviewer)
- The finding's recommended fix would introduce a worse problem

**Dispute format:**
```
| Finding | Action | Rationale |
|---------|--------|-----------|
| B-003 | Disputed | Function is pure with no side effects; null check is unnecessary because caller guarantees non-null (see caller at line 25 of orchestrator.md) |
```

**Dispute rules:**
- Rationale MUST be >= 20 characters (AC-002-05)
- Rationale MUST reference specific evidence (code, spec, or design document)
- Disputed BLOCKING findings are re-evaluated by the Reviewer in the next cycle
- The Reviewer may accept or reject the dispute

### Step 5: Re-Run Tests (AC-002-03)

After all fixes are applied:

1. Detect the project's test command from `package.json` or `state.json -> testing_infrastructure`
2. Run tests for the specific file being fixed:
   - If the fixed file is a test file: run that test file directly
   - If the fixed file is production code: run the corresponding test file
   - If no corresponding test file exists: run the project's full test suite
3. Report test results: `{pass_count}/{total_count} passing`
4. If tests fail after fixes: note which tests fail and whether they are related to the fix

**Test command discovery:**
```
IF file is *.test.cjs: node --test {file_path}
IF file is *.test.js:  node --test {file_path}
IF corresponding test exists: node --test {test_file_path}
ELSE: npm test (or configured test command)
```

### Step 6: Produce Update Report (AC-002-04)

## 5. Update Report Format

```markdown
# Update Report: {file_path}

**Cycle:** {N}
**Updated At:** {ISO-8601 timestamp}
**Tests:** {pass_count}/{total_count} passing

## Findings Addressed

| Finding | Severity | Action | Change |
|---------|----------|--------|--------|
| B-001 | BLOCKING | Fixed | Added try/catch around JSON.parse at line 42 |
| B-002 | BLOCKING | Fixed | Changed `<=` to `<` in loop condition at line 15 |
| W-001 | WARNING | Fixed | Renamed `x` to `fileCount` at line 78 |
| W-002 | WARNING | Deferred | Complex naming refactor across 4 functions; deferred to Phase 16 [DEFERRED] |
| B-003 | BLOCKING | Disputed | Function is pure with no side effects; null check unnecessary (see caller line 25) |

## Changes Made

### Fix 1: B-001 -- Added error handling for JSON.parse
**File:** {file_path}
**Lines:** 42-47
**Before:**
```js
const data = JSON.parse(input);
```
**After:**
```js
let data;
try {
  data = JSON.parse(input);
} catch (err) {
  throw new Error(`Failed to parse input: ${err.message}`);
}
```

### Fix 2: B-002 -- Fixed loop boundary
...

## Deferred Warnings

| Finding | Reason |
|---------|--------|
| W-002 | Complex naming refactor requires changes across 4 functions; better handled as batch refactor in Phase 16 |

## Disputed Findings

| Finding | Rationale |
|---------|-----------|
| B-003 | Function is pure with no side effects; null check is unnecessary because caller guarantees non-null (see caller at line 25 of orchestrator.md). Length: 124 chars. |

## Test Results

**Command:** `node --test src/claude/hooks/tests/widget.test.cjs`
**Result:** 12/12 passing
**Duration:** 1.2s
**Related failures:** None
```

## 6. Enforcement Rules

1. **NEVER introduce new features** (AC-002-06). Only fix what the Reviewer flagged. The Updater does not add functionality, optimize performance, or refactor for style beyond what a finding requires.

2. **NEVER remove existing functionality** (AC-002-06). Fixes must be additive or corrective, not reductive. If a fix requires removing code, it must be dead code flagged by the Reviewer.

3. **ALWAYS re-run tests after changes** (AC-002-03). Even if the fix seems trivial, tests must be executed. Report pass/fail.

4. **ALWAYS document every action** (AC-002-04). Every finding must appear in the report with its disposition: `fixed`, `deferred`, or `disputed`.

5. **Dispute rationale MUST be >= 20 characters** (AC-002-05). Short disputes like "not a bug" are rejected by validation.

6. **NEVER modify files other than the file under review.** If a fix requires changes to another file, note it as `[DEFERRED]` with rationale: "Fix requires changes to {other_file}; deferred to avoid scope creep."

7. **On cycle 2+:** Focus on resolving the Reviewer's NEW findings from the latest cycle. Do not re-fix findings that were already addressed and accepted.

## 7. Relationship to Existing Agents

| Agent | Relationship | Notes |
|-------|-------------|-------|
| 01-requirements-refiner.md | Pattern reference | Same structured change-tracking pattern, adapted for code fixes |
| 02-architecture-refiner.md | Pattern reference | Same dispute mechanism pattern |
| 03-design-refiner.md | Pattern reference | Same BLOCKING-first processing order |
| 05-implementation-reviewer.md | Sequential | Reviewer produces findings, Updater fixes them |
| 05-software-developer.md | Complementary | Writer produces original code, Updater fixes review findings |

## 8. State Updates

After each Updater cycle, the orchestrator updates `implementation_loop_state` in state.json:

```json
{
  "per_file_reviews[current].cycle_history": [
    {
      "cycle": 2,
      "verdict": "REVISE",
      "blocking": 2,
      "warning": 1,
      "timestamp": "ISO-8601",
      "updater_actions": {
        "fixed": 2,
        "deferred": 1,
        "disputed": 0
      }
    }
  ]
}
```

The Updater itself does NOT write to state.json. The orchestrator reads the update report and updates state.

## 9. Estimated Size

200-300 lines of markdown, following the structure of existing refiner agents (01-requirements-refiner.md at 116 lines, but the Updater is more complex due to code modification and test re-run protocol).

## 10. AC Coverage Matrix

| AC | Design Element | Section |
|----|---------------|---------|
| AC-002-01 | Address ALL BLOCKING findings before returning | 4 Step 2, Rule 1 |
| AC-002-02 | Address straightforward WARNING fixes, mark complex ones [DEFERRED] | 4 Step 3 |
| AC-002-03 | Re-run unit tests after modifications, report pass/fail | 4 Step 5 |
| AC-002-04 | Update report: finding ID, action taken, specific change made | 5 |
| AC-002-05 | Dispute rationale minimum 20 characters | 4 Step 4 |
| AC-002-06 | Fixes must be minimal and targeted, no new issues | 4 Step 2 (minimality rule), Rules 1-2 |
