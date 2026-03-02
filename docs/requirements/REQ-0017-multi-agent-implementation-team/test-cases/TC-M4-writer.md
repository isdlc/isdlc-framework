# Test Cases: M4 -- Writer Role Awareness

**Test File:** `src/claude/hooks/tests/implementation-debate-writer.test.cjs`
**Target File:** `src/claude/agents/05-software-developer.md` (MODIFIED)
**Traces:** FR-004, AC-004-01 through AC-004-03
**Validation Rules:** VR-027 through VR-029
**Phase:** 05-test-strategy (REQ-0017)

---

## Test Structure

```
describe('M4: Writer Role Awareness (05-software-developer.md)')
  describe('WRITER_CONTEXT Detection')
    TC-M4-01 .. TC-M4-04
  describe('Writer Protocol')
    TC-M4-05 .. TC-M4-08
  describe('Backward Compatibility')
    TC-M4-09 .. TC-M4-10
```

---

## Test Cases

### WRITER_CONTEXT Detection

#### TC-M4-01: WRITER MODE DETECTION section exists

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `WRITER MODE DETECTION` or `WRITER_CONTEXT`
**Failure Message:** "Must contain WRITER MODE DETECTION section"

#### TC-M4-02: WRITER_CONTEXT conditional logic documented

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `WRITER_CONTEXT` AND includes conditional logic (IF/ELSE pattern or equivalent)
**Failure Message:** "Must document WRITER_CONTEXT conditional detection logic"

#### TC-M4-03: per_file_loop flag detection

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `per_file_loop`
**Failure Message:** "Must detect per_file_loop flag in WRITER_CONTEXT"

#### TC-M4-04: mode: writer detection

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `mode` in context of writer mode (e.g., `mode == "writer"` or `mode: writer`)
**Failure Message:** "Must detect mode: writer in WRITER_CONTEXT"

### Writer Protocol

#### TC-M4-05: Sequential file production (one file at a time)

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File content (lowercase) includes `one file` or `one file at a time` or `single file`
**Failure Message:** "Must document sequential file production -- one file at a time"

#### TC-M4-06: FILE_PRODUCED announcement format

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `FILE_PRODUCED`
**Failure Message:** "Must document FILE_PRODUCED announcement format"

#### TC-M4-07: TDD file ordering (test file first)

**Traces:** AC-004-03
**Validation Rule:** VR-029
**Type:** Content
**Assert:** File includes `tdd_ordering` or `TDD` in context of file ordering AND includes reference to test file first/before production file
**Failure Message:** "Must document TDD file ordering -- test file produced before production file"

#### TC-M4-08: ALL_FILES_COMPLETE signal

**Traces:** AC-004-01
**Validation Rule:** VR-027
**Type:** Content
**Assert:** File includes `ALL_FILES_COMPLETE`
**Failure Message:** "Must document ALL_FILES_COMPLETE completion signal"

### Backward Compatibility

#### TC-M4-09: Standard mode unchanged without WRITER_CONTEXT

**Traces:** AC-004-02
**Validation Rule:** VR-028
**Type:** Content
**Assert:** File content documents that without WRITER_CONTEXT, behavior is unchanged / standard mode / "Ignore this section entirely"
**Failure Message:** "Must document standard mode preservation when WRITER_CONTEXT absent"

#### TC-M4-10: Existing sections preserved (no removals)

**Traces:** AC-004-02, NFR-002
**Validation Rule:** VR-028
**Type:** Content
**Assert:** File includes `PHASE OVERVIEW` AND includes `MANDATORY ITERATION ENFORCEMENT` AND includes `CRITICAL` (existing sections not removed)
**Failure Message:** "Must preserve existing software-developer sections (PHASE OVERVIEW, MANDATORY ITERATION ENFORCEMENT)"

---

## AC Coverage Summary

| AC | Test Case(s) |
|----|-------------|
| AC-004-01 | TC-M4-01, TC-M4-02, TC-M4-03, TC-M4-04, TC-M4-05, TC-M4-06, TC-M4-08 |
| AC-004-02 | TC-M4-09, TC-M4-10 |
| AC-004-03 | TC-M4-07 |
