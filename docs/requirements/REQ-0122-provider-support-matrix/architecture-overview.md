# Architecture Overview: Provider Support Matrix

**Item**: REQ-0122 | **GitHub**: #186 | **CODEX**: CODEX-053

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Dedicated support-matrix.js in core/providers | Frozen data module with 3 exported functions | Single source of truth, queryable by downstream tools | New file in core | **Selected** |
| B: JSON config file | Matrix as .json, functions in separate file | Pure data separation | Loses co-location of data and accessor logic | Eliminated |
| C: Extend governance.js | Add matrix to existing governance module | Fewer files | Governance is Codex-specific, matrix is cross-provider | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-028: Core Provider Support Matrix Module

- **Status**: Accepted
- **Context**: Multiple consumers (doctor command, documentation generator, CI checks) need to query which features each provider supports and where governance enforcement differs. This data must be authoritative, frozen, and accessible from both ESM and CJS contexts.
- **Decision**: Create `src/core/providers/support-matrix.js` (~120 lines) exporting `getProviderSupportMatrix()`, `getGovernanceDeltas()`, and `getKnownLimitations()`. Provide a CJS bridge at `src/core/bridge/support-matrix.cjs`.
- **Rationale**: Placing the matrix in `src/core/providers/` (not `src/providers/codex/`) reflects that it is a cross-provider concern. The governance model from REQ-0117 provides the raw checkpoint data; this module adds the comparative and limitations dimensions.
- **Consequences**: When Codex support improves, entries are updated in this file. The frozen data pattern means changes are explicit and reviewable.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| ES modules (`.js`) | Consistent with `src/core/` convention |
| `Object.freeze()` | Immutable data at every level |
| CJS bridge (`.cjs`) | CommonJS consumers (hooks, CLI scripts) |
| Reference to governance.js | Governance deltas derived from REQ-0117 model |

## 4. Integration Architecture

### File Layout

```
src/core/providers/
  support-matrix.js   (NEW — this item, ~120 lines)

src/core/bridge/
  support-matrix.cjs  (NEW — CJS bridge, ~10 lines)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| support-matrix.js | codex/governance.js (REQ-0117) | Import | getGovernanceModel() for checkpoint data |
| support-matrix.js | Downstream consumers | Named exports | getProviderSupportMatrix(), getGovernanceDeltas(), getKnownLimitations() |
| support-matrix.cjs | support-matrix.js | Dynamic import bridge | CJS wrapper |
| Doctor command | support-matrix.js | Import | Provider capability checks |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module location | `src/core/providers/support-matrix.js` | Cross-provider concern, not Codex-specific |
| Data style | Frozen arrays of entry objects | Queryable, introspectable |
| Bridge | `src/core/bridge/support-matrix.cjs` | CJS consumer support |
| Size estimate | ~120 lines ESM + ~10 lines CJS bridge | Data definitions + 3 accessor functions |
