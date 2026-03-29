# Test Strategy: REQ-GH-214 -- PreToolUse Tool Routing

**Phase**: 05 - Test Strategy & Design
**Requirement**: REQ-GH-214
**Status**: Designed
**Date**: 2026-03-29

---

## Existing Infrastructure (from test evaluation)

- **Framework**: `node --test` (Node.js built-in test runner)
- **Assertions**: `node:assert/strict`
- **Coverage Tool**: None configured (no c8/istanbul)
- **Current Coverage**: ~85% overall, ~90% for hooks
- **Existing Patterns**: CJS hook tests in `src/claude/hooks/tests/*.test.cjs`; temp-directory isolation via `os.tmpdir()` + `fs.mkdtempSync`; `spawnSync` for integration-level hook execution; direct `require()` for unit-level function testing
- **Related Tests**: `src/claude/hooks/tests/mcp-tool-router.test.cjs` tests the predecessor hook (`mcp-tool-router.cjs`) with 7 test groups covering routing, enforcement, fail-open, config, MCP detection, exceptions, and integration

## Strategy for This Requirement

- **Approach**: Extend existing test suite -- follow the established CJS hook test pattern exactly
- **Test File**: `src/claude/hooks/tests/tool-router.test.cjs` (new file for the new `tool-router.cjs` hook)
- **New Test Types Needed**: Unit tests (function-level), integration tests (stdin-to-stdout hook execution), fail-open tests (error path verification)
- **Coverage Target**: >=80% unit (Article II standard tier), 100% for critical paths (fail-open logic per Article X, exemption evaluation per FR-006)

## Test Pyramid

| Level | Count | Framework | Location |
|-------|-------|-----------|----------|
| Unit | 42 | `node --test` + `node:assert/strict` | `src/claude/hooks/tests/tool-router.test.cjs` |
| Integration | 12 | `node --test` + `spawnSync` | `src/claude/hooks/tests/tool-router.test.cjs` |
| E2E | 0 | N/A | Not applicable -- hook is invoked by Claude Code runtime, cannot be E2E tested in CI |
| **Total** | **54** | | |

### Unit Test Strategy

Unit tests call exported functions directly via `require()`. The hook module must export its internal functions for testability (consistent with `mcp-tool-router.cjs` which exports `check()` and `clearConfigCache()`).

Functions to test in isolation:
- `loadRoutingRules(configPath, manifestPath)` -- merges four sources
- `inferEnvironmentRules()` -- MCP probing heuristics
- `evaluateRule(rule, toolInput)` -- decision logic
- `checkExemptions(exemptions, toolInput)` -- pattern + context matching
- `probeMcpAvailability(toolName, timeoutMs)` -- filesystem heuristic
- `formatBlockMessage(rule, toolInput)` -- output formatting
- `formatWarnMessage(rule, toolInput, configPath)` -- output formatting
- `appendAuditEntry(entry)` -- JSONL append

### Integration Test Strategy

Integration tests use `spawnSync('node', [HOOK_PATH], { input, cwd, env })` to test the hook end-to-end as Claude Code would invoke it. These validate:
- Stdin parsing and stdout/stderr output format
- Exit code behavior (always 0 per fail-open)
- Config file loading from filesystem
- Audit log file creation and content

### Test Environment

Each test creates an isolated temp directory with:
- `.isdlc/state.json` (minimal)
- `src/claude/hooks/config/tool-routing.json` (framework defaults)
- `docs/isdlc/external-skills-manifest.json` (skill preferences, when testing FR-005)
- `.claude/settings.json` (MCP server configuration, when testing FR-009)

Cleanup via `fs.rmSync(tmpDir, { recursive: true, force: true })` in `afterEach`.

## Flaky Test Mitigation

| Risk | Mitigation |
|------|------------|
| MCP probe timing (500ms timeout) | Unit tests mock filesystem heuristics; integration tests use deterministic config files, not live MCP probes |
| Temp directory cleanup failures | `afterEach` uses `force: true`; tests are independent (no shared state) |
| Audit log file contention | Each test uses its own temp directory with unique audit log path |
| Regex engine differences across Node versions | All test regexes are PCRE-compatible; tested on Node 20/22/24 CI matrix |

## Performance Test Plan

| Concern | Target | Validation |
|---------|--------|------------|
| Hook evaluation latency | <100ms (NFR-002) | Integration test measures `spawnSync` duration, asserts <500ms (accounts for Node startup; actual hook logic is sub-millisecond) |
| MCP probe timeout | <=500ms (ADR-004) | Unit test verifies `probeMcpAvailability` respects timeout parameter |
| Audit log write | Non-blocking (AC-011-03) | Integration test verifies hook exits cleanly even when audit path is unwritable |

## Test Commands (use existing)

```bash
# Run tool-router tests only
node --test src/claude/hooks/tests/tool-router.test.cjs

# Run all hook tests (includes tool-router)
npm run test:hooks

# Run full suite (regression check)
npm run test:all
```

---

## Task-to-Test Traceability

| Task | File Under Test | Test File | Traces | Scenarios |
|------|----------------|-----------|--------|-----------|
| T0001 | `src/claude/hooks/tool-router.cjs` | `src/claude/hooks/tests/tool-router.test.cjs` | FR-001, FR-008 | Unit tests for each function; integration tests for end-to-end hook flow; fail-open behavior |
| T0002 | `src/claude/hooks/tool-router.cjs` (`checkExemptions`, `evaluateRule`) | `src/claude/hooks/tests/tool-router.test.cjs` | FR-006, AC-006-01, AC-006-02, AC-006-03 | Pattern regex matching, context condition evaluation (edit_prep, targeted_read, targeted_file, exact_filename), exemption precedence (first-match-wins), invalid regex handling |
| T0003 | `src/claude/hooks/tool-router.cjs` (`loadRoutingRules`) | `src/claude/hooks/tests/tool-router.test.cjs` | FR-003, AC-003-01, AC-003-02 | Priority ordering (user > skill > inferred > framework), conflict resolution by operation+intercept_tool, missing source files, empty sources |

---

## Test Case Summary by Functional Requirement

### FR-001: Tool Routing Hook (9 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-001 | main() reads stdin, matches rule, returns block decision | positive | P0 | AC-001-01 |
| UT-002 | main() reads stdin, matches warn rule, returns warn decision | positive | P0 | AC-001-02 |
| UT-003 | main() with no matching rules exits silently (exit 0, no output) | positive | P0 | AC-001-03 |
| UT-004 | main() with unrecognized tool_name exits silently | positive | P1 | AC-001-03 |
| IT-001 | End-to-end: Grep stdin produces block stdout with preferred tool | positive | P0 | AC-001-01 |
| IT-002 | End-to-end: Glob stdin produces warn on stderr | positive | P0 | AC-001-02 |
| IT-003 | End-to-end: unmatched tool produces no output, exit 0 | positive | P0 | AC-001-03 |
| UT-005 | formatBlockMessage includes preferred tool name and guidance | positive | P1 | AC-001-01 |
| UT-006 | formatBlockMessage includes 'continue: false' in JSON output | positive | P0 | AC-001-01 |

### FR-002: Config-Driven Routing Rules (5 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-007 | loadRoutingRules reads valid tool-routing.json and returns Rule[] | positive | P0 | AC-002-01 |
| UT-008 | loadRoutingRules with additional user rule includes it in evaluation | positive | P1 | AC-002-02 |
| UT-009 | Config with all three framework default rules (search-semantic, find-files, file-summary) | positive | P0 | AC-002-01 |
| UT-010 | Config schema: rule missing required field (intercept_tool) is skipped with warning | negative | P1 | -- |
| UT-011 | Config schema: empty rules array results in no routing (all tools pass) | negative | P2 | -- |

### FR-003: Three-Source Rule Resolution (8 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-012 | User override wins over framework default for same operation+intercept_tool | positive | P0 | AC-003-01 |
| UT-013 | Skill-declared rule wins over inferred rule for same operation+intercept_tool | positive | P0 | AC-003-02 |
| UT-014 | Inferred rule wins over framework default | positive | P1 | AC-003-02 |
| UT-015 | Full merge: user > skill > inferred > framework priority ordering | positive | P0 | AC-003-01 |
| UT-016 | Non-conflicting rules from different sources are all included | positive | P1 | -- |
| UT-017 | Missing skill manifest: merge proceeds with framework + inferred + user only | negative | P1 | -- |
| UT-018 | Missing user_overrides section: merge proceeds with framework + inferred + skill only | negative | P1 | -- |
| UT-019 | All sources empty: returns empty rule set (no routing) | negative | P2 | -- |

### FR-004: Environment Inference (4 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-020 | inferEnvironmentRules detects code-index-mcp and generates search/find/summary rules at warn | positive | P0 | AC-004-01 |
| UT-021 | inferEnvironmentRules with no MCP servers returns empty array | positive | P0 | AC-004-02 |
| UT-022 | inferEnvironmentRules generates rules only for available MCP servers | positive | P1 | AC-004-01 |
| UT-023 | Inferred rules always have enforcement: 'warn' | positive | P1 | AC-004-01 |

### FR-005: Skill-Declared Tool Preferences (3 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-024 | Skill with tool_preferences in manifest generates routing rules at block level | positive | P0 | AC-005-01 |
| UT-025 | Skill manifest without tool_preferences field is ignored (no skill rules) | negative | P1 | -- |
| UT-026 | Multiple skills with tool_preferences are all included | positive | P1 | AC-005-01 |

### FR-006: Exemption Mechanism (10 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-027 | Pattern exemption: Grep with specific file path (path has extension, no wildcards) is exempted | positive | P0 | AC-006-01 |
| UT-028 | Pattern exemption: Grep with directory path (no extension) is NOT exempted | negative | P0 | AC-006-01 |
| UT-029 | Context exemption: Read with limit<=200 matches edit_prep condition | positive | P0 | AC-006-02 |
| UT-030 | Context exemption: Read with offset present matches targeted_read condition | positive | P0 | AC-006-02 |
| UT-031 | No exemptions match: Read with no limit, no offset is routed | negative | P0 | AC-006-03 |
| UT-032 | Context exemption: Glob with exact filename (no wildcards in basename) is exempted | positive | P1 | -- |
| UT-033 | Context exemption: Glob with wildcard pattern is NOT exempted | negative | P1 | -- |
| UT-034 | First-match-wins: first matching exemption is returned, subsequent not evaluated | positive | P1 | -- |
| UT-035 | Invalid regex in pattern exemption: logged to stderr, exemption skipped | negative | P1 | -- |
| UT-036 | Read with limit=201 does NOT match edit_prep (boundary value) | negative | P0 | AC-006-02 |

### FR-007: Self-Documenting Warnings (3 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-037 | formatWarnMessage includes preferred tool name | positive | P0 | AC-007-01 |
| UT-038 | formatWarnMessage includes rule source (inferred/default/skill/user) | positive | P0 | AC-007-01 |
| UT-039 | formatWarnMessage includes path to tool-routing.json for promotion | positive | P1 | AC-007-01 |

### FR-008: Fail-Open Behavior (6 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-040 | Config file missing: exit 0, no output | positive | P0 | AC-008-01 |
| UT-041 | Malformed JSON in config: stderr warning, exit 0 | negative | P0 | AC-008-03 |
| UT-042 | Malformed stdin (not JSON): exit 0, no output | negative | P0 | -- |
| UT-043 | Preferred MCP tool unavailable: rule skipped, original tool allowed | positive | P0 | AC-008-02 |
| IT-004 | End-to-end: hook with missing config exits 0, empty stdout | positive | P0 | AC-008-01 |
| IT-005 | End-to-end: hook with malformed config exits 0, warning on stderr | negative | P0 | AC-008-03 |

### FR-009: MCP Availability Detection (4 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-044 | probeMcpAvailability returns true when MCP server config exists | positive | P0 | AC-009-01 |
| UT-045 | probeMcpAvailability returns false when MCP server config missing | negative | P0 | AC-009-01 |
| UT-046 | Rule with unavailable MCP tool is skipped silently | positive | P0 | AC-009-01 |
| UT-047 | probeMcpAvailability respects timeout parameter (500ms) | positive | P1 | AC-009-02 |

### FR-010: Constitutional Article (1 test)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| IT-006 | Article XV text exists in constitution.md after implementation | positive | P1 | AC-010-01 |

### FR-011: Tool Routing Audit Log (6 tests)

| ID | Test Case | Type | Priority | AC |
|----|-----------|------|----------|-----|
| UT-048 | appendAuditEntry appends valid JSONL line with all required fields | positive | P0 | AC-011-01 |
| UT-049 | appendAuditEntry creates audit log file if it does not exist | positive | P0 | AC-011-02 |
| UT-050 | appendAuditEntry with unwritable path: logs warning, does not throw | negative | P0 | AC-011-03 |
| IT-007 | End-to-end: hook invocation appends audit entry to .isdlc/tool-routing-audit.jsonl | positive | P0 | AC-011-01 |
| IT-008 | Audit entry contains: ts, tool, preferred, enforcement, decision, exemption, rule_id, rule_source | positive | P1 | AC-011-01 |
| UT-051 | appendAuditEntry writes one line per call (no trailing newline duplication) | positive | P2 | AC-011-01 |

### NFR Tests (3 tests)

| ID | Test Case | Type | Priority | Traces |
|----|-----------|------|----------|--------|
| IT-009 | Hook is stateless: two sequential invocations with different configs produce independent results | positive | P1 | NFR-001 |
| IT-010 | Hook execution completes within 500ms (Node startup + evaluation) | positive | P1 | NFR-002 |
| IT-011 | Any uncaught exception in hook results in exit 0 | negative | P0 | NFR-003 |

### Integration (end-to-end hook) Tests Summary (12 tests)

| ID | Test Case | Type | Priority |
|----|-----------|------|----------|
| IT-001 | Grep block: stdin -> stdout with preferred tool | positive | P0 |
| IT-002 | Glob warn: stdin -> stderr warning | positive | P0 |
| IT-003 | Unmatched tool: no output, exit 0 | positive | P0 |
| IT-004 | Missing config: exit 0, empty stdout | positive | P0 |
| IT-005 | Malformed config: exit 0, stderr warning | negative | P0 |
| IT-006 | Article XV in constitution.md | positive | P1 |
| IT-007 | Audit log appended on invocation | positive | P0 |
| IT-008 | Audit entry field validation | positive | P1 |
| IT-009 | Stateless: independent invocations | positive | P1 |
| IT-010 | Performance: <500ms execution | positive | P1 |
| IT-011 | Uncaught exception: exit 0 | negative | P0 |
| IT-012 | Read with edit_prep exemption: no routing | positive | P0 |

---

## Test Data Plan

### Boundary Values

| Field | Boundary | Test Value | Expected |
|-------|----------|------------|----------|
| Read.limit | edit_prep threshold (<=200) | 200 | Exempted |
| Read.limit | edit_prep threshold exceeded | 201 | Routed |
| Read.limit | zero | 0 | Routed (0 is not a valid edit prep) |
| Read.limit | absent | undefined | Routed (full file read) |
| Read.offset | present (any value) | 1 | Exempted (targeted_read) |
| Read.offset | zero | 0 | Exempted (0 is still an offset) |
| Grep.path | file with extension | `/src/app.js` | Exempted (targeted_file) |
| Grep.path | directory | `/src/` | Routed |
| Grep.path | wildcard | `/src/*.js` | Routed |
| Glob.pattern | exact filename | `package.json` | Exempted (exact_filename) |
| Glob.pattern | wildcard basename | `*.ts` | Routed |
| MCP probe timeout | at limit | 500ms | Treated as unavailable |
| Config rules | empty array | `[]` | All tools pass through |

### Invalid Inputs

| Input | Test Value | Expected |
|-------|------------|----------|
| Stdin | Empty string | exit 0, no output |
| Stdin | Invalid JSON | exit 0, no output |
| Stdin | JSON without tool_name | exit 0, no output |
| Stdin | JSON with null tool_input | exit 0, no output |
| Config | Missing file | exit 0, no output |
| Config | Empty file | stderr warning, exit 0 |
| Config | Valid JSON but missing rules key | stderr warning, exit 0 |
| Config | Rules with invalid regex in exemption | stderr warning, exemption skipped |
| Skill manifest | Missing file | Skill rules skipped |
| Skill manifest | Empty tool_preferences | No skill rules generated |
| Audit log path | Read-only directory | Warning on stderr, routing continues |

### Maximum-Size Inputs

| Input | Test Value | Expected |
|-------|------------|----------|
| Config rules array | 100 rules | All rules evaluated, performance <100ms |
| Stdin tool_input | Large object (10KB) | Parsed correctly, no truncation |
| Exemption regex | Long pattern (500 chars) | Evaluated correctly |
| Audit log | Existing file with 10,000 lines | New entry appended (not full rewrite) |

---

## Traceability Matrix

| Requirement | AC | Test Cases | Test Type | Priority |
|-------------|-----|------------|-----------|----------|
| FR-001 | AC-001-01 | UT-001, UT-005, UT-006, IT-001 | positive | P0 |
| FR-001 | AC-001-02 | UT-002, IT-002 | positive | P0 |
| FR-001 | AC-001-03 | UT-003, UT-004, IT-003 | positive | P0 |
| FR-002 | AC-002-01 | UT-007, UT-009 | positive | P0 |
| FR-002 | AC-002-02 | UT-008 | positive | P1 |
| FR-002 | -- | UT-010, UT-011 | negative | P1-P2 |
| FR-003 | AC-003-01 | UT-012, UT-015 | positive | P0 |
| FR-003 | AC-003-02 | UT-013, UT-014 | positive | P0 |
| FR-003 | -- | UT-016, UT-017, UT-018, UT-019 | mixed | P1-P2 |
| FR-004 | AC-004-01 | UT-020, UT-022, UT-023 | positive | P0-P1 |
| FR-004 | AC-004-02 | UT-021 | positive | P0 |
| FR-005 | AC-005-01 | UT-024, UT-026 | positive | P0-P1 |
| FR-005 | -- | UT-025 | negative | P1 |
| FR-006 | AC-006-01 | UT-027, UT-028 | mixed | P0 |
| FR-006 | AC-006-02 | UT-029, UT-030, UT-036 | mixed | P0 |
| FR-006 | AC-006-03 | UT-031 | negative | P0 |
| FR-006 | -- | UT-032, UT-033, UT-034, UT-035 | mixed | P1 |
| FR-007 | AC-007-01 | UT-037, UT-038, UT-039 | positive | P0-P1 |
| FR-008 | AC-008-01 | UT-040, IT-004 | positive | P0 |
| FR-008 | AC-008-02 | UT-043 | positive | P0 |
| FR-008 | AC-008-03 | UT-041, IT-005 | negative | P0 |
| FR-008 | -- | UT-042 | negative | P0 |
| FR-009 | AC-009-01 | UT-044, UT-045, UT-046 | mixed | P0 |
| FR-009 | AC-009-02 | UT-047 | positive | P1 |
| FR-010 | AC-010-01 | IT-006 | positive | P1 |
| FR-011 | AC-011-01 | UT-048, IT-007, IT-008, UT-051 | positive | P0-P2 |
| FR-011 | AC-011-02 | UT-049 | positive | P0 |
| FR-011 | AC-011-03 | UT-050 | negative | P0 |
| NFR-001 | -- | IT-009 | positive | P1 |
| NFR-002 | -- | IT-010 | positive | P1 |
| NFR-003 | -- | IT-011 | negative | P0 |

### Coverage Summary

- **Total FRs**: 11 (FR-001 through FR-011)
- **Total NFRs**: 3 (NFR-001 through NFR-003)
- **Total ACs**: 24
- **ACs with at least one test**: 24/24 (100%)
- **Total test cases**: 54 (42 unit + 12 integration)
- **Positive tests**: 38 (70%)
- **Negative tests**: 16 (30%)

---

## Constitutional Compliance

| Article | Requirement | How This Strategy Satisfies It |
|---------|-------------|-------------------------------|
| Article II (Test-First Development) | Tests designed before implementation | This strategy document precedes Phase 06 implementation. Test case IDs, scenarios, and acceptance criteria are defined here for the developer to implement TDD-style. |
| Article VII (Artifact Traceability) | 100% requirement-to-test coverage | Traceability matrix above maps every FR and AC to at least one test case. No orphan requirements. |
| Article IX (Quality Gate Integrity) | All GATE-04 artifacts complete | test-strategy.md (this file), test-cases (embedded above), traceability matrix (embedded above), test data plan (embedded above) all present. |
| Article X (Fail-Safe Defaults) | Hooks fail-open | 6 dedicated fail-open tests (FR-008) plus IT-011 for uncaught exceptions. |
| Article XI (Integration Testing Integrity) | Integration tests validate real behavior | 12 integration tests use `spawnSync` to execute the actual hook binary, not mocks. Config files are real JSON on filesystem. |
| Article XIII (Module System Consistency) | CJS hook, CJS tests | Test file uses `.test.cjs` extension, `require('node:test')`, CommonJS throughout. |

---

## GATE-04 Validation Checklist

- [x] Test strategy covers unit, integration, E2E (E2E: N/A -- hook invoked by runtime), security (input validation via fail-open tests), performance (NFR-002 test)
- [x] Test cases exist for all requirements (24/24 ACs covered)
- [x] Traceability matrix complete (100% requirement coverage)
- [x] Coverage targets defined (>=80% unit, 100% critical paths)
- [x] Test data strategy documented (boundary values, invalid inputs, maximum-size inputs)
- [x] Critical paths identified (fail-open: FR-008, exemption evaluation: FR-006, rule merge: FR-003)
