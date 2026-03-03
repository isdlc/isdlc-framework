# Indexed Search Backend (Zoekt)

**Source**: REQ-0041 FR-013 (promoted from "Won't Have" to standalone feature)
**Parent**: REQ-0041-improve-search-capabilities-for-claude-effectiveness

## Context

REQ-0041 established a search abstraction layer (FR-001 through FR-011) that is now implemented. FR-013 was deferred as "Won't Have (This Iteration)" but is now being promoted for implementation.

The search abstraction layer already supports pluggable backends via MCP servers. This feature adds a trigram-indexed search backend (Zoekt or equivalent) for sub-second full-codebase queries on large codebases.

## Original FR-013 from REQ-0041

**FR-013: Indexed Search Backend (Phase 2)**

**Description**: Integrate trigram-indexed search (Zoekt or equivalent) for sub-second full-codebase queries on large codebases.

**Confidence**: Low

**Acceptance Criteria**:
- AC-013-01: Trigram index is built during project setup or on first search
- AC-013-02: Index is incrementally updated on file changes
- AC-013-03: Queries execute in sub-second time on 500K file codebases
- AC-013-04: Index storage is resource-aware (configurable limits)

## Why Now

- The search abstraction layer (FR-001/FR-002) is already implemented, providing the plugin point
- MCP server configuration (FR-005) is in place
- Zoekt is a mature, battle-tested tool (Google Code Search origin)
- Direct speed multiplier for all existing agent search patterns
- Lower complexity than FR-012 (semantic search) with more predictable benefits
- Addresses scaling pain for large codebases (10K-500K files)

## Key Technical Notes

- Zoekt is available as a Go binary with well-documented installation
- MCP server wrapper needed (or use existing community MCP server if available)
- Index is stored locally on disk (trigram-based, efficient storage)
- Integrates via the existing `indexed` modality in the search backend registry
- Must work cross-platform (macOS, Linux, Windows)
