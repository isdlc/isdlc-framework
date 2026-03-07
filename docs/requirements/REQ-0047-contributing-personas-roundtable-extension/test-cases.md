# Test Cases: Contributing Personas -- Roundtable Extension

**Requirement**: REQ-0047 / GH-108a
**Last Updated**: 2026-03-07
**Total Test Cases**: 94
**AC Coverage**: 65/65 acceptance criteria (100%)
**NFR Coverage**: 5/5 non-functional requirements (100%)

---

## Table of Contents

1. [Unit Tests: M1 Persona Loader](#1-unit-tests-m1-persona-loader)
2. [Unit Tests: M2 Config Reader](#2-unit-tests-m2-config-reader)
3. [Unit Tests: M5 Persona File Schema Validation](#3-unit-tests-m5-persona-file-schema-validation)
4. [Integration Tests: M1+M2 Persona Config Integration](#4-integration-tests-m1m2-persona-config-integration)
5. [Integration Tests: M1+M5 Override-by-Copy](#5-integration-tests-m1m5-override-by-copy)
6. [Integration Tests: M2+Dispatch ROUNDTABLE_CONTEXT](#6-integration-tests-m2dispatch-roundtable_context)
7. [E2E Tests: analyze-item.cjs Hook](#7-e2e-tests-analyze-itemcjs-hook)
8. [E2E Tests: Per-Analysis Override Flags](#8-e2e-tests-per-analysis-override-flags)
9. [Behavioral AC Validation: M3, M4, M6](#9-behavioral-ac-validation-m3-m4-m6)
10. [NFR Tests](#10-nfr-tests)

---

## 1. Unit Tests: M1 Persona Loader

**Test File**: `src/claude/hooks/tests/persona-loader.test.cjs`
**Module**: M1 (Persona Loader)
**Source**: `src/antigravity/analyze-item.cjs` -- `getPersonaPaths()`

### 1.1 Built-in Persona Discovery

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M1-01 | discovers 3 primary personas from agents dir | positive | FR-001, AC-001-01 | Given `src/claude/agents/` contains 3 primary persona files, when `getPersonaPaths()` is called, then all 3 paths are returned |
| TC-M1-02 | discovers contributing personas from agents dir | positive | FR-001, AC-001-01, FR-002, AC-002-01 | Given `src/claude/agents/` also contains `persona-security-reviewer.md`, when called, then it appears in returned paths |
| TC-M1-03 | only matches persona-*.md pattern | positive | FR-001, AC-001-01 | Given agents dir has `persona-foo.md` and `not-a-persona.md`, when called, then only `persona-foo.md` is included |

### 1.2 User Persona Discovery

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M1-04 | discovers personas from .isdlc/personas/ | positive | FR-001, AC-001-01, AC-001-04 | Given `.isdlc/personas/persona-compliance.md` exists with valid frontmatter, when called, then its path is included |
| TC-M1-05 | handles missing .isdlc/personas/ directory | positive | FR-001, AC-001-01 | Given `.isdlc/personas/` does not exist, when called, then returns built-in paths only with no error |
| TC-M1-06 | handles empty .isdlc/personas/ directory | positive | FR-001, AC-001-01 | Given `.isdlc/personas/` exists but is empty, when called, then returns built-in paths only |
| TC-M1-07 | user personas added alongside built-ins | positive | FR-001, AC-001-04 | Given user has `persona-compliance.md` (unique name), when called, then it appears alongside built-in personas |

### 1.3 Override-by-Copy

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M1-08 | user persona overrides built-in with same filename | positive | FR-001, AC-001-03, FR-009, AC-009-01 | Given `.isdlc/personas/persona-security-reviewer.md` exists and `src/claude/agents/persona-security-reviewer.md` also exists, when called, then user path is returned (not built-in) |
| TC-M1-09 | override is full file replacement | positive | FR-009, AC-009-02 | Given user override has different content than built-in, when called, then user file content is used entirely (no merge) |
| TC-M1-10 | primary personas can be overridden | positive | FR-009, AC-009-03 | Given `.isdlc/personas/persona-business-analyst.md` exists, when called, then user path replaces built-in primary persona path |
| TC-M1-11 | override does not duplicate paths | negative | FR-009, AC-009-01 | Given override exists, when called, then the persona appears exactly once in paths (not both built-in and user) |

### 1.4 Malformed File Handling (Fail-Open)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M1-12 | skips persona file with no frontmatter | negative | FR-001, AC-001-02 | Given `.isdlc/personas/persona-bad.md` has no YAML frontmatter, when called, then file is skipped and appears in `skippedFiles` |
| TC-M1-13 | skips persona file with missing name field | negative | FR-001, AC-001-02 | Given persona file has frontmatter but no `name` field, when called, then file is skipped with reason "missing name field" |
| TC-M1-14 | skips persona file with malformed YAML | negative | FR-001, AC-001-02 | Given persona file has invalid YAML (unclosed bracket), when called, then file is skipped, no crash |
| TC-M1-15 | continues loading after skipping bad file | positive | FR-001, AC-001-02, NFR-003 | Given 3 valid and 1 invalid persona file, when called, then 3 valid paths returned and 1 skipped file recorded |
| TC-M1-16 | skippedFiles includes filename and reason | positive | FR-001, AC-001-02 | Given a skipped file, when result is checked, then `skippedFiles[0]` has `filename` and `reason` properties |

### 1.5 Version Drift Detection

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M1-17 | detects version drift on override | positive | FR-010, AC-010-01, AC-010-02 | Given user file has `version: 1.0.0` and built-in has `version: 1.1.0`, when called, then `driftWarnings` contains entry |
| TC-M1-18 | no drift warning when versions match | positive | FR-010, AC-010-02 | Given both files have `version: 1.0.0`, when called, then `driftWarnings` is empty |
| TC-M1-19 | no drift warning when user version is newer | positive | FR-010, AC-010-02 | Given user has `version: 2.0.0` and built-in has `version: 1.0.0`, when called, then no drift warning (user is ahead) |
| TC-M1-20 | skips drift check when user file has no version | positive | FR-010, AC-010-02 | Given user override has no `version` field, when called, then no drift warning (skip check) |
| TC-M1-21 | skips drift check when built-in has no version | positive | FR-010, AC-010-02 | Given built-in has no `version` field, when called, then no drift warning |
| TC-M1-22 | drift warning contains correct fields | positive | FR-010, AC-010-03 | Given drift detected, when warning is checked, then it has `filename`, `userVersion`, `shippedVersion`, `personaName` |

### 1.6 Validation Rules

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M1-23 | defaults role_type to contributing for user personas | positive | FR-002, AC-002-02 | Given user persona has no `role_type`, when loaded, then defaults to `contributing` |
| TC-M1-24 | derives domain from filename when missing | positive | FR-002, AC-002-02 | Given persona `persona-security-reviewer.md` has no `domain` field, when loaded, then domain is derived as "security reviewer" |
| TC-M1-25 | missing triggers treated as empty array | positive | FR-002, AC-002-04 | Given persona has no `triggers` field, when loaded, then treated as `[]` (never auto-proposed) |
| TC-M1-26 | missing owned_skills treated as empty array | positive | FR-007, AC-007-01 | Given persona has no `owned_skills`, when loaded, then treated as `[]` |
| TC-M1-27 | rejects path traversal in filenames | negative | Security | Given `.isdlc/personas/` contains `../../../etc/passwd`, when scanned, then file is skipped |
| TC-M1-28 | handles file read error gracefully | negative | NFR-003 | Given a persona file has restrictive permissions, when called, then file is added to `skippedFiles`, no crash |

---

## 2. Unit Tests: M2 Config Reader

**Test File**: `src/claude/hooks/tests/config-reader.test.cjs`
**Module**: M2 (Config Reader)
**Source**: `src/claude/hooks/lib/common.cjs` -- roundtable config section of `rebuildSessionCache()`

### 2.1 Config File Reading

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M2-01 | reads verbosity from roundtable.yaml | positive | FR-005, AC-005-01, AC-005-02 | Given `.isdlc/roundtable.yaml` has `verbosity: conversational`, when config is read, then verbosity is `conversational` |
| TC-M2-02 | reads default_personas array | positive | FR-005, AC-005-01, AC-005-03 | Given config has `default_personas: [security-reviewer, qa-tester]`, when read, then array is returned |
| TC-M2-03 | reads disabled_personas array | positive | FR-005, AC-005-07 | Given config has `disabled_personas: [ux-reviewer]`, when read, then array is returned |
| TC-M2-04 | defaults when config file missing | positive | FR-005, AC-005-06, NFR-004 | Given no `.isdlc/roundtable.yaml`, when read, then defaults: `{verbosity: 'bulleted', default_personas: [], disabled_personas: []}` |
| TC-M2-05 | defaults when config file is empty | positive | FR-005, AC-005-06 | Given config file is empty, when read, then uses same defaults |

### 2.2 Validation and Error Handling

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M2-06 | rejects invalid verbosity value | negative | FR-005, AC-005-02 | Given `verbosity: loud`, when read, then defaults to `bulleted` |
| TC-M2-07 | rejects non-string verbosity | negative | FR-005, AC-005-02 | Given `verbosity: 42`, when read, then defaults to `bulleted` |
| TC-M2-08 | rejects non-array default_personas | negative | FR-005, AC-005-03 | Given `default_personas: "security"`, when read, then defaults to `[]` |
| TC-M2-09 | rejects non-array disabled_personas | negative | FR-005, AC-005-07 | Given `disabled_personas: true`, when read, then defaults to `[]` |
| TC-M2-10 | handles malformed YAML gracefully | negative | NFR-003, NFR-004 | Given config file has invalid YAML, when read, then uses defaults, no crash |
| TC-M2-11 | ignores unknown keys | positive | FR-005 | Given config has `unknown_field: value`, when read, then parses without error (forward-compatible) |

### 2.3 Conflict Resolution

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M2-12 | disabled_personas wins over default_personas | positive | FR-005, AC-005-07 | Given `security-reviewer` in both default and disabled, when resolved, then it is excluded (disabled wins) |
| TC-M2-13 | default_personas items not in disabled pass through | positive | FR-005, AC-005-03 | Given `qa-tester` in defaults only, when resolved, then `qa-tester` is in effective defaults |

### 2.4 Context Injection

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M2-14 | injects ROUNDTABLE_CONFIG section | positive | FR-005, AC-005-04 | Given config is loaded, when session cache is built, then output contains `ROUNDTABLE_CONFIG` section |
| TC-M2-15 | config section includes verbosity | positive | FR-005, AC-005-04 | Given verbosity is `bulleted`, then config section contains `verbosity: bulleted` |
| TC-M2-16 | config section includes default_personas | positive | FR-005, AC-005-04 | Given defaults `[security-reviewer]`, then config section contains the list |
| TC-M2-17 | config section includes disabled_personas | positive | FR-005, AC-005-04, AC-005-07 | Given disabled `[ux-reviewer]`, then config section contains the list |

### 2.5 Per-Analysis Override Flags

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M2-18 | --verbose flag overrides verbosity to conversational | positive | FR-011, AC-011-01 | Given config has `verbosity: bulleted` and `--verbose` flag is set, when resolved, then verbosity is `conversational` |
| TC-M2-19 | --silent flag overrides verbosity to silent | positive | FR-011, AC-011-02 | Given `--silent` flag, when resolved, then verbosity is `silent` |
| TC-M2-20 | per-analysis overrides do not modify config file | positive | FR-011, AC-011-05 | Given `--verbose` flag, when applied, then `.isdlc/roundtable.yaml` file content is unchanged |

---

## 3. Unit Tests: M5 Persona File Schema Validation

**Test File**: `src/claude/hooks/tests/persona-schema-validation.test.cjs`
**Module**: M5 (Contributing Persona Files)
**Source**: `src/claude/agents/persona-*.md`

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-M5-01 | all 5 contributing persona files exist | positive | FR-002, AC-002-01 | Verify files exist: persona-security-reviewer.md, persona-qa-tester.md, persona-ux-reviewer.md, persona-devops-reviewer.md, persona-domain-expert.md |
| TC-M5-02 | each contributing persona has role_type: contributing | positive | FR-002, AC-002-02 | Parse frontmatter, verify `role_type: contributing` |
| TC-M5-03 | each contributing persona has owned_skills array | positive | FR-002, AC-002-03, FR-007, AC-007-01 | Parse frontmatter, verify `owned_skills` is an array |
| TC-M5-04 | each contributing persona has triggers array | positive | FR-002, AC-002-04 | Parse frontmatter, verify `triggers` is a non-empty array |
| TC-M5-05 | each shipped persona is under 40 lines | positive | FR-002, AC-002-05, NFR-002 | Count lines, verify < 40 for each shipped persona |
| TC-M5-06 | domain expert template has placeholder content | positive | FR-002, AC-002-06 | Verify persona-domain-expert.md has blank/placeholder fields |
| TC-M5-07 | domain expert has inline authoring guidance | positive | FR-002, AC-002-07 | Verify template contains guidance about triggers, voice rules, context window trade-offs |
| TC-M5-08 | security reviewer has correct triggers | positive | FR-002, AC-002-04 | Verify triggers include: authentication, authorization, encryption, OWASP |
| TC-M5-09 | qa tester has correct triggers | positive | FR-002, AC-002-04 | Verify triggers include: test, coverage, regression, edge case |
| TC-M5-10 | each persona has version field | positive | FR-010, AC-010-01 | Parse frontmatter, verify `version` field exists |
| TC-M5-11 | each persona has valid semver version | positive | FR-010, AC-010-01 | Verify version matches semver pattern |
| TC-M5-12 | all persona frontmatter parses as valid YAML | positive | FR-002, AC-002-01 | Attempt YAML parse on each file's frontmatter block |

---

## 4. Integration Tests: M1+M2 Persona Config Integration

**Test File**: `src/claude/hooks/tests/persona-config-integration.test.cjs`
**Modules**: M1 (Persona Loader) + M2 (Config Reader)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-INT-01 | default_personas are always included in effective roster | positive | FR-005, AC-005-03, FR-003, AC-003-01 | Given config defaults `[security-reviewer]` and persona file exists, when roster is computed, then security-reviewer is in the effective list |
| TC-INT-02 | disabled_personas excluded from auto-detection | positive | FR-005, AC-005-07 | Given `disabled_personas: [ux-reviewer]` and ux-reviewer persona exists, when auto-detection runs, then ux-reviewer is excluded |
| TC-INT-03 | disabled beats default in conflict | positive | FR-005, AC-005-07 | Given persona in both default and disabled arrays, when resolved, then persona is excluded |
| TC-INT-04 | config missing defaults to bulleted with no defaults/disabled | positive | FR-005, AC-005-06, NFR-004 | Given no roundtable.yaml, when full pipeline runs, then verbosity=bulleted, defaults=[], disabled=[] |
| TC-INT-05 | all personas loaded when no config file | positive | NFR-004 | Given no config file and multiple persona files exist, when pipeline runs, then all persona files are available |
| TC-INT-06 | per-analysis --personas overrides disabled list | positive | FR-011, AC-011-03 | Given `--personas security` and `disabled_personas: [security-reviewer]`, when resolved, then security-reviewer IS included (explicit override) |
| TC-INT-07 | per-analysis --personas skips roster proposal | positive | FR-011, AC-011-03, FR-003 | Given `--personas security,compliance`, when set, then `ROUNDTABLE_PRESELECTED_ROSTER` is populated |
| TC-INT-08 | backward compat: no personas dir, no config = original 3 primaries | positive | NFR-004 | Given pristine project with no `.isdlc/personas/` and no `.isdlc/roundtable.yaml`, when pipeline runs, then exactly 3 primary persona paths returned (+ any new built-in contributing personas from agents dir) |
| TC-INT-09 | user persona + config default + built-in = merged roster | positive | FR-001, FR-005 | Given user persona, config defaults, and built-in personas, when merged, then all unique personas present |
| TC-INT-10 | skipped files passed through to dispatch context | positive | FR-001, AC-001-02, FR-003, AC-003-09 | Given a malformed persona file, when pipeline completes, then skipped file info is available for roster proposal |

---

## 5. Integration Tests: M1+M5 Override-by-Copy

**Test File**: `src/claude/hooks/tests/persona-override-integration.test.cjs`
**Modules**: M1 (Persona Loader) + M5 (Persona Files)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-OVR-01 | user security reviewer overrides built-in | positive | FR-009, AC-009-01 | Given user has `persona-security-reviewer.md` in `.isdlc/personas/`, when loaded, then user file path is used |
| TC-OVR-02 | override is full replacement (no merge) | positive | FR-009, AC-009-02 | Given user override with different triggers, when loaded, then only user triggers are active |
| TC-OVR-03 | drift warning on override with older version | positive | FR-010, AC-010-02, AC-010-03 | Given user has v1.0.0 and built-in has v1.1.0, when loaded, then drift warning emitted |
| TC-OVR-04 | analysis proceeds with user version despite drift | positive | FR-010, AC-010-04 | Given drift warning, when paths are resolved, then user path is still the active path |
| TC-OVR-05 | primary persona override works | positive | FR-009, AC-009-03 | Given user overrides `persona-business-analyst.md`, when loaded, then user version is used for Maya |
| TC-OVR-06 | override + no version in user = no drift warning | positive | FR-010 | Given user override has no version field, when loaded, then no drift warning generated |
| TC-OVR-07 | multiple overrides in same project | positive | FR-009, AC-009-01 | Given user overrides 2 different personas, when loaded, then both user versions used |
| TC-OVR-08 | override with malformed user file = skip + keep built-in | negative | FR-001, AC-001-02, FR-009 | Given user override has invalid YAML, when loaded, then built-in version is used and user file appears in skippedFiles |

---

## 6. Integration Tests: M2+Dispatch ROUNDTABLE_CONTEXT

**Test File**: `src/claude/hooks/tests/roundtable-context-integration.test.cjs`
**Modules**: M2 (Config Reader) + ROUNDTABLE_CONTEXT builder in `common.cjs`

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-CTX-01 | ROUNDTABLE_CONTEXT includes all activated persona sections | positive | FR-001, AC-001-01 | Given 3 primary + 2 contributing personas loaded, when context is built, then 5 persona sections present |
| TC-CTX-02 | ROUNDTABLE_CONFIG sub-section present in context | positive | FR-005, AC-005-04 | Given roundtable.yaml exists, when context is built, then ROUNDTABLE_CONFIG section is embedded |
| TC-CTX-03 | DRIFT_WARNINGS sub-section present when drift detected | positive | FR-010, AC-010-03 | Given version drift, when context is built, then DRIFT_WARNINGS section lists the drifted persona |
| TC-CTX-04 | ROUNDTABLE_SKIPPED_FILES sub-section present | positive | FR-003, AC-003-09 | Given skipped files, when context is built, then SKIPPED_FILES section lists them |
| TC-CTX-05 | silent mode suppresses DRIFT_WARNINGS from context | positive | FR-004, AC-004-09, FR-010, AC-010-05 | Given silent verbosity and drift exists, when context built, then drift warnings not in user-facing context |
| TC-CTX-06 | user persona content appears in context (not built-in) when overridden | positive | FR-009, AC-009-01 | Given override, when context built, then persona section contains user file content |

---

## 7. E2E Tests: analyze-item.cjs Hook

**Test File**: `src/claude/hooks/tests/persona-e2e.test.cjs`
**Scope**: Full hook execution as child process

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-E2E-01 | hook returns persona paths including contributing personas | positive | FR-001, FR-002 | Spawn analyze-item.cjs with project containing contributing personas, verify output JSON has all paths |
| TC-E2E-02 | hook returns drift warnings in output | positive | FR-010, AC-010-02 | Spawn with override that has version drift, verify driftWarnings in output |
| TC-E2E-03 | hook returns skipped files in output | positive | FR-001, AC-001-02 | Spawn with malformed persona file, verify skippedFiles in output |
| TC-E2E-04 | hook handles no .isdlc/personas/ gracefully | positive | NFR-004 | Spawn without personas dir, verify no error, original paths returned |
| TC-E2E-05 | hook loads roundtable config into context | positive | FR-005, AC-005-04 | Spawn with roundtable.yaml, verify config values in output |
| TC-E2E-06 | hook handles concurrent persona loading | positive | NFR-001 | Spawn hook, verify it completes within 500ms with 10 persona files |

---

## 8. E2E Tests: Per-Analysis Override Flags

**Test File**: `src/claude/hooks/tests/per-analysis-flags-e2e.test.cjs`
**Scope**: CLI flag parsing in analyze-item.cjs

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-FLAG-01 | --verbose sets verbosity to conversational | positive | FR-011, AC-011-01 | Given `--verbose` in args, when hook runs, then output verbosity is `conversational` |
| TC-FLAG-02 | --silent sets verbosity to silent | positive | FR-011, AC-011-02 | Given `--silent` in args, when hook runs, then output verbosity is `silent` |
| TC-FLAG-03 | --personas pre-selects roster | positive | FR-011, AC-011-03 | Given `--personas security,qa` in args, when hook runs, then `ROUNDTABLE_PRESELECTED_ROSTER` contains both |
| TC-FLAG-04 | conflicting --verbose --silent: last wins | negative | FR-011, AC-011-01, AC-011-02 | Given both flags, when parsed, then last flag determines verbosity |

---

## 9. Behavioral AC Validation: M3, M4, M6

These acceptance criteria are for agent behaviors defined in `roundtable-analyst.md` (markdown instructions, not executable code). They cannot be automated as unit tests. Instead, they are validated through:
1. Manual verification during roundtable sessions
2. The AC trace in the traceability matrix ensures nothing is missed
3. Integration test coverage of the supporting data pipeline (persona loading, config reading) ensures the agent receives correct inputs

### 9.1 M3: Roster Proposer (FR-003)

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-003-01 | Framework matches keywords against triggers | Verified indirectly via TC-INT-01 (data pipeline provides triggers to agent) |
| AC-003-02 | Framework presents proposed roster | Manual: observe roundtable output |
| AC-003-03 | User can add/remove from roster | Manual: interactive session |
| AC-003-04 | Amended roster respected for session | Manual: observe analysis uses amended roster |
| AC-003-05 | Proposal includes domains without persona file | Manual: verify message suggests creating file |
| AC-003-06 | Uncertain matches flagged | Manual: verify "also considering" phrasing |
| AC-003-07 | Framework asks when in doubt | Manual: verify question for uncertain domains |
| AC-003-08 | Roster skipped in silent mode | Verified via TC-CTX-05 (silent mode config suppresses roster data) |
| AC-003-09 | Skipped files mentioned in proposal | Verified via TC-INT-10, TC-CTX-04 (skipped files passed to agent context) |
| AC-003-10 | All available personas shown | Manual: verify "Also available" section |

### 9.2 M4: Verbosity Renderer (FR-004)

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-004-01 | Conversational mode: natural dialogue | Manual: set conversational, observe format |
| AC-004-02 | Bulleted mode: labeled conclusion bullets | Manual: set bulleted, observe format |
| AC-004-03 | Bulleted mode: no cross-talk | Manual: verify no inter-persona dialogue |
| AC-004-04 | Silent mode: no persona framing | Manual: set silent, verify no persona names |
| AC-004-05 | Silent mode: persona files still loaded internally | Verified via test pipeline: personas in paths even when silent |
| AC-004-06 | Silent mode: mid-conversation invitation disabled | Manual: observe no persona announcements |
| AC-004-07 | Verbosity is rendering-only | Architecture validation: persona files unchanged by mode |
| AC-004-08 | Default is bulleted | Verified via TC-M2-04 (config default is bulleted) |
| AC-004-09 | Silent mode suppresses drift notifications | Verified via TC-CTX-05 |

### 9.3 M6: Late-Join Handler (FR-006)

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-006-01 | Lead detects topic shift | Manual: during roundtable |
| AC-006-02 | Lead reads persona file on demand | Verified via M1 loader availability (personas always loadable) |
| AC-006-03 | Lead announces new persona | Manual: observe announcement |
| AC-006-04 | Late-joined persona contributes | Manual: observe contribution |
| AC-006-05 | Silent mode: late-join suppressed | Manual: verify no announcement in silent mode |

### 9.4 FR-007: Skill Wiring

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-007-01 | owned_skills in frontmatter | Verified via TC-M5-03 |
| AC-007-02 | Skills loaded during analysis | Manual: verify skill availability |
| AC-007-03 | Skill observability logging | Manual: check skill_usage_log entries |

### 9.5 FR-008: Output Integration

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-008-01 | Observations folded into existing artifacts | Manual: review artifact content |
| AC-008-02 | No new artifact files from contributing personas | Manual: check output files |
| AC-008-03 | Contributing personas not in confirmation sequence | Manual: observe confirmation |
| AC-008-04 | Attribution in conversational/bulleted modes | Manual: observe labels |
| AC-008-05 | No attribution in silent mode | Manual: verify unified output |

### 9.6 FR-005: CLAUDE.md Reference

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-005-05 | CLAUDE.md references roundtable config | Grep test: verify CLAUDE.md contains reference |
| AC-005-08 | .isdlc/personas/ not gitignored | Verified via gitignore check in integration tests |

### 9.7 FR-011: Natural Language Override

| AC | Description | Validation Method |
|----|-------------|-------------------|
| AC-011-04 | Natural language "switch to conversational" honored | Manual: during roundtable session |

---

## 10. NFR Tests

Included in unit test files:

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-NFR-01 | persona loading completes within 500ms for 10 files | positive | NFR-001 | Create 10 persona files, time getPersonaPaths(), assert < 500ms |
| TC-NFR-02 | shipped persona files under 40 lines each | positive | NFR-002 | Count lines of each shipped contributing persona |
| TC-NFR-03 | malformed persona file does not crash loader | positive | NFR-003 | Already covered by TC-M1-12 through TC-M1-16 |
| TC-NFR-04 | project without personas dir works identically | positive | NFR-004 | Already covered by TC-M1-05, TC-M2-04, TC-INT-04 |
| TC-NFR-05 | .isdlc/personas/ is not gitignored | positive | NFR-005, AC-005-08 | Read `.gitignore`, verify no pattern matches `.isdlc/personas/` |
