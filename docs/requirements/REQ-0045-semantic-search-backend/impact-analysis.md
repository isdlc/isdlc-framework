# Impact Analysis: REQ-0045 Semantic Search Backend

**Status**: Complete
**Date**: 2026-03-06
**Analyst**: Alex Rivera (Solutions Architect persona)

---

## 1. Blast Radius

### Tier 1: Direct Modifications

| File | Module | Change Type | Requirement Traces |
|---|---|---|---|
| `lib/search/backends/semantic.js` | search | CREATE | FR-012 |
| `lib/search/registry.js` | search | MODIFY | FR-012 (add semantic mapping to inferModality/inferPriority) |
| `lib/search/config.js` | search | MODIFY | FR-012 (semantic backend config defaults) |
| `lib/embedding/chunker/index.js` | embedding | CREATE | FR-001 |
| `lib/embedding/chunker/treesitter-adapter.js` | embedding | CREATE | FR-001 |
| `lib/embedding/engine/index.js` | embedding | CREATE | FR-001, FR-005 |
| `lib/embedding/engine/codebert-adapter.js` | embedding | CREATE | FR-005 |
| `lib/embedding/engine/voyage-adapter.js` | embedding | CREATE | FR-005 |
| `lib/embedding/engine/openai-adapter.js` | embedding | CREATE | FR-005 |
| `lib/embedding/vcs/index.js` | embedding | CREATE | FR-001, FR-014 |
| `lib/embedding/vcs/git-adapter.js` | embedding | CREATE | FR-014 |
| `lib/embedding/vcs/svn-adapter.js` | embedding | CREATE | FR-014 |
| `lib/embedding/redaction/index.js` | embedding | CREATE | FR-011 |
| `lib/embedding/redaction/interface-tier.js` | embedding | CREATE | FR-011 |
| `lib/embedding/redaction/guided-tier.js` | embedding | CREATE | FR-011 |
| `lib/embedding/package/builder.js` | embedding | CREATE | FR-006 |
| `lib/embedding/package/reader.js` | embedding | CREATE | FR-006 |
| `lib/embedding/package/encryption.js` | embedding | CREATE | FR-008 |
| `lib/embedding/registry/index.js` | embedding | CREATE | FR-013 |
| `lib/embedding/registry/compatibility.js` | embedding | CREATE | FR-009 |
| `lib/embedding/mcp-server/server.js` | embedding | CREATE | FR-003 |
| `lib/embedding/mcp-server/orchestrator.js` | embedding | CREATE | FR-004 |
| `lib/embedding/mcp-server/store-manager.js` | embedding | CREATE | FR-003 |
| `lib/embedding/mcp-server/Dockerfile` | embedding | CREATE | FR-003 |
| `lib/embedding/distribution/index.js` | embedding | CREATE | FR-007 |
| `lib/embedding/distribution/artifactory.js` | embedding | CREATE | FR-007 |
| `lib/embedding/distribution/nexus.js` | embedding | CREATE | FR-007 |
| `lib/embedding/distribution/s3.js` | embedding | CREATE | FR-007 |
| `lib/embedding/distribution/sftp.js` | embedding | CREATE | FR-007 |
| `lib/embedding/aggregation/index.js` | embedding | CREATE | FR-010 |
| `bin/isdlc-embedding.js` | cli | CREATE | FR-014 |
| `lib/installer/semantic-search-setup.js` | installer | CREATE | FR-015 |
| `lib/installer/model-downloader.js` | installer | CREATE | FR-015 |
| `lib/embedding/discover-integration.js` | embedding | CREATE | FR-016 |

### Tier 2: Transitive Impact

| File | Module | Impact | Change Type |
|---|---|---|---|
| `lib/search/router.js` | search | Semantic backend now routable; no code change needed (dynamic registry) | NONE |
| `bin/isdlc.js` | cli | Needs `embedding` subcommand registration | MODIFY |
| `package.json` | root | New dependencies: tree-sitter, faiss-node, better-sqlite3, node-fetch | MODIFY |
| `src/claude/settings.json` | config | MCP server configuration entry | MODIFY |
| `lib/installer.js` | installer | Needs to call semantic-search-setup during init/update | MODIFY |
| `lib/updater.js` | installer | Needs to call semantic-search-setup during update | MODIFY |
| `src/claude/agents/discover/architecture-analyzer.md` | discover | May need to coordinate with embedding generation timing | MODIFY |

### Tier 3: Side Effects

| Area | Potential Impact | Risk |
|---|---|---|
| Test suite | New test files needed for all 10 modules; existing search tests unaffected | Low |
| CI/CD pipeline | Docker build step for MCP server; embedding generation step | Medium |
| Documentation | README updates for embedding commands; new architecture docs | Low |
| Disk usage | FAISS indexes can be large (100s of MB per module) | Medium |
| Memory usage | MCP server loads indexes into memory | Medium |

---

## 2. Entry Points

### Recommended Implementation Order

1. **Start with FR-001 + FR-014**: Chunker + Engine + VCS adapter + CLI — developer can generate local embeddings
2. **Then FR-006 + FR-003**: Package format + MCP server — embeddings are loadable and queryable
3. **Then FR-004 + FR-013**: Orchestrator + Registry — multi-module query routing works
4. **Then FR-011 + FR-008**: Redaction + Encryption — security tiers enable customer distribution
5. **Then FR-007 + FR-010**: Distribution + Aggregation — CI/CD pipeline and release assembly
6. **Then FR-012**: iSDLC search integration — plugs into existing search layer
7. **Finally FR-005 + FR-009**: Model abstraction + Version compatibility — polish and enterprise features

### Rationale

Start with the developer-facing workflow (generate locally, query locally) to get immediate value. Then add the serving layer, then security, then distribution. iSDLC integration comes after the core system works independently, since it's a thin adapter.

---

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel? | Depends On |
|---|---|---|---|---|---|
| 0 | FR-015 | Toolchain installation (Tree-sitter, CodeBERT, FAISS, Docker) | Medium | No | — |
| 1 | FR-001, FR-014 | Core generation pipeline + local CLI | Medium | No | 0 |
| 2 | FR-006 | Package format (.emb builder/reader) | Low | Yes (with 3) | 1 |
| 3 | FR-003 | MCP server (Docker, SSE, package loading) | High | Yes (with 2) | 1 |
| 4 | FR-004, FR-013 | Query orchestrator + Module registry | Medium | No | 2, 3 |
| 5 | FR-016 | Discovery-triggered embedding generation | Medium | No | 1, 3 |
| 6 | FR-011 | Content redaction pipeline (3 tiers) | High | Yes (with 7) | 1 |
| 7 | FR-008 | Package encryption (AES-256-GCM) | Medium | Yes (with 6) | 2 |
| 8 | FR-007 | Distribution adapters (Artifactory, Nexus, S3, SFTP) | Medium | No | 2, 7 |
| 9 | FR-010 | Aggregation pipeline (release assembly) | Low | No | 8, 4 |
| 10 | FR-012 | iSDLC search backend integration | Low | No | 3, 4 |
| 11 | FR-005 | Embedding model abstraction (cloud providers) | Low | Yes (with 10) | 1 |
| 12 | FR-009 | Version compatibility management | Medium | No | 4, 8 |
| 13 | FR-002 | Knowledge base embedding pipeline | Low | Yes | 1 |

---

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|---|---|---|---|---|---|
| RZ-001 | Source reconstruction from embeddings | FR-011 Redaction | Medium | Critical | Multiple redaction strategies; security audit; cosine similarity thresholds to detect reconstruction attempts |
| RZ-002 | FAISS performance at scale (16M LOC) | FR-001 Generation, FR-003 Server | High | High | Module-partitioned indexes; FAISS IVF quantization for large indexes; memory-mapped loading |
| RZ-003 | Tree-sitter grammar coverage gaps | FR-001 Chunker | Medium | Medium | Line-based fallback chunking; community grammar repos; grammar installation CLI |
| RZ-004 | Docker compatibility across customer environments | FR-003 MCP Server | Medium | Medium | Multi-arch builds; Docker Compose for easy setup; non-Docker fallback mode |
| RZ-005 | SVN adapter complexity (no native Node.js SVN library) | FR-014 VCS | Medium | Medium | Shell out to `svn` CLI; require SVN client installed; test against SVN 1.14+ |
| RZ-006 | Encryption key management across modules | FR-008 Security | Medium | High | Key ID scheme; separate key distribution channel; key rotation without re-embedding |
| RZ-007 | Cross-module version matrix complexity | FR-009 Compatibility | High | Medium | Declarative compatibility rules; automated validation; clear error messages |
| RZ-008 | Native dependency installation failures (FAISS, ONNX) | FR-015 Installation | Medium | High | Platform-specific prebuilt binaries; graceful fallback (skip component, warn); cloud model fallback if ONNX fails |
| RZ-009 | Discovery timing chicken-and-egg (module boundaries unknown before discovery) | FR-016 Discovery | Medium | Medium | "Before" mode uses flat generation; "after" mode re-partitions into modules; upgrade path avoids full re-generation |

### Test Coverage Assessment

- **Existing search tests**: Cover router, registry, config, ranker — unaffected by this work
- **New test areas**: All 10 new modules need unit tests; integration tests for generation pipeline, MCP server, distribution
- **High-risk test areas**: Redaction (must prove no source leakage), encryption (must validate round-trip), VCS adapters (both Git and SVN)

---

## 5. Summary

### Metrics

| Metric | Count |
|---|---|
| Direct modifications (Tier 1) | 34 files |
| New files | 32 |
| Modified existing files | 2 (registry.js, config.js) + 5 transitive |
| Transitive impact (Tier 2) | 7 files |
| Side effect areas (Tier 3) | 5 areas |
| Total affected | 41 files |
| New modules | 10 (under lib/embedding/) + 2 installer files |
| Risk zones | 9 |

### Decision Log

| Decision | Rationale |
|---|---|
| New `lib/embedding/` module tree | Embedding system is large enough to warrant its own top-level module, not nested under `lib/search/` |
| Developer-first implementation order | Immediate value from local generation; distribution is second priority |
| MCP server in Docker | Persistent process avoids cold-start; SSE transport for warm connection |
| Module-partitioned FAISS indexes | Each module is independently manageable; avoids single massive index |

### Go/No-Go

**Recommendation**: GO — with phased delivery

The system is large (31 new files, 10 modules) but modular. Each implementation step delivers independently usable value. The primary risk (source reconstruction from embeddings) is mitigated by the 3-tier redaction pipeline. Start with developer-facing local generation (steps 1-3) to validate the approach before investing in enterprise distribution (steps 5-8).
