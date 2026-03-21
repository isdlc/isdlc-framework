# Trace Analysis: CodeBERT embedding non-functional -- stub tokenizer, missing model, handler not wired

**Generated**: 2026-03-21T10:02:00.000Z
**Bug**: CodeBERT embedding path non-functional (4 independent gaps)
**External ID**: GH-126
**Workflow**: fix
**Phase**: 02-tracing

---

## Executive Summary

The entire local CodeBERT embedding path is non-functional due to four independent, unconnected gaps that span the full stack: (1) the tokenizer in `codebert-adapter.js` uses a hash function instead of BPE, producing meaningless token IDs; (2) the model downloader in `model-downloader.js` is a stub returning `ready: false`; (3) the analyze handler in `isdlc.md` calls the legacy REQ-0063 flat-JSON memory path (`readUserProfile` + `readProjectMemory`) instead of the REQ-0064/0066 `searchMemory()` with hybrid options, and writes flat session records instead of enriched records with async embedding; (4) the installer, updater, and uninstaller have zero references to embedding directories, model files, or the `tokenizers` npm package. The pervasive fail-open design (Article X) masks all failures as silent empty results with no warnings.

**Root Cause Confidence**: High
**Severity**: High
**Estimated Complexity**: High (4 independent fix areas, each touching different modules)

---

## Symptom Analysis

### Observed Symptoms

1. **No model directory exists** -- `.isdlc/models/` is never created because `model-downloader.js` line 67-74 returns `{ ready: false }` without downloading anything
2. **No user-memory directory exists** -- `~/.isdlc/user-memory/` is never created by the installer; it is only created lazily by `writeSessionRecord()` when sessions are written
3. **No embeddings directory exists** -- `docs/.embeddings/` is never created by any lifecycle script
4. **Memory search returns empty** -- `searchMemory()` is never called by the handler; the legacy `readUserProfile()` + `readProjectMemory()` path returns null/empty because no vector indexes exist
5. **Session records are flat JSON only** -- The handler at step 7.5a writes `{ topics_covered, depth_preferences_observed, overrides, session_timestamp }` without `summary`, `context_notes`, `playbook_entry`, or `importance` fields
6. **No async embedding triggered** -- `embedSession()` from `lib/memory-embedder.js` is never called because the handler does not produce enriched records
7. **No errors or warnings** -- Every failure path returns null, empty array, or `ready: false` silently

### Error Messages

None. This is the defining characteristic of this bug. All code paths fail-open per Article X, which is correct behavior for individual components but results in an entire subsystem being silently non-functional.

### Triggering Conditions

The bug manifests on every installation and every analyze session. There is no conditional trigger -- the embedding path is universally broken.

---

## Execution Path

### Gap 1: Stub Tokenizer

**Entry point**: `lib/embedding/engine/codebert-adapter.js` line 61 (`embed()` method)
**Call chain**:
1. `embed(texts)` at line 61
2. `tokenize(text)` at line 67 (internal call)
3. `tokenize()` at line 129-152: splits text on whitespace, computes `hash = ((hash << 5) - hash + charCode) | 0` per character, maps to `Math.abs(hash % 30000) + 1000`
4. Token IDs fed to ONNX model as `input_ids` tensor at line 72

**Failure point**: Line 137-141. The hash function produces pseudo-random token IDs in range [1000, 31000] that bear no relation to CodeBERT's BPE vocabulary. The model receives garbage input and produces garbage embeddings. The comment at line 124 says "In production this would use a proper BPE tokenizer" -- production tokenizer was never implemented.

**Evidence**:
- `codebert-adapter.js:124`: Comment explicitly marks this as a placeholder
- `codebert-adapter.js:136`: Comment says "Simple hash-based token ID (placeholder for real BPE tokenizer)"
- `package.json`: No `tokenizers` dependency present (confirmed via grep -- zero matches in entire codebase)

### Gap 2: Stub Model Downloader

**Entry point**: `lib/embedding/installer/model-downloader.js` line 43 (`downloadModel()`)
**Call chain**:
1. `downloadModel(projectRoot, options)` at line 43
2. `fileExists(modelPath)` at line 49 -- checks if model already exists (it does not)
3. `mkdir(dir, { recursive: true })` at line 59 -- creates directory
4. Returns `{ ready: false, modelPath, alreadyExists: false, reason: 'Model download not yet implemented...' }` at line 69-74

**Failure point**: Lines 61-74. After creating the directory, the function immediately returns `ready: false` without performing any download. The comment at lines 62-66 explicitly says "Group 1: Model download is a placeholder."

**Evidence**:
- `model-downloader.js:35-36`: Comment: "Group 1 validates the installer pipeline; actual model download is integrated when the full pipeline (Group 2+) is built"
- `model-downloader.js:67`: Progress callback reports "Model download not yet implemented (Group 2+ scope)"
- No HTTP/fetch calls anywhere in the file

**Cascading effect**: `semantic-search-setup.js` calls `downloadModel()` at line 119, gets `ready: false`, and records it as a warning at line 124. The `components.codebertModel.installed` is set to `false`. But the overall setup returns `success: true` at line 165 because the system "degrades gracefully."

### Gap 3: Analyze Handler Not Wired

**Entry point**: `src/claude/commands/isdlc.md`, step 3a Group 1
**Call chain (memory read)**:
1. Step 3a Group 1 fires `readUserProfile()` and `readProjectMemory(projectRoot)` from `lib/memory.js`
2. `mergeMemory(userProfile, projectMemory)` and `formatMemoryContext(merged)`
3. Produces `memoryContextBlock` for prompt injection

**What should happen instead**: Step 3a should call `searchMemory()` from `lib/memory-search.js` with:
- `codebaseIndexPath` for hybrid mode
- `traverseLinks: true` for 1-hop link traversal
- `includeProfile: true` for team profile loading
This would produce a `HybridSearchResult` with memory results, codebase results, and team profile for richer prompt context.

**Call chain (memory write-back)**:
1. Step 7.5a constructs flat session record: `{ topics_covered, depth_preferences_observed, overrides, session_timestamp }`
2. Calls `writeSessionRecord(record, projectRoot, userMemoryDir)` from `lib/memory.js`

**What should happen instead**: Step 7.5a should construct an `EnrichedSessionRecord` with `summary`, `context_notes`, `playbook_entry`, and `importance` fields, then:
1. Call `writeSessionRecord(enrichedRecord, ...)` -- the function already supports enriched records (line 294)
2. Spawn async `embedSession()` from `lib/memory-embedder.js` to generate vector embeddings

**Evidence**:
- `isdlc.md:671`: Explicitly references `readUserProfile()` and `readProjectMemory()` (REQ-0063 path)
- `isdlc.md:825-829`: Constructs flat record, never mentions `summary` or `embedSession`
- `lib/memory-search.js`: `searchMemory()` is fully implemented with hybrid mode (lines 45-237) but never called from handler
- `lib/memory-embedder.js`: `embedSession()` is fully implemented (lines 41-256) but never called from handler

### Gap 4: Installer Lifecycle Missing

**Installer** (`lib/installer.js`):
- 946 lines, zero references to `downloadModel`, `semantic-search-setup`, `user-memory`, `.embeddings`, `memory.js`, or `memory-embedder`
- Imports `setupSearchCapabilities` from `./setup-search.js` (line 34) but this is the older search setup, not the embedding setup from `lib/embedding/installer/semantic-search-setup.js`
- Never creates `~/.isdlc/user-memory/` directory
- Never creates `docs/.embeddings/` directory
- Never calls `downloadModel()` or `setupSemanticSearch()`

**Updater** (`lib/updater.js`):
- References embeddings only at line 673: a logger message suggesting `isdlc setup-knowledge`
- No model version check
- No model re-download
- No embedding directory creation

**Uninstaller** (`lib/uninstaller.js`):
- Zero references to models, embeddings, user-memory, or memory.db
- `.isdlc/models/` is never cleaned up
- `docs/.embeddings/` is never cleaned up
- `~/.isdlc/user-memory/memory.db` is never cleaned up

**Evidence**:
- `installer.js` grep for embed/model/memory: Only matches Ollama UI strings and generic "semantic search" logger text
- `updater.js` grep: Only one match -- a logger.info suggesting setup-knowledge
- `uninstaller.js` grep: Zero matches

---

## Root Cause Analysis

### Hypothesis H1: Incremental Feature Build Left Stubs (CONFIRMED -- Primary Root Cause)

**Confidence**: High

The REQ-0045 (embedding engine) implementation was designed as a multi-group incremental build:
- **Group 1**: Validate installer pipeline (model downloader stub, hash tokenizer stub)
- **Group 2+**: Actual model download, BPE tokenizer, handler wiring

Group 1 was completed and merged. Group 2+ was never built. The comments in the code explicitly confirm this:
- `model-downloader.js:35-36`: "Group 1 validates the installer pipeline; actual model download is integrated when the full pipeline (Group 2+) is built"
- `codebert-adapter.js:124`: "In production this would use a proper BPE tokenizer"

Subsequently, REQ-0064 (vector DB migration) and REQ-0066 (team continuity) built the full memory search and embedding infrastructure (`memory-search.js`, `memory-embedder.js`, `memory-store-adapter.js`) but never went back to:
1. Replace the Group 1 stubs with real implementations
2. Wire the analyze handler to use the new functions
3. Add embedding lifecycle management to installer/updater/uninstaller

### Hypothesis H2: Fail-Open Design Masked the Gaps (CONFIRMED -- Contributing Factor)

**Confidence**: High

Article X (Fail-Safe Defaults) mandates that all read operations fail-open. This is architecturally correct -- each component should degrade gracefully. However, the cumulative effect of 4 independent fail-open stubs creates a system that appears to work but produces no useful output. There are no diagnostic warnings, no health checks in the install flow, and no telemetry to detect the dormant state.

### Hypothesis H3: Missing Integration Test Coverage (CONFIRMED -- Contributing Factor)

**Confidence**: Medium

No integration test exercises the end-to-end flow: install framework -> verify model exists -> run analyze -> verify memory search used -> verify enriched record written -> verify embedding generated. Unit tests for each module pass in isolation because they test their own boundary behavior, but the integration gaps are never surfaced.

### Suggested Fixes

| Gap | Fix | Files | Complexity |
|-----|-----|-------|-----------|
| 1. Stub tokenizer | Replace hash tokenizer with `tokenizers` npm package BPE tokenizer loading CodeBERT vocab. Add `tokenizers` to `package.json` dependencies. Fail-open: return null from `createCodeBERTAdapter()` if tokenizer unavailable. | `lib/embedding/engine/codebert-adapter.js`, `package.json` | Medium |
| 2. Stub model downloader | Implement HTTP fetch from HuggingFace (`microsoft/codebert-base` ONNX export). Download `model.onnx` + `vocab.json` + `tokenizer.json`. Progress callback. SHA-256 validation. | `lib/embedding/installer/model-downloader.js` | Medium |
| 3. Handler not wired | Step 3a: Replace `readUserProfile()` + `readProjectMemory()` with `searchMemory()` call using hybrid options. Step 7.5a: Construct `EnrichedSessionRecord` and spawn async `embedSession()`. Backward-compatible fallback when no vector indexes exist. | `src/claude/commands/isdlc.md` | Medium |
| 4. Installer lifecycle | `installer.js`: Create `~/.isdlc/user-memory/` and `docs/.embeddings/`, call `downloadModel()`. `updater.js`: Check model version, re-download if needed. `uninstaller.js`: Clean `.isdlc/models/`, `docs/.embeddings/`, `~/.isdlc/user-memory/memory.db`. | `lib/installer.js`, `lib/updater.js`, `lib/uninstaller.js` | Medium |

---

## Tracing Metadata

```json
{
  "tracing_completed_at": "2026-03-21T10:02:00.000Z",
  "sub_agents": ["T1-symptom-analyzer", "T2-execution-path-tracer", "T3-root-cause-identifier"],
  "discovery_report_used": "docs/project-discovery-report.md",
  "error_keywords": ["stub", "hash tokenizer", "ready: false", "not yet implemented", "readUserProfile", "readProjectMemory", "Group 2+"],
  "files_traced": [
    "lib/embedding/engine/codebert-adapter.js",
    "lib/embedding/engine/index.js",
    "lib/embedding/installer/model-downloader.js",
    "lib/embedding/installer/semantic-search-setup.js",
    "src/claude/commands/isdlc.md",
    "lib/installer.js",
    "lib/updater.js",
    "lib/uninstaller.js",
    "lib/memory.js",
    "lib/memory-search.js",
    "lib/memory-embedder.js",
    "package.json"
  ],
  "constitutional_articles_validated": ["IV", "VII", "IX"],
  "phase_timing": {
    "debate_rounds_used": 0,
    "fan_out_chunks": 0
  }
}
```
