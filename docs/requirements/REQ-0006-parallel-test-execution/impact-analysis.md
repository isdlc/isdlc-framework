# Impact Analysis: REQ-0006 Parallel Test Execution

**Generated**: 2026-02-13T06:20:00Z
**Feature**: Parallel test execution (T4-B) with framework detection, CPU core detection, sequential fallback, and parallel test creation (T4-A) with sub-agent spawning
**Based On**: Phase 01 Requirements (finalized) - 6 FRs, 22 ACs
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Backlog) | Clarified (Phase 01) |
|--------|-------------------|----------------------|
| Description | Parallel test execution (T4-B) + parallel test creation (T4-A) | 6 FRs covering framework detection, agent prompt updates, CPU core detection, sequential fallback, parallel test creation, state tracking |
| Keywords | parallel, test, workers, threads | parallel, test, framework detection, CPU cores, fallback, flakiness, state tracking, sub-agents, quality report |
| Estimated Files | 4-5 agent .md files | 5 agent .md files (confirmed) + 0 hooks + 0 CJS modules |
| Scope Change | - | EXPANDED: Added FR-03 (CPU core detection), FR-04 (sequential fallback with flakiness), FR-06 (state tracking with parallel_execution field), expanded framework support from 4 to 7 frameworks, added software-developer (Agent 05) to affected agents |

---

## Executive Summary

This feature is a **prompt-only change** affecting 5 agent markdown files. No hooks, no CJS modules, no new dependencies are required (per Article V and Article XII constraints). The blast radius is contained to agent prompts that control test execution behavior. The primary risk is prompt coherence -- the existing agent prompts are large (400-800 lines) and adding parallel execution instructions must not conflict with existing test infrastructure discovery, ATDD mode, or Article XI enforcement sections. The test-watcher hook (`test-watcher.cjs`) already recognizes all major test command patterns and will automatically track parallel test runs without modification. State tracking (FR-06) adds a new `parallel_execution` field to `test_results` in state.json, but this is written by agents (prompt-driven), not by hooks.

**Blast Radius**: LOW (5 files, 1 module category: agents)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 5 agent .md files
**Affected Modules**: src/claude/agents/ (agent prompts only)

---

## Impact Analysis (M1)

### Directly Affected Files

| # | File | Agent | Change Type | ACs Covered |
|---|------|-------|-------------|-------------|
| 1 | `src/claude/agents/05-software-developer.md` | Software Developer | MODIFY | AC-01.1, AC-01.2, AC-01.3, AC-02.4, AC-02.5, AC-03.1-AC-03.4, AC-04.1-AC-04.4, AC-06.1, AC-06.2 |
| 2 | `src/claude/agents/06-integration-tester.md` | Integration Tester | MODIFY | AC-01.1, AC-01.2, AC-02.2, AC-02.5, AC-04.1, AC-06.1 |
| 3 | `src/claude/agents/10-dev-environment-engineer.md` | Environment Builder | MODIFY | AC-01.1, AC-01.2, AC-02.1, AC-02.5 |
| 4 | `src/claude/agents/16-quality-loop-engineer.md` | Quality Loop Engineer | MODIFY | AC-01.1, AC-01.2, AC-02.3, AC-02.5, AC-04.1, AC-06.1, AC-06.3 |
| 5 | `src/claude/agents/04-test-design-engineer.md` | Test Design Engineer | MODIFY | AC-05.1, AC-05.2, AC-05.3, AC-05.4 |

### Outward Dependencies (What Depends on These Files)

These agent .md files are consumed by Claude Code as agent prompts. They are referenced by:

| Dependent | Dependency Type | Impact |
|-----------|----------------|--------|
| `.claude/settings.json` or equivalent | Agent registration | None -- file paths unchanged |
| `src/claude/hooks/delegation-gate.cjs` | Phase-to-agent mapping validation | None -- agent names unchanged |
| `src/claude/hooks/config/skills-manifest.json` | Skill ownership declarations | None -- no new skills added |
| `00-sdlc-orchestrator.md` | Delegation prompts reference agent names | None -- agent names unchanged |
| Test-watcher hook | Monitors test commands from these agents | None -- already recognizes parallel test commands |

### Inward Dependencies (What These Files Depend On)

| Dependency | Used By | Impact |
|-----------|---------|--------|
| `.isdlc/state.json` | All 5 agents read/write state | FR-06 adds `parallel_execution` field to `test_results` (new field, no schema conflicts) |
| `docs/isdlc/constitution.md` | Constitutional validation | No changes needed |
| `docs/isdlc/test-evaluation-report.md` | Test infrastructure discovery | Agents will continue to read this; parallel flags are additive |
| `package.json` / project config | Framework detection | Agents read existing project files; no changes to detection logic |

### Change Propagation Analysis

```
Change Origin: Agent prompt modifications (.md files)
                    |
                    v
Level 1: Direct changes to 5 agent prompts
         (Add parallel execution lookup table, fallback logic, state tracking)
                    |
                    v
Level 2: state.json gains new field (parallel_execution in test_results)
         (Written by agents during prompt execution, not by hooks)
         quality-report.md gains new section (Parallel Execution)
         (Written by Agent 16 during quality report generation)
                    |
                    v
Level 3: No further propagation
         (Hooks do not need changes; no new modules)
```

**Propagation Depth**: 2 levels (prompt -> state/report)
**Cascading Risk**: NONE -- changes are self-contained in prompt behavior

---

## Entry Points (M2)

### Existing Entry Points Relevant to Each FR

| FR | Entry Point | File | Current Location |
|----|------------|------|-----------------|
| FR-01 (Framework Detection) | Test Command Discovery Protocol | `05-software-developer.md` lines 98-110 | "Test Command Discovery" section |
| FR-01 (Framework Detection) | Command Discovery Protocol | `06-integration-tester.md` lines 136-145 | "Command Discovery Protocol" section |
| FR-01 (Framework Detection) | Tool Discovery Protocol | `16-quality-loop-engineer.md` lines 43-55 | "Tool Discovery Protocol" section |
| FR-01 (Framework Detection) | Build Plan / Tech Stack Detection | `10-dev-environment-engineer.md` lines 37-39 | "scope: local" Steps section |
| FR-02 (Agent Prompt Updates) | Autonomous Iteration Protocol | `05-software-developer.md` lines 213-303 | "AUTONOMOUS ITERATION PROTOCOL" section |
| FR-02 (Agent Prompt Updates) | Autonomous Iteration Protocol | `06-integration-tester.md` lines 271-428 | "AUTONOMOUS ITERATION PROTOCOL" section |
| FR-02 (Agent Prompt Updates) | Parallel Execution Protocol | `16-quality-loop-engineer.md` lines 57-85 | "Parallel Execution Protocol" section |
| FR-03 (CPU Core Detection) | Test execution commands | All 4 execution agents | Within iteration workflows |
| FR-04 (Sequential Fallback) | Iteration Workflow steps | `05-software-developer.md`, `06-integration-tester.md`, `16-quality-loop-engineer.md` | Iteration protocol sections |
| FR-05 (Parallel Test Creation) | Test Case Design section | `04-test-design-engineer.md` lines 105-109 | "CORE RESPONSIBILITIES" section |
| FR-06 (State Tracking) | Iteration Tracking JSON blocks | `05-software-developer.md` lines 277-303, `06-integration-tester.md` lines 365-402 | Iteration tracking sections |

### New Entry Points Needed

| FR | New Section to Add | Target Agent | Insertion Point |
|----|-------------------|-------------|-----------------|
| FR-01 | **Parallel Test Execution: Framework Detection Table** | Agent 05, 06, 10, 16 | After existing "Test Command Discovery" or "Tool Discovery" sections |
| FR-02 | **Parallel Flag Application** instructions within iteration protocol | Agent 05, 06, 16 | Inside "Run Tests" step of iteration workflow |
| FR-03 | **CPU Core Detection** instructions (1-2 paragraphs) | Agent 05, 06, 10, 16 | Alongside FR-01 framework detection table |
| FR-04 | **Sequential Fallback on Parallel Failure** protocol | Agent 05, 06, 16 | After parallel test execution instructions |
| FR-05 | **Parallel Sub-Agent Test Creation** section | Agent 04 | New major section before "AUTONOMOUS CONSTITUTIONAL ITERATION" |
| FR-06 | **Parallel Execution State Tracking** JSON schema | Agent 05, 06, 16 | Within existing iteration tracking sections |

### Implementation Chain (Entry to Data Layer)

```
1. Agent reads project config files (package.json, go.mod, etc.)
   --> Detects test framework (FR-01)
   --> Determines parallel flag (FR-01)
   --> Detects CPU cores (FR-03)

2. Agent applies parallel flag to test command
   --> Runs: npm test -- --maxWorkers=auto (FR-02)
   --> If failures: retries failed tests sequentially (FR-04)
   --> Logs flakiness warnings if sequential pass (FR-04)

3. Agent writes results to state.json
   --> phases[phase].test_results.parallel_execution (FR-06)
   --> Includes: enabled, framework, flag, workers, fallback_triggered, flaky_tests

4. Quality Loop Engineer generates quality-report.md
   --> Includes "Parallel Execution" section (FR-06/AC-06.3)
```

### Recommended Implementation Order

| Order | FR | Agent File | Rationale |
|-------|-----|-----------|-----------|
| 1 | FR-01 + FR-03 | `05-software-developer.md` | Software Developer is the most-used agent and has the most ACs. Start here to establish the pattern (framework detection table + CPU core detection). |
| 2 | FR-02 + FR-04 + FR-06 | `05-software-developer.md` | Complete all FRs for Agent 05 first -- it's the template for the other agents. |
| 3 | FR-01 + FR-02 + FR-04 + FR-06 | `06-integration-tester.md` | Copy-adapt pattern from Agent 05 to Integration Tester. |
| 4 | FR-01 + FR-02 + FR-04 + FR-06 | `16-quality-loop-engineer.md` | Copy-adapt to Quality Loop Engineer, add quality-report.md parallel section (AC-06.3). |
| 5 | FR-01 + FR-02 | `10-dev-environment-engineer.md` | Environment Builder only needs framework detection + build verification parallelism (lighter touch). |
| 6 | FR-05 | `04-test-design-engineer.md` | Independent from T4-B. Add parallel sub-agent creation section. Can be done in parallel with steps 1-5. |

---

## Risk Assessment (M3)

### Test Coverage for Affected Files

| File | Current Test Coverage | Test Method | Risk |
|------|----------------------|-------------|------|
| `05-software-developer.md` | Prompt content review only | E2E workflow validation | LOW -- prompt changes are validated via E2E |
| `06-integration-tester.md` | Prompt content review only | E2E workflow validation | LOW |
| `10-dev-environment-engineer.md` | Prompt content review only | E2E workflow validation | LOW |
| `16-quality-loop-engineer.md` | Prompt content review only | E2E workflow validation | LOW |
| `04-test-design-engineer.md` | Prompt content review only | E2E workflow validation | LOW |
| `test-watcher.cjs` (NOT modified but related) | Unit tests exist | `tests/hooks/test-watcher.test.cjs` | N/A -- no modification needed |

**Note**: Agent .md files are prompt files, not executable code. They cannot have unit tests in the traditional sense. Testing is via E2E workflow execution where the agent follows its prompt instructions.

### Complexity Hotspots

| File | Lines | Complexity | Concern |
|------|-------|------------|---------|
| `05-software-developer.md` | 761 lines | HIGH | Largest agent prompt. Has ATDD mode, mechanical execution mode, TDD workflow, autonomous iteration -- adding parallel execution must not conflict with any of these modes. |
| `06-integration-tester.md` | 792 lines | HIGH | Large prompt with Article XI enforcement (5 rules), ATDD validation (4 steps), autonomous iteration -- parallel instructions must coexist with mutation testing and adversarial testing flows. |
| `16-quality-loop-engineer.md` | 170 lines | LOW | Relatively concise. Parallel track orchestration (Track A/B) already exists -- adding test parallelism is a natural extension of Track A. |
| `10-dev-environment-engineer.md` | 308 lines | LOW | Focused scope. Only needs framework detection for build verification. |
| `04-test-design-engineer.md` | 575 lines | MEDIUM | Has ATDD mode sections. The parallel sub-agent creation (FR-05) is a new major section but is independent of existing functionality. |

### Technical Debt Markers

| Area | Debt Item | Risk to This Feature |
|------|-----------|---------------------|
| Agent 05 TDD Workflow | Hard-coded example commands (`npm test`, `pytest`, `go test`) scattered in documentation blocks | LOW -- parallel flags are additive to existing commands |
| Agent 06 Article XI | Mutation testing and adversarial testing are referenced but may not be configured in all projects | LOW -- parallel execution is orthogonal to Article XI |
| Test-watcher hook | `TEST_COMMAND_PATTERNS` array (line 45-68) already includes all major test runners | NONE -- parallel flags don't change command recognition patterns. `npm test -- --maxWorkers=auto` still matches `/npm\s+test/i` |
| State.json schema | No formal schema enforcement for `test_results` field | LOW -- adding `parallel_execution` sub-field is additive; no breaking changes |
| Agent prompts lack version tracking | No way to track which version of instructions an agent was working with | LOW -- not impacted by this change |

### Risk Matrix by Acceptance Criterion

| AC | Risk Level | Rationale |
|----|-----------|-----------|
| AC-01.1 (Framework detection) | LOW | Table lookup -- deterministic, no logic complexity |
| AC-01.2 (Correct parallel flag) | LOW | Direct mapping from detection to flag |
| AC-01.3 (Fallback to sequential) | LOW | Default behavior -- no parallel flag = sequential |
| AC-02.1-AC-02.4 (Agent prompt updates) | LOW-MEDIUM | Risk is prompt coherence with existing sections |
| AC-02.5 (Lookup table in all agents) | LOW | Copy-paste with adaptation |
| AC-03.1-AC-03.4 (CPU core detection) | LOW | `os.cpus().length` is standard; agents already have bash access |
| AC-04.1 (Retry failed tests sequentially) | MEDIUM | Most complex behavioral change -- agent must detect parallel failures, extract failing test names, re-run only those tests. Prompt instructions must be precise. |
| AC-04.2 (Log flakiness warning) | LOW | Simple conditional logging |
| AC-04.3 (Flakiness in state.json) | LOW | New field in state, no conflicts |
| AC-04.4 (Only re-run failed tests) | MEDIUM | Agent must parse test output to extract individual failing test names. Different frameworks report failures differently. |
| AC-05.1-AC-05.4 (Parallel test creation) | LOW-MEDIUM | Sub-agent spawning via Task tool is well-established pattern in the framework (see discover-orchestrator.md). Risk is in cross-module test conflict resolution. |
| AC-06.1-AC-06.3 (State tracking) | LOW | Additive field, no schema conflicts |

### Risk Recommendations

1. **MEDIUM RISK: Sequential Fallback Logic (AC-04.1, AC-04.4)**
   - The prompt instructions for detecting parallel failures and re-running only failed tests must be very specific per framework
   - Recommendation: Include framework-specific commands for extracting failed test names in the lookup table
   - Example: Jest `--onlyFailures`, pytest `--lf`, Go test output parsing

2. **LOW-MEDIUM RISK: Prompt Size (Agent 05 and Agent 06)**
   - Agent 05 is already 761 lines. Adding ~80-100 lines for parallel execution could push it past comfortable prompt sizes
   - Recommendation: Keep the parallel execution section concise and self-contained. Use a single section with a clear heading rather than scattering instructions throughout the prompt

3. **LOW RISK: Test-Watcher Compatibility**
   - The test-watcher hook parses test output to detect pass/fail. Parallel test output may have interleaved lines
   - Recommendation: No changes needed -- the hook's patterns (lines 74-92) match on presence of failure keywords, which appear regardless of parallel vs sequential execution

4. **LOW RISK: ATDD Mode Interaction**
   - ATDD mode (Agent 05, Agent 06) processes tests in priority order (P0->P1->P2->P3). Parallel execution should NOT be applied to ATDD priority-ordered execution
   - Recommendation: Add a note in the parallel execution section that ATDD mode uses sequential execution for priority ordering

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**:
   - Start with Agent 05 (`software-developer.md`) -- highest AC coverage, establishes pattern
   - Then Agent 06 (`integration-tester.md`) -- second-highest complexity
   - Then Agent 16 (`quality-loop-engineer.md`) -- add quality report section
   - Then Agent 10 (`dev-environment-engineer.md`) -- lightest touch
   - Agent 04 (`test-design-engineer.md`) can be done in parallel with the above (independent FR-05)

2. **High-Risk Areas**: Sequential fallback logic (FR-04) needs framework-specific failure extraction commands. Design this carefully before implementation.

3. **Dependencies to Resolve**: None. All changes are prompt-only. No hooks, no CJS modules, no new dependencies.

4. **Key Constraint**: Article XII (no new CJS modules) and Article V (no new dependencies) mean this is entirely a prompt engineering task. Changes live in agent .md files only.

5. **ATDD Interaction**: Add explicit note that parallel execution is disabled during ATDD priority-ordered test runs to avoid interference with P0->P1->P2->P3 sequencing.

---

## Impact Analysis Metadata

```json
{
  "analysis_completed_at": "2026-02-13T06:20:00Z",
  "sub_agents": ["M1-impact-analyzer", "M2-entry-point-finder", "M3-risk-assessor"],
  "requirements_document": "docs/requirements/REQ-0006-parallel-test-execution/requirements-spec.md",
  "quick_scan_used": "N/A (Phase 00 skipped)",
  "scope_change_from_original": "expanded",
  "requirements_keywords": ["parallel", "test", "framework detection", "CPU cores", "fallback", "flakiness", "state tracking", "sub-agents", "quality report"],
  "files_analyzed": 5,
  "hooks_analyzed": 1,
  "skills_analyzed": 3,
  "blast_radius": "low",
  "risk_level": "low-medium",
  "change_type": "prompt-only (agent .md files)"
}
```
