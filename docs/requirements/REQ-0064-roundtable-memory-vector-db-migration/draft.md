# REQ-0064: Roundtable Memory Vector DB Migration

**Source**: manual
**Created**: 2026-03-15

## Description

Move roundtable memory layer (both user and project layers) from flat JSON files to vector DB, leveraging the existing embedding infrastructure (REQ-0045: FAISS, embedding engine, store-manager, MCP server). Replace compacted JSON preference summaries with semantic vector search over past session records. Both ~/.isdlc/user-memory/ and .isdlc/roundtable-memory.json should migrate to vector storage.

## Context

- REQ-0063 implemented the roundtable memory layer with flat JSON storage
- REQ-0045 built a full embedding stack: FAISS, embedding engine (CodeBERT/Voyage/OpenAI), store-manager with cosine similarity, MCP server
- ADR-004 in REQ-0063 explicitly deferred semantic search — this REQ activates it
- Current memory is preference-based (depth per topic); vector DB enables semantic recall of past session content
