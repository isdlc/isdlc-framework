# Test Strategy: REQ-0045 Semantic Search Backend — Group 1

**Scope**: Group 1 Foundation (FR-015, FR-001, FR-014)
**Date**: 2026-03-06
**Phase**: 05 - Test Strategy

---

## Existing Infrastructure

- **Framework**: Node.js built-in `node --test` runner (`describe`, `it`, `before`, `after` from `node:test`)
- **Assertions**: `node:assert/strict`
- **Coverage Tool**: None configured (manual coverage by traceability)
- **Current Test Count**: 852+ tests across `lib/*.test.js`, `lib/search/*.test.js`, hooks CJS tests
- **Patterns**: Co-located tests (`lib/foo.test.js` alongside `lib/foo.js`), ESM imports, temp directories for isolation
- **Helpers**: `lib/utils/test-helpers.js` — `createTempDir()`, `cleanupTempDir()`, `setupProject()`, `captureConsole()`

---

## Strategy for Group 1

**Approach**: Extend existing test suite following co-located ESM test pattern. Each new module gets a `.test.js` file alongside its implementation.

**New Test Types Needed**: Unit tests for all 3 modules (M1 Chunker, M2 Engine, M3 VCS), plus installer integration tests for FR-015.

**Coverage Target**: >=80% unit test coverage per Article II. 100% AC coverage via traceability matrix.

### Test Commands

- Unit: `node --test lib/embedding/**/*.test.js`
- Installer: `node --test lib/installer/*.test.js` (new path)
- Full suite: `npm test` (extend glob in package.json)

---

## Test Pyramid

| Level | Count | Scope | Tooling |
|-------|-------|-------|---------|
| Unit | ~60 tests | Individual functions: chunking, embedding, VCS detection, language detection, installer setup | `node:test` + `node:assert/strict` |
| Integration | ~15 tests | Pipeline flows: chunk → embed, VCS → changed files → chunk, installer → verify components | `node:test` with real temp dirs |
| Boundary/Edge | ~10 tests | Empty files, unsupported languages, missing VCS, failed model load, network unavailable | `node:test` |

**Total estimated**: ~85 new tests

---

## Module Test Design

### M1: Chunking Engine (`lib/embedding/chunker/`)

**Files under test**: `index.js`, `treesitter-adapter.js`, `language-map.js`, `fallback-chunker.js`

| Test Area | Test Count | Priority |
|-----------|-----------|----------|
| `chunkFile()` — Java function extraction | 4 | P0 |
| `chunkFile()` — TypeScript class/method extraction | 4 | P0 |
| `chunkFile()` — XML element extraction | 3 | P1 |
| `chunkContent()` — string input (no file I/O) | 3 | P0 |
| `detectLanguage()` — extension mapping | 5 | P0 |
| Fallback chunker — line-based splitting | 4 | P1 |
| Chunk overlap and token limits | 3 | P1 |
| Edge: empty file, binary file, huge file | 3 | P2 |
| Chunk ID determinism | 2 | P1 |
| Signature extraction | 3 | P1 |

**Subtotal**: ~34 tests

### M2: Embedding Engine (`lib/embedding/engine/`)

**Files under test**: `index.js`, `codebert-adapter.js`

Note: Cloud adapters (Voyage, OpenAI) are Group 2+ scope. Only CodeBERT adapter tested in Group 1.

| Test Area | Test Count | Priority |
|-----------|-----------|----------|
| `embed()` — single text, returns correct shape | 2 | P0 |
| `embed()` — batch processing with progress callback | 3 | P0 |
| `embed()` — abort signal cancellation | 2 | P1 |
| `healthCheck()` — model available | 2 | P0 |
| `healthCheck()` — model unavailable | 2 | P1 |
| CodeBERT adapter — ONNX inference mock | 3 | P0 |
| Dimension consistency (768-dim for CodeBERT) | 1 | P0 |
| Edge: empty input, oversized input, malformed input | 3 | P2 |

**Subtotal**: ~18 tests

### M3: VCS Adapter (`lib/embedding/vcs/`)

**Files under test**: `index.js`, `git-adapter.js`, `svn-adapter.js`

| Test Area | Test Count | Priority |
|-----------|-----------|----------|
| `createAdapter()` — Git detection | 2 | P0 |
| `createAdapter()` — SVN detection | 2 | P0 |
| `createAdapter()` — no VCS throws | 1 | P0 |
| Git: `getChangedFiles()` — added, modified, deleted, renamed | 4 | P0 |
| Git: `getCurrentRevision()` | 1 | P1 |
| Git: `getFileList()` | 1 | P1 |
| SVN: `getChangedFiles()` — added, modified, deleted | 3 | P1 |
| SVN: `getCurrentRevision()` | 1 | P1 |
| SVN: `getFileList()` | 1 | P1 |
| Edge: empty repo, uncommitted changes only | 2 | P2 |

**Subtotal**: ~18 tests

### Installer: Semantic Search Setup (`lib/installer/`)

**Files under test**: `semantic-search-setup.js`, `model-downloader.js`

| Test Area | Test Count | Priority |
|-----------|-----------|----------|
| Setup function is idempotent (re-run skips installed) | 2 | P0 |
| Tree-sitter + grammars install check | 2 | P1 |
| CodeBERT model download with checksum | 2 | P1 |
| FAISS/SQLite native bindings install check | 2 | P1 |
| Docker image pull (mocked) | 1 | P2 |
| Docker unavailable — graceful skip | 1 | P0 |
| ONNX unavailable — graceful skip with warning | 1 | P0 |
| Config defaults written to search-config.json | 2 | P1 |
| Progress indicator callback fires | 1 | P2 |

**Subtotal**: ~14 tests

### CLI: `bin/isdlc-embedding.js`

| Test Area | Test Count | Priority |
|-----------|-----------|----------|
| `isdlc embedding generate` — help output | 1 | P1 |
| End-to-end: generate from Git repo (mocked model) | 1 | P0 |

**Subtotal**: ~2 tests (integration-level, covered in pipeline tests)

---

## Flaky Test Mitigation

- **Temp directories**: All tests use `createTempDir()` / `cleanupTempDir()` for isolated I/O
- **No network calls in unit tests**: CodeBERT ONNX model mocked via `node:test` mock; no real model download
- **No real VCS in unit tests**: Git/SVN operations use temp repos created in `before()` hooks
- **Deterministic IDs**: Chunk IDs use SHA-256 hash of content + position, not timestamps
- **No shared state**: Each test creates its own fixtures; no cross-test dependencies

---

## Performance Test Plan

Performance testing is deferred to Group 2+ (when the full pipeline is integrated). Group 1 focuses on correctness.

Metrics to track when performance tests are added:
- Chunking throughput: files/second for a 1000-file Java module
- Embedding throughput: chunks/second with CodeBERT
- VCS change detection: time for 10K-file repo

---

## Test Data Strategy

### Fixture Files

Create `tests/fixtures/embedding/` with:

| Fixture | Purpose | Contents |
|---------|---------|----------|
| `sample.java` | Java chunking tests | 3 classes, 8 methods, inner class, static block |
| `sample.ts` | TypeScript chunking tests | 2 classes, interfaces, arrow functions, exports |
| `sample.xml` | XML chunking tests | Nested elements, attributes, CDATA sections |
| `sample.py` | Python chunking tests | Functions, classes, decorators |
| `empty.txt` | Edge case | Empty file (0 bytes) |
| `binary.bin` | Edge case | Random bytes (should be skipped) |
| `unsupported.xyz` | Fallback chunker test | Text content with unknown extension |

### Boundary Values

- Empty string input to `chunkContent()`
- Single-line file (1 function signature only)
- File exceeding 512-token chunk limit (forces splitting)
- File with 0 functions (module-level code only)

### Invalid Inputs

- `null` / `undefined` to `chunkFile()`
- Non-existent file path
- Directory path instead of file
- Non-string language parameter

### Maximum-Size Inputs

- 10K-line Java file (verify chunking completes without OOM)
- 1000 chunks batch to `embed()` (verify batching works)

---

## Traceability Summary

| FR | AC Count | Test Count | Coverage |
|----|----------|-----------|----------|
| FR-001 | 5 | 34 (M1) + 18 (M2) = 52 | 100% AC covered |
| FR-014 | 5 | 18 (M3) + 2 (CLI) = 20 | 100% AC covered |
| FR-015 | 8 | 14 (installer) | 100% AC covered |
| **Total** | **18** | **~86** | **100%** |

---

## Test File Layout

```
lib/
├── embedding/
│   ├── chunker/
│   │   ├── index.js
│   │   ├── index.test.js          ← M1 unit tests
│   │   ├── treesitter-adapter.js
│   │   ├── language-map.js
│   │   └── fallback-chunker.js
│   ├── engine/
│   │   ├── index.js
│   │   ├── index.test.js          ← M2 unit tests
│   │   └── codebert-adapter.js
│   └── vcs/
│       ├── index.js
│       ├── index.test.js          ← M3 unit tests
│       ├── git-adapter.js
│       └── svn-adapter.js
├── installer/
│   ├── semantic-search-setup.js
│   ├── semantic-search-setup.test.js  ← FR-015 tests
│   └── model-downloader.js
tests/
└── fixtures/
    └── embedding/
        ├── sample.java
        ├── sample.ts
        ├── sample.xml
        ├── sample.py
        ├── empty.txt
        ├── binary.bin
        └── unsupported.xyz
```

Note: `npm test` script in package.json must be updated to include `lib/embedding/**/*.test.js` and `lib/installer/*.test.js`.
