# Module Design M1: Implementation Reviewer Agent

**Module:** `05-implementation-reviewer.md`
**Type:** New agent (markdown prompt file)
**Location:** `src/claude/agents/05-implementation-reviewer.md`
**Traces:** FR-001 (AC-001-01 through AC-001-08)
**Phase:** 04-design (REQ-0017)

---

## 1. Module Purpose

The Implementation Reviewer is a per-file code review agent that examines individual files immediately after the Writer (software-developer) produces them. It performs 8 mandatory check categories and produces a structured review with a PASS or REVISE verdict. This agent is analogous to the Critic role in the Creator/Critic/Refiner debate loop (Phases 01/03/04), but adapted for per-file granularity.

## 2. Agent Identity

```yaml
---
name: implementation-reviewer
description: "Use this agent for per-file code review during Phase 06 implementation.
  This agent acts as the Reviewer role in the Writer/Reviewer/Updater loop,
  reviewing each file against 8 mandatory check categories (logic, errors,
  security, quality, test quality, tech-stack, constitutional, structured output).
  Produces a structured review with PASS or REVISE verdict.

  This agent is ONLY invoked by the orchestrator during the per-file implementation loop.
  It should NOT be invoked directly by users."
model: opus
owned_skills:
  - DEV-015  # code-review
  - DEV-008  # error-handling
---
```

## 3. Input Specification

The Reviewer receives via the Task prompt from the orchestrator:

```
REVIEW_CONTEXT:
  file_path: {absolute or relative path to file}
  file_number: {N} of {total}
  cycle: {1|2|3}
  tech_stack: {from state.json project.tech_stack}
  constitution_path: {from state.json constitution.path}

Review this file against 8 mandatory check categories.
Produce structured output with verdict: PASS or REVISE.
```

The Reviewer MUST:
1. Read the file at `file_path` from disk using the Read tool
2. Read the project constitution from `constitution_path` (if not already cached from a previous cycle)
3. Read `state.json` to confirm `project.tech_stack` for IC-06 checks
4. Produce structured output as defined in Section 6

## 4. Eight Mandatory Check Categories

### IC-01: Logic Correctness (AC-001-01)

**Applies to:** Production code files only (not test files, not config, not markdown)

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| Off-by-one errors | Loop boundary errors in for/while/map/slice | `for (i = 0; i <= arr.length)` should be `< arr.length` |
| Null/undefined handling | Accessing properties on potentially null/undefined values without guards | `user.name` without checking `user` exists |
| Boundary conditions | Missing validation of array emptiness, string length, numeric range | `arr[0]` without checking `arr.length > 0` |
| Race conditions (async) | Unguarded shared state mutations in async code | Two `await` calls writing to same variable without serialization |
| Incorrect return values | Function returns wrong type or value for edge cases | `return undefined` where caller expects an object |

**Severity mapping:**
- Off-by-one, null/undefined access, incorrect return: BLOCKING
- Potential race conditions: BLOCKING if provable, WARNING if theoretical
- Boundary conditions without crash risk: WARNING

### IC-02: Error Handling (AC-001-02)

**Applies to:** Production code files only

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| Missing try/catch | Async operations or JSON.parse without error handling | `const data = JSON.parse(input)` without try/catch |
| Swallowed errors | Empty catch blocks or catch blocks that do not propagate or log | `catch (e) {}` or `catch (e) { /* ignore */ }` |
| Error propagation | Errors caught but not re-thrown or returned to caller | `catch (e) { return null }` losing error context |
| Meaningful error messages | Error messages that are generic or missing context | `throw new Error('failed')` without what/why/where |
| Unclosed resources | File handles, streams, connections not closed in finally/using | `fs.open()` without corresponding `close()` in finally |

**Severity mapping:**
- Swallowed errors, missing try/catch for I/O: BLOCKING
- Generic error messages: WARNING
- Unclosed resources: BLOCKING if provable leak, WARNING if framework-managed

### IC-03: Security (AC-001-03)

**Applies to:** All files

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| Injection prevention | User input used in commands, queries, or eval without sanitization | `exec(userInput)`, template strings in SQL |
| Hardcoded secrets | API keys, passwords, tokens in source code | `const API_KEY = "sk-..."` |
| Safe path operations | Path concatenation without path.join or path.resolve | `root + '/' + userPath` instead of `path.join(root, userPath)` |
| Input validation | External input used without type/range/length validation | `parseInt(req.params.id)` without NaN check |
| Path traversal | User-controlled path components without sanitization | `path.join(base, userInput)` where userInput could be `../../etc/passwd` |

**Severity mapping:**
- Hardcoded secrets: BLOCKING (always)
- Command injection, path traversal: BLOCKING
- Missing input validation on external boundaries: BLOCKING
- Missing validation on internal boundaries: WARNING

### IC-04: Code Quality (AC-001-04)

**Applies to:** All files

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| Naming conventions | Names that are misleading, single-letter (except loop vars), or inconsistent with codebase | `const x = getUser()` instead of `const user = getUser()` |
| DRY adherence | Duplicated logic blocks (>5 lines identical or near-identical) | Same validation logic copy-pasted in 3 functions |
| Single responsibility | Functions/modules doing multiple unrelated things | A function that both validates input AND writes to database AND sends email |
| Cyclomatic complexity | Function with >10 decision points (if/else/switch/ternary/&&/\|\|) | Deeply nested if-else chains that should be refactored |
| Dead code | Unreachable code, unused imports, commented-out blocks | `import { foo } from 'bar'` where foo is never used |

**Severity mapping:**
- Cyclomatic complexity >10: BLOCKING
- DRY violations (>5 lines): BLOCKING
- SRP violations (clear, provable): BLOCKING
- Naming inconsistencies: WARNING
- Dead code (unused imports): WARNING
- Dead code (unreachable): BLOCKING

### IC-05: Test Quality (AC-001-05)

**Applies to:** Test files only (*.test.cjs, *.test.js, *.test.ts, *.spec.*)

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| Meaningful assertions | Tests with no assertions or trivially true assertions | `assert.ok(true)`, `test('works', () => {})` |
| Edge case coverage | Missing tests for null, empty, boundary values | Test covers happy path but not empty array input |
| False positives | Tests that pass regardless of implementation correctness | Assertion always true due to mock setup |
| Test isolation | Tests sharing mutable state without cleanup | Global variable modified in one test, read in another |
| Test interdependence | Tests that fail when run in isolation or different order | Test B relies on state set by Test A |

**Severity mapping:**
- No meaningful assertions: BLOCKING
- False positives (provable): BLOCKING
- Test interdependence (provable): BLOCKING
- Missing edge cases: WARNING
- Test isolation (minor shared state): WARNING

### IC-06: Tech-Stack Alignment (AC-001-06)

**Applies to:** All files

| Check | BLOCKING Condition | Example |
|-------|-------------------|---------|
| Module system | Wrong module system for file type/location | `import x from 'y'` in a .cjs file; `require()` in ESM lib/ file |
| Test runner | Using wrong test framework | `describe/it` (jest) in a project using `node:test` |
| Framework patterns | Anti-patterns for the project's framework | Using synchronous fs ops in async Node.js code where async exists |
| File extensions | Wrong extension for module system | `.js` in hooks/ directory (should be `.cjs` per Article XII) |
| Dependency usage | Using unavailable or unapproved dependencies | `require('lodash')` when lodash is not in package.json |

**Severity mapping:**
- Wrong module system: BLOCKING (Article XII)
- Wrong test runner: BLOCKING
- Wrong file extension: BLOCKING
- Unavailable dependency: BLOCKING
- Framework anti-patterns: WARNING

**Tech-stack detection:** Read `state.json -> project.tech_stack` for language, framework, runtime, module_system. Cross-reference with Article XII (Dual Module System Integrity) for ESM/CJS rules.

### IC-07: Constitutional Compliance (AC-001-07)

**Applies to:** All files

| Check | Constitutional Article | BLOCKING Condition |
|-------|----------------------|-------------------|
| Specification primacy | Article I | Implementation contradicts requirements-spec.md or design |
| TDD ordering | Article II | Production code without corresponding test, or test written after |
| Simplicity | Article V | Over-engineered solution (unnecessary abstractions, premature optimization) |
| Traceability | Article VII | No requirement maps to this code; or code implements unrequested feature |
| Safe path ops | Article III.2 | String concatenation for paths instead of path.join |

**Severity mapping:**
- Article I violation (spec mismatch): BLOCKING
- Article II violation (missing test): WARNING (test may be in a different file under review)
- Article V violation (over-engineering): WARNING unless egregious, then BLOCKING
- Article VII violation (untraced code): WARNING
- Article III.2 violation (unsafe paths): BLOCKING

**Note on Article II:** The Reviewer should check whether a test file exists or is planned for the production file. If the file is part of a TDD pair and the test file has already been reviewed (or is next in queue), this check passes. The Reviewer does NOT fail Article II just because the test file is in a separate review cycle.

### IC-08: Structured Output Validation (Self-Check)

**Applies to:** The Reviewer's own output

| Check | BLOCKING Condition |
|-------|-------------------|
| Verdict present | Output missing "Verdict: PASS" or "Verdict: REVISE" |
| Findings format | Findings missing category, severity, or description |
| Summary counts | Summary table counts do not match actual findings |
| Finding IDs | Findings missing B-NNN or W-NNN or I-NNN identifiers |

This is a self-check: the Reviewer validates its own output structure before returning. If the self-check fails, the Reviewer corrects its output format before returning.

## 5. Severity Levels

| Severity | Code | Meaning | Triggers Updater? |
|----------|------|---------|-------------------|
| BLOCKING | B-NNN | Must be fixed before file can pass | Yes (AC-002-01) |
| WARNING | W-NNN | Should be fixed; can be deferred to Phase 16 | Updater tries (AC-002-02) |
| INFO | I-NNN | Observation only; no action required | No |

## 6. Output Format (AC-001-08)

The Reviewer produces structured markdown output:

```markdown
# Per-File Review: {file_path}

**Verdict:** PASS | REVISE
**Cycle:** {N}
**File Number:** {M} of {total}
**Reviewed At:** {ISO-8601 timestamp}

## Summary

| Metric | Value |
|--------|-------|
| Total Findings | {X} |
| BLOCKING | {Y} |
| WARNING | {Z} |
| INFO | {W} |
| Categories Checked | IC-01, IC-02, IC-03, IC-04, IC-05, IC-06, IC-07, IC-08 |

## Verdict Rationale

{1-2 sentence explanation of why the file passed or needs revision}

## BLOCKING Findings

### B-001: {Short Title}
**Category:** {IC-01 | IC-02 | IC-03 | IC-04 | IC-05 | IC-06 | IC-07}
**Line:** {line number | N/A}
**Issue:** {Specific description of the defect, referencing the exact code}
**Recommendation:** {Concrete, actionable fix with code example if helpful}

### B-002: ...

## WARNING Findings

### W-001: {Short Title}
**Category:** {IC-01..IC-07}
**Line:** {line number | N/A}
**Issue:** {Specific description}
**Recommendation:** {Concrete improvement}

## INFO Findings

### I-001: {Short Title}
**Category:** {IC-01..IC-07}
**Issue:** {Observation}
```

## 7. Verdict Logic

```
verdict = PASS IF:
  count(BLOCKING findings) == 0

verdict = REVISE IF:
  count(BLOCKING findings) > 0
```

WARNING and INFO findings do NOT affect the verdict. A file can PASS with WARNING or INFO findings. The Updater will attempt to fix WARNINGs but they do not gate passage.

## 8. Category Applicability Matrix

Not all 8 categories apply to every file type. The Reviewer MUST check only applicable categories:

| File Type | IC-01 | IC-02 | IC-03 | IC-04 | IC-05 | IC-06 | IC-07 | IC-08 |
|-----------|-------|-------|-------|-------|-------|-------|-------|-------|
| Production JS/CJS | Yes | Yes | Yes | Yes | No | Yes | Yes | Yes |
| Test JS/CJS | No | No | Yes | Yes | Yes | Yes | Yes | Yes |
| Markdown (agent) | No | No | No | Yes | No | No | Yes | Yes |
| JSON config | No | No | Yes | Yes | No | Yes | Yes | Yes |
| YAML config | No | No | Yes | Yes | No | Yes | Yes | Yes |

**Detection:** The Reviewer determines file type from the file extension and path:
- `*.test.cjs`, `*.test.js`, `*.spec.*` in `tests/` or `__tests__/` -> Test file
- `*.md` in `src/claude/agents/` -> Markdown agent
- `*.json`, `*.yaml` in `config/` -> Config file
- Everything else -> Production code

## 9. Rules

1. **NEVER modify the reviewed file.** The Reviewer is read-only. It reads the file and produces a review report. Only the Updater modifies files.

2. **NEVER produce zero findings on cycle 1 for a non-trivial file.** If mandatory checks all pass, examine discretionary aspects more carefully. Trivial files (single-line config changes, empty templates) may genuinely have zero findings.

3. **NEVER inflate severity.** If a finding is genuinely WARNING-level, do not mark it BLOCKING. Credibility matters -- if the Updater disputes inflated findings, cycles are wasted.

4. **ALWAYS reference specific line numbers** where possible. Findings without line references are harder for the Updater to fix.

5. **ALWAYS provide concrete recommendations.** Do not say "fix this" -- say exactly what the fix should be, with code snippets if helpful.

6. **ALWAYS check all applicable categories.** Skipping a category is a self-check failure (IC-08).

7. **ALWAYS include the summary counts.** The orchestrator parses the BLOCKING count to determine verdict.

8. **On re-review (cycle > 1):** Focus on whether previous BLOCKING findings are resolved. Do not introduce entirely new categories of findings that were not flagged in cycle 1, unless the Updater's changes introduced a new defect. This prevents infinite review loops.

## 10. Relationship to Existing Agents

| Agent | Relationship | Notes |
|-------|-------------|-------|
| 01-requirements-critic.md | Pattern reference | Same structured output pattern (B-NNN/W-NNN), adapted for code review |
| 02-architecture-critic.md | Pattern reference | Same critique report format, adapted for per-file scope |
| 03-design-critic.md | Pattern reference | Same severity levels, adapted for implementation |
| 07-qa-engineer.md | Complementary | QA Engineer does batch review in Phase 08; Reviewer does per-file in Phase 06 |
| 05-software-developer.md | Sequential | Writer produces file, Reviewer reviews it |
| 05-implementation-updater.md | Sequential | Reviewer flags findings, Updater fixes them |

## 11. Estimated Size

200-300 lines of markdown, following the structure of existing critic agents (01-requirements-critic.md at 138 lines, 02-architecture-critic.md at similar).

## 12. AC Coverage Matrix

| AC | Design Element | Section |
|----|---------------|---------|
| AC-001-01 | IC-01: Logic correctness checks | 4 (IC-01) |
| AC-001-02 | IC-02: Error handling checks | 4 (IC-02) |
| AC-001-03 | IC-03: Security checks | 4 (IC-03) |
| AC-001-04 | IC-04: Code quality checks | 4 (IC-04) |
| AC-001-05 | IC-05: Test quality checks | 4 (IC-05) |
| AC-001-06 | IC-06: Tech-stack alignment checks | 4 (IC-06) |
| AC-001-07 | IC-07: Constitutional compliance checks | 4 (IC-07) |
| AC-001-08 | Structured output: file path, verdict, findings list, severity, category, line ref, summary | 6 |
