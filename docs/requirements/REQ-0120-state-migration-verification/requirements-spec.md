# Requirements Specification: State Migration Verification

**Item**: REQ-0120 | **GitHub**: #184 | **CODEX**: CODEX-051 | **Phase**: 9 | **Workstream**: A
**Status**: Analyzed | **Depends on**: REQ-0090, REQ-0114

---

## 1. Business Context

`src/core/state/schema.js` (77 lines) already implements `migrateState()` with one v0-to-v1 migration. `tests/core/state/schema.test.js` (137 lines) provides basic unit coverage. This item adds integration-level verification tests that exercise migration with real-world state snapshots, in-flight workflow states, and doctor repair detection — scenarios beyond what the existing unit tests cover.

## 2. Functional Requirements

### FR-001: Migration Path Tests
- **AC-001-01**: Verify `migrateState()` correctly handles v0 to v1 migration (existing path).
- **AC-001-02**: Verify `migrateState()` handles future v1 to v2 migration when added (extensibility test structure).
- **AC-001-03**: Verify `migrateState()` handles state with missing `schema_version` field (treats as v0).
- **AC-001-04**: Verify `migrateState()` is a no-op when state is already at the current version.

### FR-002: In-Flight State Compatibility
- **AC-002-01**: A state.json with an `active_workflow` mid-phase survives migration without losing the `active_workflow` field.
- **AC-002-02**: The `phases` object is preserved through migration with all sub-fields intact.
- **AC-002-03**: The `workflow_history` array is preserved through migration.
- **AC-002-04**: After migration, the workflow is resumable (computeResumePoint returns a valid phase).

### FR-003: Doctor Repair Detection
- **AC-003-01**: `doctorCore()` detects state with an incompatible schema version and recommends migration.
- **AC-003-02**: `doctorCore()` distinguishes between "needs migration" and "corrupted state".

## 3. Out of Scope

- Creating new migration functions (this item tests the existing migration infrastructure)
- Modifying `migrateState()` implementation

## 4. MoSCoW

FR-001, FR-002, FR-003: **Must Have**.
