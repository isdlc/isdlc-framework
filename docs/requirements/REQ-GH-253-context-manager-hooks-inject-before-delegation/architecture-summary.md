# Architecture Summary: REQ-GH-253

**Selected**: Hybrid state-machine-driven composition + bucketed audit. Rejected additive injection (diminishing returns per BUG-0028) and pure simplification (insufficient alone).

**Key decisions**: JSON state machine definitions in src/isdlc/config/roundtable/; core + workflow-specific split (validated by comparing roundtable-analyst.md and bug-roundtable-analyst.md); REQ-0022 skill manifest reused at sub-task granularity with additive bindings.sub_tasks[] field; user-configurable max_skills_total (default 8); rule-based marker extractors (regex + key phrases, no LLM); external delegation expressed declaratively in workflow definitions.

**Integration**: state-card-composer and task-card-composer consume template-loader (existing), skill manifest (existing), compliance engine (existing). Providers receive composed card strings via existing injection mechanisms. Phase-loop controller unchanged per FR-006 boundary.

**Risks mitigated**: parallel-run comparison before cutover (FR-008); fail-open to prose protocol (Article X); audit defaults to keep on inconclusive (AC-007-03).
