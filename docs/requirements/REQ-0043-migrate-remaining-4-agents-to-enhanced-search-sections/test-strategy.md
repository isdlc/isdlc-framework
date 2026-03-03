# Test Strategy: Migrate Remaining 4 Agents to Enhanced Search Sections

**Status**: Final
**Requirement**: REQ-0043
**Phase**: 05 - Test Strategy & Design
**Last Updated**: 2026-03-03
**Constitutional Articles**: II (Test-First), VII (Artifact Traceability), IX (Quality Gate Integrity), XI (Integration Testing Integrity)

---

## Existing Infrastructure (from test evaluation)

- **Framework**: Node.js built-in test runner (`node:test`)
- **Module System**: ESM (`"type": "module"` in package.json)
- **Existing Test File**: `tests/prompt-verification/search-agent-migration.test.js` validates 6 agents from REQ-0042
- **Existing Helpers**: `readAgent()`, `extractFrontmatter()`, `hasEnhancedSearchSection()`, `extractEnhancedSearchSection()` (all in the existing test file)
- **Test ID Range Used by REQ-0042**: TC-U-026 through TC-U-037 (agent migration tests)
- **Test ID Range for REQ-0043**: TC-U-038 through TC-U-057 (continuing the sequence)

## Strategy for This Requirement

- **Approach**: Extend the existing `tests/prompt-verification/search-agent-migration.test.js` file (NOT create a new file)
- **Rationale**: The 4 new agents follow the exact same Enhanced Search migration pattern as the 6 already tested. The helper functions, imports, and test structure are reusable. Adding new `describe` blocks to the existing file keeps all agent migration validation in one place.
- **New Test Cases**: 20 test cases covering the 4 new agents (5 per agent)
- **Coverage Target**: 100% of requirements (FR-006 through FR-009) covered by test cases
- **Naming Convention**: Continue TC-U-038+ numbering; use same `describe`/`it` structure

## Test Pyramid

### Unit Tests (20 test cases)

All test cases for REQ-0043 are structural validation tests that read agent markdown files and verify:

1. **Enhanced Search section presence** (1 test per agent = 4 tests)
2. **Modality content validation** (1 test per agent = 4 tests)
3. **Availability check description** (1 test per agent = 4 tests)
4. **Existing search reference preservation** (1 test per agent = 4 tests)
5. **Frontmatter preservation** (1 test per agent = 4 tests)

These are classified as unit tests because they validate structural properties of static files with no runtime dependencies, no I/O beyond `readFileSync`, and no external services.

### Integration Tests

Not applicable for REQ-0043. Agent markdown files are static -- there are no component interactions to test. The Enhanced Search section is consumed at agent prompt-loading time, which is tested at the framework level (REQ-0041/REQ-0042 integration tests).

### E2E Tests

Not applicable for REQ-0043. The agent files are not part of a user-facing flow -- they are prompt definitions. E2E validation of the search abstraction layer is covered by REQ-0041 and REQ-0042 test suites.

### Security Tests

Not applicable for REQ-0043. Agent markdown files do not process user input or execute code. They are static prompt text consumed by the framework.

### Performance Tests

Not applicable for REQ-0043. Reading a markdown file is sub-millisecond. No performance thresholds apply.

## Performance Test Plan

No performance testing is needed for REQ-0043. The test cases read static markdown files using `readFileSync()`, which completes in sub-millisecond time. There are no network calls, no subprocess executions, and no user-facing latency to measure.

## Flaky Test Mitigation

1. **No filesystem mutation**: Tests only read files with `readFileSync()`. No temp directories needed.
2. **No network calls**: All assertions are against local file content.
3. **No timing dependencies**: Regex matching is deterministic.
4. **Stable file paths**: Agent file paths are resolved relative to project root using `resolve()` and `join()`.
5. **Additive-only changes**: New tests are added as new `describe` blocks. Existing tests remain untouched.

## Test Commands (use existing)

- Run agent migration tests: `node --test tests/prompt-verification/search-agent-migration.test.js`
- Run all prompt verification tests: `node --test tests/prompt-verification/*.test.js`
- Run all tests: `npm run test:all`

## Critical Paths

Per Article II, the following paths require 100% test coverage:

1. **Enhanced Search section present**: Every migrated agent MUST contain the `# ENHANCED SEARCH` heading
2. **Modality guidance present**: Every Enhanced Search section MUST mention structural and lexical modalities
3. **Availability check present**: Every Enhanced Search section MUST describe how to check if enhanced search is available
4. **Existing patterns preserved**: Migration MUST NOT remove existing Grep/Glob/find references
5. **Frontmatter unchanged**: Migration MUST NOT modify the YAML frontmatter (name, skills, model)

## Mutation Testing

Per Article XI, mutation testing applies. However, for structural markdown validation tests, the meaningful mutations are:

1. **Killed mutant**: Removing a regex assertion causes the test to no longer catch a missing section
2. **Killed mutant**: Changing a skill ID string causes the frontmatter check to fail
3. **Survived mutant**: Changing regex flags (e.g., `/i` to case-sensitive) -- acceptable if section headings are always uppercase

Mutation testing will be validated during Phase 16 (Quality Loop). The target is >=80% mutation score.

## Agent-Specific Migration Details

### 1. upgrade-engineer (14-upgrade-engineer.md)

- **File**: `src/claude/agents/14-upgrade-engineer.md`
- **Frontmatter name**: `upgrade-engineer`
- **Key skills**: UPG-001, UPG-002, UPG-003
- **Existing search references**: Line 281 ("Use Grep to find imports"), Line 355 ("Exhaustive grep for each breaking change")
- **Enhanced Search usage**: Structural search for API/function definitions; lexical search for breaking change patterns across codebase

### 2. execution-path-tracer (tracing/execution-path-tracer.md)

- **File**: `src/claude/agents/tracing/execution-path-tracer.md`
- **Frontmatter name**: `execution-path-tracer`
- **Key skills**: TRACE-201, TRACE-202
- **Existing search references**: Line 65 ("find where execution begins")
- **Enhanced Search usage**: Structural search for function/class definitions in call chains; lexical search for variable references and state mutations

### 3. cross-validation-verifier (impact-analysis/cross-validation-verifier.md)

- **File**: `src/claude/agents/impact-analysis/cross-validation-verifier.md`
- **Frontmatter name**: `cross-validation-verifier`
- **Key skills**: IA-401, IA-402
- **Existing search references**: Line 257 ("perform an independent Glob/Grep search")
- **Enhanced Search usage**: Lexical search for file pattern matching; structural search for import/dependency analysis

### 4. roundtable-analyst (roundtable-analyst.md)

- **File**: `src/claude/agents/roundtable-analyst.md`
- **Frontmatter name**: `roundtable-analyst`
- **Key skills**: None (`owned_skills: []`)
- **Existing search references**: Line 74 ("Search codebase for relevant files using Grep and Glob tools"), Line 321 ("Glob tool")
- **Enhanced Search usage**: Lexical search for codebase scanning during analysis; structural search for architecture pattern detection

## Test Execution Order

1. New tests run as part of the existing `search-agent-migration.test.js` file
2. Tests are independent -- each reads its own agent file, no shared state
3. Failure in one agent's tests does not block other agents' tests
