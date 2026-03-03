# Test Cases: Migrate Remaining 4 Agents to Enhanced Search Sections

**Requirement**: REQ-0043
**Phase**: 05 - Test Strategy & Design
**Last Updated**: 2026-03-03
**Total Test Cases**: 20
**Test File**: `tests/prompt-verification/search-agent-migration.test.js` (extend existing)
**Test ID Range**: TC-U-038 through TC-U-057

---

## Functional Requirements

For reference, the requirements for REQ-0043:

| Requirement | Description |
|-------------|-------------|
| FR-006 | Upgrade engineer agent has Enhanced Search section |
| FR-007 | Execution path tracer agent has Enhanced Search section |
| FR-008 | Cross-validation verifier agent has Enhanced Search section |
| FR-009 | Roundtable analyst agent has Enhanced Search section |

Each FR has 5 acceptance criteria (AC):
- AC-XX-01: Enhanced Search section present
- AC-XX-02: Structural and lexical modalities described
- AC-XX-03: Availability check described
- AC-XX-04: Existing search references preserved
- AC-XX-05: Frontmatter unchanged

---

## Unit Tests: Upgrade Engineer Migration (FR-006)

### TC-U-038: upgrade-engineer.md contains Enhanced Search section
- **Requirement**: FR-006 (AC-006-01)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File `src/claude/agents/14-upgrade-engineer.md` exists
- **Input**: Read file content
- **Expected**: File contains `# ENHANCED SEARCH` or `## Enhanced Search` heading (case-insensitive)
- **Verification**: `hasEnhancedSearchSection(content)` returns true

### TC-U-039: upgrade-engineer.md Enhanced Search describes structural and lexical modalities
- **Requirement**: FR-006 (AC-006-02)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions "structural" (for AST-aware search of API/function definitions) and "lexical" (for keyword pattern matching)
- **Verification**: Regex match for `/structural/i` and `/lexical/i` within the extracted section

### TC-U-040: upgrade-engineer.md Enhanced Search describes availability check
- **Requirement**: FR-006 (AC-006-03)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions how to check if enhanced search is available (e.g., `search-config.json`, `hasEnhancedSearch`, or "check" + "search" pattern)
- **Verification**: Regex `/search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i`

### TC-U-041: upgrade-engineer.md preserves existing Grep references
- **Requirement**: FR-006 (AC-006-04)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Content before the Enhanced Search section
- **Expected**: File still contains Grep references in the Process/Impact Analysis sections (line 281: "Use Grep to find imports"; line 355: "Exhaustive grep for each breaking change")
- **Verification**: Assert `/[Gg]rep/i` matches in content before Enhanced Search section

### TC-U-042: upgrade-engineer.md frontmatter unchanged
- **Requirement**: FR-006 (AC-006-05)
- **Test Type**: negative
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Extract YAML frontmatter
- **Expected**: Frontmatter contains `name: upgrade-engineer`, `UPG-001`, `UPG-002`, `UPG-003`
- **Verification**: Assert frontmatter includes expected agent name and skill IDs

---

## Unit Tests: Execution Path Tracer Migration (FR-007)

### TC-U-043: execution-path-tracer.md contains Enhanced Search section
- **Requirement**: FR-007 (AC-007-01)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File `src/claude/agents/tracing/execution-path-tracer.md` exists
- **Input**: Read file content
- **Expected**: File contains `# ENHANCED SEARCH` or `## Enhanced Search` heading (case-insensitive)
- **Verification**: `hasEnhancedSearchSection(content)` returns true

### TC-U-044: execution-path-tracer.md Enhanced Search describes structural and lexical modalities
- **Requirement**: FR-007 (AC-007-02)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions "structural" (for function/class definition lookup in call chains) and "lexical" (for variable reference and state mutation search)
- **Verification**: Regex match for `/structural/i` and `/lexical/i` within the extracted section

### TC-U-045: execution-path-tracer.md Enhanced Search describes availability check
- **Requirement**: FR-007 (AC-007-03)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions how to check if enhanced search is available
- **Verification**: Regex `/search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i`

### TC-U-046: execution-path-tracer.md preserves existing search instructions
- **Requirement**: FR-007 (AC-007-04)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Full file content
- **Expected**: File still contains references to finding execution entry points (the word "find" in context of locating code entry points, present at line 65)
- **Verification**: Assert `/find.*entry|find.*execution|find.*where/i` or generic code search references exist in content

### TC-U-047: execution-path-tracer.md frontmatter unchanged
- **Requirement**: FR-007 (AC-007-05)
- **Test Type**: negative
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Extract YAML frontmatter
- **Expected**: Frontmatter contains `name: execution-path-tracer`, `TRACE-201`, `TRACE-202`
- **Verification**: Assert frontmatter includes expected agent name and skill IDs

---

## Unit Tests: Cross-Validation Verifier Migration (FR-008)

### TC-U-048: cross-validation-verifier.md contains Enhanced Search section
- **Requirement**: FR-008 (AC-008-01)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File `src/claude/agents/impact-analysis/cross-validation-verifier.md` exists
- **Input**: Read file content
- **Expected**: File contains `# ENHANCED SEARCH` or `## Enhanced Search` heading (case-insensitive)
- **Verification**: `hasEnhancedSearchSection(content)` returns true

### TC-U-049: cross-validation-verifier.md Enhanced Search describes structural and lexical modalities
- **Requirement**: FR-008 (AC-008-02)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions "structural" (for import/dependency analysis) and "lexical" (for file pattern matching and cross-referencing)
- **Verification**: Regex match for `/structural/i` and `/lexical/i` within the extracted section

### TC-U-050: cross-validation-verifier.md Enhanced Search describes availability check
- **Requirement**: FR-008 (AC-008-03)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions how to check if enhanced search is available
- **Verification**: Regex `/search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i`

### TC-U-051: cross-validation-verifier.md preserves existing Glob/Grep references
- **Requirement**: FR-008 (AC-008-04)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Full file content
- **Expected**: File still contains the Glob/Grep search instruction (line 257: "perform an independent Glob/Grep search")
- **Verification**: Assert `/Glob.*Grep|Grep.*Glob|Glob\/Grep/i` matches in content

### TC-U-052: cross-validation-verifier.md frontmatter unchanged
- **Requirement**: FR-008 (AC-008-05)
- **Test Type**: negative
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Extract YAML frontmatter
- **Expected**: Frontmatter contains `name: cross-validation-verifier`, `IA-401`, `IA-402`
- **Verification**: Assert frontmatter includes expected agent name and skill IDs

---

## Unit Tests: Roundtable Analyst Migration (FR-009)

### TC-U-053: roundtable-analyst.md contains Enhanced Search section
- **Requirement**: FR-009 (AC-009-01)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File `src/claude/agents/roundtable-analyst.md` exists
- **Input**: Read file content
- **Expected**: File contains `# ENHANCED SEARCH` or `## Enhanced Search` heading (case-insensitive)
- **Verification**: `hasEnhancedSearchSection(content)` returns true

### TC-U-054: roundtable-analyst.md Enhanced Search describes structural and lexical modalities
- **Requirement**: FR-009 (AC-009-02)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions "structural" (for architecture pattern detection) and "lexical" (for codebase scanning during analysis)
- **Verification**: Regex match for `/structural/i` and `/lexical/i` within the extracted section

### TC-U-055: roundtable-analyst.md Enhanced Search describes availability check
- **Requirement**: FR-009 (AC-009-03)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: Enhanced Search section exists in file
- **Input**: Extract Enhanced Search section content
- **Expected**: Section mentions how to check if enhanced search is available
- **Verification**: Regex `/search-config\.json|hasEnhancedSearch|enhanced\s*search.*available|check.*search/i`

### TC-U-056: roundtable-analyst.md preserves existing Grep and Glob references
- **Requirement**: FR-009 (AC-009-04)
- **Test Type**: positive
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Full file content
- **Expected**: File still contains Grep and Glob references for codebase search (line 74: "using Grep and Glob tools"; line 321: "Glob tool")
- **Verification**: Assert `/Grep/i` and `/Glob/i` both match in content

### TC-U-057: roundtable-analyst.md frontmatter unchanged
- **Requirement**: FR-009 (AC-009-05)
- **Test Type**: negative
- **Priority**: P1
- **Precondition**: File content loaded
- **Input**: Extract YAML frontmatter
- **Expected**: Frontmatter contains `name: roundtable-analyst`, `owned_skills: []`
- **Verification**: Assert frontmatter includes expected agent name and empty skills list

---

## Test Implementation Notes

### AGENTS Map Extension

Add 4 new entries to the existing `AGENTS` object in `search-agent-migration.test.js`:

```javascript
const AGENTS = {
  // ... existing 6 agents from REQ-0042 ...
  'upgrade-engineer': join(projectRoot, 'src', 'claude', 'agents', '14-upgrade-engineer.md'),
  'execution-path-tracer': join(projectRoot, 'src', 'claude', 'agents', 'tracing', 'execution-path-tracer.md'),
  'cross-validation-verifier': join(projectRoot, 'src', 'claude', 'agents', 'impact-analysis', 'cross-validation-verifier.md'),
  'roundtable-analyst': join(projectRoot, 'src', 'claude', 'agents', 'roundtable-analyst.md'),
};
```

### Helper Reuse

All existing helper functions are reusable without modification:
- `readAgent(name)` -- reads any agent from the AGENTS map
- `extractFrontmatter(content)` -- extracts YAML frontmatter
- `hasEnhancedSearchSection(content)` -- checks for section heading
- `extractEnhancedSearchSection(content)` -- extracts section content

### Test Structure

Each agent gets one `describe` block with 5 `it` blocks, matching the pattern from REQ-0042:

```javascript
describe('Upgrade Engineer migration (FR-006)', () => {
  it('TC-U-038: should contain Enhanced Search section', ...);
  it('TC-U-039: Enhanced Search section should describe structural and lexical modalities', ...);
  it('TC-U-040: Enhanced Search section should describe availability check', ...);
  it('TC-U-041: should preserve existing Grep references', ...);
  it('TC-U-042: frontmatter should contain expected agent name and skills', ...);
});
```

---

## Requirement-to-Test Coverage Summary

| Requirement | Test Count | Test IDs |
|-------------|-----------|----------|
| FR-006 | 5 | TC-U-038 through TC-U-042 |
| FR-007 | 5 | TC-U-043 through TC-U-047 |
| FR-008 | 5 | TC-U-048 through TC-U-052 |
| FR-009 | 5 | TC-U-053 through TC-U-057 |
| **Total** | **20** | |
