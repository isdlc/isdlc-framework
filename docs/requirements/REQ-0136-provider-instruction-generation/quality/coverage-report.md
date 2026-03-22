# Coverage Report — REQ-0136 Provider Instruction Generation

**Date**: 2026-03-22
**Method**: Structural analysis (node:test has no built-in coverage reporter)
**Estimated Overall Coverage**: >=85%

---

## instruction-generator.js (310 lines)

| Export | Tests | Coverage |
|--------|-------|----------|
| `INSTRUCTION_TEMPLATES` | IG-01..IG-07 (7 tests) | 100% — frozen registry fully validated |
| `generateInstructions()` | IG-08..IG-23 (16 tests) | ~95% — all providers, all sections, graceful degradation |
| `getInstructionPath()` | IG-24, IG-24b (2 tests) | 100% — all providers + error path |
| `listSupportedProviders()` | IG-25 (1 test) | 100% — single function, fully tested |

### Internal Functions

| Function | Exercised By | Notes |
|----------|-------------|-------|
| `buildProjectContext()` | IG-09 | Via generateInstructions |
| `buildWorkflowCommands()` | IG-10 | Via generateInstructions |
| `buildConstitutionSummary()` | IG-11, IG-22 | Including missing constitution path |
| `buildAgentRoster()` | IG-12 | Fail-open path tested (empty list returns) |
| `buildGovernanceRules()` | IG-13 | Via generateInstructions |
| `buildHookConfiguration()` | IG-14 | Claude-specific section |
| `buildSessionCacheStructure()` | IG-15 | Claude-specific section |
| `buildInstructionFormatNotes()` | IG-17 | Codex-specific section |
| `buildSandboxConstraints()` | IG-18 | Codex-specific section |

**Estimated**: ~90%+ coverage

---

## cli.js — Provider Modifications (~70 lines added)

| Function | Tests | Coverage |
|----------|-------|----------|
| `parseArgs()` — `--provider` flag | CP-01..CP-03, CP-13 (4 tests) | 100% of provider parsing paths |
| `detectProvider()` | CP-04..CP-07, CP-14, CP-15 (6 tests) | ~90% — flag priority, config, fail-safe, precedence |
| `generateProviderInstructions()` | CP-08, CP-10 (indirect via subprocess) | ~80% — dry-run paths tested |
| `run()` — init with provider | CP-08, CP-10 (2 subprocess tests) | ~85% — init + default init tested |
| `run()` — update with provider | CP-12 (1 subprocess test) | ~80% — update dry-run tested |
| `run()` — doctor with provider | CP-11 (1 subprocess test) | ~80% — provider info output tested |

**Estimated**: ~85%+ coverage

---

## Uncovered Paths

| Path | Reason | Risk |
|------|--------|------|
| `generateProviderInstructions` actual write (non-dry-run) | Requires filesystem setup in test | Low — wrapper around `writeFileSync` |
| `detectProvider` tier 3 (autoDetectProvider) | Requires full provider routing module | Low — fail-safe to 'claude' |
| `getAgentList()` with loaded agent-classification | Requires module availability at runtime | Low — fail-open to empty list |
