# Quick Scan: REQ-GH-238

## 1. Scope

**Classification**: Medium-Large
**Rationale**: 3 new modules (worker-pool, embedding-worker, device-detector), significant refactor of jina-code-adapter to support parallelism, config schema extension, CLI updates. Core embedding interface unchanged — downstream consumers unaffected.

## 2. Keywords

| Keyword | Hits | Key Files |
|---------|------|-----------|
| `worker_threads` | 0 | (greenfield — no existing usage in embedding pipeline) |
| `jina-code-adapter` | 30+ | `engine/jina-code-adapter.js`, `engine/index.js`, tests |
| `parallelism` | 0 | (new config field) |
| `device` | 0 | (new config field — Transformers.js pipeline accepts it) |
| `embed(` | 20+ | `engine/index.js`, `jina-code-adapter.js`, `discover-integration.js` |

## 3. File Count

| Type | Count |
|------|-------|
| New | 4 (worker-pool.js, embedding-worker.js, device-detector.js, + tests) |
| Modify | 4 (jina-code-adapter.js, engine/index.js, bin/isdlc-embedding.js, config.json) |
| Delete | 0 |
| Config | 1 (.isdlc/config.json schema extension) |
| Docs | 2 (PROJECT-KNOWLEDGE.md, ARCHITECTURE.md) |
| **Total** | **~11** |

## 4. Final Scope

**Medium-Large** — 3 new modules, adapter refactor, config/CLI updates. Risk is moderate: worker_threads is well-understood but the hardware detection + EP fallback paths need thorough testing across platforms.
