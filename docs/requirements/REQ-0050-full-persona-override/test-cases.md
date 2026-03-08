# Test Cases: Full Persona Override

**Requirement**: REQ-0050 / GH-108b
**Last Updated**: 2026-03-08
**Total Automated Test Cases**: 83
**Behavioral Validations**: 8
**AC Coverage**: 41/41 acceptance criteria (100%)

---

## Table of Contents

1. [Unit Tests: M1 Mode Selection](#1-unit-tests-m1-mode-selection)
2. [Unit Tests: M2 Persona Loader -- Remove Primary Forcing](#2-unit-tests-m2-persona-loader----remove-primary-forcing)
3. [Unit Tests: M3 Config as Pre-population](#3-unit-tests-m3-config-as-pre-population)
4. [Unit Tests: M6 Documentation Validation](#4-unit-tests-m6-documentation-validation)
5. [Integration Tests: M1+M2 Mode + Persona Discovery](#5-integration-tests-m1m2-mode--persona-discovery)
6. [Integration Tests: M2+M3 No-Primary-Forcing + Config Pre-population](#6-integration-tests-m2m3-no-primary-forcing--config-pre-population)
7. [Integration Tests: M1+M5 Mode Dispatch Context](#7-integration-tests-m1m5-mode-dispatch-context)
8. [E2E Tests: Mode Selection End-to-End](#8-e2e-tests-mode-selection-end-to-end)
9. [Behavioral AC Validation](#9-behavioral-ac-validation)

---

## 1. Unit Tests: M1 Mode Selection

**Test File**: `src/claude/hooks/tests/mode-selection.test.cjs`
**Module**: M1 (analyze-item.cjs mode selection logic)

### 1.1 Mode Selection Flag Parsing

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-MS-01 | default mode when no flags passed | positive | AC-001-01 | Given no mode flags, when parseArgs() is called, then `mode` is null (framework will ask user) |
| TC-MS-02 | --no-roundtable sets no-persona mode | positive | AC-001-07 | Given `--no-roundtable` flag, when parseArgs() is called, then `mode` is `no-personas` |
| TC-MS-03 | --silent sets personas+silent mode | positive | AC-001-05 | Given `--silent` flag, when parseArgs() is called, then `mode` is `personas` and `verbosity` is `silent` |
| TC-MS-04 | --personas sets with-personas mode | positive | AC-001-06 | Given `--personas "security,devops"` flag, when parseArgs() is called, then `mode` is `personas` and `preselected` contains the list |
| TC-MS-05 | --verbose sets personas+conversational | positive | AC-002-04 | Given `--verbose` flag, when parseArgs() is called, then `verbosity` is `conversational` |
| TC-MS-06 | --no-roundtable skips mode question entirely | positive | AC-001-07 | Given `--no-roundtable`, when dispatch context is built, then `analysis_mode` is `no-personas` and no persona paths are included |

### 1.2 Mode Selection Dispatch Context

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-MS-07 | dispatch context includes analysis_mode field | positive | AC-001-02, AC-001-03 | Given mode is determined, when dispatch context is assembled, then `analysis_mode` field is present |
| TC-MS-08 | no-persona dispatch has zero persona_paths | positive | AC-004-01 | Given mode is `no-personas`, when dispatch context is assembled, then `persona_paths` is empty array |
| TC-MS-09 | with-personas dispatch includes active_roster | positive | AC-001-03, AC-003-01 | Given mode is `personas`, when dispatch context is assembled, then `active_roster` field lists selected personas |
| TC-MS-10 | dispatch context includes verbosity_choice | positive | AC-002-03 | Given verbosity is chosen, when dispatch context is assembled, then `verbosity_choice` field matches |

### 1.3 Flag Interactions

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-MS-11 | --silent and --verbose are mutually exclusive (last wins) | negative | AC-001-05, AC-002-04 | Given both `--silent` and `--verbose`, when parseArgs() is called, then last flag wins |
| TC-MS-12 | --no-roundtable overrides --personas | negative | AC-001-07 | Given both `--no-roundtable` and `--personas`, when parseArgs() is called, then mode is `no-personas` |
| TC-MS-13 | --personas with empty string is treated as no pre-selection | negative | AC-001-06 | Given `--personas ""`, when parseArgs() is called, then preselected is empty (framework recommends) |
| TC-MS-14 | --light flag preserved alongside mode flags | positive | AC-001-05, AC-001-06 | Given `--light --silent`, when parseArgs() is called, then both `light` and `silent` flags are true |

### 1.4 No-Persona Analysis Path

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-MS-15 | no-persona mode skips persona file loading | positive | AC-004-01 | Given mode is `no-personas`, when analysis runs, then getPersonaPaths() is NOT called |
| TC-MS-16 | no-persona mode produces all standard artifacts | positive | AC-004-03 | Given mode is `no-personas`, when dispatch context is checked, then artifact_types includes all 4 standard artifacts |
| TC-MS-17 | no-persona mode records analysis_mode in meta | positive | AC-004-05 | Given mode is `no-personas`, when meta.json is written, then `analysis_mode` field is `no-personas` |
| TC-MS-18 | no-persona mode excludes persona voice from context | positive | AC-004-02, AC-004-04 | Given mode is `no-personas`, when dispatch context is checked, then no PERSONA_CONTEXT section exists |

### 1.5 Conversational UX Requirements

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-MS-19 | mode question is conversational not numbered menu | positive | AC-001-04 | Given no flags, when mode selection prompt is generated, then it uses conversational phrasing (no numbered list) |
| TC-MS-20 | verbosity question presents three options | positive | AC-002-01 | Given personas mode chosen, when verbosity prompt is generated, then three options are listed: conversational, bulleted, silent |
| TC-MS-21 | roster proposal shows recommended and available | positive | AC-003-04 | Given personas mode, when roster proposal is generated, then output has recommended, uncertain, and available sections |
| TC-MS-22 | removing all personas falls back to no-persona mode | positive | AC-003-06 | Given user removes all personas from roster, when confirmed, then framework switches to no-persona mode |

---

## 2. Unit Tests: M2 Persona Loader -- Remove Primary Forcing

**Test File**: `src/claude/hooks/tests/persona-loader.test.cjs` (extend existing)
**Module**: M2 (persona-loader.cjs modifications)

### 2.1 PRIMARY_PERSONAS Constant Removal

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-PL-01 | PRIMARY_PERSONAS constant no longer forces inclusion | positive | AC-005-01 | Given no primary persona files in agents dir, when getPersonaPaths() is called, then paths is empty (no forced inclusion) |
| TC-PL-02 | primary personas included only when files exist | positive | AC-005-01, AC-005-03 | Given only 2 of 3 primary persona files exist, when getPersonaPaths() is called, then only 2 paths returned |
| TC-PL-03 | all personas treated equally in discovery | positive | AC-003-01 | Given 2 primary and 3 contributing personas, when getPersonaPaths() is called, then all 5 returned without preference ordering |
| TC-PL-04 | user can remove a primary persona by not including it | positive | AC-003-02 | Given active_roster excludes business-analyst, when roster is filtered, then business-analyst path is excluded from final list |

### 2.2 Dynamic Roster Filtering

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-PL-05 | getPersonaPaths returns all available personas | positive | AC-003-01, AC-005-06 | Given 8 persona files (3 primary + 5 contributing), when called, then all 8 paths returned |
| TC-PL-06 | persona paths can be filtered by active_roster | positive | AC-003-02, AC-003-05 | Given getPersonaPaths() returns 8 paths and active_roster is ["security-reviewer", "devops-engineer"], when filtered, then only 2 paths remain |
| TC-PL-07 | empty active_roster returns empty paths | positive | AC-003-06 | Given active_roster is empty, when filtered, then paths is empty |
| TC-PL-08 | trigger keyword matching returns persona names | positive | AC-003-03 | Given issue content contains "security" and "authentication", when trigger matching runs, then security-reviewer is recommended |
| TC-PL-09 | disabled_personas excluded from recommendation | positive | AC-003-07 | Given disabled_personas includes "ux-reviewer", when recommendations are built, then ux-reviewer is not in recommended list |
| TC-PL-10 | disabled_personas still available for manual add | positive | AC-003-07 | Given disabled_personas includes "ux-reviewer", when available personas are listed, then ux-reviewer appears in available section |

---

## 3. Unit Tests: M3 Config as Pre-population

**Test File**: `src/claude/hooks/tests/roundtable-config-prepopulate.test.cjs`
**Module**: M3 (roundtable-config.cjs modifications)

### 3.1 Verbosity Pre-population

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-CP-01 | verbosity from config is returned as pre-selection | positive | AC-006-01 | Given roundtable.yaml has `verbosity: conversational`, when readRoundtableConfig() is called, then result.verbosity is `conversational` and result.is_preselection is true |
| TC-CP-02 | verbosity flag overrides config pre-selection | positive | AC-002-04 | Given config has `verbosity: bulleted` and `--silent` flag, when called with overrides, then verbosity is `silent` |
| TC-CP-03 | missing config defaults to bulleted pre-selection | positive | AC-006-05 | Given no roundtable.yaml exists, when called, then verbosity is `bulleted` |
| TC-CP-04 | invalid verbosity value falls back to bulleted | negative | AC-006-04 | Given config has `verbosity: invalid_value`, when called, then verbosity is `bulleted` |

### 3.2 Default Personas Pre-population

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-CP-05 | default_personas pre-populate recommendation | positive | AC-006-02, AC-003-08 | Given config has `default_personas: [security-reviewer]`, when called, then result.default_personas includes security-reviewer |
| TC-CP-06 | default_personas are recommendations not forced | positive | AC-006-02, AC-003-02 | Given config has default_personas, when result is used, then is_preselection flag is true (user still asked) |
| TC-CP-07 | empty default_personas results in framework-only recommendations | positive | AC-006-05 | Given config has `default_personas: []`, when called, then result.default_personas is empty |
| TC-CP-08 | missing default_personas defaults to 3 primaries recommended | positive | AC-006-05 | Given no config file, when called, then framework recommends 3 primaries by default |

### 3.3 Disabled Personas Pre-population

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-CP-09 | disabled_personas excluded from recommendations | positive | AC-006-03, AC-003-07 | Given config has `disabled_personas: [ux-reviewer]`, when recommendations are built, then ux-reviewer excluded |
| TC-CP-10 | disabled_personas still shown in available list | positive | AC-006-03, AC-003-07 | Given disabled persona, when roster proposal is generated, then persona appears under "available" |
| TC-CP-11 | disabled beats default in conflict | positive | AC-006-03 | Given same persona in both default and disabled, when called, then persona is excluded from recommendation |
| TC-CP-12 | disabled_personas can be overridden by user | positive | AC-003-07 | Given disabled persona, when user explicitly adds it to roster, then it is included in active_roster |

### 3.4 Backward Compatibility

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-CP-13 | existing roundtable.yaml works without modification | positive | AC-006-04 | Given a REQ-0047-era roundtable.yaml with verbosity and default_personas, when called, then all fields are read correctly |
| TC-CP-14 | config with unknown keys is not rejected | positive | AC-006-04 | Given roundtable.yaml has extra unrecognized keys, when called, then known keys are parsed, unknown keys ignored |
| TC-CP-15 | malformed YAML returns sensible defaults | negative | AC-006-04 | Given roundtable.yaml has broken YAML, when called, then defaults are returned (bulleted, empty lists) |
| TC-CP-16 | config read error returns sensible defaults | negative | AC-006-05 | Given roundtable.yaml is unreadable, when called, then defaults are returned gracefully |

---

## 4. Unit Tests: M6 Documentation Validation

**Test File**: `src/claude/hooks/tests/persona-authoring-docs.test.cjs` (optional)
**Module**: M6 (persona-authoring-guide.md)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-DOC-01 | documentation covers creating from template | positive | AC-007-01 | Given persona-authoring-guide.md exists, when content is checked, then it contains section on creating from Domain Expert template |
| TC-DOC-02 | documentation covers overriding built-in | positive | AC-007-02 | Given guide exists, then it contains section on copy-to-.isdlc/personas and modify |
| TC-DOC-03 | documentation covers disabling via config | positive | AC-007-03 | Given guide exists, then it contains section on roundtable.yaml disabled_personas |
| TC-DOC-04 | documentation covers four analysis modes | positive | AC-007-04 | Given guide exists, then it documents: conversational, bulleted, silent, no-personas |
| TC-DOC-05 | documentation covers frontmatter schema | positive | AC-007-05 | Given guide exists, then it documents: name, description, role_type, triggers, owned_skills, version |
| TC-DOC-06 | documentation is linked from discoverable location | positive | AC-007-06 | Given guide exists, then README or CLAUDE.md contains a link to it |

---

## 5. Integration Tests: M1+M2 Mode + Persona Discovery

**Test File**: `src/claude/hooks/tests/persona-config-integration.test.cjs` (extend existing)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-INT-50-01 | no-persona mode skips getPersonaPaths entirely | positive | AC-004-01, AC-001-02 | Given mode is `no-personas`, when integration flow runs, then getPersonaPaths is not called and persona_paths is empty |
| TC-INT-50-02 | personas mode loads all available personas for recommendation | positive | AC-003-01, AC-001-03 | Given mode is `personas`, when flow runs, then all built-in + user personas are discovered |
| TC-INT-50-03 | --personas flag pre-selects specific personas | positive | AC-001-06, AC-003-05 | Given `--personas security-reviewer,devops`, when flow runs, then active_roster contains exactly those personas |
| TC-INT-50-04 | primary personas are recommended but not forced | positive | AC-003-02, AC-005-01 | Given mode is `personas` with no pre-selection, when roster is proposed, then 3 primaries are in recommended (not forced) |
| TC-INT-50-05 | trigger matching adds contributing personas | positive | AC-003-03 | Given issue content about "security", when roster is proposed, then security-reviewer is in recommended alongside primaries |
| TC-INT-50-06 | user persona discovered alongside built-ins | positive | AC-003-01 | Given user persona in `.isdlc/personas/`, when flow runs, then it appears in available personas |
| TC-INT-50-07 | config default_personas included in recommendation | positive | AC-003-08, AC-006-02 | Given config has default_personas, when roster is proposed, then config defaults are included in recommendation |
| TC-INT-50-08 | config disabled_personas excluded from recommendation but available | positive | AC-003-07, AC-006-03 | Given config has disabled_personas, when roster is proposed, then disabled are excluded from recommended but shown in available |

---

## 6. Integration Tests: M2+M3 No-Primary-Forcing + Config Pre-population

**Test File**: `src/claude/hooks/tests/persona-override-integration.test.cjs` (extend existing)

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-INT-50-09 | removing all primaries from roster works | positive | AC-003-02, AC-005-01 | Given active_roster excludes all 3 primaries, when persona paths are filtered, then zero primary paths remain |
| TC-INT-50-10 | removing all personas triggers no-persona fallback | positive | AC-003-06 | Given active_roster is empty, when checked, then framework switches to no-persona mode |
| TC-INT-50-11 | config pre-population + user override = user choice wins | positive | AC-006-02 | Given config defaults to [security-reviewer] but user removes it, when applied, then security-reviewer is excluded |
| TC-INT-50-12 | config verbosity pre-populates but user can change | positive | AC-006-01 | Given config verbosity is `conversational` but user chooses `silent`, when applied, then verbosity is `silent` |
| TC-INT-50-13 | no config file + no flags = sensible defaults | positive | AC-006-05 | Given no roundtable.yaml and no flags, when config is read, then defaults to bulleted with 3 primaries recommended |
| TC-INT-50-14 | existing config continues working without modification | positive | AC-006-04 | Given a REQ-0047-era config, when read by modified code, then all fields parsed correctly |

---

## 7. Integration Tests: M1+M5 Mode Dispatch Context

**Test File**: `src/claude/hooks/tests/mode-dispatch-integration.test.cjs`

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-INT-50-15 | ROUNDTABLE_CONTEXT includes all available personas | positive | AC-005-06 | Given 8 personas available, when ROUNDTABLE_CONTEXT is built, then all 8 are listed (not just 3 primaries) |
| TC-INT-50-16 | ROUNDTABLE_CONTEXT reflects active_roster selection | positive | AC-005-03 | Given active_roster is [security, devops], when context is built, then active personas section shows only those 2 |
| TC-INT-50-17 | no-persona mode dispatch has no ROUNDTABLE_CONTEXT | positive | AC-004-01, AC-004-02 | Given mode is `no-personas`, when dispatch context is built, then no ROUNDTABLE_CONTEXT section |
| TC-INT-50-18 | dispatch context references active personas not three personas | positive | AC-005-02 | Given dynamic roster, when context text is checked, then it says "active personas" not "three personas" |
| TC-INT-50-19 | confirmation sequence adapts to active roster | positive | AC-005-05 | Given 2-persona roster, when confirmation fields are checked, then domains without active persona skip persona review |
| TC-INT-50-20 | verbosity_choice flows through to dispatch | positive | AC-002-03 | Given user chose `bulleted`, when dispatch context is checked, then verbosity field is `bulleted` |
| TC-INT-50-21 | meta.json records analysis_mode | positive | AC-004-05 | Given any mode, when meta.json output is checked, then `analysis_mode` field is present and correct |
| TC-INT-50-22 | dispatch context includes all standard artifact types | positive | AC-004-03 | Given no-persona mode, when dispatch context is checked, then artifact_types includes requirements-spec, impact-analysis, architecture-overview, module-design |

---

## 8. E2E Tests: Mode Selection End-to-End

**Test File**: `src/claude/hooks/tests/mode-selection-e2e.test.cjs`

| TC ID | Test Name | Type | Traces To | Description |
|-------|-----------|------|-----------|-------------|
| TC-E2E-01 | analyze-item with --no-roundtable outputs no-personas mode | positive | AC-001-07, AC-004-01 | Given `--no-roundtable` flag, when analyze-item.cjs is spawned, then JSON output has `analysis_mode: "no-personas"` |
| TC-E2E-02 | analyze-item with --silent outputs personas+silent mode | positive | AC-001-05 | Given `--silent` flag, when spawned, then output has `analysis_mode: "personas"` and `verbosity: "silent"` |
| TC-E2E-03 | analyze-item with --personas outputs pre-selected roster | positive | AC-001-06 | Given `--personas "security-reviewer"`, when spawned, then output has `preselected_personas` field |
| TC-E2E-04 | analyze-item with --verbose outputs conversational verbosity | positive | AC-002-04 | Given `--verbose` flag, when spawned, then output has `verbosity: "conversational"` |
| TC-E2E-05 | analyze-item with no mode flags omits analysis_mode | positive | AC-001-01 | Given no mode flags, when spawned, then output has no `analysis_mode` (framework will ask interactively) |
| TC-E2E-06 | analyze-item --no-roundtable + --personas: no-roundtable wins | negative | AC-001-07 | Given both flags, when spawned, then `analysis_mode` is `no-personas` |
| TC-E2E-07 | analyze-item preserves existing READY response fields | positive | AC-006-04 | Given standard input, when spawned, then existing fields (slug, folder, meta) are still present alongside new mode fields |

---

## 9. Behavioral AC Validation

These acceptance criteria are validated through behavioral observation during roundtable sessions, not automated tests. They trace to agent behavior defined in `roundtable-analyst.md`.

| BC ID | Traces To | Validation Description |
|-------|-----------|------------------------|
| BC-01 | AC-001-04 | Observe: mode question is conversational, not a numbered menu |
| BC-02 | AC-005-02 | Observe: roundtable-analyst.md references "active personas" not "three personas" throughout |
| BC-03 | AC-005-04 | Observe: engagement rule says "All active personas engage within first 3 exchanges" |
| BC-04 | AC-005-05 | Observe: confirmation sequence adapts to whichever personas are active |
| BC-05 | AC-003-04 | Observe: roster proposal shows recommended, uncertain, and available sections |
| BC-06 | AC-003-05 | Observe: user can add/remove personas from recommendation |
| BC-07 | AC-004-02 | Observe: no persona voice, framing, or identity in no-persona mode artifacts |
| BC-08 | AC-004-04 | Observe: analysis uses topic files directly without persona mediation |
