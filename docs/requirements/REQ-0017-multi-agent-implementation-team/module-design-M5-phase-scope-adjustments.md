# Module Design M5: Phase 16/08 Scope Adjustments

**Module:** Conditional scope additions to `16-quality-loop-engineer.md` and `07-qa-engineer.md`
**Type:** Modified agents (markdown prompt additions)
**Locations:**
- `src/claude/agents/16-quality-loop-engineer.md`
- `src/claude/agents/07-qa-engineer.md`
**Traces:** FR-005 (AC-005-01 through AC-005-04)
**Phase:** 04-design (REQ-0017)

---

## 1. Module Purpose

Adjust the scope of Phase 16 (Quality Loop) and Phase 08 (Code Review) when the per-file implementation loop has already performed individual file reviews in Phase 06. The scope adjustment is conditional: it only applies when `implementation_loop_state` exists and has status "completed" in state.json. When the implementation team did not run, behavior is unchanged (NFR-002).

## 2. Detection Mechanism (ADR-0003)

Both agents use the same detection logic:

```
Read state.json -> active_workflow.implementation_loop_state

IF implementation_loop_state exists
   AND implementation_loop_state.status == "completed":
     MODE = "reduced_scope"
ELSE:
     MODE = "full_scope"   (unchanged behavior)
```

**Fail-safe (Article X):** If state.json cannot be read, or `implementation_loop_state` is missing, malformed, or has status != "completed", default to `full_scope`. The agent never fails because of missing implementation_loop_state.

---

## 3. Phase 16: Quality Loop Engineer -- "Final Sweep" Mode

### 3.1 Insertion Point

A new section titled "IMPLEMENTATION TEAM SCOPE ADJUSTMENT" is inserted AFTER the "Phase Overview" table and BEFORE "MANDATORY ITERATION ENFORCEMENT". This ensures the scope adjustment is detected early before any work begins.

**Estimated insertion point:** After line ~17 (Phase Overview table), before line ~37 (MANDATORY ITERATION ENFORCEMENT)

### 3.2 Section Content

```markdown
# IMPLEMENTATION TEAM SCOPE ADJUSTMENT

Before starting quality checks, determine scope based on whether the per-file
implementation loop ran in Phase 06.

## Scope Detection

Read `active_workflow.implementation_loop_state` from state.json:

IF implementation_loop_state exists AND status == "completed":
  Run in FINAL SWEEP mode (reduced scope).
  The per-file Reviewer in Phase 06 already checked individual files for:
  logic correctness, error handling, security, code quality, test quality,
  tech-stack alignment, and constitutional compliance.

IF implementation_loop_state is absent OR status != "completed":
  Run in FULL SCOPE mode (unchanged behavior, no regression).
```

### 3.3 Final Sweep Mode -- What Changes (AC-005-01, AC-005-02)

**INCLUDE in Final Sweep mode (batch-only checks):**

| Check | Track | Skill | Rationale |
|-------|-------|-------|-----------|
| Full test suite execution | A | QL-002 | Per-file loop ran tests per-file; need full suite for integration |
| Coverage measurement | A | QL-004 | Aggregate coverage not checked per-file |
| Mutation testing | A | QL-003 | Not feasible per-file; requires full codebase |
| Build verification | A | QL-007 | Full build was not done per-file |
| npm audit / dependency audit | B | QL-009 | Not a per-file check |
| SAST security scan | B | QL-008 | Static analysis benefits from full codebase context |
| Lint check | B | QL-005 | Full lint across all files for cross-file consistency |
| Type check | B | QL-006 | Full type checking requires all files |
| Traceability matrix verification | B | - | Not a per-file check; verifies all requirements covered |

**EXCLUDE from Final Sweep mode (already done by Reviewer in Phase 06):**

| Check | Why Excluded |
|-------|-------------|
| Individual file logic review | IC-01 checked by Reviewer per file |
| Individual file error handling review | IC-02 checked by Reviewer per file |
| Individual file security review | IC-03 checked by Reviewer per file |
| Individual file code quality review | IC-04 checked by Reviewer per file |
| Individual file test quality review | IC-05 checked by Reviewer per file |
| Individual file tech-stack alignment | IC-06 checked by Reviewer per file |
| Individual file constitutional compliance | IC-07 checked by Reviewer per file |

**Key distinction:** Final Sweep mode still runs the automated code review skill (QL-010) but only for CROSS-FILE patterns (e.g., inconsistent interfaces between modules, circular dependencies, dead imports across files). It does NOT re-review individual file quality.

### 3.4 Final Sweep Mode -- MAX_ITERATIONS Files

Files that received the MAX_ITERATIONS verdict in Phase 06 deserve extra attention:

```markdown
## MAX_ITERATIONS Files

Read implementation_loop_state.per_file_reviews and identify files with
verdict == "MAX_ITERATIONS". These files still have unresolved BLOCKING
findings from the per-file loop.

For each MAX_ITERATIONS file:
1. Read the per_file_reviews entry to understand remaining findings
2. Include these files in the automated code review (QL-010) with
   explicit attention to the unresolved categories
3. Note remaining issues in the quality report
```

### 3.5 Full Scope Mode (NFR-002)

When `implementation_loop_state` is absent or status != "completed":
- Run ALL existing checks (Track A + Track B) exactly as today
- No behavioral change whatsoever
- This is the default/fallback path

### 3.6 Estimated Change

**Lines added:** ~30-50 lines (IMPLEMENTATION TEAM SCOPE ADJUSTMENT section)
**Lines modified:** 0 (no existing text changed)

---

## 4. Phase 08: QA Engineer -- "Human Review Only" Mode

### 4.1 Insertion Point

A new section titled "IMPLEMENTATION TEAM SCOPE ADJUSTMENT" is inserted AFTER "# CONSTITUTIONAL PRINCIPLES" and BEFORE "# CORE RESPONSIBILITIES". This ensures the scope adjustment is detected before the review checklist is applied.

**Estimated insertion point:** After line ~31 (CONSTITUTIONAL PRINCIPLES), before line ~33 (CORE RESPONSIBILITIES)

### 4.2 Section Content

```markdown
# IMPLEMENTATION TEAM SCOPE ADJUSTMENT

Before starting code review, determine scope based on whether the per-file
implementation loop ran in Phase 06.

## Scope Detection

Read `active_workflow.implementation_loop_state` from state.json:

IF implementation_loop_state exists AND status == "completed":
  Run in HUMAN REVIEW ONLY mode (reduced scope).
  The per-file Reviewer in Phase 06 already checked individual files for:
  logic correctness, error handling, security, code quality, test quality,
  tech-stack alignment, and constitutional compliance.

IF implementation_loop_state is absent OR status != "completed":
  Run in FULL SCOPE mode (unchanged behavior, no regression).
```

### 4.3 Human Review Only Mode -- What Changes (AC-005-03, AC-005-04)

**INCLUDE in Human Review Only mode:**

| Check | Rationale |
|-------|-----------|
| Architecture decisions | Cross-file architectural coherence not checkable per-file |
| Business logic coherence | Requires understanding of the full feature, not individual files |
| Design pattern compliance | Cross-module patterns not visible per-file |
| Non-obvious security concerns | Subtle security issues that emerge from file interactions |
| Merge approval | Human judgment on overall readiness |
| Requirement completeness | Verify all requirements are implemented across the full changeset |
| Integration coherence | How do all the new/modified files work together? |

**EXCLUDE from Human Review Only mode (already done by Reviewer in Phase 06):**

| Check | Why Excluded |
|-------|-------------|
| Logic correctness (per-file) | IC-01 checked by Reviewer |
| Error handling (per-file) | IC-02 checked by Reviewer |
| Security (per-file) | IC-03 checked by Reviewer -- Phase 08 still checks CROSS-file security |
| Code quality: naming, DRY, complexity | IC-04 checked by Reviewer |
| Test quality (per-file) | IC-05 checked by Reviewer |
| Tech-stack alignment | IC-06 checked by Reviewer |

### 4.4 Modified Code Review Checklist

In Human Review Only mode, the existing CODE REVIEW CHECKLIST is replaced with:

```markdown
## CODE REVIEW CHECKLIST (Human Review Only Mode)

When the per-file implementation loop ran in Phase 06, the Reviewer already
checked individual file quality. Focus this review on cross-cutting concerns:

- [ ] Architecture decisions align with design specifications
- [ ] Business logic is coherent across all new/modified files
- [ ] Design patterns are consistently applied
- [ ] Non-obvious security concerns (cross-file data flow, auth boundaries)
- [ ] All requirements from requirements-spec.md are implemented
- [ ] Integration points between new/modified files are correct
- [ ] No unintended side effects on existing functionality
- [ ] Overall code quality impression (human judgment)
- [ ] Merge approval: ready for main branch
```

The standard checklist (logic, error handling, naming, DRY, SRP, etc.) is shown but marked as "Already verified by Implementation Reviewer in Phase 06" with a note that human reviewers may still flag issues they notice.

### 4.5 MAX_ITERATIONS Files in Phase 08

Similar to Phase 16, Phase 08 should give extra attention to MAX_ITERATIONS files:

```markdown
## MAX_ITERATIONS Files

Read implementation_loop_state.per_file_reviews for files with
verdict == "MAX_ITERATIONS". These files may have unresolved BLOCKING
findings. Review them with full attention, not reduced scope.
```

### 4.6 Full Scope Mode (NFR-002)

When `implementation_loop_state` is absent or status != "completed":
- Run the FULL code review checklist exactly as today
- No behavioral change whatsoever
- This is the default/fallback path

### 4.7 Estimated Change

**Lines added:** ~30-50 lines (IMPLEMENTATION TEAM SCOPE ADJUSTMENT section + modified checklist)
**Lines modified:** 0 (existing checklist preserved, new conditional checklist added)

---

## 5. Risk: Scope Narrowing Safety

The primary risk is that narrowing scope in Phase 16/08 causes defects to slip through. Mitigations:

| Risk | Mitigation |
|------|-----------|
| Reviewer missed a defect in Phase 06 | Phase 16 still runs full test suite, coverage, SAST, audit; Phase 08 still does human review |
| Cross-file issues not caught per-file | Phase 16 QL-010 (automated code review) runs on full codebase; Phase 08 reviews integration coherence |
| MAX_ITERATIONS files with unresolved findings | Both Phase 16 and Phase 08 give extra attention to these files |
| Detection mechanism failure | Fail-safe: absent/malformed state -> full scope (Article X) |
| Regression in debate_mode=false path | Full scope behavior unchanged when implementation team did not run (NFR-002) |

## 6. AC Coverage Matrix

| AC | Design Element | Section |
|----|---------------|---------|
| AC-005-01 | Phase 16 focuses on batch-only checks when implementation team ran | 3.3 |
| AC-005-02 | Phase 16 MUST NOT re-review individual file logic/quality | 3.3 (EXCLUDE table) |
| AC-005-03 | Phase 08 focuses on architecture, business logic, design pattern, security, merge approval | 4.3 |
| AC-005-04 | Phase 08 MUST NOT re-check naming, DRY, complexity, error handling | 4.3 (EXCLUDE table) |
