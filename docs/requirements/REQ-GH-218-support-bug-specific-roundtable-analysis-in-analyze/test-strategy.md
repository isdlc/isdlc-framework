# Test Strategy: Bug-Specific Roundtable Analysis

**Slug**: REQ-GH-218-support-bug-specific-roundtable-analysis-in-analyze
**Phase**: 05 - Test Strategy
**Version**: 1.0.0

---

## 1. Test Approach

This feature is **prompt-only** — it creates/modifies markdown protocol files and JSON template files. There is no production JavaScript code, no runtime hooks, and no new Node.js modules. Testing focuses on:

1. **Template validation** — JSON schema correctness for the 3 new confirmation templates
2. **Protocol structure** — Verify bug-roundtable-analyst.md contains required sections
3. **Routing correctness** — Verify isdlc.md step 6.5 references the new protocol
4. **Content verification** — Verify prompt content matches requirements (prompt verification tests)

### Test Pyramid

| Layer | Count | What it validates |
|-------|-------|-------------------|
| Unit tests (template schema) | 9 | JSON structure, required fields, section ordering |
| Unit tests (routing/content) | 8 | isdlc.md step 6.5 content, protocol references, build kickoff params |
| Unit tests (tracing adapter) | 5 | ANALYSIS_MODE flag, discovery context, delegation prompt structure |
| **Total** | **22** | |

### Test Framework

- **Vitest** (existing project test framework)
- Tests read files from disk and validate structure/content — no runtime execution needed
- Pattern follows existing prompt-verification tests in `tests/` (e.g., `tests/hooks/` and `tests/commands/`)

---

## 2. Test Cases

### 2.1 Bug-Specific Confirmation Templates (T0001)

**Test file**: `tests/hooks/config/templates/bug-templates.test.js`

#### TC-001: bug-summary.template.json has valid schema
- **Traces**: FR-004, AC-004-01
- **Given** the file `src/claude/hooks/config/templates/bug-summary.template.json` exists
- **When** parsed as JSON
- **Then** it has `domain: "bug-summary"`, `version` field, `format.format_type: "bulleted"`, `format.section_order` array, and `format.required_sections` array

#### TC-002: bug-summary.template.json has required sections
- **Traces**: FR-004, AC-004-01
- **Given** the bug-summary template is loaded
- **When** `format.required_sections` is read
- **Then** it includes `"severity"`, `"reproduction_steps"`, and `"affected_area"`

#### TC-003: root-cause.template.json has valid schema
- **Traces**: FR-004, AC-004-02
- **Given** the file `src/claude/hooks/config/templates/root-cause.template.json` exists
- **When** parsed as JSON
- **Then** it has `domain: "root-cause"`, `version` field, `format.format_type: "bulleted"`, `format.section_order` array, and `format.required_sections` array

#### TC-004: root-cause.template.json has required sections
- **Traces**: FR-004, AC-004-02
- **Given** the root-cause template is loaded
- **When** `format.required_sections` is read
- **Then** it includes `"hypotheses"` and `"affected_code_paths"`

#### TC-005: fix-strategy.template.json has valid schema
- **Traces**: FR-003, FR-004, AC-003-01, AC-004-03
- **Given** the file `src/claude/hooks/config/templates/fix-strategy.template.json` exists
- **When** parsed as JSON
- **Then** it has `domain: "fix-strategy"`, `version` field, `format.format_type: "bulleted"`, `format.section_order` array, and `format.required_sections` array

#### TC-006: fix-strategy.template.json has required sections
- **Traces**: FR-003, AC-003-01, AC-003-02, AC-003-03
- **Given** the fix-strategy template is loaded
- **When** `format.required_sections` is read
- **Then** it includes `"approaches"`, `"recommended_approach"`, and `"regression_risk"`

#### TC-007: All bug templates follow the same schema as feature templates
- **Traces**: FR-004, AC-004-01, AC-004-02, AC-004-03
- **Given** the feature templates (requirements.template.json, architecture.template.json, design.template.json) exist
- **When** the bug templates are compared structurally
- **Then** all templates have the same top-level keys: `domain`, `version`, `format`

#### TC-008: Dogfooding dual-file templates match src/ templates
- **Traces**: FR-004
- **Given** bug templates exist in both `src/claude/hooks/config/templates/` and `.claude/hooks/config/templates/`
- **When** file contents are compared
- **Then** they are byte-identical

#### TC-009: All bug template section_order entries are unique
- **Traces**: FR-004
- **Given** each bug template is loaded
- **When** `format.section_order` is checked
- **Then** no duplicate entries exist in any template's section_order

### 2.2 Routing and Build Kickoff (T0002)

**Test file**: `tests/commands/isdlc-bug-roundtable.test.js`

#### TC-010: isdlc.md step 6.5c references bug-roundtable-analyst.md
- **Traces**: FR-006, AC-006-01
- **Given** `src/claude/commands/isdlc.md` exists
- **When** the content of step 6.5c is read
- **Then** it contains a reference to `bug-roundtable-analyst.md` (not `bug-gather-analyst.md`)

#### TC-011: isdlc.md step 6.5f specifies START_PHASE 05-test-strategy
- **Traces**: FR-005, AC-005-02, AC-005-03
- **Given** `src/claude/commands/isdlc.md` exists
- **When** the content of step 6.5f is read
- **Then** it contains `START_PHASE: "05-test-strategy"` for the build kickoff

#### TC-012: isdlc.md step 6.5e includes 02-tracing in phases_completed
- **Traces**: FR-002, AC-002-04
- **Given** `src/claude/commands/isdlc.md` exists
- **When** the content of step 6.5e is read
- **Then** it specifies adding both `"01-requirements"` and `"02-tracing"` to `meta.phases_completed`

#### TC-013: isdlc.md step 6.5f does not contain "Should I fix it?"
- **Traces**: FR-005, AC-005-01
- **Given** `src/claude/commands/isdlc.md` exists
- **When** step 6.5f is read
- **Then** it does NOT contain the legacy fix handoff prompt "Should I fix it?"

#### TC-014: bug-roundtable-analyst.md exists and has required sections
- **Traces**: FR-001, AC-001-01, AC-001-02
- **Given** `src/claude/agents/bug-roundtable-analyst.md` exists
- **When** its content is parsed
- **Then** it contains sections for: Opening, Conversation Loop, Bug-Report Production, Tracing Delegation, Confirmation Sequence, Artifact Batch Write, Build Kickoff Signal

#### TC-015: bug-roundtable-analyst.md specifies bulleted format
- **Traces**: FR-001, AC-001-02
- **Given** `src/claude/agents/bug-roundtable-analyst.md` exists
- **When** conversation flow rules are read
- **Then** it specifies bulleted format (matching feature roundtable convention)

#### TC-016: bug-roundtable-analyst.md confirmation sequence has 4 domains
- **Traces**: FR-004, AC-004-01, AC-004-02, AC-004-03, AC-004-04
- **Given** the bug roundtable protocol is read
- **When** the confirmation sequence section is parsed
- **Then** it defines 4 domains: BUG_SUMMARY, ROOT_CAUSE, FIX_STRATEGY, TASKS

#### TC-017: bug-gather-analyst.md has deprecation header
- **Traces**: FR-006, AC-006-02
- **Given** `src/claude/agents/bug-gather-analyst.md` exists
- **When** the first 10 lines are read
- **Then** it contains a deprecation notice referencing `bug-roundtable-analyst.md`

### 2.3 Tracing Delegation Adapter (T0003)

**Test file**: `tests/commands/isdlc-bug-tracing-delegation.test.js`

#### TC-018: bug-roundtable-analyst.md includes ANALYSIS_MODE flag in tracing delegation
- **Traces**: FR-002, AC-002-01
- **Given** `src/claude/agents/bug-roundtable-analyst.md` exists
- **When** the tracing delegation section is read
- **Then** the delegation prompt includes `ANALYSIS_MODE: true`

#### TC-019: bug-roundtable-analyst.md passes BUG_REPORT_PATH in tracing delegation
- **Traces**: FR-002, AC-002-01
- **Given** the tracing delegation section is read
- **When** the delegation prompt template is examined
- **Then** it includes `BUG_REPORT_PATH` referencing the artifact folder's bug-report.md

#### TC-020: bug-roundtable-analyst.md passes DISCOVERY_CONTEXT in tracing delegation
- **Traces**: FR-002, AC-002-02
- **Given** the tracing delegation section is read
- **When** the delegation prompt template is examined
- **Then** it includes `DISCOVERY_CONTEXT` (not relying on state.json)

#### TC-021: bug-roundtable-analyst.md specifies fail-open for tracing failure
- **Traces**: FR-002, AC-002-03
- **Given** the tracing delegation section is read
- **When** error handling is examined
- **Then** it specifies fail-open behavior (Article X) — proceed with conversation-based analysis if tracing fails

#### TC-022: bug-roundtable-analyst.md specifies parallel T1/T2/T3 execution
- **Traces**: FR-002, AC-002-02
- **Given** the tracing delegation section is read
- **When** the delegation prompt is examined
- **Then** it references the tracing-orchestrator (which fans out T1/T2/T3 in parallel)

---

## 3. Traceability Matrix

| FR | AC | Test Cases | Impl Tasks |
|----|-----|------------|------------|
| FR-001 | AC-001-01 | TC-014 | T0007 |
| FR-001 | AC-001-02 | TC-014, TC-015 | T0007 |
| FR-001 | AC-001-03 | TC-014 | T0007 |
| FR-002 | AC-002-01 | TC-018, TC-019 | T0007 |
| FR-002 | AC-002-02 | TC-020, TC-022 | T0007 |
| FR-002 | AC-002-03 | TC-021 | T0007 |
| FR-002 | AC-002-04 | TC-012 | T0008 |
| FR-003 | AC-003-01 | TC-005, TC-006 | T0006, T0007 |
| FR-003 | AC-003-02 | TC-006 | T0006, T0007 |
| FR-003 | AC-003-03 | TC-006 | T0006, T0007 |
| FR-004 | AC-004-01 | TC-001, TC-002, TC-016 | T0004, T0007 |
| FR-004 | AC-004-02 | TC-003, TC-004, TC-016 | T0005, T0007 |
| FR-004 | AC-004-03 | TC-005, TC-006, TC-016 | T0006, T0007 |
| FR-004 | AC-004-04 | TC-016 | T0007 |
| FR-004 | AC-004-05 | TC-016 | T0007 |
| FR-004 | AC-004-06 | TC-016 | T0007 |
| FR-005 | AC-005-01 | TC-013 | T0008 |
| FR-005 | AC-005-02 | TC-011 | T0008 |
| FR-005 | AC-005-03 | TC-011 | T0008 |
| FR-006 | AC-006-01 | TC-010 | T0008 |
| FR-006 | AC-006-02 | TC-017 | T0009 |

---

## 4. Test Data Requirements

- **Template fixtures**: The 3 existing feature templates (`requirements.template.json`, `architecture.template.json`, `design.template.json`) serve as structural references for schema comparison (TC-007)
- **Protocol fixtures**: The existing `roundtable-analyst.md` serves as the reference for conversation flow rules comparison
- **No external test data needed**: All tests validate file structure and content against requirements — no mock servers, no test databases

---

## 5. Constitutional Compliance

| Article | How satisfied |
|---------|-------------|
| II (Test-First) | 22 test cases designed before implementation; traces to all 6 FRs and 19 ACs |
| VII (Traceability) | Full traceability matrix in Section 3; every AC has at least one test case |
| IX (Gate Integrity) | Test-strategy.md artifact produced; test cases reference gate requirements |
| XI (Integration Testing) | Not applicable — this feature has no runtime code, no external service calls; all tests are structural validation |
