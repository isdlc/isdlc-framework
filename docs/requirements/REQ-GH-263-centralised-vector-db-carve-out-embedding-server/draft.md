# Centralised Vector DB: carve out embedding server into separate repo

**Source**: GitHub Issue #263
**Type**: REQ (Feature)

## Summary

Extract the embedding pipeline and Vector DB infrastructure from `isdlc-framework` into a standalone `isdlc-embeddings-server` repo. One codebase that supports three deployment modes — solo developer (local), project team (central server), and organisation (central server, broader scope). Teams and orgs connect via remote MCP; solo devs run everything locally via the same pipeline.

## Motivation

The current implementation bundles embedding model setup, vector DB installation, and index building into the iSDLC install script — running everything on each developer's local machine. This works for solo developers but doesn't scale to teams:

- Every developer re-indexes the same codebase independently
- Embedding models consume RAM on memory-constrained laptops (GH-238 OOM issues)
- No shared search — each developer has their own isolated index
- No way to include non-code sources (Confluence, Google Drive) in the search corpus
- Discover artifacts (project skills, test gaps, feature maps) are produced per-developer instead of shared

A centralised server solves these for teams and orgs. Solo developers keep the current local experience with no server required.

## Deployment Modes

One codebase, three modes. The pipeline is identical — only where it runs and what it indexes changes.

| | Solo Developer | Project Team | Organisation |
|---|---|---|---|
| **Pipeline runs** | Locally on dev machine | Central server (AWS/office/Docker) | Same central server, broader scope |
| **Discover** | Local, on-demand (`/discover`) | CI-driven on push, artifacts committed to repo | CI-driven + doc crawlers |
| **Vector DB** | Local (SQLite/file-based) | Central server | Central server |
| **MCP** | Local MCP server (localhost) | Remote MCP endpoint | Same remote MCP endpoint |
| **Indexed sources** | 1 repo (local) | Team's repos (via VCS webhooks) | All repos + Confluence/Google Drive |
| **Re-index trigger** | Manual or file watcher | VCS webhooks (Git/SVN) | VCS webhooks + doc crawlers |
| **Access control** | None needed | None needed | Probably needed |
| **Install** | `isdlc-embeddings --mode local` | `isdlc-embeddings --mode server` | Same server mode, broader source config |

## Relationship-Aware Embedding Pipeline

Critical design requirement: The embedding pipeline must not index sources in isolation. The relationships between code, docs, discover output, and tests are the valuable part.

Pipeline ordering — discover is a prerequisite to good embeddings:
1. Trigger fires (file watcher for solo, VCS webhook for team/org)
2. Discover runs → produces project skills, feature maps, test gaps
3. Doc crawlers run (team/org only) → pull Confluence, Google Drive
4. Embedding pipeline runs → ingests code + discover output + docs + tests → correlates sources → creates relationship-aware chunks → embeds with enriched context
5. Vector DB updated → developer(s) query via MCP

## CI-Driven Discover and Test Generation (Team/Org Mode)

For teams and orgs, discover and test generation should be CI-triggered, not developer-triggered. Committed artifacts (skills, test gaps, feature maps) go into the repo via CI. Runtime artifacts (embeddings, semantic search index) go to the central server.

## Scope — What Moves to the New Repo

- Embedding pipeline (relationship-aware chunking, source correlation, model inference, index building)
- Vector DB setup and runtime management
- MCP server (supports both local and remote mode)
- Mode switch (--mode local for solo, --mode server for team/org)
- VCS integration — webhook/post-commit hook listeners
- CI-driven discover pipeline
- CI-driven test generation
- Source correlation engine
- Documentation source connectors (Confluence, Google Drive — future)
- Server deployment scripts
- Health checks, index stats, admin API

## Scope — What Stays in iSDLC Framework

- MCP client config (.mcp.json pointing at localhost or remote URL)
- Semantic search tools (mcp__isdlc-embedding__*) — unchanged, transport-agnostic
- /discover workflow — can still run locally for solo devs
- Install script updates — detect mode, configure .mcp.json accordingly

## Interface Contract

MCP only. Same tools regardless of mode:
- isdlc_embedding_semantic_search
- isdlc_embedding_add_content
- isdlc_embedding_list_modules

## Open Questions

- Embeddings per module vs unified store?
- Repo name?
- Discover CI mode — headless/non-interactive?
- Correlation depth — file-level or symbol-level?
- Solo dev migration path when joining a team?

## Related

- #261 — Anti-rationalization tables
- #262 — Skill catalog rationalisation
- GH-237 — Jina v2 embedding pipeline
- GH-238 — OOM bug in embedding pipeline
- GH-256 — SVN support
- GH-257 — Fisheye/Crucible integration
