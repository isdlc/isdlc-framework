# Implementation Notes — Group 6: Cloud Adapters, KB Pipeline, Discovery Integration

**REQ-0045** | Semantic Search Backend | Group 6 — Enhancements
**Date**: 2026-03-06
**Phase**: 06-Implementation

## Summary

Group 6 implements three functional requirements that extend the embedding system with cloud model support, knowledge-base document processing, and discovery workflow integration.

## FR-005: Cloud Adapters (Voyage-code-3, OpenAI)

### Files Created
- `lib/embedding/engine/voyage-adapter.js` — Voyage-code-3 API client (1024 dimensions)
- `lib/embedding/engine/openai-adapter.js` — OpenAI text-embedding-3-small client (1536 dimensions)
- `lib/embedding/engine/voyage-adapter.test.js` — 17 tests
- `lib/embedding/engine/openai-adapter.test.js` — 20 tests

### Files Modified
- `lib/embedding/engine/index.js` — Updated `resolveAdapter()` to load cloud adapters; added `getDimensionsForProvider()` helper; exports `VOYAGE_DIMENSIONS` and `OPENAI_DIMENSIONS`
- `lib/embedding/engine/index.test.js` — Updated 3 tests that asserted "not yet implemented" to assert "requires config.apiKey"; added 4 new tests for cloud dimension constants

### Design Decisions
1. **Native fetch()**: Both adapters use Node.js native `fetch()` (no external HTTP library), consistent with the constraint in the task spec.
2. **L2 normalization**: All vectors are L2-normalized before return, consistent with the CodeBERT adapter pattern.
3. **Error messages include provider name and HTTP status**: Errors are descriptive with context (e.g., `"voyage-code-3: API returned HTTP 401: Invalid API key"`).
4. **Custom endpoint support**: OpenAI adapter accepts a configurable `endpoint` for Azure OpenAI deployments.
5. **API key validation at construction time**: Both adapters throw synchronously if `apiKey` is missing, failing fast before any network calls.

### Acceptance Criteria Coverage
- **AC-005-03**: Both adapters are configurable via API keys in settings (passed through `config.apiKey` in the engine)
- **AC-005-04**: Dimension mismatch handled — each adapter returns its own `dimensions` constant (768/1024/1536), and indexes are model-specific through the existing per-module package system
- **AC-005-05**: Model selection configurable per-module via `config.provider` / `config.modelId`

## FR-002: Knowledge Base Embedding Pipeline

### Files Created
- `lib/embedding/knowledge/document-chunker.js` — Structure-aware chunking for markdown, HTML, plain text
- `lib/embedding/knowledge/pipeline.js` — End-to-end KB embedding pipeline
- `lib/embedding/knowledge/index.js` — Public API re-exports
- `lib/embedding/knowledge/index.test.js` — 25 tests

### Design Decisions
1. **Markdown chunking**: Splits on headings (`#`, `##`, etc.) while keeping code blocks (` ``` `) as atomic units within their section.
2. **HTML chunking**: Strips tags, splits on block-level elements (`h1-h6`, `p`, `div`, `section`).
3. **Plain text chunking**: Splits on double newlines (paragraph boundaries).
4. **Section path breadcrumbs**: Each chunk includes a `sectionPath` field (e.g., `"Root > Chapter > Sub-section"`) for contextual search results.
5. **Content type tagging**: Pipeline output includes `contentType: 'knowledge-base'` to distinguish from code embeddings in `.emb` packages.
6. **Max tokens**: Default 512 tokens per chunk, consistent with code chunker, using 4 chars/token estimate.

### Acceptance Criteria Coverage
- **AC-002-01**: Pipeline accepts markdown, HTML, and plain text documents
- **AC-002-02**: Chunking respects document structure (headings, sections, paragraphs, code blocks)
- **AC-002-03**: Output tagged as `knowledge-base` content type, distinguishable from code embeddings

## FR-016: Discovery-Triggered Embedding Generation

### Files Created
- `lib/embedding/discover-integration.js` — Discovery workflow integration
- `lib/embedding/discover-integration.test.js` — 14 tests

### Design Decisions
1. **Three trigger modes**: `before` (flat), `during` (flat, concurrent), `after` (module-partitioned).
2. **Dependency injection for testability**: Internal functions (`_chunkFn`, `_embedFn`, `_listFilesFn`) are injectable, allowing full unit testing without filesystem or network dependencies.
3. **Upgrade without re-generation**: `upgradeToModulePartitioned()` re-partitions existing flat embeddings by file path matching, avoiding costly re-embedding.
4. **Stats for discovery report**: `getEmbeddingStats()` extracts totalChunks, totalFiles, packageCount, timeTakenMs from results.
5. **Skip support**: Passing `mode: null` returns a skip result, supporting user opt-out.

### Acceptance Criteria Coverage
- **AC-016-01**: Integration point for `/discover --existing` (function exported for orchestrator use)
- **AC-016-02**: "Before" mode generates flat embedding of entire codebase
- **AC-016-03**: "During" mode generates embeddings concurrently (same flat approach, designed for parallel invocation)
- **AC-016-04**: "After" mode uses module boundaries for partitioned embeddings
- **AC-016-05**: User can choose trigger timing or skip (null mode returns skip result)
- **AC-016-06**: `upgradeToModulePartitioned()` re-partitions without full re-generation
- **AC-016-07**: Generated embeddings structured for MCP server loading (packages array with moduleId/chunks/vectors)
- **AC-016-08**: `getEmbeddingStats()` provides stats for discovery report

## Test Summary

| Module | Tests | Pass | Coverage |
|--------|-------|------|----------|
| Voyage Adapter | 17 | 17 | 97.08% |
| OpenAI Adapter | 20 | 20 | 97.18% |
| Knowledge Base Pipeline | 25 | 25 | 93.9-98.2% |
| Discover Integration | 14 | 14 | 96.65% |
| Engine Index (modified) | 21 | 21 | 80.34% |
| **All embedding tests** | **382** | **382** | **88.36%** |

All 303 existing tests from Groups 1-5 continue to pass. 79 new tests added for Group 6.

## Backward Compatibility

- No breaking changes to existing M2 Engine API
- `embed()` and `healthCheck()` continue to work identically for `codebert` provider
- Cloud providers now require `config.apiKey` instead of throwing "not yet implemented"
- New exports (`VOYAGE_DIMENSIONS`, `OPENAI_DIMENSIONS`) added alongside existing `CODEBERT_DIMENSIONS`
