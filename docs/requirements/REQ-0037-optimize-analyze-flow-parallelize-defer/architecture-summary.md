---
Status: Accepted
Last Updated: 2026-02-22
---

# Architecture Summary: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

**Key Architecture Decisions** (4 ADRs, all Accepted):

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | Dependency Group Notation | Named parallel groups make concurrency unambiguous; numbered lists bias LLMs toward serialization. Pattern already exists in roundtable's finalization batch protocol. |
| ADR-002 | Deferred Codebase Scan | Simplest approach. No new files, no background processes. Maya carries exchange 1 solo; Alex joins at exchange 2 with codebase evidence. |
| ADR-003 | Pre-Fetched Issue Data Passthrough | Single fetch in Group 1, result passed to add handler in Group 2. Eliminates duplicate gh issue view without duplicating add handler logic. |
| ADR-004 | Structured Dispatch Prompt Extension | New PERSONA_CONTEXT and TOPIC_CONTEXT fields with delimiter-based parsing. Backward compatible via fallback. |

**Rejected alternatives**: Background scanner script, inline parallelism hints, moving scan into inline handler, file-based fetch caching.

**Risk assessment**: Low-Medium overall. Primary risk is LLM ignoring parallelism hints (empirically testable).
