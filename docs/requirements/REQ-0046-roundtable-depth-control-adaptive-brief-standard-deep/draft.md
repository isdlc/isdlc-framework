# Roundtable depth control — adaptive brief/standard/deep analysis

**Source**: GitHub #100
**Labels**: enhancement, hackability

## Context

Part of the [Hackability & Extensibility Roadmap](docs/isdlc/hackability-roadmap.md) — Tier 1 (Foundation), Layer 1 (Configure).

## Problem

The roundtable analysis has one depth: thorough. Simple tasks get 8 rounds of probing questions. Developers working on straightforward changes find this excessive.

## Design

Three depth levels:

- **brief**: 1-2 questions per topic, accept user framing, skip probing
- **standard**: current behavior (3-5 questions per topic, probe edge cases)
- **deep**: exhaustive (6+ questions per topic, challenge every assumption)

Infrastructure already exists — topic files have `depth_guidance` with all three levels. What's missing: depth selection isn't wired to the roundtable agent behavior.

Changes:
1. Wire `--light` flag to set `active_workflow.flags.analysis_depth = "brief"`
2. Roundtable analyst reads `flags.analysis_depth` and adjusts question count and probing behavior
3. Natural language detection:
   - "quick", "simple", "just", "straightforward" → suggest brief
   - Default → standard
   - "thorough", "careful", "complex", "critical" → suggest deep

## Invisible UX

Developer says "quick build — just add a config flag" → framework detects lightweight signal → roundtable runs with brief depth automatically.

## Files to change

- `src/claude/agents/roundtable-analyst.md` — read depth flag, adjust behavior
- `ANTIGRAVITY.md` + template — add depth detection to intent processing

## Effort

Low — wiring existing infrastructure, no new scripts.
