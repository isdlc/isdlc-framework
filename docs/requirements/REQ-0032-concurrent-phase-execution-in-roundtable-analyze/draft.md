# Concurrent phase execution in roundtable analyze flow

**Source**: GitHub #63
**Type**: REQ (Feature)
**Added**: 2026-02-21

## Summary

The roundtable analyze flow currently runs phases 00-04 sequentially. The three personas (Maya/Alex/Jordan) are all present during each step but only the lead persona's phase produces artifacts. Alex and Jordan's cross-talk during Phase 01 requirements is commentary only — they aren't writing their own phase artifacts in parallel.

## Desired Behavior

When Maya leads Phase 01 requirements, Alex and Jordan should start writing Phase 02/03/04 artifacts progressively based on what's being discussed. As requirements evolve through the conversation, the architecture and design docs evolve too. By the time Phase 01 completes, Phases 02-04 should be 80-90% complete.

## Current vs Proposed

**Current (sequential):**
```
Maya (00) → Maya (01) → Alex (02) → Alex (03) → Jordan (04)
```

**Proposed (concurrent):**
```
Maya (00) → Maya leads (01) ──────────────────→ finalize
             ├─ Alex starts (02) in parallel ──→ refine
             ├─ Alex starts (03) in parallel ──→ refine
             └─ Jordan starts (04) in parallel ─→ refine
```

## Impact

- Changes the phase loop in isdlc.md from sequential delegation to a single long-running session
- Roundtable agent needs to manage concurrent artifact production across phases
- Significant speed improvement for the analyze workflow
