# Quick Scan: BUG-0028 - Agents Ignore Injected Gate Requirements

**Generated**: 2026-02-22T00:00:00Z
**Bug ID**: BUG-0028 / GH-64
**Issue**: Agents ignore injected gate requirements — wasted iterations on hook-blocked actions
**Phase**: 00-quick-scan
**Analysis Mode**: ANALYSIS (no state.json writes, no branch creation)

---

## Executive Summary

This bug concerns a gap in the gate requirements pre-injection system (REQ-0024). When agents attempt blocked actions (like committing during intermediate phases), the hook safety net catches it, but iterations are wasted on the attempted action before the block. The issue is that injected gate requirements are not being reliably perceived or acted upon by agents, even though they are formatted into the delegation prompt.

---

## Scope Estimate

**Estimated Scope**: MEDIUM (10-18 files affected)
**File Count Estimate**: ~14-15 files
**Confidence**: MEDIUM-HIGH
**Complexity**: MEDIUM (logic issue, not architectural refactoring)

### Scope Rationale

The bug spans:
1. **Gate injection mechanism** (1-2 files) — `gate-requirements-injector.cjs`
2. **Phase delegation logic** (1 file) — `isdlc.md` command specification
3. **Hook enforcement** (2-3 files) — gate-blocker and dispatchers
4. **Agent instructions** (3-5 files) — agents that receive injections
5. **Test coverage** (4-6 files) — existing tests + new regression tests

The fix likely involves clarifying injection content, ensuring agents receive and acknowledge constraints, and possibly adding explicit constraint parsing/acknowledgment steps.

---

## Keyword Matches

### Domain Keywords

| Keyword | File Matches | Impact |
|---------|--------------|--------|
| gate requirements | 18 files | Core injection system |
| injected constraint | 5 files | Injection mechanism |
| phase delegation | 5 files | Delegation/injection coordination |
| iteration wasted | 1 file | Bug report context |
| hook-blocked | 3 files | Hook enforcement |
| do not commit | 0 files | Constraint not explicitly surfaced |

### Technical Keywords

| Keyword | File Matches | Impact |
|---------|--------------|--------|
| REQ-0024 | 6 files | Gate injection requirement |
| gate-blocker | 5 files | Hook enforcement |
| pre-task-dispatcher | 2 files | Hook coordination |
| gate-requirements-injector | 3 files | Injection library |
| buildGateRequirementsBlock | 2 files | Injection formatting |
| iteration-requirements.json | 4 files | Gate config |

### Architecture Keywords

| Keyword | File Matches | Impact |
|---------|--------------|--------|
| phase agent | 64 files | Injection targets |
| prompt injection | 3 files | Delivery mechanism |
| delegation prompt | 5 files | Injection point |
| fail-open | 2 files | Design pattern (gate-requirements-injector) |
| self-healing | 3 files | Hook behavior |

---

## Key Files Involved

### Critical Path Files (Must Inspect)

| File | LOC | Purpose | Risk Level |
|------|-----|---------|-----------|
| `src/claude/hooks/lib/gate-requirements-injector.cjs` | 369 | Builds gate requirement blocks for injection | HIGH |
| `src/claude/commands/isdlc.md` | 2800+ | Phase delegation logic (STEP 3d) | HIGH |
| `src/claude/hooks/gate-blocker.cjs` | 882 | Enforces gate requirements | HIGH |
| `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` | 300+ | Coordinates hook execution order | MEDIUM |
| `src/claude/hooks/config/iteration-requirements.json` | 782 | Gate requirement definitions | MEDIUM |

### Agent Files (Injection Targets)

Agents that receive gate-injected constraints:
- `src/claude/agents/00-sdlc-orchestrator.md` — Processes injected rules
- `src/claude/agents/05-software-developer.md` — Git commit constraints
- `src/claude/agents/01-requirements-analyst.md` — Phase progression constraints
- `src/claude/agents/06-integration-tester.md` — Testing phase constraints
- ~58 other agents — General phase constraints

### Hook Files

- `src/claude/hooks/gate-blocker.cjs` — Enforcement engine
- `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` — Consolidates 9 hooks
- `src/claude/hooks/iteration-corridor.cjs` — Tests corridor enforcement
- `src/claude/hooks/constitution-validator.cjs` — Constitutional validation

---

## Initial Assessment: Bug Categories

### Hypothesis 1: Injection Content Not Appearing in Prompt

**Likelihood**: MEDIUM
**Evidence**:
- `gate-requirements-injector.cjs` has fail-open design (returns '' on error)
- No explicit validation that block was added to prompt
- Injection happens in `isdlc.md` STEP 3d but no acknowledgment check

**Impact**: If injection silently fails, agent never sees constraints

### Hypothesis 2: Agent Not Parsing/Acknowledging Injected Block

**Likelihood**: MEDIUM
**Evidence**:
- No explicit instruction in agent prompts to acknowledge gate requirements
- Agent instructions may predate REQ-0024 implementation
- 64 agents; not all may have been updated with injection awareness

**Impact**: Injection appears in prompt but agent ignores or misinterprets it

### Hypothesis 3: Injection Order/Timing Issue

**Likelihood**: MEDIUM
**Evidence**:
- `isdlc.md` delegation has 9 steps before STEP 3d (gate injection)
- Pre-task-dispatcher consolidates 9 hooks; execution order matters
- Phase delegations may receive stale injection if state changes mid-flow

**Impact**: Constraints injected but become outdated during execution

### Hypothesis 4: Constitutional vs. Gate Requirements Confusion

**Likelihood**: LOW
**Evidence**:
- Two separate systems: constitutional validation + gate requirements
- Agents may conflate "Article constraints" with "gate constraints"
- Both mention compliance but different enforcement paths

**Impact**: Agent acknowledges one system but ignores the other

---

## Blast Radius Summary

### Files That Will Likely Change

1. **Injection Library** (1 file)
   - `src/claude/hooks/lib/gate-requirements-injector.cjs` — Add validation logging

2. **Phase Delegation Logic** (1 file)
   - `src/claude/commands/isdlc.md` — Add explicit injection validation in STEP 3d

3. **Agent Prompts** (5-10 files)
   - Key agents: orchestrator, software-developer, requirements-analyst, testers
   - Add explicit constraint acknowledgment sections

4. **Test Files** (5-8 files)
   - New test for injection presence in delegation prompts
   - Regression tests for gate constraint adherence
   - Tests for fail-open behavior

5. **Documentation** (2-3 files)
   - `docs/HOOKS.md` — Clarify gate injection lifecycle
   - `docs/SKILL-ENFORCEMENT.md` — Update constraint documentation
   - Agent SKILL files if injection handling becomes complex

### Files That Will NOT Change

- Core iteration-requirements.json (config, not code)
- Pre-task-dispatcher (orchestration, not constraint source)
- Most hook files (gate-blocker is enforcement, not injection source)

---

## Questions for Requirements Phase

1. **Injection Validation**: Should agents explicitly parse and acknowledge the injected gate requirements block, or is implicit compliance sufficient?

2. **Constraint Language**: Are current constraints clear enough (e.g., "DO NOT commit" vs. "You may NOT use git commit")?

3. **Failure Mode**: When an agent violates an injected constraint, should the hook:
   - Block immediately (current behavior)?
   - Block + escalate (new feedback loop)?
   - Block + re-inject with stronger language?

4. **Scope of Injection**: Which agents need explicit injection acknowledgment? All 64, or just the 5-10 that frequently violate constraints?

5. **Testing Coverage**: Should regression tests verify:
   - Injection presence in every phase delegation?
   - Agent comprehension of injected constraints?
   - Hook blocking on constraint violations?

---

## Technical Debt Observations

- `gate-requirements-injector.cjs` uses fail-open design, which silently hides injection failures
- No centralized registry of what constraints are injected per phase
- Agent prompt templates are scattered across 64 files; no unified constraint acknowledgment pattern
- Pre-task-dispatcher has 9 hooks; execution order is critical but not documented in comments

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-22T00:00:00Z",
  "search_duration_ms": 2100,
  "keywords_searched": 14,
  "files_matched": 85,
  "scope_estimate": "medium",
  "confidence_level": "medium-high",
  "hypothesis_count": 4,
  "bug_category": "Logic Issue (Injection/Constraint Handling)",
  "estimated_effort_hours": "4-6",
  "risk_profile": "medium",
  "blocker_count": 0,
  "notes": "Bug likely involves clarifying constraint injection, improving agent acknowledgment, and adding validation tests. No architectural changes required."
}
```

---

## Next Steps

**Phase 01 (Requirements)**:
- Clarify expected behavior when agents receive injected constraints
- Specify how agents should acknowledge or validate constraints
- Define success criteria for constraint compliance

**Phase 02 (Impact Analysis)**:
- Map all 64 agents to their constraint categories
- Identify which agents need explicit acknowledgment updates
- Assess hook execution order dependencies

**Phase 02-Tracing** (if root cause analysis needed):
- Capture live examples of constraint violations
- Trace hook execution order during violations
- Verify injection content in delegation prompts
