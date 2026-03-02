# Data Flow: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## 1. End-to-End Data Flow

### Source: Detailed Artifacts on Disk

The confirmation sequence reads from artifacts that were progressively written during the roundtable conversation:

```
docs/requirements/{slug}/
  requirements-spec.md     --> Requirements summary generation
  user-stories.json        --> Requirements summary generation
  architecture-overview.md --> Architecture summary generation
  module-design.md         --> Design summary generation
  interface-spec.md        --> Design summary generation
  data-flow.md             --> Design summary generation
```

### Processing: Summary Generation

```
[Detailed Artifact Files]
        |
        v
[Read artifact content from disk]
        |
        v
[Extract key content per domain]
        |
        |-- Requirements: FRs (ID, title, priority, confidence), problem statement, user types, key ACs
        |-- Architecture: Decisions (chosen option, rationale, rejected options), integration points
        |-- Design: Module table (name, responsibility), data flow narrative, sequence description
        |
        v
[Compose conversational summary with persona voice]
        |
        v
[Cache in confirmationState.summaryCache]
        |
        v
[Present via RETURN-FOR-INPUT]
```

### Sink: User Decision + Persistence

```
[User Response]
        |
        v
[Parse intent: Accept or Amend]
        |
        +-- Accept:
        |       |
        |       v
        |   [Record domain in acceptedDomains]
        |       |
        |       +-- More domains? --> [Generate next summary] --> [Present]
        |       |
        |       +-- All done? --> [Persist summaries to disk]
        |                               |
        |                               v
        |                         [Write requirements-summary.md]
        |                         [Write architecture-summary.md]  (if applicable)
        |                         [Write design-summary.md]        (if applicable)
        |                               |
        |                               v
        |                         [Update meta.json with acceptance field]
        |                               |
        |                               v
        |                         [Emit ROUNDTABLE_COMPLETE]
        |
        +-- Amend:
                |
                v
            [Clear acceptedDomains]
            [Clear summaryCache]
                |
                v
            [Re-enter roundtable conversation with all 3 personas]
                |
                v
            [User discusses changes]
                |
                v
            [Artifacts updated progressively by personas]
                |
                v
            [User signals amendment complete]
                |
                v
            [Restart confirmation from requirements]
            [Regenerate all summaries from updated artifacts]
```

## 2. State Mutation Points

| Mutation Point | What Changes | Readers |
|----------------|-------------|---------|
| Summary generation | `confirmationState.summaryCache[domain]` populated | `presentSummary()` |
| Accept response | `confirmationState.acceptedDomains` appended | State machine transition logic |
| Amend response | `confirmationState.acceptedDomains` cleared, `summaryCache` cleared, `amendmentCount` incremented | State machine, `enterAmendmentConversation()` |
| Amendment conversation | Detailed artifact files on disk updated | `generateSummary()` on restart |
| Finalization - summaries | `{slug}/requirements-summary.md`, `architecture-summary.md`, `design-summary.md` written | Future revisit via `analyze` |
| Finalization - meta.json | `meta.json.acceptance` field written | Future `analyze` runs, `build` (informational only) |

## 3. Data Transformations

### Artifact to Summary Transformation

| Source Data | Transformation | Summary Output |
|-------------|---------------|----------------|
| `requirements-spec.md` Section 1 (Business Context) | Extract problem statement | 1-2 sentence problem description |
| `requirements-spec.md` Section 2 (Stakeholders) | Extract user type names and roles | Bullet list of user types |
| `requirements-spec.md` Section 6 (FRs) | Extract FR ID, title, MoSCoW priority, confidence | FR table |
| `requirements-spec.md` Section 6 (ACs) | Select 3-5 most important ACs | Key ACs in plain language |
| `architecture-overview.md` Section 2 (ADRs) | Extract decision title, chosen option, rationale | Key decisions list |
| `architecture-overview.md` Section 4 (Integration) | Extract integration point descriptions | Integration narrative |
| `module-design.md` | Extract module name and responsibility | Module table |
| `data-flow.md` | Extract source-to-sink flow description | Data flow narrative (inline in summary) |
| `interface-spec.md` | Extract operation sequence | Sequence description (inline in summary) |

### No Lossy Transformations

Summaries are additive references to detailed artifacts. No information is removed from the detailed artifacts. The summary is a view, not a replacement.

## 4. Persistence Boundaries

| Data | Lifecycle | Storage |
|------|-----------|---------|
| `confirmationState` | In-memory, lifetime of confirmation sequence | Agent memory (not persisted) |
| `summaryCache` | In-memory during confirmation, persisted on acceptance | Agent memory -> disk |
| Summary artifact files | Persisted on full acceptance | `docs/requirements/{slug}/` |
| `meta.json.acceptance` | Persisted on full acceptance | `docs/requirements/{slug}/meta.json` |

### Session Boundary

If the roundtable session is interrupted during the confirmation sequence (e.g., timeout, crash), the confirmation state is lost. On re-entry:
- Detailed artifacts are still on disk (they were written during the conversation phase)
- Summaries have not been persisted (acceptance was not completed)
- The roundtable would re-enter from the conversation phase and reach confirmation again

This is consistent with the existing behavior -- the roundtable does not persist mid-conversation state.

## 5. Concurrency Considerations

There are no concurrency concerns in this feature:
- The confirmation sequence is single-threaded within the roundtable agent
- Only one summary is presented at a time
- Only one user response is processed at a time
- Artifact reads happen before presentation; artifact writes happen only during amendment or finalization
- No shared state between the confirmation sequence and external processes
- In Agent Teams mode, the confirmation sequence runs in the lead orchestrator only; teammates are not active during confirmation
