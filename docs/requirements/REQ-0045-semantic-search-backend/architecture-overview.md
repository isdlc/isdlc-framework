# Architecture Overview: REQ-0045 Semantic Search Backend

**Status**: Complete
**Date**: 2026-03-06
**Architect**: Alex Rivera (Solutions Architect persona)

---

## 1. Architecture Options

### Two-Layer vs Monolithic

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|---|---|---|---|---|---|
| **A: Two-Layer (Core + Enterprise)** | Core layer (generation + serving) as framework extension; Enterprise layer (distribution + security + aggregation) as add-on | Modular; Core works standalone; Enterprise features optional; clear responsibility split | Two packages to maintain; integration surface between layers | Matches iSDLC's modular extension pattern | **Selected** |
| B: Monolithic | Single package with all features | Simpler packaging; single install | Forces distribution features on developers who don't need them; harder to test; violates single-responsibility | Contradicts iSDLC's modular approach | Eliminated |

### Standalone Product vs Framework Extension

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|---|---|---|---|---|---|
| **A: iSDLC Framework Extension** | Embedding system integrates into iSDLC's search layer, CLI, and config | Reuses existing infrastructure; consistent UX; plugs into search router | Tied to iSDLC lifecycle; harder for non-iSDLC projects | Directly aligns with iSDLC architecture | **Selected** |
| B: Standalone Tool | Separate CLI and server with own config | Independent release cycle; usable outside iSDLC | Duplicates CLI, config, search infrastructure; inconsistent UX | Breaks iSDLC's integrated approach | Eliminated |

---

## 2. Selected Architecture

### System Architecture Diagram

```
BUILD SIDE (Generation)                    CONSUME SIDE (Serving)
========================                   ========================

Source Code (Git/SVN)                      Claude Code / Agent
       |                                          |
  [VCS Adapter]                            [iSDLC Search Router]
       |                                          |
  [Tree-sitter Chunker]                    [Semantic Backend (M10)]
       |                                          |
  [Content Redaction]                      [MCP Server (Docker)]
       |                                          |
  [Embedding Engine]                       [Query Orchestrator]
       |                                        / | \
  [Package Builder]                    [Store] [Store] [Store]
       |                               mod-A   mod-B   mod-C
  [Encryption]                                 |
       |                               [Module Registry]
  [Distribution]
   /  |  \  \
Artif Nexus S3 SFTP

       CI/CD Pipeline
  [Aggregation] → Release Bundle
```

### ADR-001: Vector Storage — FAISS + SQLite

- **Status**: Accepted
- **Context**: Need a vector storage solution for similarity search across code embeddings. Must work locally without a server process. Must handle module-partitioned indexes.
- **Decision**: Use FAISS (Facebook AI Similarity Search) for vector indexes with SQLite as a companion metadata store.
- **Rationale**: FAISS is the industry standard for local vector similarity search. No server process needed — indexes are memory-mapped files. SQLite provides structured metadata queries (file paths, line numbers, chunk types) without a database server. Both are single-file, portable, and cross-platform.
- **Alternatives considered**: Qdrant (requires server process), Milvus (too heavy for local use), ChromaDB (Python-only server), simple numpy arrays (no optimized search)
- **Consequences**: Dependency on `faiss-node` npm package (native binary); SQLite via `better-sqlite3` (already a common Node.js dependency). Module-partitioned: each module has its own FAISS index and SQLite file.

### ADR-002: Embedding Model — CodeBERT Default

- **Status**: Accepted
- **Context**: Need an embedding model that understands code semantics. Must work locally without cloud dependencies. Cloud options available for higher quality.
- **Decision**: CodeBERT as the default local model (768 dimensions, 512 token context). Voyage-code-3 and OpenAI as optional cloud alternatives.
- **Rationale**: CodeBERT is pre-trained on code across 6 languages, runs locally via ONNX runtime, produces high-quality code embeddings. 512-token context covers most functions/methods. Cloud models offer higher quality but require API keys and internet.
- **Alternatives considered**: StarCoder embeddings (larger model, slower), all-MiniLM-L6 (general-purpose, not code-optimized), code2vec (older, less capable)
- **Consequences**: ONNX runtime dependency for local inference. Model download (~500MB) on first use. Cloud models configurable via API keys in settings.

### ADR-003: Language-Agnostic Chunking — Tree-sitter

- **Status**: Accepted
- **Context**: Must parse source code into semantic chunks (functions, classes, methods) across multiple languages. The product codebase is primarily Java but also includes TypeScript, XML, Python, and others.
- **Decision**: Use Tree-sitter with pluggable language grammars for AST-aware chunking.
- **Rationale**: Tree-sitter provides incremental parsing with consistent AST structure across 100+ languages. Single parsing approach works for Java, TypeScript, XML, Python without language-specific parsers. Grammars are installable as npm packages.
- **Alternatives considered**: Regex-based splitting (brittle, misses nested constructs), language-specific parsers (Java Parser, TypeScript Compiler API — requires one per language), line-based splitting (loses semantic boundaries)
- **Consequences**: Dependency on `tree-sitter` and per-language grammar packages. Fallback to line-based chunking for languages without a grammar.

### ADR-004: Package Format — `.emb`

- **Status**: Accepted
- **Context**: Need a portable, self-describing package format for distributing embedding artifacts.
- **Decision**: `.emb` format — a tar archive containing `index.faiss`, `metadata.sqlite`, and `manifest.json`.
- **Rationale**: Single-file distribution is simplest for transport. Tar is universally supported. Manifest makes packages self-describing — consumer can determine compatibility without extracting the full index. Checksums in manifest enable integrity validation.
- **Alternatives considered**: Directory-based (not portable), ZIP (less standard for binary data), custom binary format (harder to debug)
- **Consequences**: Tar dependency (built into Node.js via `tar` package). Packages are large (100s of MB for big modules) but compressible.

### ADR-005: MCP Server Architecture — Docker + SSE

- **Status**: Accepted
- **Context**: MCP server must run persistently, load packages at startup, and serve queries without cold-start penalty. Must work across customer environments.
- **Decision**: Docker container with SSE (Server-Sent Events) transport for persistent operation.
- **Rationale**: Docker provides consistent environment across macOS, Linux, Windows. SSE transport keeps the connection warm — no per-query startup cost. Container can be configured with volume mounts for `.emb` packages. Health endpoint enables monitoring.
- **Alternatives considered**: stdio transport (requires spawning process per query — cold start), native process (no environment isolation), WebSocket (more complex, no benefit over SSE for this use case)
- **Consequences**: Docker required on client machines. Docker Compose file for easy setup. Fallback to direct FAISS loading when Docker is unavailable.

### ADR-006: Encryption — AES-256-GCM Per-Module

- **Status**: Accepted
- **Context**: Embedding packages shipped to customers contain derived representations of source code. Must protect IP while enabling licensed access.
- **Decision**: AES-256-GCM encryption with per-module keys. Key ID stored in manifest; keys distributed separately.
- **Rationale**: AES-256-GCM is authenticated encryption — provides both confidentiality and integrity. Per-module keys enable license-based access control (customer only gets keys for licensed modules). Key rotation re-encrypts packages without re-generating embeddings.
- **Alternatives considered**: RSA encryption (too slow for large packages), no encryption (IP exposure risk), single key for all modules (all-or-nothing access)
- **Consequences**: Key management responsibility shifts to the enterprise layer. Keys must be distributed via a separate secure channel (not in the package).

### ADR-007: CI/CD Agnostic Pipeline

- **Status**: Accepted
- **Context**: Different projects use different CI/CD stacks. The framework must support Jenkins (SVN projects) and GitHub Actions (Git projects) without being tied to either.
- **Decision**: Generation CLI (`isdlc embedding generate --ci`) with a `--ci` flag for pipeline context. Jenkins Groovy pipeline template and GitHub Actions workflow template provided. Maven plugin for Java build integration.
- **Rationale**: The CLI is the common interface; CI/CD templates wrap it. `--ci` flag enables pipeline-specific behavior (parallel matrix config, artifact publishing). Maven plugin integrates with existing Java build lifecycle.
- **Alternatives considered**: Jenkins-only (excludes Git/GH Actions projects), GH Actions-only (excludes SVN/Jenkins projects), custom CI server (reinventing the wheel)
- **Consequences**: VCS adapter auto-detects Git vs SVN in the working copy. Jenkins template uses matrix builds for module parallelism. Maven plugin wraps the CLI as a build phase.

---

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|---|---|---|---|
| FAISS (faiss-node) | latest | Industry-standard vector similarity search, no server needed | Qdrant, Milvus, ChromaDB |
| SQLite (better-sqlite3) | latest | Embedded metadata store, zero config, cross-platform | LevelDB, JSON files |
| Tree-sitter | latest | Language-agnostic AST parsing, 100+ grammars | Regex splitting, language-specific parsers |
| CodeBERT (ONNX) | base | Pre-trained code embeddings, runs locally | StarCoder, all-MiniLM-L6 |
| Docker | latest | MCP server isolation and portability | Native process, systemd service |
| AES-256-GCM | — | Authenticated encryption for package security | RSA, ChaCha20 |
| tar (Node.js) | built-in | Package format (.emb archives) | ZIP, custom binary |

---

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|---|---|---|---|---|---|
| INT-001 | iSDLC Search Router | Semantic Backend (M10) | `search(request) → SearchHit[]` | SearchRequest/SearchHit objects | Fall back to grep-glob on failure |
| INT-002 | Semantic Backend (M10) | MCP Server (M7) | SSE/MCP protocol | JSON-RPC over SSE | Fall back to direct FAISS loading |
| INT-003 | MCP Server (M7) | FAISS Index | `faiss-node` API | Float32 vectors | Reject corrupt index, reload from package |
| INT-004 | MCP Server (M7) | SQLite Metadata | `better-sqlite3` API | SQL queries | Reject corrupt DB, reload from package |
| INT-005 | CLI (bin/isdlc-embedding.js) | Generation Pipeline | Function calls | Chunk[], EmbeddingResult[] | Report per-file errors, continue |
| INT-006 | Generation Pipeline | VCS Adapter | `getChangedFiles()` | FileChange[] | Fall back to full generation |
| INT-007 | Package Builder | Distribution Transport | `publish(package)` | Binary stream (.emb file) | Retry with backoff; try alternate transport |
| INT-008 | Distribution | Artifactory/Nexus/S3/SFTP | Transport-specific API | HTTP/SFTP | Configurable retry policy |
| INT-009 | Aggregation Pipeline | Package Builder | `readManifest()` | Manifest JSON | Block release if incompatible |

### Data Flow

```
Generation Flow:
  Source files → VCS Adapter (change detection)
    → Tree-sitter Chunker (AST parsing → Chunk[])
    → Content Redaction (tier filtering → Chunk[])
    → Embedding Engine (model inference → EmbeddingResult[])
    → Package Builder (FAISS index + SQLite + manifest → .emb)
    → Encryption (AES-256-GCM → encrypted .emb)
    → Distribution Transport (publish to repository)

Query Flow:
  User query → iSDLC Search Router (modality: semantic)
    → Semantic Backend (SSE client)
    → MCP Server (receives query)
    → Query Orchestrator (classify intent)
    → Module Registry (resolve relevant modules)
    → Fan-out to module FAISS stores (parallel search)
    → Merge + re-rank results
    → Return SearchHit[] to router
    → Ranker (token budget, dedup)
    → Agent receives results
```

### Synchronization Model

- **Generation**: Single-writer per module (one CI runner or one developer). No concurrent generation on same module.
- **Serving**: Read-only FAISS indexes, multiple concurrent queries. Hot-reload swaps entire index atomically (load new, swap pointer, release old).
- **Distribution**: Optimistic concurrency — latest version wins. Checksums prevent partial uploads.

---

## 5. Summary

### Key Architectural Decisions

| # | Decision | Trade-off |
|---|---|---|
| 1 | Two-layer architecture (Core + Enterprise) | More packages to maintain, but clean separation of concerns |
| 2 | FAISS + SQLite (no server DB) | Less query flexibility than Qdrant, but zero infrastructure |
| 3 | Tree-sitter for all languages | Grammar dependency per language, but single parsing approach |
| 4 | Docker MCP server | Requires Docker installed, but consistent cross-platform behavior |
| 5 | Per-module encryption keys | Key management complexity, but granular access control |
| 6 | VCS abstraction (Git + SVN) | Two adapters to maintain, but framework works across stacks |
| 7 | CI/CD agnostic CLI | Templates per CI system, but not locked to one pipeline |

### Open Questions (Resolved)

All architectural questions have been resolved through the roundtable discussion. No open questions remain.
