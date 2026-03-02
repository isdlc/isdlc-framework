# Optimize analyze flow: parallelize and defer to cut first-message latency from ~90s to ~11s

**Source**: GitHub #80
**Type**: Enhancement (Performance)
**Complexity**: Medium

## Problem

When running `/isdlc analyze #N`, the time from user command to Maya's first message is ~90 seconds (3+ minutes with user wait). The flow makes ~45 tool calls across 11 sequential round-trips in the inline handler, then 30 more inside the roundtable-analyst — most of which are serialized unnecessarily.

## Root Cause Analysis

### Inline handler waste (~26s)
- Duplicate `gh issue view`: Fetched once during resolve, again during add
- Wrong folder reads: `resolveItem` reads unrelated meta.json + draft.md before finding no match
- Re-read after write: Reads meta.json immediately after writing it
- Unnecessary AskUserQuestion: Asks "Add to backlog?" for `#N` GitHub refs where intent is unambiguous
- Sequential bookkeeping: BACKLOG.md read + edit blocks the dispatch

### Roundtable startup overhead (~60s, 30 tool calls)
- 3 persona file reads (~3s): Static files, same every session
- 7 topic file discovery + reads (~7s): Static files, same every session
- 18-20 silent codebase scan calls (~40s): Grep/Glob keyword searches that block Maya's opening

## Proposed Design: Parallel Pipeline

### Batch 1 — T=0, all independent (7 parallel calls, ~3s)
- gh issue view N
- Grep "GH-N" in docs/requirements/*/meta.json
- ls docs/requirements/REQ-*
- Read 3 persona files
- Glob analysis-topics/**/*.md

### Batch 2 — T=3s, needs batch 1 results (8 parallel calls, ~3s)
- mkdir + Write draft.md + Write meta.json
- Read 6 topic files

### Dispatch — T=6s, all context inlined in prompt
- Maya speaks at T=~11s

### Deferred (while user reads Maya's message)
- BACKLOG.md update
- Codebase scan
- GitHub label sync

## Impact
~86s → ~11s first-message latency (8x improvement)

## Files to Change
- `isdlc.md`: Restructure analyze handler batching, auto-add for GitHub refs, defer BACKLOG.md update
- `roundtable-analyst.md`: Accept inlined persona/topic context, defer codebase scan to after first exchange
