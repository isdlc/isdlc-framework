# Coverage Report: REQ-0140 Conversational Enforcement Stop Hook

**Date**: 2026-03-25
**Phase**: 16-quality-loop
**Tool**: Manual analysis (node:test does not provide built-in coverage)

---

## Coverage Summary

| Metric | Value |
|--------|-------|
| Estimated Line Coverage | >80% |
| Test Count | 67 |
| Source Files | 6 |
| Source Lines | 861 |
| Test-to-Source Ratio | 1:12.8 |

---

## Per-File Coverage

### src/core/compliance/engine.cjs (370 lines)

| Function | Tests | Branches Covered |
|----------|-------|------------------|
| loadRules() | 5 tests | Valid rules, invalid rules, missing file, malformed JSON, no rules array |
| evaluateRules() | 18 tests | Provider scope filtering (3), trigger condition filtering (4), pattern check (4), structural check (3), state-match check (3), verdict construction (4) |
| _isValidRule() | Tested via loadRules | Missing fields, non-object, valid |
| _matchesProvider() | Tested via evaluateRules | both, claude, codex scopes |
| _matchesTrigger() | Tested via evaluateRules | No trigger, config trigger, state trigger, missing config |
| _executeCheck() | Tested via evaluateRules | pattern, structural, state-match, unknown type |
| _checkPattern() | Tested via evaluateRules | Below threshold, above threshold, code blocks, empty response |
| _checkStructural() | Tested via evaluateRules | Single domain, collapsed domains, non-matching detect |
| _checkStateMatch() | Tested via evaluateRules | With question, without question, no completion |

### src/core/compliance/codex-validator.cjs (120 lines)

| Function | Tests | Branches Covered |
|----------|-------|------------------|
| validateCodexOutput() | 9 tests | Valid output, empty output, empty rules, invalid engine path, codex scope filtering, claude-only skip |
| retryIfNeeded() | 4 tests | Block with retry, max retries exceeded, no violation, warn severity |

### src/core/compliance/extractors/prose-extractor.cjs (146 lines)

| Function | Tests | Branches Covered |
|----------|-------|------------------|
| extractRules() | 8 tests | CLAUDE.md content, agent files, AGENTS.md, conflict dedup, warn severity, nonexistent files, no constraints, multiple files |

### src/claude/hooks/conversational-compliance.cjs (209 lines)

| Function | Tests | Branches Covered |
|----------|-------|------------------|
| main() | 10 tests | Empty stdin, malformed JSON, block decision, allow decision, warn decision, missing rules file, missing roundtable.yaml, missing state file, state transitions, unparseable state |
| readStdin() | Tested via main | Normal input, empty input, error |
| loadEngine() | Tested via main | Valid path, missing path |
| readRoundtableConfig() | Tested via main | Valid config, missing file |
| readRoundtableState() | Tested via main | Valid state, missing file, unparseable |

### src/core/compliance/engine.mjs (16 lines)

| Function | Tests | Branches Covered |
|----------|-------|------------------|
| Re-exports | Covered by engine.cjs tests | ESM wrapper |

### .isdlc/config/conversational-rules.json (60 lines)

| Aspect | Tests | Coverage |
|--------|-------|----------|
| Schema validation | Covered by engine loadRules tests | All 3 rules loaded and validated |
| Rule evaluation | Covered by integration tests | All 3 built-in rules tested end-to-end |

---

## Untested Areas

- No negative coverage for regex edge cases in the pattern check (exotic Unicode, very long lines)
- ESM import path in engine.mjs not tested in isolation (tested via CJS require chain)
- Retry counter persistence across multiple hook invocations (tested per-process only)

---

## Coverage Notes

- Node.js native test runner (`node:test`) does not include built-in coverage reporting
- Coverage was assessed manually by analyzing test cases against source code branches
- All public API entry points have direct test coverage
- All fail-open error boundaries have explicit test cases
