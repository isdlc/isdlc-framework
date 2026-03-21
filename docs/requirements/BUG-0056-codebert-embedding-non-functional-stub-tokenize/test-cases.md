# Test Cases: BUG-0056 — CodeBERT Embedding Non-Functional

**Phase**: 05 - Test Strategy
**Bug ID**: BUG-0056
**Total Test Cases**: 44 (36 unit + 8 integration)

---

## FR-001: Replace Hash Tokenizer with BPE (12 unit tests)

### TC-001-01: tokenize() returns BPE token IDs from CodeBERT vocabulary
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Text input "function add(a, b) { return a + b; }"
- **When**: `tokenize()` runs with loaded BPE vocabulary
- **Then**: Token IDs are valid CodeBERT vocabulary entries (in range [0, 50265]) not hash-derived values in range [1000, 31000]
- **Priority**: P0

### TC-001-02: tokenize() prepends [CLS]=101 and appends [SEP]=102
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Any non-empty text input
- **When**: `tokenize()` runs
- **Then**: First token is 101 ([CLS]), last non-padding token is 102 ([SEP])
- **Priority**: P0

### TC-001-03: tokenize() pads output to maxLength (512)
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Short text input "hello"
- **When**: `tokenize()` runs with default maxLength=512
- **Then**: Output array length is exactly 512, trailing values are 0 (PAD)
- **Priority**: P1

### TC-001-04: tokenize() truncates input exceeding maxLength
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Text input with >510 words (enough to exceed 512 tokens with CLS+SEP)
- **When**: `tokenize()` runs with maxLength=512
- **Then**: Output array length is exactly 512, ends with SEP token
- **Priority**: P1

### TC-001-05: tokenize() produces different IDs for different words (not hash collisions)
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Text "function class import export"
- **When**: `tokenize()` runs
- **Then**: Each word maps to distinct token IDs consistent with CodeBERT BPE vocabulary
- **Priority**: P0

### TC-001-06: tokenizers npm package is in package.json dependencies
- **Requirement**: FR-001 / AC-001-02
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: The project package.json
- **When**: Reading dependencies
- **Then**: `tokenizers` is listed in `dependencies` or `optionalDependencies`
- **Priority**: P0

### TC-001-07: BPE tokenizer initializes from vocab file at .isdlc/models/codebert-base/
- **Requirement**: FR-001 / AC-001-03
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: A vocab.json file at `.isdlc/models/codebert-base/vocab.json` in a temp dir
- **When**: The tokenizer initializes
- **Then**: Tokenizer loads the vocabulary and is ready for encoding
- **Priority**: P0

### TC-001-08: createCodeBERTAdapter() returns null when tokenizers package unavailable
- **Requirement**: FR-001 / AC-001-04
- **Type**: negative
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: The `tokenizers` npm package is not installed (mocked to throw on import)
- **When**: `createCodeBERTAdapter()` is called
- **Then**: Returns null (fail-open, Article X compliant)
- **Priority**: P0

### TC-001-09: createCodeBERTAdapter() returns null when vocab file missing
- **Requirement**: FR-001 / AC-001-04
- **Type**: negative
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: The tokenizers package is available but no vocab file exists at the model path
- **When**: `createCodeBERTAdapter()` is called
- **Then**: Returns null (fail-open)
- **Priority**: P1

### TC-001-10: tokenize() handles empty string input
- **Requirement**: FR-001 / AC-001-01
- **Type**: negative
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Empty string ""
- **When**: `tokenize()` runs
- **Then**: Returns array of length 512 with [CLS, SEP, PAD, PAD, ...]
- **Priority**: P2

### TC-001-11: tokenize() handles unicode/special characters
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Text with unicode chars "const x = 'hello' // comment"
- **When**: `tokenize()` runs
- **Then**: Produces valid token IDs without errors
- **Priority**: P2

### TC-001-12: tokenize() is deterministic (same input produces same output)
- **Requirement**: FR-001 / AC-001-01
- **Type**: positive
- **File**: `lib/embedding/engine/codebert-adapter.test.js`
- **Given**: Same text input called twice
- **When**: `tokenize()` runs both times
- **Then**: Both outputs are identical
- **Priority**: P1

---

## FR-002: Implement ONNX Model Download (10 unit tests)

### TC-002-01: downloadModel() downloads model.onnx when directory empty
- **Requirement**: FR-002 / AC-002-01
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: Model directory does not exist or is empty (temp dir)
- **When**: `downloadModel()` runs with mocked HTTP fetch
- **Then**: model.onnx is written to `.isdlc/models/codebert-base/model.onnx` and result is `{ ready: true }`
- **Priority**: P0

### TC-002-02: downloadModel() skips download when model already exists
- **Requirement**: FR-002 / AC-002-02
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: model.onnx already exists at the expected path (pre-created in temp dir)
- **When**: `downloadModel()` runs
- **Then**: Returns `{ ready: true, alreadyExists: true }` and no HTTP request is made
- **Priority**: P0

### TC-002-03: downloadModel() returns ready:false on network failure
- **Requirement**: FR-002 / AC-002-03
- **Type**: negative
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: HTTP fetch is mocked to throw a network error
- **When**: `downloadModel()` runs
- **Then**: Returns `{ ready: false, reason: "download failed" }` without throwing
- **Priority**: P0

### TC-002-04: downloadModel() returns ready:false on HTTP 404
- **Requirement**: FR-002 / AC-002-03
- **Type**: negative
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: HTTP fetch returns 404
- **When**: `downloadModel()` runs
- **Then**: Returns `{ ready: false }` without throwing
- **Priority**: P1

### TC-002-05: downloadModel() also downloads vocab.json and tokenizer.json
- **Requirement**: FR-002 / AC-002-04
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: Successful mocked HTTP responses for all 3 files
- **When**: `downloadModel()` runs
- **Then**: model.onnx, vocab.json, and tokenizer.json all exist in model directory
- **Priority**: P0

### TC-002-06: downloadModel() reports progress via onProgress callback
- **Requirement**: FR-002 / AC-002-05
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: onProgress callback provided
- **When**: `downloadModel()` runs with mocked HTTP (streaming body)
- **Then**: onProgress called with values between 0 and 100, final call is 100
- **Priority**: P1

### TC-002-07: downloadModel() creates directory if it does not exist
- **Requirement**: FR-002 / AC-002-01
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: Model directory path does not exist
- **When**: `downloadModel()` runs (even if download fails)
- **Then**: Directory is created (mkdir recursive)
- **Priority**: P1

### TC-002-08: downloadModel() with null projectRoot throws or returns error
- **Requirement**: FR-002 / AC-002-03
- **Type**: negative
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: projectRoot is null
- **When**: `downloadModel(null)` runs
- **Then**: Returns `{ ready: false }` or handles gracefully
- **Priority**: P2

### TC-002-09: downloadModel() respects custom modelDir option
- **Requirement**: FR-002 / AC-002-01
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: Custom modelDir path in options
- **When**: `downloadModel()` runs
- **Then**: Model is downloaded to the custom path, not the default
- **Priority**: P2

### TC-002-10: getModelPath() returns correct path with defaults
- **Requirement**: FR-002 / AC-002-01
- **Type**: positive
- **File**: `lib/embedding/installer/model-downloader.test.js`
- **Given**: projectRoot = "/tmp/test-project"
- **When**: `getModelPath(projectRoot)` runs
- **Then**: Returns "/tmp/test-project/.isdlc/models/codebert-base/model.onnx"
- **Priority**: P2

---

## FR-003: Wire Analyze Handler (4 integration tests + 4 unit tests)

### TC-003-01: searchMemory() called with hybrid options at handler start
- **Requirement**: FR-003 / AC-003-01
- **Type**: positive
- **File**: `lib/memory-integration.test.js`
- **Given**: Vector indexes exist (mocked), handler step 3a executes
- **When**: Memory loading runs
- **Then**: `searchMemory()` is called with `codebaseIndexPath`, `traverseLinks: true`, `includeProfile: true` (not legacy `readUserProfile()`)
- **Priority**: P0

### TC-003-02: EnrichedSessionRecord written at handler completion
- **Requirement**: FR-003 / AC-003-02
- **Type**: positive
- **File**: `lib/memory-integration.test.js`
- **Given**: Handler step 7.5a executes after analysis completes
- **When**: Session record is written
- **Then**: Record contains `summary`, `context_notes`, `playbook_entry`, `importance` fields
- **Priority**: P0

### TC-003-03: embedSession() triggered after enriched record write
- **Requirement**: FR-003 / AC-003-03
- **Type**: positive
- **File**: `lib/memory-integration.test.js`
- **Given**: Enriched session record written successfully
- **When**: Post-write async actions execute
- **Then**: `embedSession()` from `lib/memory-embedder.js` is called with the record
- **Priority**: P0

### TC-003-04: Falls back to legacy path when no vector indexes exist
- **Requirement**: FR-003 / AC-003-04
- **Type**: positive
- **File**: `lib/memory-integration.test.js`
- **Given**: No vector indexes exist (first run), `searchMemory()` returns empty
- **When**: Memory loading runs
- **Then**: Falls back to legacy flat JSON path (readUserProfile + readProjectMemory) gracefully
- **Priority**: P0

### TC-003-05: Handler completes normally when embedSession() fails
- **Requirement**: FR-003 / AC-003-05
- **Type**: negative
- **File**: `lib/memory-integration.test.js`
- **Given**: `embedSession()` throws or returns error
- **When**: Handler continues after write
- **Then**: Raw session JSON persists and handler completes normally (fail-open, Article X)
- **Priority**: P0

### TC-003-06: searchMemory() receives correct codebaseIndexPath
- **Requirement**: FR-003 / AC-003-01
- **Type**: positive
- **File**: `lib/memory-integration.test.js`
- **Given**: Project with docs/.embeddings/codebase.emb
- **When**: searchMemory() is called
- **Then**: codebaseIndexPath points to the correct .emb file
- **Priority**: P1

### TC-003-07: writeSessionRecord() called with enriched record structure
- **Requirement**: FR-003 / AC-003-02
- **Type**: positive
- **File**: `lib/memory-integration.test.js`
- **Given**: Handler completes analysis
- **When**: writeSessionRecord() is invoked
- **Then**: Record has `summary` (string), `context_notes` (array), `playbook_entry` (string), `importance` (number 0-1)
- **Priority**: P1

### TC-003-08: Legacy flat record shape is NOT written when vector indexes exist
- **Requirement**: FR-003 / AC-003-01, AC-003-02
- **Type**: negative
- **File**: `lib/memory-integration.test.js`
- **Given**: Vector indexes exist, handler completes
- **When**: Session record is written
- **Then**: Record does NOT have the legacy-only shape (topics_covered without summary)
- **Priority**: P1

---

## FR-004: Add Embedding Infrastructure to Installer (6 unit tests)

### TC-004-01: Installer creates ~/.isdlc/user-memory/ directory
- **Requirement**: FR-004 / AC-004-01
- **Type**: positive
- **File**: `lib/installer.test.js`
- **Given**: Fresh installation in temp directory
- **When**: `isdlc init --force` runs
- **Then**: `~/.isdlc/user-memory/` directory exists (or mocked home dir equivalent)
- **Priority**: P0

### TC-004-02: Installer creates docs/.embeddings/ directory
- **Requirement**: FR-004 / AC-004-02
- **Type**: positive
- **File**: `lib/installer.test.js`
- **Given**: Fresh installation in project with `.isdlc/`
- **When**: `isdlc init --force` runs
- **Then**: `docs/.embeddings/` directory exists in project root
- **Priority**: P0

### TC-004-03: Installer calls downloadModel()
- **Requirement**: FR-004 / AC-004-03
- **Type**: positive
- **File**: `lib/installer.test.js`
- **Given**: Fresh installation
- **When**: `isdlc init --force` runs
- **Then**: downloadModel() is invoked (verified by model dir creation attempt)
- **Priority**: P0

### TC-004-04: Installer continues when model download fails
- **Requirement**: FR-004 / AC-004-03
- **Type**: negative
- **File**: `lib/installer.test.js`
- **Given**: downloadModel() returns `{ ready: false }`
- **When**: `isdlc init --force` runs
- **Then**: Installation completes successfully (non-blocking warning)
- **Priority**: P0

### TC-004-05: Installer creates user-memory dir idempotently
- **Requirement**: FR-004 / AC-004-01
- **Type**: positive
- **File**: `lib/installer.test.js`
- **Given**: user-memory directory already exists
- **When**: `isdlc init --force` runs again
- **Then**: No error, directory still exists
- **Priority**: P1

### TC-004-06: tokenizers package available after npm install
- **Requirement**: FR-004 / AC-004-04
- **Type**: positive
- **File**: `lib/installer.test.js`
- **Given**: package.json includes tokenizers
- **When**: Dependencies are checked
- **Then**: tokenizers can be imported without error
- **Priority**: P1

---

## FR-005: Add Embedding Cleanup to Uninstaller (4 unit tests)

### TC-005-01: Uninstaller removes .isdlc/models/ directory
- **Requirement**: FR-005 / AC-005-01
- **Type**: positive
- **File**: `lib/uninstaller.test.js`
- **Given**: Installed project with `.isdlc/models/codebert-base/model.onnx`
- **When**: `isdlc uninstall --force` runs
- **Then**: `.isdlc/models/` directory is removed
- **Priority**: P0

### TC-005-02: Uninstaller removes docs/.embeddings/ contents
- **Requirement**: FR-005 / AC-005-02
- **Type**: positive
- **File**: `lib/uninstaller.test.js`
- **Given**: Installed project with `docs/.embeddings/*.emb`
- **When**: `isdlc uninstall --force` runs
- **Then**: `docs/.embeddings/` contents are removed
- **Priority**: P0

### TC-005-03: Uninstaller removes ~/.isdlc/user-memory/memory.db
- **Requirement**: FR-005 / AC-005-03
- **Type**: positive
- **File**: `lib/uninstaller.test.js`
- **Given**: `~/.isdlc/user-memory/memory.db` exists
- **When**: `isdlc uninstall --force` runs
- **Then**: memory.db is removed, but raw session JSON files are preserved
- **Priority**: P0

### TC-005-04: Uninstaller handles missing model directory gracefully
- **Requirement**: FR-005 / AC-005-01
- **Type**: negative
- **File**: `lib/uninstaller.test.js`
- **Given**: No `.isdlc/models/` directory exists
- **When**: `isdlc uninstall --force` runs
- **Then**: Uninstall completes without error
- **Priority**: P1

---

## FR-006: Add Model Version Check to Updater (4 unit tests)

### TC-006-01: Updater re-downloads model when version differs
- **Requirement**: FR-006 / AC-006-01
- **Type**: positive
- **File**: `lib/updater.test.js`
- **Given**: Installed model version is "1.0.0", expected version is "1.1.0"
- **When**: `isdlc update` runs
- **Then**: Model is re-downloaded (downloadModel() called)
- **Priority**: P0

### TC-006-02: Updater skips download when model version matches
- **Requirement**: FR-006 / AC-006-02
- **Type**: positive
- **File**: `lib/updater.test.js`
- **Given**: Installed model version matches expected version
- **When**: `isdlc update` runs
- **Then**: No download occurs, update proceeds normally
- **Priority**: P0

### TC-006-03: Updater continues when model re-download fails
- **Requirement**: FR-006 / AC-006-03
- **Type**: negative
- **File**: `lib/updater.test.js`
- **Given**: Model version differs but downloadModel() returns `{ ready: false }`
- **When**: `isdlc update` runs
- **Then**: Update continues with existing model (non-blocking warning)
- **Priority**: P0

### TC-006-04: Updater handles missing model version file gracefully
- **Requirement**: FR-006 / AC-006-01
- **Type**: negative
- **File**: `lib/updater.test.js`
- **Given**: No model version file exists (fresh install that skipped download)
- **When**: `isdlc update` runs
- **Then**: Treats as needing download, attempts model download
- **Priority**: P1
