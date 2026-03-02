# Test Strategy: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Existing Infrastructure

| Aspect | Value |
|--------|-------|
| **Test Runner** | `node:test` (built-in, Article II) |
| **Module System** | CJS for hooks (`*.test.cjs`), ESM for CLI/lib (`*.test.js`) |
| **Hook Test Location** | `src/claude/hooks/tests/*.test.cjs` |
| **Prompt Verification Location** | `tests/prompt-verification/*.test.js` or co-located in hooks tests |
| **Test Commands** | `npm run test:hooks` (hooks), `node --test <file>` (individual) |
| **Assertion Library** | `node:assert/strict` |
| **Coverage Tool** | None configured (manual verification) |
| **Existing Pattern** | Direct `require()` of CJS modules, `fs.readFileSync()` for content verification |
| **Existing Hook Tests** | 25 test files covering hooks and common utilities |
| **Menu Halt Enforcer Coverage** | Full coverage in `menu-halt-enforcer.test.cjs` |

### Conventions (from existing tests)

1. CJS hook tests use `require('node:test')` and `require('node:assert/strict')`
2. Test files are co-located: `src/claude/hooks/tests/*.test.cjs`
3. Test helpers use `fs.mkdtempSync()` for temp directories, `fs.rmSync()` for cleanup
4. Module loading is direct `require()`, not subprocess
5. No external test dependencies (no jest, mocha, sinon, nock) -- Article V
6. Mocking is manual (env var manipulation, file system fixtures)
7. Content verification tests read files with `fs.readFileSync()` and assert patterns

---

## 2. Test Strategy Overview

### Approach: Extend Existing Test Suite

This feature modifies 5 existing files (~205 lines total, ~85% markdown/prompt changes). The testing approach reflects this composition:

- **Prompt-verification tests** (~70% of test effort): Read modified markdown/prompt files and assert required sections, patterns, and keywords are present.
- **CJS unit tests** (~15% of test effort): Test `menu-halt-enforcer.cjs` backlog-picker regex if changes are needed (M5).
- **Validation rule tests** (~10% of test effort): Verify regex patterns from `validation-rules.json` match expected valid/invalid inputs.
- **Error code coverage** (~5% of test effort): Verify all 22 BLG-E* error codes from `error-taxonomy.md` are referenced in the appropriate files.

No new test infrastructure or dependencies are introduced. No MCP calls are made during tests -- all MCP-dependent behavior is verified at the prompt instruction level (verifying that CLAUDE.md.template contains the correct MCP check flow instructions).

### Test Types

| Type | Scope | Files | Count |
|------|-------|-------|-------|
| **Content Verification** | CLAUDE.md.template M1 sections | `backlog-claudemd-template.test.cjs` | ~16 tests |
| **Content Verification** | Orchestrator M2a/M2b/M2c sections | `backlog-orchestrator.test.cjs` | ~14 tests |
| **Content Verification** | Requirements analyst M3 section | `backlog-requirements-analyst.test.cjs` | ~6 tests |
| **Content Verification** | Command spec M4 references | `backlog-command-spec.test.cjs` | ~4 tests |
| **Unit** | Menu halt enforcer M5 regex | `menu-halt-enforcer.test.cjs` (extend) | ~3 tests |
| **Validation** | Regex rules from validation-rules.json | `backlog-validation-rules.test.cjs` | ~18 tests |
| **Error Coverage** | BLG-E* error code references | Embedded in content verification tests | ~8 tests |

**Total: ~69 test cases** covering 22 acceptance criteria, 5 NFRs, 22 error codes, and 18 validation rules.

### Coverage Targets

| Target | Metric | Rationale |
|--------|--------|-----------|
| Acceptance Criteria | 22/22 ACs covered (100%) | Article VII: every requirement traced |
| Error Codes | 22/22 BLG-E* codes referenced | Error taxonomy completeness |
| Validation Rules | 18/18 VR-* rules verified | Regex correctness critical for parsing |
| NFRs | 5/5 NFRs verified | Must Have requirements |
| Modified Files | 5/5 files tested | Every changed file has test coverage |

---

## 3. Test Approach by Module

### 3.1 Module M1: CLAUDE.md.template -- Content Verification

**File:** `src/claude/hooks/tests/backlog-claudemd-template.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/backlog-claudemd-template.test.cjs`
**Integrated:** `npm run test:hooks`

**Strategy:** Read `src/claude/CLAUDE.md.template` with `fs.readFileSync()` and assert the presence of required sections, patterns, and content blocks. This follows the established pattern from `provider-config-validation.test.cjs` and `provider-documentation.test.js`.

**What to verify:**
1. `## Backlog Management` section header exists
2. `### BACKLOG.md Format Convention` subsection with format documentation
3. `### Backlog Operations` subsection with intent detection table
4. Intent detection entries: `backlog-add`, `backlog-refresh`, `backlog-reorder`, `backlog-view`, `backlog-work`
5. `### MCP Prerequisite Check` subsection with setup instructions
6. `claude mcp add` setup command in MCP check section
7. `### Adapter Interface` subsection with `getTicket`, `updateStatus`, `getLinkedDocument`
8. Graceful degradation language (local operations work without MCP)
9. No new slash commands introduced (NFR-001 verification)
10. Metadata sub-bullet format examples (`**Jira:**`, `**Priority:**`, `**Confluence:**`)
11. Section placement: after Provider section, before Agent Framework section
12. Error messages for BLG-E001, BLG-E002, BLG-E003 referenced or paraphrased

**Traces:** FR-001, FR-007, FR-008, FR-009, NFR-001, NFR-003, AC-001-03, AC-006-01, AC-007-01, AC-007-02

### 3.2 Module M2: Orchestrator Extensions -- Content Verification

**File:** `src/claude/hooks/tests/backlog-orchestrator.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/backlog-orchestrator.test.cjs`

**Strategy:** Read `src/claude/agents/00-sdlc-orchestrator.md` and verify the three sub-module sections contain the required instructions.

**M2a -- Backlog Picker (what to verify):**
1. Backlog picker reads `BACKLOG.md` (not `CLAUDE.md` for item scanning)
2. `## Open` section scanning instruction present
3. Jira metadata sub-bullet parsing instructions (`**Jira:**`, `**Confluence:**`)
4. `[Jira: PROJ-1234]` display suffix in picker options
5. Backward compatibility: fallback to CLAUDE.md if BACKLOG.md does not exist
6. Item format regex reference (`/^- (\d+(?:\.\d+)*) \[([ x~])\] (.+)$/`)

**M2b -- Workflow Init (what to verify):**
7. `jira_ticket_id` field population in `active_workflow`
8. `confluence_urls` field population in `active_workflow`
9. Absence semantics: fields omitted (not null) for local-only items

**M2c -- Finalize Sync (what to verify):**
10. Non-blocking Jira status sync step after merge
11. `updateStatus` call to transition Jira ticket to "Done"
12. `jira_sync_status` field (`synced`, `failed`, null) in workflow_history
13. Non-blocking constraint: failure does not block finalize
14. BACKLOG.md update: mark `[x]`, move to `## Completed`

**Traces:** FR-001..FR-006, NFR-002, NFR-003, AC-001-01, AC-001-02, AC-002-01, AC-002-02, AC-002-03, AC-003-01, AC-003-02, AC-004-01, AC-004-04, AC-005-01, AC-005-02, AC-005-03, AC-006-01, AC-006-02, AC-006-03

### 3.3 Module M3: Requirements Analyst -- Content Verification

**File:** `src/claude/hooks/tests/backlog-requirements-analyst.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/backlog-requirements-analyst.test.cjs`

**Strategy:** Read `src/claude/agents/01-requirements-analyst.md` and verify the Confluence context injection section.

**What to verify:**
1. `# CONFLUENCE CONTEXT` section header exists (or similar)
2. `active_workflow.confluence_urls` check instruction present
3. MCP call instruction for `getLinkedDocument(url)`
4. Truncation to 5000 characters instruction
5. Graceful degradation: skip silently if no confluence_urls
6. Context mapping table (Spec -> Business Context, Design -> Technical Context, etc.)

**Traces:** FR-005, NFR-003, NFR-005, AC-004-02, AC-004-03

### 3.4 Module M4: Command Spec -- Content Verification

**File:** `src/claude/hooks/tests/backlog-command-spec.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/backlog-command-spec.test.cjs`

**Strategy:** Read `src/claude/commands/isdlc.md` and verify references are updated.

**What to verify:**
1. BACKLOG.md scanning reference in feature/fix no-description flow
2. Jira status sync documentation in STEP 4 FINALIZE section
3. `jira_ticket_id` reference in finalize documentation
4. Non-blocking sync language in finalize

**Traces:** FR-005, FR-006, AC-004-01, AC-005-01

### 3.5 Module M5: Menu Halt Enforcer -- Unit Tests (Conditional)

**File:** `src/claude/hooks/tests/menu-halt-enforcer.test.cjs` (extend existing)
**Runner:** `npm run test:hooks`

**Strategy:** Add test cases verifying the backlog-picker pattern works with Jira ticket ID suffixes in numbered options.

**What to verify:**
1. Backlog picker with `[Jira: PROJ-1234]` suffixes still triggers halt violation detection
2. Backlog picker with mixed Jira-backed and local-only items works
3. Existing `[O] Other` detection is unaffected

**Assessment:** Based on analysis of the current hook code, the `backlog-picker` pattern in `MENU_PATTERNS` tests for `[O] Other` and `[\d+]` patterns. Adding `[Jira: PROJ-1234]` to numbered items should not affect detection since the regex matches `[O] Other` as the end marker. If M5 requires no code change, these tests still serve as regression guards confirming compatibility.

**Traces:** FR-002, AC-001-01

### 3.6 Validation Rules -- Regex Verification

**File:** `src/claude/hooks/tests/backlog-validation-rules.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/backlog-validation-rules.test.cjs`

**Strategy:** Load `validation-rules.json` and test each regex pattern against the documented valid/invalid examples. This ensures the validation rules are correctly specified before implementation relies on them.

**What to verify (all 18 VR-* rules):**
1. VR-001: BACKLOG.md item line regex matches valid/invalid examples
2. VR-002: Metadata sub-bullet regex matches valid/invalid examples
3. VR-003: Jira ticket ID regex matches valid/invalid examples
4. VR-004: Confluence URL format matches valid/invalid examples
5. VR-005: Priority enum values are recognized
6. VR-006: Description truncation at 200 characters
7. VR-007: Confluence content truncation at 5000 characters
8. VR-008: Required section headers (`## Open`, `## Completed`)
9. VR-009: Item number uniqueness detection
10. VR-010: Jira-backed detection rule (`**Jira:**` sub-bullet presence)
11. VR-011: state.json Jira fields optional and nullable
12. VR-012: jira_sync_status enum values
13. VR-013: Completed date ISO 8601 format regex
14. VR-014: Max 15 items in picker
15. VR-015: Completion move-to-section steps
16. VR-016: Refresh conflict resolution rules
17. VR-017: Reorder local-only constraint
18. VR-018: Workflow type from Jira issue type mapping

**Traces:** VR-001..VR-018, FR-001..FR-006

---

## 4. MCP Mock Strategy

### No Runtime MCP Mocking Required

This feature's Jira/Confluence integration is entirely **prompt-driven** (ADR-0001). The LLM reads CLAUDE.md instructions and executes MCP tool calls at runtime. There is no framework JavaScript code that calls MCP APIs directly.

Therefore:
- **No MCP mock library** is needed (no sinon, nock, or test doubles)
- **No HTTP interception** is needed (no MCP server simulation)
- **MCP behavior is tested at the instruction level**: verify that the correct MCP check flow, error messages, and graceful degradation instructions are present in the prompt files

### What Is Tested

| Layer | Test Approach | What It Validates |
|-------|--------------|-------------------|
| MCP prerequisite check instructions | Content verification (M1 tests) | CLAUDE.md contains correct MCP check flow |
| MCP error handling instructions | Content verification (M1, M2 tests) | Error messages match BLG-E001..BLG-E003 |
| MCP tool call documentation | Content verification (M1 tests) | `getTicket`, `updateStatus`, `getLinkedDocument` documented |
| Graceful degradation instructions | Content verification (M1, M2, M3 tests) | Non-blocking behavior, fallback paths documented |
| Non-blocking sync pattern | Content verification (M2c tests) | Finalize never blocks on MCP failure |

### What Is NOT Tested (and Why)

| Not Tested | Reason |
|-----------|--------|
| Actual Jira API calls | No framework code makes these calls -- LLM executes MCP at runtime |
| Atlassian MCP server connectivity | External dependency, tested by Atlassian |
| MCP authentication flow | Managed by Claude Code MCP infrastructure, not by iSDLC framework |
| End-to-end Jira import flow | Requires live MCP server; manual verification in QA phase |

---

## 5. Test Commands

| Command | Scope |
|---------|-------|
| `node --test src/claude/hooks/tests/backlog-claudemd-template.test.cjs` | M1 content verification |
| `node --test src/claude/hooks/tests/backlog-orchestrator.test.cjs` | M2 content verification |
| `node --test src/claude/hooks/tests/backlog-requirements-analyst.test.cjs` | M3 content verification |
| `node --test src/claude/hooks/tests/backlog-command-spec.test.cjs` | M4 content verification |
| `node --test src/claude/hooks/tests/backlog-validation-rules.test.cjs` | VR-001..VR-018 validation |
| `node --test src/claude/hooks/tests/menu-halt-enforcer.test.cjs` | M5 regression tests |
| `npm run test:hooks` | All hook tests (including all new ones) |

---

## 6. Critical Paths

The following paths are critical and must have 100% test coverage (Article II.2):

1. **BACKLOG.md format parsing**: VR-001 (item line regex), VR-002 (metadata sub-bullet regex), VR-003 (Jira ticket ID regex)
2. **MCP prerequisite check flow**: BLG-E001 (not configured), BLG-E002 (auth expired), BLG-E003 (connection failed)
3. **Backlog picker backward compatibility**: BACKLOG.md scanning with fallback to CLAUDE.md
4. **Non-blocking finalize sync**: Jira transition failure must never block workflow completion
5. **Graceful degradation**: All local operations work without MCP configured
6. **Jira-backed item detection**: VR-010 (`**Jira:**` sub-bullet presence)

---

## 7. Error Code Coverage Matrix

All 22 BLG-E* error codes must be referenced or tested.

| Error Code | Verified In | Test Approach |
|-----------|------------|---------------|
| BLG-E001 | M1 tests (MCP check section) | Content: setup instructions present |
| BLG-E002 | M1 tests (MCP check section) | Content: re-auth instructions present |
| BLG-E003 | M1 tests (MCP check section) | Content: network error message present |
| BLG-E010 | M1 tests (error handling) | Content: "not found" message present |
| BLG-E011 | M1 tests (error handling) | Content: "permission" error present |
| BLG-E012 | M1 or M2 tests | Content: "already in backlog" handling present |
| BLG-E013 | M2c tests (finalize sync) | Content: transition blocked handling present |
| BLG-E014 | M2c tests (finalize sync) | Content: transition permission handling present |
| BLG-E020 | M3 tests (Confluence context) | Content: page not found handling present |
| BLG-E021 | M3 tests (Confluence context) | Content: page permission handling present |
| BLG-E022 | M3 tests (truncation) | Content: 5000 char truncation present |
| BLG-E023 | M3 tests (empty page) | Content: empty page skip handling present |
| BLG-E030 | M2a tests (BACKLOG.md parse) | Content: file-not-found handling present |
| BLG-E031 | M2a tests (section check) | Content: missing Open section handling present |
| BLG-E032 | M2a tests (section check) | Content: missing Completed section handling present |
| BLG-E033 | VR tests (VR-001) | Regex: invalid item lines rejected |
| BLG-E034 | VR tests (VR-002) | Regex: invalid metadata rejected |
| BLG-E035 | VR tests (VR-009) | Content: duplicate number warning present |
| BLG-E036 | M2a tests | Content: item not found handling present |
| BLG-E040 | M2 tests (refresh) | Content: partial refresh failure handling present |
| BLG-E041 | M2c tests (finalize) | Content: finalize sync failure handling present |
| BLG-E042 | M2c tests (finalize) | Content: BACKLOG.md write failure handling present |

---

## 8. Security Considerations

| Risk | Mitigation | Test |
|------|-----------|------|
| Path traversal in BACKLOG.md path | Path hardcoded in instructions, not user-provided | N/A (no code path) |
| Malicious Jira ticket data injection | Content is markdown only, no code execution | Content verification |
| MCP credential exposure | Zero credential surface (ADR-0003) | Verify no credential references in templates |
| Confluence content injection | Truncated to 5000 chars, read-only context | VR-007 test |

---

## 9. Performance Considerations

| Component | Target | Verification |
|-----------|--------|-------------|
| All new tests execution | < 5 seconds | Measured during implementation |
| Content verification tests | < 100ms each | File read + regex matching only |
| Validation rule tests | < 50ms each | In-memory regex testing only |
| No network calls in any test | 0ms network I/O | Tests are fully offline |

---

## 10. Assumptions and Constraints

1. No external test dependencies (jest, mocha, sinon, nock) -- Article V
2. All tests are fully offline -- no MCP, no HTTP, no network calls
3. All tests are deterministic and idempotent
4. Test files follow existing naming: `*.test.cjs` for CJS hook test directory
5. Content verification tests read production files directly (no copies or fixtures needed)
6. Validation rule tests load `validation-rules.json` directly from the docs directory
7. Tests must pass on all 3 OS (macOS, Linux, Windows) in CI matrix
8. The ~85% markdown/prompt composition means most testing is content-level, not behavior-level
