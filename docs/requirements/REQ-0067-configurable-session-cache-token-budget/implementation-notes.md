# Implementation Notes: Configurable Session Cache Token Budget

**REQ-0067** | **Phase**: 06-implementation | **Date**: 2026-03-16

---

## Summary

Implemented configurable session cache token budget with priority-based section allocation. Users can now set `cache.budget_tokens` in `.isdlc/config.json` and the framework allocates sections by configurable priority order.

## Files Changed

| File | Action | Description | Traces |
|------|--------|-------------|--------|
| `src/claude/hooks/lib/common.cjs` | MODIFY | Added `readConfig()`, `DEFAULT_CONFIG`, budget allocation in `rebuildSessionCache()`, replaced hardcoded 128K warning and 5K skill truncation | FR-001 through FR-007 |
| `bin/rebuild-cache.js` | MODIFY | Added budget usage reporting to CLI output | FR-008 |
| `.isdlc/config.json` | CREATE | Project-level config with 250K token budget | FR-001 |
| `src/claude/hooks/tests/test-config-budget.test.cjs` | CREATE | 32 test cases (15 unit, 9 budget, 5 integration, 3 behavioral) | All ACs |

## Key Implementation Decisions

### 1. Config file path: `.isdlc/config.json` (not `.isdlc/config`)

The design specified `.isdlc/config` (no extension), but `.isdlc/config/` is an existing directory used by the installer for `workflows.json`. Using `.isdlc/config.json` avoids the naming conflict. The hackability roadmap already referenced `.isdlc/config.json` as the canonical config path.

### 2. Budget allocation algorithm

Priority-queue fill: sort sections by priority (ascending), accumulate token estimates, truncate last partial section at line boundary, skip remaining. O(n) where n = 9 sections. Original order restored for output.

### 3. Token estimation

`Math.ceil(chars / 4)` — standard approximation. No external tokenizer dependency per CON-001.

### 4. Per-process caching

`readConfig()` caches results in `_configJsonCache` Map keyed by project root. Cleared by `_resetCaches()` for test isolation.

### 5. External skill truncation

Replaced hardcoded 5000 char limit with `Math.max(1000, Math.floor(remainingBudgetChars / skillCount))`. Budget-aware, with 1000-char minimum floor per skill.

## Test Results

- **New tests**: 32 (all passing)
- **Existing tests**: 4054 passing, 262 failing (all pre-existing — 0 regressions)
- **Test file**: `src/claude/hooks/tests/test-config-budget.test.cjs`
- **Coverage**: 100% AC coverage (23/23 acceptance criteria covered)

## Backward Compatibility

- Projects without `.isdlc/config.json` get default behavior (100K token budget)
- `rebuildSessionCache()` return value now includes `usedTokens` and `budgetTokens` fields (additive, non-breaking)
- Existing hardcoded 128K warning replaced with budget-based warning (same behavior at default 100K budget)
