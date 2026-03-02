# Test Strategy: Ollama / Local LLM Support

**Feature:** REQ-0007-ollama-local-llm-support
**Phase:** 05-test-strategy
**Created:** 2026-02-14
**Status:** Draft

---

## 1. Existing Infrastructure

| Aspect | Value |
|--------|-------|
| **Test Runner** | `node:test` (built-in, Article II) |
| **Module System** | CJS for hooks (`*.test.cjs`), ESM for CLI/lib (`*.test.js`) |
| **Hook Test Location** | `src/claude/hooks/tests/*.test.cjs` |
| **E2E Test Location** | `tests/e2e/*.test.js` |
| **Prompt Verification Location** | `tests/prompt-verification/*.test.js` |
| **Test Commands** | `npm run test:hooks` (hooks), `npm run test:e2e` (E2E) |
| **Assertion Library** | `node:assert/strict` |
| **Coverage Tool** | None configured (manual verification) |
| **Existing Pattern** | Direct `require()` of CJS modules, no subprocess for unit tests |
| **Existing Hook Tests** | 23 test files covering hooks and common utilities |
| **Provider Test Coverage** | Zero -- `provider-utils.cjs` has no tests |

### Conventions (from existing tests)

1. CJS hook tests use `require('node:test')` and `require('node:assert/strict')`
2. Test files are co-located: `src/claude/hooks/tests/*.test.cjs`
3. Test helpers use `fs.mkdtempSync()` for temp directories, `fs.rmSync()` for cleanup
4. Module loading is direct `require()`, not subprocess
5. No external test dependencies (no jest, mocha, sinon, nock)
6. Mocking is manual (env var manipulation, file system fixtures)

---

## 2. Test Strategy Overview

### Approach: Extend Existing Test Suite

This strategy adds tests to the existing `src/claude/hooks/tests/` directory for provider-utils.cjs (CJS module) and to `tests/` for installer and configuration tests (ESM modules). No new test infrastructure or dependencies are introduced.

### Test Types

| Type | Scope | Files | Count |
|------|-------|-------|-------|
| **Unit** | autoDetectProvider() function logic | `provider-utils-autodetect.test.cjs` | ~18 tests |
| **Unit** | Provider configuration validation | `provider-config-validation.test.cjs` | ~8 tests |
| **Integration** | Installer provider selection flow | `installer-provider-selection.test.js` | ~10 tests |
| **Integration** | provider.md frontmatter toggle | `provider-command-toggle.test.cjs` | ~3 tests |
| **Content Verification** | CLAUDE.md.template documentation | `provider-documentation.test.js` | ~6 tests |
| **Backward Compatibility** | Existing behavior preservation | Spread across all test files | ~5 tests |
| **Error Handling** | Graceful degradation scenarios | Embedded in unit tests | ~6 tests |

**Total: ~56 test cases** covering 14 acceptance criteria, 3 NFRs, and 18 validation rules.

### Coverage Targets

| Target | Metric | Rationale |
|--------|--------|-----------|
| `autoDetectProvider()` | 100% branch coverage | Core logic, zero prior coverage |
| Provider config YAML | 100% of validation rules | Config correctness is critical |
| Installer UI | All 5 ACs for US-001 | User-facing, must be tested |
| Backward compatibility | Guard clause invariant verified | NFR-002 is Must Have |
| Error paths | All 5 PROV-DET-* error codes | NFR-003 is Must Have |

---

## 3. Test Approach by Module

### 3.1 Module M1: autoDetectProvider() -- Unit Tests

**File:** `src/claude/hooks/tests/provider-utils-autodetect.test.cjs`
**Runner:** `node --test src/claude/hooks/tests/provider-utils-autodetect.test.cjs`
**Integrated:** `npm run test:hooks`

**Strategy:** Direct function testing. Load `provider-utils.cjs` via `require()`, call `autoDetectProvider()` with crafted config objects and manipulated `process.env`. Mock HTTP health probes by overriding the internal `checkProviderHealth()` or by intercepting `http.get()` at the module level.

**Health Probe Mocking:** Since we cannot use external mock libraries (Article V) and must not make real HTTP calls, we will:
1. Create a minimal HTTP server using `http.createServer()` in test setup that listens on a random port
2. Override the Ollama base URL in the config to point to this test server
3. The test server returns controlled responses (200, timeout, connection refused)
4. Alternatively, if `autoDetectProvider()` calls `checkProviderHealth()` (which is also exported), we test `autoDetectProvider()` by providing config objects where the health check endpoint points to our test server

**Environment Variable Isolation:** Each test saves and restores `process.env` values in `before`/`after` hooks to ensure test isolation.

### 3.2 Module M2: Installer Provider Selection -- Integration Tests

**File:** `tests/integration/installer-provider-selection.test.js`
**Runner:** `node --test tests/integration/installer-provider-selection.test.js`

**Strategy:** Test `writeProviderConfig()` behavior by:
1. Creating temp directories with `.isdlc/` structure
2. Placing a copy of `provider-defaults.yaml` in the expected framework location
3. Calling the function (or simulating its logic if it is not exported)
4. Asserting the resulting `providers.yaml` has correct `defaults.provider` and `active_mode` values

For the installer UI (menu display), test the prompt choices array definition and the Next Steps output strings. The interactive `select()` call cannot be tested without mocking, so we verify the choice definitions and the conditional output logic.

For `install.sh` and `install.ps1`, use content verification (read the file, assert the expected patterns are present) since these are shell scripts that cannot be unit-tested with node:test.

### 3.3 Module M3: Provider Configuration -- Validation Tests

**File:** `src/claude/hooks/tests/provider-config-validation.test.cjs`
**Runner:** `npm run test:hooks`

**Strategy:** Load and parse `provider-defaults.yaml` using the existing `parseYaml()` from `provider-utils.cjs`. Assert all validation rules (VR-004 through VR-007) against the parsed Ollama models section.

### 3.4 Module M4: Documentation -- Content Verification

**File:** `tests/prompt-verification/provider-documentation.test.js`
**Runner:** `node --test tests/prompt-verification/provider-documentation.test.js`

**Strategy:** Read `src/claude/CLAUDE.md.template` and assert that required documentation sections exist (quick-start, env vars, recommended models table, known limitations). This follows the pattern established by `parallel-execution.test.js`.

### 3.5 Backward Compatibility -- Cross-Cutting

**Strategy:** Spread across test files. Key assertions:
1. `hasProvidersConfig()` returns `false` when no providers.yaml exists (guard clause test)
2. `autoDetectProvider()` is never called when `hasProvidersConfig()` returns `false`
3. Existing Anthropic-only users see no behavioral change
4. All existing hook tests continue to pass (verified by `npm run test:hooks`)

---

## 4. Test Commands

| Command | Scope |
|---------|-------|
| `node --test src/claude/hooks/tests/provider-utils-autodetect.test.cjs` | Auto-detection unit tests |
| `node --test src/claude/hooks/tests/provider-config-validation.test.cjs` | Config validation tests |
| `node --test tests/integration/installer-provider-selection.test.js` | Installer integration tests |
| `node --test tests/prompt-verification/provider-documentation.test.js` | Documentation content tests |
| `npm run test:hooks` | All hook tests (including new ones) |

---

## 5. Critical Paths

The following paths are critical and must have 100% test coverage (Article II.2):

1. **Tiered detection chain**: env var > config > health probe > fallback (6 behavior matrix rows)
2. **Installer provider selection**: user picks Ollama, providers.yaml is created correctly
3. **Backward compatibility guard**: `hasProvidersConfig()` returns false for Anthropic-only users
4. **Health probe error handling**: timeout, connection refused, HTTP error -- all result in graceful degradation
5. **Fail-open behavior**: any exception in `autoDetectProvider()` returns Anthropic default

---

## 6. Security Considerations

| Risk | Mitigation | Test |
|------|-----------|------|
| Path traversal in writeProviderConfig | Use `path.join()` exclusively | Verified in code review |
| Malformed YAML in providers.yaml | parseYaml() handles errors gracefully | TC-M3-07 |
| HTTP health probe to arbitrary host | Probe only hits localhost:11434 | TC-M1-14 |
| Env var injection | Tests isolate process.env changes | Test setup/teardown |

---

## 7. Performance Considerations

| Component | Target | Test |
|-----------|--------|------|
| Tier 1-2 detection (no I/O) | < 1ms | TC-M1-15 |
| Health probe timeout | <= 2000ms | TC-M1-09 |
| Full test suite execution | < 10s | Verified by CI |

---

## 8. Assumptions and Constraints

1. No external test dependencies (jest, mocha, sinon, nock) -- Article V
2. Health probe tests must NOT make real HTTP calls to `localhost:11434` -- use controlled test HTTP server or mock
3. All tests must be deterministic and offline-capable
4. Test files follow existing naming: `*.test.cjs` for CJS, `*.test.js` for ESM
5. Tests must pass on all 3 OS (macOS, Linux, Windows) in CI matrix
