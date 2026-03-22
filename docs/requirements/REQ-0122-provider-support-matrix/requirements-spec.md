# Requirements Specification: Provider Support Matrix

**Item**: REQ-0122 | **GitHub**: #186 | **CODEX**: CODEX-053 | **Phase**: 9 | **Workstream**: A
**Status**: Analyzed | **Depends on**: REQ-0114, REQ-0117

---

## 1. Business Context

The framework supports two providers (Claude and Codex) with different capability levels. Downstream tooling, documentation, and the doctor command need a single source of truth for which features each provider supports, the relative governance enforcement strength, and known Codex limitations. This item creates a frozen data module that answers those questions programmatically.

## 2. Functional Requirements

### FR-001: Support Matrix
- **AC-001-01**: `getProviderSupportMatrix()` returns a frozen array of feature entries.
- **AC-001-02**: Each entry contains: `feature` (string), `claude` ('supported'), `codex` ('supported'|'partial'|'unsupported'), `notes` (string).
- **AC-001-03**: Features covered include: workflow types (feature, fix, upgrade, test_generate, test_run), discover, analyze, teams/roundtable, memory, skills, governance.

### FR-002: Governance Strength Deltas
- **AC-002-01**: `getGovernanceDeltas()` returns a frozen array of per-checkpoint enforcement comparisons.
- **AC-002-02**: Each entry contains: `checkpoint` (string), `claude_strength` ('enforced'), `codex_strength` ('enforced'|'instruction-only'|'none'), `delta` ('none'|'degraded'|'absent').
- **AC-002-03**: Data references the governance model from `getGovernanceModel()` (REQ-0117).

### FR-003: Known Limitations
- **AC-003-01**: `getKnownLimitations()` returns a frozen array of documented Codex constraints.
- **AC-003-02**: Each entry contains: `limitation` (string), `impact` ('low'|'medium'|'high'), `mitigation` (string).
- **AC-003-03**: Limitations include: no hooks, no real-time validation, instruction-only governance, no interactive elicitation.

### FR-004: Module Exports
- **AC-004-01**: `getProviderSupportMatrix()`, `getGovernanceDeltas()`, and `getKnownLimitations()` are named exports from `src/core/providers/support-matrix.js`.
- **AC-004-02**: CJS bridge at `src/core/bridge/support-matrix.cjs` re-exports for CommonJS consumers.

## 3. Out of Scope

- Implementing missing Codex features (this item documents the current state)
- UI or CLI display of the matrix (consumers use the exported functions)

## 4. MoSCoW

FR-001, FR-002, FR-003, FR-004: **Must Have**.
