# Test Strategy: REQ-0128 — ProviderRuntime Interface Contract

## 1. Scope

Unit tests for:
- `src/core/orchestration/provider-runtime.js` — interface constants, factory, validation
- `src/core/bridge/orchestration.cjs` — CJS bridge parity

## 2. Test Framework

- **Runner**: `node:test` (project standard)
- **Assertions**: `node:assert/strict`
- **Command**: `npm run test:core` (glob: `tests/core/**/*.test.js`)

## 3. Test Files

| File | Prefix | Tests |
|------|--------|-------|
| `tests/core/orchestration/provider-runtime.test.js` | PR- | ~40 |
| `tests/core/orchestration/bridge-orchestration.test.js` | BO- | ~8 |

## 4. Coverage Strategy

### 4.1 Constants (Frozen Objects)

| Test ID | Target | Acceptance Criteria |
|---------|--------|-------------------|
| PR-01 | PROVIDER_RUNTIME_INTERFACE frozen | AC-001-01 |
| PR-02 | PROVIDER_RUNTIME_INTERFACE.methods list | AC-001-01 |
| PR-03 | PROVIDER_RUNTIME_INTERFACE.executeTask params/returns | AC-001-02 |
| PR-04 | PROVIDER_RUNTIME_INTERFACE.executeParallel params/returns | AC-001-02 |
| PR-05 | PROVIDER_RUNTIME_INTERFACE.presentInteractive params/returns | AC-001-02 |
| PR-06 | PROVIDER_RUNTIME_INTERFACE.readUserResponse params/returns | AC-001-02 |
| PR-07 | PROVIDER_RUNTIME_INTERFACE.validateRuntime params/returns | AC-001-02 |
| PR-08 | TASK_RESULT_FIELDS frozen | AC-002-02 |
| PR-09 | TASK_RESULT_FIELDS contents | AC-002-02 |
| PR-10 | KNOWN_PROVIDERS frozen | AC-007-02 |
| PR-11 | KNOWN_PROVIDERS contains claude/codex/antigravity | AC-007-02 |

### 4.2 validateProviderRuntime()

| Test ID | Target | Acceptance Criteria |
|---------|--------|-------------------|
| PR-12 | Valid mock runtime (all 5 methods) -> valid: true | AC-008-01 |
| PR-13 | Missing one method -> valid: false, correct missing | AC-008-02 |
| PR-14 | Missing multiple methods -> valid: false, lists all | AC-008-02 |
| PR-15 | null input -> valid: false, all methods missing | AC-008-01 |
| PR-16 | undefined input -> valid: false, all methods missing | AC-008-01 |
| PR-17 | Empty object -> valid: false, all 5 missing | AC-008-02 |
| PR-18 | Non-function values (strings) -> valid: false | AC-008-01 |
| PR-19 | Mixed valid/invalid methods -> correct missing list | AC-008-02 |
| PR-20 | Extra methods on runtime -> still valid: true | AC-008-01 |
| PR-21 | Partial runtime (3 of 5) -> valid: false, 2 missing | AC-008-02 |

### 4.3 createProviderRuntime()

| Test ID | Target | Acceptance Criteria |
|---------|--------|-------------------|
| PR-22 | Unknown provider -> throws ERR-RUNTIME-001 | AC-007-02 |
| PR-23 | Error message lists available providers | AC-007-02 |
| PR-24 | Known provider, no module -> throws with helpful message | AC-007-01 |
| PR-25 | Error code is ERR-RUNTIME-001 for unknown | AC-007-02 |
| PR-26 | Null provider name -> throws ERR-RUNTIME-001 | AC-007-02 |
| PR-27 | Empty string provider -> throws ERR-RUNTIME-001 | AC-007-02 |

### 4.4 getKnownProviders()

| Test ID | Target | Acceptance Criteria |
|---------|--------|-------------------|
| PR-28 | Returns array of 3 providers | AC-007-02 |
| PR-29 | Returns a copy (mutation safe) | Defensive coding |
| PR-30 | Contains claude, codex, antigravity | AC-007-02 |

### 4.5 Module Exports

| Test ID | Target | Acceptance Criteria |
|---------|--------|-------------------|
| PR-31 | Exports createProviderRuntime function | AC-007-01 |
| PR-32 | Exports validateProviderRuntime function | AC-008-01 |
| PR-33 | Exports getKnownProviders function | AC-007-02 |
| PR-34 | Exports PROVIDER_RUNTIME_INTERFACE constant | AC-001-01 |
| PR-35 | Exports TASK_RESULT_FIELDS constant | AC-002-02 |
| PR-36 | Exports KNOWN_PROVIDERS constant | AC-007-02 |

### 4.6 CJS Bridge Parity

| Test ID | Target | Acceptance Criteria |
|---------|--------|-------------------|
| BO-01 | Bridge exports createProviderRuntime | FR-007 bridge |
| BO-02 | Bridge exports validateProviderRuntime | FR-008 bridge |
| BO-03 | Bridge exports getKnownProviders | FR-007 bridge |
| BO-04 | Bridge exports PROVIDER_RUNTIME_INTERFACE | FR-001 bridge |
| BO-05 | Bridge exports TASK_RESULT_FIELDS | FR-002 bridge |
| BO-06 | Bridge exports KNOWN_PROVIDERS | FR-007 bridge |
| BO-07 | Bridge getKnownProviders matches ESM | FR-007 parity |
| BO-08 | Bridge validateProviderRuntime matches ESM | FR-008 parity |

## 5. Risk Mitigation

- **No provider runtime.js files exist yet**: Test error paths for createProviderRuntime. Use mock runtime objects for validateProviderRuntime success paths.
- **Dynamic import in factory**: Tests verify error handling when import fails (no module present).
- **Frozen constants**: Tests verify Object.isFrozen and mutation attempts fail silently.

## 6. Coverage Target

- Line coverage: >= 80%
- Branch coverage: >= 80%
- Function coverage: 100%
