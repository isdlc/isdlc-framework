# Requirements Specification: Parity Verification

**Item**: REQ-0118 | **GitHub**: #182 | **CODEX**: CODEX-049 | **Phase**: 9 | **Workstream**: A
**Status**: Analyzed | **Depends on**: REQ-0114, REQ-0117

---

## 1. Business Context

The Codex adapter replicates Claude adapter behavior using instruction-only governance. To ensure behavioral equivalence, a parity test suite must compare outputs from both adapters across all critical subsystems. Tests distinguish between strict parity (must match exactly) and flexible parity (allowed to diverge in non-functional dimensions like formatting and timing).

## 2. Functional Requirements

### FR-001: Parity Test Suite
- **AC-001-01**: Tests compare Claude adapter output with Codex adapter output for the following subsystems: state.json mutations, artifact generation, BACKLOG.md mutations, meta.json mutations, validator block/allow outcomes.
- **AC-001-02**: Each subsystem has a dedicated test file in `tests/verification/parity/`.
- **AC-001-03**: Tests use identical inputs for both adapters and compare outputs structurally.

### FR-002: Strict Parity Checks
- **AC-002-01**: Governance parity — both adapters produce the same block/allow decisions for identical checkpoint inputs.
- **AC-002-02**: Sequencing parity — both adapters enforce the same phase order for identical workflow types.
- **AC-002-03**: State parity — both adapters produce state.json conforming to the same schema with equivalent field values.
- **AC-002-04**: Artifact parity — both adapters produce the same set of output files (by name) for equivalent workflow steps.

### FR-003: Flexible Parity Checks
- **AC-003-01**: Prompt wording — different formatting or phrasing is acceptable; tests do not assert exact string equality on prompts or instructions.
- **AC-003-02**: Timing — different execution durations are acceptable; tests do not assert on wall-clock time.

### FR-004: Test Structure
- **AC-004-01**: Tests reside in `tests/verification/parity/` directory.
- **AC-004-02**: Approximately 8 test files, one per subsystem comparison plus integration tests.
- **AC-004-03**: Tests are runnable via `node --test tests/verification/parity/`.

## 3. Out of Scope

- End-to-end Codex CLI execution (tests exercise adapter functions, not the full CLI)
- Fixing parity gaps (tests report them, implementation is separate)

## 4. MoSCoW

FR-001, FR-002, FR-003, FR-004: **Must Have**.
