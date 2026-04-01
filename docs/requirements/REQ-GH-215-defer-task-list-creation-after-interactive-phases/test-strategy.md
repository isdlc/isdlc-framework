# Test Strategy: GH-215

**Slug**: REQ-GH-215-defer-task-list-creation-after-interactive-phases
**Status**: Complete
**Last Updated**: 2026-03-31
**Coverage**: All FRs covered

---

## 1. Test Approach

This item modifies markdown command specs, JSON config files, and hook .cjs files. The testable surface is:
- **Hook behavior** (gate-blocker, state-write-validator) — existing test patterns in `src/claude/hooks/tests/`
- **Config schema** (workflows.json, iteration-requirements.json) — JSON structure validation
- **Utility functions** (three-verb-utils.cjs) — existing test patterns in `src/claude/hooks/tests/test-three-verb-utils.test.cjs`
- **Spec correctness** (isdlc.md) — verified via content assertions on the markdown file

Framework: Vitest (project standard). Test location: `src/claude/hooks/tests/`.

## 2. Test Cases

### TC-001: workflows.json schema after removal (FR-001, FR-002)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-001-01 | Fix workflow removed | workflows.json loaded | `workflows.fix` accessed | Property is undefined |
| TC-001-02 | Feature workflow removed | workflows.json loaded | `workflows.feature` accessed | Property is undefined |
| TC-001-03 | Feature-light workflow removed | workflows.json loaded | `workflows["feature-light"]` accessed | Property is undefined |
| TC-001-04 | Build workflow exists | workflows.json loaded | `workflows.build` accessed | Object with phases `["05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]` |
| TC-001-05 | Existing workflows preserved | workflows.json loaded | `workflows["test-run"]`, `workflows["test-generate"]`, `workflows.upgrade` accessed | All exist unchanged |
| TC-001-06 | Reverse-engineer removed | workflows.json loaded | `workflows["reverse-engineer"]` accessed | Property is undefined |

### TC-002: iteration-requirements.json after removal (FR-001)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-002-01 | Fix overrides removed | iteration-requirements.json loaded | `workflow_overrides.fix` accessed | Property is undefined |
| TC-002-02 | Feature overrides removed | iteration-requirements.json loaded | `workflow_overrides.feature` accessed | Property is undefined |
| TC-002-03 | Phase-level requirements preserved | iteration-requirements.json loaded | `phase_requirements["05-test-strategy"]` accessed | Object exists with expected structure |

### TC-003: state-write-validator accepts build type (FR-001, FR-002)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-003-01 | Build workflow type accepted | state.json with `active_workflow.type = "build"` | `check()` called | No validation error for workflow type |
| TC-003-02 | Fix workflow type rejected | state.json with `active_workflow.type = "fix"` | `check()` called | Validation error (or no error if validator uses workflows.json dynamically) |
| TC-003-03 | Feature workflow type rejected | state.json with `active_workflow.type = "feature"` | `check()` called | Validation error (or no error if validator uses workflows.json dynamically) |

### TC-004: gate-blocker has no fix/feature overrides (FR-001)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-004-01 | No fix-specific override logic | gate-blocker.cjs source | Search for string "fix" in workflow override context | No hardcoded fix workflow references |
| TC-004-02 | No feature-specific override logic | gate-blocker.cjs source | Search for string "feature" in workflow override context | No hardcoded feature workflow references |

### TC-005: Build handler branch naming inference (FR-006)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-005-01 | BUG prefix infers bugfix branch | Artifact folder `BUG-GH-42-login-crash` | Branch name derived | Starts with `bugfix/` |
| TC-005-02 | REQ prefix infers feature branch | Artifact folder `REQ-GH-100-add-search` | Branch name derived | Starts with `feature/` |
| TC-005-03 | Unknown prefix defaults to feature | Artifact folder `MISC-0001-cleanup` | Branch name derived | Starts with `feature/` (fail-safe) |

### TC-006: isdlc.md command removal verification (FR-001, FR-002)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-006-01 | Fix handler removed | isdlc.md content | Search for fix action handler section | Not found as an active handler (may exist in comments/history) |
| TC-006-02 | Feature handler removed | isdlc.md content | Search for feature action handler section | Not found as an active handler |
| TC-006-03 | Reverse-engineer handler removed | isdlc.md content | Search for reverse-engineer action handler | Not found as an active handler |
| TC-006-04 | Build handler present | isdlc.md content | Search for build action handler | Present with updated logic |

### TC-007: SCENARIO 3 menu (FR-004)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-007-01 | Menu has Add option | SCENARIO 3 section in isdlc.md | Parse menu options | "Add" present |
| TC-007-02 | Menu has Analyze option | SCENARIO 3 section in isdlc.md | Parse menu options | "Analyze" present |
| TC-007-03 | Menu has Build option | SCENARIO 3 section in isdlc.md | Parse menu options | "Build" present |
| TC-007-04 | Menu has no Feature option | SCENARIO 3 section in isdlc.md | Parse menu options | "New Feature" not present |
| TC-007-05 | Menu has no Fix option | SCENARIO 3 section in isdlc.md | Parse menu options | "Fix" not present |

### TC-008: Intent detection rerouting (FR-003)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-008-01 | Fix signals route to analyze | Intent detection table in CLAUDE.md | "fix" signal words checked | Map to `/isdlc analyze` |
| TC-008-02 | Feature signals route to analyze/build | Intent detection table in CLAUDE.md | "build" signal words checked | Map to `/isdlc analyze` or `/isdlc build` |

### TC-009: Standalone skill wrappers (FR-008)

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| TC-009-01 | add.md exists | `src/claude/commands/` | File check | add.md present with correct frontmatter |
| TC-009-02 | analyze.md exists | `src/claude/commands/` | File check | analyze.md present with correct frontmatter |
| TC-009-03 | build.md exists | `src/claude/commands/` | File check | build.md present with correct frontmatter |
| TC-009-04 | Codex add projection exists | `src/providers/codex/commands/` | File check | add equivalent present |
| TC-009-05 | Codex analyze projection exists | `src/providers/codex/commands/` | File check | analyze equivalent present |
| TC-009-06 | Codex build projection exists | `src/providers/codex/commands/` | File check | build equivalent present |
| TC-009-07 | Skills registered in settings.json | `.claude/settings.json` | Parse for add/analyze/build skill entries | All three registered |

## 3. Test Pyramid

| Level | Count | Coverage |
|-------|-------|----------|
| Unit (hook behavior, config schema) | ~15 | TC-001 through TC-005 |
| Integration (spec content assertions) | ~12 | TC-006 through TC-009 |
| Manual verification | 3 | End-to-end flow: add → analyze → build |

## 4. Test Data

- Sample workflows.json with build workflow only (no fix/feature)
- Sample state.json with `active_workflow.type = "build"`
- Sample artifact folders with BUG-*, REQ-*, and unknown prefixes

## 5. Traceability

| FR | Test Cases |
|----|------------|
| FR-001 | TC-001-01, TC-001-03, TC-002-01, TC-003-02, TC-004-01, TC-006-01 |
| FR-002 | TC-001-02, TC-001-03, TC-002-02, TC-003-03, TC-004-02, TC-006-02 |
| FR-003 | TC-008-01, TC-008-02 |
| FR-004 | TC-007-01 through TC-007-05 |
| FR-005 | (3d-relay preservation — verified by absence of removal, no dedicated test needed) |
| FR-006 | TC-005-01, TC-005-02, TC-005-03 |
| FR-007 | (GitHub issue update — manual verification) |
| FR-008 | TC-009-01 through TC-009-07 |

## 6. Risk-Based Prioritization

| Priority | Tests | Rationale |
|----------|-------|-----------|
| P0 (Critical) | TC-001-04, TC-003-01, TC-005-01, TC-005-02 | Build workflow must work; hooks must accept it; branches must be named correctly |
| P1 (High) | TC-001-01 through TC-001-03, TC-006-01 through TC-006-03 | Removed commands must not be invocable |
| P2 (Medium) | TC-007-*, TC-008-*, TC-009-* | Menu, intent detection, skill wrappers |
| P3 (Low) | TC-002-*, TC-004-* | Config cleanup verification |

PHASE_TIMING_REPORT: { "debate_rounds_used": 0, "fan_out_chunks": 0 }
