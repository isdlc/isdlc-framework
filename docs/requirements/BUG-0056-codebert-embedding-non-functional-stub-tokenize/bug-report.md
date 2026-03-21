# Bug Report: CodeBERT embedding non-functional — stub tokenizer, missing model, handler not wired

**Source**: github GH-126
**Severity**: High
**Generated**: 2026-03-21

## Expected Behavior

After framework installation, the local CodeBERT embedding path should work end-to-end:
- ONNX model downloaded to `.isdlc/models/codebert-base/model.onnx` during install
- Proper BPE tokenizer producing correct token IDs for CodeBERT inference
- Analyze handler calling `searchMemory()` with hybrid options (codebase index, link traversal, team profile) at startup
- Analyze handler producing enriched session records and triggering async embedding at session end
- Memory directories (`~/.isdlc/user-memory/`, `docs/.embeddings/`) created during install
- Model files cleaned up during uninstall

## Actual Behavior

The entire local embedding path is non-functional. Four independent gaps:

1. **Stub tokenizer**: `codebert-adapter.js:129` uses `Math.abs(hash % 30000) + 1000` — a hash function, not BPE. CodeBERT receives meaningless token IDs and produces garbage embeddings.
2. **Stub model downloader**: `model-downloader.js` returns `{ ready: false, reason: 'Model download not yet implemented' }`. No ONNX model file exists.
3. **Analyze handler not wired**: `isdlc.md` step 3a still calls `readUserProfile()` + `readProjectMemory()` (REQ-0063 flat JSON), never calls `searchMemory()` with REQ-0064/0066 hybrid options. Step 7.5a writes flat JSON only — no enriched session records, no async embedding.
4. **Installer lifecycle missing**: `installer.js`, `updater.js`, `uninstaller.js` have zero references to model downloads, memory directories, or the `tokenizers` npm package.

The fail-open design masks all of this — no errors, no warnings, just empty results silently degrading to no-op.

## Symptoms

- No `.isdlc/models/` directory exists (model never downloaded)
- No `~/.isdlc/user-memory/` directory exists (never created by installer)
- No `docs/.embeddings/` directory exists (never created by installer)
- `searchMemory()` with hybrid options never called (handler uses legacy path)
- No enriched session records produced (handler writes flat JSON only)
- `tokenizers` not in package.json (BPE tokenizer dependency missing)
- All memory search returns empty — silently, no diagnostic output

## Error Messages

None — this is the core problem. All paths fail-open with no diagnostic visibility.

## Reproduction Steps

1. Install the framework (`isdlc install`)
2. Check `.isdlc/models/` — does not exist
3. Check `~/.isdlc/user-memory/` — does not exist
4. Run `/isdlc analyze` on any item
5. Memory read at startup returns empty (no vector indexes)
6. Session write-back writes flat JSON only (no async embedding)
7. The memory infrastructure from REQ-0064/0066 is completely dormant

## Affected Area

- **Files**: `lib/embedding/engine/codebert-adapter.js`, `lib/embedding/installer/model-downloader.js`, `lib/embedding/installer/semantic-search-setup.js`, `src/claude/commands/isdlc.md`, `lib/installer.js`, `lib/updater.js`, `lib/uninstaller.js`, `package.json`
- **Modules**: CodeBERT adapter, model installer, analyze handler, framework lifecycle scripts

## Additional Context

- `onnxruntime-node` v1.24.3 IS installed in node_modules — the ONNX runtime itself works, only the model file and tokenizer are missing
- `tokenizers` npm package (v0.13.3) is available on npm but not in package.json
- The model downloader has a comment: "Group 1 validates the installer pipeline; actual model download is integrated when the full pipeline (Group 2+) is built" — Group 2+ was never built
- The codebert-adapter has a comment: "In production this would use a proper BPE tokenizer" — production tokenizer was never implemented
- BUG-0055 (blast radius validator) has been fixed — future builds will catch missing blast radius files, but this bug predates that fix
