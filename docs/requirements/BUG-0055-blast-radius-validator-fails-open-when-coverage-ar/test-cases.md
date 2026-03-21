# Test Cases: BUG-0055 — Blast Radius Validator Fails Open

**Phase**: 05-test-strategy
**Date**: 2026-03-21
**Total New Tests**: 28
**Target File**: `src/claude/hooks/tests/test-blast-radius-validator.test.cjs`

All tests below are NEW additions to the existing test file. They extend the existing describe blocks and add new ones. Each test MUST be written to FAIL before the implementation fix is applied.

---

## 1. New Fixtures (added to test file header)

### IMPACT_4COL_ROUNDTABLE
Matches the real REQ-0066 roundtable output (4-column: File | Module | Change Type | Requirement Traces).
```javascript
const IMPACT_4COL_ROUNDTABLE = `## Tier 1: Direct Changes

| File | Module | Change Type | Requirement Traces |
|------|--------|-------------|-------------------|
| \`lib/memory-search.js\` | memory-search | Modify | FR-001, FR-006 |
| \`lib/memory-embedder.js\` | memory-embedder | Modify | FR-004, FR-005 |
| \`src/claude/commands/isdlc.md\` | analyze handler | Modify | FR-001, FR-002 |
`;
```

### IMPACT_4COL_VARIANT
Matches the real REQ-0064 roundtable output (4-column: File | Change Type | Description | Impact).
```javascript
const IMPACT_4COL_VARIANT = `## Tier 1: Direct Changes

| File | Change Type | Description | REQ-0065 Impact |
|------|-------------|-------------|-----------------|
| \`lib/memory.js\` | New | Core memory module | None |
| \`src/claude/commands/isdlc.md\` | Modify | Analyze handler: inject context | Shared file |
| \`bin/isdlc.js\` | Modify | Register memory subcommand | None |
`;
```

### IMPACT_3COL_MIXEDCASE
Matches the real REQ-0063 roundtable output (3-column with mixed-case "Type" and values "New"/"Modify").
```javascript
const IMPACT_3COL_MIXEDCASE = `## Tier 1: Direct Changes

| File | Type | Description |
|------|------|-------------|
| \`lib/memory.js\` | New | Core memory module |
| \`src/claude/agents/roundtable-analyst.md\` | Modify | Add MEMORY_CONTEXT parsing |
| \`bin/isdlc.js\` | modify | Register memory subcommand |
`;
```

### IMPACT_MIXED_SECTIONS
Tests cross-section parsing with different column counts per section.
```javascript
const IMPACT_MIXED_SECTIONS = `## Tier 1: Direct Changes

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| \`src/hooks/validator.cjs\` | hooks | Modify | FR-001 |

## Tier 2: Indirect Changes

| File | Change Type | Risk |
|------|-------------|------|
| \`src/hooks/common.cjs\` | MODIFY | Low |
| \`src/agents/dev.md\` | NO CHANGE | None |
`;
```

### IMPACT_SUBSTANTIAL_NO_MATCH
Triggers zero-file guard: substantial content but no recognizable change type keywords.
```javascript
const IMPACT_SUBSTANTIAL_NO_MATCH = `## Impact Analysis

This is a detailed impact analysis document produced by the roundtable.
It contains multiple paragraphs and is well over 100 characters in length.

### Affected Areas

| Component | Scope | Risk Assessment | Action Required |
|-----------|-------|-----------------|-----------------|
| \`lib/memory.js\` | Core module | High risk to stability | Needs review |
| \`lib/search.js\` | Search layer | Medium risk | Update tests |

The above table does not contain standard change type keywords like CREATE, MODIFY, DELETE, or New.
Instead it uses non-standard column headers that the parser should not silently ignore.
`;
```

### IMPACT_SHORT_EMPTY
Below threshold for zero-file guard.
```javascript
const IMPACT_SHORT_EMPTY = `## Impact\n\nMinimal.`;
```

---

## 2. Unit Tests: parseImpactAnalysis() — 4-Column Format (FR-001)

### TC-PIA-13: Parses 4-column roundtable format (AC-001-02)
- **Requirement**: FR-001, AC-001-02
- **Type**: positive, unit
- **Input**: IMPACT_4COL_ROUNDTABLE fixture
- **Expected**: Returns 3 entries: `lib/memory-search.js` (MODIFY), `lib/memory-embedder.js` (MODIFY), `src/claude/commands/isdlc.md` (MODIFY)
- **Why it fails before fix**: Current regex expects change type in column 2; 4-column format has it in column 3

### TC-PIA-14: Parses 4-column variant format (AC-001-02)
- **Requirement**: FR-001, AC-001-02
- **Type**: positive, unit
- **Input**: IMPACT_4COL_VARIANT fixture
- **Expected**: Returns 3 entries: `lib/memory.js` (CREATE/NEW), `src/claude/commands/isdlc.md` (MODIFY), `bin/isdlc.js` (MODIFY)
- **Why it fails before fix**: "New" is not recognized by regex (requires uppercase CREATE)

### TC-PIA-15: Parses 3-column mixed-case format (AC-001-04)
- **Requirement**: FR-001, AC-001-04
- **Type**: positive, unit
- **Input**: IMPACT_3COL_MIXEDCASE fixture
- **Expected**: Returns 3 entries with change types normalized to uppercase
- **Why it fails before fix**: "New" and "Modify" and "modify" are not matched by case-sensitive regex

### TC-PIA-16: Normalizes "New" to "CREATE" (AC-001-04)
- **Requirement**: FR-001, AC-001-04
- **Type**: positive, unit
- **Input**: Single row with "New" change type
- **Expected**: Returned changeType is "CREATE" (normalized)
- **Why it fails before fix**: "New" is not in the regex alternation

### TC-PIA-17: Normalizes "Modify" to "MODIFY" (AC-001-04)
- **Requirement**: FR-001, AC-001-04
- **Type**: positive, unit
- **Input**: Single row with "Modify" change type
- **Expected**: Returned changeType is "MODIFY" (normalized)
- **Why it fails before fix**: Case-sensitive regex rejects "Modify"

### TC-PIA-18: Normalizes "Major modify" to "MODIFY" (AC-001-04)
- **Requirement**: FR-001, AC-001-04
- **Type**: positive, unit
- **Input**: Single row with "Major modify"
- **Expected**: Returned changeType is "MODIFY" (normalized)
- **Why it fails before fix**: "Major modify" is not in the regex

### TC-PIA-19: Parses mixed sections with different column counts (AC-001-03)
- **Requirement**: FR-001, AC-001-03
- **Type**: positive, unit
- **Input**: IMPACT_MIXED_SECTIONS fixture
- **Expected**: Returns 2 entries from both sections (validator.cjs as MODIFY, common.cjs as MODIFY). Excludes NO CHANGE entry.
- **Why it fails before fix**: 4-column section rows fail to match

### TC-PIA-20: Existing 3-column fixtures still parse correctly (AC-001-01)
- **Requirement**: FR-001, AC-001-01
- **Type**: positive, unit (regression guard)
- **Input**: Existing IMPACT_SINGLE_TABLE fixture
- **Expected**: Same results as TC-PIA-01 (3 entries, correct paths and types)
- **Note**: This test should PASS even before the fix (backward compatibility). It is a regression guard.

---

## 3. Unit Tests: Zero-File Guard (FR-002)

### TC-ZFG-01: Warning emitted for substantial content with zero parsed files (AC-002-01)
- **Requirement**: FR-002, AC-002-01
- **Type**: positive, unit
- **Input**: IMPACT_SUBSTANTIAL_NO_MATCH fixture (>100 chars, no recognized change types)
- **Expected**: check() returns `allow` with stderr containing "impact-analysis.md has content but no affected files were parsed"
- **Why it fails before fix**: No zero-file guard exists; check() silently returns allow with no stderr

### TC-ZFG-02: Validator still allows (fail-open) when zero-file guard fires (AC-002-02)
- **Requirement**: FR-002, AC-002-02
- **Type**: positive, unit
- **Input**: IMPACT_SUBSTANTIAL_NO_MATCH fixture
- **Expected**: check() returns `{ decision: 'allow' }` (not block)
- **Why it fails before fix**: No guard exists to test

### TC-ZFG-03: Guard does NOT fire for short content (AC-002-03)
- **Requirement**: FR-002, AC-002-03
- **Type**: negative, unit
- **Input**: IMPACT_SHORT_EMPTY fixture (<100 chars)
- **Expected**: check() returns allow with NO stderr warning
- **Why it fails before fix**: Guard does not exist, but this test passes trivially. It is a boundary guard.

### TC-ZFG-04: Guard does NOT fire for empty string (AC-002-03)
- **Requirement**: FR-002, AC-002-03
- **Type**: negative, unit
- **Input**: Empty string input to parseImpactAnalysis
- **Expected**: Returns empty array, NO warning
- **Note**: This should pass even before fix (regression guard for existing behavior)

### TC-ZFG-05: Guard does NOT fire when files ARE successfully parsed (AC-002-01)
- **Requirement**: FR-002, AC-002-01
- **Type**: negative, unit
- **Input**: IMPACT_SINGLE_TABLE (valid, parses 3 files)
- **Expected**: No stderr warning about zero files
- **Note**: Ensures the guard only fires on zero-result parses

### TC-ZFG-06: Guard uses 100-char threshold correctly (AC-002-03)
- **Requirement**: FR-002, AC-002-03
- **Type**: boundary, unit
- **Input**: Content exactly 100 characters with no matching rows, and content at 101 characters
- **Expected**: 100-char content does NOT trigger warning; 101-char content DOES trigger warning

---

## 4. Unit Tests: Test Fixture Validation (FR-003)

### TC-FIX-01: Existing 3-column tests still pass (AC-003-01)
- **Requirement**: FR-003, AC-003-01
- **Type**: positive, unit (regression)
- **Expected**: All 12 existing parseImpactAnalysis tests (TC-PIA-01 through TC-PIA-12) pass unchanged
- **Note**: Not a new test — verified by running existing suite. Included in traceability for completeness.

### TC-FIX-02: 4-column fixture matches real roundtable output (AC-003-02)
- **Requirement**: FR-003, AC-003-02
- **Type**: positive, unit
- **Expected**: IMPACT_4COL_ROUNDTABLE fixture is parseable and produces correct results (covered by TC-PIA-13)
- **Note**: Same test as TC-PIA-13 — dual-mapped to both FR-001 and FR-003

### TC-FIX-03: 4-column fixture parsing verified (AC-003-03)
- **Requirement**: FR-003, AC-003-03
- **Type**: positive, unit
- **Expected**: TC-PIA-13 and TC-PIA-14 demonstrate correct 4-column extraction
- **Note**: Same tests as TC-PIA-13/14 — dual-mapped

### TC-FIX-04: Zero-file guard test exists (AC-003-04)
- **Requirement**: FR-003, AC-003-04
- **Type**: positive, unit
- **Expected**: TC-ZFG-01 demonstrates zero-file guard fires for unrecognized format
- **Note**: Same test as TC-ZFG-01 — dual-mapped

---

## 5. Integration Tests: Full check() Flow with 4-Column Fixtures (FR-001, FR-002)

### TC-INT-11: Allow when all 4-column affected files in git diff (AC-001-02)
- **Requirement**: FR-001, AC-001-02
- **Type**: positive, integration
- **Setup**: Temp git repo with feature branch modifying `lib/memory-search.js`, `lib/memory-embedder.js`, `src/claude/commands/isdlc.md`
- **Input**: IMPACT_4COL_ROUNDTABLE written to impact-analysis.md
- **Expected**: check() returns `{ decision: 'allow' }`
- **Why it fails before fix**: Parser extracts 0 files from 4-column format, so validator trivially passes (which looks like allow but for wrong reason)

### TC-INT-12: Block when 4-column affected files NOT in git diff (AC-001-02)
- **Requirement**: FR-001, AC-001-02
- **Type**: positive, integration
- **Setup**: Temp git repo with feature branch modifying only `lib/memory-search.js` (1 of 3 files)
- **Input**: IMPACT_4COL_ROUNDTABLE written to impact-analysis.md
- **Expected**: check() returns `{ decision: 'block' }` with stopReason listing `lib/memory-embedder.js` and `src/claude/commands/isdlc.md`
- **Why it fails before fix**: Parser extracts 0 files, validator trivially allows (the core bug)

### TC-INT-13: Allow with 4-column format plus deferred files (AC-001-02, AC-001-03)
- **Requirement**: FR-001, AC-001-02
- **Type**: positive, integration
- **Setup**: Temp git repo modifying 2 of 3 files, 3rd deferred in blast-radius-coverage.md
- **Input**: IMPACT_4COL_ROUNDTABLE
- **Expected**: check() returns `{ decision: 'allow' }`

### TC-INT-14: Mixed-case change types work in full flow (AC-001-04)
- **Requirement**: FR-001, AC-001-04
- **Type**: positive, integration
- **Setup**: Temp git repo with all files modified
- **Input**: IMPACT_3COL_MIXEDCASE fixture (uses "New", "Modify", "modify")
- **Expected**: check() returns `{ decision: 'allow' }`
- **Why it fails before fix**: Mixed-case types not recognized

### TC-INT-15: Zero-file guard in full flow with substantial content (AC-002-01)
- **Requirement**: FR-002, AC-002-01
- **Type**: positive, integration
- **Setup**: Temp directory with impact-analysis.md containing IMPACT_SUBSTANTIAL_NO_MATCH
- **Expected**: check() returns `{ decision: 'allow' }` with stderr containing zero-file warning
- **Why it fails before fix**: No guard exists

### TC-INT-16: Mixed sections parsed correctly in full flow (AC-001-03)
- **Requirement**: FR-001, AC-001-03
- **Type**: positive, integration
- **Setup**: Temp git repo with all affected files modified
- **Input**: IMPACT_MIXED_SECTIONS fixture (4-col Tier 1 + 3-col Tier 2)
- **Expected**: check() returns `{ decision: 'allow' }` — both sections' files recognized

---

## 6. Behavioral Tests: Agent Prompt Verification (FR-004, FR-005)

### TC-AGT-01: QA engineer prompt contains blast radius cross-check (AC-004-01)
- **Requirement**: FR-004, AC-004-01
- **Type**: positive, behavioral
- **Method**: Read `src/claude/agents/07-qa-engineer.md` and verify it contains text about comparing impact-analysis.md Tier 1 files against git diff
- **Expected**: File contains "impact-analysis" AND ("blast radius" OR "Tier 1") AND "git diff"

### TC-AGT-02: QA engineer prompt specifies blocking finding (AC-004-02)
- **Requirement**: FR-004, AC-004-02
- **Type**: positive, behavioral
- **Method**: Read `src/claude/agents/07-qa-engineer.md` and verify it mentions blocking/critical finding for unaddressed files
- **Expected**: File contains "block" or "BLOCK" or "critical" in context of blast radius check

### TC-AGT-03: Quality loop prompt contains blast radius check (AC-005-01)
- **Requirement**: FR-005, AC-005-01
- **Type**: positive, behavioral
- **Method**: Read `src/claude/agents/16-quality-loop-engineer.md` and verify it contains blast radius coverage check
- **Expected**: File contains "impact-analysis" AND ("blast radius" OR "Tier 1") AND ("git diff" OR "coverage")

### TC-AGT-04: Quality loop prompt specifies failing check (AC-005-02)
- **Requirement**: FR-005, AC-005-02
- **Type**: positive, behavioral
- **Method**: Read `src/claude/agents/16-quality-loop-engineer.md` and verify unaddressed files are flagged as failing
- **Expected**: File contains "fail" or "FAIL" or "block" in context of blast radius check
