# Test Cases: M2 -- Implementation Updater Agent

**Test File:** `src/claude/hooks/tests/implementation-debate-updater.test.cjs`
**Target File:** `src/claude/agents/05-implementation-updater.md` (NEW)
**Traces:** FR-002, AC-002-01 through AC-002-06
**Validation Rules:** VR-009 through VR-015
**Phase:** 05-test-strategy (REQ-0017)

---

## Test Structure

```
describe('M2: Implementation Updater Agent (05-implementation-updater.md)')
  TC-M2-01 .. TC-M2-16
```

---

## Test Cases

### TC-M2-01: Agent file exists

**Traces:** FR-002 (prerequisite)
**Validation Rule:** --
**Type:** Existence
**Assert:** `fs.existsSync(UPDATER_PATH)` returns true
**Expected String:** N/A (file existence check)

### TC-M2-02: Agent frontmatter contains correct name

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** File content includes `name: implementation-updater`
**Failure Message:** "Must contain name: implementation-updater in frontmatter"

### TC-M2-03: Agent frontmatter contains model: opus

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** File content includes `model: opus`
**Failure Message:** "Must contain model: opus in frontmatter"

### TC-M2-04: Agent is orchestrator-only (debate mode constraint)

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** File content includes `ONLY invoked by the orchestrator`
**Failure Message:** "Must contain orchestrator-only invocation constraint"

### TC-M2-05: Targeted fix protocol -- address ALL BLOCKING findings

**Traces:** AC-002-01
**Validation Rule:** VR-009
**Type:** Content
**Assert:** File content (lowercase) includes `all blocking` or `address all blocking` or `must address all blocking`
**Failure Message:** "Must contain rule to address ALL BLOCKING findings"

### TC-M2-06: WARNING finding triage (fixed/deferred)

**Traces:** AC-002-02
**Validation Rule:** VR-010
**Type:** Content
**Assert:** File includes `DEFERRED` or `[DEFERRED]` AND includes `WARNING`
**Failure Message:** "Must document WARNING triage with DEFERRED option"

### TC-M2-07: Test re-run requirement after fixes

**Traces:** AC-002-03
**Validation Rule:** VR-011
**Type:** Content
**Assert:** File content (lowercase) includes `re-run` or `rerun` AND includes `test`
**Failure Message:** "Must contain test re-run requirement after modifications"

### TC-M2-08: Update report format specification

**Traces:** AC-002-04
**Validation Rule:** VR-012
**Type:** Content
**Assert:** File includes `# Update Report` AND includes `## Findings Addressed` AND includes `## Test Results`
**Failure Message:** "Must contain update report format with required sections"

### TC-M2-09: Update report contains finding disposition

**Traces:** AC-002-04
**Validation Rule:** VR-012
**Type:** Content
**Assert:** File content includes `fixed` AND includes `deferred` AND includes `disputed` (in the context of finding actions)
**Failure Message:** "Must document finding disposition options: fixed, deferred, disputed"

### TC-M2-10: Dispute mechanism with rationale requirement

**Traces:** AC-002-05
**Validation Rule:** VR-013
**Type:** Content
**Assert:** File content (lowercase) includes `dispute` AND includes `rationale`
**Failure Message:** "Must contain dispute mechanism with rationale requirement"

### TC-M2-11: Dispute rationale minimum 20 characters

**Traces:** AC-002-05
**Validation Rule:** VR-013
**Type:** Content
**Assert:** File content includes `20` in context of dispute rationale length (e.g., ">= 20 characters" or "min 20 chars")
**Failure Message:** "Must specify 20-character minimum for dispute rationale"

### TC-M2-12: Minimality rule (smallest change)

**Traces:** AC-002-06
**Validation Rule:** VR-014
**Type:** Content
**Assert:** File content (lowercase) includes `minimal` or `minimality` or `smallest change`
**Failure Message:** "Must contain minimality rule for fixes"

### TC-M2-13: No scope creep rule

**Traces:** AC-002-06
**Validation Rule:** VR-014
**Type:** Content
**Assert:** File content (lowercase) includes `scope creep` or (`never introduce new features` and `never remove existing`)
**Failure Message:** "Must contain no-scope-creep rule"

### TC-M2-14: Single-file constraint (only modify reviewed file)

**Traces:** AC-002-06
**Validation Rule:** VR-015
**Type:** Content
**Assert:** File content (lowercase) includes `only modify` or `never modify files other than` or `single file`
**Failure Message:** "Must contain single-file constraint -- only modify the file under review"

### TC-M2-15: Changes Made section in update report format

**Traces:** AC-002-04
**Validation Rule:** VR-012
**Type:** Content
**Assert:** File includes `## Changes Made`
**Failure Message:** "Must contain ## Changes Made section in update report format"

### TC-M2-16: Agent file size under 15KB

**Traces:** NFR-001
**Validation Rule:** --
**Type:** Size
**Assert:** `fs.statSync(UPDATER_PATH).size < 15 * 1024`
**Failure Message:** "Agent file size must be under 15KB"

---

## AC Coverage Summary

| AC | Test Case(s) |
|----|-------------|
| AC-002-01 | TC-M2-05 |
| AC-002-02 | TC-M2-06 |
| AC-002-03 | TC-M2-07 |
| AC-002-04 | TC-M2-08, TC-M2-09, TC-M2-15 |
| AC-002-05 | TC-M2-10, TC-M2-11 |
| AC-002-06 | TC-M2-12, TC-M2-13, TC-M2-14 |
