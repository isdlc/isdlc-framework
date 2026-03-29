# Requirements Specification: BUG-0057

**Bug ID**: BUG-0057-fix-prompt-format-tests
**Type**: Bug fix (test maintenance)
**Priority**: P0

## 1. Business Context

3 prompt-format verification tests are failing due to stale content expectations. These tests validate that CLAUDE.md and README.md contain specific content strings, but previous workflows changed those files without updating the corresponding assertions. This causes CI failures and masks real regressions.

## 2. Functional Requirements

### FR-001: Fix T46 — SUGGESTED PROMPTS content assertion

**Confidence**: High

**AC-001-01**: Given the test T46 in `lib/invisible-framework.test.js:692`, when the test runs, then it should pass by asserting on content that actually exists in CLAUDE.md (replace or remove the `"primary_prompt"` assertion).

### FR-002: Fix TC-028 — README Node.js version assertion

**Confidence**: High

**AC-002-01**: Given the test TC-028 in `lib/node-version-update.test.js:346`, when the test runs, then it should pass by asserting on the actual Node.js version string in README.md (replace `"**Node.js 20+**"` with whatever the current README contains).

### FR-003: Fix TC-09-03 — CLAUDE.md fallback content assertion

**Confidence**: High

**AC-003-01**: Given the test TC-09-03 in `lib/prompt-format.test.js:632`, when the test runs, then it should pass by asserting on content that actually exists in CLAUDE.md (replace or remove the `"Start a new workflow"` assertion).

### FR-004: No regression in other tests

**Confidence**: High

**AC-004-01**: Given all 3 test files are modified, when `npm run test:all` executes, then the total test count MUST NOT decrease below the 1,600 baseline and no previously passing tests may start failing.

## 3. Out of Scope

- Refactoring test structure or helpers
- Adding new test coverage
- Modifying production code (CLAUDE.md, README.md)

## 4. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Fix T46 assertion | Must Have | Failing test blocks CI |
| FR-002 | Fix TC-028 assertion | Must Have | Failing test blocks CI |
| FR-003 | Fix TC-09-03 assertion | Must Have | Failing test blocks CI |
| FR-004 | No regression | Must Have | Constitutional Article II baseline |
