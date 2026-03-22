# Requirements Specification: Codex Governance Checkpoint Integration

**Item**: REQ-0117 | **GitHub**: #181 | **CODEX**: CODEX-048 | **Phase**: 8 | **Workstream**: A
**Status**: Analyzed | **Depends on**: REQ-0071, REQ-0088, REQ-0114

---

## 1. Business Context

Claude enforces governance via 8 runtime hooks (PreToolUse, PostToolUse, notification). Codex has no equivalent hook surface — it cannot intercept tool calls in real time. This item formally documents the enforcement gap, identifies which checkpoints can be enforced via adapter-owned validation, and provides a frozen governance model that downstream tools can query.

## 2. Functional Requirements

### FR-001: Governance Checkpoint Model
- **AC-001-01**: A frozen config documents which of Claude's 8 hooks have Codex equivalents and which are enforcement gaps.
- **AC-001-02**: Each entry has: `checkpoint` (string), `claude_hook` (string), `codex_equivalent` (string|null), `status` ('enforceable'|'gap'|'partial'), `mitigation` (string).

### FR-002: Codex-Enforceable Checkpoints
- **AC-002-01**: Phase transition validation is enforceable via the adapter-owned runner.
- **AC-002-02**: State write validation is enforceable via file-level checks.
- **AC-002-03**: Artifact existence checks are enforceable via file system validation.

### FR-003: Irreducible Gaps
- **AC-003-01**: No PreToolUse/PostToolUse hook surface in Codex — documented as `status: 'gap'`.
- **AC-003-02**: No real-time delegation gating — documented as `status: 'gap'`.
- **AC-003-03**: No branch-guard equivalent — documented as `status: 'gap'`.

### FR-004: Governance Model Function
- **AC-004-01**: `getGovernanceModel()` returns a frozen object `{ enforceable: [...], gaps: [...], mitigation_strategy: 'periodic-validation' }`.
- **AC-004-02**: The `enforceable` array contains entries with `status: 'enforceable'`.
- **AC-004-03**: The `gaps` array contains entries with `status: 'gap'` or `status: 'partial'`.

### FR-005: Checkpoint Validation
- **AC-005-01**: `validateCheckpoint(phase, state)` validates a governance checkpoint given phase and current state.
- **AC-005-02**: Runs all enforceable checks for the given phase.
- **AC-005-03**: Returns `{ valid: boolean, violations: [{ checkpoint: string, message: string }] }`.

## 3. Out of Scope

- Implementing Codex CLI hooks (not supported by Codex)
- Modifying existing Claude hooks
- Runtime real-time enforcement (acknowledged gap)

## 4. MoSCoW

FR-001, FR-002, FR-003, FR-004, FR-005: **Must Have**.
