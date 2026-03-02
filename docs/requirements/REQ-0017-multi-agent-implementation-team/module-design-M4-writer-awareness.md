# Module Design M4: Writer Role Awareness

**Module:** WRITER_CONTEXT section addition to `05-software-developer.md`
**Type:** Modified agent (markdown prompt addition)
**Location:** `src/claude/agents/05-software-developer.md`
**Traces:** FR-004 (AC-004-01 through AC-004-03)
**Phase:** 04-design (REQ-0017)

---

## 1. Module Purpose

Add a WRITER_CONTEXT Mode Detection section to the existing software-developer agent. When the orchestrator invokes the Writer within the per-file implementation loop, it passes a WRITER_CONTEXT block in the Task prompt. The software-developer detects this context and adjusts its behavior to produce one file at a time, announce the file path, and wait for the review cycle before proceeding.

When no WRITER_CONTEXT is present, the software-developer behaves exactly as it does today (AC-004-02, NFR-002).

## 2. Insertion Point

The new section is placed AFTER the existing "CRITICAL: Do NOT Run Git Commits" section and BEFORE "# PHASE OVERVIEW". This positioning ensures the Writer detects its mode early, before any implementation logic executes.

**Estimated insertion point:** After line ~41 of current `05-software-developer.md`

## 3. Section Content Design

### Section Header

```markdown
# WRITER MODE DETECTION (Per-File Implementation Loop)
```

### Detection Logic

```markdown
## Writer Mode Detection

Check the Task prompt for a WRITER_CONTEXT block:

IF WRITER_CONTEXT is present AND WRITER_CONTEXT.mode == "writer"
   AND WRITER_CONTEXT.per_file_loop == true:
  You are operating in WRITER MODE within a per-file implementation loop.
  Follow the Writer Protocol below.

IF WRITER_CONTEXT is NOT present OR WRITER_CONTEXT.mode != "writer":
  You are operating in STANDARD MODE (current behavior, unchanged).
  Ignore this section entirely and proceed to PHASE OVERVIEW.
```

### Writer Protocol (When WRITER_CONTEXT Detected)

```markdown
## Writer Protocol

When WRITER_CONTEXT is detected, follow these rules:

### Rule 1: One File at a Time (AC-004-01)

Produce exactly ONE file per delegation cycle. After writing the file:
1. Announce the file path clearly:
   "FILE_PRODUCED: {absolute_or_relative_path}"
2. STOP. Do not produce the next file.
3. Wait for the orchestrator to run the review cycle (Reviewer, possibly Updater).
4. The orchestrator will re-delegate to you with an updated WRITER_CONTEXT
   containing the list of completed files and the next file number.

### Rule 2: TDD File Ordering (AC-004-03)

When WRITER_CONTEXT.tdd_ordering == true:
- For each feature unit, write the TEST file FIRST
- Then write the PRODUCTION file SECOND
- Both files are reviewed individually by the Reviewer

Example ordering for a widget feature:
1. tests/widget.test.cjs (test file -- reviewed first)
2. src/widget.js (production file -- reviewed second)

If the task plan (tasks.md) specifies a different ordering, follow the task
plan ordering. The task plan takes precedence over default TDD ordering.

### Rule 3: File Path Announcement Format

After writing each file, produce this exact announcement line:

FILE_PRODUCED: {file_path}

This line is parsed by the orchestrator to determine which file to send
to the Reviewer. Use the project-relative path (e.g., src/claude/agents/05-widget.md).

### Rule 4: Completion Signal

When all files in the implementation plan are complete, announce:

ALL_FILES_COMPLETE

The orchestrator uses this signal to exit the per-file loop and proceed
to post-loop finalization.

### Rule 5: Re-delegation Awareness

On subsequent delegations (file_number > 1), the WRITER_CONTEXT will include:
- files_completed: list of files already written and reviewed
- current_file_number: which file you are producing next

Use this information to:
- Skip files already produced (do not re-write them)
- Continue from where you left off in the task plan
- Maintain consistency with previously written files
```

## 4. Standard Mode Preservation (AC-004-02, NFR-002)

The key design constraint: when WRITER_CONTEXT is absent, the software-developer MUST behave exactly as it does today. This is achieved by:

1. **Conditional section:** The Writer Protocol section starts with an explicit IF/ELSE check. The ELSE branch says "Ignore this section entirely."
2. **No modifications to existing sections:** The WRITER_CONTEXT section is inserted between two existing sections. No existing text is modified, removed, or reorganized.
3. **No new state reads:** The Writer Protocol only reads the WRITER_CONTEXT from the Task prompt -- it does not add new state.json reads that could affect standard mode.
4. **No behavioral changes outside WRITER_CONTEXT:** The existing MANDATORY ITERATION ENFORCEMENT, test infrastructure detection, parallel test execution, and all other sections remain unchanged.

## 5. WRITER_CONTEXT Schema

The orchestrator passes this context in the Task prompt:

```yaml
WRITER_CONTEXT:
  mode: writer                          # Always "writer" when in per-file loop
  per_file_loop: true                   # Always true when in per-file loop
  tdd_ordering: true                    # TDD ordering for file production
  files_completed:                       # List of completed files (empty on first call)
    - tests/widget.test.cjs
    - src/widget.js
  current_file_number: 3                # Which file number to produce next
```

**First delegation:** `files_completed` is empty (or absent), `current_file_number` is 1.
**Subsequent delegations:** `files_completed` contains reviewed files, `current_file_number` increments.

## 6. Interaction with Existing Software-Developer Sections

| Existing Section | Impact | Notes |
|-----------------|--------|-------|
| MANDATORY ITERATION ENFORCEMENT | No change | Still applies -- tests must pass within the file being written |
| CRITICAL: Do NOT Run Git Commits | No change | Still applies -- no commits in Writer mode either |
| PRE-PHASE CHECK: EXISTING TEST INFRASTRUCTURE | No change | Writer still detects test infrastructure |
| Test Command Discovery | No change | Writer still uses discovered test commands |
| Parallel Test Execution | No change | Writer still uses parallel execution for large suites |
| ATDD Mode Exclusion | No change | If ATDD mode is active, sequential test ordering applies within each file |
| Constitutional Principles | No change | Writer still follows constitutional articles |
| Core Responsibilities | Scoped | In Writer mode, responsibilities are narrowed to ONE file at a time |
| Output Structure | Scoped | In Writer mode, output is a single file + FILE_PRODUCED announcement |

## 7. Estimated Change

**Lines added:** ~40-60 lines (WRITER MODE DETECTION section)
**Lines modified:** 0 (no existing text changed)
**Insertion point:** After "CRITICAL: Do NOT Run Git Commits" section, before "# PHASE OVERVIEW"

## 8. AC Coverage Matrix

| AC | Design Element | Section |
|----|---------------|---------|
| AC-004-01 | WRITER_CONTEXT detected -> produce one file, announce path, STOP, wait for review | 3 (Rule 1) |
| AC-004-02 | No WRITER_CONTEXT -> standard behavior unchanged (no regression) | 4 |
| AC-004-03 | TDD ordering: test file FIRST, production file SECOND | 3 (Rule 2) |
