# Test Strategy: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Prior Art:** REQ-0014 (Phase 01 debate loop, 90 tests)

---

## 1. Existing Infrastructure

- **Framework:** `node:test` (built-in Node.js test runner)
- **Assertion Library:** `node:assert/strict`
- **Module System:** CommonJS (`.test.cjs` files)
- **Coverage Tool:** Not applicable (prompt-verification tests)
- **Test Directory:** `src/claude/hooks/tests/`
- **Current Test Count:** 90 debate-related tests from REQ-0014
- **Test Runner:** `node --test src/claude/hooks/tests/*.test.cjs`

## 2. Testing Approach

### 2.1 Prompt-Verification Testing

This project uses **prompt-verification testing**: tests read `.md` agent files
and assert that specific keywords, sections, and patterns are present. This
approach is appropriate because agents are markdown prompt files, not executable
code -- their correctness is determined by the presence and structure of prompt
instructions.

**Pattern:**
```javascript
const { readFileSync } = require('fs');
const { test, describe } = require('node:test');
const assert = require('assert');

const content = readFileSync('src/claude/agents/02-architecture-critic.md', 'utf-8');

test('critic has NFR alignment check', () => {
  assert.ok(content.includes('NFR'), 'Should mention NFR alignment');
});
```

### 2.2 Validation Rule Derivation

All 62 validation rules from `validation-rules.json` (produced in Phase 04)
are directly translated into test assertions. Each validation rule maps to
one test case with a 1:1 relationship. Rules are categorized by type:

| Rule Type | Count | Test Implementation |
|-----------|-------|-------------------|
| `contains` | 34 | `assert.ok(content.includes(pattern))` |
| `not_contains` | 2 | `assert.ok(!content.includes(pattern))` |
| `contains_all` | 20 | Multiple `assert.ok(content.includes())` per pattern |
| `contains_any` | 10 | `assert.ok(p1 \|\| p2 \|\| p3)` disjunction |

### 2.3 Test Scope

| Scope | Coverage | Notes |
|-------|----------|-------|
| Unit tests | 62 validation-rule tests + 12 structural/NFR tests | Per-module content verification |
| Integration tests | 13 cross-module tests | Routing table + artifact flow + edge cases |
| Regression tests | 0 new (90 existing must pass) | Existing REQ-0014 tests unchanged |
| **Total new tests** | **87** | Across 5 test files |

## 3. Test Files

| File | Target Module | Tests | Traces |
|------|--------------|-------|--------|
| `architecture-debate-critic.test.cjs` | M2: 02-architecture-critic.md | 22 | FR-001, AC-001-01..08, NFR-002, NFR-004, AC-006-01, AC-006-03 |
| `architecture-debate-refiner.test.cjs` | M3: 02-architecture-refiner.md | 18 | FR-002, AC-002-01..08, NFR-002 |
| `architecture-debate-orchestrator.test.cjs` | M1: 00-sdlc-orchestrator.md | 22 | FR-003, FR-005, AC-003-01..05, AC-005-01..04, AC-007-01..03 |
| `architecture-debate-creator.test.cjs` | M4: 02-solution-architect.md | 8 | FR-004, AC-004-01..02, NFR-003 |
| `architecture-debate-integration.test.cjs` | M1+M5: Cross-module | 17 | FR-006, FR-007, NFR-001, NFR-003, NFR-004 |
| **Total** | | **87** | 7 FRs, 30 ACs, 4 NFRs |

## 4. Coverage Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Requirement coverage | 100% (7/7 FRs) | All FRs have at least 1 test |
| AC coverage | 100% (30/30 ACs) | Every AC maps to at least 1 test |
| NFR coverage | 100% (4/4 NFRs) | All NFRs verified |
| Validation rule coverage | 100% (62/62) | Every rule maps to a test assertion |
| Error code coverage | 100% (19/19) | All error codes from error-taxonomy.md traced |
| Regression | 0 new failures | 90 existing REQ-0014 tests must pass |

## 5. Test Data Strategy

Since tests read static `.md` files, test data is the file content itself.
No external test data fixtures, mocks, or factories are needed.

**Test data sources:**
- Agent `.md` files read at test time via `fs.readFileSync()`
- File paths resolved via `path.resolve(__dirname, '..', '..', 'agents', '{file}.md')`
- Content cached in `let content` variable per describe block

**Boundary conditions tested:**
- File existence (each file has a "file exists" test)
- File size < 15KB (NFR-001 for new agent files)
- Section structure presence (NFR-002 pattern consistency)

## 6. Critical Paths

The following test chains represent the critical verification paths:

1. **Critic Completeness:** File exists -> Frontmatter correct -> All 8 checks documented -> Output format correct -> Metrics present
2. **Refiner Completeness:** File exists -> Frontmatter correct -> All fix strategies documented -> Change log format -> Rules present
3. **Orchestrator Generalization:** Header changed -> Routing table present -> Both phases routed -> Flag precedence -> Convergence logic -> Edge cases
4. **Creator Awareness:** DEBATE_CONTEXT handling -> Self-assessment section -> No-regression guarantee
5. **Cross-Module Integrity:** Routing table references match actual agent filenames -> Artifact naming consistent -> Debate-enabled phases documented

## 7. Regression Safety

### 7.1 Existing Tests (Must Not Regress)

These 8 test files from REQ-0014 contain 90 tests that MUST continue to pass:

| File | Tests | Protection |
|------|-------|------------|
| debate-critic-agent.test.cjs | 14 | Tests Phase 01 critic; new Phase 03 critic is separate file |
| debate-refiner-agent.test.cjs | 10 | Tests Phase 01 refiner; new Phase 03 refiner is separate file |
| debate-orchestrator-loop.test.cjs | 18 | Tests debate loop; generalization must not break existing assertions |
| debate-flag-parsing.test.cjs | 10 | Tests flag parsing; unchanged by REQ-0015 |
| debate-convergence.test.cjs | varies | Tests convergence logic; same logic reused |
| debate-creator-agent.test.cjs | varies | Tests Phase 01 creator; unchanged by REQ-0015 |
| debate-docs-agent-count.test.cjs | varies | Tests agent count; new agents add to count |
| debate-template-docs.test.cjs | varies | Tests template docs; unchanged |

### 7.2 Regression Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Orchestrator header change ("Phase 01 Only" -> "Multi-Phase") | HIGH | Existing test TC-M4-01 checks for "DEBATE LOOP ORCHESTRATION" (not "Phase 01 Only"), so it passes. Verify manually. |
| Agent count changes | LOW | debate-docs-agent-count.test.cjs may need count update if it checks exact agent count. |
| Creator role awareness additions | LOW | New sections are additive; no existing content removed from solution-architect.md. |

## 8. Test Execution

### 8.1 Commands

```bash
# Run only new REQ-0015 tests
node --test src/claude/hooks/tests/architecture-debate-*.test.cjs

# Run all debate tests (REQ-0014 + REQ-0015)
node --test src/claude/hooks/tests/debate-*.test.cjs src/claude/hooks/tests/architecture-debate-*.test.cjs

# Run full test suite
node --test src/claude/hooks/tests/*.test.cjs
```

### 8.2 Expected Results

- 87 new tests: all PASS
- 90 existing debate tests: all PASS (no regression)
- 0 skipped, 0 failures

## 9. Test Naming Convention

Following REQ-0014 pattern:
- Test IDs: `TC-{module}-{seq}` (e.g., TC-M2-01, TC-M3-01)
- Module prefixes use M2/M3 for critic/refiner to match module-design.md numbering
- Describe blocks: `'{module}: {agent name} ({file})'`
- Test names: `'TC-{module}-{seq}: {validation rule description}'`

## 10. Constitutional Compliance

| Article | How Tested | Tests |
|---------|-----------|-------|
| Article II (Test-First) | All tests designed before implementation | This document |
| Article VII (Traceability) | Traceability matrix links every AC to tests | traceability-matrix.csv |
| Article IX (Quality Gate) | GATE-05 validation | gate-05-validation.json |
| Article XI (Integration Testing) | Cross-module tests verify component interactions | architecture-debate-integration.test.cjs |
