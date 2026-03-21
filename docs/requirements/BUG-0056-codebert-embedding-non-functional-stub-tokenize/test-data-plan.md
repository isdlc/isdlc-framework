# Test Data Plan: BUG-0056 — CodeBERT Embedding Non-Functional

**Phase**: 05 - Test Strategy
**Bug ID**: BUG-0056

---

## Overview

Test data for this bug fix spans four categories: tokenizer input strings, model file fixtures, session record structures, and lifecycle directory layouts. All test data is generated programmatically or created as minimal fixtures -- no production data is used.

---

## Boundary Values

### Tokenizer Input Length
| Input | Token Count | Expected Behavior |
|-------|-------------|-------------------|
| Empty string `""` | 0 words | Returns [CLS, SEP, PAD...], length 512 |
| Single word `"x"` | 1 word | Returns [CLS, token, SEP, PAD...], length 512 |
| Exactly 510 words | 510 + CLS + SEP = 512 | Returns 512 tokens, no padding needed |
| 511 words | Exceeds maxLength | Truncated to 510 + CLS + SEP = 512 |
| 1000 words | Far exceeds maxLength | Truncated to 512 tokens |
| Single char per word `"a b c"` | 3 words | BPE tokenizes single chars correctly |

### Model File Size
| Scenario | Size | Expected Behavior |
|----------|------|-------------------|
| Valid model.onnx | >0 bytes | fileExists returns true, skip download |
| Empty file (0 bytes) | 0 bytes | May be treated as corrupt; re-download |
| Missing file | N/A | Download triggered |

### Progress Callback Values
| Scenario | Expected Values |
|----------|----------------|
| Successful download | 0, intermediate values, 100 |
| Failed download | 0, then error (no 100) |
| Already exists | 100 immediately |

---

## Invalid Inputs

### Tokenizer
| Input | Expected Behavior |
|-------|-------------------|
| `null` | Returns empty token array or throws internally (handled by caller) |
| `undefined` | Returns empty token array or throws internally |
| Number `42` | Type coerced or error caught by embed() caller |
| Object `{}` | Type coerced or error caught |
| String with only whitespace `"   "` | Returns [CLS, SEP, PAD...] (no word tokens) |
| String with null bytes `"hello\0world"` | Handled gracefully by BPE tokenizer |

### Model Downloader
| Input | Expected Behavior |
|-------|-------------------|
| `projectRoot = null` | Returns `{ ready: false }` without crashing |
| `projectRoot = ""` | Returns `{ ready: false }` or creates relative path |
| `projectRoot = "/nonexistent/deep/path"` | mkdir recursive creates dirs, download fails gracefully |
| `options.modelDir = 42` (not string) | Returns `{ ready: false }` |
| `options.onProgress = "not a function"` | Ignored or error caught |

### Handler Wiring (searchMemory options)
| Input | Expected Behavior |
|-------|-------------------|
| No vector indexes at all | Falls back to legacy readUserProfile() + readProjectMemory() |
| searchMemory() returns null | Treated as empty, falls back to legacy |
| engineConfig with no provider | searchMemory() returns empty result |
| embedSession() throws Error | Handler catches, raw JSON persists, handler completes |

### Installer Lifecycle
| Input | Expected Behavior |
|-------|-------------------|
| user-memory dir already exists | Idempotent, no error |
| docs/.embeddings/ dir already exists | Idempotent, no error |
| Read-only filesystem for model dir | downloadModel() returns `{ ready: false }`, install continues |
| .isdlc/models/ partially created (dir exists but empty) | Download proceeds normally |

---

## Maximum-Size Inputs

### Tokenizer Stress
| Input | Size | Purpose |
|-------|------|---------|
| 10,000-word text block | ~50KB string | Verify truncation works correctly at 512 tokens |
| Repetitive text `"word ".repeat(5000)` | 5000 identical words | Verify BPE handles repetition (subword caching) |
| Code block with deep nesting | ~2KB of nested `{ { { } } }` | Verify special chars in code tokenized correctly |
| Long single word `"a".repeat(10000)` | 10KB single token | BPE breaks into subwords, truncation applies |

### Model Download
| Scenario | Size | Purpose |
|----------|------|---------|
| Simulated large model response | Mocked 500MB stream | Verify progress callback increments, memory not exhausted |
| Partial download (connection drop) | Mocked incomplete stream | Verify `{ ready: false }` returned, partial file cleaned up |

---

## Test Fixtures

### Tokenizer Fixtures
```javascript
// Minimal vocab.json fixture for tests (subset of CodeBERT vocab)
{
  "<s>": 0, "<pad>": 1, "</s>": 2, "<unk>": 3, "<mask>": 4,
  "function": 5, "class": 6, "import": 7, "const": 8, "return": 9,
  "Gfunction": 10, "Gclass": 11  // subword variants
}
```

### Session Record Fixtures
```javascript
// Legacy flat record (what currently exists)
const legacyRecord = {
  topics_covered: ['auth', 'testing'],
  depth_preferences_observed: { detail: 'high' },
  overrides: {},
  session_timestamp: '2026-03-21T10:00:00Z'
};

// Enriched record (what should be written after fix)
const enrichedRecord = {
  summary: 'Analyzed authentication module security requirements',
  context_notes: ['API key rotation needed', 'OAuth2 flow selected'],
  playbook_entry: 'auth-security-review',
  importance: 0.85,
  topics_covered: ['auth', 'security'],
  depth_preferences_observed: { detail: 'high' },
  overrides: {},
  session_timestamp: '2026-03-21T10:00:00Z'
};
```

### Installer Directory Layout Fixtures
```
temp-project/
  .isdlc/
    state.json
    models/                    # Created by installer
      codebert-base/
        model.onnx             # Downloaded by installer
        vocab.json             # Downloaded by installer
        tokenizer.json         # Downloaded by installer
  docs/
    .embeddings/               # Created by installer
  ~/.isdlc/                    # Simulated home dir
    user-memory/               # Created by installer
      memory.db                # Created lazily by writeSessionRecord
```

---

## Data Generation Strategy

All test data is generated inline in test files or via shared fixture helpers. No external data files are committed to the repo. The approach:

1. **Tokenizer tests**: Inline string literals with known expected outputs from CodeBERT BPE
2. **Model download tests**: Mocked HTTP responses using `node:test` mock.method on fetch/http
3. **Session records**: Inline JS objects matching the EnrichedSessionRecord schema
4. **Filesystem layouts**: Created via `createTempDir()` + `mkdirSync` + `writeFileSync` per test
5. **Vocab file**: Minimal JSON fixture created in temp dir before tokenizer init tests
