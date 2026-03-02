# Test Data Plan: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Test Data Categories

This feature requires three categories of test data:

1. **BACKLOG.md fixtures** -- sample markdown files in various states for parsing tests
2. **Validation rule examples** -- valid/invalid inputs from `validation-rules.json`
3. **Menu halt enforcer inputs** -- Task output strings for hook regression tests

No MCP mock data is needed since MCP interactions are prompt-driven (see Section 4).

---

## 2. BACKLOG.md Fixtures

These are in-memory string constants used by content verification tests. No fixture files are needed on disk since the tests read production files directly.

### 2.1 Valid BACKLOG.md Structure (for VR-008 tests)

```markdown
# Project Backlog

## Open

### High Priority

- 1.1 [ ] Authentication system -- implement OAuth2 login
  - **Jira:** AUTH-100
  - **Priority:** High
  - **Confluence:** https://wiki.example.com/pages/auth-spec

- 1.2 [ ] Local-only task -- no Jira integration

### Medium Priority

- 2.1 [~] In-progress item -- currently being worked on
  - **Jira:** PROJ-200
  - **Priority:** Medium

## Completed

- 0.1 [x] Initial setup -- project scaffolding
  - **Jira:** PROJ-001
  - **Completed:** 2026-01-15
```

### 2.2 Jira-Backed Item Block (for VR-001, VR-002, VR-010)

```markdown
- 7.7 [ ] Backlog management integration -- curated local BACKLOG.md backed by Jira
  - **Jira:** PROJ-1234
  - **Priority:** High
  - **Confluence:** https://wiki.example.com/pages/spec-123
  - **Status:** To Do
```

### 2.3 Local-Only Item Block (for VR-010 negative case)

```markdown
- 3.1 [ ] Improve error messages -- make CLI errors more descriptive
```

### 2.4 Completed Item Block (for VR-013, VR-015)

```markdown
- 0.5 [x] Add user authentication -- OAuth2 support
  - **Jira:** AUTH-100
  - **Priority:** High
  - **Completed:** 2026-02-14
```

### 2.5 Malformed Items (for VR-001 negative cases)

```
- [ ] Missing item number
- 7.7 Backlog item without checkbox
7.7 [ ] Missing leading dash
- 7.7[] No space in checkbox
```

### 2.6 Malformed Metadata (for VR-002 negative cases)

```
  - Jira: PROJ-1234          (missing bold markers)
  - **Jira** PROJ-1234        (missing colon after bold)
- **Jira:** PROJ-1234          (wrong indent - only 0 spaces)
```

---

## 3. Validation Rule Test Data

All validation data comes from the `examples` fields in `validation-rules.json`. The test file loads this JSON and iterates over `valid` and `invalid` arrays for each rule.

### 3.1 Data Loading Strategy

```javascript
const validationRules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'docs',
    'requirements', 'REQ-0008-backlog-management-integration',
    'validation-rules.json'), 'utf8')
);
```

### 3.2 Regex Rules with Examples (VR-001, VR-002, VR-003, VR-004, VR-013)

Each regex rule has explicit `examples.valid` and `examples.invalid` arrays in the JSON. Tests iterate over both arrays and assert match/no-match.

### 3.3 Enum Rules (VR-005, VR-012, VR-018)

These rules have `allowed_values` or `rules` objects. Tests verify:
- All enum values are recognized
- At least one known value from each category

### 3.4 Numeric Rules (VR-006, VR-007, VR-014)

These rules have `max_length` or `max_items` values. Tests verify:
- Boundary: exactly at limit (passes)
- Boundary: one character over limit (triggers truncation or overflow)
- Well under limit (passes without modification)

---

## 4. MCP Mock Strategy

### 4.1 No Runtime MCP Mocking Required

This feature uses **prompt-driven MCP delegation** (ADR-0001). The LLM reads CLAUDE.md instructions and executes MCP tool calls at runtime. There is no framework JavaScript code that calls MCP APIs.

Therefore:
- **No MCP mock library** is needed
- **No HTTP interception** is needed
- **No test doubles** for MCP server

### 4.2 What Is Verified Instead

MCP behavior is verified indirectly through content verification:

| MCP Concern | Test Approach | Verification |
|-------------|--------------|-------------|
| MCP prerequisite check | Read CLAUDE.md.template | Contains MCP check flow instructions |
| MCP setup command | Read CLAUDE.md.template | Contains `claude mcp add` command |
| getTicket interface | Read CLAUDE.md.template | Adapter interface documents getTicket |
| updateStatus interface | Read CLAUDE.md.template | Adapter interface documents updateStatus |
| getLinkedDocument interface | Read CLAUDE.md.template | Adapter interface documents getLinkedDocument |
| Auth error handling | Read CLAUDE.md.template | Contains BLG-E002 error handling flow |
| Network error handling | Read CLAUDE.md.template | Contains BLG-E003 error handling flow |
| Non-blocking sync | Read orchestrator | Contains non-blocking finalize instructions |
| Confluence context pull | Read requirements analyst | Contains MCP call instructions |

### 4.3 Manual E2E Verification (Not Automated)

The following MCP scenarios require manual verification with a live Atlassian MCP server during the quality loop phase (Phase 16):

1. Add a real Jira ticket to BACKLOG.md via natural language
2. Refresh a backlog with live Jira data
3. Complete a workflow and verify Jira status sync
4. Pull Confluence page content as requirements context
5. Verify graceful degradation when MCP is not configured
6. Verify auth-expired error message

These are documented here for Phase 16 but are NOT automated tests.

---

## 5. Menu Halt Enforcer Test Data

### 5.1 Backlog Picker with Jira Suffixes (TC-M5-01)

```javascript
const pickerWithJira = [
  '[1] Auth system [Jira: PROJ-1234]',
  '[2] Local item',
  '[O] Other',
  'A'.repeat(250)  // Extra text (violation)
].join('\n');
```

### 5.2 Mixed Jira and Local Items (TC-M5-02)

```javascript
const mixedPicker = [
  '[1] Jira feature [Jira: ABC-100]',
  '[2] Local only task',
  '[3] Another [Jira: XY-5]',
  '[O] Other',
  'A'.repeat(250)  // Extra text (violation)
].join('\n');
```

### 5.3 Clean Stop (TC-M5-03, no violation)

```javascript
const cleanPicker = [
  '[1] Auth system [Jira: PROJ-1234]',
  '[2] Local item',
  '[O] Other'
].join('\n');
```

---

## 6. Test Data Generation Approach

| Category | Generation Method | Maintenance |
|----------|------------------|------------|
| BACKLOG.md fixtures | Inline string constants in test files | Updated when format changes |
| Validation examples | Loaded from `validation-rules.json` | Single source of truth |
| Menu halt inputs | Inline string constants in test files | Updated when picker format changes |
| File content assertions | Read production files directly | Always current |

### Key Principle: No Separate Fixture Files

All test data is either:
1. **Inline in test files** (small strings, menu outputs)
2. **Loaded from production files** (`validation-rules.json`, `CLAUDE.md.template`, agent files)

This avoids fixture file drift and ensures tests verify actual production content.
