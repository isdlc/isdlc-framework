# Implementation Notes: REQ-0043 - Migrate Remaining 4 Agents to Enhanced Search Sections

**Requirement**: REQ-0043
**Phase**: 06 - Implementation
**Last Updated**: 2026-03-03
**Constitutional Articles**: II (Test-First), V (Simplicity), VII (Traceability), VIII (Documentation Currency), IX (Quality Gate Integrity)

---

## Summary

Migrated 4 remaining agent markdown files to include Enhanced Search sections, following the exact pattern established in REQ-0042. Extended the existing test file with 20 new test cases (TC-U-038 through TC-U-057).

## Changes Made

### Agent Files Modified

1. **`src/claude/agents/14-upgrade-engineer.md`** (FR-006)
   - Added `# ENHANCED SEARCH` section between OUTPUT STRUCTURE and AUTONOMOUS CONSTITUTIONAL ITERATION
   - Structural search guidance: API/function definitions affected by breaking changes
   - Lexical search guidance: keyword/pattern matching for breaking change references
   - Availability check: `.isdlc/search-config.json`
   - Fallback: automatic degradation to Grep/Glob
   - Existing Grep references preserved (UPG-003 Phase A Step 3, Upgrade-Specific Process Step 2)

2. **`src/claude/agents/tracing/execution-path-tracer.md`** (FR-007)
   - Added `# ENHANCED SEARCH` section between OUTPUT STRUCTURE and ERROR HANDLING
   - Structural search guidance: function/class definitions in call chains (Steps 2-3)
   - Lexical search guidance: variable references and state mutations (Steps 4-5)
   - Availability check: `.isdlc/search-config.json`
   - Fallback: automatic degradation to Grep/Glob
   - Existing search instructions preserved ("find where execution begins")

3. **`src/claude/agents/impact-analysis/cross-validation-verifier.md`** (FR-008)
   - Added `# ENHANCED SEARCH` section between OUTPUT STRUCTURE and ERROR HANDLING
   - Lexical search guidance: file pattern matching for Step 4c independent verification
   - Structural search guidance: import/dependency analysis for chain verification
   - Availability check: `.isdlc/search-config.json`
   - Fallback: automatic degradation to Grep/Glob
   - Existing Glob/Grep references preserved (Step 4c independent search)

4. **`src/claude/agents/roundtable-analyst.md`** (FR-009)
   - Added `## ENHANCED SEARCH` section (using `##` to match agent's heading hierarchy) before Section 9 (Constraints)
   - Lexical search guidance: codebase scanning for Alex's analysis (Section 2.1, Step 6)
   - Structural search guidance: architecture pattern detection (API endpoints, class hierarchies)
   - Availability check: `.isdlc/search-config.json`
   - Fallback: automatic degradation to Grep/Glob
   - Existing Grep and Glob references preserved (Sections 2.1 and 3.1)

### Test File Modified

**`tests/prompt-verification/search-agent-migration.test.js`**
- Added 4 new agent paths to the `AGENTS` map
- Added 4 new `describe` blocks with 5 `it` tests each (20 tests total)
- Test IDs: TC-U-038 through TC-U-057
- All 20 tests use existing helper functions (`readAgent`, `extractFrontmatter`, `hasEnhancedSearchSection`, `extractEnhancedSearchSection`)
- Updated JSDoc header to reference REQ-0043

## TDD Process

1. **Red phase**: Wrote 20 failing tests first. 12 tests failed (section presence, modality content, availability check). 8 tests passed immediately (existing search references and frontmatter already correct).
2. **Green phase**: Added Enhanced Search sections to all 4 agent files. All 39 tests passed (20 new + 19 existing).
3. **Refactor phase**: No refactoring needed -- sections follow the established pattern exactly.

## Key Implementation Decisions

1. **Heading level for roundtable-analyst.md**: Used `## ENHANCED SEARCH` (level 2) instead of `# ENHANCED SEARCH` (level 1) because the roundtable-analyst uses `##` for its primary section headings. This matches the agent's existing heading hierarchy.

2. **Section placement**: Each Enhanced Search section was placed between the OUTPUT STRUCTURE (or equivalent) and ERROR HANDLING sections, consistent with the pattern from REQ-0042 agents.

3. **Content tailored to agent purpose**: Each Enhanced Search section describes structural and lexical modalities in terms specific to the agent's role (e.g., upgrade-engineer mentions "breaking change patterns", execution-path-tracer mentions "call chains", etc.).

## Test Results

- Total tests in file: 39 (19 existing + 20 new)
- All passing: 39/39
- No regressions in existing tests

## Requirement Traceability

| Requirement | Agent | Test IDs | Status |
|-------------|-------|----------|--------|
| FR-006 | upgrade-engineer | TC-U-038 to TC-U-042 | PASS |
| FR-007 | execution-path-tracer | TC-U-043 to TC-U-047 | PASS |
| FR-008 | cross-validation-verifier | TC-U-048 to TC-U-052 | PASS |
| FR-009 | roundtable-analyst | TC-U-053 to TC-U-057 | PASS |
