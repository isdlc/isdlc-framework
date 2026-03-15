# Design Summary: Roundtable Memory Vector DB Migration

**Accepted**: 2026-03-15

---

## Module Architecture

| Module | Responsibility |
|---|---|
| `lib/memory.js` | Core memory CRUD with enriched format support + flat JSON fallback |
| `lib/memory-embedder.js` (new) | Async embedding orchestrator — chunks, embeds, indexes session records |
| `lib/memory-search.js` (new) | Semantic search over dual vector indexes with fallback |

## Key Interfaces

- `embedSession(record, indexPath, engineConfig)` → async embed, never throws
- `searchMemory(queryText, userIndexPath, projectIndexPath, engineConfig)` → ranked excerpts
- `rebuildIndex(sessionsDir, indexPath, engineConfig)` → full re-embed for model mismatch
- `checkModelConsistency(indexPath, engineConfig)` → validate model match
- `formatSemanticMemoryContext(results)` → new MEMORY_CONTEXT format

## Data Flow

- Write path: raw JSON (immediate) → async embed → .emb index update
- Read path: embed query → search dual indexes → merge results → format MEMORY_CONTEXT
- Fallback: any failure → flat JSON (REQ-0063 path) → structured MEMORY_CONTEXT

## Enriched Session Record

Session records extended with `summary` (NL text), `context_notes` (per-topic NL), `embedded` (boolean), `embed_model` (string). Backward-compatible with existing SessionRecord.

## MEMORY_CONTEXT Format Change

Legacy (structured): `--- topic: {id} ---` with preference fields
New (semantic): `--- memory-result (score: N, layer: L) ---` with NL excerpts
Agent handles both formats via delimiter detection.
