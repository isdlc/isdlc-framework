# Coverage Report: BUG-0056 CodeBERT Embedding Non-Functional Stub Tokenize

**Date**: 2026-03-21
**Framework**: node:test (native Node.js test runner)
**Coverage Tool**: Not configured (no c8/istanbul)

---

## Coverage by Test File

| Test File | Tests | Pass | Fail | FRs Covered |
|-----------|-------|------|------|-------------|
| codebert-adapter.test.js | 12 | 12 | 0 | FR-001 |
| model-downloader.test.js | 10 | 10 | 0 | FR-002 |
| lifecycle.test.js | 16 | 16 | 0 | FR-004, FR-005, FR-006 |
| handler-wiring.test.js | 10 | 10 | 0 | FR-003 |
| **Total** | **48** | **48** | **0** | **6/6 FRs** |

## Coverage by Functional Requirement

| FR | Description | Test Count | AC Coverage |
|----|-------------|------------|-------------|
| FR-001 | BPE Tokenizer | 12 | AC-001-01..04 |
| FR-002 | Model Downloader | 10 | AC-002-01..05 |
| FR-003 | Handler Wiring | 10 | AC-003-01..05 |
| FR-004 | Installer Lifecycle | 6 | AC-004-01..04 |
| FR-005 | Uninstaller Cleanup | 4 | AC-005-01..03 |
| FR-006 | Updater Version Check | 6 | AC-006-01..03 |

## Coverage by Production File

| Production File | Test File(s) | Approach |
|----------------|-------------|----------|
| codebert-adapter.js | codebert-adapter.test.js | Direct import, function-level testing |
| model-downloader.js | model-downloader.test.js, lifecycle.test.js | Mocked fetch, direct API testing |
| installer.js | lifecycle.test.js | Source analysis (readFileSync) |
| uninstaller.js | lifecycle.test.js | Source analysis (readFileSync) |
| updater.js | lifecycle.test.js | Source analysis + direct API testing |
| isdlc.md | handler-wiring.test.js | Source analysis + API integration |
| package.json | codebert-adapter.test.js, lifecycle.test.js | Dependency verification |

## Notes

- Line/branch/function coverage percentages are not available because the project uses `node:test` without c8 or istanbul.
- Coverage is tracked by test count and FR/AC traceability.
- All 48 new tests achieve 100% pass rate.
