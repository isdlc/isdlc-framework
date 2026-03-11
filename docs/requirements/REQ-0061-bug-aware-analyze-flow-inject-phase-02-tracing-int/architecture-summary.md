# Architecture Summary: Bug-Aware Analyze Flow

**Accepted**: 2026-03-11
**Source**: GH-119

---

## Key Architecture Decisions

| ADR | Decision | Rationale |
|-----|----------|-----------|
| ADR-001 | LLM inference for bug detection (over keyword matching) | Labels can be wrong; LLM reads description content and understands context. User confirmation mitigates non-determinism. |
| ADR-002 | Explicit handoff from analyze to fix (over automatic chaining) | Preserves analyze's non-workflow constraint. Two consent points ensure user controls the flow. |
| ADR-003 | Standalone bug-gather agent (over roundtable mode) | Single responsibility -- bug analysis is fundamentally different from persona-based requirements elicitation. |

## Technology Tradeoffs

- No new dependencies -- all changes are agent markdown + command handler instructions
- Existing infrastructure reused without modification: tracing orchestrator (T0/T1/T2/T3), computeStartPhase (REQ-0026), Phase-Loop Controller, fix workflow phase sequence

## Blast Radius

- Tier 1 (direct): isdlc.md (modify), bug-gather-analyst.md (new) -- 2 files
- Tier 2 (transitive): AGENTS.md (doc update) -- 1 file, all others unchanged
- Tier 3 (side effects): roundtable no longer dispatched for bugs (low risk)
- Total: ~5-6 files including tests

## Risk Assessment

- Overall: Medium risk, Go recommendation
- Key risk: artifact compatibility between bug-gather output and tracing orchestrator input (mitigated by following existing format)

## Detailed Artifacts

- architecture-overview.md
- impact-analysis.md
- quick-scan.md
