# Architecture Overview: REQ-0065 — Inline Roundtable Analysis

---

## 1. Architecture Options

### Option A: Inline Execution with Protocol File Read (Selected)

**Summary**: The isdlc.md handler reads `roundtable-analyst.md` and `bug-gather-analyst.md` at analysis start, then executes their conversation protocols inline. Session cache provides all persona, topic, and constitution content.

| Aspect | Assessment |
|--------|------------|
| Pros | Eliminates subagent spawn (~30-60s), eliminates dispatch prompt re-serialization (~20-40s), eliminates relay loop per exchange, uses existing session cache |
| Cons | Larger isdlc.md handler responsibility, protocol file read adds ~2s |
| Pattern alignment | Follows the existing inline pattern used by `add` and `analyze` steps 1-6.5 |
| Verdict | **Selected** |

### Option B: Optimized Subagent with Minimal Dispatch

**Summary**: Keep the Task tool subagent but drastically reduce the dispatch prompt — send only slug, meta, and draft content. The subagent reads persona/topic from its own session cache.

| Aspect | Assessment |
|--------|------------|
| Pros | Smaller change to isdlc.md, subagent isolation preserved |
| Cons | Subagent spawn overhead remains (~30-60s), relay loop overhead remains, subagents may not inherit session cache content |
| Pattern alignment | Maintains current architecture but with reduced payload |
| Verdict | **Eliminated** — spawn overhead alone is 30-60s, which exceeds the 15s target |

## 2. Selected Architecture

### ADR-001: Inline Roundtable and Bug-Gather Execution

- **Status**: Accepted
- **Context**: The Task tool subagent pattern was chosen when context windows were 200K to protect against context exhaustion. With 1M context, a typical analysis session uses <20K tokens of conversation — context protection is unnecessary. The subagent pattern adds 3+ minutes of overhead (spawn, dispatch re-serialization, relay loop).
- **Decision**: Execute roundtable and bug-gather conversation protocols inline in the isdlc.md handler. Read protocol files once at analysis start. Use session cache for persona/topic/constitution content.
- **Rationale**: Option B (optimized subagent) was eliminated because spawn overhead alone exceeds the 15s latency target. Inline execution eliminates all three overhead sources simultaneously.
- **Consequences**: `roundtable-analyst.md` and `bug-gather-analyst.md` become protocol reference documents. The isdlc.md handler takes on conversation management responsibility. Agent Teams mode path in `roundtable-analyst.md` remains reachable only via direct agent spawn (not through analyze flow).

## 3. Technology Decisions

No new dependencies. No new tools. The change is purely structural — rewriting dispatch patterns in `isdlc.md`.

## 4. Integration Architecture

### Data Flow (After Change)

```
User invokes analyze
    → isdlc.md handler (steps 1-6.5: fetch, add, classify) [unchanged]
    → Read roundtable-analyst.md (once, ~2s)
    → Follow protocol inline using:
        - In-memory: slug, meta, draftContent, discoveryContent, memoryContextBlock
        - Session cache: personas, topics, constitution, workflow config
    → Direct conversation turns (no relay loop)
    → Artifact batch write
    → meta.json update, BACKLOG.md sync, GitHub label sync [unchanged]
```

### Removed Integration Points

| Removed | Was | Replacement |
|---------|-----|-------------|
| Task tool dispatch (roundtable) | Step 7a | Read protocol file + inline execution |
| Relay-and-resume loop (roundtable) | Step 7b | Direct conversation turns |
| ROUNDTABLE_COMPLETE signal | Step 7b | In-memory confirmationState = COMPLETE |
| Task tool dispatch (bug-gather) | Step 6.5c | Read protocol file + inline execution |
| Relay-and-resume loop (bug-gather) | Step 6.5d | Direct conversation turns |
| BUG_GATHER_COMPLETE signal | Step 6.5d | Direct flow to step 6.5e |
| SESSION_RECORD parsing | Step 7.5a | Handler constructs record from in-memory state |

## 5. Summary

| Metric | Value |
|--------|-------|
| Files modified | 3 (isdlc.md, roundtable-analyst.md, bug-gather-analyst.md) |
| New files | 0 |
| Deleted files | 0 |
| New dependencies | 0 |
| Risk level | Low — protocol logic unchanged, only execution mode changes |
