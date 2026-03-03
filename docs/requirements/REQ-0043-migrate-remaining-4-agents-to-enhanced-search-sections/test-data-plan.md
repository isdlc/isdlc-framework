# Test Data Plan: Migrate Remaining 4 Agents to Enhanced Search Sections

**Requirement**: REQ-0043
**Phase**: 05 - Test Strategy & Design
**Last Updated**: 2026-03-03

---

## Overview

REQ-0043 tests validate structural properties of agent markdown files. The "test data" is the agent files themselves -- they are both the system under test and the input data. No synthetic test data generation is needed.

## Agent Files (Test Inputs)

| Agent | File Path | Size Estimate |
|-------|-----------|---------------|
| upgrade-engineer | `src/claude/agents/14-upgrade-engineer.md` | ~600 lines |
| execution-path-tracer | `src/claude/agents/tracing/execution-path-tracer.md` | ~200 lines |
| cross-validation-verifier | `src/claude/agents/impact-analysis/cross-validation-verifier.md` | ~270 lines |
| roundtable-analyst | `src/claude/agents/roundtable-analyst.md` | ~500 lines |

## Boundary Values

### Section Heading Variations
- `# ENHANCED SEARCH` (H1 all-caps) -- the established pattern
- `## Enhanced Search` (H2 mixed-case) -- alternative valid format
- `## ENHANCED SEARCH` (H2 all-caps) -- another valid format
- The regex `/^#{1,2}\s+ENHANCED\s+SEARCH/im` covers all valid variants

### Frontmatter Boundary Cases
- Agent with many skills (upgrade-engineer: 6 skills) -- verify all key skills present
- Agent with zero skills (roundtable-analyst: `owned_skills: []`) -- verify empty array preserved
- Agent with nested frontmatter fields (can_delegate_to, supported_workflows) -- verify not corrupted

## Invalid Inputs

### What Should NOT Match
- A file without an Enhanced Search section should return `false` from `hasEnhancedSearchSection()`
- A section titled "Enhanced Searching" or "SEARCH ENHANCED" should NOT match
- Frontmatter with a modified `name` field indicates migration corruption

### What Should NOT Be Present
- No duplicate Enhanced Search sections (only one per file)
- No modification to existing process steps or skill tables
- No removal of existing Grep/Glob/find references

## Maximum-Size Inputs

The largest agent file is `14-upgrade-engineer.md` at approximately 600 lines. This is well within the bounds of `readFileSync()` performance. No chunking or streaming is needed.

The regex operations (`/structural/i`, `/lexical/i`, etc.) operate on strings up to ~30KB, which complete in microseconds.

## Expected Values per Agent

### upgrade-engineer
- **Frontmatter name**: `upgrade-engineer`
- **Required skills in frontmatter**: `UPG-001`, `UPG-002`, `UPG-003`
- **Existing search refs to preserve**: "Grep" (lines 281, 355)
- **Enhanced Search modalities**: structural, lexical

### execution-path-tracer
- **Frontmatter name**: `execution-path-tracer`
- **Required skills in frontmatter**: `TRACE-201`, `TRACE-202`
- **Existing search refs to preserve**: "find" in context of entry point discovery (line 65)
- **Enhanced Search modalities**: structural, lexical

### cross-validation-verifier
- **Frontmatter name**: `cross-validation-verifier`
- **Required skills in frontmatter**: `IA-401`, `IA-402`
- **Existing search refs to preserve**: "Glob/Grep" (line 257)
- **Enhanced Search modalities**: structural, lexical

### roundtable-analyst
- **Frontmatter name**: `roundtable-analyst`
- **Required skills in frontmatter**: `owned_skills: []` (empty)
- **Existing search refs to preserve**: "Grep and Glob" (line 74), "Glob tool" (line 321)
- **Enhanced Search modalities**: structural, lexical

## Test Data Maintenance

No external test data files are needed. The agent files themselves serve as both test data and system-under-test. As long as the agent files exist in the repository, the tests have their data.

If agent files are relocated or renamed, the `AGENTS` path map in the test file must be updated accordingly.
