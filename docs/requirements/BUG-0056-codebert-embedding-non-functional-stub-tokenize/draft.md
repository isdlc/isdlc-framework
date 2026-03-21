# BUG-0056: CodeBERT embedding non-functional — stub tokenizer, missing model download, analyze handler not wired

**Source**: GitHub Issue #126
**Created**: 2026-03-21

## Bug Description

The local CodeBERT embedding path is non-functional end-to-end. Three features (REQ-0045, REQ-0064, REQ-0066) each assumed the layer below was production-ready, but none verified it.

## Gaps Found

### 1. REQ-0045: CodeBERT adapter has stub tokenizer
- `lib/embedding/engine/codebert-adapter.js:129` uses a hash-based tokenizer (`Math.abs(hash % 30000) + 1000`) instead of proper BPE tokenization
- Comment in code: "In production this would use a proper BPE tokenizer"
- `lib/embedding/installer/model-downloader.js` is a stub — returns `{ ready: false, reason: 'Model download not yet implemented' }`
- Result: even with ONNX runtime installed, CodeBERT produces meaningless embeddings

### 2. REQ-0064: Built memory infrastructure assuming embedding engine works
- requirements-spec.md Section 4.1 lists CodeBERT as "Existing Infrastructure" without verifying functionality
- All memory modules (memory-store-adapter, memory-search, memory-embedder) depend on `lib/embedding/engine/` producing real embeddings
- The fail-open design masks the problem — empty results returned, no error shown

### 3. REQ-0066: Analyze handler integration specified but not implemented
- impact-analysis.md Tier 1 lists `src/claude/commands/isdlc.md` as a direct change (FR-001, FR-002)
- Implementation order step 9: "Analyze handler integration"
- Phase 06 implementation only modified `lib/memory-*.js` — handler wiring was skipped
- Handler still uses REQ-0063 flat JSON path (`readUserProfile` + `readProjectMemory`), not the new `searchMemory()` with hybrid options

### 4. Installer/Updater/Uninstaller lifecycle not managed
- No feature addressed model download in install script
- No feature addressed model cleanup in uninstall script
- No feature addressed directory creation (`~/.isdlc/user-memory/`, `docs/.embeddings/`) in install
- `tokenizers` npm package not added to package.json

## Expected Behavior

After `isdlc install`, the local CodeBERT embedding path should work:
- ONNX model downloaded to `.isdlc/models/codebert-base/model.onnx`
- Proper BPE tokenizer producing correct token IDs
- Analyze handler calling `searchMemory()` with hybrid options
- Directories created, lifecycle managed by install/update/uninstall

## Traces

- REQ-0045 FR-001, FR-005 (CodeBERT adapter)
- REQ-0064 FR-002, FR-003, FR-004 (async embedding, dual index, semantic search)
- REQ-0066 FR-001, FR-002 (hybrid query, team profile — handler wiring)
- REQ-0066 impact-analysis.md step 9 (analyze handler integration)
