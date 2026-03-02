# Requirements Specification: BUG-0028 — Agents Ignore Injected Gate Requirements

**Bug ID**: BUG-0028
**GitHub Issue**: [#64](https://github.com/vihang-hub/isdlc-framework/issues/64)
**Phase**: 01-requirements
**Scope**: Bug fix (medium complexity)
**Traces to**: REQ-0024 (gate requirements pre-injection), REQ-0025 (performance budget)

---

## 1. Problem Statement

Gate requirements pre-injection (REQ-0024) builds a text block summarizing what hooks will enforce and appends it to agent delegation prompts. Despite this, agents sometimes ignore the injected constraints and attempt blocked actions (e.g., `git commit` during intermediate phases). The hook safety net (`branch-guard.cjs`, `gate-blocker.cjs`) catches violations correctly, but the iteration is wasted -- the agent must recover, costing 1-2 minutes per violation and degrading performance budgets (REQ-0025).

### Observed Incident

During BUG-0029 Phase 06, the software-developer agent ran `git commit` despite the injected gate requirements block containing the constraint. The `branch-guard` hook blocked the commit, but the iteration was consumed.

### Root Causes (from quick-scan analysis)

| # | Root Cause | Confidence |
|---|-----------|------------|
| RC-1 | Injection format lacks salience -- `GATE REQUIREMENTS FOR PHASE NN` header is informational, not imperative; agents treat it as context rather than hard constraints | MEDIUM |
| RC-2 | Agent prompt files contain competing instructions (e.g., general "save your work" patterns from training data, or references like "See Git Commit Prohibition in CLAUDE.md" that don't explicitly state the prohibition inline) | MEDIUM |
| RC-3 | No explicit acknowledgment step -- agents receive constraints passively with no mechanism to confirm they have parsed and will obey them | MEDIUM |
| RC-4 | No post-hook feedback loop -- when a hook blocks an action, the block reason is returned as a `stopReason` but there is no mechanism to reinforce the constraint for the agent's next attempt | MEDIUM |

---

## 2. Scope

This is a targeted bug fix, not a rearchitecture. Changes are limited to:

1. **Injection format** (`gate-requirements-injector.cjs` `formatBlock()`) -- strengthen salience
2. **Delegation prompt template** (`isdlc.md` STEP 3d) -- add constraint acknowledgment instruction
3. **Agent file audit** (5-10 key agent `.md` files) -- remove or reconcile competing instructions
4. **Post-hook feedback** (hook block response format) -- ensure block reasons are actionable

Out of scope:
- Changing the fail-open design of `gate-requirements-injector.cjs`
- Modifying `gate-blocker.cjs` enforcement logic
- Restructuring `iteration-requirements.json` schema
- Changing hook execution order in `pre-task-dispatcher.cjs`

---

## 3. Functional Requirements

### FR-001: Strengthen Injection Block Format

The `formatBlock()` function in `gate-requirements-injector.cjs` must produce output with higher salience that agents treat as hard constraints rather than informational context.

**Current format** (line 219, `gate-requirements-injector.cjs`):
```
GATE REQUIREMENTS FOR PHASE 06 (Implementation):
```

**Required changes**:
- Add a `CRITICAL CONSTRAINTS` prefix section that extracts the most important prohibitions as short, imperative statements
- Place the constraint summary at the top of the block (before the detailed iteration requirements list)
- End the block with a repeated constraint reminder (recency bias)

**Acceptance Criteria**:

- **AC-001-01**: Given `formatBlock()` is called for a phase with `test_iteration.enabled = true`, When the block is generated, Then the output begins with a line containing "CRITICAL CONSTRAINTS" (case-sensitive) before the "Iteration Requirements:" section.

- **AC-001-02**: Given `formatBlock()` is called for any phase, When the block is generated, Then the output ends with a line that restates the key prohibitions (not just the generic "DO NOT attempt to advance the gate" footer).

- **AC-001-03**: Given `formatBlock()` is called for a phase where `constitutional_validation` is enabled, When the block is generated, Then the `CRITICAL CONSTRAINTS` section includes a line stating that constitutional validation must complete before gate advancement.

- **AC-001-04**: Given `formatBlock()` output is compared before and after this change, When the total character count is measured, Then the new format is no more than 40% longer than the old format (to avoid context window bloat).

### FR-002: Add Phase-Specific Prohibition Lines to Injection

The injection block must include explicit, phase-aware prohibition statements derived from the hook configuration, not just a summary of enabled/disabled flags.

**Acceptance Criteria**:

- **AC-002-01**: Given `formatBlock()` is called for a phase where intermediate commits are prohibited (any phase that is not the final phase in the workflow), When the block is generated, Then the `CRITICAL CONSTRAINTS` section includes the text "Do NOT run git commit" (or equivalent imperative prohibition).

- **AC-002-02**: Given `formatBlock()` is called and the phase has `artifact_validation.enabled = true`, When the block is generated, Then the constraints section includes a line listing the required artifact paths that must exist before gate advancement.

- **AC-002-03**: Given `formatBlock()` receives a `workflowModifiers` object, When the modifiers contain constraint-relevant keys (e.g., `require_failing_test_first`), Then the constraints section surfaces these as imperative statements (e.g., "You MUST write a failing test before implementing the fix").

### FR-003: Add Constraint Acknowledgment Instruction to Delegation Prompt

The delegation prompt template in `isdlc.md` STEP 3d must instruct the delegated agent to acknowledge the injected constraints before beginning work.

**Acceptance Criteria**:

- **AC-003-01**: Given the STEP 3d delegation prompt template in `isdlc.md`, When a phase delegation includes a gate requirements injection block, Then the prompt includes an instruction line directing the agent to "Read the CRITICAL CONSTRAINTS block and confirm compliance before starting work."

- **AC-003-02**: Given the acknowledgment instruction is present in the delegation prompt, When the agent begins execution, Then the agent's first substantive action should reference the constraints (this is a best-effort prompt engineering measure, not a deterministic enforcement).

### FR-004: Audit and Reconcile Agent File Instructions

Key agent `.md` files must be audited for instructions that compete with or contradict injected gate requirements. Competing instructions must be reconciled.

**Acceptance Criteria**:

- **AC-004-01**: Given the file `src/claude/agents/05-software-developer.md`, When its content is reviewed, Then it contains an explicit inline statement prohibiting `git commit` during intermediate phases (not just a cross-reference to CLAUDE.md).

- **AC-004-02**: Given any agent file in `src/claude/agents/` that contains a reference like "See Git Commit Prohibition in CLAUDE.md", When the file is audited, Then either (a) the prohibition text is inlined directly, or (b) the cross-reference is strengthened with an inline summary (e.g., "See Git Commit Prohibition in CLAUDE.md -- you MUST NOT run git commit; the orchestrator manages commits").

- **AC-004-03**: Given the agent files `05-software-developer.md`, `16-quality-loop-engineer.md`, `07-qa-engineer.md`, and `06-integration-tester.md`, When their instructions are reviewed, Then none contain language that could be interpreted as encouraging commits during intermediate phases (e.g., "save your work", "commit progress", "checkpoint your changes").

### FR-005: Improve Post-Hook Block Feedback

When a hook blocks an agent action, the block response must clearly identify which injected constraint was violated so the agent can correct course without guessing.

**Acceptance Criteria**:

- **AC-005-01**: Given `branch-guard.cjs` blocks a `git commit` during an intermediate phase, When the `stopReason` is returned, Then the message includes: (a) the specific constraint violated, (b) the current phase name, and (c) a clear directive of what to do instead (e.g., "The orchestrator manages git commits after the final phase").

- **AC-005-02**: Given `gate-blocker.cjs` blocks a gate advancement attempt, When the `stopReason` is returned, Then each unsatisfied requirement includes the `action_required` field with a specific remediation action (this is already implemented -- verify it remains intact).

### FR-006: Add Regression Tests for Injection Salience

New tests must verify that the strengthened injection format produces the expected structure.

**Acceptance Criteria**:

- **AC-006-01**: Given the test file `gate-requirements-injector.test.cjs`, When a new test suite "Injection salience" is added, Then it verifies that `formatBlock()` output for `06-implementation` contains a `CRITICAL CONSTRAINTS` section before the `Iteration Requirements:` section.

- **AC-006-02**: Given the test file `gate-requirements-injector.test.cjs`, When the salience tests run, Then they verify the output ends with a constraint reminder line (not just the generic "DO NOT attempt to advance" footer).

- **AC-006-03**: Given the test file `gate-requirements-injector.test.cjs`, When a test checks the block for a phase with `constitutional_validation.enabled = true`, Then the `CRITICAL CONSTRAINTS` section includes a constitutional validation reminder.

---

## 4. Non-Functional Requirements

### NFR-001: Performance Budget Preservation

| Attribute | Metric | Measurement |
|-----------|--------|-------------|
| `formatBlock()` execution time | p95 < 5ms | Benchmark test (the function does no I/O, only string concatenation) |
| `buildGateRequirementsBlock()` execution time | p95 < 50ms | Benchmark test (includes file I/O for config loading) |
| Injection block size increase | <= 40% over current output | Character count comparison test |

**Rationale**: The injection block is appended to every delegation prompt. Excessive growth would consume context window budget and slow agent processing.

### NFR-002: Fail-Open Design Preservation

| Attribute | Metric | Measurement |
|-----------|--------|-------------|
| Error handling | All new code paths wrapped in try/catch returning defaults | Code review |
| Silent failure | No new `throw` statements in `gate-requirements-injector.cjs` | Static analysis |
| Backward compatibility | Existing tests continue to pass without modification | Test suite run |

**Rationale**: REQ-0024 established fail-open as a design principle. Any injection failure must not block the workflow.

### NFR-003: Agent Prompt Size Budget

| Attribute | Metric | Measurement |
|-----------|--------|-------------|
| Total injection block size | < 2000 characters for a typical phase | Character count in integration test |
| Constraint summary section | < 500 characters | Character count in unit test |

**Rationale**: Agent prompts are already long (2000+ LOC for some agents). The injection block competes with other prompt content for attention.

---

## 5. Constraints

- **CON-001**: The `gate-requirements-injector.cjs` module must remain a pure CJS module with no external dependencies beyond `fs` and `path`.
- **CON-002**: The injection format must be plain text (no markdown, no HTML) to ensure it renders identically regardless of how the delegation prompt is consumed.
- **CON-003**: Agent file changes must not alter agent behavior for phases where no constraints apply (fail-open for unconstrained phases).
- **CON-004**: All changes must be backward-compatible with `iteration-requirements.json` v2.1.0 schema. No schema changes.

---

## 6. Assumptions

- **ASM-001**: The `GATE REQUIREMENTS` block is reliably injected into delegation prompts (i.e., the injection itself is not silently failing). This assumption is supported by the fail-open design returning `''` on error -- if injection fails, the agent simply doesn't see constraints, which is a separate bug. This requirement addresses the case where the block IS present but ignored.
- **ASM-002**: Strengthening the injection format (salience, imperative language, repetition) will measurably reduce constraint violations. This is a prompt engineering hypothesis that should be validated through observation after deployment.
- **ASM-003**: The `branch-guard.cjs` hook correctly blocks prohibited actions. This is verified by existing tests and is not in scope for this fix.

---

## 7. Files Affected (Estimated)

| File | Change Type | Risk |
|------|------------|------|
| `src/claude/hooks/lib/gate-requirements-injector.cjs` | Modify `formatBlock()` | MEDIUM -- core injection logic |
| `src/claude/hooks/tests/gate-requirements-injector.test.cjs` | Add new test suite | LOW |
| `src/claude/commands/isdlc.md` | Add acknowledgment instruction in STEP 3d | LOW |
| `src/claude/agents/05-software-developer.md` | Inline commit prohibition | LOW |
| `src/claude/agents/16-quality-loop-engineer.md` | Inline commit prohibition | LOW |
| `src/claude/agents/07-qa-engineer.md` | Review/reconcile constraints | LOW |
| `src/claude/agents/06-integration-tester.md` | Review/reconcile constraints | LOW |
| `src/claude/hooks/branch-guard.cjs` | Improve `stopReason` message | LOW |

---

## 8. Traceability

| Requirement | Traces To | Traces From |
|-------------|-----------|-------------|
| FR-001 | REQ-0024 (gate requirements pre-injection) | GH-64 (root cause RC-1) |
| FR-002 | REQ-0024, BUG-0012 (premature git commit) | GH-64 (root cause RC-1) |
| FR-003 | REQ-0024 | GH-64 (root cause RC-3) |
| FR-004 | BUG-0012 | GH-64 (root cause RC-2) |
| FR-005 | REQ-0024 | GH-64 (root cause RC-4) |
| FR-006 | FR-001, FR-002 | GH-64 (regression prevention) |
| NFR-001 | REQ-0025 (performance budget) | GH-64 (impact section) |
| NFR-002 | REQ-0024 (fail-open design) | GH-64 (design constraint) |
| NFR-003 | REQ-0025 (performance budget) | GH-64 (context window consideration) |

---

## 9. Out of Scope

- Rearchitecting the injection pipeline (e.g., moving from prompt injection to tool-based constraint delivery)
- Modifying `gate-blocker.cjs` enforcement logic
- Changing hook execution order in `pre-task-dispatcher.cjs`
- Adding deterministic constraint enforcement at the agent level (current approach is prompt-engineering-based, which is appropriate for the medium complexity scope)
- Updating all 64 agent files -- only the 4-5 agents most likely to violate constraints are in scope

---

## 10. Success Criteria

The fix is successful when:

1. The `formatBlock()` output includes a `CRITICAL CONSTRAINTS` section with imperative prohibitions
2. The STEP 3d delegation prompt instructs agents to acknowledge constraints
3. Key agent files (software-developer, quality-loop-engineer, qa-engineer, integration-tester) contain inline commit prohibitions without competing instructions
4. Hook block messages (`branch-guard.cjs`) include specific constraint references
5. All existing tests pass, and new salience tests verify the format changes
6. The injection block size stays within the 40% growth budget (NFR-001) and under 2000 characters total (NFR-003)
