# Test Strategy: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## Existing Infrastructure

- **Framework**: `node:test` (native Node.js test runner)
- **Coverage Tool**: None (prompt verification tests use content assertions, not code coverage)
- **Existing Patterns**: `tests/prompt-verification/*.test.js` -- read `.md` files, assert content patterns via regex and string matching
- **Test Convention**: ESM imports (`import { describe, it } from 'node:test'`), `assert/strict`
- **Run Command**: `node --test tests/prompt-verification/<file>.test.js`

## Strategy for This Requirement

- **Approach**: Extend existing prompt-verification test suite following established patterns
- **Test Type**: Prompt Content Verification (read `.md` files, assert required content)
- **Rationale**: This is a prompt-restructuring change affecting 2 `.md` files with zero executable code changes. The established test pattern for prompt changes is reading the target files and asserting required content patterns are present.
- **New Test File**: `tests/prompt-verification/analyze-flow-optimization.test.js`

## Test Pyramid

### Unit Tests (Prompt Content Verification)
Since there are no executable code changes (only `.md` prompt files), "unit tests" take the form of prompt content verification:
- Read `src/claude/commands/isdlc.md` and assert required content patterns for FR-001 through FR-005, FR-008
- Read `src/claude/agents/roundtable-analyst.md` and assert required content patterns for FR-006, FR-007
- Each FR maps to one test group (TG-01 through TG-08)
- Each AC maps to one or more test cases within its group

### Integration Tests
- Cross-file consistency: verify dispatch prompt fields referenced in `isdlc.md` are also accepted in `roundtable-analyst.md`
- Backward compatibility: verify fallback paths exist in `roundtable-analyst.md` for when inlined context is absent
- No new hooks or dependencies added (regression guard)

### E2E Tests
Not applicable for this change. The optimization is a prompt restructuring that cannot be validated end-to-end in an automated test -- the behavioral outcome (parallelism and latency reduction) is observable only during actual LLM execution.

### Security Tests
Not applicable. No security-sensitive changes (no auth, no secrets, no user data handling changes).

### Performance Tests
Not directly testable. The performance improvement (90s to 11s) is an LLM execution characteristic that depends on how the model interprets parallelism hints. The test strategy validates that the required parallel group notation and deferred scan instructions are present in the prompts, but actual latency measurement is done empirically by the user.

## Performance Test Plan

Latency improvement is validated empirically, not via automated tests. The test strategy ensures all structural prerequisites for performance improvement are present:
- Dependency group notation with explicit parallel instructions (TC-01)
- Pre-fetched data passthrough to avoid duplicate API calls (TC-03)
- Eliminated re-reads after writes (TC-04)
- Inlined context to avoid startup file reads (TC-05, TC-06)
- Deferred codebase scan to unblock first message (TC-07)

## Flaky Test Mitigation

These tests are deterministic prompt content verification tests that read static files and assert string patterns. No flakiness risk:
- No network calls
- No timing dependencies
- No random data
- No parallel execution concerns
- No external service dependencies

If a test fails, it means the required content is genuinely missing from the prompt file -- not a flaky condition.

## Coverage Targets

- **Requirement coverage**: 100% -- every FR (FR-001 through FR-008) has at least one test group
- **AC coverage**: 100% -- every AC (AC-001-01 through AC-008-03) has at least one test case
- **File coverage**: 100% of modified files tested (`isdlc.md`, `roundtable-analyst.md`)

## Test Commands

```bash
# Run REQ-0037 tests only
node --test tests/prompt-verification/analyze-flow-optimization.test.js

# Run all prompt verification tests
node --test tests/prompt-verification/*.test.js

# Run full test suite
npm run test:all
```

## Critical Paths

1. **Dependency group structure** (FR-001): The core optimization -- if parallel group notation is missing, no latency improvement occurs
2. **Auto-add fast path** (FR-002): Eliminates the confirmation round-trip for external refs
3. **Inlined context acceptance** (FR-006): The roundtable must honor inlined data to avoid redundant file reads
4. **Deferred scan** (FR-007): The critical path to unblocking Maya's first message
5. **Backward compatibility** (FR-006 AC-006-03): Fallback paths must exist for non-optimized dispatch

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| LLM ignores parallel hints despite correct notation | Medium | Tests verify notation is present; empirical testing validates behavior |
| Content pattern too strict, breaks on minor rewording | Low | Use flexible patterns (case-insensitive, multiple synonyms) |
| New hook count assertion becomes stale | Low | Assert count from current baseline (28 hooks) |
