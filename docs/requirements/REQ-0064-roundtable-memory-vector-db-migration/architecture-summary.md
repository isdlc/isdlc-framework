# Architecture Summary: Roundtable Memory Vector DB Migration

**Accepted**: 2026-03-15

---

## Key Architecture Decisions

| Decision | Selected | Rationale |
|---|---|---|
| ADR-001: Two-phase write | Immediate raw JSON + async embed | Non-blocking UX; raw record always persists |
| ADR-002: Dual separate indexes | User at ~/.isdlc/, project at docs/.embeddings/ | Privacy + team shareability |
| ADR-003: Reuse embedding stack | REQ-0045 engine + store-manager + pipeline | Zero new dependencies; proven infrastructure |
| ADR-004: .emb package format | Existing binary format with manifest | Portable; tracks model for consistency |
| ADR-005: Conversational override | Preferences stored as NL content in session records | Aligns with semantic search model |

## Integration Points

- `lib/memory.js` (major rewrite) + 2 new modules (memory-embedder.js, memory-search.js)
- Analyze handler: semantic search at dispatch, async embed post-session
- Roundtable agent: new MEMORY_CONTEXT format (ranked excerpts)
- Existing embedding stack: engine, store-manager, knowledge pipeline, package format

## Blast Radius

- 4 modified files, 4 new files, 3 test files, 2 config changes (~13 total)
- Risk: Medium (embedding backend soft dependency); mitigated by fail-open + flat JSON fallback
