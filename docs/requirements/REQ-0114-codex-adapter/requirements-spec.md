# Requirements Specification: Codex Provider Adapter

**Item**: REQ-0114 | **GitHub**: #178 | **CODEX**: CODEX-045 | **Phase**: 8 | **Workstream**: C
**Status**: Analyzed | **Depends on**: REQ-0087, REQ-0094, REQ-0098

---

## 1. Business Context

The Codex provider adapter mirrors the existing `src/providers/claude/` structure to give the framework a first-class Codex integration point. It exposes provider configuration, projection paths for Codex instruction files, and a barrel re-export for installer and governance functions — all consuming the shared `src/core/` models.

## 2. Functional Requirements

### FR-001: Codex Provider Config
- **AC-001-01**: `getCodexConfig()` returns a frozen object `{ provider: 'codex', frameworkDir: '.codex', instructionFormat: 'markdown-instructions' }`.
- **AC-001-02**: The returned object is deeply frozen (`Object.freeze`).

### FR-002: Codex Projection Paths
- **AC-002-01**: `getProjectionPaths()` returns a frozen object mapping logical names to Codex instruction file paths (instruction files, team specs, content model).
- **AC-002-02**: All paths are relative to the project root.

### FR-003: Provider Index
- **AC-003-01**: `src/providers/codex/index.js` re-exports `getCodexConfig` and `getProjectionPaths` from `projection.js`.
- **AC-003-02**: `src/providers/codex/index.js` re-exports installer functions (`installCodex`, `updateCodex`, `uninstallCodex`, `doctorCodex`) from `installer.js`.
- **AC-003-03**: `src/providers/codex/index.js` re-exports governance functions (`getGovernanceModel`, `validateCheckpoint`) from `governance.js`.

### FR-004: Core Model Consumption
- **AC-004-01**: The adapter imports and consumes `src/core/` models: team specs, team instances, content classifications, discover, and analyze.
- **AC-004-02**: No core model is duplicated — all access is via import.

## 3. Out of Scope

- Actual Codex CLI integration (runs in separate isdlc-codex repo)
- Modifying the existing Claude provider adapter
- Runtime Codex task execution

## 4. MoSCoW

FR-001, FR-002, FR-003, FR-004: **Must Have**.
