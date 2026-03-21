# Test Strategy: BUG-0056 — CodeBERT Embedding Non-Functional (Stub Tokenizer)

**Phase**: 05 - Test Strategy
**Bug ID**: BUG-0056
**External**: GH-126
**Date**: 2026-03-21

---

## Existing Infrastructure

- **Framework**: `node:test` (Node.js built-in test runner)
- **Assertion Library**: `node:assert/strict`
- **Module System**: ESM (`import`/`export`) for lib/ tests
- **Test Helpers**: `lib/utils/test-helpers.js` (createTempDir, cleanupTempDir, scaffoldProject)
- **Test Convention**: Co-located `*.test.js` beside source files
- **Test Commands**: `npm test` runs `node --test lib/*.test.js lib/utils/*.test.js lib/search/*.test.js lib/search/backends/*.test.js lib/embedding/**/*.test.js`
- **Existing Related Tests**: `lib/embedding/engine/index.test.js`, `lib/embedding/installer/index.test.js`, `lib/installer.test.js`, `lib/uninstaller.test.js`, `lib/updater.test.js`, `lib/memory-search.test.js`, `lib/memory-embedder.test.js`

## Strategy for This Bug Fix

- **Approach**: Extend existing test suites with new test files for tokenizer and model downloader; add embedding lifecycle tests to existing installer/uninstaller/updater test files
- **TDD**: Write failing tests FIRST (Article II), then implement fixes to make them pass (Red-Green)
- **Coverage Target**: >=80% line coverage on changed files (Article II standard tier)
- **New Test Types Needed**: Unit tests for tokenizer + downloader; integration tests for installer lifecycle + handler wiring

## Test Pyramid

### Unit Tests (36 tests)
Tests for isolated functions with mocked dependencies.

| Module | File | Count | Focus |
|--------|------|-------|-------|
| BPE Tokenizer | `lib/embedding/engine/codebert-adapter.test.js` | 12 | FR-001: tokenize() produces BPE IDs, loads vocab, fail-open on missing deps |
| Model Downloader | `lib/embedding/installer/model-downloader.test.js` | 10 | FR-002: download flow, skip-if-exists, error handling, progress callback |
| Installer embedding | `lib/installer.test.js` (extend) | 6 | FR-004: dir creation, model download call, non-blocking failure |
| Uninstaller embedding | `lib/uninstaller.test.js` (extend) | 4 | FR-005: model cleanup, embeddings cleanup, preserve user data |
| Updater model check | `lib/updater.test.js` (extend) | 4 | FR-006: version check, re-download, non-blocking failure |

### Integration Tests (8 tests)
Tests that exercise real cross-module interactions.

| Module | File | Count | Focus |
|--------|------|-------|-------|
| Handler wiring | `lib/memory-integration.test.js` (extend) | 4 | FR-003: searchMemory() called with hybrid options, enriched record written, embedSession() spawned, backward-compatible fallback |
| End-to-end embedding | `lib/embedding/engine/index.test.js` (extend) | 2 | FR-001+FR-002: tokenizer + model work together |
| Installer lifecycle | `lib/installer.test.js` (extend) | 2 | FR-004: full install creates embedding dirs + attempts model download |

### Performance Tests (0)
Not applicable for this bug fix. No performance regressions expected from replacing a hash function with a BPE tokenizer call.

### Security Tests (0)
No new attack surface. Model download uses HTTPS. File paths validated by existing fs-helpers.

## Flaky Test Mitigation

- **Network-dependent tests (model download)**: Mock HTTP responses at the `fetch` level. Do NOT call HuggingFace in CI. Use file-system fixtures for model-exists checks.
- **ONNX runtime availability**: Tests that require `onnxruntime-node` are guarded with try/catch import and skip when unavailable (existing pattern from `lib/embedding/engine/index.test.js`).
- **Temp directory isolation**: Each test suite creates its own temp dir via `createTempDir()` and cleans up via `cleanupTempDir()`. No shared state between tests.
- **Async timeout**: All async tests use explicit timeout or the default 30s. Model download tests mock the network layer so no real HTTP latency.

## Performance Test Plan

Not applicable for this bug fix scope. The tokenizer replacement (hash to BPE) operates on small text inputs (<512 tokens) with no performance SLA. If performance regression is suspected post-implementation, a micro-benchmark can be added in Phase 16 quality loop.

## Test Commands (existing infrastructure)

```bash
# Unit tests (includes new test files via glob pattern)
npm test

# Full suite (unit + hooks + characterization + e2e)
npm run test:all
```

## TDD Workflow (Fix-Specific)

For each FR:
1. **RED**: Write test that asserts the correct behavior (e.g., tokenize() returns BPE IDs, not hash IDs)
2. **Verify RED**: Run test, confirm it fails against current stub code
3. **GREEN**: Implement the fix to make the test pass
4. **Verify GREEN**: Run test, confirm it passes
5. **REFACTOR**: Clean up without breaking tests

## Constitutional Compliance

- **Article II**: Tests designed before implementation (this document). TDD Red-Green enforced.
- **Article VII**: Traceability matrix maps every FR/AC to test cases (see traceability-matrix.csv).
- **Article IX**: All GATE-04 checklist items validated (see gate validation below).
- **Article XI**: Integration tests validate cross-module interactions (handler wiring, installer lifecycle). Model download tests mock HTTP to avoid real URL dependency in unit tests but integration tests for installer exercise the full pipeline with mocked download.
