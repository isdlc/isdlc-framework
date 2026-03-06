# Test Strategy: REQ-0045 Semantic Search Backend — Group 2

**Scope**: M5 Package Builder/Reader (FR-006) + M6 Module Registry (FR-013)
**Date**: 2026-03-06
**Phase**: 05 - Test Strategy

---

## Existing Infrastructure

- **Framework**: Node.js built-in `node --test` runner (`describe`, `it`, `before`, `after` from `node:test`)
- **Assertions**: `node:assert/strict`
- **Helpers**: `lib/utils/test-helpers.js` — `createTempDir()`, `cleanupTempDir()`
- **Pattern**: Co-located tests (`.test.js` alongside source), ESM imports
- **Current Test Count**: 979 tests (including Group 1's 94 embedding tests)

---

## Strategy

**Approach**: Extend existing test suite. Each new module gets co-located `.test.js` files.

**Native dependency handling**: M5 uses FAISS (`faiss-node`) and SQLite (`better-sqlite3`) which are optional native bindings. Tests use in-process mocks — production code checks availability at runtime and falls back gracefully (Article X: Fail-Safe Defaults).

**Coverage Target**: >=80% per Article II. 100% AC coverage via traceability.

---

## Test Pyramid

| Level | Count | Scope |
|-------|-------|-------|
| Unit | ~28 | Individual functions: manifest validation, encryption, registry CRUD, compatibility |
| Integration | ~6 | Build → read roundtrip, registry load → query → save |
| Edge/Boundary | ~4 | Empty inputs, corrupt files, missing fields |

**Total estimated**: ~38 new tests

---

## M5: Package Builder/Reader (`lib/embedding/package/`)

**Files under test**: `builder.js`, `reader.js`, `manifest.js`, `encryption.js`

### manifest.js

| Test | AC | Priority |
|------|-----|----------|
| `createManifest()` includes all required fields (moduleId, version, model, dimensions, chunkCount, tier, createdAt, checksums) | AC-006-02 | P0 |
| `validateManifest()` rejects manifest missing required fields | AC-006-02 | P0 |
| `validateManifest()` accepts a well-formed manifest | AC-006-02 | P0 |
| `computeChecksums()` returns deterministic SHA-256 hashes | AC-006-02 | P1 |

### encryption.js

| Test | AC | Priority |
|------|-----|----------|
| `encrypt()` + `decrypt()` roundtrip preserves data | AC-006-03 | P0 |
| `decrypt()` with wrong key throws clear error | AC-006-03 | P1 |
| `encrypt()` produces different ciphertext for same plaintext (random IV) | AC-006-03 | P1 |

### builder.js

| Test | AC | Priority |
|------|-----|----------|
| `buildPackage()` creates a `.emb` tar file at outputDir | AC-006-03 | P0 |
| Built package contains `index.faiss`, `metadata.sqlite`, `manifest.json` | AC-006-01 | P0 |
| Built package manifest matches input metadata | AC-006-02 | P0 |
| `buildPackage()` with encryption option produces encrypted package | AC-006-03 | P1 |
| `buildPackage()` with empty chunks array produces valid (empty) package | AC-006-01 | P2 |

### reader.js

| Test | AC | Priority |
|------|-----|----------|
| `readPackage()` loads a package built by `buildPackage()` | AC-006-04 | P0 |
| Loaded package exposes manifest, index handle, and db handle | AC-006-04 | P0 |
| `readPackage()` on non-existent file throws with clear message | AC-006-04 | P1 |
| `readPackage()` on corrupt/non-tar file throws with clear message | AC-006-04 | P1 |
| `readPackage()` with decryption key decrypts encrypted package | AC-006-03 | P1 |
| Manifest alone determines compatibility (self-describing) | AC-006-04 | P0 |

### Integration

| Test | AC | Priority |
|------|-----|----------|
| Build → read roundtrip: chunks + vectors → .emb → loaded data matches | AC-006-01, AC-006-04 | P0 |
| Build with encryption → read with key → data matches | AC-006-03 | P1 |

**M5 Subtotal**: ~19 tests

---

## M6: Module Registry (`lib/embedding/registry/`)

**Files under test**: `index.js`, `compatibility.js`

### index.js (Registry CRUD)

| Test | AC | Priority |
|------|-----|----------|
| `loadRegistry()` from existing file returns populated registry | AC-013-01 | P0 |
| `loadRegistry()` from non-existent path creates empty registry | AC-013-01 | P0 |
| `getModule()` returns entry by ID | AC-013-01 | P0 |
| `getModule()` returns null for unknown ID | AC-013-01 | P0 |
| `listModules()` returns all registered entries | AC-013-01 | P0 |
| `registerModule()` adds a new entry | AC-013-01 | P0 |
| `registerModule()` updates existing entry by ID | AC-013-01 | P1 |
| `save()` persists registry to disk | AC-013-04 | P0 |
| Load → register → save → reload roundtrip preserves data | AC-013-04 | P0 |

### Hierarchical Domains

| Test | AC | Priority |
|------|-----|----------|
| Registry stores hierarchical domain notation (e.g., `commerce.order-management`) | AC-013-03 | P0 |
| `getRoutingHints()` matches by domain prefix | AC-013-02, AC-013-03 | P0 |
| `getRoutingHints()` matches by keywords | AC-013-02 | P0 |
| `getRoutingHints()` returns empty array for no match | AC-013-02 | P1 |

### compatibility.js

| Test | AC | Priority |
|------|-----|----------|
| `getCompatibleVersions()` returns compatible versions based on semver range | AC-013-04 | P0 |
| `getCompatibleVersions()` returns empty for non-existent module | AC-013-04 | P1 |
| `isCompatible()` handles major version mismatches correctly | AC-013-04 | P1 |
| Version metadata round-trips through registry save/load | AC-013-04 | P2 |

### Edge Cases

| Test | AC | Priority |
|------|-----|----------|
| `loadRegistry()` with malformed JSON throws clear error | AC-013-01 | P2 |
| `registerModule()` with missing required fields throws | AC-013-01 | P2 |

**M6 Subtotal**: ~19 tests

---

## Test File Layout

```
lib/
└── embedding/
    ├── package/
    │   ├── builder.js
    │   ├── reader.js
    │   ├── manifest.js
    │   ├── encryption.js
    │   └── index.test.js      ← M5 tests
    └── registry/
        ├── index.js
        ├── compatibility.js
        └── index.test.js      ← M6 tests
```

---

## Test Data Strategy

### Mock Data
- **Mock FAISS index**: Buffer of known size representing a serialized FAISS index
- **Mock SQLite DB**: In-memory SQLite or mock object with chunk metadata rows
- **Sample chunks**: 5-10 `Chunk` objects with realistic structure from M1
- **Sample embeddings**: `Float32Array` vectors with known dimensions (768)

### Fixtures
- `tests/fixtures/embedding/sample-registry.json` — Pre-populated registry with 3 modules

### Boundary Values
- Empty chunks array to `buildPackage()`
- Single chunk with single vector
- Registry with 0 modules
- Module with empty dependencies array

---

## Traceability

| FR | AC Count | Test Count | Coverage |
|----|----------|-----------|----------|
| FR-006 | 4 | 19 (M5) | 100% AC covered |
| FR-013 | 4 | 19 (M6) | 100% AC covered |
| **Total** | **8** | **~38** | **100%** |
