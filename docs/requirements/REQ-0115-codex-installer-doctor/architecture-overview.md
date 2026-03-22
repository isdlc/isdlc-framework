# Architecture Overview: Codex Installation and Doctor Paths

**Item**: REQ-0115 | **GitHub**: #179 | **CODEX**: CODEX-046

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Single installer.js | All 4 functions in one file mirroring Claude's installer.js | Consistent structure, single import point | Could grow large | **Selected** |
| B: Separate files per function | install.js, update.js, uninstall.js, doctor.js | Fine-grained | Over-fragmented for ~200 lines total, diverges from Claude pattern | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-021: Single Installer Module

- **Status**: Accepted
- **Context**: The Claude installer lives at `src/providers/claude/installer.js` (535 lines) with all 4 functions in one file. The Codex installer is simpler — no hooks, no settings.json merge, no MCP config — estimated at ~200 lines.
- **Decision**: Create `src/providers/codex/installer.js` exporting `installCodex`, `updateCodex`, `uninstallCodex`, `doctorCodex`.
- **Rationale**: Mirroring the Claude structure means the provider-aware installer can load and dispatch identically. One file keeps the small codebase navigable.
- **Consequences**: If Codex gains complexity later (hooks, config merging), the file may grow toward Claude's size, but that is a future concern.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| ES modules (`.js`) | Consistent with `src/providers/` convention |
| `node:fs/promises` | Async file operations for install/uninstall |
| `node:crypto` | Content hash for user-edit detection in update |
| No external dependencies | Framework-internal module |

## 4. Integration Architecture

### File Layout

```
src/providers/codex/
  installer.js    (NEW — this item, ~200 lines)

Mirrors:
  src/providers/claude/
    installer.js  (535 lines — NOT modified)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| installer.js | provider-aware installer (REQ-0089) | Named exports | Same API shape as Claude installer |
| installer.js | core team specs | Import | getTeamSpec() |
| installer.js | core team instances | Import | getTeamInstance() |
| installer.js | projection.js (REQ-0114) | Import | getCodexConfig(), getProjectionPaths() |
| installer.js | index.js barrel (REQ-0114) | Re-exported | Named exports |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module location | `src/providers/codex/installer.js` | Mirrors Claude provider |
| API shape | Identical to Claude installer | Provider-aware dispatcher compatibility |
| Size estimate | ~200 lines | No hooks, no settings merge, no MCP config |
