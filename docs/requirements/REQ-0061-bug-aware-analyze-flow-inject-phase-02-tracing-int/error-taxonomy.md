# Error Taxonomy: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## Error Codes

| Code | Description | Trigger Condition | Severity | Recovery Action |
|------|-------------|-------------------|----------|-----------------|
| ERR-BGA-001 | Bug classification ambiguous | LLM cannot determine bug vs feature from description | Warning | Ask user directly: "I'm not sure if this is a bug or a feature. Which analysis flow should I use?" |
| ERR-BGA-002 | Codebase scan returns no results | No keyword hits in codebase for bug description terms | Warning | Agent reports: "Could not find related code. Can you point me to the area of the codebase where this bug occurs?" |
| ERR-BGA-003 | Issue description too vague | Description lacks symptoms, error messages, or reproduction steps | Warning | Agent asks user for more detail: "The bug description is sparse. Can you describe what you're seeing?" |
| ERR-BGA-004 | Artifact write failure | Disk error writing bug-report.md or requirements-spec.md | Error | Report error to user; retry once; if persistent, fall back to roundtable |
| ERR-BGA-005 | Fix handoff fails | Fix handler cannot resolve item or create workflow | Error | Report error; artifacts are preserved; user can retry with `/isdlc fix {slug}` manually |
| ERR-BGA-006 | Tracing orchestrator rejects artifacts | bug-report.md missing required sections | Error | Should not occur if artifact format is correct; if it does, log error and report to user |
| ERR-BGA-007 | computeStartPhase fails to detect Phase 01 | meta.json phases_completed not updated by bug-gather agent | Error | Bug-gather agent must update meta.json before handoff; if missed, fix handler starts from Phase 01 (redundant but safe) |

---

## Error Propagation Strategy

| Boundary | Strategy | Rationale |
|----------|----------|-----------|
| Bug classification -> user | Ask user directly | Classification errors are best resolved by the user who knows the intent |
| Bug-gather agent -> analyze handler | Return error text | Agent returns natural language error; handler displays to user |
| Analyze handler -> fix handler | Standard invocation | Fix handler has its own error handling; no special propagation needed |
| Fix handler -> tracing orchestrator | Phase delegation | Tracing orchestrator validates its own prerequisites; reports errors through standard phase error flow |

---

## Graceful Degradation

| Failure | What Still Works | User Impact |
|---------|-----------------|-------------|
| Bug classification fails | Falls through to roundtable (feature analysis) | User gets roundtable instead of bug-gather; suboptimal but functional |
| Codebase scan fails | Agent can still produce artifacts from issue description alone | Playback lacks code-level detail; user may need to provide more context |
| Artifact production fails | User has the playback information; can manually invoke fix | Artifacts not saved; user must restart or provide info to fix workflow Phase 01 |
| Fix handoff fails | Artifacts are preserved on disk | User can manually invoke `/isdlc fix {slug}` later |
| Tracing fails (T1/T2/T3) | Tracing orchestrator's own retry logic + partial results | Trace analysis may be incomplete; implementation proceeds with available data |
