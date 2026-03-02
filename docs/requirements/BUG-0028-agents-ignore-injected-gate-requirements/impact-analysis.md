# Impact Analysis: BUG-0028 -- Agents Ignore Injected Gate Requirements

**Generated**: 2026-02-22
**Bug ID**: BUG-0028 / GH-64
**Based On**: Requirements Specification (Phase 01)
**Phase**: 02-impact-analysis
**Analysis Mode**: ANALYSIS (no state.json writes, no branch creation)

---

## Scope Comparison

| Aspect | Original (Quick Scan) | Clarified (Requirements Spec) |
|--------|----------------------|-------------------------------|
| Description | Agents ignore injected gate requirements | 6 targeted FRs: injection format, prohibitions, acknowledgment, agent audit, block feedback, regression tests |
| Keywords | gate requirements, injection, constraint | CRITICAL CONSTRAINTS, formatBlock, branch-guard stopReason, inline prohibition |
| Estimated Files | ~14-15 | 8-10 (tighter scope, fewer agent files) |
| Scope Change | - | REFINED (narrowed from "investigate 4 hypotheses" to "6 concrete FRs") |

---

## Executive Summary

This bug fix targets four layers of the gate-constraint delivery pipeline: (1) the injection format produced by `gate-requirements-injector.cjs`, (2) the delegation prompt template in `isdlc.md`, (3) competing instructions in agent `.md` files, and (4) the post-hook block messages from `branch-guard.cjs`. The blast radius is contained -- the core logic change is in a single function (`formatBlock()`, 80 lines), with ripple effects limited to prompt templates and 4-5 agent files. The primary risk is prompt-engineering efficacy: strengthened injection format is a hypothesis that must be validated empirically. No architectural changes are required. Test coverage for the injector is strong (62 existing assertions across 11 test suites); new tests are additive.

**Blast Radius**: LOW-MEDIUM (8-10 files directly modified, 2-3 modules)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 10 (directly modified)
**Affected Modules**: 3 (hooks/lib, commands, agents)

---

## Impact Analysis

### Tier 1: Direct Changes (files that WILL be modified)

| # | File | FR | Change Type | Lines Affected (est.) | Risk |
|---|------|----|-------------|----------------------|------|
| 1 | `src/claude/hooks/lib/gate-requirements-injector.cjs` | FR-001, FR-002 | MODIFY `formatBlock()` | ~40-60 new lines | MEDIUM |
| 2 | `src/claude/hooks/tests/gate-requirements-injector.test.cjs` | FR-006 | ADD new test suite | ~80-120 new lines | LOW |
| 3 | `src/claude/commands/isdlc.md` | FR-003 | MODIFY STEP 3d injection block | ~5-10 lines | LOW |
| 4 | `src/claude/agents/05-software-developer.md` | FR-004 | MODIFY: inline commit prohibition | ~3-5 lines | LOW |
| 5 | `src/claude/agents/16-quality-loop-engineer.md` | FR-004 | MODIFY: inline commit prohibition | ~3-5 lines | LOW |
| 6 | `src/claude/agents/07-qa-engineer.md` | FR-004 | REVIEW: already has inline prohibition (line 159) | 0 lines (verify only) | NONE |
| 7 | `src/claude/agents/06-integration-tester.md` | FR-004 | REVIEW: no commit references found | ~2-3 lines if needed | LOW |
| 8 | `src/claude/hooks/branch-guard.cjs` | FR-005 | MODIFY `outputBlockResponse()` message | ~5-10 lines | LOW |

### Tier 2: Transitive Dependencies (files that consume outputs of Tier 1)

| # | File | Relationship | Impact |
|---|------|-------------|--------|
| 1 | `src/claude/hooks/dispatchers/pre-task-dispatcher.cjs` | Dispatches hooks including branch-guard | NO CHANGE -- message format change is internal to branch-guard |
| 2 | `src/claude/hooks/gate-blocker.cjs` | Enforces gate requirements | NO CHANGE -- AC-005-02 is verify-only (already implemented) |
| 3 | `src/claude/hooks/config/iteration-requirements.json` | Config consumed by injector | NO CHANGE (CON-004: no schema changes) |
| 4 | `src/claude/hooks/lib/common.cjs` | `outputBlockResponse()` used by branch-guard | NO CHANGE -- function signature unchanged |
| 5 | All 64 agent `.md` files | Receive injection block in prompt | NO CHANGE (only 4-5 key violators are audited) |

### Tier 3: Side Effects

| # | Area | Risk | Mitigation |
|---|------|------|------------|
| 1 | Context window budget | Injection block grows up to 40% (NFR-001) | Character count test (AC-001-04) caps growth |
| 2 | Agent behavior regression | Strengthened wording could confuse agents on unconstrained phases | CON-003: fail-open for unconstrained phases |
| 3 | Existing test breakage | New format changes assertion strings | Existing tests use `includes()` checks, not exact-match; LOW risk |

### Dependency Map

```
FR-001 (formatBlock)
  |
  +-- FR-002 (phase-specific prohibitions) -- depends on FR-001 structure
  |     |
  |     +-- FR-003 (acknowledgment in isdlc.md) -- references FR-001/002 output
  |
  +-- FR-006 (regression tests) -- tests FR-001/002 output

FR-004 (agent audit) -- independent, no code dependency on FR-001
FR-005 (branch-guard messages) -- independent, no code dependency on FR-001
```

---

## Entry Points

### Entry Point 1: `formatBlock()` in gate-requirements-injector.cjs (FR-001, FR-002)

**File**: `src/claude/hooks/lib/gate-requirements-injector.cjs`
**Function**: `formatBlock()` (line 212-291)
**Current behavior**: Produces a plain-text block starting with `GATE REQUIREMENTS FOR PHASE NN (Name):` followed by iteration requirements summary and a footer.

**Changes needed**:
1. Add a `CRITICAL CONSTRAINTS` section BEFORE the `Iteration Requirements:` section (AC-001-01)
2. Populate `CRITICAL CONSTRAINTS` with imperative prohibitions derived from:
   - Phase position in workflow (intermediate = "Do NOT run git commit")
   - `constitutional_validation.enabled` status (AC-001-03)
   - `workflowModifiers` keys like `require_failing_test_first` (AC-002-03)
   - `artifact_validation.paths` (AC-002-02)
3. Add a constraint reminder at the end of the block, restating key prohibitions (AC-001-02)
4. Character count must stay within 40% growth (AC-001-04)

**Implementation chain**:
```
formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers)
  -> NEW: buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers)
  -> existing: iteration requirements summary
  -> existing: artifact paths
  -> existing: constitutional articles
  -> existing: workflow modifiers
  -> NEW: buildConstraintReminder(criticalConstraints)
  -> return joined lines
```

**Callers of formatBlock()**: Only `buildGateRequirementsBlock()` (same file, line 349). No external callers.

### Entry Point 2: STEP 3d in isdlc.md (FR-003)

**File**: `src/claude/commands/isdlc.md`
**Location**: Lines 1622-1652 (GATE REQUIREMENTS INJECTION block)
**Current behavior**: Formats and appends the gate requirements block. No instruction for the agent to acknowledge constraints.

**Changes needed**:
1. After step 5 (format and append block), add an instruction line: "Read the CRITICAL CONSTRAINTS block and confirm compliance before starting work." (AC-003-01)
2. This is a ~2-line addition to the delegation prompt template.

**Impact**: Every phase delegation will now include the acknowledgment instruction. This is by design -- even phases with no constraints will have the instruction (but the CRITICAL CONSTRAINTS section will be empty/absent for such phases, so the agent will simply note "no constraints").

### Entry Point 3: Agent `.md` files (FR-004)

**Files**:
- `src/claude/agents/05-software-developer.md` -- Line 29: `> See **Git Commit Prohibition** in CLAUDE.md.`
- `src/claude/agents/16-quality-loop-engineer.md` -- Line 33: `> See **Git Commit Prohibition** in CLAUDE.md.`
- `src/claude/agents/07-qa-engineer.md` -- Line 159: Already has inline `Do NOT run git add, git commit, git push`
- `src/claude/agents/06-integration-tester.md` -- No commit references found

**Critical finding**: The "Git Commit Prohibition" section referenced by agents does NOT exist in `CLAUDE.md`. This is a broken cross-reference. The agents are told to "See" a section that is not there. This directly explains why the software-developer agent ignores the prohibition -- there is nothing to see.

**Changes needed**:
1. `05-software-developer.md`: Replace the cross-reference with an inline prohibition:
   ```
   > **Git Commit Prohibition**: Do NOT run `git commit` during intermediate phases.
   > The orchestrator manages all git operations (add, commit, merge) at workflow finalize.
   > Attempting to commit will be blocked by the branch-guard hook and waste an iteration.
   ```
2. `16-quality-loop-engineer.md`: Same inline prohibition.
3. `07-qa-engineer.md`: Verify existing inline prohibition is sufficient (AC-004-03).
4. `06-integration-tester.md`: Add inline prohibition if the agent has implementation responsibilities.

### Entry Point 4: branch-guard.cjs block messages (FR-005)

**File**: `src/claude/hooks/branch-guard.cjs`
**Location**: Lines 203-216 (`outputBlockResponse()` call for intermediate phase blocking)
**Current behavior**: Message says "COMMIT BLOCKED (Phase: NN): Commits are not allowed..." and suggests alternatives. It does NOT reference the specific injected constraint.

**Changes needed**:
1. Add to the block message: (a) the specific constraint violated ("The GATE REQUIREMENTS for this phase prohibit git commit during intermediate phases"), (b) a clear directive ("The orchestrator manages git commits after the final phase") (AC-005-01)
2. Verify gate-blocker.cjs `action_required` fields are intact (AC-005-02 -- verify only, already implemented).

### Entry Point 5: Test file (FR-006)

**File**: `src/claude/hooks/tests/gate-requirements-injector.test.cjs`
**Current state**: 62 assertions across 11 test suites. Covers `formatBlock()`, `buildGateRequirementsBlock()`, helpers, edge cases.

**Changes needed**:
1. Add new test suite "Injection salience" (AC-006-01, AC-006-02, AC-006-03)
2. Tests to verify:
   - `formatBlock()` output for `06-implementation` contains `CRITICAL CONSTRAINTS` before `Iteration Requirements:` (AC-006-01)
   - Output ends with constraint reminder, not just generic footer (AC-006-02)
   - Phases with `constitutional_validation.enabled = true` include constitutional reminder in CRITICAL CONSTRAINTS (AC-006-03)
3. Optional: character count test for NFR-001 (40% growth budget)

---

## Risk Assessment

### Risk Matrix

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | Strengthened injection format does not improve agent compliance | HIGH (defeats purpose of fix) | MEDIUM | This is a prompt engineering hypothesis. Validate through observation post-deployment. Fallback: hook safety net still catches violations. |
| R2 | Injection block grows beyond 40% budget, consuming context window | MEDIUM | LOW | AC-001-04 enforces 40% cap via test. NFR-003 caps total at 2000 chars. |
| R3 | Existing tests break due to format changes | LOW | LOW | Existing tests use `includes()` checks (not exact-match). New format is additive (sections added, not renamed). |
| R4 | Agent files with inlined prohibition conflict with injected block | LOW | LOW | Dual reinforcement is intentional -- inline + injected is better than either alone. |
| R5 | branch-guard message change breaks dependent parsers | LOW | VERY LOW | `outputBlockResponse()` output is consumed by Claude (not parsed programmatically). Format is human-readable text. |

### Test Coverage Gaps

| File | Current Coverage | Gap |
|------|-----------------|-----|
| `gate-requirements-injector.cjs` | HIGH (62 assertions, 11 suites) | No tests for CRITICAL CONSTRAINTS section (does not exist yet) |
| `branch-guard.cjs` | MEDIUM (test file exists) | No test for specific constraint reference in block message |
| `isdlc.md` | NONE (prompt template, not testable via unit tests) | N/A -- prompt templates are validated by integration observation |
| Agent `.md` files | NONE (static prompt files) | N/A -- content audited manually |

### Complexity Assessment

| FR | Complexity | Rationale |
|----|-----------|-----------|
| FR-001 | MEDIUM | Modifying `formatBlock()` with new section; must maintain fail-open, character budget |
| FR-002 | MEDIUM | Phase-aware logic to derive prohibitions from config; must handle all phase types |
| FR-003 | LOW | 2-line addition to delegation prompt template |
| FR-004 | LOW | Text replacement in 2-4 agent files |
| FR-005 | LOW | String modification in branch-guard block message |
| FR-006 | LOW | Additive test suite following existing patterns |

---

## Implementation Recommendations

### Suggested Implementation Order

```
1. FR-001 (formatBlock CRITICAL CONSTRAINTS)     -- foundation for FR-002, FR-006
2. FR-002 (phase-specific prohibitions)           -- depends on FR-001 structure
3. FR-006 (regression tests)                      -- tests FR-001 + FR-002
4. FR-004 (agent file audit)                      -- independent, can run in parallel with 1-3
5. FR-003 (isdlc.md acknowledgment instruction)   -- independent, can run in parallel
6. FR-005 (branch-guard messages)                 -- independent, can run in parallel
```

**Parallelism**: FR-004, FR-003, and FR-005 are fully independent of each other and of FR-001/002. They can be implemented in any order or in parallel.

**Critical path**: FR-001 -> FR-002 -> FR-006 (must be sequential).

### High-Risk Areas (add tests first)

1. `formatBlock()` -- The only function with MEDIUM risk. Write FR-006 tests for the new format BEFORE or alongside the FR-001/FR-002 implementation (TDD approach).
2. Character count budget -- Add a test that measures `formatBlock()` output length for `06-implementation` before and after changes.

### Dependencies to Resolve

1. **Broken cross-reference**: `> See **Git Commit Prohibition** in CLAUDE.md.` points to a section that does not exist. This is the single most important finding of this analysis -- it is a direct, confirmed root cause of the observed agent behavior (not just a hypothesis). Fixing FR-004 resolves this immediately.
2. **No new external dependencies**: All changes are within existing modules. No new imports, no schema changes, no config changes.

---

## Key Finding: Broken Cross-Reference (Root Cause Confirmed)

The most significant discovery in this analysis is that the "Git Commit Prohibition" section referenced by both `05-software-developer.md` (line 29) and `16-quality-loop-engineer.md` (line 33) **does not exist in CLAUDE.md**. When an agent encounters `> See **Git Commit Prohibition** in CLAUDE.md.`, it attempts to look up a section that is not there. The agent then has no prohibition to follow, and falls back on its own judgment (which includes training-data habits like "save your work").

This transforms RC-2 ("Agent prompt files contain competing instructions") from a MEDIUM-confidence hypothesis to a **confirmed root cause**. The cross-reference is not just "competing" -- it is a dead link that provides zero constraint information.

**Recommendation**: FR-004 (inline prohibition) should be treated as the highest-priority fix. Even without FR-001/FR-002 (injection format improvements), inlining the prohibition in agent files would likely reduce violations significantly.

---

## Impact Analysis Metadata

```json
{
  "analysis_completed_at": "2026-02-22",
  "sub_agents": ["M1-impact-analyzer", "M2-entry-point-finder", "M3-risk-assessor"],
  "verification_status": "not_performed",
  "requirements_document": "docs/requirements/BUG-0028-agents-ignore-injected-gate-requirements/requirements-spec.md",
  "quick_scan_used": "docs/requirements/BUG-0028-agents-ignore-injected-gate-requirements/quick-scan.md",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["gate requirements", "injection", "constraint", "CRITICAL CONSTRAINTS", "formatBlock", "branch-guard", "commit prohibition", "salience"],
  "files_directly_affected": 10,
  "modules_affected": 3,
  "risk_level": "low-medium",
  "blast_radius": "low-medium",
  "coverage_gaps": 0
}
```
