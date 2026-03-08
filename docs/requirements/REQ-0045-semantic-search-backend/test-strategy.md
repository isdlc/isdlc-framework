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

---
---

# Test Strategy: REQ-0045 Semantic Search Backend — Group 3

**Scope**: Group 3 Query Engine (FR-003, FR-004, FR-008, M7)
**Date**: 2026-03-06
**Phase**: 05 - Test Strategy

---

## Existing Infrastructure

- **Framework**: Node.js built-in `node --test` runner (`describe`, `it`, `before`, `after` from `node:test`)
- **Assertions**: `node:assert/strict`
- **Patterns**: Co-located tests (`lib/embedding/*/index.test.js`), ESM imports, temp directories for isolation
- **Helpers**: `lib/utils/test-helpers.js` — `createTempDir()`, `cleanupTempDir()`
- **Current Test Count**: 1018 ESM lib tests (Groups 1+2)
- **Dependencies already built**: M5 Package (builder, reader, encryption, manifest), M6 Module Registry

---

## Strategy for Group 3

**Approach**: Extend existing test suite following co-located ESM test pattern. M7 MCP Server gets `lib/embedding/mcp-server/index.test.js`. Tests operate entirely in-process — no Docker, no real FAISS, no network.

**Key Design Decision**: The MCP server, orchestrator, and store manager are pure JavaScript modules. Tests validate logic through direct function calls with mock data. No Docker containers are spun up in tests. No actual FAISS native bindings are required — we use the existing flat serialization format from M5.

**Coverage Target**: >=80% unit test coverage per Article II. 100% AC coverage via traceability matrix.

### Test Commands

- Unit: `node --test lib/embedding/mcp-server/*.test.js`
- Full suite: `npm test` (already includes `lib/embedding/**/*.test.js`)

---

## Test Pyramid

| Level | Count | Scope | Tooling |
|-------|-------|-------|---------|
| Unit | ~50 tests | Individual functions: store loading, query classification, fan-out, merge, re-rank, health, key rotation | `node:test` + `node:assert/strict` |
| Integration | ~15 tests | Pipeline flows: load package → search → results, encrypted package → decrypt → search, multi-store fan-out → merge | `node:test` with temp dirs |
| Boundary/Edge | ~10 tests | Empty stores, timeout handling, missing packages, corrupt manifests, wrong decryption key | `node:test` |

**Total estimated**: ~75 new tests

---

## Module Test Design

### Store Manager (`lib/embedding/mcp-server/store-manager.js`)

| Test Area | Test Count | AC Trace | Priority |
|-----------|-----------|----------|----------|
| `loadPackage()` — loads .emb, exposes vectors and metadata | 3 | AC-003-01 | P0 |
| `loadPackage()` — encrypted package with valid key | 2 | AC-008-01 | P0 |
| `loadPackage()` — encrypted package with wrong key → clear error | 2 | AC-008-03 | P0 |
| `unloadPackage()` — removes store from memory | 1 | AC-003-05 | P1 |
| `reloadPackage()` — hot-reload without restart | 2 | AC-003-05 | P0 |
| `listStores()` — returns loaded module info | 2 | AC-003-04 | P1 |
| `search()` — cosine similarity nearest neighbor on flat index | 3 | AC-003-02 | P0 |
| `search()` — empty index returns empty results | 1 | — | P2 |
| Key rotation: re-encrypt package, reload, search still works | 2 | AC-008-04 | P1 |
| Edge: corrupt .emb file → graceful error | 1 | AC-008-03 | P2 |
| Edge: non-existent path → clear error | 1 | — | P2 |

**Subtotal**: ~20 tests

### Query Orchestrator (`lib/embedding/mcp-server/orchestrator.js`)

| Test Area | Test Count | AC Trace | Priority |
|-----------|-----------|----------|----------|
| `orchestrate()` — single store, returns ranked hits | 2 | AC-004-01 | P0 |
| Query classifier — routes to correct stores based on query + metadata | 3 | AC-004-01 | P0 |
| Fan-out — parallel queries to multiple stores | 3 | AC-004-02 | P0 |
| Result merge — combines hits from multiple stores, deduplicates | 2 | AC-004-03 | P0 |
| Re-ranking — merged results sorted by relevance score | 2 | AC-004-03 | P0 |
| Timeout handling — partial results returned when stores timeout | 3 | AC-004-04 | P0 |
| Token budget — results truncated to stay within budget | 3 | AC-004-05 | P0 |
| `modulesTimedOut` populated when timeout occurs | 1 | AC-004-04 | P1 |
| Edge: no stores loaded → empty results | 1 | — | P2 |
| Edge: all stores timeout → empty results with degradation indicator | 1 | AC-004-04 | P2 |
| Edge: query is empty string → returns empty | 1 | — | P2 |

**Subtotal**: ~22 tests

### MCP Server (`lib/embedding/mcp-server/server.js`)

| Test Area | Test Count | AC Trace | Priority |
|-----------|-----------|----------|----------|
| `createServer()` — initializes with config, exposes tools | 2 | AC-003-01 | P0 |
| Tool: `semantic_search` — delegates to orchestrator, returns hits | 3 | AC-003-02 | P0 |
| Tool: `list_modules` — returns loaded module metadata | 2 | AC-003-02 | P0 |
| Tool: `module_info` — returns detail for specific module ID | 2 | AC-003-02 | P0 |
| Tool: `module_info` — unknown module ID → clear error | 1 | AC-003-02 | P1 |
| Health check — reports loaded modules, index sizes, latency | 2 | AC-003-04 | P0 |
| SSE transport configuration | 2 | AC-003-03 | P1 |
| Hot-reload — config change triggers store manager reload | 2 | AC-003-05 | P1 |
| Edge: startup with no packages → empty module list, healthy | 1 | — | P2 |

**Subtotal**: ~17 tests

### Package Security Integration (FR-008 at M7 level)

| Test Area | Test Count | AC Trace | Priority |
|-----------|-----------|----------|----------|
| Key ID stored in manifest, retrievable via `module_info` | 2 | AC-008-02 | P0 |
| Mixed load: encrypted + unencrypted packages in same server | 2 | AC-008-01 | P1 |
| Key rotation: old key → new key, verify search works on re-encrypted package | 2 | AC-008-04 | P0 |
| Decryption failure message includes key ID and package name | 2 | AC-008-03 | P0 |
| Missing key for encrypted package → clear error, other stores unaffected | 2 | AC-008-03 | P1 |

**Subtotal**: ~10 tests

### Cosine Similarity Utility

| Test Area | Test Count | AC Trace | Priority |
|-----------|-----------|----------|----------|
| `cosineSimilarity()` — known vectors, expected score | 2 | AC-004-03 | P0 |
| `findNearest()` — returns top-k by similarity | 2 | AC-003-02 | P0 |
| Edge: zero vector → score 0 | 1 | — | P2 |
| Edge: identical vectors → score 1.0 | 1 | — | P2 |

**Subtotal**: ~6 tests

---

## Flaky Test Mitigation

- **No Docker in tests**: MCP server tested as pure JS module, not containerized
- **No network calls**: All queries are in-process, no SSE transport in unit tests
- **No real FAISS**: Uses flat serialized index from M5 builder (Float32Array vectors)
- **Temp directories**: All package loading uses `createTempDir()` / `cleanupTempDir()`
- **Deterministic scoring**: Tests use known vectors with pre-computed similarity scores
- **Timeout simulation**: Uses `AbortController` with immediate abort, not real timers

---

## Performance Test Plan

Performance testing deferred to Group 4+ (full integration). Group 3 focuses on correctness.

Metrics to track when performance tests are added:
- Query latency: ms for single-store search (100K vectors)
- Fan-out latency: ms for 5-store parallel query
- Package load time: seconds for 100MB .emb file
- Memory usage: MB per loaded store

---

## Test Data Strategy

### Fixture Reuse

Reuse `tests/fixtures/embedding/sample-registry.json` from Group 2. Create additional fixtures:

| Fixture | Purpose | Contents |
|---------|---------|----------|
| `sample-package.emb` | Generated in `before()` hook | Built using M5 `buildPackage()` with 10 chunks, 4-dim vectors |
| `encrypted-package.emb` | Generated in `before()` hook | Same as above but with AES-256-GCM encryption |
| `sample-registry.json` | Module routing metadata | Already exists from Group 2 |

### Known Vector Pairs for Scoring

```javascript
// Pre-computed cosine similarity test pairs
const vecA = new Float32Array([1, 0, 0, 0]);  // unit vector x
const vecB = new Float32Array([0, 1, 0, 0]);  // orthogonal → similarity 0
const vecC = new Float32Array([1, 0, 0, 0]);  // identical → similarity 1.0
const vecD = new Float32Array([0.6, 0.8, 0, 0]); // angle → similarity 0.6
```

### Boundary Values

- Empty query string → empty results
- Query with all stores filtered out → empty results
- Token budget = 0 → no results
- Token budget = Infinity → all results
- `maxResults` = 1 → single best hit

### Invalid Inputs

- `null` / `undefined` query to `orchestrate()`
- Non-existent module ID to `module_info`
- Corrupt .emb file (truncated tar)
- Wrong-length encryption key

### Maximum-Size Inputs

- 100-chunk package with 768-dim vectors (verify search completes)
- Fan-out to 10 stores simultaneously

---

## Traceability Summary

| FR | AC Count | Test Count | Coverage |
|----|----------|-----------|----------|
| FR-003 | 5 | ~37 (server + store-manager) | 100% AC covered |
| FR-004 | 5 | ~22 (orchestrator) | 100% AC covered |
| FR-008 | 4 | ~16 (security integration + store-manager) | 100% AC covered |
| **Total** | **14** | **~75** | **100%** |

---

## Test File Layout

```
lib/
└── embedding/
    └── mcp-server/
        ├── server.js
        ├── orchestrator.js
        ├── store-manager.js
        └── index.test.js          ← All M7 unit tests (co-located)
```

All tests in a single file following the established pattern from M5 (`lib/embedding/package/index.test.js`) and M6 (`lib/embedding/registry/index.test.js`).

---
---

## Strategy for Group 4

**Scope**: M4 Content Redaction (FR-011) + M10 iSDLC Search Backend (FR-012)
**Date**: 2026-03-06
**Baseline**: 1095 tests passing

---

### M4: Content Redaction Pipeline (FR-011)

**Test File**: `lib/embedding/redaction/index.test.js`

#### Test Cases

| # | Test | Traces to |
|---|------|-----------|
| 1 | `redact()` with `interface` tier strips method bodies | AC-011-01 |
| 2 | `redact()` with `interface` tier preserves class names and return types | AC-011-01 |
| 3 | `redact()` with `interface` tier removes private members | AC-011-01 |
| 4 | `redact()` with `interface` tier keeps public constant values | AC-011-01 |
| 5 | `redact()` with `guided` tier includes interface content | AC-011-02 |
| 6 | `redact()` with `guided` tier generates behavioral summaries | AC-011-02 |
| 7 | `redact()` with `guided` tier falls back to interface when summary model unavailable | AC-011-02 |
| 8 | `redact()` with `full` tier passes content unchanged | AC-011-03 |
| 9 | `redact()` records tier in chunk metadata | AC-011-04 |
| 10 | `redact()` returns chunks with stripped content (before embedding guarantee) | AC-011-05 |
| 11 | `redact()` with empty chunks array returns empty array | Edge |
| 12 | `redact()` with null/invalid tier throws descriptive error | Edge |
| 13 | `redact()` with chunk lacking signatures returns minimal interface content | Edge |
| 14 | `extractSignatures()` extracts Java-style method signatures | AC-011-01 |
| 15 | `extractSignatures()` extracts TypeScript-style signatures | AC-011-01 |
| 16 | `extractSignatures()` handles classes with no methods | Edge |
| 17 | `generateSummary()` produces a brief description from code | AC-011-02 |
| 18 | `generateSummary()` respects maxSummaryTokens option | AC-011-02 |

---

### M10: iSDLC Search Backend (FR-012)

**Test File**: `lib/search/backends/semantic.test.js`

#### Test Cases

| # | Test | Traces to |
|---|------|-----------|
| 1 | `createSemanticBackend()` returns adapter with correct modality/priority/id | AC-012-01 |
| 2 | Adapter modality is `semantic`, priority is 10 | AC-012-01 |
| 3 | Adapter `requiresMcp` is true | AC-012-01 |
| 4 | `search()` delegates to MCP server and returns SearchHit[] | AC-012-02, AC-012-03 |
| 5 | `search()` normalizes MCP results to standard format | AC-012-02 |
| 6 | `search()` returns empty array on MCP failure (never throws) | AC-012-02 |
| 7 | `search()` uses SSE client URL from config | AC-012-03 |
| 8 | `search()` falls back to direct FAISS index when MCP unavailable | AC-012-04 |
| 9 | `healthCheck()` returns healthy with module count when MCP responds | AC-012-05 |
| 10 | `healthCheck()` returns unavailable when MCP server is down | AC-012-05 |
| 11 | `healthCheck()` times out and returns degraded within timeout limit | AC-012-05 |
| 12 | Missing mcpCallFn config → search returns empty array | Edge |
| 13 | Missing mcpCallFn config → healthCheck returns unavailable | Edge |
| 14 | `normalizeSemanticResults()` handles null/empty input | Edge |
| 15 | `normalizeSemanticResults()` maps MCP fields to standard format | AC-012-02 |

---

### Coverage Matrix

| FR | AC Count | Test Count | Coverage |
|----|----------|-----------|----------|
| FR-011 | 5 | ~18 (redaction pipeline) | 100% AC covered |
| FR-012 | 5 | ~15 (search backend) | 100% AC covered |
| **Total** | **10** | **~33** | **100%** |

---

### Test File Layout

```
lib/
├── embedding/
│   └── redaction/
│       ├── index.js                  ← Tier router
│       ├── interface-tier.js         ← Signature extraction
│       ├── guided-tier.js            ← Summary generation
│       └── index.test.js             ← All M4 unit tests
└── search/
    └── backends/
        ├── semantic.js               ← Backend adapter
        └── semantic.test.js           ← All M10 unit tests
```
