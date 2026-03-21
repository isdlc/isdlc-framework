# Implementation Notes: BUG-0056 -- CodeBERT Embedding Non-Functional

**Phase**: 06 - Implementation
**Date**: 2026-03-21
**Bug**: BUG-0056 / GH-126

---

## Summary

Implemented 6 functional requirements to make the CodeBERT embedding path fully operational. Four independent gaps were fixed: stub tokenizer replaced with BPE, stub model downloader replaced with real HTTP fetch, analyze handler wired to use hybrid searchMemory() and enriched session records, and installer/uninstaller/updater updated with embedding lifecycle management.

## Changes by FR

### FR-001: BPE Tokenizer (codebert-adapter.js)

- Replaced hash-based tokenize() with proper BPE tokenization using the `tokenizers` npm package
- Added `tokenizers` to `package.json` optionalDependencies
- Tokenizer loads from `tokenizer.json` in the model directory (HuggingFace format)
- Uses RoBERTa/CodeBERT conventions: CLS=0, SEP=2, PAD=1
- Singleton tokenizer instance for performance
- Fail-open: createCodeBERTAdapter() returns null if tokenizers package unavailable OR vocab files missing
- Exported tokenize() for testing

### FR-002: Model Downloader (model-downloader.js)

- Replaced stub "ready: false" response with real HTTP fetch from HuggingFace
- Downloads 3 files: model.onnx, vocab.json, tokenizer.json
- Supports injectable `_fetchFn` for testing (dependency injection)
- Progress callback reports per-file and per-chunk progress
- Writes model-version.json for updater version tracking
- Null projectRoot returns ready:false gracefully
- Exports `getExpectedModelVersion()` and `getInstalledModelVersion()` for updater

### FR-003: Handler Wiring (isdlc.md)

- Step 3a Group 1: Added hybrid memory path using searchMemory() with codebaseIndexPath, traverseLinks, includeProfile
- Falls back to legacy readUserProfile() + readProjectMemory() when hybrid returns empty
- Step 7.5a: Updated to construct EnrichedSessionRecord with summary, context_notes, playbook_entry, importance
- Added async embedSession() trigger after enriched record write
- Fail-open on embedding failure (Article X)

### FR-004: Installer (installer.js)

- Added Step 8b after search capabilities setup
- Creates ~/.isdlc/user-memory/ directory
- Creates docs/.embeddings/ directory
- Calls downloadModel() with non-blocking failure handling
- Dry-run mode skips all embedding setup

### FR-005: Uninstaller (uninstaller.js)

- Added Step 10b for embedding cleanup
- Removes .isdlc/models/ directory
- Cleans docs/.embeddings/ contents
- Removes ~/.isdlc/user-memory/memory.db (preserves raw session JSON files)
- Handles missing directories gracefully

### FR-006: Updater (updater.js)

- Added model version check after search setup
- Reads installed version from model-version.json
- Compares against expected version from model-downloader.js
- Re-downloads model when version differs
- Non-blocking on download failure (existing model preserved)

## Test Results

- **New tests**: 48 (12 FR-001 + 10 FR-002 + 8 FR-003 + 6 FR-004 + 4 FR-005 + 5 FR-006 + 3 handler source verification)
- **All new tests passing**: Yes
- **Existing tests**: 1582 passing (3 pre-existing failures unrelated to BUG-0056)
- **Zero regressions**: Confirmed

## Design Decisions

1. **tokenizers as optionalDependency**: Since the embedding path is fail-open by design, making tokenizers optional allows the framework to install and run even when native compilation fails on some platforms.

2. **Injectable _fetchFn**: The model downloader accepts a `_fetchFn` option for testing, avoiding real HTTP calls in the test suite while still testing the full download pipeline.

3. **Source verification tests**: FR-003 handler wiring is tested through source analysis (verifying isdlc.md contains the correct API references) plus functional tests on the underlying modules. This is because isdlc.md is a markdown command file, not executable JavaScript.

4. **Model version tracking**: A `model-version.json` file is written alongside the model to support the updater's version check without requiring model file inspection.

## Constitutional Compliance

- **Article I**: Implemented exactly per requirements-spec.md
- **Article II**: Tests written before production code (TDD)
- **Article III**: HTTPS-only model downloads, path validation
- **Article V**: Minimal changes, no over-engineering
- **Article VII**: FR/AC IDs in code comments
- **Article VIII**: Inline docs updated
- **Article IX**: All required artifacts exist
- **Article X**: Fail-open pattern maintained throughout
