---
Status: Complete
Confidence: High
Last Updated: 2026-03-07
Coverage: implementation 95%
Source: REQ-0047 / GH-108a
---

# Implementation Notes: Contributing Personas -- Roundtable Extension

## 1. Architecture Decisions

### Module Extraction (M1 + M2)

The persona loader (M1) and config reader (M2) were extracted as standalone CommonJS modules rather than being inlined into `analyze-item.cjs` and `common.cjs`. This enables:

- **Testability**: Both modules are independently unit-testable with temp directory isolation
- **Reusability**: Both `analyze-item.cjs` and `common.cjs` can call the same persona loader
- **Separation of concerns**: Persona discovery logic is not tangled with CLI argument parsing or session cache building

Files created:
- `src/claude/hooks/lib/persona-loader.cjs` -- M1: getPersonaPaths(), parseFrontmatter(), validatePersona()
- `src/claude/hooks/lib/roundtable-config.cjs` -- M2: readRoundtableConfig(), formatConfigSection()

### YAML Parsing Without External Dependencies

Both modules implement minimal YAML parsers sufficient for the flat frontmatter/config schemas used. This avoids adding a `js-yaml` dependency to the framework. The parsers handle:
- Key-value pairs
- Array values (both block and inline syntax)
- Inline comments
- Quoted strings

### Fail-Open Design (NFR-003)

All file operations use try/catch with skip-on-error semantics:
- Malformed persona files are added to `skippedFiles` array with reason
- Missing `.isdlc/personas/` directory returns built-in paths only
- Missing `.isdlc/roundtable.yaml` uses defaults (verbosity: bulleted)
- Read errors on individual files skip that file, continue loading others

## 2. Files Modified

| File | Change | Lines Changed |
|------|--------|---------------|
| `src/antigravity/analyze-item.cjs` | Extended `parseArgs()` with --verbose/--silent/--personas flags; replaced `getPersonaPaths()` with persona-loader module; added roundtable config + drift warnings + skipped files to output JSON | ~25 |
| `src/claude/hooks/lib/common.cjs` | Extended ROUNDTABLE_CONTEXT builder to use persona-loader for dynamic persona discovery; added roundtable config, drift warnings, and skipped files sub-sections | ~50 |
| `src/claude/agents/roundtable-analyst.md` | Added Section 10: Contributing Personas with roster proposal protocol, verbosity rendering rules, contributing persona conversation rules, late-join protocol, natural language verbosity override | ~100 |
| `lib/prompt-format.test.js` | Updated agent inventory counts from 64 to 69 to account for 5 new persona files | ~5 |

## 3. Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `src/claude/hooks/lib/persona-loader.cjs` | M1: Persona discovery, validation, override-by-copy, version drift detection | 267 |
| `src/claude/hooks/lib/roundtable-config.cjs` | M2: Config file reading, validation, per-analysis overrides | 180 |
| `src/claude/agents/persona-security-reviewer.md` | Security contributing persona | 34 |
| `src/claude/agents/persona-qa-tester.md` | QA/Test contributing persona | 35 |
| `src/claude/agents/persona-ux-reviewer.md` | UX/Accessibility contributing persona | 33 |
| `src/claude/agents/persona-devops-reviewer.md` | DevOps/SRE contributing persona | 35 |
| `src/claude/agents/persona-domain-expert.md` | Domain Expert template with authoring guidance | 37 |
| `src/claude/hooks/tests/persona-loader.test.cjs` | M1 unit tests (28 test cases + 7 helper tests + 1 NFR test) | ~350 |
| `src/claude/hooks/tests/config-reader.test.cjs` | M2 unit tests (20 test cases + 7 helper tests) | ~220 |
| `src/claude/hooks/tests/persona-schema-validation.test.cjs` | M5 schema validation tests (12 test cases) | ~130 |
| `src/claude/hooks/tests/persona-config-integration.test.cjs` | M1+M2 integration tests (10 test cases) | ~170 |
| `src/claude/hooks/tests/persona-override-integration.test.cjs` | M1+M5 override integration tests (8 test cases) | ~170 |

## 4. Test Results

| Test Suite | Tests | Pass | Fail |
|------------|-------|------|------|
| persona-loader.test.cjs | 36 | 36 | 0 |
| config-reader.test.cjs | 27 | 27 | 0 |
| persona-schema-validation.test.cjs | 12 | 12 | 0 |
| persona-config-integration.test.cjs | 10 | 10 | 0 |
| persona-override-integration.test.cjs | 8 | 8 | 0 |
| **Total REQ-0047 tests** | **93** | **93** | **0** |
| npm test (full suite) | 1277 | 1277 | 0 |

### Coverage

| Module | Line % | Branch % | Function % |
|--------|--------|----------|------------|
| persona-loader.cjs | 90.73% | 88.16% | 100.00% |
| roundtable-config.cjs | 92.89% | 86.00% | 87.50% |
| **Overall** | **91.60%** | **87.30%** | **94.12%** |

All coverage metrics exceed the 80% threshold.

## 5. Backward Compatibility (NFR-004)

Verified via TC-INT-08: A project with no `.isdlc/personas/` directory and no `.isdlc/roundtable.yaml` produces identical behavior to the pre-change code:
- Same 3 primary persona paths returned (plus any new built-in contributing personas)
- Default verbosity is `bulleted` (new default, previously there was no verbosity concept)
- No errors, no warnings, no skipped files

The `common.cjs` ROUNDTABLE_CONTEXT builder includes a fallback path that preserves the original hardcoded 3-persona behavior if the persona-loader module cannot be loaded.

## 6. Security Considerations

- **Path traversal**: `isSafeFilename()` rejects filenames containing `..`, `/`, or `\`
- **Malformed YAML**: parseFrontmatter returns null on parse failure; no eval or dynamic code execution
- **File permissions**: Read errors are caught and added to skippedFiles
- **No user input in paths**: All paths are constructed from known directory roots + filtered directory listings

## 7. Requirement Traceability

| FR | Implementation | Test Coverage |
|----|---------------|---------------|
| FR-001 (Discovery) | persona-loader.cjs getPersonaPaths() | TC-M1-01 through TC-M1-07 |
| FR-002 (Built-in Personas) | 5 new persona-*.md files | TC-M5-01 through TC-M5-12 |
| FR-003 (Roster Proposal) | roundtable-analyst.md Section 10.1 | Behavioral (manual validation) |
| FR-004 (Verbosity) | roundtable-analyst.md Section 10.2 | Behavioral + TC-M2-01, TC-M2-06 |
| FR-005 (Config File) | roundtable-config.cjs | TC-M2-01 through TC-M2-20 |
| FR-006 (Late-Join) | roundtable-analyst.md Section 10.4 | Behavioral (manual validation) |
| FR-007 (Skill Wiring) | Persona frontmatter owned_skills | TC-M5-03 |
| FR-008 (Output Integration) | roundtable-analyst.md Section 10.3 | Behavioral (manual validation) |
| FR-009 (Override-by-Copy) | persona-loader.cjs merge logic | TC-M1-08 through TC-M1-11, TC-OVR-01 through TC-OVR-08 |
| FR-010 (Version Drift) | persona-loader.cjs compareSemver + drift collection | TC-M1-17 through TC-M1-22, TC-OVR-03 through TC-OVR-06 |
| FR-011 (Per-Analysis Flags) | analyze-item.cjs parseArgs + roundtable-config overrides | TC-M2-18 through TC-M2-20 |
