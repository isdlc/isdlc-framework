# Workflow Task Templates

Template task descriptions organized by workflow type and phase. The `generate-plan` skill (ORCH-012) uses this file to produce `.isdlc/tasks.md`.

**Format rules:**
- Plain text descriptions only (no checkboxes, no IDs)
- The generate-plan skill adds `TNNNN` numbering, `[P]` markers, and `- [ ]` formatting
- Task descriptions should be concise and action-oriented

---

## build

### 05-test-strategy
- Design test strategy aligned with requirements and acceptance criteria
- Define test cases for each functional requirement
- Establish test data requirements
- Map test traceability to requirements

### 06-implementation
<!-- Tasks below are high-level placeholders. The refinement step (3e-refine) will
     expand them with file-level annotations, traceability, and dependency sub-lines
     once the design phase completes. -->
- Check existing test infrastructure
- Write failing unit tests (TDD Red)
- Implement code to pass tests (TDD Green)
- Iterate until all tests pass with 80% coverage
- Refactor and validate code quality
- Validate constitutional compliance

### 16-quality-loop
- Run full test suite
- Run static code analysis and linting
- Check type correctness
- Scan for security vulnerabilities
- Verify coverage thresholds met
- Fix any issues found and re-run

### 08-code-review
- Perform code review
- Run static code analysis
- Analyze quality metrics
- Assess technical debt
- Produce QA sign-off

---
