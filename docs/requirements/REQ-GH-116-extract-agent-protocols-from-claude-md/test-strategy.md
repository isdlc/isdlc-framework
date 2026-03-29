# Test Strategy: REQ-GH-116 -- Protocol Delivery and Compliance

**Phase**: 05 - Test Strategy & Design
**Requirement**: REQ-GH-116
**Status**: Designed
**Date**: 2026-03-29

---

## Existing Infrastructure (from test evaluation)

- **Framework**: `node --test` (Node.js built-in test runner)
- **Assertions**: `node:assert/strict`
- **Coverage Tool**: None configured (no c8/istanbul)
- **Current Coverage**: ~85% overall, ~90% for hooks
- **Existing Patterns**: CJS hook tests in `src/claude/hooks/tests/*.test.cjs`; temp-directory isolation via `os.tmpdir()` + `fs.mkdtempSync`; `spawnSync`/`execSync` for integration-level hook execution; direct `require()` for unit-level function testing
- **Related Tests**: `src/claude/hooks/tests/skill-injection.test.cjs` (same STEP 3d injection pattern), `src/claude/hooks/tests/phase-loop-controller.test.cjs` (phase-loop state and delegation logic)

## Strategy for This Requirement

- **Approach**: Extend existing test suite -- follow the established CJS hook test pattern exactly
- **Test Files**: Two new files aligned with the two distinct modules:
  - `src/claude/hooks/tests/protocol-injection.test.cjs` -- protocol extraction, user content extraction, phase filtering
  - `src/claude/hooks/tests/protocol-compliance.test.cjs` -- compliance detection, violation response
- **New Test Types Needed**: Unit tests (function-level), integration tests (stdin-to-stdout execution), fail-open tests (error path verification)
- **Coverage Target**: >=80% unit (Article II standard tier), 100% for critical paths (fail-open logic per Article X, protocol extraction correctness per FR-002)

## Test Pyramid

| Level | Count | Framework | Location |
|-------|-------|-----------|----------|
| Unit | 36 | `node --test` + `node:assert/strict` | `src/claude/hooks/tests/protocol-injection.test.cjs`, `src/claude/hooks/tests/protocol-compliance.test.cjs` |
| Integration | 10 | `node --test` + `execSync` | Same files, integration `describe` blocks |
| E2E | 0 | N/A | Not applicable -- injection is inline in orchestrator markdown, not a standalone hook binary |
| **Total** | **46** | | |

### Unit Test Strategy

Unit tests call exported functions directly via `require()`. The implementation modules must export internal functions for testability (consistent with existing hooks like `skill-injection.cjs` which exports helpers).

Functions to test in `protocol-injection.test.cjs`:
- `loadProtocolMapping(configPath)` -- reads and validates protocol-mapping.json
- `extractProtocolSections(sourceContent, protocolRange, mappedHeaders)` -- header-to-next-header extraction
- `filterProtocolsForPhase(protocols, phaseKey)` -- phase matching including `"all"` wildcard
- `extractUserContent(sourceContent, sectionMarkers, protocolRange)` -- exclusion-based extraction
- `resolveSourceFile(mappingConfig, provider)` -- Claude vs Codex source file resolution
- `buildProtocolBlock(sections)` -- joins sections into `PROTOCOLS:` formatted block
- `buildUserInstructionsBlock(content)` -- joins user content into `USER INSTRUCTIONS:` block

Functions to test in `protocol-compliance.test.cjs`:
- `checkProtocolCompliance(phaseKey, timing, mappingConfig)` -- filters checkable protocols, runs signals
- `checkGitCommitDetected(timing)` -- git log within timing window
- `buildRemediationPrompt(violations, retryNumber)` -- formats violation list for re-delegation
- `shouldEscalate(retryCount, maxRetries)` -- escalation threshold check

### Integration Test Strategy

Integration tests create temp directories with realistic file structures (CLAUDE.md with framework sections + user content, protocol-mapping.json, git repos with commits) and validate end-to-end behavior:
- Protocol extraction produces correct `PROTOCOLS:` block for a given phase
- User content extraction produces correct `USER INSTRUCTIONS:` block
- Missing CLAUDE.md results in empty blocks (fail-open)
- Git commit detection finds commits within timing window
- Git commit detection ignores commits outside timing window

### Test Environment

Each test creates an isolated temp directory with:
- `CLAUDE.md` (realistic content with `<!-- SECTION: -->` markers, protocol sections, user content)
- `.isdlc/state.json` (minimal workflow state)
- `src/claude/hooks/config/protocol-mapping.json` (test mapping config)
- Git repository (for compliance detection tests only)

Cleanup via `fs.rmSync(tmpDir, { recursive: true, force: true })` in `afterEach`.

## Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| Git log timing edge cases | Tests use explicit `--after` and `--before` timestamps with 1-second buffer; commits created with fixed dates via `GIT_COMMITTER_DATE` |
| Temp directory cleanup failures | `afterEach` uses `force: true`; tests are independent (no shared state) |
| Markdown parsing sensitivity | Test fixtures use exact CLAUDE.md header format (`### Protocol Name`); no regex-based parsing -- string matching only |
| Platform line ending differences | Tests normalize `\r\n` to `\n` before comparison |

## Performance Test Plan

| Concern | Target | Validation |
|---------|--------|------------|
| Protocol extraction latency | <50ms for typical CLAUDE.md (~4KB) | Unit test measures extraction time, asserts <100ms (2x buffer) |
| Token budget compliance | <=800 tokens per injection (NFR-002) | Unit test counts approximate tokens (words / 0.75) on extracted output, asserts <=800 |
| Git log check latency | <200ms | Integration test measures `checkGitCommitDetected` duration |

## Test Commands (use existing)

```bash
# Run protocol injection tests only
node --test src/claude/hooks/tests/protocol-injection.test.cjs

# Run protocol compliance tests only
node --test src/claude/hooks/tests/protocol-compliance.test.cjs

# Run all hook tests (includes new tests)
npm run test:hooks

# Run full suite (regression check)
npm run test:all
```

---

## Task-to-Test Traceability

| Task | File Under Test | Test File | Traces | Scenarios |
|------|----------------|-----------|--------|-----------|
| T0005 | `src/claude/hooks/config/protocol-mapping.json` | `protocol-injection.test.cjs` | FR-001, AC-001-01, AC-001-02 | Config schema validation, phase arrays, `"all"` wildcard, checkable flags |
| T0006 | `src/claude/commands/isdlc.md` (STEP 3d injection) | `protocol-injection.test.cjs` | FR-002, FR-004, FR-005, AC-002-01, AC-004-01, AC-004-02, AC-005-01 | Header extraction, multi-section, phase filtering, Claude vs Codex source, selective loading |
| T0007 | `src/claude/commands/isdlc.md` (user extraction) | `protocol-injection.test.cjs` | FR-003, AC-003-01 | SECTION marker exclusion, protocol range exclusion, empty user content |
| T0008 | `src/claude/commands/isdlc.md` (compliance check) | `protocol-compliance.test.cjs` | FR-006, AC-006-01, AC-006-02 | Checkable protocol filtering, signal dispatch, violation array |
| T0009 | `src/claude/commands/isdlc.md` (git signal) | `protocol-compliance.test.cjs` | FR-006, AC-006-01 | Git log timing window, commit detection, empty output |
| T0010 | `src/claude/commands/isdlc.md` (violation handler) | `protocol-compliance.test.cjs` | FR-007, AC-007-01, AC-007-02 | Remediation prompt, retry counter, escalation |

---

## Test Case Summary by Functional Requirement

### FR-001: Protocol-Phase Mapping Config (5 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-001 | loadProtocolMapping reads valid config and returns parsed object with protocols array | positive | P0 | AC-001-01 |
| UT-002 | filterProtocolsForPhase returns all protocols when entry has `"phases": ["all"]` | positive | P0 | AC-001-01 |
| UT-003 | filterProtocolsForPhase returns only phase-specific protocols when entry has `"phases": ["06-implementation"]` | positive | P0 | AC-001-02 |
| UT-004 | filterProtocolsForPhase with phase not matching any entry returns empty array | negative | P1 | AC-001-02 |
| UT-005 | loadProtocolMapping with config containing checkable flags preserves boolean values | positive | P1 | AC-001-01 |

### FR-002: Subagent Protocol Injection (8 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-006 | extractProtocolSections extracts single header section from CLAUDE.md content | positive | P0 | AC-002-01 |
| UT-007 | extractProtocolSections extracts multiple sections for a phase with 3 mapped protocols | positive | P0 | AC-002-01 |
| UT-008 | extractProtocolSections extracts text from header to next `###` header (not beyond) | positive | P0 | AC-002-01 |
| UT-009 | extractProtocolSections with header not found in source returns empty for that section | negative | P1 | AC-002-01 |
| UT-010 | buildProtocolBlock joins extracted sections with `PROTOCOLS:` header | positive | P0 | AC-002-01 |
| UT-011 | resolveSourceFile returns empty string when CLAUDE.md is missing (fail-open) | positive | P0 | AC-002-02 |
| IT-001 | End-to-end: given realistic CLAUDE.md and Phase 06 mapping, extracted PROTOCOLS block contains only phase-relevant sections | positive | P0 | AC-002-01 |
| IT-002 | End-to-end: given missing CLAUDE.md, extraction returns empty PROTOCOLS block (no crash) | positive | P0 | AC-002-02 |

### FR-003: User Instruction Forwarding (5 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-012 | extractUserContent excludes content inside `<!-- SECTION: -->` markers | positive | P0 | AC-003-01 |
| UT-013 | extractUserContent excludes content inside protocol range (between protocol_section_start and protocol_section_end) | positive | P0 | AC-003-01 |
| UT-014 | extractUserContent returns remaining user-written content | positive | P0 | AC-003-01 |
| UT-015 | extractUserContent with CLAUDE.md containing only framework content returns empty string | negative | P1 | AC-003-01 |
| IT-003 | End-to-end: given CLAUDE.md with user section above and below framework blocks, USER INSTRUCTIONS block contains both user sections | positive | P0 | AC-003-01 |

### FR-004: Dual-Provider Support (3 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-016 | resolveSourceFile with provider "claude" returns path to CLAUDE.md | positive | P0 | AC-004-01 |
| UT-017 | resolveSourceFile with provider "codex" returns path to AGENTS.md | positive | P0 | AC-004-02 |
| UT-018 | resolveSourceFile with unknown provider falls back to CLAUDE.md | negative | P1 | AC-004-01 |

### FR-005: Selective Loading (3 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-019 | Given 9 total protocols and 3 mapped to Phase 06, filterProtocolsForPhase returns exactly 3 | positive | P0 | AC-005-01 |
| UT-020 | Token count of extracted Phase 06 sections is <=800 tokens (NFR-002 compliance) | positive | P0 | AC-005-01 |
| IT-004 | End-to-end: Phase 05 injection includes Mandatory Iteration Enforcement but Phase 03 does not | positive | P0 | AC-005-01 |

### FR-006: Protocol Compliance Detection (7 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-021 | checkProtocolCompliance filters only `checkable: true` protocols for current phase | positive | P0 | AC-006-01 |
| UT-022 | checkGitCommitDetected returns violation when git log shows commit within timing window | positive | P0 | AC-006-01 |
| UT-023 | checkGitCommitDetected returns no violation when git log is empty within timing window | positive | P0 | AC-006-01 |
| UT-024 | checkGitCommitDetected ignores commits outside the timing window | positive | P0 | AC-006-01 |
| UT-025 | checkProtocolCompliance logs violation to audit trail | positive | P0 | AC-006-02 |
| IT-005 | End-to-end: git repo with commit during phase window, compliance check returns violation with evidence | positive | P0 | AC-006-01 |
| IT-006 | End-to-end: git log command failure results in skipped check (fail-open), no crash | negative | P0 | AC-006-02 |

### FR-007: Violation Response (5 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-026 | buildRemediationPrompt includes protocol header and evidence for each violation | positive | P0 | AC-007-01 |
| UT-027 | buildRemediationPrompt includes retry number in prompt ("Retry 1 of 2") | positive | P0 | AC-007-01 |
| UT-028 | shouldEscalate returns false when retryCount < maxRetries (2) | positive | P0 | AC-007-02 |
| UT-029 | shouldEscalate returns true when retryCount >= maxRetries (2) | positive | P0 | AC-007-02 |
| IT-007 | End-to-end: after 2 failed remediation retries, escalation menu includes Skip/Retry/Cancel options | positive | P0 | AC-007-02 |

### NFR Tests (5 tests)

| ID | Test Case | Type | Priority | Traces |
|----|-----------|------|----------|--------|
| UT-030 | Missing protocol-mapping.json: loadProtocolMapping returns empty config (fail-open) | negative | P0 | NFR-001 |
| UT-031 | Malformed JSON in protocol-mapping.json: loadProtocolMapping returns empty config with warning | negative | P0 | NFR-001 |
| UT-032 | Malformed CLAUDE.md (no headers): extractProtocolSections returns empty array | negative | P0 | NFR-001 |
| UT-033 | extractProtocolSections output for 3 phase-relevant sections is <=800 tokens | positive | P1 | NFR-002 |
| UT-034 | Extracted protocol content is verbatim (no rewording) -- exact substring match against source | positive | P0 | NFR-003 |

### Integration Tests Summary (10 tests)

| ID | Test Case | Type | Priority |
|----|-----------|------|----------|
| IT-001 | Phase 06 PROTOCOLS block contains only phase-relevant sections | positive | P0 |
| IT-002 | Missing CLAUDE.md: empty PROTOCOLS block, no crash | positive | P0 |
| IT-003 | USER INSTRUCTIONS block contains user-written content from above and below framework blocks | positive | P0 |
| IT-004 | Phase 05 vs Phase 03 selective loading difference | positive | P0 |
| IT-005 | Git commit within phase window detected as violation | positive | P0 |
| IT-006 | Git log failure: fail-open, no crash | negative | P0 |
| IT-007 | Escalation after 2 failed retries includes menu options | positive | P0 |
| IT-008 | AGENTS.md extraction for Codex provider produces same structure as CLAUDE.md extraction | positive | P1 |
| IT-009 | Protocol extraction with realistic CLAUDE.md (~4KB) completes in <100ms | positive | P1 |
| IT-010 | Dogfooding parity: src/ and .claude/ protocol-mapping.json produce identical extraction results | positive | P1 |

---

## Test Data Plan

### Boundary Values

| Field | Boundary | Test Value | Expected |
|-------|----------|------------|----------|
| protocols array | Empty array `[]` | `{ "protocols": [] }` | No protocols injected, no error |
| protocols array | Single entry with `"phases": ["all"]` | 1 protocol mapped to all | Injected for every phase |
| phases array | Single phase | `["06-implementation"]` | Only injected for Phase 06 |
| phases array | Multiple phases | `["05-test-strategy", "06-implementation"]` | Injected for both phases |
| protocol_section_start | First line of CLAUDE.md | Header at line 1 | Entire file treated as protocol section |
| protocol_section_end | Last line of CLAUDE.md | Header at end | Protocol section extends to EOF |
| protocol_section_end | Not found in CLAUDE.md | Missing end marker | Protocol section extends to EOF (defensive) |
| timing window | 0 seconds (started_at == completed_at) | Same timestamp | No commits possible, clean result |
| timing window | Very wide (1 hour) | 1-hour span | All commits in range detected |
| retry count | 0 (first attempt) | retryCount = 0 | Not escalated |
| retry count | 1 (second attempt) | retryCount = 1 | Not escalated |
| retry count | 2 (threshold) | retryCount = 2 | Escalated to user |

### Invalid Inputs

| Input | Test Value | Expected |
|-------|------------|----------|
| protocol-mapping.json | Missing file | Empty config returned (fail-open) |
| protocol-mapping.json | Empty file | Warning logged, empty config returned |
| protocol-mapping.json | Valid JSON but missing `protocols` key | Warning logged, empty protocols array used |
| protocol-mapping.json | Protocols entry missing `header` field | Entry skipped, remaining entries processed |
| CLAUDE.md | Missing file | Empty PROTOCOLS block, empty USER INSTRUCTIONS block |
| CLAUDE.md | Empty file | Empty blocks, no error |
| CLAUDE.md | No `###` headers | No sections extracted, empty PROTOCOLS block |
| CLAUDE.md | Headers present but no protocol_section_start marker | Protocol range treated as empty, all content treated as user content |
| AGENTS.md | Missing file (Codex) | Empty blocks (fail-open), same as CLAUDE.md missing |
| Git log command | Non-git directory | Check skipped (fail-open), warning logged |
| Git log command | Git binary not found | Check skipped (fail-open), warning logged |
| Timing object | Missing started_at | Check skipped (fail-open) |
| Timing object | Missing completed_at | Check skipped (fail-open) |

### Maximum-Size Inputs

| Input | Test Value | Expected |
|-------|------------|----------|
| CLAUDE.md | 10KB file with 20 protocol sections | Extraction completes <100ms, correct sections returned |
| protocol-mapping.json | 50 protocol entries | Filtering completes correctly, only phase-matched returned |
| Extracted protocol content | All 9 protocols mapped to single phase | Token count verified <=800 (NFR-002) |
| User content | 5KB of user instructions | Extracted verbatim, no truncation |
| Git log output | 100 commits in timing window | All detected, single violation returned (not per-commit) |

---

## Traceability Matrix

| Requirement | AC | Test Cases | Test Type | Priority |
|-------------|-----|------------|-----------|----------|
| FR-001 | AC-001-01 | UT-001, UT-002, UT-005 | positive | P0-P1 |
| FR-001 | AC-001-02 | UT-003, UT-004 | mixed | P0-P1 |
| FR-002 | AC-002-01 | UT-006, UT-007, UT-008, UT-009, UT-010, IT-001 | mixed | P0-P1 |
| FR-002 | AC-002-02 | UT-011, IT-002 | positive | P0 |
| FR-003 | AC-003-01 | UT-012, UT-013, UT-014, UT-015, IT-003 | mixed | P0-P1 |
| FR-004 | AC-004-01 | UT-016, UT-018 | mixed | P0-P1 |
| FR-004 | AC-004-02 | UT-017 | positive | P0 |
| FR-005 | AC-005-01 | UT-019, UT-020, IT-004 | positive | P0 |
| FR-006 | AC-006-01 | UT-021, UT-022, UT-023, UT-024, IT-005 | mixed | P0 |
| FR-006 | AC-006-02 | UT-025, IT-006 | mixed | P0 |
| FR-007 | AC-007-01 | UT-026, UT-027 | positive | P0 |
| FR-007 | AC-007-02 | UT-028, UT-029, IT-007 | positive | P0 |
| NFR-001 | -- | UT-030, UT-031, UT-032, IT-006 | negative | P0 |
| NFR-002 | -- | UT-020, UT-033, IT-009 | positive | P0-P1 |
| NFR-003 | -- | UT-034 | positive | P0 |

### Coverage Summary

- **Total FRs**: 7 (FR-001 through FR-007)
- **Total NFRs**: 3 (NFR-001 through NFR-003)
- **Total ACs**: 14 (AC-001-01 through AC-007-02)
- **ACs with at least one test**: 14/14 (100%)
- **Total test cases**: 46 (36 unit + 10 integration)
- **Positive tests**: 32 (70%)
- **Negative tests**: 14 (30%)

---

## Constitutional Compliance

| Article | Requirement | How This Strategy Satisfies It |
|---------|-------------|-------------------------------|
| Article II (Test-First Development) | Tests designed before implementation | This strategy document precedes Phase 06 implementation. Test case IDs, scenarios, and acceptance criteria are defined here for the developer to implement TDD-style. |
| Article VII (Artifact Traceability) | 100% requirement-to-test coverage | Traceability matrix above maps every FR (7/7) and AC (14/14) to at least one test case. No orphan requirements. |
| Article IX (Quality Gate Integrity) | All GATE-04 artifacts complete | test-strategy.md (this file) includes test cases, traceability matrix, and test data plan -- all required artifacts present. |
| Article X (Fail-Safe Defaults) | Fail-open behavior | 4 dedicated fail-open tests (UT-030, UT-031, UT-032, IT-006) verify that missing/malformed config and source files do not crash the system. |
| Article XI (Integration Testing Integrity) | Integration tests validate real behavior | 10 integration tests use real filesystem structures (temp directories with actual CLAUDE.md files, git repos with real commits), not mocks. |
| Article XIII (Module System Consistency) | CJS hooks, CJS tests | Both test files use `.test.cjs` extension, `require('node:test')`, CommonJS throughout -- matching the established hook test convention. |

---

## GATE-04 Validation Checklist

- [x] Test strategy covers unit, integration, E2E (E2E: N/A -- injection is inline in orchestrator markdown), security (input validation via fail-open tests), performance (NFR-002 token budget + latency tests)
- [x] Test cases exist for all requirements (14/14 ACs covered)
- [x] Traceability matrix complete (100% requirement coverage)
- [x] Coverage targets defined (>=80% unit, 100% critical paths)
- [x] Test data strategy documented (boundary values, invalid inputs, maximum-size inputs)
- [x] Critical paths identified (fail-open: NFR-001, protocol extraction: FR-002, compliance detection: FR-006, violation escalation: FR-007)
