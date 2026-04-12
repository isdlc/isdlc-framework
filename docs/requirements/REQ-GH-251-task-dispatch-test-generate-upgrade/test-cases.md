# Test Cases: GH-251 Track 1 — Task-Level Dispatch for test-generate

**Requirement**: REQ-GH-251-task-dispatch-test-generate-upgrade
**Test File**: `tests/prompt-verification/test-generate-dispatch-gh251.test.js`
**Test ID Prefix**: TGD- (Test-Generate Dispatch)
**Date**: 2026-04-12

---

## FR-001: Discover Precondition Gate

### TGD-01: Precondition gate references characterization scaffold glob
- **Requirement ID**: FR-001, AC-001-01
- **Test Type**: positive
- **Given** `src/claude/commands/isdlc.md` exists with a test-generate handler section
- **When** the file content is read and checked for precondition gate patterns
- **Then** the content includes a glob pattern for `tests/characterization/**/*.characterization.*`
- **And** the content includes logic to block workflow when no scaffolds are found

### TGD-02: Precondition gate directs user to run /discover
- **Requirement ID**: FR-001, AC-001-01
- **Test Type**: positive
- **Given** `src/claude/commands/isdlc.md` exists with a test-generate handler section
- **When** the file content is read and checked for user guidance on missing scaffolds
- **Then** the content includes a reference to `/discover` as the remediation step
- **And** the content specifies that no `active_workflow` is created when scaffolds are missing

### TGD-03: Precondition gate prevents state.json and branch creation
- **Requirement ID**: FR-001, AC-001-01
- **Test Type**: negative
- **Given** `src/claude/commands/isdlc.md` exists with a test-generate handler section
- **When** the file content is read and checked for no-side-effect guarantees
- **Then** the content specifies that no state.json is touched when the gate blocks
- **And** the content specifies that no branch is created when the gate blocks

---

## FR-002: Artifact Folder Creation

### TGD-04: Artifact folder naming convention
- **Requirement ID**: FR-002, AC-002-01
- **Test Type**: positive
- **Given** `src/claude/commands/isdlc.md` exists with the test-generate handler
- **When** the file content is read and checked for artifact folder creation
- **Then** the content references a `TEST-GEN-` prefix for the artifact folder name

### TGD-05: meta.json with v2 schema and test-generate source
- **Requirement ID**: FR-002, AC-002-01
- **Test Type**: positive
- **Given** `src/claude/commands/isdlc.md` exists with the test-generate handler
- **When** the file content is read and checked for meta.json creation
- **Then** the content specifies `meta.json` creation with `source: "test-generate"` and `analysis_status: "raw"`

---

## FR-003: Phase 05 Scaffold-to-Tasks Generation

### TGD-06: TEST-GENERATE MODE section exists in test-design-engineer
- **Requirement ID**: FR-003, AC-003-01
- **Test Type**: positive
- **Given** `src/claude/agents/04-test-design-engineer.md` exists
- **When** the file content is read
- **Then** the content includes a section header `TEST-GENERATE MODE` (or equivalent)
- **And** the section references `WORKFLOW_TYPE` for mode detection

### TGD-07: Scaffold scan with AC-RE extraction
- **Requirement ID**: FR-003, AC-003-01
- **Test Type**: positive
- **Given** `src/claude/agents/04-test-design-engineer.md` exists with TEST-GENERATE MODE
- **When** the file content is read and the TEST-GENERATE MODE section is checked
- **Then** the content references glob pattern `tests/characterization/` for scaffold scanning
- **And** the content references `AC-RE-` extraction from scaffold comments
- **And** the content specifies one task per scaffold file in tasks.md output

### TGD-08: tasks.md emission with correct format
- **Requirement ID**: FR-003, AC-003-01
- **Test Type**: positive
- **Given** `src/claude/agents/04-test-design-engineer.md` exists with TEST-GENERATE MODE
- **When** the file content is read
- **Then** the content specifies emitting `docs/isdlc/tasks.md`
- **And** the content specifies `files:` pointing to scaffold paths with `(MODIFY)` operation
- **And** the content specifies `traces:` populated from extracted AC-RE references

---

## FR-004: Test Type Tier Ordering

### TGD-09: Unit tasks in earlier tier than system tasks
- **Requirement ID**: FR-004, AC-004-01
- **Test Type**: positive
- **Given** `src/claude/agents/04-test-design-engineer.md` exists with TEST-GENERATE MODE
- **When** the file content is read and checked for tier ordering
- **Then** the content specifies unit test tasks in tier 0
- **And** the content specifies system test tasks with `blocked_by` edges to unit test tasks

### TGD-10: Classification heuristic documented
- **Requirement ID**: FR-004, AC-004-01
- **Test Type**: positive
- **Given** `src/claude/agents/04-test-design-engineer.md` exists with TEST-GENERATE MODE
- **When** the file content is read
- **Then** the content includes a classification heuristic distinguishing unit from system scaffolds
- **And** the content specifies that ambiguous scaffolds default to unit classification

---

## FR-005: Phase 06 Dispatch via Existing 3d-check

### TGD-11: workflows.json has workflow_type modifier for test-generate
- **Requirement ID**: FR-003, FR-005, AC-005-01
- **Test Type**: positive
- **Given** `src/isdlc/config/workflows.json` exists
- **When** the JSON is parsed and the test-generate workflow is inspected
- **Then** `agent_modifiers` for phase `05-test-strategy` includes `workflow_type: "test-generate"`

### TGD-12: Existing dispatch infrastructure unchanged
- **Requirement ID**: FR-005, AC-005-01
- **Test Type**: negative
- **Given** `src/core/tasks/task-dispatcher.js` exists
- **When** the file modification date is checked (or the existing tests are run)
- **Then** the file is unchanged from the prior commit (no modifications in GH-251)
- **And** `shouldUseTaskDispatch()` existing tests (TD-11 through TD-13) continue to pass

---

## FR-006: Phase 05 Test Strategy Artifacts

### TGD-13: Agent specifies standard artifact output
- **Requirement ID**: FR-006, AC-006-01
- **Test Type**: positive
- **Given** `src/claude/agents/04-test-design-engineer.md` exists with TEST-GENERATE MODE
- **When** the file content is read
- **Then** the content specifies writing `test-strategy.md` to the artifact folder
- **And** the content specifies creating `test-cases/` directory
- **And** the content specifies creating `traceability-matrix.csv`

---

## Codex Projection Bundle

### TGD-14: Codex test-generate projection exists
- **Requirement ID**: FR-001 through FR-006
- **Test Type**: positive
- **Given** all Claude-side tasks (T002-T005) are complete
- **When** `src/providers/codex/projections/test-generate.md` is checked
- **Then** the file exists
- **And** the content includes a precondition check for characterization scaffolds
- **And** the content includes `WORKFLOW_TYPE: test-generate`

### TGD-15: Codex projection specifies sequential tier dispatch
- **Requirement ID**: FR-004, FR-005
- **Test Type**: positive
- **Given** `src/providers/codex/projections/test-generate.md` exists
- **When** the file content is read
- **Then** the content specifies sequential dispatch within tiers (Codex lacks parallel Task tool)
- **And** the content preserves tier ordering (unit before system)
