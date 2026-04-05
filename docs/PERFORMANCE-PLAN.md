# Performance Optimization Plan — REQ-0010

**Goal**: Reduce iSDLC framework overhead from ~4x slower than native Claude Code to near-parity (~1.2-1.5x)
**Constraint**: Preserve all deterministic guarantees — gates, iteration limits, phase sequencing, constitutional validation, delegation enforcement
**Branch**: `feature/REQ-0010-performance`
**Estimated effort**: 4-6 sessions across Tier 1, Tier 2, Tier 3

---

## Diagnosis Summary

| Bottleneck | Current cost | Root cause |
|---|---|---|
| 8 sequential hook processes per Task call | ~200ms + 17 disk reads | Each hook = separate `node` spawn + `require(common.cjs)` + `readState()` |
| 6 sequential PostToolUse hook processes per Task call | ~90ms + 6 disk reads | Same pattern |
| Redundant state.json reads | ~170 reads per 9-phase feature | No caching between hooks in same event |
| Config file re-parsing | ~50 parses per feature (manifest 34K, iteration-req 17K) | No mtime-based cache |
| Orchestrator context reload per phase | ~100KB loaded on every phase transition | 2,260-line orchestrator re-entered for simple table lookup |
| Agent prompt bloat | ~60% boilerplate repeated across 48 agents | ROOT RESOLUTION, MONOREPO, constitutional sections duplicated |
| ~198 hook invocations per feature workflow | Cumulative latency | All hooks fire on all events even when irrelevant |

---

## Tier 1: Hook Consolidation + State Caching

**Impact**: ~1.5-2x speedup
**Risk to determinism**: None
**Effort**: 1-2 sessions

### T1-A: Unified Hook Dispatcher

**What**: Replace 8 separate `node` processes for PreToolUse[Task] with 1 dispatcher process that runs all checks in-process.

**Current flow** (per Task tool call):
```
Claude Code → spawn node gate-blocker.cjs        → read state → check → exit
Claude Code → spawn node iteration-corridor.cjs   → read state → check → exit
Claude Code → spawn node constitution-validator.cjs → read state → check → exit
... (8 processes, 8 state reads, 8 Node startups)
```

**New flow**:
```
Claude Code → spawn node pre-task-dispatcher.cjs →
  state = readState()                    ← 1 read
  config = loadCachedConfig()            ← 1 read (or cached)
  result = iterationCorridor(state, config)
  if (result.block) return result
  result = skillValidator(state, config)
  if (result.block) return result
  result = phaseLoopController(state, config)
  if (result.block) return result
  result = planSurfacer(state, config)
  if (result.block) return result
  result = phaseSequenceGuard(state, config)
  if (result.block) return result
  result = gateBlocker(state, config)
  if (result.block) return result
  result = constitutionValidator(state, config)
  if (result.block) return result
  result = testAdequacyBlocker(state, config)
  if (result.block) return result
  return { decision: "allow" }
```

**Files to create/modify**:
1. `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` — new unified dispatcher
2. `src/claude/hooks/dispatchers/post-task-dispatcher.cjs` — new unified dispatcher for PostToolUse[Task]
3. `src/claude/hooks/dispatchers/post-bash-dispatcher.cjs` — new unified dispatcher for PostToolUse[Bash]
4. `src/claude/hooks/dispatchers/post-write-dispatcher.cjs` — new unified dispatcher for PostToolUse[Write,Edit]
5. `src/claude/settings.json` — replace 8 hook entries with 1 dispatcher entry per event
6. Each existing hook `.cjs` — refactor to export a `check(state, config, input)` function alongside the existing standalone entry point

**Refactoring pattern for each hook**:
```javascript
// Before (standalone process):
const { readState, ... } = require('./lib/common.cjs');
const state = readState();
// ... check logic ...
if (shouldBlock) {
  console.log(JSON.stringify({ decision: 'block', reason: '...' }));
} else {
  // exit silently
}

// After (dual-mode: standalone OR importable):
function check(state, config, input) {
  // ... same check logic ...
  if (shouldBlock) {
    return { decision: 'block', reason: '...' };
  }
  return null; // allow
}

// Standalone mode (backward compat for non-Task events)
if (require.main === module) {
  const { readState, ... } = require('./lib/common.cjs');
  const state = readState();
  const result = check(state, {}, JSON.parse(process.argv[2] || '{}'));
  if (result) console.log(JSON.stringify(result));
}

module.exports = { check };
```

**Dispatchers to create**:

| Dispatcher | Replaces | Hooks consolidated |
|---|---|---|
| `pre-task-dispatcher.cjs` | 8 PreToolUse[Task] entries | iteration-corridor, skill-validator, phase-loop-controller, plan-surfacer, phase-sequence-guard, gate-blocker, constitution-validator, test-adequacy-blocker |
| `post-task-dispatcher.cjs` | 6 PostToolUse[Task] entries | log-skill-usage, menu-tracker, walkthrough-tracker, discover-menu-guard, phase-transition-enforcer, menu-halt-enforcer |
| `post-bash-dispatcher.cjs` | 3 PostToolUse[Bash] entries | test-watcher, review-reminder, atdd-completeness-validator |
| `post-write-dispatcher.cjs` | 3 PostToolUse[Write] + 2 PostToolUse[Edit] entries | state-write-validator, workflow-completion-enforcer, output-format-validator |

**Hooks that remain standalone** (only 1 hook per event, no consolidation benefit):
- `PreToolUse[Skill]` — 3 hooks but different event, keep separate OR create pre-skill-dispatcher
- `PreToolUse[Bash]` — branch-guard (only 1 hook)
- `PreToolUse[Write/Edit]` — explore-readonly-enforcer (only 1 hook)
- `PostToolUse[Skill]` — skill-delegation-enforcer (only 1 hook)
- `Stop` — delegation-gate (only 1 hook)

**Determinism guarantee**: Identical check functions, identical evaluation order, identical blocking behavior. Only the process spawning changes.

**Acceptance criteria**:
- [ ] All 1,065+ existing tests pass unchanged
- [ ] New dispatcher tests verify: same block/allow decisions as standalone hooks
- [ ] settings.json has fewer hook entries (26 → ~12)
- [ ] Hook-activity.log still records individual hook names (not just "dispatcher")
- [ ] Self-healing (diagnoseBlockCause, outputSelfHealNotification) still works through dispatcher
- [ ] Pending escalations still written correctly

### T1-B: Shared State + Config Cache

**What**: Dispatcher reads state.json and config files once, passes to all hooks. No hook reads state independently during dispatched execution.

**Implementation**:
```javascript
// In dispatcher:
const state = readState();
const iterReqs = loadIterationRequirements();
const manifest = loadManifest();
const workflows = loadWorkflows();

const config = { iterReqs, manifest, workflows };

// Pass to each check:
iterationCorridor.check(state, config, input);
gateBlocker.check(state, config, input);
// ...
```

**State write handling**: If a hook needs to write state (e.g., self-heal remediation), the dispatcher:
1. Lets the hook return a `stateUpdate` object
2. Applies all state updates at the end (after all checks pass)
3. Writes state.json once

This avoids read-after-write inconsistencies within a single event.

**Acceptance criteria**:
- [ ] Maximum 1 state.json read per tool event (down from 8-17)
- [ ] Maximum 1 config file read per tool event per config type
- [ ] State updates batched and written once at end of dispatcher

### T1-C: Early Exit Guards

**What**: Add fast-path exit at the top of each dispatcher for common no-op cases.

```javascript
// pre-task-dispatcher.cjs
const state = readState();

// Fast exit: no active workflow → most hooks are no-ops
if (!state.active_workflow) {
  // Only run hooks that work without active workflow
  // (branch-guard, explore-readonly-enforcer — but those are separate events)
  return; // silent allow
}
```

Many hooks already have `active_workflow` guards internally. Lifting this to the dispatcher level avoids even loading/calling hooks that will immediately exit.

**Acceptance criteria**:
- [ ] When no active_workflow, PreToolUse[Task] dispatcher exits in <5ms
- [ ] When active_workflow present, all checks still run

---

## Tier 2: Prompt Optimization

**Impact**: ~1.3-1.5x additional speedup
**Risk to determinism**: None (hooks untouched)
**Effort**: 1-2 sessions

### T2-A: Extract Shared Agent Boilerplate to CLAUDE.md

**What**: Move sections that are identical across all agents into project CLAUDE.md (loaded once per session by Claude Code, not per agent delegation).

**Sections to extract**:
1. **ROOT RESOLUTION** (~15 lines, repeated in ~40 agents)
2. **MONOREPO CONTEXT** (~30 lines, repeated in ~40 agents)
3. **Constitutional validation protocol** (~20 lines, repeated in ~35 agents)
4. **Iteration loop protocol** (~25 lines, repeated in ~25 agents)

**How**: Add a `## Agent Framework Context` section to CLAUDE.md with these shared protocols. Each agent replaces the full section with a one-line reference: `Follow ROOT RESOLUTION, MONOREPO, and ITERATION protocols from CLAUDE.md.`

**Estimated savings**: ~90 lines per agent × 40 agents = ~3,600 lines removed from agent prompts. Each agent delegation loads ~2-4KB less context.

**Acceptance criteria**:
- [ ] No agent duplicates ROOT RESOLUTION / MONOREPO / ITERATION protocols
- [ ] All protocols still accessible to agents via CLAUDE.md
- [ ] Hook enforcement unchanged (hooks don't read agent prompts)

### T2-B: Slim the Orchestrator

**What**: The 2,260-line orchestrator is loaded on every phase transition. Split into:
1. **Core orchestrator** (~800 lines): workflow init, phase selection, delegation, state management
2. **Phase reference data**: Move the full phase delegation table, monorepo context, and suggested prompts into a config file or conditional sections that only load when needed

**Target**: Orchestrator prompt under 1,000 lines (~40KB → ~15KB)

**Acceptance criteria**:
- [ ] Orchestrator markdown < 1,000 lines
- [ ] All workflow types still function correctly
- [ ] Gate enforcement unchanged

### T2-C: Conditional Agent Sections

**What**: Some agent sections are only relevant in specific workflow types:
- ATDD sections only needed when `atdd.enabled: true` in `.isdlc/config.json` (default per GH-216)
- Discovery context sections only needed post-discover
- Upgrade-specific sections only needed in upgrade workflow

Mark these with conditional headers. The orchestrator delegation prompt includes only the relevant context.

**Acceptance criteria**:
- [ ] Agent prompts ~30-40% smaller for standard (non-ATDD, non-upgrade) workflows
- [ ] Full content still available when needed

---

## Tier 3: Orchestrator Bypass + Conditional Hook Activation ✅

**Impact**: ~1.5-2x additional speedup
**Risk to determinism**: Medium — mitigated by hooks + state update protocol
**Effort**: 1 session (completed 2026-02-10)

### T3-A: Direct Phase Delegation from Phase-Loop Controller ✅

**What**: Phase-loop controller now delegates directly to phase agents, bypassing the orchestrator for mid-workflow transitions.

**Before**: phase-loop-controller → Task(orchestrator, MODE: single-phase) → Task(phase-agent)
**After**: phase-loop-controller → Task(phase-agent) directly

**Changes**:
1. `isdlc.md` STEP 3d replaced with DIRECT PHASE DELEGATION protocol
2. PHASE→AGENT lookup table added (20 phase→agent mappings)
3. New STEP 3e: POST-PHASE STATE UPDATE (phase status, index increment, next phase activation)
4. Discovery context injection for phases 02-03 only (same 24h staleness check)
5. Agent modifiers read from workflows.json and passed to agent prompt

**Orchestrator still required for**: init-and-phase-01, finalize

**Acceptance criteria**:
- [x] Feature workflow orchestrator invoked only twice (init + finalize) instead of 9 times
- [x] All gates still enforced (hooks fire on every Task call)
- [x] Phase sequence still validated by phase-sequence-guard hook
- [x] Agent delegation still validated by delegation-gate hook
- [x] Phase-loop controller performs post-phase state update (STEP 3e)

### T3-B: Conditional Hook Activation ✅

**What**: Hooks that are irrelevant to the current workflow state are skipped at the dispatcher level via `shouldActivate` guards.

**Changes**: All 5 dispatchers updated with activation conditions:
- **Pre-Task** (8 hooks): 7 require `active_workflow`; `test-adequacy-blocker` only for `15-upgrade-*` phases
- **Post-Task** (6 hooks): `menu-tracker`/`phase-transition-enforcer`/`menu-halt-enforcer` require `active_workflow`; `walkthrough-tracker`/`discover-menu-guard` require `discover` workflow type
- **Post-Bash** (3 hooks): `test-watcher`/`review-reminder` require `active_workflow`; `atdd-completeness-validator` requires `atdd_mode` option
- **Post-Write-Edit** (3 hooks): `output-format-validator` requires `active_workflow`; `workflow-completion-enforcer` only when `active_workflow` is null
- **Pre-Skill** (3 hooks): unchanged (already has global `active_workflow` guard)

**Acceptance criteria**:
- [x] Hooks still fire when their conditions are met (62 dispatcher tests pass)
- [x] Irrelevant hooks skipped silently (no noise)
- [x] No hook-activity.log entries for skips (too frequent, no audit value)

---

## Implementation Order

```
Session 1: T1-A (refactor hooks to export check(), create dispatchers) ✅
Session 2: T1-B + T1-C (state caching, early exits, test all) ✅
Session 3: T2-A + T2-B (prompt extraction, orchestrator slimming) ✅
Session 4: T3-A + T3-B (orchestrator bypass, conditional hooks) ✅
```

T1-T3 complete. Combined estimated speedup: ~4-6x from baseline (framework overhead).

---

## Tier 4: Test Execution Parallelism

**Impact**: Significant for test-heavy workflows (test-generate, quality-loop)
**Risk to determinism**: Low — parallelism is at agent/process level, not state mutation
**Effort**: 1-2 sessions

### T4-A: Parallel Test Creation (Test Design Agent)

**What**: The test design agent (`05-test-strategy`) currently generates all test cases sequentially. For large codebases with many modules, the agent should assess workload and spawn parallel sub-agents for test generation.

**Current flow**:
```
test-design-engineer → sequentially designs tests for module A, B, C, D ...
```

**New flow**:
```
test-design-engineer → assesses workload (module count, complexity) →
  if modules > threshold:
    spawn N parallel sub-agents, each handling a subset of modules
    collect and merge results
  else:
    sequential (current behavior)
```

**Implementation**:
1. `05-test-design-engineer.md`: add workload assessment step after test scope analysis
2. Define threshold (e.g., >3 modules or >500 lines of test surface)
3. Sub-agent prompt template: module scope, test type, style guide from constitution
4. Merge step: deduplicate, resolve cross-module dependencies, validate coverage targets

**Acceptance criteria**:
- [ ] Test design agent spawns parallel sub-agents when workload exceeds threshold
- [ ] Sub-agent results are merged without duplication or conflicts
- [ ] Sequential fallback works for small workloads
- [ ] Total test coverage meets the same targets as sequential generation

### T4-B: Maximize Parallel Execution of Local Testing

**What**: The environment builder (`11-local-testing`) and integration tester (`07-testing`) run test suites sequentially. Many test frameworks support parallel execution natively (Jest `--workers`, pytest `-n auto`, Go `go test -parallel`).

**Current flow**:
```
environment-builder → npm test (sequential)
integration-tester → npm run test:integration (sequential)
```

**New flow**:
```
environment-builder → detect test framework → apply parallel flags →
  Jest: --workers=auto --maxWorkers=75%
  pytest: -n auto
  Go: -parallel N
  Node test runner: --experimental-test-isolation=none (or concurrency flag)
quality-loop-engineer → Track A (Testing) runs parallel by default
```

**Implementation**:
1. Detect test framework from project config (package.json scripts, pytest.ini, go.mod)
2. Add parallel execution flags to test commands in agent prompts
3. `16-quality-loop-engineer.md`: Track A should explicitly use parallel flags
4. Handle CI-specific constraints (resource limits, flaky test isolation)
5. Fallback: if parallel execution causes failures, retry sequentially and log

**Acceptance criteria**:
- [ ] Test commands include parallelism flags appropriate to detected framework
- [ ] Quality loop Track A uses parallel execution by default
- [ ] Sequential fallback on parallel failure with diagnostic logging
- [ ] No change to test result accuracy (flaky test isolation maintained)

---

## Implementation Order (Updated)

```
Session 1: T1-A (refactor hooks to export check(), create dispatchers) ✅
Session 2: T1-B + T1-C (state caching, early exits, test all) ✅
Session 3: T2-A + T2-B (prompt extraction, orchestrator slimming) ✅
Session 4: T3-A + T3-B (orchestrator bypass, conditional hooks) ✅
Session 5: T4-A + T4-B (parallel test creation, parallel test execution)
```

---

## Test Strategy

- All 1,065+ existing tests must continue to pass
- New dispatcher tests: verify block/allow parity with standalone hooks
- Performance benchmarks: measure hook latency before/after with `console.time()` in dispatcher
- Integration test: run a mock feature workflow, count state.json reads (should drop from ~170 to ~20)

---

## What This Plan Does NOT Change

- Gate enforcement logic (same functions, same conditions)
- Phase sequencing rules (same hook checks)
- Iteration limits and circuit breakers (same thresholds)
- Constitutional validation (same requirements)
- Skill observability logging (same events logged)
- State.json schema (no changes)
- Workflow definitions (no changes to workflows.json)
- Self-healing behavior (same diagnosis + remediation)
- Hook blocking protocol (same JSON stdout contract)
