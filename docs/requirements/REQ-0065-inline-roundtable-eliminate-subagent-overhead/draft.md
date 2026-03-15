# Inline roundtable analysis — eliminate subagent dispatch overhead

**Source**: GitHub Issue #124
**Labels**: performance, 1m context window adoption

---

## Problem

The analyze phase takes 3+ minutes before the first question appears on screen. The bottleneck is spawning the `roundtable-analyst` as a separate subagent via the Task tool:

1. **Subagent spawn overhead** (~30-60s) — Task tool creates a subprocess with fresh context initialization
2. **Massive dispatch prompt** (~20-40s processing) — The dispatch re-serializes ~30K tokens of persona, topic, discovery, and memory content that is already present in the session cache via `ROUNDTABLE_CONTEXT`
3. **Relay-and-resume loop** — Every exchange requires Task resume + verbatim relay, adding latency per turn

## Proposal

With the 1M context window, the original reason for the subagent (context window protection) no longer applies. Run the roundtable conversation protocol inline in the main `isdlc.md` handler thread.

### What changes

- `isdlc.md` step 7a-7b: replace Task tool dispatch + relay loop with inline roundtable conversation protocol
- `roundtable-analyst.md`: becomes a protocol reference doc rather than a spawned agent
- Bug-gather relay loop (step 6.5d) could get the same treatment

### Key considerations

- The `roundtable-analyst.md` contains ~500 lines of conversation protocol (topic coverage, confirmation state machine, artifact batching). This logic needs to be accessible inline — either by folding key parts into `isdlc.md` or having the handler read it as a protocol reference.
- Session cache already carries ROUNDTABLE_CONTEXT (personas, topics), CONSTITUTION, WORKFLOW_CONFIG — no need to re-pass any of this.
- Agent Teams mode (opt-in) would need separate handling if it's kept.

### Expected impact

- First question on screen: from ~3 min to ~10-15s
- Per-exchange latency: reduced (no Task resume overhead)
- Total analyze session: ~5-8 min faster end-to-end
