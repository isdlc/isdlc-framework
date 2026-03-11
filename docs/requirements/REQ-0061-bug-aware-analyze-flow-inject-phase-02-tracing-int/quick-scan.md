# Quick Scan: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## 1. Scope

**Classification**: Medium
**Rationale**: Touches the analyze handler dispatch logic, introduces a new agent file, and connects to existing fix workflow infrastructure. Most downstream components (tracing orchestrator, fix auto-detection, Phase-Loop Controller) require no changes.

**Change Type**: Mixed (new code for bug-gather agent + modification of analyze handler routing)

---

## 2. Keywords

| Keyword | Hits | Key Files |
|---------|------|-----------|
| `analyze` handler | 25+ | `src/claude/commands/isdlc.md` (lines 621-830) |
| `tracing-orchestrator` | 16 | `src/claude/agents/tracing/tracing-orchestrator.md` |
| `bug.*detect` / `is_bug` | 16 | `src/claude/commands/isdlc.md` (line 1096), `src/claude/agents/00-sdlc-orchestrator.md` |
| `fix` workflow phases | 72 | `src/isdlc/config/workflows.json` (lines 157-175) |
| `computeStartPhase` | 5+ | `src/claude/commands/isdlc.md` (line 858), `src/claude/hooks/lib/three-verb-utils.cjs` |
| `roundtable-analyst` | 10+ | `src/claude/agents/roundtable-analyst.md`, `src/claude/commands/isdlc.md` |

---

## 3. File Count

| Category | Count | Files |
|----------|-------|-------|
| Modify | 2 | `src/claude/commands/isdlc.md`, `src/isdlc/config/workflows.json` (possibly) |
| New | 1 | `src/claude/agents/bug-gather-analyst.md` (new agent) |
| Test | 2 | Test files for bug detection logic and gather flow |
| Config | 0 | No config changes expected |
| Docs | 1 | Agent documentation / AGENTS.md update |

**Total**: ~6 files
**Confidence**: High

---

## 4. Final Scope

**Scope**: Standard
**Summary**: The core change introduces a bug-detection gate in the analyze handler and a new lightweight bug-gather agent. The existing tracing orchestrator, fix workflow auto-detection (REQ-0026), and Phase-Loop Controller require no modifications. The main complexity is in the analyze handler routing logic and the bug-gather agent's codebase understanding + playback flow.
