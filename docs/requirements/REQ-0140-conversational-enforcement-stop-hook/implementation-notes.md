# Implementation Notes: REQ-0140 — Conversational Enforcement via Stop Hook

**Phase**: 06 - Implementation
**Date**: 2026-03-25
**Status**: Complete

---

## 1. Files Created

| File | Purpose | Module System |
|------|---------|---------------|
| `src/core/compliance/engine.cjs` | Shared compliance engine: loadRules(), evaluateRules() | CJS |
| `src/core/compliance/engine.mjs` | ESM re-export wrapper for Codex adapter | ESM |
| `src/core/compliance/codex-validator.cjs` | Codex output validation: validateCodexOutput(), retryIfNeeded() | CJS |
| `src/core/compliance/extractors/prose-extractor.cjs` | Rule extraction from CLAUDE.md and agent files | CJS |
| `src/claude/hooks/conversational-compliance.cjs` | Stop hook for Claude responses | CJS |
| `.isdlc/config/conversational-rules.json` | 3 built-in rules (bulleted, domain-confirm, elicitation) | JSON |

## 2. Test Files Created

| File | Tests | Covers |
|------|-------|--------|
| `src/claude/hooks/tests/conversational-compliance-engine.test.cjs` | 26 | FR-001, FR-005 |
| `src/claude/hooks/tests/conversational-compliance-hook.test.cjs` | 10 | FR-003, FR-004 |
| `src/claude/hooks/tests/conversational-compliance-codex.test.cjs` | 13 | FR-006 |
| `src/claude/hooks/tests/conversational-compliance-integration.test.cjs` | 10 | FR-003+FR-005 integration |
| `src/claude/hooks/tests/conversational-compliance-extractor.test.cjs` | 8 | FR-002 |
| **Total** | **67** | **All 6 FRs** |

## 3. Key Design Decisions

- **Shared engine pattern**: Single CJS module (`engine.cjs`) consumed by both the Stop hook and Codex validator. ESM wrapper (`engine.mjs`) bridges the module system gap.
- **Simple YAML parsing**: The hook reads `roundtable.yaml` using regex-based key:value extraction (no yaml dependency).
- **Retry counter in-memory**: Per AD-05, retry state lives in the hook process, not in state.json. Each hook invocation is a fresh process, so retries are per-conversation-turn.
- **Sidecar file for state**: Roundtable confirmation state persisted in `.isdlc/roundtable-state.json` (AD-07) to avoid contention with `state.json`.
- **Fail-open everywhere**: Missing files, parse errors, engine errors -- all fail-open with exit 0 and no blocking.

## 4. Acceptance Criteria Coverage

All 38 acceptance criteria from the requirements spec are covered by the 67 tests. Key AC mappings:
- AC-001-01 through AC-001-05: Rule loading (engine tests)
- AC-002-01 through AC-002-05: Prose extraction (extractor tests)
- AC-003-01 through AC-003-05: Stop hook (hook tests)
- AC-004-01 through AC-004-06: Auto-retry (hook tests + codex tests)
- AC-005-01 through AC-005-05: Built-in rules (engine + integration tests)
- AC-006-01 through AC-006-12: Codex integration (codex tests)

## 5. What Remains for Integration

- **Hook registration**: `.claude/settings.json` needs the Stop hook entry added
- **Codex runtime integration**: `src/providers/codex/runtime.js` needs `validateCodexOutput()` call after process output
- **Roundtable analyst**: Needs sidecar file writes at confirmation state transitions
- **CLI command**: `bin/isdlc.js` needs `extract-rules` subcommand registration
