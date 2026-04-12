# Module Design: GH-251 Track 1 — Task-Level Dispatch for test-generate

**Analysis Date**: 2026-04-12

---

## Module Overview

Three change areas, tightly scoped:

1. **isdlc.md test-generate handler** — Precondition gate + artifact folder creation
2. **04-test-design-engineer.md** — New TEST-GENERATE MODE section for scaffold-to-tasks generation
3. **Codex projection bundle** — Test-generate projection in `src/providers/codex/`

## Module Design

### 1. isdlc.md — test-generate handler modifications

**Precondition gate** (inserted before workflow init, step 2.5):
- Glob `tests/characterization/**/*.characterization.*`
- If zero matches: display guidance message ("No characterization scaffolds found. Run `/discover` first to generate test scaffolds from your codebase."), exit handler — no workflow created, no state.json touched.
- If matches found: continue to workflow init.

**Artifact folder creation** (during workflow init):
- Naming: `TEST-GEN-{YYYY-MM-DD}-{test-type}` (e.g., `TEST-GEN-2026-04-12-unit`)
- Create `docs/requirements/{artifact-folder}/meta.json` with v2 schema, `analysis_status: "raw"`, `source: "test-generate"`.
- Pass `ARTIFACT_FOLDER` to orchestrator init prompt (same as build).

### 2. 04-test-design-engineer.md — TEST-GENERATE MODE

**Mode detection**: Read `WORKFLOW_TYPE` from workflow modifiers in delegation prompt. If `test-generate`, enter scaffold-based path.

**Scaffold scan**:
- Glob `tests/characterization/{domain}/*.characterization.*`
- For each file: extract `AC-RE-{NNN}` references from comments, extract `Source:` file references, note describe/it block structure.

**Classification heuristic**:
- **Unit**: scaffold tests a single exported function/method, uses direct imports, mocks external dependencies. Signals: single `Source:` reference, mock-heavy, no HTTP/request calls.
- **System**: scaffold tests cross-module flows, uses HTTP requests, wires multiple services. Signals: multiple `Source:` references, `request(app)` patterns, integration fixtures.
- **Ambiguous default**: if classification is unclear, default to unit (safer — doesn't block system tests).

**tasks.md generation**:
- Phase 05 section: one task for the test strategy itself (T001).
- Phase 06 section — unit tier: one task per unit-classified scaffold. All in tier 0 (parallel, no inter-dependencies). `files:` points to scaffold path (MODIFY). `traces:` from extracted AC-RE references.
- Phase 06 section — system tier: one task per system-classified scaffold. All `blocked_by` every unit test task. `files:` and `traces:` same pattern.
- Progress Summary table generated per standard format.

**Artifacts**: `test-strategy.md`, `test-cases/`, `traceability-matrix.csv` written to `docs/requirements/{artifact-folder}/` — same structure as build Phase 05.

### 3. Codex projection bundle

- New projection at `src/providers/codex/projections/test-generate.md`
- Pre-flight: same glob check as Claude precondition gate
- Prompt template: includes `WORKFLOW_TYPE: test-generate` modifier
- Dispatch: reads tasks.md, executes tier-ordered tasks sequentially via `codex exec`
- Artifact folder: same naming and meta.json convention

## Changes to Existing

| File | Change | Scope |
|------|--------|-------|
| `src/claude/commands/isdlc.md` | Add precondition gate + artifact folder creation to test-generate handler | ~20 lines inserted |
| `src/claude/agents/04-test-design-engineer.md` | Add `# TEST-GENERATE MODE` section | ~60 lines new section |
| `src/isdlc/config/workflows.json` | Add `workflow_type: "test-generate"` to agent_modifiers for test-generate workflow | ~3 lines |
| `src/providers/codex/projections/test-generate.md` | New Codex test-generate projection bundle | New file |

**No changes to**: `task-dispatcher.js`, `task-reader.js`, `task-validator.js`, `characterization-test-generator.md`, `discover-orchestrator.md`, or any hook.

## Wiring Summary

```
User: /isdlc test generate
  → isdlc.md handler
    → precondition gate (glob scaffolds)
    → orchestrator init (create artifact folder, branch)
  → Phase-Loop Controller
    → Phase 05: test-design-engineer (WORKFLOW_TYPE: test-generate)
      → scan scaffolds → classify → emit tasks.md + strategy artifacts
    → Phase 06: 3d-check → shouldUseTaskDispatch() → 3d-tasks dispatch
      → per-scaffold agents (parallel within tier)
    → Phase 16: quality-loop (unchanged)
    → Phase 08: code-review (unchanged)
  → finalize (merge, cleanup)
```

## Assumptions and Inferences

| # | Assumption | Confidence |
|---|-----------|------------|
| A1 | Classification is best-effort. Phase 05 surfaces its classification in test-strategy.md for user visibility. Ambiguous scaffolds default to unit. | Medium |
| A2 | One scaffold = one task. No splitting or merging. Each `.characterization.*` file becomes exactly one Phase 06 task. | High |
| A3 | Codex projection follows existing patterns in `src/providers/codex/`. Exact file structure TBD during implementation. | Medium |
