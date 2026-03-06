# REQ-0045: Semantic Search Backend

## Summary

FR-012 from REQ-0041 (deferred Phase 2 item). Implement an embedding-based semantic search backend that enables natural language queries against the codebase.

## Description

Add a semantic search backend to the existing search abstraction layer (built in REQ-0041). This backend uses vector embeddings to find code by meaning rather than exact text match, complementing the existing lexical (Grep/Glob), structural (ast-grep), and enhanced-lexical (Probe) backends.

## Key Requirements

- **Local-first**: CodeBERT as the default local embedding model (no cloud dependency required)
- **Optional cloud providers**: Voyage-3-large and OpenAI as configurable alternatives for higher quality embeddings
- **Integration**: Plugs into the existing search router and backend registry (`lib/search/`)
- **Modality**: Registers as `semantic` modality in the search registry (slot already exists)
- **Backend file**: `lib/search/backends/semantic.js` (placeholder path already documented in REQ-0041 design)

## Origin

- Originally defined as FR-012 in REQ-0041 requirements-spec.md
- Marked as "Won't Have This Iteration" during REQ-0041 planning
- Architecture slots (router modality, registry mapping) already in place from Phase 1

## References

- REQ-0041 requirements-spec.md: FR-012 definition
- REQ-0041 architecture-overview.md: Phase 2 architecture diagram
- REQ-0041 design-summary.md: semantic.js placeholder
- REQ-0041 user-stories.json: US-08 (semantic search user story)
