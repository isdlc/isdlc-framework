# Test Strategy: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 05-test-strategy
**Created:** 2026-02-15
**Prior Art:** REQ-0014 (Phase 01 debate loop, 90 tests), REQ-0015 (Phase 03 debate loop, 87 tests)

---

## 1. Existing Infrastructure

- **Framework:** `node:test` (built-in Node.js test runner)
- **Assertion Library:** `node:assert/strict`
- **Module System:** CommonJS (`.test.cjs` files)
- **Coverage Tool:** Not applicable (prompt-verification tests)
- **Test Directory:** `src/claude/hooks/tests/`
- **Current Debate Test Count:** 177 tests across REQ-0014 (90) and REQ-0015 (87)
- **Test Runner:** `node --test src/claude/hooks/tests/*.test.cjs`
- **Existing Patterns:** Follow conventions established in REQ-0014/REQ-0015

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

const content = readFileSync('src/claude/agents/03-design-critic.md', 'utf-8');

test('critic has DC-01 incomplete API specs check', () => {
  assert.ok(content.includes('DC-01'), 'Should mention DC-01 check');
  assert.ok(content.includes('Incomplete API'), 'Should mention Incomplete API');
});
```

### 2.2 Validation Rule Derivation

All 64 validation rules from `validation-rules.json` (produced in Phase 04)
are directly translated into test assertions. Each validation rule maps to
one test case with a 1:1 relationship. Rules are categorized by type:

| Rule Type | Count | Test Implementation |
|-----------|-------|-------------------|
| `contains` | 30 | `assert.ok(content.includes(pattern))` |
| `contains_all` | 24 | Multiple `assert.ok(content.includes())` per pattern |
| `contains_any` | 10 | `assert.ok(p1 \|\| p2 \|\| p3)` disjunction |

### 2.3 Test Scope

| Scope | Coverage | Notes |
|-------|----------|-------|
| Unit tests | 64 validation-rule tests + structural/NFR tests | Per-module content verification |
| Integration tests | Cross-module tests | Routing table + artifact flow + edge cases |
| Regression tests | 0 new (177 existing must pass) | Existing REQ-0014 + REQ-0015 tests unchanged |
| **Total new tests** | **~90** | Across 5 test files |

## 3. Test Files

| File | Target Module | Tests | Traces |
|------|--------------|-------|--------|
| `design-debate-critic.test.cjs` | M2: 03-design-critic.md | ~30 | FR-001, AC-001-01..08, FR-006, AC-006-01..05, NFR-002, NFR-004, AC-007-04 |
| `design-debate-refiner.test.cjs` | M3: 03-design-refiner.md | ~19 | FR-002, AC-002-01..09, NFR-002 |
| `design-debate-orchestrator.test.cjs` | M1: 00-sdlc-orchestrator.md | ~12 | FR-003, AC-003-01..04, NFR-003 |
| `design-debate-creator.test.cjs` | M4: 03-system-designer.md | ~8 | FR-004, AC-004-01..02, NFR-003 |
| `design-debate-integration.test.cjs` | Cross-module (M1-M5) | ~17 | FR-005, FR-007, NFR-001, NFR-003, NFR-004 |
| **Total** | | **~86** | 7 FRs, 34 ACs, 4 NFRs |

## 4. Coverage Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Requirement coverage | 100% (7/7 FRs) | All FRs have at least 1 test |
| AC coverage | 100% (34/34 ACs) | Every AC maps to at least 1 test |
| NFR coverage | 100% (4/4 NFRs) | All NFRs verified |
| Validation rule coverage | 100% (64/64) | Every rule maps to a test assertion |
| Error code coverage | 100% (24/24) | All error codes from error-taxonomy.md traced |
| Regression | 0 new failures | 177 existing debate tests must pass |

## 5. Test Data Strategy

Since tests read static `.md` files, test data is the file content itself.
No external test data fixtures, mocks, or factories are needed.

**Test data sources:**
- Agent `.md` files read at test time via `fs.readFileSync()`
- File paths resolved via `path.resolve(__dirname, '..', '..', '..', '..', 'src', 'claude', 'agents', '{file}.md')`
- Content cached in `let content` variable per describe block

**Boundary conditions tested:**
- File existence (each file has a "file exists" test)
- File size < 15KB (NFR-001 for new agent files)
- Section structure presence (NFR-002 pattern consistency)

## 6. Critical Paths

The following test chains represent the critical verification paths:

1. **Critic Completeness:** File exists -> Frontmatter correct -> All 8 design checks (DC-01..DC-08) documented -> 5 constitutional checks documented -> Output format correct -> 5 design metrics present -> Interface type detection documented
2. **Refiner Completeness:** File exists -> Frontmatter correct -> All 9 fix strategies documented -> WARNING handling -> Change log format -> Rules present (never-remove, never-introduce-scope, preserve-module-names)
3. **Orchestrator Extension:** Routing table contains Phase 04 row -> Correct agent mappings -> Correct Phase 04 artifacts listed -> Existing Phase 01 + Phase 03 rows preserved
4. **Creator Awareness:** DEBATE_CONTEXT handling -> Self-assessment section -> No-regression guarantee -> Round labeling -> Skip final menu -> Round > 1 behavior
5. **Cross-Module Integrity:** isdlc.md lists Phase 04 as debate-enabled -> Critic/Refiner artifact naming matches orchestrator expectations -> Debate-summary.md referenced -> Edge case handling consistent

## 7. Regression Safety

### 7.1 Existing Tests (Must Not Regress)

These test files from REQ-0014 and REQ-0015 contain 177 tests that MUST continue to pass:

| Source | File Pattern | Tests | Protection |
|--------|-------------|-------|------------|
| REQ-0014 | `debate-*.test.cjs` | 90 | Phase 01 debate tests; unaffected by Phase 04 additions |
| REQ-0015 | `architecture-debate-*.test.cjs` | 87 | Phase 03 debate tests; unaffected by Phase 04 additions |

### 7.2 Regression Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Orchestrator routing table addition | LOW | Adding a row does not modify existing rows. REQ-0015 tests check Phase 01/03 rows; they remain. |
| System-designer debate context addition | LOW | New sections are additive; no existing content removed. |
| isdlc.md debate-enabled phases update | LOW | Text change only adds "Phase 04 (Design)" to existing list. |
| Agent count changes | LOW | debate-docs-agent-count.test.cjs may need count update. |

## 8. Test Execution

### 8.1 Commands

```bash
# Run only new REQ-0016 tests
node --test src/claude/hooks/tests/design-debate-*.test.cjs

# Run all debate tests (REQ-0014 + REQ-0015 + REQ-0016)
node --test src/claude/hooks/tests/debate-*.test.cjs src/claude/hooks/tests/architecture-debate-*.test.cjs src/claude/hooks/tests/design-debate-*.test.cjs

# Run full test suite
node --test src/claude/hooks/tests/*.test.cjs
```

### 8.2 Expected Results

- ~86 new tests: all PASS
- 177 existing debate tests: all PASS (no regression)
- 0 skipped, 0 failures

## 9. Test Naming Convention

Following REQ-0014/REQ-0015 patterns:
- Test IDs: `TC-{module}-{seq}` (e.g., TC-M2-01, TC-M3-01)
- Module prefixes: M1 (orchestrator), M2 (critic), M3 (refiner), M4 (creator), M5 (isdlc.md)
- Describe blocks: `'{module}: {component name} ({file})'`
- Test names: `'TC-{module}-{seq}: {validation rule description}'`
- Integration tests: `TC-INT-{seq}` for cross-module tests

## 10. Constitutional Compliance

| Article | How Tested | Tests |
|---------|-----------|-------|
| Article II (Test-First) | All tests designed before implementation | This document |
| Article VII (Traceability) | Traceability matrix links every AC to tests | traceability-matrix.csv |
| Article IX (Quality Gate) | GATE-05 validation | gate-05-validation.json |
| Article XI (Integration Testing) | Cross-module tests verify component interactions | design-debate-integration.test.cjs |
