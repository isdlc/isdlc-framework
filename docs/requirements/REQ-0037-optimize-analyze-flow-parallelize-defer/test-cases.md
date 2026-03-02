# Test Cases: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## Test File

`tests/prompt-verification/analyze-flow-optimization.test.js`

## Test Summary

| Metric | Count |
|--------|-------|
| Total test cases | 40 |
| Test groups | 9 |
| P0 (Critical) | 20 |
| P1 (High) | 16 |
| P2 (Medium) | 4 |
| Positive tests | 36 |
| Negative tests | 4 |
| Pre-implementation passing | 25 |
| Pre-implementation failing | 15 |

## Test Groups

### TG-01: Dependency Group Execution (FR-001) -- 6 tests

Tests that the analyze handler in `isdlc.md` restructures its pre-dispatch pipeline into dependency groups.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-01.1 | P0 | positive | AC-001-01 | Group 1 parallel operations documented (issue fetch, grep, persona reads) |
| TC-01.2 | P0 | positive | AC-001-02 | Group 2 operations documented with dependency on Group 1 |
| TC-01.3 | P0 | positive | AC-001-03 | Dispatch documented as firing after Group 2 with inlined context fields |
| TC-01.4 | P1 | positive | AC-001-04 | Dependency groups apply to both #N and PROJECT-N references |
| TC-01.5 | P1 | positive | AC-001-01 | Explicit parallel execution language present |
| TC-01.6 | P2 | negative | AC-001-01 | Optimized path uses group notation, not just sequential steps |

### TG-02: Auto-Add for External References (FR-002) -- 4 tests

Tests that external references (#N, PROJECT-N) bypass the confirmation prompt.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-02.1 | P0 | positive | AC-002-01 | Auto-add for GitHub refs without confirmation prompt |
| TC-02.2 | P1 | positive | AC-002-02 | Auto-add applies to Jira refs as well |
| TC-02.3 | P0 | positive | AC-002-03 | Non-external refs preserve confirmation prompt |
| TC-02.4 | P1 | positive | AC-002-04 | Auto-add fires only when no existing folder found |

### TG-03: Pre-Fetched Issue Data Passthrough (FR-003) -- 3 tests

Tests that pre-fetched issue data is passed to the add handler.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-03.1 | P0 | positive | AC-003-01 | Pre-fetched issue data referenced and passed to add handler |
| TC-03.2 | P1 | positive | AC-003-02 | Direct add handler invocation fetches data normally (conditional) |
| TC-03.3 | P0 | positive | AC-003-03 | Add handler retains sole folder creation ownership |

### TG-04: Eliminate Re-Read After Write (FR-004) -- 2 tests

Tests that files are not re-read after the add handler writes them.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-04.1 | P0 | positive | AC-004-01 | In-memory reuse of add handler output documented |
| TC-04.2 | P1 | positive | AC-004-02 | Dispatch prompt composed from in-memory objects |

### TG-05: Inlined Context in Dispatch (FR-005) -- 5 tests

Tests that persona and topic content is pre-read and inlined in the dispatch prompt.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-05.1 | P0 | positive | AC-005-01 | PERSONA_CONTEXT field in dispatch prompt |
| TC-05.2 | P0 | positive | AC-005-02 | TOPIC_CONTEXT field in dispatch prompt |
| TC-05.3 | P1 | positive | AC-005-03 | Inlined context uses clear delimiters |
| TC-05.4 | P1 | positive | AC-005-01 | All 3 persona files referenced for pre-reading |
| TC-05.5 | P1 | positive | AC-005-02 | Topic files referenced for pre-reading |

### TG-06: Roundtable Accepts Inlined Context (FR-006) -- 5 tests

Tests that the roundtable agent accepts optional inlined context and has fallback paths.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-06.1 | P0 | positive | AC-006-01 | Roundtable checks for PERSONA_CONTEXT |
| TC-06.2 | P0 | positive | AC-006-02 | Roundtable checks for TOPIC_CONTEXT |
| TC-06.3 | P0 | positive | AC-006-03 | Fallback to file reads when inlined context absent |
| TC-06.4 | P1 | positive | AC-006-01 | Persona file reads skipped when PERSONA_CONTEXT present |
| TC-06.5 | P1 | positive | AC-006-02 | Topic file reads skipped when TOPIC_CONTEXT present |

### TG-07: Deferred Codebase Scan (FR-007) -- 5 tests

Tests that the codebase scan is deferred from before Maya's first message to after the first user exchange.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-07.1 | P0 | positive | AC-007-01 | Maya first message composed without codebase scan |
| TC-07.2 | P0 | positive | AC-007-02 | Codebase scan runs after first user reply |
| TC-07.3 | P1 | positive | AC-007-03 | Alex contributes codebase evidence at exchange 2 |
| TC-07.4 | P2 | positive | AC-007-04 | Maya continues solo if scan is slow |
| TC-07.5 | P0 | negative | AC-007-01 | Silent scan exception removed from Opening section |

### TG-08: Error Handling Unchanged (FR-008) -- 3 tests

Tests that error handling behavior is preserved without new error paths.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-08.1 | P0 | positive | AC-008-01 | Error handling for gh issue view preserved |
| TC-08.2 | P1 | positive | AC-008-02 | Error handling for add handler preserved |
| TC-08.3 | P1 | negative | AC-008-03 | No new error codes or error paths introduced |

### TG-09: Cross-File Consistency (Integration) -- 7 tests

Tests cross-file consistency and regression guards.

| ID | Priority | Type | AC | Description |
|----|----------|------|----|-------------|
| TC-09.1 | P0 | positive | AC-005-01+AC-006-01 | PERSONA_CONTEXT referenced in both files |
| TC-09.2 | P0 | positive | AC-005-02+AC-006-02 | TOPIC_CONTEXT referenced in both files |
| TC-09.3 | P0 | negative | Article XII | No new hooks added (28 total) |
| TC-09.4 | P0 | negative | Article V | No new dependencies added (4 total) |
| TC-09.5 | P1 | positive | AC-006-03 | Roundtable retains persona file read fallback |
| TC-09.6 | P1 | positive | AC-006-03 | Roundtable retains topic file read fallback |
| TC-09.7 | P1 | positive | Constraint | Only 2 target files exist and are non-empty |

## Coverage Verification

### Requirement Coverage (100%)

| Requirement | Test Cases | Covered |
|-------------|------------|---------|
| FR-001 | TC-01.1 through TC-01.6 | Yes |
| FR-002 | TC-02.1 through TC-02.4 | Yes |
| FR-003 | TC-03.1 through TC-03.3 | Yes |
| FR-004 | TC-04.1 through TC-04.2 | Yes |
| FR-005 | TC-05.1 through TC-05.5 | Yes |
| FR-006 | TC-06.1 through TC-06.5, TC-09.5, TC-09.6 | Yes |
| FR-007 | TC-07.1 through TC-07.5 | Yes |
| FR-008 | TC-08.1 through TC-08.3 | Yes |

### AC Coverage (100%)

All 22 acceptance criteria (AC-001-01 through AC-008-03) are traced to at least one test case in the traceability matrix.
