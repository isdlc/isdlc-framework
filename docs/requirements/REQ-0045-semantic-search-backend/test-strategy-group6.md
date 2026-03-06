# Test Strategy: REQ-0045 Semantic Search Backend -- Group 6: Enhancements

**Scope**: FR-005 Cloud Adapters (AC-005-03..05), FR-016 Discovery Integration (AC-016-01..08), FR-002 Knowledge Base Pipeline (AC-002-01..03)
**Date**: 2026-03-06
**Phase**: 05 - Test Strategy
**Baseline**: 303 embedding tests, all passing (Groups 1-5 complete)

---

## Existing Infrastructure

- **Framework**: Node.js built-in `node --test` runner (`describe`, `it`, `before`, `after` from `node:test`)
- **Assertions**: `node:assert/strict`
- **Helpers**: `lib/utils/test-helpers.js` -- `createTempDir()`, `cleanupTempDir()`, `createProjectDir()`
- **Pattern**: Co-located tests (`.test.js` alongside source), ESM imports
- **Test Command**: `node --test lib/embedding/**/*.test.js`
- **Existing Modules Tested**: M1 Chunker, M2 Engine (CodeBERT only), M3 VCS, M4 Redaction, M5 Package, M6 Registry, M7 MCP Server, M8 Distribution, M9 Aggregation, M10 Search Backend
- **Fixtures**: `tests/fixtures/embedding/` -- sample files, `sample-registry.json`, `compatibility-matrix.json`

### Dependencies Available from Prior Groups

| Module | Key Functions | Used By Group 6 |
|--------|--------------|-----------------|
| M2 `engine/index.js` | `embed()`, `healthCheck()`, `resolveAdapter()` | FR-005 extends with cloud adapters |
| M2 `engine/codebert-adapter.js` | `createCodeBERTAdapter()` | Pattern template for cloud adapters |
| M1 `chunker/index.js` | `chunkFile()`, `chunkContent()`, `detectLanguage()` | FR-002 extends chunking to documents |
| M5 `package/builder.js` | `buildPackage()` | FR-002 produces .emb packages, FR-016 builds packages |
| M5 `package/reader.js` | `readPackage()` | FR-016 loads packages into MCP |
| M6 `registry/index.js` | `loadRegistry()`, `registerModule()` | FR-016 registers discovered modules |
| M7 `mcp-server/server.js` | `createServer()` | FR-016 auto-loads embeddings into MCP |
| M3 `vcs/index.js` | `createAdapter()` | FR-016 uses VCS for file discovery |

### Key Existing Test Patterns

The engine test file (`engine/index.test.js`, 14 tests) establishes the pattern for testing providers:
- Tests for `embed()` with empty input, null input, missing config
- Tests for unsupported providers throwing errors
- Tests for cloud providers throwing "not yet implemented" (these will change to success tests)
- Tests for `healthCheck()` with valid/invalid configs
- Graceful handling when ONNX runtime is unavailable

Cloud adapter tests MUST update the existing expectations: `voyage-code-3` and `openai` providers currently throw "not yet implemented" and that behavior will change.

---

## Strategy

**Approach**: Extend existing test suite following established co-located ESM test patterns. New modules get new `.test.js` files. The existing `engine/index.test.js` is updated to reflect that cloud providers are now implemented.

**Cloud API Mocking**: All cloud provider tests use in-process HTTP mocks (Node.js `http.createServer()` on port 0). No real API calls to Voyage or OpenAI. Mock servers validate request structure, API key headers, and return deterministic embedding vectors.

**Discovery Workflow Mocking**: FR-016 tests mock the discovery orchestrator, architecture analyzer output, and MCP server loading. Tests validate the integration points and trigger timing without running actual discovery.

**Document Chunking**: FR-002 tests use inline test documents (markdown, HTML, plain text) with known structure to verify chunking boundaries.

**Coverage Target**: >=80% line coverage per Article II. 100% AC coverage via traceability matrix.

---

## Test Pyramid

| Level | Count | Scope |
|-------|-------|-------|
| Unit | ~58 | Cloud adapter methods, document chunker logic, discover integration functions |
| Integration | ~14 | Cloud adapter embed-to-healthCheck flow, document-to-package pipeline, discover-to-MCP loading |
| Edge/Negative | ~18 | Invalid API keys, network failures, malformed documents, unsupported formats, dimension mismatches |
| **Total** | **~90** | |

---

## Flaky Test Mitigation

| Risk | Mitigation |
|------|-----------|
| Mock HTTP server port conflicts | Use port 0 (OS-assigned) for all mock cloud API servers |
| Temp directory cleanup failures | Use `before()`/`after()` with `createTempDir()`/`cleanupTempDir()` from existing helpers |
| Floating-point vector comparisons | Use epsilon-based comparison for embedding vectors (tolerance 1e-6) |
| Race conditions in parallel discover mode | Test parallel mode with deterministic mock timers, not real concurrency |
| File system state leakage between tests | Each test gets its own subdirectory within the temp dir |
| Non-deterministic embedding vectors from mocks | Mock servers return fixed, pre-computed vectors for known inputs |

---

## Performance Test Plan

| Metric | Target | Method |
|--------|--------|--------|
| Cloud adapter embed() latency (mocked) | <100ms for 10 chunks | Time `embed()` against mock HTTP server |
| Document chunker throughput | <50ms for 100KB document | Time `chunkDocument()` on synthetic large markdown |
| Discover "before" mode (mocked) | <200ms for flat embedding of 50 files | Time full before-mode pipeline with mocked engine |
| Discover "after" mode partition | <100ms to re-partition 100 chunks into 5 modules | Time re-partition logic without re-embedding |
| KB pipeline end-to-end (3 documents) | <300ms | Time accept-chunk-build pipeline |

Performance assertions are included as soft checks (logged warnings, not hard failures) to prevent flaky CI.

---

## FR-005: Cloud Embedding Adapters (M2 Extension)

**Files under test**: `engine/voyage-adapter.js` (NEW), `engine/openai-adapter.js` (NEW), `engine/index.js` (MODIFIED), `engine/index.test.js` (MODIFIED)

### Mocking Strategy for Cloud APIs

Both Voyage and OpenAI adapters call external HTTP APIs. Tests use an in-process mock HTTP server:

```javascript
// Mock Voyage API server
const mockVoyageServer = http.createServer((req, res) => {
  // Validate: POST /v1/embeddings, Authorization: Bearer <key>
  // Return: { data: [{ embedding: [0.1, 0.2, ...], index: 0 }], model: 'voyage-code-3', usage: { total_tokens: 42 } }
});
mockVoyageServer.listen(0); // OS-assigned port
```

The mock validates:
1. Correct HTTP method (POST) and path (`/v1/embeddings`)
2. `Authorization: Bearer <api-key>` header present
3. Request body contains `input` (texts) and `model` fields
4. Returns realistic response shape with deterministic vectors

### voyage-adapter.js Tests

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 1 | `createVoyageAdapter({ apiKey })` returns adapter with `embed`, `healthCheck`, `dimensions`, `dispose` | AC-005-03 | positive | P0 |
| 2 | `adapter.embed(['code'])` sends POST to Voyage API with correct headers and body | AC-005-03 | positive | P0 |
| 3 | `adapter.embed(['code'])` returns Float32Array vectors with correct dimensions (1024) | AC-005-03 | positive | P0 |
| 4 | `adapter.healthCheck()` returns `{ healthy: true, dimensions: 1024 }` when API responds | AC-005-03 | positive | P0 |
| 5 | `adapter.healthCheck()` returns `{ healthy: false }` when API key is invalid (401) | AC-005-03 | negative | P0 |
| 6 | `adapter.embed()` with empty input returns empty vectors array | AC-005-03 | positive | P1 |
| 7 | `adapter.embed()` with network error (ECONNREFUSED) throws informative error | AC-005-03 | negative | P1 |
| 8 | `adapter.embed()` with API rate limit (429) throws with retry-after hint | AC-005-03 | negative | P1 |
| 9 | `adapter.dispose()` is a no-op (no persistent resources for HTTP client) | AC-005-03 | positive | P2 |
| 10 | Adapter sends correct `model` field in API request body | AC-005-05 | positive | P0 |

### openai-adapter.js Tests

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 11 | `createOpenAIAdapter({ apiKey })` returns adapter with `embed`, `healthCheck`, `dimensions`, `dispose` | AC-005-03 | positive | P0 |
| 12 | `adapter.embed(['code'])` sends POST to OpenAI API with correct headers and body | AC-005-03 | positive | P0 |
| 13 | `adapter.embed(['code'])` returns Float32Array vectors with correct dimensions (1536) | AC-005-03 | positive | P0 |
| 14 | `adapter.healthCheck()` returns `{ healthy: true, dimensions: 1536 }` when API responds | AC-005-03 | positive | P0 |
| 15 | `adapter.healthCheck()` returns `{ healthy: false }` when API key is invalid (401) | AC-005-03 | negative | P0 |
| 16 | `adapter.embed()` with empty input returns empty vectors array | AC-005-03 | positive | P1 |
| 17 | `adapter.embed()` with network error throws informative error | AC-005-03 | negative | P1 |
| 18 | `adapter.embed()` with API rate limit (429) throws with retry-after hint | AC-005-03 | negative | P1 |
| 19 | `adapter.dispose()` is a no-op | AC-005-03 | positive | P2 |
| 20 | Adapter sends `model: 'text-embedding-3-small'` by default, overridable via config | AC-005-05 | positive | P0 |
| 21 | Custom endpoint URL is respected when provided in config | AC-005-03 | positive | P1 |

### engine/index.js Integration Tests (resolveAdapter updates)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 22 | `embed(['text'], { provider: 'voyage-code-3', apiKey: 'key' })` returns valid EmbeddingResult | AC-005-03 | positive | P0 |
| 23 | `embed(['text'], { provider: 'openai', apiKey: 'key' })` returns valid EmbeddingResult | AC-005-03 | positive | P0 |
| 24 | `embed(['text'], { provider: 'voyage-code-3' })` without apiKey throws clear error | AC-005-03 | negative | P0 |
| 25 | `embed(['text'], { provider: 'openai' })` without apiKey throws clear error | AC-005-03 | negative | P0 |
| 26 | `healthCheck({ provider: 'voyage-code-3', apiKey: 'key' })` returns healthy status | AC-005-03 | positive | P1 |
| 27 | `healthCheck({ provider: 'openai', apiKey: 'key' })` returns healthy status | AC-005-03 | positive | P1 |

### Dimension Mismatch Handling (AC-005-04)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 28 | Voyage adapter reports dimensions=1024, OpenAI reports dimensions=1536, CodeBERT reports dimensions=768 | AC-005-04 | positive | P0 |
| 29 | `embed()` result includes `dimensions` matching the provider (not hardcoded) | AC-005-04 | positive | P0 |
| 30 | Building a package with Voyage embeddings creates a model-specific index (dimensions=1024 in manifest) | AC-005-04 | positive | P0 |
| 31 | Loading a package with wrong-dimension query vector throws clear dimension mismatch error | AC-005-04 | negative | P0 |

### Per-Module Model Configuration (AC-005-05)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 32 | Generation config `{ modules: [{ id: 'mod-a', model: 'voyage-code-3' }] }` uses Voyage for mod-a | AC-005-05 | positive | P0 |
| 33 | Generation config with `model: 'openai'` for one module and `model: 'codebert'` for another uses correct adapter per module | AC-005-05 | positive | P0 |
| 34 | Missing model in generation config defaults to `codebert` | AC-005-05 | positive | P1 |
| 35 | Invalid model name in generation config throws clear error before embedding starts | AC-005-05 | negative | P1 |

### Existing Test Updates (engine/index.test.js)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 36 | **UPDATE**: "throws for cloud providers not yet implemented" -> "resolves voyage-code-3 adapter when apiKey provided" | AC-005-03 | positive | P0 |
| 37 | **UPDATE**: "throws for openai provider not yet implemented" -> "resolves openai adapter when apiKey provided" | AC-005-03 | positive | P0 |
| 38 | **UPDATE**: healthCheck "returns unhealthy for cloud providers" -> "returns healthy for cloud providers with valid API key" | AC-005-03 | positive | P0 |

**FR-005 Subtotal**: ~38 tests

---

## FR-016: Discovery-Triggered Embedding Generation

**Files under test**: `lib/embedding/discover-integration.js` (NEW), `lib/embedding/discover-integration.test.js` (NEW)

### Module Design Summary

The discover integration module coordinates embedding generation within the discovery workflow. It provides:
- `offerEmbeddingGeneration(options)` -- presents the option to the user during `/discover --existing`
- `generateBeforeMode(options)` -- flat embedding of entire codebase
- `generateDuringMode(options)` -- parallel embedding alongside analysis agents
- `generateAfterMode(options)` -- module-partitioned embedding using architecture analysis output
- `upgradeToModulePartitioned(options)` -- converts flat embedding to module-partitioned
- `loadIntoMCPServer(options)` -- auto-loads generated embeddings into MCP server
- `generateEmbeddingReport(stats)` -- produces statistics for the discovery report

### Discovery Workflow Offer (AC-016-01)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 39 | `offerEmbeddingGeneration()` returns an options object with timing choices: `['before', 'during', 'after', 'skip']` | AC-016-01 | positive | P0 |
| 40 | `offerEmbeddingGeneration()` includes description for each timing option | AC-016-01 | positive | P1 |
| 41 | When user selects 'skip', no embedding generation is triggered | AC-016-05 | positive | P0 |
| 42 | When user selects a valid timing, returns the selected mode | AC-016-05 | positive | P0 |

### "Before" Mode -- Flat Embedding (AC-016-02)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 43 | `generateBeforeMode({ workingCopyPath })` generates a single flat .emb package for the entire codebase | AC-016-02 | positive | P0 |
| 44 | Generated package has `partitioned: false` in manifest | AC-016-02 | positive | P0 |
| 45 | Generated package includes all supported source files from the working copy | AC-016-02 | positive | P0 |
| 46 | `generateBeforeMode()` uses VCS adapter to enumerate files | AC-016-02 | positive | P1 |
| 47 | `generateBeforeMode()` with empty directory produces package with 0 chunks and warning | AC-016-02 | negative | P1 |
| 48 | `generateBeforeMode()` reports progress via callback (files processed, chunks generated) | AC-016-02 | positive | P2 |

### "During" Mode -- Parallel Generation (AC-016-03)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 49 | `generateDuringMode({ workingCopyPath })` generates flat embedding independently of analysis agents | AC-016-03 | positive | P0 |
| 50 | During-mode generation does not wait for or depend on architecture analysis results | AC-016-03 | positive | P0 |
| 51 | During-mode can run concurrently with a mock analysis agent (no shared state mutation) | AC-016-03 | positive | P1 |
| 52 | During-mode output is equivalent to before-mode output (flat, non-partitioned) | AC-016-03 | positive | P1 |

### "After" Mode -- Module-Partitioned Embedding (AC-016-04)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 53 | `generateAfterMode({ workingCopyPath, modules })` generates one .emb package per module | AC-016-04 | positive | P0 |
| 54 | Each module package contains only chunks from files belonging to that module | AC-016-04 | positive | P0 |
| 55 | Module boundaries come from architecture-analyzer output (mock) | AC-016-04 | positive | P0 |
| 56 | Each module package has `partitioned: true` and correct `moduleId` in manifest | AC-016-04 | positive | P0 |
| 57 | After-mode registers each module in the registry with domain metadata | AC-016-04 | positive | P1 |
| 58 | After-mode with empty module (no source files) produces warning but continues | AC-016-04 | negative | P1 |

### User Choice (AC-016-05)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 59 | User can select 'before' timing and only before-mode runs | AC-016-05 | positive | P0 |
| 60 | User can select 'during' timing and only during-mode runs | AC-016-05 | positive | P0 |
| 61 | User can select 'after' timing and only after-mode runs | AC-016-05 | positive | P0 |
| 62 | User can select 'skip' and no embedding generation occurs | AC-016-05 | positive | P0 |

### Flat-to-Partitioned Upgrade (AC-016-06)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 63 | `upgradeToModulePartitioned({ flatPackagePath, modules })` re-partitions existing chunks without re-embedding | AC-016-06 | positive | P0 |
| 64 | Upgrade reuses existing chunk vectors (no calls to embedding engine) | AC-016-06 | positive | P0 |
| 65 | Upgrade produces per-module .emb packages with correct partitioning | AC-016-06 | positive | P0 |
| 66 | Upgrade preserves chunk IDs and vector data exactly | AC-016-06 | positive | P0 |
| 67 | Upgrade with no module boundaries (single module) produces one package identical to flat | AC-016-06 | positive | P1 |
| 68 | Upgrade with chunks not matching any module assigns to "unclassified" module | AC-016-06 | negative | P1 |

### Auto-Load into MCP Server (AC-016-07)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 69 | `loadIntoMCPServer({ packagePaths })` calls MCP store-manager's `loadPackage()` for each path | AC-016-07 | positive | P0 |
| 70 | After loading, MCP server `listStores()` includes the newly loaded modules | AC-016-07 | positive | P0 |
| 71 | When MCP server is unavailable, auto-load logs warning but does not throw | AC-016-07 | negative | P1 |
| 72 | Multiple packages loaded in sequence all become available | AC-016-07 | positive | P1 |

### Discovery Report Statistics (AC-016-08)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 73 | `generateEmbeddingReport(stats)` returns markdown section with generation status | AC-016-08 | positive | P0 |
| 74 | Report includes: files processed, chunks generated, embedding dimensions, package count, total size | AC-016-08 | positive | P0 |
| 75 | Report includes timing mode used and duration | AC-016-08 | positive | P1 |
| 76 | Report with 0 files processed shows "no files found" message | AC-016-08 | negative | P1 |
| 77 | Report with failed generation includes error summary | AC-016-08 | negative | P1 |

### FR-016 Edge Cases

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 78 | `generateBeforeMode()` with non-existent workingCopyPath throws clear error | AC-016-02 | negative | P1 |
| 79 | `generateAfterMode()` with no modules array throws clear error | AC-016-04 | negative | P1 |
| 80 | `upgradeToModulePartitioned()` with non-existent flat package throws clear error | AC-016-06 | negative | P1 |
| 81 | All generation modes respect AbortSignal for cancellation | AC-016-02..04 | positive | P2 |

**FR-016 Subtotal**: ~43 tests

---

## FR-002: Knowledge Base Embedding Pipeline

**Files under test**: `lib/embedding/chunker/document-chunker.js` (NEW), `lib/embedding/chunker/document-chunker.test.js` (NEW), `lib/embedding/kb-pipeline.js` (NEW), `lib/embedding/kb-pipeline.test.js` (NEW)

### Module Design Summary

FR-002 introduces:
1. A document-oriented chunker (`document-chunker.js`) that understands markdown, HTML, and plain text structure
2. A KB pipeline (`kb-pipeline.js`) that orchestrates: accept documents -> chunk by structure -> embed -> build .emb package with `content_type: 'knowledge-base'`

### Document Acceptance (AC-002-01)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 82 | `chunkDocument(content, 'markdown')` parses markdown and returns chunks | AC-002-01 | positive | P0 |
| 83 | `chunkDocument(content, 'html')` parses HTML and returns chunks | AC-002-01 | positive | P0 |
| 84 | `chunkDocument(content, 'text')` parses plain text and returns chunks | AC-002-01 | positive | P0 |
| 85 | `chunkDocument(content, 'unsupported')` throws clear error listing supported types | AC-002-01 | negative | P0 |
| 86 | `detectDocumentType(filePath)` detects `.md` as markdown | AC-002-01 | positive | P1 |
| 87 | `detectDocumentType(filePath)` detects `.html`/`.htm` as html | AC-002-01 | positive | P1 |
| 88 | `detectDocumentType(filePath)` detects `.txt` as text | AC-002-01 | positive | P1 |
| 89 | `detectDocumentType(filePath)` returns null for unsupported extensions (`.pdf`, `.docx`) | AC-002-01 | negative | P1 |

### Structure-Aware Chunking (AC-002-02)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 90 | Markdown chunking splits on `# Heading` boundaries (H1 = top-level chunks) | AC-002-02 | positive | P0 |
| 91 | Markdown chunking splits on `## Heading` and `### Heading` (nested sections become sub-chunks) | AC-002-02 | positive | P0 |
| 92 | Markdown chunking preserves paragraph boundaries (empty lines) | AC-002-02 | positive | P0 |
| 93 | Markdown chunk includes its heading text as the chunk `name` field | AC-002-02 | positive | P1 |
| 94 | HTML chunking splits on `<h1>`..`<h6>` tags | AC-002-02 | positive | P0 |
| 95 | HTML chunking strips tags from chunk content (plain text output) | AC-002-02 | positive | P1 |
| 96 | Plain text chunking splits on double newlines (paragraph boundaries) | AC-002-02 | positive | P0 |
| 97 | Long paragraph exceeding maxTokens is split at sentence boundaries | AC-002-02 | positive | P1 |
| 98 | Single-heading markdown with long body produces multiple overlapping chunks | AC-002-02 | positive | P1 |
| 99 | Empty document returns empty chunks array | AC-002-02 | negative | P1 |
| 100 | Document with only whitespace returns empty chunks array | AC-002-02 | negative | P2 |

### Separate .emb Package Output (AC-002-03)

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 101 | `buildKBPackage({ documents, outputDir })` produces a valid .emb package | AC-002-03 | positive | P0 |
| 102 | KB package manifest has `content_type: 'knowledge-base'` (distinguishable from code embeddings) | AC-002-03 | positive | P0 |
| 103 | KB package manifest has `content_type: 'knowledge-base'`, code package has `content_type: 'code'` | AC-002-03 | positive | P0 |
| 104 | KB package chunks have `type: 'document'` or `type: 'section'` (not `function`/`class`) | AC-002-03 | positive | P0 |
| 105 | KB package is loadable by the existing `readPackage()` from M5 | AC-002-03 | positive | P0 |
| 106 | `buildKBPackage()` with mixed document types (md + html + txt) in one package | AC-002-03 | positive | P1 |

### FR-002 Edge Cases

| # | Test | AC | Type | Priority |
|---|------|-----|------|----------|
| 107 | Markdown with code fences (```) preserves code blocks as content, not as headings | AC-002-02 | positive | P1 |
| 108 | HTML with nested tags (`<div><p>text</p></div>`) extracts text correctly | AC-002-02 | positive | P1 |
| 109 | Document with very long line (10K chars) does not cause OOM or hang | AC-002-02 | negative | P2 |
| 110 | Markdown with front matter (YAML between `---`) excludes front matter from chunks | AC-002-02 | positive | P2 |

**FR-002 Subtotal**: ~29 tests

---

## Integration Tests (Cross-Module, Group 6)

These tests validate interactions between Group 6 modules and the existing infrastructure.

| # | Test | Modules | AC | Type | Priority |
|---|------|---------|----|------|----------|
| I1 | Cloud adapter embed -> buildPackage -> readPackage roundtrip (Voyage dimensions) | M2+M5 | AC-005-03, AC-005-04 | positive | P0 |
| I2 | Cloud adapter embed -> buildPackage -> readPackage roundtrip (OpenAI dimensions) | M2+M5 | AC-005-03, AC-005-04 | positive | P0 |
| I3 | Per-module model config: mod-a uses Voyage, mod-b uses CodeBERT, both produce valid packages | M2+M5 | AC-005-05 | positive | P0 |
| I4 | Document chunker -> embed -> buildKBPackage -> readPackage end-to-end | M1ext+M2+M5 | AC-002-01..03 | positive | P0 |
| I5 | Discover before-mode -> auto-load into MCP -> query returns results | FR-016+M7 | AC-016-02, AC-016-07 | positive | P0 |
| I6 | Discover after-mode -> module-partitioned packages -> load into MCP -> list_modules shows all | FR-016+M6+M7 | AC-016-04, AC-016-07 | positive | P0 |
| I7 | Discover before-mode -> upgrade to partitioned -> verify same chunk data | FR-016 | AC-016-02, AC-016-06 | positive | P0 |
| I8 | Mixed content: code embeddings + KB embeddings both loadable in same MCP server | M2+M5+M7+FR-002 | AC-002-03 | positive | P1 |

**Integration Subtotal**: 8 tests (counted within module totals where applicable)

---

## Test File Layout

```
lib/
  embedding/
    engine/
      index.js                     <- MODIFIED (resolveAdapter adds cloud cases)
      index.test.js                <- MODIFIED (update 3 existing tests, add ~24 new)
      codebert-adapter.js          <- EXISTING (unchanged)
      voyage-adapter.js            <- NEW
      voyage-adapter.test.js       <- NEW (~10 tests)
      openai-adapter.js            <- NEW
      openai-adapter.test.js       <- NEW (~11 tests)
    chunker/
      index.js                     <- EXISTING (unchanged)
      document-chunker.js          <- NEW (markdown/HTML/text chunking)
      document-chunker.test.js     <- NEW (~19 tests)
    discover-integration.js        <- NEW (FR-016 orchestration)
    discover-integration.test.js   <- NEW (~43 tests)
    kb-pipeline.js                 <- NEW (FR-002 end-to-end pipeline)
    kb-pipeline.test.js            <- NEW (~10 tests)
tests/
  fixtures/
    embedding/
      sample-registry.json         <- EXISTING
      sample-document.md           <- NEW (test markdown for FR-002)
      sample-document.html         <- NEW (test HTML for FR-002)
      sample-modules.json          <- NEW (mock architecture-analyzer output for FR-016)
```

---

## Test Data Strategy

### Mock Cloud API Servers

Each cloud adapter test creates an in-process HTTP server that mimics the real API:

**Voyage API Mock**:
```javascript
// POST /v1/embeddings
// Headers: Authorization: Bearer <key>, Content-Type: application/json
// Body: { input: ['text'], model: 'voyage-code-3' }
// Response: { data: [{ embedding: <1024-dim vector>, index: 0 }], model: 'voyage-code-3', usage: { total_tokens: 42 } }
```

**OpenAI API Mock**:
```javascript
// POST /v1/embeddings
// Headers: Authorization: Bearer <key>, Content-Type: application/json
// Body: { input: ['text'], model: 'text-embedding-3-small' }
// Response: { data: [{ embedding: <1536-dim vector>, index: 0 }], model: 'text-embedding-3-small', usage: { total_tokens: 42 } }
```

Mock servers return deterministic vectors: each text input's vector is derived from a hash of the input text, ensuring reproducibility.

### Document Fixtures for FR-002

**Markdown fixture** (`sample-document.md`):
```markdown
# Main Title

Introduction paragraph.

## Section One

Content of section one with **bold** and *italic*.

### Subsection 1.1

Detailed content here.

## Section Two

Another section with a code block:

` ` `javascript
function example() { return 42; }
` ` `

Final paragraph.
```

**HTML fixture** (`sample-document.html`):
```html
<html><body>
<h1>Main Title</h1>
<p>Introduction paragraph.</p>
<h2>Section One</h2>
<p>Content of section one.</p>
<h2>Section Two</h2>
<p>Another section.</p>
</body></html>
```

### Mock Architecture-Analyzer Output for FR-016

```json
{
  "modules": [
    { "id": "mod-auth", "name": "Authentication", "domain": "security.auth", "paths": ["src/auth/"] },
    { "id": "mod-orders", "name": "Order Management", "domain": "commerce.orders", "paths": ["src/orders/"] },
    { "id": "mod-payments", "name": "Payments", "domain": "commerce.payments", "paths": ["src/payments/"] }
  ]
}
```

### Boundary Values

| Category | Values |
|----------|--------|
| API key strings | `"sk-valid-key"`, `""`, `null`, `undefined`, `"sk-" + "x".repeat(200)` |
| Embedding dimensions | 768 (CodeBERT), 1024 (Voyage), 1536 (OpenAI), 0, -1, 999999 |
| Document sizes | Empty (0 bytes), minimal (1 heading), typical (5KB), large (100KB) |
| Module count (discover) | 0 (error), 1 (single), 3 (typical), 20 (stress) |
| File count (discover) | 0 (warning), 1, 50 (typical), 500 (stress) |
| Chunk token count | 0, 1, 512 (max CodeBERT), 1024, 8192 (cloud models) |
| Model names | `'codebert'`, `'voyage-code-3'`, `'openai'`, `'text-embedding-3-small'`, `''`, `'nonexistent'` |

### Invalid Inputs

| Input | Expected Behavior |
|-------|------------------|
| `embed(['text'], { provider: 'voyage-code-3' })` (no apiKey) | Throws `Error` with "apiKey is required for cloud providers" |
| `embed(['text'], { provider: 'openai', apiKey: '' })` | Throws `Error` with "apiKey must be a non-empty string" |
| `chunkDocument('', 'markdown')` | Returns empty chunks array |
| `chunkDocument(content, 'pdf')` | Throws `Error` with "unsupported document type" |
| `generateBeforeMode({ workingCopyPath: '/nonexistent' })` | Throws `Error` with "directory not found" |
| `upgradeToModulePartitioned({ flatPackagePath: null })` | Throws `Error` with "flatPackagePath is required" |
| `loadIntoMCPServer({ packagePaths: [] })` | No-op, returns `{ loaded: 0 }` |
| Cloud API returns malformed JSON | Throws `Error` with "invalid response from API" |
| Cloud API returns HTTP 500 | Throws `Error` with "API server error" |

### Maximum-Size Inputs

| Scenario | Size | Purpose |
|----------|------|---------|
| Markdown document with 500 headings | ~100KB | Verify chunker handles deep document structure |
| HTML document with 1000 nested tags | ~50KB | Verify HTML parser handles deep nesting |
| Batch embed 100 chunks via cloud adapter | 100 texts | Verify batching and progress reporting |
| Discover before-mode with 500 files | 500 mock files | Verify scalability of flat generation |
| Discover after-mode with 20 modules | 20 module definitions | Verify partitioning at scale |
| API response with 100 embedding vectors | 100 * 1536 floats | Verify large response parsing |

---

## Security Test Considerations

| Concern | Test Approach |
|---------|--------------|
| API key not logged | Verify cloud adapter errors do not include the API key in error messages |
| API key not in package | Verify .emb package manifest does not contain API keys |
| API key validation | Verify empty/null API keys are rejected before any network call |
| Network security | Verify adapters use HTTPS by default (mock validates URL scheme) |
| Document content sanitization | Verify HTML script tags are stripped from chunk content |
| Path traversal in document paths | Verify document chunker rejects paths with `../` |

---

## Traceability Matrix

| Requirement | AC | Test Cases | Test Type | Priority |
|------------|-----|-----------|-----------|----------|
| FR-005 | AC-005-03 | #1-9, #11-21, #22-27, #36-38 | positive, negative | P0-P2 |
| FR-005 | AC-005-04 | #28-31 | positive, negative | P0 |
| FR-005 | AC-005-05 | #10, #20, #32-35 | positive, negative | P0-P1 |
| FR-016 | AC-016-01 | #39-40 | positive | P0-P1 |
| FR-016 | AC-016-02 | #43-48, #78, #81 | positive, negative | P0-P2 |
| FR-016 | AC-016-03 | #49-52 | positive | P0-P1 |
| FR-016 | AC-016-04 | #53-58, #79 | positive, negative | P0-P1 |
| FR-016 | AC-016-05 | #41-42, #59-62 | positive | P0 |
| FR-016 | AC-016-06 | #63-68, #80 | positive, negative | P0-P1 |
| FR-016 | AC-016-07 | #69-72 | positive, negative | P0-P1 |
| FR-016 | AC-016-08 | #73-77 | positive, negative | P0-P1 |
| FR-002 | AC-002-01 | #82-89 | positive, negative | P0-P1 |
| FR-002 | AC-002-02 | #90-100, #107-110 | positive, negative | P0-P2 |
| FR-002 | AC-002-03 | #101-106 | positive | P0-P1 |

### Coverage Summary

| FR | AC Count | ACs Covered | Test Count | Coverage |
|----|----------|-------------|-----------|----------|
| FR-005 | 3 (AC-005-03..05) | 3/3 | ~38 | 100% |
| FR-016 | 8 (AC-016-01..08) | 8/8 | ~43 | 100% |
| FR-002 | 3 (AC-002-01..03) | 3/3 | ~29 | 100% |
| **Total** | **14** | **14/14** | **~110** | **100%** |

---

## Critical Paths

1. **Cloud adapter API key handling**: API keys must be validated before network calls, must not appear in error messages or logs, and must not be stored in generated packages. A leak here exposes customer credentials.

2. **Dimension consistency**: Each model produces different-dimension vectors (768, 1024, 1536). Indexes are model-specific. Loading a Voyage-indexed package and querying with a CodeBERT vector must produce a clear error, not silent wrong results.

3. **Discover-to-MCP pipeline**: The before/during/after modes must correctly produce packages that the MCP server can load. A failure in any step of this pipeline means developers lose semantic search during discovery.

4. **Flat-to-partitioned upgrade**: The upgrade path must preserve chunk vectors exactly. Re-partitioning must not re-embed (expensive and potentially produces different vectors if the model changes), and chunk IDs must remain stable for traceability.

5. **KB package distinguishability**: Knowledge base packages must be clearly distinguishable from code packages via manifest `content_type`. Loading both types in the same MCP server must work without conflicts.

---

## Existing Test Modifications

Three tests in `engine/index.test.js` must be updated because the behavior they test (cloud providers throwing "not yet implemented") will change:

| Current Test | New Test | Reason |
|-------------|----------|--------|
| `throws for cloud providers not yet implemented` (voyage) | Tests that Voyage adapter resolves when apiKey provided | Cloud adapter now implemented |
| `throws for openai provider not yet implemented` | Tests that OpenAI adapter resolves when apiKey provided | Cloud adapter now implemented |
| `returns unhealthy for cloud providers` (healthCheck) | Tests that healthCheck returns healthy with valid mock API | Cloud adapter now implemented |

These 3 tests are not new tests -- they are modifications of existing tests. They are tracked as #36-38 in the test case list.

---

## Gate-04 Checklist

- [x] Test strategy covers unit, integration, E2E, security, performance
- [x] Test cases exist for all requirements (FR-005: 38, FR-016: 43, FR-002: 29 = 110 total)
- [x] Traceability matrix complete (14/14 ACs = 100% coverage)
- [x] Coverage targets defined (>=80% line coverage per Article II)
- [x] Test data strategy documented (mock APIs, document fixtures, boundary values, invalid inputs, max-size inputs)
- [x] Critical paths identified (5 critical paths documented)
- [x] Existing test modifications identified (3 tests in engine/index.test.js)
- [x] Flaky test mitigation documented
- [x] Performance test plan defined
- [x] Security test considerations documented
- [x] Integration tests validate component interactions (Article XI)
