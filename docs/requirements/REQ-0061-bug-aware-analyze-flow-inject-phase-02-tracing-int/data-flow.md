# Data Flow: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## End-to-End Data Flow

### Source-to-Sink Trace

```
[Issue Tracker]          [Codebase]           [User]            [Artifact Folder]         [Fix Workflow]
     |                      |                    |                     |                        |
     |--- issue body ------>|                    |                     |                        |
     |--- labels ---------->|                    |                     |                        |
     |                      |                    |                     |                        |
     |     [Analyze Handler: Bug Classification Gate]                  |                        |
     |                      |                    |                     |                        |
     |  classification + reasoning ------------->|                     |                        |
     |                      |                    |                     |                        |
     |                      |            confirm/override              |                        |
     |                      |                    |                     |                        |
     |     [Bug-Gather Agent]                    |                     |                        |
     |                      |                    |                     |                        |
     |  description ------->| codebase scan      |                     |                        |
     |                      |--- file matches -->|                     |                        |
     |                      |                    |                     |                        |
     |  structured playback |------------------->|                     |                        |
     |                      |                    |                     |                        |
     |                      |           additional context             |                        |
     |                      |                    |                     |                        |
     |                      |           "done"   |                     |                        |
     |                      |                    |                     |                        |
     |                      |  bug-report.md ----|-------------------->|                        |
     |                      |  requirements-spec.md ----------------->|                        |
     |                      |  meta.json update ---------------------->|                        |
     |                      |                    |                     |                        |
     |  "Should I fix it?" -|------------------->|                     |                        |
     |                      |                    |                     |                        |
     |                      |           "yes"    |                     |                        |
     |                      |                    |                     |                        |
     |     [Fix Workflow via Phase-Loop Controller]                    |                        |
     |                      |                    |                     |                        |
     |                      |  computeStartPhase |------ reads ------>|                        |
     |                      |  (detects Phase 01 done, starts Phase 02)                        |
     |                      |                    |                     |                        |
     |     [Tracing Orchestrator T0]             |                     |                        |
     |                      |                    |                     |                        |
     |                      |  reads bug-report.md <------------------|                        |
     |                      |  T1/T2/T3 parallel |                     |                        |
     |                      |  trace-analysis.md |------------------->|                        |
     |                      |                    |                     |                        |
     |     [Phase 05-08: Test -> Implement -> Quality -> Review]       |                        |
     |                      |  live progress --->|                     |                        |
```

---

## State Mutations

| Stage | What Changes | Readers |
|-------|-------------|---------|
| Bug classification | None (stateless) | Analyze handler |
| Bug-gather: codebase scan | None (read-only scan) | Bug-gather agent |
| Bug-gather: artifact production | Writes bug-report.md, requirements-spec.md | Tracing orchestrator, computeStartPhase |
| Bug-gather: meta.json update | Updates phases_completed to include Phase 01 indicators | Fix handler (computeStartPhase) |
| Fix handoff | Creates workflow in state.json, creates branch | Phase-Loop Controller, all phase agents |
| Tracing (Phase 02) | Writes trace-analysis.md, updates state.json | Phase 05 (test strategy) |
| Phases 05-08 | Various artifacts and state.json updates | Each subsequent phase |

---

## Data Transformations

| Stage | Input | Transformation | Output |
|-------|-------|---------------|--------|
| Issue fetch | GitHub API / Jira API | Extract title, body, labels | Issue description + metadata |
| Bug classification | Issue description + labels | LLM inference: classify as bug or feature | Classification + reasoning string |
| Codebase scan | Keywords from description | Grep/Glob search | List of affected files + code snippets |
| Playback generation | Bug context + affected files | Structure into readable summary | Formatted playback text |
| Artifact production | Bug context + user additions | Format into bug-report.md template | Markdown artifact file |
| Lightweight requirements | Bug context | Single FR with ACs | requirements-spec.md |
| computeStartPhase | meta.json phases_completed | Phase detection logic | Start phase = "02-tracing" |

---

## Persistence Boundaries

| Data | Stored? | Location | Lifetime |
|------|---------|----------|----------|
| Issue description | Yes | draft.md (via add handler) | Permanent |
| Bug classification | No | In-memory during handler execution | Transient |
| Codebase scan results | No | In-memory during bug-gather agent | Transient |
| Bug report | Yes | bug-report.md in artifact folder | Permanent |
| Requirements spec | Yes | requirements-spec.md in artifact folder | Permanent |
| Meta.json updates | Yes | meta.json in artifact folder | Permanent |
| Trace analysis | Yes | trace-analysis.md in artifact folder | Permanent (written by Phase 02) |

---

## Concurrency Considerations

- **Bug-gather agent**: Single-threaded conversation with user. No concurrency concerns.
- **Tracing (Phase 02)**: T1/T2/T3 run in parallel (existing behavior). No shared mutable state between sub-agents.
- **Fix workflow phases**: Sequential (Phase-Loop Controller). No concurrency between phases.
- **Artifact writes**: Sequential within bug-gather agent (bug-report.md then requirements-spec.md). No race conditions.
