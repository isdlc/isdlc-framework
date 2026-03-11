# Design Summary: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## Executive Summary

This design introduces a bug-aware path in the analyze handler that replaces the roundtable with a lightweight gather-confirm-handoff flow when the subject is a bug. The system uses LLM inference from the issue description to detect bugs (confirmed by the user), then a new bug-gather agent reads the ticket, scans the codebase, and plays back its understanding. After user confirmation, it produces artifacts compatible with the tracing orchestrator and asks "Should I fix it?" On confirmation, the fix workflow launches from Phase 02 (tracing) through code review, running autonomously with live progress.

**Key principle**: Maximize reuse. The tracing orchestrator (T0/T1/T2/T3), fix workflow auto-detection (REQ-0026), and Phase-Loop Controller all work unchanged. Only the analyze handler routing and a new bug-gather agent are added.

---

## Cross-Check Results

| Check | Result |
|-------|--------|
| FRs in impact-analysis.md match requirements-spec.md | Pass -- FR-001 through FR-006 referenced consistently |
| Integration points in architecture match interface-spec.md | Pass -- INT-001 through INT-004 align with architecture data flow |
| Module boundaries align with architecture decisions | Pass -- 3 modules (classification gate, bug-gather agent, fix handoff) match 3 ADRs |
| Confidence indicators consistent across artifacts | Pass -- all High except FR-006 (Medium, existing infrastructure) |
| Artifact formats compatible with tracing orchestrator | Pass -- bug-report.md format matches tracing-orchestrator.md expectations |

---

## Open Questions

None. All design questions resolved during analysis conversation:
1. Roundtable vs. bug-specific flow: Resolved -- no roundtable for bugs
2. Bug detection mechanism: Resolved -- LLM inference + user confirmation
3. Analyze/fix boundary: Resolved -- explicit handoff with "Should I fix it?"
4. Live progress: Resolved -- existing Phase-Loop Controller behavior satisfies requirement

---

## Implementation Readiness

| Criterion | Status |
|-----------|--------|
| All FRs have testable ACs | Yes |
| Module boundaries defined | Yes (3 modules) |
| Interface contracts specified | Yes (4 interfaces) |
| Error handling designed | Yes (7 error codes + degradation levels) |
| Data flow documented | Yes (source-to-sink trace) |
| No circular dependencies | Yes (linear: classification -> gather -> handoff -> fix) |

**Assessment**: Ready for implementation. A developer can build this from these specifications without further clarification.
