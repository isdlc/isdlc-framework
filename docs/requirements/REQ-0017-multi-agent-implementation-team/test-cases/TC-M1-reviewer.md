# Test Cases: M1 -- Implementation Reviewer Agent

**Test File:** `src/claude/hooks/tests/implementation-debate-reviewer.test.cjs`
**Target File:** `src/claude/agents/05-implementation-reviewer.md` (NEW)
**Traces:** FR-001, AC-001-01 through AC-001-08
**Validation Rules:** VR-001 through VR-008
**Phase:** 05-test-strategy (REQ-0017)

---

## Test Structure

```
describe('M1: Implementation Reviewer Agent (05-implementation-reviewer.md)')
  TC-M1-01 .. TC-M1-20
```

---

## Test Cases

### TC-M1-01: Agent file exists

**Traces:** FR-001 (prerequisite)
**Validation Rule:** --
**Type:** Existence
**Assert:** `fs.existsSync(REVIEWER_PATH)` returns true
**Expected String:** N/A (file existence check)

### TC-M1-02: Agent frontmatter contains correct name

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** File content includes `name: implementation-reviewer`
**Failure Message:** "Must contain name: implementation-reviewer in frontmatter"

### TC-M1-03: Agent frontmatter contains model: opus

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** File content includes `model: opus`
**Failure Message:** "Must contain model: opus in frontmatter"

### TC-M1-04: Agent is orchestrator-only (debate mode constraint)

**Traces:** NFR-003
**Validation Rule:** --
**Type:** Content
**Assert:** File content includes `ONLY invoked by the orchestrator`
**Failure Message:** "Must contain orchestrator-only invocation constraint"

### TC-M1-05: IC-01 Logic Correctness check documented

**Traces:** AC-001-01
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-01` AND includes `Logic` (case-insensitive)
**Failure Message:** "Must contain IC-01 Logic Correctness check category"

### TC-M1-06: IC-02 Error Handling check documented

**Traces:** AC-001-02
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-02` AND includes `Error Handling`
**Failure Message:** "Must contain IC-02 Error Handling check category"

### TC-M1-07: IC-03 Security check documented

**Traces:** AC-001-03
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-03` AND includes `Security`
**Failure Message:** "Must contain IC-03 Security check category"

### TC-M1-08: IC-04 Code Quality check documented

**Traces:** AC-001-04
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-04` AND includes `Code Quality`
**Failure Message:** "Must contain IC-04 Code Quality check category"

### TC-M1-09: IC-05 Test Quality check documented

**Traces:** AC-001-05
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-05` AND includes `Test Quality`
**Failure Message:** "Must contain IC-05 Test Quality check category"

### TC-M1-10: IC-06 Tech-Stack Alignment check documented

**Traces:** AC-001-06
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-06` AND includes `Tech-Stack` (case-insensitive)
**Failure Message:** "Must contain IC-06 Tech-Stack Alignment check category"

### TC-M1-11: IC-07 Constitutional Compliance check documented

**Traces:** AC-001-07
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `IC-07` AND includes `Constitutional`
**Failure Message:** "Must contain IC-07 Constitutional Compliance check category"

### TC-M1-12: IC-08 Structured Output self-check documented

**Traces:** AC-001-08
**Validation Rule:** VR-003
**Type:** Content
**Assert:** File includes `IC-08` AND includes `Structured Output`
**Failure Message:** "Must contain IC-08 Structured Output self-check category"

### TC-M1-13: All 8 IC categories present (completeness)

**Traces:** AC-001-01 through AC-001-08
**Validation Rule:** VR-004
**Type:** Content (compound)
**Assert:** File includes all of: `IC-01`, `IC-02`, `IC-03`, `IC-04`, `IC-05`, `IC-06`, `IC-07`, `IC-08`
**Failure Message:** "Must contain all 8 IC check category identifiers"

### TC-M1-14: Severity levels defined (BLOCKING, WARNING, INFO)

**Traces:** AC-001-08
**Validation Rule:** VR-001, VR-005
**Type:** Content
**Assert:** File includes `BLOCKING` AND `WARNING` AND `INFO`
**Failure Message:** "Must define all three severity levels: BLOCKING, WARNING, INFO"

### TC-M1-15: Verdict PASS/REVISE format defined

**Traces:** AC-001-08
**Validation Rule:** VR-001
**Type:** Content
**Assert:** File includes `Verdict` AND includes `PASS` AND includes `REVISE`
**Failure Message:** "Must define verdict values PASS and REVISE"

### TC-M1-16: Convergence criteria (0 BLOCKING = PASS)

**Traces:** AC-001-08, FR-001
**Validation Rule:** VR-001
**Type:** Content
**Assert:** File content (lowercase) includes reference to zero blocking findings producing PASS verdict
**Failure Message:** "Must define convergence: 0 BLOCKING findings = PASS verdict"

### TC-M1-17: Structured output format specification

**Traces:** AC-001-08
**Validation Rule:** VR-003
**Type:** Content
**Assert:** File includes `# Per-File Review` AND `## Summary` AND `## BLOCKING Findings` AND `## WARNING Findings`
**Failure Message:** "Must contain structured output format with required sections"

### TC-M1-18: File-type applicability matrix

**Traces:** AC-001-01 through AC-001-07
**Validation Rule:** VR-004
**Type:** Content
**Assert:** File includes `Applicability` (case-insensitive) or a table with file types (Production, Test, Markdown, JSON) mapped to IC categories
**Failure Message:** "Must contain file-type applicability matrix for IC categories"

### TC-M1-19: Line-reference protocol

**Traces:** AC-001-08
**Validation Rule:** VR-003
**Type:** Content
**Assert:** File content (lowercase) includes `line` reference in finding format (e.g., "line number" or "Line:" in output format)
**Failure Message:** "Must contain line-reference protocol in findings format"

### TC-M1-20: Read-only constraint (Reviewer never modifies files)

**Traces:** FR-001
**Validation Rule:** VR-007
**Type:** Content
**Assert:** File content (lowercase) includes `never modify` or `read-only`
**Failure Message:** "Must contain read-only constraint -- Reviewer must not modify reviewed files"

---

## AC Coverage Summary

| AC | Test Case(s) |
|----|-------------|
| AC-001-01 | TC-M1-05, TC-M1-13, TC-M1-18 |
| AC-001-02 | TC-M1-06, TC-M1-13, TC-M1-18 |
| AC-001-03 | TC-M1-07, TC-M1-13, TC-M1-18 |
| AC-001-04 | TC-M1-08, TC-M1-13, TC-M1-18 |
| AC-001-05 | TC-M1-09, TC-M1-13, TC-M1-18 |
| AC-001-06 | TC-M1-10, TC-M1-13, TC-M1-18 |
| AC-001-07 | TC-M1-11, TC-M1-13, TC-M1-18 |
| AC-001-08 | TC-M1-12, TC-M1-13, TC-M1-14, TC-M1-15, TC-M1-16, TC-M1-17, TC-M1-19 |
