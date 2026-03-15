# Requirements Summary: Roundtable Memory Vector DB Migration

**Accepted**: 2026-03-15

---

## Problem Statement

The roundtable memory layer (REQ-0063) uses flat JSON storage with key-value lookups by topic_id. This limits recall to structured preferences (depth per topic) and misses the semantic context of past sessions. Users must edit JSON files to override preferences, conflicting with the conversational UX model.

## Stakeholders

- **Framework user (primary)**: Benefits from semantic recall and conversational memory control
- **Team members (secondary)**: Benefit from shared project memory via git
- **Framework maintainers**: Must preserve backward compatibility with REQ-0063

## Functional Requirements (11 total)

| ID | Title | Priority | Confidence |
|---|---|---|---|
| FR-001 | Enriched session record format | Must Have | High |
| FR-002 | Async write-time embedding | Must Have | High |
| FR-003 | Dual-index architecture (user + project) | Must Have | High |
| FR-004 | Semantic search at roundtable startup | Must Have | High |
| FR-005 | Conversational override interface | Must Have | High |
| FR-006 | Conversational query interface | Should Have | High |
| FR-007 | Model consistency enforcement | Must Have | Medium |
| FR-008 | Lazy embed fallback | Should Have | Medium |
| FR-009 | Vector compaction | Should Have | Medium |
| FR-010 | Backward compatibility with flat JSON | Must Have | High |
| FR-011 | Fail-open on embedding unavailability | Must Have | High |

## Key Decisions

- Storage format is an implementation detail — user interface is conversational
- Two separate indexes: user (`~/.isdlc/user-memory/`) and project (`docs/.embeddings/`)
- Project index is committable and shareable via git for teams
- Session records enriched with natural language summaries (the "why", not just the "what")
- Async write-time embedding — never blocks user experience
