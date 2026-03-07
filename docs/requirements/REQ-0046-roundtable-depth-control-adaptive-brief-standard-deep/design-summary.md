# Design Summary — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## Overview

This feature transforms the roundtable analysis from fixed-depth probing to dynamically adaptive depth that responds to user engagement signals in real time. It adds assumption transparency during confirmation and produces a scope recommendation as an analysis output, replacing the `--light` flag as an input mechanism.

## Key Design Decisions

1. **LLM-judged depth over rule-based detection**: The roundtable reads conversational cues (answer length, engagement, tone) rather than matching signal word lists. This leverages the LLM's core strength and produces natural, invisible adaptation.

2. **Inference tracking as internal protocol**: Assumptions are tracked in the LLM's context during conversation and aggregated at confirmation time. No new runtime data structures or files during analysis -- only summary files at the end.

3. **Tiered assumption views**: Topic-level by default (concise), FR-level on demand (detailed). Keeps confirmation lightweight while providing full transparency when the user wants it.

4. **Scope as output, not input**: The roundtable assesses complexity during conversation and recommends scope (trivial/light/standard/epic) to the user. Replaces upfront `--light` flag with a conversational recommendation.

## Modules

| Module | Location | Purpose |
|--------|----------|---------|
| M1: Depth Sensing | roundtable-analyst.md | Dynamic per-topic depth calibration |
| M2: Inference Tracker | roundtable-analyst.md | Log assumptions made during acceleration |
| M3: Assumption Views | roundtable-analyst.md | Tiered confirmation presentation |
| M4: Scope Recommender | roundtable-analyst.md | Produce scope recommendation for meta.json |
| M5: Topic Calibration | 6 topic files | Behavioral depth descriptions |
| M6: Flag Deprecation | isdlc.md, ANTIGRAVITY.md | --light transition and deprecation |

## Implementation Sequence

1. Topic file restructuring (M5) -- foundation
2. Depth sensing instructions (M1) -- core feature
3. Inference tracking (M2) -- enables assumption views
4. Tiered confirmation views (M3) -- user-facing assumption transparency
5. Scope recommendation (M4) -- can parallel with 3-4
6. Flag deprecation (M6) -- last, depends on scope recommendation

## Risk Mitigation

- All failure modes degrade to current behavior (standard depth, no assumptions section)
- User confirmation of scope prevents incorrect phase skipping
- Topic file calibration descriptions provide consistency guardrails
- Future memory layer (GH-113) will add cross-session learning
