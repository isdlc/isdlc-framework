---
Status: Complete
Last Updated: 2026-02-22
---

# Implementation Notes: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## Summary

Prompt-restructuring change affecting 2 .md files. No executable code changes.

## Files Modified

### 1. `src/claude/commands/isdlc.md`

**Add handler (step 3a, 3b)**: Added conditional for pre-fetched issue data.
When the analyze handler's fast path invokes the add handler, it passes pre-fetched
issue data (title, labels, body). The add handler uses this data instead of calling
`gh issue view`. When invoked directly via `/isdlc add`, existing fetch behavior
is preserved.

**Analyze handler (steps 3-7a)**: Restructured the pre-dispatch pipeline from
sequential numbered steps to dependency groups:

- **Parse Phase**: Detect input type (external ref vs non-external ref)
- **Group 1** (5 parallel operations at T=0): issue fetch, existing-ref grep, folder
  glob for sequence number, 3 persona file reads, topic path glob
- **Group 2** (needs Group 1 results): conditional add handler invocation with
  pre-fetched issue data, topic file reads, existing meta/draft reads
- **Dispatch**: Compose prompt with new PERSONA_CONTEXT and TOPIC_CONTEXT fields
  using `--- persona-{name} ---` and `--- topic: {topic_id} ---` delimiters

Auto-add fast path: For `#N` and `PROJECT-N` inputs where no existing folder is
found, the add handler is invoked automatically without user confirmation.

In-memory reuse: After the add handler writes meta.json and draft.md, the dispatch
prompt is composed from in-memory objects rather than re-reading from disk.

### 2. `src/claude/agents/roundtable-analyst.md`

**Section 1.1 (Single-Agent Mode)**: Added conditional to check for PERSONA_CONTEXT
in dispatch prompt. When present, persona content is parsed from inlined field
instead of reading files from disk. Fallback to file reads when absent.

**Section 2.1 (Opening)**: Deferred codebase scan from before exchange 1 to after
the user's first reply (exchange 2 processing). Maya carries exchange 1 solo from
draft knowledge. Alex contributes codebase evidence starting at exchange 2.

**Section 2.7 (Exception line)**: Removed the exception that mandated silent scan
before first exchange. Replaced with note that scan is deferred to exchange 2.

**Section 3.1 (Topic Registry)**: Added conditional to check for TOPIC_CONTEXT in
dispatch prompt. When present, topic content is parsed from inlined field instead
of globbing and reading files. Fallback to existing behavior when absent.

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Dependency group notation | Groups make parallelism unambiguous to the LLM |
| Auto-add for external refs only | Intent is unambiguous when user references a specific issue |
| Pre-fetched data passthrough | Avoids duplicate fetch; add handler validates input |
| Scan deferred to exchange 2 | Simplest approach; Maya carries exchange 1 from draft |
| Fallback paths preserved | Backward compatible with any external dispatch without inlined context |

## Traces

- FR-001 (Dependency Groups): isdlc.md steps 3a Group 1, Group 2
- FR-002 (Auto-Add): isdlc.md step 3a auto-add rationale
- FR-003 (Pre-Fetched Data): isdlc.md add handler step 3a, 3b
- FR-004 (No Re-Read): isdlc.md step 3a in-memory reuse
- FR-005 (Inlined Context): isdlc.md dispatch prompt PERSONA_CONTEXT, TOPIC_CONTEXT
- FR-006 (Roundtable Accepts): roundtable-analyst.md Sections 1.1, 3.1
- FR-007 (Deferred Scan): roundtable-analyst.md Section 2.1 steps 3, 6, 7
- FR-008 (Error Handling): Preserved fail-fast in Group 1, Group 2
