# Impact Analysis: Multi-Agent Requirements Team (REQ-0014)

**Generated**: 2026-02-14T17:25:00Z
**Feature**: Creator/Critic/Refiner debate loop for Phase 01 requirements, with conversational Creator (8.3), configurable via --debate/--no-debate flags
**Based On**: Phase 01 Requirements (finalized) -- 8 FRs, 7 USs, 28 ACs, 5 NFRs
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Phase 00) | Clarified (Phase 01) |
|--------|---------------------|----------------------|
| Description | Creator/Critic/Refiner debate loop for Phase 01 | Full debate loop + conversational Creator + flag config + artifact versioning + orchestrator delegation |
| Keywords | debate, creator, critic, refiner, convergence | debate, creator, critic, refiner, convergence, conversational, flags, round, artifact-versioning, delegation |
| Estimated Files | 8-12 modified, 2-4 new | 10-14 modified, 2-3 new |
| Scope Change | - | REFINED (8.3 integration folded in as Should Have; core scope stable) |

---

## Executive Summary

This feature adds a Creator/Critic/Refiner debate loop to Phase 01 (Requirements), following the precedent set by the Inception Party in `/discover --new`. The blast radius is **MEDIUM** -- changes span 12-15 files across 5 modules, but ~85% are prompt/markdown edits with only ~15% JavaScript. The primary risk is breaking existing single-agent Phase 01 behavior; this is mitigated by the `--no-debate` and `-light` bypass paths. Two new agent files are created (Critic, Refiner), but they follow established patterns. The existing hook infrastructure requires only awareness changes (iteration-requirements.json may need debate-round compatibility), not structural modifications.

**Blast Radius**: MEDIUM (12-15 files, 5 modules)
**Risk Level**: MEDIUM
**Affected Files**: 14
**Affected Modules**: 5

---

## Impact Analysis

### M1: Files Directly Affected

#### Primary Impact (MUST change)

| # | File | Change Type | Rationale | FRs Covered |
|---|------|-------------|-----------|-------------|
| 1 | `src/claude/agents/01-requirements-analyst.md` | MAJOR REWRITE | Creator role: add debate-mode awareness, round labeling ("Round 1 Draft"), conversational opening (FR-007), conditional behavior based on debate_mode flag. This is the largest single change (~1781 lines, ~40% rewrite of Step 1 + Invocation Protocol). | FR-001, FR-007 |
| 2 | `src/claude/agents/00-sdlc-orchestrator.md` | SIGNIFICANT EDIT | Debate loop orchestration: add Creator->Critic->Refiner delegation loop within Phase 01, debate_mode resolution logic, round tracking in active_workflow.debate_state, convergence check, max-3-rounds hard limit. | FR-004, FR-008 |
| 3 | `src/claude/commands/isdlc.md` | MODERATE EDIT | Add `--debate` and `--no-debate` flag parsing to feature command, pass debate configuration to orchestrator init, document new flags in usage section. | FR-005 |

#### New Files (MUST create)

| # | File | Type | Rationale | FRs Covered |
|---|------|------|-----------|-------------|
| 4 | `src/claude/agents/01-requirements-critic.md` | NEW AGENT | Critic role: structured critique against Creator output, BLOCKING/WARNING classification, finding references to specific requirement/AC/NFR IDs. Follows agent naming convention `NN-agent-name.md`. | FR-002 |
| 5 | `src/claude/agents/01-requirements-refiner.md` | NEW AGENT | Refiner role: takes Creator artifacts + Critic findings, produces improved artifacts with all BLOCKING findings addressed. Given/When/Then enforcement, NFR quantification, escalation for unresolvable findings. | FR-003 |

#### Secondary Impact (LIKELY changes)

| # | File | Change Type | Rationale | FRs Covered |
|---|------|-------------|-----------|-------------|
| 6 | `src/claude/CLAUDE.md.template` | MINOR EDIT | Document debate mode in framework capabilities section, mention --debate/--no-debate flags in workflow-first development section. | FR-005 |
| 7 | `src/claude/hooks/config/iteration-requirements.json` | MINOR EDIT | Ensure `01-requirements` phase config is compatible with multi-round debate (min_menu_interactions may need adjustment when debate is ON since the Critic/Refiner operate without menus). | FR-004 |
| 8 | `docs/AGENTS.md` | MINOR EDIT | Update agent count (17 -> 19), add entries for 01-requirements-critic and 01-requirements-refiner. | CON-003 |
| 9 | `docs/ARCHITECTURE.md` | MINOR EDIT | Document debate loop architecture pattern, add to Phase 01 section. | NFR-005 |

#### Tertiary Impact (MAY change)

| # | File | Change Type | Rationale |
|---|------|-------------|-----------|
| 10 | `src/claude/hooks/lib/common.cjs` | POSSIBLE MINOR | If convergence helper functions are needed (e.g., `isDebateConverged()`, `parseDebateRound()`). Per requirements, debate orchestration is prompt-level so this may NOT be needed. |
| 11 | `src/claude/agents/discover-orchestrator.md` | NO CHANGE | Inception Party precedent -- read only for pattern reference, no modifications needed. |
| 12 | `src/claude/agents/discover/party-personas.json` | NO CHANGE | Read only for pattern reference. |
| 13 | `src/claude/hooks/config/skills-manifest.json` | POSSIBLE MINOR | May need new skill IDs for Critic/Refiner if skill enforcement is extended to new agents. |
| 14 | `.isdlc/state.json` | RUNTIME ONLY | New fields at runtime: `active_workflow.debate_mode`, `active_workflow.debate_state` -- no schema changes needed. |

### Dependency Map

```
isdlc.md (command)
  |-- parses --debate/--no-debate flags
  |-- passes debate config to
  v
00-sdlc-orchestrator.md (orchestrator)
  |-- resolves debate_mode (flag + sizing)
  |-- writes active_workflow.debate_mode to state.json
  |-- IF debate ON:
  |     |-- delegates to Creator (01-requirements-analyst.md)
  |     |      |-- produces Round N artifacts
  |     |-- delegates to Critic (01-requirements-critic.md) [NEW]
  |     |      |-- reviews artifacts, produces critique
  |     |-- IF blocking findings:
  |     |      |-- delegates to Refiner (01-requirements-refiner.md) [NEW]
  |     |      |      |-- produces improved artifacts
  |     |      |-- loop back to Critic (max 3 rounds)
  |     |-- saves final artifacts
  |-- IF debate OFF:
        |-- delegates to 01-requirements-analyst.md (unchanged single-agent)
```

### Change Propagation Paths

1. **Flag path**: `isdlc.md` -> `orchestrator` -> `state.json (debate_mode)` -> all debate agents
2. **Artifact path**: Creator -> Critic -> Refiner -> final artifacts (requirements-spec.md, user-stories.json, etc.)
3. **State path**: orchestrator -> `active_workflow.debate_state` -> round tracking -> debate-summary.md
4. **Config path**: `iteration-requirements.json` -> gate-blocker hook -> Phase 01 validation

---

## Entry Points

### M2: Implementation Entry Points

#### Existing Entry Points Affected

| Entry Point | File | How Affected |
|-------------|------|--------------|
| `/isdlc feature "description"` | `src/claude/commands/isdlc.md` | New flag parsing (--debate, --no-debate) |
| Phase 01 delegation | `src/claude/agents/00-sdlc-orchestrator.md` | New debate loop delegation path |
| Requirements capture start | `src/claude/agents/01-requirements-analyst.md` | Conversational opening, debate-mode behavior fork |
| GATE-01 validation | `src/claude/hooks/config/iteration-requirements.json` | Debate-compatible validation rules |

#### New Entry Points to Create

| Entry Point | File | Purpose |
|-------------|------|---------|
| Critic review invocation | `src/claude/agents/01-requirements-critic.md` | Receives Creator artifacts, produces critique |
| Refiner improvement invocation | `src/claude/agents/01-requirements-refiner.md` | Receives artifacts + critique, produces improvements |

#### New Artifacts Produced per Round

| Artifact | Purpose | Created By |
|----------|---------|------------|
| `round-N-critique.md` | Audit trail of Critic findings per round | Critic |
| `debate-summary.md` | Summary of all rounds, findings, and changes | Orchestrator (post-convergence) |

#### Implementation Chain (per FR)

**FR-001 (Creator Role)**:
1. `01-requirements-analyst.md` -- Add debate-mode awareness section
2. `01-requirements-analyst.md` -- Modify INVOCATION PROTOCOL to detect debate context
3. `01-requirements-analyst.md` -- Label artifacts as "Round N Draft" when debate ON

**FR-002 (Critic Role)**:
1. Create `01-requirements-critic.md` -- Full new agent definition
2. Define BLOCKING/WARNING finding taxonomy
3. Define structured critique output format (JSON + markdown)

**FR-003 (Refiner Role)**:
1. Create `01-requirements-refiner.md` -- Full new agent definition
2. Define artifact update protocol (in-place update of all 4 artifacts)
3. Define escalation path for unresolvable findings (Article IV)

**FR-004 (Debate Loop Orchestration)**:
1. `00-sdlc-orchestrator.md` -- Add debate loop section to Phase 01 delegation
2. `00-sdlc-orchestrator.md` -- Add convergence check logic
3. `00-sdlc-orchestrator.md` -- Add round tracking in `active_workflow.debate_state`
4. `00-sdlc-orchestrator.md` -- Add max-3-rounds hard limit with unconverged warning

**FR-005 (Configuration)**:
1. `isdlc.md` -- Parse `--debate` and `--no-debate` flags
2. `00-sdlc-orchestrator.md` -- Resolve debate_mode from flags + sizing
3. `state.json` -- Write `active_workflow.debate_mode` (boolean)
4. `CLAUDE.md.template` -- Document flags for user visibility

**FR-006 (Artifact Versioning)**:
1. `00-sdlc-orchestrator.md` -- Save `round-N-critique.md` per round
2. `00-sdlc-orchestrator.md` -- Generate `debate-summary.md` post-convergence
3. Final artifacts overwrite standard names

**FR-007 (Conversational Creator)**:
1. `01-requirements-analyst.md` -- Rewrite INVOCATION PROTOCOL section
2. `01-requirements-analyst.md` -- Replace 3 generic opening questions with contextual reflect-and-ask pattern
3. `01-requirements-analyst.md` -- Add organic lens exploration logic

**FR-008 (Orchestrator Delegation)**:
1. `00-sdlc-orchestrator.md` -- Modify Phase 01 delegation section
2. `00-sdlc-orchestrator.md` -- Add debate state tracking
3. `isdlc.md` -- Pass debate config in delegation context

#### Recommended Implementation Order

1. **FR-005** (Configuration) -- Foundation: flag parsing and state storage
2. **FR-007** (Conversational Creator) -- Independent improvement to single-agent mode
3. **FR-001** (Creator Role) -- Enhanced requirements-analyst with debate awareness
4. **FR-002** (Critic Role) -- New agent definition
5. **FR-003** (Refiner Role) -- New agent definition
6. **FR-004** (Debate Loop Orchestration) -- Wire up the loop in orchestrator
7. **FR-008** (Orchestrator Delegation) -- Complete delegation updates
8. **FR-006** (Artifact Versioning) -- Round snapshots and summary

Rationale: Configuration first (enables all other work), then Creator improvements (backward-compatible), then new agents (standalone files), then orchestration (wires everything together), then versioning (polish).

---

## Risk Assessment

### M3: Risk Analysis

#### Test Coverage in Affected Areas

| File | Existing Test Coverage | Risk |
|------|----------------------|------|
| `src/claude/agents/01-requirements-analyst.md` | NO dedicated tests (prompt-verification only for other agents) | HIGH -- primary file being rewritten, no regression safety net |
| `src/claude/agents/00-sdlc-orchestrator.md` | NO dedicated tests for Phase 01 delegation logic | HIGH -- debate loop adds complex branching |
| `src/claude/commands/isdlc.md` | NO dedicated tests for flag parsing | MEDIUM -- simple flag parsing, low complexity |
| `src/claude/CLAUDE.md.template` | Tests exist: `backlog-claudemd-template.test.cjs` | LOW -- only adding documentation text |
| `src/claude/hooks/config/iteration-requirements.json` | Tests exist: `constitutional-iteration-validator.test.cjs`, `menu-halt-enforcer.test.cjs` | MEDIUM -- schema changes could break validation hooks |
| `src/claude/hooks/lib/common.cjs` | Tests exist: `common-phase-detection.test.cjs`, `common-code-review.test.cjs` | LOW -- minimal or no changes expected |
| New: `01-requirements-critic.md` | NO tests (new file) | MEDIUM -- new prompt, needs verification tests |
| New: `01-requirements-refiner.md` | NO tests (new file) | MEDIUM -- new prompt, needs verification tests |

#### Complexity Hotspots

| Area | Cyclomatic Complexity | Risk |
|------|----------------------|------|
| Debate loop orchestration in `00-sdlc-orchestrator.md` | HIGH (branching: debate ON/OFF, convergence check, round tracking, max limit, unconverged handling) | The orchestrator already handles complex mode-based delegation. Adding debate loop increases cognitive complexity significantly. |
| Creator behavior fork in `01-requirements-analyst.md` | MEDIUM (if debate ON: label as draft, skip final save; if debate OFF: current behavior unchanged) | The analyst is already the longest agent file (1781 lines). Adding debate awareness adds another mode to track. |
| Flag precedence resolution | LOW (explicit flag > sizing-based default > light default) | Simple priority chain, similar to existing `-light` and `--supervised` patterns. |
| Convergence logic | MEDIUM (blocking findings == 0 -> converge; round >= 3 -> force exit; both paths must save correctly) | Well-defined exit conditions, but edge case: what if Critic produces 0 findings on Round 1? Should still save without Refiner. |

#### Technical Debt Markers

| Area | Debt Type | Impact |
|------|-----------|--------|
| `01-requirements-analyst.md` already 1781 lines | SIZE DEBT | Adding debate sections increases this further; may need future refactoring to extract debate-aware sections |
| `00-sdlc-orchestrator.md` already very large | SIZE DEBT | Adding debate orchestration section increases cognitive load; mitigated by clear section headers |
| No test infrastructure for prompt content verification of Phase 01 agents | TESTING DEBT | New Critic/Refiner agents will lack regression tests; recommend adding prompt-verification tests |
| `iteration-requirements.json` Phase 01 config assumes single-agent flow | CONFIG DEBT | `min_menu_interactions: 3` may conflict with debate rounds where Critic/Refiner do not present menus to the user |

#### Risk Zones (Intersection of Low Coverage + Breaking Changes)

| Risk Zone | Why It's Risky | Mitigation |
|-----------|---------------|------------|
| Phase 01 single-agent regression | No tests verify current single-agent behavior; rewriting the analyst could break it silently | Write regression tests for single-agent mode BEFORE making changes |
| Debate loop infinite loop | If convergence logic has a bug, the loop could run forever | Max 3 rounds hard limit in orchestrator; unit test for convergence logic |
| Iteration-requirements.json compatibility | Gate-blocker hook reads `interactive_elicitation.menu_interactions` -- debate rounds may not count as menu interactions | Verify hook behavior with debate mode; may need `debate_mode_override` in config |
| State.json schema stability | Adding `debate_state` and `debate_mode` fields to `active_workflow` must not break existing hooks that read state.json | Use additive-only changes; no field removals or renames |

#### Recommendations per Acceptance Criterion Category

**HIGH PRIORITY (add tests before modifying)**:
- AC-001-02 (debate OFF behavior unchanged): Write regression test verifying current single-agent output
- AC-005-02 (light flag = debate OFF): Write test verifying light flag bypass
- AC-005-03 (--no-debate flag): Write test verifying explicit disable
- AC-004-01 (convergence on 0 blocking): Write unit test for convergence check

**MEDIUM PRIORITY (test during implementation)**:
- AC-002-01 through AC-002-05 (Critic findings): Prompt verification tests for critique quality
- AC-003-01 through AC-003-04 (Refiner behavior): Prompt verification tests for refinement quality
- AC-006-01 through AC-006-03 (orchestrator delegation): Integration test for debate loop

**LOW PRIORITY (test post-implementation)**:
- AC-004-03, AC-004-04 (artifact versioning): Verify round snapshots and debate summary
- AC-007-01 through AC-007-03 (conversational Creator): Prompt content verification

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: Configuration (FR-005) -> Conversational Creator (FR-007) -> Creator enhancements (FR-001) -> Critic agent (FR-002) -> Refiner agent (FR-003) -> Debate orchestration (FR-004, FR-008) -> Artifact versioning (FR-006)

2. **High-Risk Areas**:
   - `01-requirements-analyst.md` -- add prompt-verification tests for current behavior BEFORE modifying
   - `00-sdlc-orchestrator.md` Phase 01 delegation -- add integration test for debate loop convergence
   - `iteration-requirements.json` -- verify gate-blocker hook compatibility with debate mode

3. **Dependencies to Resolve**:
   - FR-004/FR-008 depend on FR-001, FR-002, FR-003 (all three agents must exist before the loop can work)
   - FR-005 has no dependencies (flag parsing is standalone)
   - FR-007 has no dependencies (conversational improvement is standalone)
   - FR-006 depends on FR-004 (artifact versioning requires the loop to exist)

4. **Precedent Patterns to Follow**:
   - Inception Party `party-personas.json` for agent persona definitions
   - Inception Party `discover-orchestrator.md` Phase 2 for propose-critique-converge interaction
   - Existing `-light` flag pattern for `--debate`/`--no-debate` flag handling

5. **Key Constraint**: ~85% of changes are prompt/markdown edits. Only ~15% is JavaScript (possible convergence helpers in common.cjs, iteration-requirements.json config). This means the primary risk is prompt quality, not code correctness.

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-14T17:25:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0014-multi-agent-requirements-team/requirements-spec.md",
  "quick_scan_used": "docs/requirements/REQ-0014-multi-agent-requirements-team/quick-scan.md",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["debate", "creator", "critic", "refiner", "convergence", "conversational", "flags", "round", "artifact-versioning", "delegation", "requirements", "phase-01"],
  "files_directly_affected": 14,
  "modules_affected": 5,
  "risk_level": "medium",
  "blast_radius": "medium",
  "coverage_gaps": 5
}
```
