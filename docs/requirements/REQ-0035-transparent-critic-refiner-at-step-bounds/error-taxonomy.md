# Error Taxonomy: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## Error Codes

| Code | Description | Trigger Condition | Severity | Recovery Action |
|------|-------------|------------------|----------|-----------------|
| CONF-001 | Artifact not found for summary generation | Detailed artifact file missing from disk when confirmation sequence attempts to read it | Warning | Skip the domain's summary. Present only summaries for artifacts that exist. Log which artifact was missing. |
| CONF-002 | Ambiguous user response | User response does not clearly indicate Accept or Amend | Info | Treat as Amend (conservative). Enter amendment conversation where the user can clarify their intent. |
| CONF-003 | Summary persistence failure | File write fails when persisting summary artifacts to disk | Warning | Log the error. Analysis still completes -- summaries are Should Have, not Must Have. Acceptance state in meta.json is still recorded. |
| CONF-004 | Meta.json write failure | Cannot update meta.json with acceptance field | Warning | Log the error. Analysis still completes. Acceptance state is lost but detailed artifacts are intact. |
| CONF-005 | Tier information unavailable | `SIZING_INFO` or `meta.sizing_decision` not set when confirmation sequence needs to determine which domains to present | Info | Default to standard tier behavior (present all domains that have artifacts). |
| CONF-006 | Empty artifact content | Artifact file exists but contains no meaningful content (empty or header-only) | Warning | Skip the domain's summary. Note in the confirmation output that the domain had no substantive content. |

## Error Propagation Strategy

All errors in the confirmation sequence use **log-and-continue**. The confirmation sequence is a quality-of-experience feature, not a correctness gate. If any part fails, the analysis should still complete with whatever summaries could be generated.

### Graceful Degradation Levels

| Level | Condition | What Still Works |
|-------|-----------|-----------------|
| Full | All artifacts readable, all summaries generated | Complete confirmation sequence with Accept/Amend |
| Partial | Some artifacts missing | Confirmation runs for available domains only; missing domains skipped with note |
| Minimal | No artifacts readable | Confirmation sequence skipped entirely; analysis completes as today (metadata summary only) |
| Persistence failure | Summaries generated but cannot be written to disk | User still sees and accepts summaries in conversation; they just aren't persisted for future revisit |

## Validation Rules

### Summary Generation Validation

Before presenting a summary to the user:
1. Verify the source artifact file exists and is non-empty
2. Verify at least one meaningful section was extracted (not just headers)
3. If validation fails: skip this domain with CONF-001 or CONF-006

### User Response Validation

When parsing the user's response:
1. Check against Accept indicators first (more specific)
2. Check against Amend indicators second
3. If neither matches: default to Amend (CONF-002)
4. Never auto-accept on ambiguous input

### Persistence Validation

Before writing summary artifacts:
1. Verify the artifact folder exists (create if missing)
2. Write each summary file independently (one failure does not block others)
3. If any write fails: log CONF-003, continue with remaining files
