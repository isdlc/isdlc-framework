# Test Strategy: REQ-0049 — Gate Profiles

**Status**: Complete
**Phase**: 05-test-strategy
**Last Updated**: 2026-03-08

---

## 1. Test Infrastructure

### Framework
- **Runner**: Node.js built-in `node:test` module
- **Assertions**: `node:assert/strict`
- **Test files**: `src/claude/hooks/tests/profile-*.test.cjs`
- **Utilities**: `hook-test-utils.cjs` — `setupTestEnv()`, `cleanupTestEnv()`, `writeConfig()`, `readState()`
- **Script**: `npm run test:hooks`

### Patterns Used
- Temp directory isolation via `setupTestEnv()` / `fs.mkdtempSync()`
- `require.cache` clearing for module reloading
- `process.env.CLAUDE_PROJECT_DIR` injection for root resolution
- `writeConfig()` for placing fixtures in `.claude/hooks/config/`
- Direct `require()` of CJS modules (no subprocess needed for unit tests)

---

## 2. Test Pyramid

| Layer | Count | Scope | Confidence |
|-------|-------|-------|------------|
| **Unit** | ~45 | profile-loader.cjs functions in isolation | High |
| **Integration** | ~18 | Merge chain: base → profile → workflow | High |
| **System** | ~8 | End-to-end profile selection + gate check | Medium |
| **Total** | ~71 | | |

### Coverage Targets
- Unit test coverage: ≥80% of profile-loader.cjs
- Integration test coverage: ≥80% of modified gate-logic.cjs paths
- All 12 FRs have at least one test case
- All Must-Have FRs (FR-001 through FR-008) have ≥2 test cases

---

## 3. Test File Organization

```
src/claude/hooks/tests/
  profile-loader.test.cjs           # Unit: loadAllProfiles, resolveProfile, matchProfileByTrigger
  profile-validation.test.cjs       # Unit: validateProfile, healProfile, checkThresholdWarnings
  profile-merge-chain.test.cjs      # Integration: base → profile → workflow merge
  profile-system.test.cjs           # System: full profile selection + gate check flow
```

---

## 4. Unit Tests — profile-loader.test.cjs

### 4.1 loadAllProfiles()

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| U-001 | Returns 3 built-in profiles when no project/personal dirs exist | FR-001 | AC-001-04 | P0 |
| U-002 | Rapid profile has correct overrides (coverage 60, CV disabled, iterations 3) | FR-001 | AC-001-01 | P0 |
| U-003 | Standard profile has empty overrides (identity merge) | FR-001 | AC-001-02 | P0 |
| U-004 | Strict profile has correct overrides (coverage 95) | FR-001 | AC-001-03 | P0 |
| U-005 | Loads project profiles from `.isdlc/profiles/*.json` | FR-002 | AC-002-01 | P0 |
| U-006 | Loads personal profiles from `~/.isdlc/profiles/*.json` | FR-002 | AC-002-02 | P0 |
| U-007 | Auto-discovers profiles without registration (drop file = available) | FR-002 | AC-002-05 | P0 |
| U-008 | Personal profile overrides project profile with same name | FR-003 | AC-003-01 | P0 |
| U-009 | Project profile overrides built-in profile with same name | FR-003 | AC-003-01 | P0 |
| U-010 | Only highest-precedence profile used on name collision | FR-003 | AC-003-02 | P0 |
| U-011 | Registry sources correctly categorizes each profile's tier | FR-003 | AC-003-03 | P1 |
| U-012 | Skips personal directory gracefully when it doesn't exist | FR-002 | AC-002-02 | P0 |
| U-013 | Skips project directory gracefully when it doesn't exist | FR-002 | AC-002-01 | P1 |
| U-014 | Excludes invalid profile files from registry (no crash) | FR-007 | AC-007-01 | P0 |
| U-015 | Handles empty profile directory (returns only built-in) | FR-001 | AC-001-04 | P1 |
| U-016 | Non-JSON files in profile directory are ignored | FR-002 | AC-002-05 | P1 |

### 4.2 resolveProfile()

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| U-017 | Resolves 'rapid' from built-in profiles | FR-001 | AC-001-04 | P0 |
| U-018 | Resolves 'standard' from built-in profiles | FR-001 | AC-001-04 | P0 |
| U-019 | Resolves 'strict' from built-in profiles | FR-001 | AC-001-04 | P0 |
| U-020 | Returns null for unknown profile name | FR-003 | AC-003-02 | P0 |
| U-021 | Returns source metadata (built-in/project/personal) | FR-003 | AC-003-03 | P1 |
| U-022 | Returns source_path as absolute path to profile file | FR-003 | AC-003-03 | P1 |

### 4.3 matchProfileByTrigger()

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| U-023 | "quick" matches rapid profile | FR-004 | AC-004-01, AC-004-03 | P0 |
| U-024 | "fast" matches rapid profile | FR-004 | AC-004-01, AC-004-03 | P0 |
| U-025 | "strict" matches strict profile | FR-004 | AC-004-01, AC-004-03 | P0 |
| U-026 | "compliance" matches strict profile | FR-004 | AC-004-01 | P1 |
| U-027 | "banana" matches nothing (returns null) | FR-004 | AC-004-04 | P0 |
| U-028 | Trigger matching is case-insensitive | FR-004 | AC-004-02 | P1 |
| U-029 | Ambiguous input matching multiple profiles returns null | FR-004 | AC-004-05 | P0 |
| U-030 | Custom profile triggers are matched alongside built-in triggers | FR-004 | AC-004-02 | P1 |

---

## 5. Unit Tests — profile-validation.test.cjs

### 5.1 validateProfile()

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| V-001 | Valid profile passes validation | FR-007 | AC-007-01 | P0 |
| V-002 | Missing `name` field is flagged | FR-007 | AC-007-01 | P0 |
| V-003 | Missing `description` field is flagged | FR-007 | AC-007-01 | P0 |
| V-004 | Missing `triggers` field is flagged | FR-007 | AC-007-01 | P0 |
| V-005 | Empty `triggers` array is flagged | FR-007 | AC-007-01 | P1 |
| V-006 | Wrong type for `name` (number) is flagged | FR-007 | AC-007-03 | P0 |
| V-007 | Unknown field generates suggested correction (typo detection) | FR-007 | AC-007-02 | P0 |
| V-008 | `min_coverge_percent` suggests `min_coverage_percent` | FR-007 | AC-007-02 | P0 |
| V-009 | Unknown phase key generates suggestion | FR-007 | AC-007-02 | P1 |
| V-010 | Completely unknown field (no close match) logged as warning | FR-007 | AC-007-02 | P1 |
| V-011 | Malformed JSON produces parse error with context | FR-007 | AC-007-01 | P1 |

### 5.2 healProfile()

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| V-012 | Applies single field rename fix to file | FR-007 | AC-007-04 | P0 |
| V-013 | Applies multiple fixes in one pass | FR-007 | AC-007-04 | P1 |
| V-014 | Returns false on write error (read-only file) | FR-007 | AC-007-04 | P1 |
| V-015 | Healed file passes subsequent validation | FR-007 | AC-007-04 | P0 |

### 5.3 checkThresholdWarnings()

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| W-001 | Standard profile produces zero warnings | FR-008 | AC-008-01 | P0 |
| W-002 | Coverage below 80% produces warning | FR-008 | AC-008-02 | P0 |
| W-003 | Constitutional validation disabled produces warning | FR-008 | AC-008-02 | P0 |
| W-004 | Test iteration disabled produces warning | FR-008 | AC-008-02 | P1 |
| W-005 | Max iterations < 5 produces warning | FR-008 | AC-008-02 | P1 |
| W-006 | Warnings are strings (not error objects) | FR-008 | AC-008-03 | P1 |
| W-007 | Multiple threshold violations produce multiple warnings | FR-008 | AC-008-02 | P1 |

---

## 6. Integration Tests — profile-merge-chain.test.cjs

### 6.1 Merge Chain Correctness

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| I-001 | No profile selected → base requirements unchanged | FR-006 | AC-006-04 | P0 |
| I-002 | Standard profile → base requirements unchanged (identity merge) | FR-006 | AC-006-04 | P0 |
| I-003 | Rapid profile → coverage reduced to 60%, CV disabled | FR-006 | AC-006-01 | P0 |
| I-004 | Strict profile → coverage increased to 95% | FR-006 | AC-006-01 | P0 |
| I-005 | Profile + workflow override → workflow override wins on conflict | FR-006 | AC-006-01 | P0 |
| I-006 | Profile with global_overrides applies to all phases | FR-006 | AC-006-03 | P0 |
| I-007 | Profile with per-phase overrides applies only to specified phase | FR-006 | AC-006-03 | P1 |
| I-008 | Per-phase override wins over global_override for same phase | FR-006 | AC-006-03 | P1 |
| I-009 | Full chain: base → rapid profile → fix workflow override | FR-006 | AC-006-01, AC-006-02 | P0 |
| I-010 | Full chain: base → strict profile → feature workflow override | FR-006 | AC-006-01, AC-006-02 | P1 |

### 6.2 mergeRequirements() with Profile Data

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| I-011 | Deep-merges nested objects (test_iteration.success_criteria) | FR-006 | AC-006-02 | P0 |
| I-012 | Replaces arrays (not concatenates) — articles list | FR-006 | AC-006-02 | P1 |
| I-013 | Handles null/undefined values in profile overrides | FR-006 | AC-006-02 | P1 |
| I-014 | Boolean override (enabled: false) propagates correctly | FR-006 | AC-006-02 | P0 |
| I-015 | Numeric override (min_coverage_percent: 60) propagates | FR-006 | AC-006-02 | P0 |

### 6.3 Backward Compatibility (Critical)

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| I-016 | loadIterationRequirements() with no profile returns identical results to current behavior | FR-006 | AC-006-04 | P0 |
| I-017 | Existing workflow_overrides for fix workflow still apply correctly | FR-006 | AC-006-04 | P0 |
| I-018 | Gate checks for Phase 06 produce same result with standard profile vs no profile | FR-001 | AC-001-02 | P0 |

---

## 7. System Tests — profile-system.test.cjs

| ID | Test Case | FR | AC | Priority |
|----|-----------|----|----|----------|
| S-001 | Drop profile JSON into project dir → loadAllProfiles() finds it | FR-002 | AC-002-05 | P0 |
| S-002 | Profile with schema errors → validateProfile reports errors with suggestions | FR-007 | AC-007-02 | P0 |
| S-003 | healProfile fixes typo → revalidation passes | FR-007 | AC-007-04, AC-007-05 | P1 |
| S-004 | Custom profile with trigger → matchProfileByTrigger resolves it | FR-004 | AC-004-02 | P1 |
| S-005 | Profile selection → merge → gate check uses profile thresholds | FR-006 | AC-006-01 | P0 |
| S-006 | Rapid profile → gate check with 65% coverage passes (would fail without profile) | FR-001 | AC-001-01 | P0 |
| S-007 | Strict profile → gate check with 85% coverage fails (would pass without profile) | FR-001 | AC-001-03 | P0 |
| S-008 | Three-tier resolution: personal overrides project overrides built-in | FR-003 | AC-003-01 | P0 |

---

## 8. Test Data Plan

### 8.1 Valid Profile Fixtures

```
fixtures/profiles/
  rapid.json          # Built-in rapid (reference copy)
  standard.json       # Built-in standard (reference copy)
  strict.json         # Built-in strict (reference copy)
  custom-spike.json   # Custom project profile with all fields
  minimal-valid.json  # Minimum viable profile (name, description, triggers only)
```

### 8.2 Invalid Profile Fixtures

```
fixtures/profiles-invalid/
  malformed.json         # Invalid JSON syntax (missing closing brace)
  empty.json             # Empty file (0 bytes)
  no-name.json           # Missing required 'name' field
  no-triggers.json       # Missing required 'triggers' field
  wrong-type-name.json   # name: 123 (number instead of string)
  typo-field.json        # { "min_coverge_percent": 60 } (typo in nested field)
  unknown-phase.json     # { "overrides": { "99-nonexistent": {...} } }
  empty-triggers.json    # { "triggers": [] }
  not-object.json        # Contains a JSON array, not object
```

### 8.3 Merge Chain Fixtures

```
fixtures/merge-chain/
  base-requirements.json       # Subset of iteration-requirements.json for testing
  rapid-overlay.json           # Expected result after rapid merge
  strict-overlay.json          # Expected result after strict merge
  fix-workflow-override.json   # Workflow override for fix workflow
  rapid-plus-fix.json          # Expected result: base → rapid → fix override
```

### 8.4 Boundary Conditions

| Condition | Test ID | Description |
|-----------|---------|-------------|
| Zero profiles available | U-015 | Empty profile directories |
| 100+ profiles (performance) | — | Deferred (perf budget: < 100ms; only test if load time regresses) |
| Name collision across all 3 tiers | U-008, U-009, U-010 | Same name in personal, project, built-in |
| Profile with only global_overrides | I-006 | No per-phase overrides |
| Profile with only per-phase overrides | I-007 | No global overrides |
| Profile with both | I-008 | Per-phase wins on conflict |
| Profile that disables everything | W-007, S-006 | All gates disabled |
| Profile that enables stricter gates | S-007 | Beyond standard thresholds |

---

## 9. Traceability Matrix

| FR | AC | Test IDs | Coverage |
|----|-----|----------|----------|
| FR-001 | AC-001-01 | U-002, I-003, S-006 | Full |
| FR-001 | AC-001-02 | U-003, I-002, I-018 | Full |
| FR-001 | AC-001-03 | U-004, I-004, S-007 | Full |
| FR-001 | AC-001-04 | U-001, U-017, U-018, U-019 | Full |
| FR-002 | AC-002-01 | U-005, U-013 | Full |
| FR-002 | AC-002-02 | U-006, U-012 | Full |
| FR-002 | AC-002-03 | V-001 (schema structure) | Partial |
| FR-002 | AC-002-04 | I-003 (overrides match phase_requirements) | Partial |
| FR-002 | AC-002-05 | U-007, U-016, S-001 | Full |
| FR-003 | AC-003-01 | U-008, U-009, S-008 | Full |
| FR-003 | AC-003-02 | U-010, U-020 | Full |
| FR-003 | AC-003-03 | U-011, U-021, U-022 | Full |
| FR-004 | AC-004-01 | U-023, U-024, U-025, U-026 | Full |
| FR-004 | AC-004-02 | U-028, U-030 | Full |
| FR-004 | AC-004-03 | U-023, U-024, U-025 | Full |
| FR-004 | AC-004-04 | U-027 | Full |
| FR-004 | AC-004-05 | U-029 | Full |
| FR-005 | AC-005-01 | — (UX layer, tested via orchestrator integration) | Deferred |
| FR-005 | AC-005-02 | — (UX layer) | Deferred |
| FR-005 | AC-005-03 | — (UX layer) | Deferred |
| FR-005 | AC-005-04 | — (recorded in workflow state; covered by S-005) | Partial |
| FR-006 | AC-006-01 | I-003, I-004, I-005, I-009, S-005 | Full |
| FR-006 | AC-006-02 | I-011, I-012, I-013, I-014, I-015 | Full |
| FR-006 | AC-006-03 | I-006, I-007, I-008 | Full |
| FR-006 | AC-006-04 | I-001, I-002, I-016, I-017, I-018 | Full |
| FR-007 | AC-007-01 | V-001, V-002, V-003, V-004, V-005, V-006, V-011, U-014 | Full |
| FR-007 | AC-007-02 | V-007, V-008, V-009, V-010 | Full |
| FR-007 | AC-007-03 | V-006 | Full |
| FR-007 | AC-007-04 | V-012, V-013, V-015, S-003 | Full |
| FR-007 | AC-007-05 | S-003 (fall back to standard on decline) | Full |
| FR-008 | AC-008-01 | W-001 | Full |
| FR-008 | AC-008-02 | W-002, W-003, W-004, W-005, W-007 | Full |
| FR-008 | AC-008-03 | W-006 | Full |
| FR-008 | AC-008-04 | — (enforce_minimum tested at orchestrator layer) | Deferred |
| FR-009 | — | — (Should Have; listing command is UX-layer) | Deferred |
| FR-010 | AC-010-01 | — (config.json reading; covered at integration level) | Deferred |
| FR-010 | AC-010-02 | — (default profile selection; covered by merge chain) | Deferred |
| FR-010 | AC-010-03 | I-001 (no default = standard) | Partial |
| FR-011 | — | — (Should Have; forward compatibility) | Deferred |
| FR-012 | — | — (Should Have; monorepo support) | Deferred |

### Coverage Summary
- **Must Have FRs (001-008)**: 65 of 71 test cases — Full or Partial coverage on all ACs
- **Should Have FRs (009-012)**: Deferred to future iteration (lower priority)
- **UX-layer ACs (FR-005)**: Deferred — these are tested via orchestrator integration, not unit tests

---

## 10. Risk-Based Test Prioritization

| Risk | Impact | Test Focus |
|------|--------|------------|
| Standard profile diverges from current behavior | Critical | I-016, I-017, I-018 — snapshot comparison of resolved requirements |
| Merge order produces unexpected thresholds | High | I-001 through I-010 — all merge permutations |
| Invalid profile blocks workflow start | High | V-001 through V-015, U-014 — validation + self-healing |
| Antigravity path bypasses profile resolution | Medium | I-016 — verify validate-gate.cjs gets profile-merged requirements |
| Profile loader performance regression | Low | Deferred — add perf budget test only if load time regresses |

---

## 11. Constitutional Compliance

### Article II (Test-First Development)
- Tests designed before implementation (this document)
- Coverage target: ≥80% for new profile-loader.cjs module
- Regression threshold: total hook test count must not decrease

### Article VII (Artifact Traceability)
- Traceability matrix maps every FR/AC to test case IDs (Section 9)
- No orphan test cases — every test traces to at least one AC

### Article IX (Quality Gate Integrity)
- Gate-level integration tests verify profile merge doesn't bypass gates (I-016, I-017, I-018)
- Backward compatibility tests ensure standard profile = current behavior

### Article XI (Integration Testing Integrity)
- Integration tests verify real merge behavior (no mocked mergeRequirements)
- System tests use actual profile files on disk (no stubbed filesystem)
- Boundary conditions tested with real data (Section 8.4)
