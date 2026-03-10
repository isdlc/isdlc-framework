# Architecture Summary: User-Space Hooks

**Accepted**: 2026-03-10

---

## Key Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | Separate engine in `src/claude/hooks/lib/user-hooks.cjs` | Isolation from 26 framework hooks. Different execution model. Harness infrastructure. |
| ADR-002 | Per-hook subdirectories with config-driven triggers | Self-contained hooks. Multi-phase via config. Explicit opt-in. |
| ADR-003 | Friendly alias resolution via template | `hook-template.yaml` lists all phases. Engine resolves internally. |
| ADR-004 | Environment variables for context passing | Universal. No parsing required. |
| ADR-005 | Agent retry before user escalation | Hooks are governance mechanisms. 3 retries/hook via Claude Code's built-in retry. |

## Technology Choices

- Engine: Node.js CJS (consistent with harness lib)
- Config format: YAML (authoring ergonomics)
- Child process: `spawnSync` (sequential, timeout support)
- Alias derivation: strip numeric prefix from phase ID

## Integration Points

- `phase-advance.cjs` -- pre-gate + post-phase
- `workflow-init.cjs` -- pre-workflow
- `workflow-finalize.cjs` -- post-workflow
- `install.sh` / `update.sh` / `lib/updater.js` -- template delivery + hooks preservation

## Assumptions

- Lightweight YAML parser or `js-yaml` dependency acceptable -- Medium confidence
- `pre-{phase}` fires during phase-advance after gate clears -- Medium confidence
