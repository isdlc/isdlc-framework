# Architecture Overview: Codex Governance Checkpoint Integration

**Item**: REQ-0117 | **GitHub**: #181 | **CODEX**: CODEX-048

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Dedicated governance.js | Frozen model + validation in one module | Clear ownership, single import | Another file in the provider | **Selected** |
| B: Extend projection.js | Add governance to the projection module | Fewer files | Projection and governance are different concerns | Eliminated |
| C: JSON config file | Governance model as .json, validator separate | Data is pure JSON | Loses co-location of model and validation logic | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-023: Governance Module

- **Status**: Accepted
- **Context**: Claude's governance is distributed across 8 hooks. Codex cannot replicate the real-time hook surface. The framework needs a formal model of what is enforceable and what is not, plus a validation function for the enforceable subset.
- **Decision**: Create `src/providers/codex/governance.js` (~120 lines) exporting `getGovernanceModel()` and `validateCheckpoint(phase, state)`.
- **Rationale**: Co-locating the governance model (data) with the validation function (behavior) keeps the enforcement gap documentation next to the code that acts on it. Downstream tools call `getGovernanceModel()` to understand the gap; the adapter-owned runner calls `validateCheckpoint()` to enforce what it can.
- **Consequences**: The governance model is authoritative for Codex enforcement decisions. If Codex gains hook support in the future, entries move from `gaps` to `enforceable` in this file.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| ES modules (`.js`) | Consistent with `src/providers/` convention |
| `Object.freeze()` | Immutable governance model |
| Core ValidatorEngine | Phase transition validation (already exists) |
| Core StateStore | State schema validation (already exists) |
| `node:fs` | Artifact existence checks |

## 4. Integration Architecture

### File Layout

```
src/providers/codex/
  governance.js   (NEW — this item, ~120 lines)

Re-exported via:
  src/providers/codex/index.js (REQ-0114)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| governance.js | core ValidatorEngine | Import | validatePhaseTransition(phase, state) |
| governance.js | core StateStore | Import | validateStateSchema(state) |
| governance.js | file system | node:fs | existsSync for artifact checks |
| governance.js | index.js barrel (REQ-0114) | Re-exported | Named exports |
| governance.js | Codex adapter runner (isdlc-codex repo) | Import | getGovernanceModel(), validateCheckpoint() |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module location | `src/providers/codex/governance.js` | Dedicated governance concern |
| Model style | Frozen arrays of checkpoint entries | Introspectable, queryable |
| Size estimate | ~120 lines | Model definition + 3 enforceable checks |
