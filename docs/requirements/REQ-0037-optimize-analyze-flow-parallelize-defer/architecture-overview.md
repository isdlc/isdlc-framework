---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Architecture Overview: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Architecture Options

### Decision 1: How to Express Parallelism in Prompt Instructions

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Dependency Group Notation | Replace sequential numbered steps with named groups declaring parallel operations | Unambiguous; impossible to misinterpret ordering; matches finalization batch pattern in roundtable-analyst | Requires rewriting the analyze handler section | Aligns with roundtable-analyst Section 5.5 (finalization batch protocol) | **Selected** |
| B: Inline Parallelism Hints | Keep numbered steps, add "(parallel with step N)" annotations | Lighter touch; minimal rewrite | LLM may still serialize due to numbered list bias; hints are easy to miss | No existing pattern in codebase | Eliminated |

### Decision 2: How to Handle Codebase Scan Timing

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Defer scan to after first exchange | Scan runs when roundtable processes user's first reply; Alex joins at exchange 2 | Simplest; no new files; no background processes; no coordination protocol | Alex absent from exchange 1 | Exchange 1 is Maya's domain anyway (problem discovery) | **Selected** |
| B: Background scan via shell script | Inline handler kicks off `rg` in background; results land in temp file | True concurrency; Alex could contribute earlier | New executable file; runtime dependency on `rg`; file-based coordination protocol | No existing pattern | Eliminated |
| C: Move scan to inline handler | `isdlc.md` runs scan before dispatch; passes results in prompt | True concurrency; no background process | Moves codebase analysis responsibility into CLI handler; handler gains domain knowledge it shouldn't have | Violates separation of concerns | Eliminated |

### Decision 3: How to Avoid Duplicate Issue Fetch

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Pass pre-fetched data to add handler | Analyze handler fetches issue once; passes result to `add` handler as optional input | No duplicate fetch; `add` retains ownership; clean interface extension | Small change to `add` handler's accepted inputs | Follows existing pattern of handlers accepting optional context | **Selected** |
| B: Extract shared fetch subroutine | Create a named section both handlers reference | DRY; single fetch logic | Prompt "subroutines" are fragile; LLM may not follow cross-references reliably | No existing pattern for prompt-level subroutines | Eliminated |
| C: Cache fetch result in temp file | Write `gh issue view` result to disk; `add` reads from disk | No interface change to `add` | File-based coordination; cleanup needed; over-engineered | No existing pattern | Eliminated |

### Decision 4: How to Pass Context to Roundtable

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: New dispatch prompt fields (PERSONA_CONTEXT, TOPIC_CONTEXT) | Add structured fields to the dispatch prompt containing pre-read file content | Clear contract; roundtable can parse reliably; backward compatible via fallback | Increases dispatch prompt size by ~1100 lines | Follows existing dispatch field pattern (SLUG, META_CONTEXT, etc.) | **Selected** |
| B: Loose inline embedding | Append persona/topic content to DRAFT_CONTENT or META_CONTEXT | No new fields | Ambiguous parsing; roundtable can't distinguish draft from persona content | Violates existing field separation convention | Eliminated |

## 2. Selected Architecture (ADRs)

### ADR-001: Dependency Group Execution Model

- **Status**: Accepted
- **Context**: The analyze handler's pre-dispatch pipeline executes ~45 tool calls serially. Most have no inter-dependencies. The LLM can issue independent tool calls in parallel when instructed to do so.
- **Decision**: Restructure the analyze handler from sequential numbered steps to named dependency groups. Each group contains operations that can fire simultaneously. Groups execute in order (Group 1 before Group 2 before Dispatch).
- **Rationale**: This makes parallelism explicit and unambiguous. The LLM interprets numbered lists as sequential; named groups with "fire in parallel" language produce concurrent tool calls. This pattern already exists in the roundtable-analyst's finalization batch protocol.
- **Consequences**: The analyze handler section of `isdlc.md` is rewritten. The logical steps are the same; the execution model changes from serial to parallel-where-possible.

### ADR-002: Deferred Codebase Scan

- **Status**: Accepted
- **Context**: The roundtable's codebase scan (18-20 tool calls, ~40s) blocks Maya's first message. The scan results are used by Alex, not Maya. Maya's opening is driven by draft content.
- **Decision**: Defer the codebase scan to after the first user exchange. Maya speaks from draft knowledge alone. The scan runs when the roundtable processes the user's first reply. Alex contributes from exchange 2 onward.
- **Rationale**: Simplest approach with no new files, no background processes, and no coordination protocol. Exchange 1 is problem discovery, which is Maya's primary domain. Alex's codebase evidence is most valuable from exchange 2 onward when technical topics emerge.
- **Consequences**: Alex is absent from exchange 1. The roundtable-analyst's Section 2.1 step 3 changes from "before first exchange" to "after first exchange." The "Exception" clause at line 298 is removed.

### ADR-003: Pre-Fetched Issue Data Passthrough

- **Status**: Accepted
- **Context**: The current flow fetches `gh issue view` twice -- once during `resolveItem` (or its equivalent) and once inside the `add` handler. For external refs, the analyze handler needs the issue data early (Group 1) and the `add` handler needs it later (Group 2).
- **Decision**: The analyze handler fetches issue data once in Group 1 and passes it to the `add` handler as optional pre-fetched input. The `add` handler checks: if pre-fetched data is provided, use it; otherwise fetch as today.
- **Rationale**: Eliminates the duplicate fetch without duplicating `add` handler logic. The `add` handler remains the sole owner of folder creation. The interface extension is minimal and backward compatible.
- **Consequences**: The `add` handler's instructions gain a conditional: "If pre-fetched issue data is provided (title, labels, body), use it instead of fetching." The analyze handler's Group 1 includes the issue fetch; Group 2 passes the result to `add`.

### ADR-004: Structured Dispatch Prompt Extension

- **Status**: Accepted
- **Context**: The roundtable-analyst currently reads 3 persona files and 6 topic files at startup (~10s). These are static files that don't change between sessions.
- **Decision**: The analyze handler pre-reads persona and topic files in Group 1/2 and includes their content in the dispatch prompt as `PERSONA_CONTEXT` and `TOPIC_CONTEXT` fields. The roundtable-analyst checks for these fields and skips file reads when present.
- **Rationale**: Moves the file reads into the parallel pipeline where they overlap with other Group 1 operations. The roundtable starts with full context immediately. Backward compatible: when fields are absent, the roundtable falls back to reading files.
- **Consequences**: Dispatch prompt grows by ~1100 lines. The roundtable-analyst's startup logic gains a conditional check for inlined context. The fallback path (existing behavior) is preserved.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| (none) | -- | No new technologies introduced. Changes are prompt-only restructuring of existing `.md` files. | Background scanner script (rejected: unnecessary complexity) |

## 4. Integration Architecture

### Integration Points

| ID | Source | Target | Interface | Data Format | Error Handling |
|----|--------|--------|-----------|-------------|----------------|
| IP-001 | `isdlc.md` analyze handler | `isdlc.md` add handler | Inline invocation with optional pre-fetched data | Title (string), labels (array), body (string) | `add` handler validates; fail-fast on invalid data |
| IP-002 | `isdlc.md` analyze handler | `roundtable-analyst.md` | Task tool dispatch prompt | Text prompt with structured fields (SLUG, META_CONTEXT, DRAFT_CONTENT, PERSONA_CONTEXT, TOPIC_CONTEXT, SIZING_INFO) | Roundtable falls back to file reads if fields missing |
| IP-003 | `roundtable-analyst.md` | `docs/requirements/{slug}/` | File system (Write tool) | Markdown artifacts, JSON artifacts | Standard write error handling |

### Data Flow

```
User input ("#42")
  |
  v
isdlc.md analyze handler
  |
  +-- Group 1 (parallel) ----+
  |   gh issue view 42       |
  |   Grep GH-42 in meta     |
  |   Glob REQ-* folders     |
  |   Read 3 persona files   |
  |   Glob topic paths       |
  +---------------------------+
  |
  v
  +-- Group 2 (parallel, needs Group 1) --+
  |   add handler (pre-fetched data)      |
  |   Read 6 topic files                  |
  +-----------------------------------------+
  |
  v
  Dispatch to roundtable-analyst
  (PERSONA_CONTEXT + TOPIC_CONTEXT + DRAFT_CONTENT + META_CONTEXT inlined)
  |
  v
  Maya speaks (exchange 1, from draft knowledge)
  |
  v [user responds]
  |
  Codebase scan runs (exchange 2 processing)
  |
  v
  Alex + Maya contribute (exchange 2 onward)
```

### Synchronization Model

- Group 1 operations are fully independent -- no shared state, no ordering constraints
- Group 2 depends on Group 1 results (issue data for `add`, topic paths for reads)
- Dispatch depends on Group 2 (needs folder created, topic content read)
- Codebase scan is independent of conversation -- runs during exchange 2 processing, results consumed by Alex
- No concurrency conflicts: each operation reads/writes distinct files

## 5. Summary

### Key Decisions

| Decision | Choice | Key Trade-off |
|----------|--------|---------------|
| Parallelism expression | Dependency group notation | Clarity over minimal rewrite |
| Scan timing | Deferred to after exchange 1 | Simplicity over Alex contributing early |
| Duplicate fetch | Pre-fetched data passthrough | Clean interface over no interface change |
| Context delivery | Structured dispatch fields | Explicit contract over minimal prompt change |

### Trade-offs

- **Latency vs. conversation completeness**: Alex absent from exchange 1. Acceptable because exchange 1 is problem discovery (Maya's domain).
- **Prompt size vs. startup speed**: ~1100 lines added to dispatch prompt. Acceptable because it eliminates ~10s of file reads.
- **Interface change vs. code duplication**: Small change to `add` handler's accepted inputs. Acceptable because it prevents duplicating `add`'s folder creation logic.
