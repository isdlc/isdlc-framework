# Quick Scan: Parallel Workflow Support (GH-30)

**Date**: 2026-02-21
**Analyst**: Maya Chen (Business Analyst)
**Source**: GitHub #30
**Codebase Hash**: 1ed003f

---

## 1. Scope

**Classification**: Large
**Complexity**: High

**Rationale**: This is an architectural change that replaces the monolithic `.isdlc/state.json` with per-workflow state files and a shared index (`workflows.index.json`). The current design assumes a single `active_workflow` at all times -- every hook, dispatcher, agent prompt, and command references this assumption. Changing the state model touches the deepest shared layer of the framework (`common.cjs`) and ripples outward through all consumers.

**Nature of change**: Mixed (modifying existing behavior + additive new components)
- **Modifying**: `readState()`/`writeState()` contract, `active_workflow` field semantics, dispatcher state resolution, agent prompt instructions
- **Additive**: Workflow index file, branch-to-workflow resolver, per-workflow directory structure, session picker UI, migration script

---

## 2. Keywords

| Keyword | Hits | Scope | Key Files |
|---------|------|-------|-----------|
| `readState` | 84 occurrences / 35 files | hooks, dispatchers, common.cjs | `common.cjs` (12 -- definition + internal), all 5 dispatchers, 27 standalone hooks |
| `writeState` | 16 files | hooks, dispatchers, common.cjs | `common.cjs` (definition), 5 dispatchers, 10 standalone hooks |
| `active_workflow` | 54 files | hooks, agents, commands, skills, config, template, installer | 12 agent `.md` files, `isdlc.md`, `workflows.json`, `CLAUDE.md.template`, `installer.js` |
| `state.json` | 141 files | everywhere | hooks, agents, skills, docs, checklists, schemas, installer scripts, CI |
| `current_phase` | 37 files | hooks, agents, common.cjs, installer | State field read by dispatchers and phase-aware hooks |
| `workflow_history` | 11 files | common.cjs, enforcer, dispatchers | `workflow-completion-enforcer.cjs`, installer scripts |
| `git branch --show-current` | 1 file | BACKLOG only | Not yet implemented -- needed for branch-to-workflow resolution |
| `worktree` | 1 file | BACKLOG only | Not yet implemented -- needed for true parallel sessions |

**Key observations**:
- `common.cjs` is the single point of control: `readState()` (line 1063), `writeState()` (line 1089), `readStateValue()` (line 1031)
- All 35 hook files import `readState` from `common.cjs` -- this is the primary modification surface
- The 5 dispatchers are the natural place to inject workflow resolution (resolve once, pass to all hooks)
- 12 agent prompt files reference `active_workflow` in their instructions -- these are text edits, not logic changes
- Branch resolution and worktree support are net-new code (zero existing implementation)

---

## 3. File Count

### Files Requiring Modification

| Category | Count | Details |
|----------|-------|---------|
| Core library | 1 | `src/claude/hooks/lib/common.cjs` -- `readState()`, `writeState()`, `readStateValue()` must become workflow-aware |
| Standalone hooks | 27 | All hooks calling `readState()` -- must accept/use resolved workflow state |
| Dispatchers | 5 | `pre-task`, `post-write-edit`, `pre-skill`, `post-bash`, `post-task` -- resolve workflow ID before dispatching |
| Agent prompts | 12 | `00-sdlc-orchestrator`, `01-requirements-analyst`, `02-solution-architect`, `03-system-designer`, `04-test-design-engineer`, `05-software-developer`, `06-integration-tester`, `07-qa-engineer`, `08-security-compliance-auditor`, `10-dev-environment-engineer`, `16-quality-loop-engineer`, `discover-orchestrator` |
| Commands | 2 | `isdlc.md` (session binding, workflow picker), `tour.md` |
| Skills | 3 | `fan-out-engine/SKILL.md`, `generate-plan/SKILL.md`, `atdd-scenario-mapping/SKILL.md` |
| Config | 1 | `src/isdlc/config/workflows.json` |
| Template | 1 | `src/claude/CLAUDE.md.template` |
| Installer/scripts | 3 | `lib/installer.js`, `install.sh`, `install.ps1` |
| **Subtotal (modify)** | **55** | |

### New Files

| Category | Count | Purpose |
|----------|-------|---------|
| Workflow resolver module | 1 | Branch-to-workflow-ID resolution (`git branch --show-current` -> workflow state path) |
| Index management | 1 | `workflows.index.json` CRUD operations (create, read, update, list, archive) |
| Migration script | 1 | Migrate existing monolithic `state.json` to per-workflow directory structure |
| **Subtotal (new)** | **3** | |

### Test Files

| Category | Count | Purpose |
|----------|-------|---------|
| Unit: workflow resolver | 1 | Branch resolution, fallback behavior, edge cases |
| Unit: common.cjs changes | 1 | Workflow-scoped read/write, backward compatibility |
| Unit: index management | 1 | Index CRUD, concurrent access, corruption recovery |
| Integration: parallel isolation | 1-2 | Two workflows running, state isolation verified |
| Integration: migration | 1 | Existing state.json migrated correctly |
| **Subtotal (test)** | **5-7** | |

### Total

| Type | Count |
|------|-------|
| Modified | 55 |
| New | 3 |
| Test (new/modified) | 5-7 |
| **Total** | **63-65** |

**Confidence**: Medium -- hook files are precisely enumerated; agent/skill changes are prompt text edits (lower risk); the unknowns are in test file count and whether installer script changes are trivial or substantial.

---

## 4. Final Scope

**Scope**: Large (63-65 files estimated)
**Complexity**: High
**Estimated sessions**: 3-4 through full iSDLC workflow (aligns with draft estimate of 2-3, adjusted upward given true file count)

**Summary rationale**: The draft estimated ~20 files but only counted direct `readState()` callers. The true blast radius is 3x larger when accounting for agent prompts (12), commands (2), skills (3), config (1), template (1), and installer scripts (3) that reference `active_workflow` or `state.json`. The core risk is in `common.cjs` and the 5 dispatchers -- these are the architectural linchpin. The remaining 27 standalone hooks are high-volume but structurally similar changes (accept resolved state instead of calling `readState()` directly).

**Risk factors**:
- `common.cjs` is ~3500+ lines and the most coupled file in the codebase
- Every hook invocation path changes (dispatchers resolve workflow first)
- Backward compatibility needed during migration (old state.json must still work)
- No existing test infrastructure for state management (0 test files found referencing `readState`)
