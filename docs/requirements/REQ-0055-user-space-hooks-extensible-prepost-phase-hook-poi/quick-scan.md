# Quick Scan: User-Space Hooks

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-10
**Coverage**: 100%

---

## Codebase Summary

- **Total framework hooks**: 26 (in `src/claude/hooks/`)
- **Hook API contract**: Documented in `docs/isdlc/hooks-api-contract.md`
- **Antigravity scripts**: 14 CJS files in `src/antigravity/`
- **Primary integration points**: `phase-advance.cjs` (151 lines), `workflow-init.cjs` (197 lines), `workflow-finalize.cjs` (169 lines)
- **Harness lib**: 12 CJS files in `src/claude/hooks/lib/` (common.cjs, gate-logic.cjs, profile-loader.cjs, etc.)

## Relevant Files

| File | Relevance |
|------|-----------|
| `src/antigravity/phase-advance.cjs` | Gate validation and phase advancement -- pre-gate and post-phase hook execution point. Gate validation at line ~69. |
| `src/antigravity/workflow-init.cjs` | Workflow initialization -- pre-workflow hook execution point. State write at line ~165. |
| `src/antigravity/workflow-finalize.cjs` | Workflow finalization -- post-workflow hook execution point. Merge at line ~84, output at line ~152. |
| `src/claude/hooks/lib/common.cjs` | Shared utilities (getProjectRoot, readState) -- reusable for hook discovery |
| `src/claude/hooks/lib/gate-logic.cjs` | Gate requirement checks -- user hooks integrate before these run |
| `install.sh` | Framework installation -- needs to create `.isdlc/hooks/` and deliver template |
| `update.sh` | Framework update -- needs to preserve user hooks, refresh template |
| `lib/updater.js` | Node.js updater -- same as update.sh |
| `docs/isdlc/hooks-api-contract.md` | Existing hook API documentation -- user hooks are architecturally distinct |
| `docs/isdlc/hackability-roadmap.md` | Roadmap context -- Tier 2, Layer 3 (Extend) |

## Key Observations

1. **Clear separation**: Framework hooks (`src/claude/hooks/`) use Claude Code's JSON stdin/stdout protocol. User-space hooks (`.isdlc/hooks/`) use shell execution with exit codes. No overlap.
2. **Phase names are strings**: `workflow-init.cjs` defines phases as string arrays (e.g., `['00-quick-scan', '01-requirements', ...]`). The hook template uses friendly aliases; engine resolves internally.
3. **No existing `.isdlc/config.json` reader**: Config will be per-hook (`hook.yaml`), not global.
4. **Update safety**: `update.sh` preserves `.isdlc/state.json`, `providers.yaml`, `monorepo.json`, `constitution.md`. `.isdlc/hooks/` needs to be added to this preserved list. The template file within hooks/ is refreshed.
5. **Harness lib pattern**: 12 modules already in `src/claude/hooks/lib/`. Adding `user-hooks.cjs` follows the established pattern.

## Module Distribution

- `src/antigravity/`: 14 files -- workflow lifecycle management
- `src/claude/hooks/`: ~26 hooks -- framework enforcement
- `src/claude/hooks/lib/`: 12 files -- shared harness utilities
- `src/claude/hooks/config/`: configuration and schemas
