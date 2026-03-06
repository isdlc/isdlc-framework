# Requirements Specification: REQ-0045 Semantic Search Backend

**Source**: FR-012 from REQ-0041 (deferred Phase 2 item), expanded through roundtable analysis
**Status**: Analyzed
**Version**: 1.0.0
**Date**: 2026-03-06

---

## 1. Business Context

### Problem Statement

A large enterprise software product (16M+ LOC, 15+ years, multiple modules) is shipped to customers who write extensions. Customers currently rely on incomplete documentation and human consultants to understand product classes, patterns, and integration points. This manual process is slow, expensive, and doesn't scale. Developers working on the product itself face similar challenges navigating the massive codebase across team boundaries.

An embedding-based semantic search system would give both developers (with source access) and customers (JAR-only) the ability to query the codebase by meaning — "where do we handle inventory reservations?" — and get accurate, contextual results that power LLM-assisted development.

### Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| Internal developers | Primary user (build side) | Fresh embeddings of their module for LLM-assisted coding |
| Customers/Partners | Primary user (consume side) | Pre-built embeddings shipped with product for extension development |
| Consultants | Secondary user | Augment their expertise with semantic search during customer engagements |
| Release Engineering | Operator | Integrate embedding generation into CI/CD pipeline (Jenkins, GitHub Actions) |
| Security/Legal | Gatekeeper | Ensure source code IP is protected in shipped embeddings |
| Product Management | Sponsor | Reduce customer onboarding time and consultant dependency |

### Success Metrics

- Customer can query shipped embeddings and get relevant code context within 2 seconds
- Developer can generate local embeddings for a single module in under 5 minutes
- CI/CD pipeline generates all module embeddings within existing build time budgets
- Zero source code reconstruction possible from Interface-tier or Guided-tier embeddings
- 80%+ query relevance (top-5 results contain the answer) for common development questions

### Driving Factors

- Customers pay for consultant time that could be replaced by AI-assisted development
- Documentation is 15 years out of date; code is the source of truth
- Multiple teams work on different modules — no single person knows the whole system
- Competitive pressure: other enterprise platforms are shipping AI development tools

---

## 2. Stakeholders and Personas

### Developer (Internal)

- **Role**: Software engineer working on one or more product modules
- **Goals**: Navigate unfamiliar modules, find patterns, understand integration points
- **Pain points**: Module boundaries are unclear, documentation is stale, asking other teams is slow
- **Proficiency**: High technical skill, has full source access
- **Tasks**: Write new features, fix bugs, integrate modules, review code

### Customer Developer (External)

- **Role**: Developer at a customer/partner organization extending the product
- **Goals**: Write extensions that follow product patterns, find the right classes to extend
- **Pain points**: Only has JAR files (no source), documentation gaps, consultant availability
- **Proficiency**: Variable technical skill, no source access
- **Tasks**: Write XML configurations, implement extension points, follow design patterns

### Release Engineer

- **Role**: Manages CI/CD pipelines and artifact distribution
- **Goals**: Automate embedding generation, publish alongside product releases
- **Pain points**: Build time budgets, multi-module coordination, artifact storage
- **Proficiency**: High ops skill, manages Jenkins/GitHub Actions/Artifactory
- **Tasks**: Configure pipelines, manage distribution, monitor build health

---

## 3. User Journeys

### Developer Local Generation

1. Developer checks out their module from SVN or Git
2. Runs `isdlc embedding generate` from their working copy
3. CLI detects VCS type, identifies changed files since last generation
4. Chunker processes source files, embedding engine generates vectors
5. Package builder creates `.emb` file, auto-loads into local MCP server
6. Developer queries via Claude — "where do we validate order totals?" — gets ranked results from their module's embeddings

### Customer Consuming Shipped Embeddings

1. Customer receives product release with embedding packages on Artifactory
2. Runs update checker or manually downloads `.emb` packages for their licensed modules
3. MCP server (Docker container) loads packages on startup
4. Customer queries via Claude — "how do I extend the payment processor?" — orchestrator fans out to relevant module stores, merges results
5. Results show Interface-tier content: class signatures, method contracts, extension points (no source code)

### CI/CD Full Build

1. Jenkins pipeline triggers on release branch
2. Matrix build: each module generates embeddings in parallel (one CI runner per module)
3. Content redaction produces Interface, Guided, and Full tier variants
4. Package builder encrypts each tier with per-module AES-256-GCM keys
5. Aggregation pipeline collects all module packages, validates cross-module compatibility
6. Release bundle published to Artifactory with version manifest

---

## 4. Technical Context

### Existing Infrastructure

- **Search abstraction layer** (REQ-0041): Router, registry, config, ranker already built
- **Semantic modality slot**: `VALID_MODALITIES` in registry.js and router.js already includes `'semantic'`
- **Backend registration**: `inferModality()` in registry.js needs a semantic mapping added
- **Search config**: `search-config.json` supports `backendConfigs` for per-backend settings
- **4 existing backends**: grep-glob (lexical), ast-grep (structural), probe (lexical), zoekt/code-index (indexed)

### Technical Constraints

- **iSDLC framework extension**: Must integrate as a module within the existing framework, not a standalone product
- **Language-agnostic**: Must support Java, TypeScript, XML, Python, and other languages via Tree-sitter
- **VCS-agnostic**: Must support both Git and SVN working copies (different projects use different stacks)
- **CI/CD-agnostic**: Must support Jenkins (SVN projects) and GitHub Actions (Git projects)
- **Local-first**: Core generation and serving must work without cloud dependencies
- **Enterprise distribution**: Must support Artifactory, Nexus, S3, and SFTP transports

### Conventions

- ESM modules for lib/ code (import/export)
- CommonJS for hooks (require/module.exports)
- Search backends implement `search(request) → SearchHit[]` and `healthCheck() → HealthStatus`
- Configuration stored in `.isdlc/` directory (gitignored)

---

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|---|---|---|
| Query latency | Critical | < 2 seconds for semantic search (p95) |
| Generation speed | Critical | < 5 minutes per module (500K LOC) locally; CI within build budget |
| Security | Critical | Zero source reconstruction from Interface/Guided tier embeddings |
| Reliability | High | MCP server auto-recovers from crashes; partial results on timeout |
| Portability | High | Works on macOS, Linux, Windows; Docker for MCP server |
| Maintainability | High | Each module independently testable; pluggable adapters |
| Scalability | Medium | Handles 16M+ LOC across 10+ modules |

### Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-001 | Source code reconstructible from embeddings | Medium | Critical | Content redaction pipeline with 3 tiers; security audit of Interface-tier outputs |
| R-002 | 16M LOC generation exceeds CI time budget | High | High | 4-level parallelism; incremental refresh; module-partitioned builds |
| R-003 | CodeBERT 512-token context too small for some constructs | Medium | Medium | Overlapping chunk windows; fall back to cloud models for long contexts |
| R-004 | Cross-module version incompatibility causes query failures | Medium | High | Version compatibility matrix; validation at load time |
| R-005 | FAISS index corruption during incremental update | Low | High | Atomic write (build new index, swap); checksum validation |
| R-006 | Customer's Docker environment incompatible with MCP server | Medium | Medium | Multi-arch Docker images; fallback to direct FAISS loading without MCP |
| R-007 | Tree-sitter grammar missing for customer's language | Low | Medium | Graceful fallback to line-based chunking; pluggable grammar installation |

---

## 6. Functional Requirements

### FR-001: Code Embedding Generation Pipeline

**Description**: Generate vector embeddings from source code files, per-module, with incremental refresh support. Parse files using Tree-sitter for language-agnostic semantic chunking, then embed chunks via the configured model.
**Confidence**: High
**Priority**: Must Have

- **AC-001-01**: Given a module directory, the pipeline produces a FAISS index and SQLite metadata store containing embeddings for all supported source files
- **AC-001-02**: Incremental mode re-embeds only files changed since the last generation (detected via VCS adapter)
- **AC-001-03**: Chunking preserves semantic boundaries (functions, classes, methods) — not arbitrary line splits
- **AC-001-04**: Pipeline reports progress (files processed, chunks generated, embeddings created) via callback
- **AC-001-05**: Pipeline handles unsupported file types gracefully (skip with warning, continue)

### FR-002: Knowledge Base Embedding Pipeline

**Description**: Generate embeddings from non-code knowledge sources (documentation, runbooks, operational guides) using the same embedding engine but with document-oriented chunking.
**Confidence**: Medium
**Priority**: Could Have

- **AC-002-01**: Pipeline accepts markdown, HTML, and plain text documents
- **AC-002-02**: Chunking respects document structure (headings, sections, paragraphs)
- **AC-002-03**: Output is a separate `.emb` package distinguishable from code embeddings

### FR-003: Embedding MCP Server

**Description**: A Docker-containerized MCP server that loads embedding packages and serves semantic search queries via SSE transport. Warm-loads packages at startup to avoid cold-start latency.
**Confidence**: High
**Priority**: Must Have

- **AC-003-01**: Server starts in Docker, loads configured `.emb` packages on startup
- **AC-003-02**: Exposes MCP tools: `semantic_search(query, options)`, `list_modules()`, `module_info(id)`
- **AC-003-03**: SSE transport for persistent connection (no per-query startup cost)
- **AC-003-04**: Health endpoint reports loaded modules, index sizes, and last-query latency
- **AC-003-05**: Supports hot-reload of updated packages without server restart

### FR-004: Multi-Store Query Orchestrator

**Description**: Classify incoming queries by intent, fan out to relevant module embedding stores, and merge results with re-ranking.
**Confidence**: High
**Priority**: Must Have

- **AC-004-01**: Query classifier determines which module stores are relevant based on query content and module metadata
- **AC-004-02**: Fan-out queries execute in parallel across selected stores
- **AC-004-03**: Results are merged and re-ranked by relevance across all responding stores
- **AC-004-04**: Partial results returned if some stores timeout (with degradation indicator)
- **AC-004-05**: Orchestrator respects token budget constraints from the search request

### FR-005: Embedding Model Abstraction

**Description**: Pluggable embedding model interface supporting local (CodeBERT) and cloud (Voyage-code-3, OpenAI) providers with consistent output format.
**Confidence**: High
**Priority**: Should Have

- **AC-005-01**: Model adapter interface: `embed(texts: string[]) → { vectors: float[][], dimensions: number }`
- **AC-005-02**: CodeBERT adapter works locally without internet (768-dim, 512 token context)
- **AC-005-03**: Voyage-code-3 and OpenAI adapters configurable via API keys in settings
- **AC-005-04**: Dimension mismatch between models handled at index creation (indexes are model-specific)
- **AC-005-05**: Model selection configurable per-module in generation config

### FR-006: Embedding Distribution Format

**Description**: Define the `.emb` package format containing FAISS index, SQLite metadata, and manifest for portable distribution.
**Confidence**: High
**Priority**: Must Have

- **AC-006-01**: Package contains: `index.faiss`, `metadata.sqlite`, `manifest.json`
- **AC-006-02**: Manifest includes: module ID, version, model used, dimensions, chunk count, content tier, creation timestamp, checksums
- **AC-006-03**: Package is a single file (tar or zip) for easy transport
- **AC-006-04**: Packages are self-describing — consumer can determine compatibility from manifest alone

### FR-007: Embedding Update Lifecycle

**Description**: Pluggable transport adapters for publishing and fetching embedding packages from artifact repositories, with update checking.
**Confidence**: High
**Priority**: Must Have

- **AC-007-01**: Transport adapters for: Artifactory, Nexus, S3, SFTP
- **AC-007-02**: Update checker queries registry for newer compatible versions
- **AC-007-03**: Downloads validate checksum before replacing local packages
- **AC-007-04**: Rollback capability: previous version retained until new version verified

### FR-008: Embedding Package Security

**Description**: Encrypt embedding packages with AES-256-GCM per-module keys, enabling license-based access control.
**Confidence**: High
**Priority**: Must Have

- **AC-008-01**: Packages encrypted with AES-256-GCM using per-module encryption keys
- **AC-008-02**: Key ID stored in package manifest (key itself distributed separately)
- **AC-008-03**: Decryption failure produces clear error message (wrong key, corrupt package)
- **AC-008-04**: Key rotation supported without re-generating embeddings (re-encrypt only)

### FR-009: Version Compatibility Management

**Description**: Cross-module version compatibility validation — not all module versions are compatible with each other.
**Confidence**: High
**Priority**: Must Have

- **AC-009-01**: Compatibility matrix declares which module versions work together
- **AC-009-02**: MCP server validates compatibility at package load time
- **AC-009-03**: Update checker only offers compatible version combinations
- **AC-009-04**: Incompatible versions produce clear error with compatible alternatives listed

### FR-010: Embedding Aggregation and Release Assembly

**Description**: Collect per-module embedding packages into a release bundle with cross-module compatibility validation.
**Confidence**: High
**Priority**: Must Have

- **AC-010-01**: Aggregation collects specified module packages into a release bundle
- **AC-010-02**: Cross-module compatibility validated before assembly
- **AC-010-03**: Release manifest lists all included modules with versions and checksums
- **AC-010-04**: Failed aggregation (incompatible versions) blocks release with clear error

### FR-011: Content Redaction Pipeline

**Description**: Strip source code to configured security tier before embedding to protect intellectual property.
**Confidence**: High
**Priority**: Must Have

- **AC-011-01**: Interface tier: only public method signatures, class names, parameter types, return types
- **AC-011-02**: Guided tier: Interface content plus AI-generated behavioral summaries
- **AC-011-03**: Full tier: complete source code (internal use only)
- **AC-011-04**: Tier is per-package (set at generation time, immutable after)
- **AC-011-05**: Redaction is applied before embedding — raw source never enters the vector store for Interface/Guided tiers

### FR-012: iSDLC Search Integration

**Description**: Register a semantic search backend in the existing iSDLC search abstraction layer that delegates to the MCP server.
**Confidence**: High
**Priority**: Should Have

- **AC-012-01**: Backend registered as `semantic` modality in search registry with priority 10
- **AC-012-02**: Implements standard adapter interface: `search(request) → SearchHit[]`, `healthCheck() → HealthStatus`
- **AC-012-03**: Delegates to MCP server via SSE client
- **AC-012-04**: Falls back to direct FAISS loading if MCP server unavailable
- **AC-012-05**: Health check reports MCP server status and loaded module count

### FR-013: Module Registry

**Description**: Central registry of module metadata including domain classification, dependencies, and query routing hints.
**Confidence**: High
**Priority**: Must Have

- **AC-013-01**: Registry file (`registry.json`) lists all modules with: ID, name, domain, description, dependencies, version
- **AC-013-02**: Query orchestrator uses registry metadata to route queries to relevant modules
- **AC-013-03**: Registry supports hierarchical domains (e.g., `commerce.order-management`)
- **AC-013-04**: Registry is versioned alongside module packages

### FR-014: Local Embedding Generation

**Description**: Developer generates embeddings from their local working copy via `isdlc embedding generate` CLI command. Targets a single module, outputs `.emb` package loaded directly into the local MCP server.
**Confidence**: High
**Priority**: Must Have

- **AC-014-01**: `isdlc embedding generate` produces a valid `.emb` package from the current working copy
- **AC-014-02**: Generated package is automatically loaded into the local MCP server without manual steps
- **AC-014-03**: Incremental mode re-embeds only files changed since last generation (via VCS adapter)
- **AC-014-04**: Works in both Git and SVN working copies
- **AC-014-05**: Generation completes within 5 minutes for a single module (up to 500K LOC)

### FR-015: Semantic Search Toolchain Installation

**Description**: Extend the iSDLC installer (`isdlc init` / `isdlc update`) to install and configure the semantic search toolchain: Tree-sitter and language grammars, CodeBERT model (ONNX), FAISS native bindings, and Docker image pull for the MCP server. Follows the existing search setup pattern established in REQ-0044.
**Confidence**: High
**Priority**: Must Have

- **AC-015-01**: `isdlc init` installs Tree-sitter core and grammars for configured languages (default: Java, TypeScript, Python, XML)
- **AC-015-02**: `isdlc init` downloads the CodeBERT ONNX model on first run (~500MB) with progress indicator
- **AC-015-03**: `isdlc init` installs `faiss-node` and `better-sqlite3` native bindings for the current platform
- **AC-015-04**: `isdlc init` pulls the MCP server Docker image if Docker is available
- **AC-015-05**: `isdlc update` updates all semantic search components to versions compatible with the framework version
- **AC-015-06**: If Docker is unavailable, installation skips MCP server image pull with a warning (not an error) — direct FAISS fallback still works
- **AC-015-07**: If ONNX runtime fails to install (platform incompatibility), warn but do not block — cloud model providers still work
- **AC-015-08**: Installation adds semantic search configuration defaults to `.isdlc/search-config.json`

### FR-016: Discovery-Triggered Embedding Generation

**Description**: Integrate embedding generation into the `/discover --existing` workflow so that developers have semantic search available from day one. Supports three trigger points: before discovery (flat generation for immediate agent use), during discovery (parallel with analysis), and after discovery (module-aware generation using discovery output).
**Confidence**: High
**Priority**: Must Have

- **AC-016-01**: `/discover --existing` offers embedding generation as part of the discovery workflow
- **AC-016-02**: "Before" mode generates a flat (non-module-partitioned) embedding of the entire codebase so discovery agents can use semantic search during their analysis
- **AC-016-03**: "During" mode runs embedding generation in parallel with architecture/test analysis agents (no dependency between them)
- **AC-016-04**: "After" mode uses module boundaries identified by the architecture-analyzer to generate module-partitioned embeddings with proper registry metadata
- **AC-016-05**: User can choose trigger timing or skip embedding generation during discovery
- **AC-016-06**: If "before" mode was used, "after" mode can upgrade the flat embedding to module-partitioned without full re-generation (reuses existing chunk/vector data, re-partitions into module packages)
- **AC-016-07**: Generated embeddings are automatically loaded into the MCP server for immediate use
- **AC-016-08**: Discovery report (`docs/project-discovery-report.md`) includes embedding generation status and statistics

---

## 7. Out of Scope

| Item | Reason | Dependency |
|---|---|---|
| Training custom embedding models | Requires ML infrastructure; use pre-trained models | None — can be added later |
| Real-time streaming embedding updates | Complexity too high for v1; batch/incremental sufficient | FR-001 incremental covers most needs |
| Multi-tenant SaaS hosting of embeddings | Enterprise self-hosted; no shared infrastructure needed | Could build on FR-003 MCP server later |
| IDE plugins (VS Code, IntelliJ) | Claude Code is the primary interface; IDE plugins are separate projects | FR-003 MCP server provides the API |
| Embedding-based code completion | Query-based search is v1; completion requires different architecture | FR-004 orchestrator could extend |
| Natural language to code generation | Different problem domain; embeddings provide context, not generation | None |

---

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|---|---|---|---|
| FR-001 | Code Embedding Generation Pipeline | Must Have | Core capability — nothing works without it |
| FR-003 | Embedding MCP Server | Must Have | Primary serving mechanism for both developers and customers |
| FR-004 | Multi-Store Query Orchestrator | Must Have | Multi-module codebase requires cross-module query routing |
| FR-006 | Embedding Distribution Format | Must Have | Defines the portable artifact that everything else produces/consumes |
| FR-007 | Embedding Update Lifecycle | Must Have | Customers need to receive updates; developers need fresh embeddings |
| FR-008 | Embedding Package Security | Must Have | IP protection is non-negotiable for shipping to customers |
| FR-009 | Version Compatibility Management | Must Have | Multi-module system with independent release cycles requires this |
| FR-010 | Embedding Aggregation & Release | Must Have | CI/CD pipeline needs to assemble multi-module releases |
| FR-011 | Content Redaction Pipeline | Must Have | Security tiers are the IP protection mechanism |
| FR-013 | Module Registry | Must Have | Orchestrator needs module metadata for routing |
| FR-014 | Local Embedding Generation | Must Have | Primary developer workflow |
| FR-015 | Semantic Search Toolchain Installation | Must Have | Nothing works if tools aren't installed |
| FR-016 | Discovery-Triggered Embedding Generation | Must Have | Developer gets semantic search from day one |
| FR-005 | Embedding Model Abstraction | Should Have | System works with CodeBERT alone but cloud models improve quality |
| FR-012 | iSDLC Search Integration | Should Have | System works standalone but integration improves agent experience |
| FR-002 | Knowledge Base Embedding Pipeline | Could Have | Code embeddings are the primary need; docs can come later |

---

## 9. Non-Functional Requirements

### Performance (6)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-P01 | Semantic search query latency | < 2 seconds p95 |
| NFR-P02 | Local single-module generation time | < 5 minutes for 500K LOC |
| NFR-P03 | CI full-module generation (parallel) | Within existing build time budget |
| NFR-P04 | MCP server startup with package loading | < 30 seconds for 10 modules |
| NFR-P05 | Incremental generation (changed files only) | < 30 seconds for typical changeset |
| NFR-P06 | Query orchestrator fan-out overhead | < 200ms added latency vs single-store query |

### Storage & Distribution (4)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-S01 | Embedding package size per module | < 500MB for 500K LOC module |
| NFR-S02 | MCP server memory usage | < 2GB RAM for 10 loaded modules |
| NFR-S03 | SQLite metadata query latency | < 10ms for chunk lookup |
| NFR-S04 | Package download resume | Support resume on interrupted downloads |

### Reliability (4)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-R01 | MCP server crash recovery | Auto-restart within 10 seconds |
| NFR-R02 | Partial results on store timeout | Return results from responding stores within 5 seconds |
| NFR-R03 | Corrupt index detection | Checksum validation at load time |
| NFR-R04 | Generation pipeline fault tolerance | Continue on per-file errors; report failures at end |

### Portability (4)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-PT01 | OS support | macOS, Linux, Windows |
| NFR-PT02 | Docker multi-arch | amd64 and arm64 images |
| NFR-PT03 | VCS support | Git and SVN working copies |
| NFR-PT04 | CI/CD support | Jenkins and GitHub Actions |

### Maintainability (4)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-M01 | Module independence | Each of 10 modules independently testable |
| NFR-M02 | Adapter pluggability | New model/transport/VCS adapter without core changes |
| NFR-M03 | Tree-sitter grammar extension | Add new language support without code changes |
| NFR-M04 | Configuration externalization | All tuning parameters in config files, not code |

### Observability & Recovery (10)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-O01 | Embedding store unreachable | Circuit breaker after 3 failures; health status degraded |
| NFR-O02 | MCP server crash detection | Docker health check; auto-restart policy |
| NFR-O03 | Store recovery after crash | Reload packages from disk on restart; no re-generation |
| NFR-O04 | Query timeout handling | Per-store timeout; partial results from responsive stores |
| NFR-O05 | Generation failure reporting | Per-file error log; summary at pipeline end |
| NFR-O06 | Package integrity monitoring | Checksum validation at load, periodic re-validation |
| NFR-O07 | Model health check | Verify model responds correctly before generation starts |
| NFR-O08 | Disk space monitoring | Warn when embedding storage exceeds configurable threshold |
| NFR-O09 | Connection pool management | SSE connections cleaned up on timeout/error |
| NFR-O10 | Graceful degradation path | MCP down → direct FAISS → grep-glob fallback chain |

### Security — Transport (3)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-ST01 | Package encryption | AES-256-GCM per-module keys |
| NFR-ST02 | Transport security | TLS for all network transfers (Artifactory, S3, etc.) |
| NFR-ST03 | Key management | Key IDs in manifest; keys distributed separately from packages |

### Security — Tier Enforcement (7)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-SE01 | Interface tier content | Only public signatures, no method bodies |
| NFR-SE02 | Guided tier content | Signatures plus AI-generated summaries, no raw source |
| NFR-SE03 | Full tier restriction | Internal use only; never shipped to customers |
| NFR-SE04 | Tier immutability | Tier set at generation; cannot be changed post-creation |
| NFR-SE05 | Redaction before embedding | Raw source never enters vector store for Interface/Guided |
| NFR-SE06 | Reconstruction resistance | Interface/Guided embeddings must not enable source reconstruction |
| NFR-SE07 | Tier audit trail | Log which tier was generated, by whom, when |

### CI/CD (3)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-CI01 | Pipeline integration | Maven plugin for Java builds; npm script for JS builds |
| NFR-CI02 | Jenkins matrix support | Parallel module generation across CI runners |
| NFR-CI03 | Artifact publishing | Automated publish to configured repository on successful build |

### Logging (8)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-L01 | Log levels | INFO, WARN, ERROR, DEBUG configurable per module |
| NFR-L02 | Generation logging | Files processed, chunks created, embeddings generated, errors |
| NFR-L03 | Query logging | Query text, modules searched, result count, latency |
| NFR-L04 | Distribution logging | Package published/fetched, transport used, checksums |
| NFR-L05 | Security logging | Decryption attempts (success/failure), tier access |
| NFR-L06 | Structured format | JSON structured logs for machine parsing |
| NFR-L07 | Log rotation | Configurable max size and retention |
| NFR-L08 | Sensitive data exclusion | No API keys, encryption keys, or source code in logs |

### Performance Logging (8)

| ID | Requirement | Threshold |
|---|---|---|
| NFR-PL01 | Generation metrics | Time per file, per chunk, per batch; total wall clock |
| NFR-PL02 | Query metrics | Latency per store, fan-out overhead, merge time |
| NFR-PL03 | MCP server metrics | Active connections, loaded modules, memory usage |
| NFR-PL04 | Distribution metrics | Upload/download time, bandwidth, retry count |
| NFR-PL05 | Model metrics | Embedding throughput (chunks/second), batch utilization |
| NFR-PL06 | Aggregation metrics | Modules collected, validation time, bundle size |
| NFR-PL07 | Health check metrics | Per-store health status, last check time, failure count |
| NFR-PL08 | Dashboard export | Metrics exportable as JSON for external monitoring tools |

---

## Pending Sections

*All sections complete.*
