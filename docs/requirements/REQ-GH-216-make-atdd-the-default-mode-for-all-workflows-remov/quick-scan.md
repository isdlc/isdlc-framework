# Quick Scan: REQ-GH-216

## Scope

Medium — config refactor removing the `--atdd` CLI flag (build, test-generate workflows) and the `--atdd-ready` CLI flag (discover command). Replaces flag-scoped conditionals with a new `atdd` config section in `.isdlc/config.json`, read via a new `ConfigService.getAtdd()` accessor. Touches ~20 files across config, hooks, phase agents, discover flow, phase-loop controller, documentation, and test suites. No new modules; one new accessor method on existing ConfigService.

## Keywords

| Keyword | Hits | Key Files |
|---------|------|-----------|
| `_when_atdd_mode` | 2 blocks | src/isdlc/config/workflows.json |
| `"when": "atdd_mode"` | 3 blocks | src/isdlc/config/iteration-requirements.json |
| `atdd_mode` option | 1 definition | src/isdlc/config/workflows.json |
| `--atdd-ready` | flag, guard | src/claude/commands/discover.md, src/claude/agents/discover/ |
| atdd-related hooks | 5 files | atdd-completeness-validator.cjs, test-watcher.cjs, post-bash-dispatcher.cjs, checkpoint-router.js, common.cjs |
| atdd-aware phase agents | 3 files | 04-test-design-engineer.md, 05-software-developer.md, 06-integration-tester.md |

## File Count

| Category | Count |
|----------|-------|
| New | 0 |
| Modify (config) | 2 |
| Modify (core config service + bridge + helper) | 3 |
| Modify (hooks) | 4 |
| Modify (phase agents) | 3 |
| Modify (discover flow) | 5 |
| Modify (phase-loop controller) | 1 |
| Modify (documentation) | 4 |
| Test files (existing) | ~8 |
| **Total modified** | **~30** |

## Final Scope

**Medium** — single-concern refactor (replace flag-scoped conditionals with config-driven checks), ~30 files modified, no new modules, no new dependencies. Blast radius bounded by the ATDD subsystem; surgical changes per file.
