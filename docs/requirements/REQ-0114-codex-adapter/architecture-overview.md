# Architecture Overview: Codex Provider Adapter

**Item**: REQ-0114 | **GitHub**: #178 | **CODEX**: CODEX-045

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Mirror Claude provider structure | Separate index.js + projection.js under src/providers/codex/ | Consistent with existing pattern, easy to navigate | Another directory to maintain | **Selected** |
| B: Single monolithic provider file | One codex.js with all exports | Fewer files | Diverges from Claude provider structure, harder to extend | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-020: Codex Provider Adapter Structure

- **Status**: Accepted
- **Context**: The Claude provider lives at `src/providers/claude/` with `index.js` (barrel), `projection.js`, `installer.js`, and supporting modules. The Codex adapter needs the same integration surface.
- **Decision**: Create `src/providers/codex/` with `index.js` (barrel re-exports) and `projection.js` (config + path mappings). Installer and governance modules are added by REQ-0115 and REQ-0117 respectively.
- **Rationale**: Mirroring the Claude structure means the provider-aware installer (REQ-0089) can discover and load Codex identically to Claude — same API shape, same barrel pattern.
- **Consequences**: Adding a new provider in the future follows the same template. The index.js barrel grows as modules are added (installer, governance).

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| ES modules (`.js`) | Consistent with `src/providers/claude/` convention |
| `Object.freeze()` | Immutable config and path objects |
| No external dependencies | Pure data + re-export module |

## 4. Integration Architecture

### File Layout

```
src/providers/codex/
  index.js        (NEW — barrel re-exports)
  projection.js   (NEW — getCodexConfig, getProjectionPaths)

Mirrors:
  src/providers/claude/
    index.js
    projection.js
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| projection.js | core models | Import | Team specs, instances, content classifications |
| index.js | provider-aware installer (REQ-0089) | Re-export barrel | Named exports |
| index.js | installer.js (REQ-0115) | Re-export | Named exports |
| index.js | governance.js (REQ-0117) | Re-export | Named exports |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module location | `src/providers/codex/` | Mirrors Claude provider |
| Barrel pattern | `index.js` re-exports all sub-modules | Consistent with Claude provider |
| Size estimate | index.js ~15 lines, projection.js ~50 lines | Config + path mappings only |
