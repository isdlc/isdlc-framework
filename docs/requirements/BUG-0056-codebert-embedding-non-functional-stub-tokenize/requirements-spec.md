# Requirements Specification: Fix CodeBERT embedding end-to-end — tokenizer, model download, handler wiring, installer lifecycle

**Status**: Complete (bug analysis)
**Source**: GH-126
**Last Updated**: 2026-03-21

---

## 1. Business Context

### Problem Statement

The local CodeBERT embedding path — built across REQ-0045, REQ-0064, and REQ-0066 — is completely non-functional. The tokenizer is a stub (hash-based, not BPE), the model downloader is a placeholder, the analyze handler was never wired to use the new memory search, and the installer/updater/uninstaller don't manage any of the embedding infrastructure. The fail-open design masks all of this: no errors, no warnings, just silently empty results. This means the entire memory infrastructure from REQ-0064 (vector search, tiered dedup, self-ranking) and REQ-0066 (hybrid query, link traversal, team profile) is dormant.

---

## 6. Functional Requirements

### FR-001: Replace hash tokenizer with proper BPE tokenization
**Confidence**: High

The CodeBERT adapter must produce correct BPE token IDs that the ONNX model expects.

- **AC-001-01**: Given text input to `codebert-adapter.js`, when `tokenize()` runs, then it produces token IDs from the CodeBERT vocabulary (not hash-derived) using the `tokenizers` npm package
- **AC-001-02**: Given the `tokenizers` npm package is added to `package.json` dependencies, when `npm install` runs, then the package is available for import
- **AC-001-03**: Given a CodeBERT vocabulary file at `.isdlc/models/codebert-base/vocab.json` (or equivalent), when the tokenizer initializes, then it loads the vocabulary for BPE encoding
- **AC-001-04**: Given the tokenizer is unavailable (package not installed or vocab missing), when `createCodeBERTAdapter()` runs, then it returns null (same fail-open pattern as ONNX runtime missing)

### FR-002: Implement ONNX model download from HuggingFace
**Confidence**: High

The model downloader must fetch the CodeBERT ONNX model and vocabulary files.

- **AC-002-01**: Given the model directory does not exist, when `downloadModel()` runs, then it downloads the ONNX model from HuggingFace (`microsoft/codebert-base` ONNX export) to `.isdlc/models/codebert-base/model.onnx`
- **AC-002-02**: Given the model already exists and is valid, when `downloadModel()` runs, then it skips the download and returns `{ ready: true, alreadyExists: true }`
- **AC-002-03**: Given the download fails (network error, HuggingFace unavailable), when `downloadModel()` runs, then it returns `{ ready: false, reason: "download failed" }` without throwing
- **AC-002-04**: Given the model download succeeds, then the vocabulary/tokenizer config files required by FR-001 are also downloaded alongside the model
- **AC-002-05**: Given the model is downloaded, when `downloadModel()` runs with progress callback, then progress is reported (0-100%)

### FR-003: Wire analyze handler to use hybrid searchMemory()
**Confidence**: High

The analyze handler in `isdlc.md` must call `searchMemory()` with REQ-0064/0066 options at startup and produce enriched session records at session end.

- **AC-003-01**: Given vector indexes exist, when the analyze handler starts (step 3a), then it calls `searchMemory()` with `codebaseIndexPath`, `traverseLinks: true`, `includeProfile: true` instead of the legacy `readUserProfile()` + `readProjectMemory()` path
- **AC-003-02**: Given the analyze handler completes (step 7.5a), then it constructs an `EnrichedSessionRecord` with `summary`, `context_notes`, `playbook_entry`, and `importance` fields, and calls `writeSessionRecord()` with the enriched record
- **AC-003-03**: Given the enriched session record is written, then async embedding is triggered (spawn `embedSession()` from `lib/memory-embedder.js`)
- **AC-003-04**: Given no vector indexes exist (first run), when `searchMemory()` returns empty, then the handler falls back to the legacy flat JSON path gracefully (backward compatible)
- **AC-003-05**: Given async embedding fails, then the raw session JSON persists and the handler completes normally (fail-open)

### FR-004: Add embedding infrastructure to installer
**Confidence**: High

The install script must create directories and optionally download the model.

- **AC-004-01**: Given framework installation runs, then `~/.isdlc/user-memory/` directory is created if it doesn't exist
- **AC-004-02**: Given framework installation runs on a project with `.isdlc/`, then `docs/.embeddings/` directory is created if it doesn't exist
- **AC-004-03**: Given framework installation runs, then the installer attempts to download the CodeBERT model via `downloadModel()`. If download fails, installation continues (non-blocking warning)
- **AC-004-04**: Given the `tokenizers` npm package is in `package.json`, when `npm install` runs during framework setup, then the package is available

### FR-005: Add embedding cleanup to uninstaller
**Confidence**: High

The uninstall script must clean up model files and embedding directories.

- **AC-005-01**: Given framework uninstallation runs, then `.isdlc/models/` directory is removed
- **AC-005-02**: Given framework uninstallation runs, then `docs/.embeddings/` directory contents are removed (but the directory may be preserved if it contains user files)
- **AC-005-03**: Given framework uninstallation runs, then `~/.isdlc/user-memory/memory.db` (SQLite vector index) is removed. Raw session JSON files are preserved (user data).

### FR-006: Add model version check to updater
**Confidence**: High

The update script must check for model version changes and re-download if needed.

- **AC-006-01**: Given framework update runs, when the installed model version differs from the expected version, then the model is re-downloaded
- **AC-006-02**: Given framework update runs, when the model is current, then no download occurs
- **AC-006-03**: Given model re-download fails during update, then the update continues with the existing model (non-blocking warning)
