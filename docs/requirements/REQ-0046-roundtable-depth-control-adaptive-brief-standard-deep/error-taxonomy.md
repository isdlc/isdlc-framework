# Error Taxonomy — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: Medium
**Last Updated**: 2026-03-07
**Coverage**: 80%

---

## 1. Error Categories

### E-001: Topic File Parse Failure

**Severity**: Medium
**Trigger**: Restructured `depth_guidance` YAML has invalid syntax or unexpected structure.
**Recovery**: Roundtable falls back to built-in default behavioral descriptions (hardcoded in roundtable-analyst.md instructions). Log warning but do not interrupt conversation.
**Prevention**: Maintain backward-compatible YAML key structure. Validate topic files during build workflow tests.

### E-002: Inference Log Overflow

**Severity**: Low
**Trigger**: Extremely long analysis session produces so many inferences that the context window is stressed.
**Recovery**: Inference tracking is best-effort. If context window pressure forces truncation, older inferences may be summarized. The confirmation sequence aggregates at topic level anyway, so individual entry loss is tolerable.
**Prevention**: Depth sensing naturally limits inference volume -- brief topics produce fewer inferences. The roundtable's own steering toward completion prevents unbounded sessions.

### E-003: Scope Recommendation Conflict

**Severity**: Low
**Trigger**: Roundtable's recommended_scope conflicts with existing sizing_decision in meta.json (e.g., --light set sizing to "light" but roundtable recommends "standard").
**Recovery**: Roundtable's recommendation takes precedence for downstream scope. Existing sizing_decision is preserved for audit trail. User is asked to confirm the recommendation explicitly.
**Prevention**: Deprecation notice informs user that --light is a suggestion only.

### E-004: Missing Inference Log at Confirmation

**Severity**: Low
**Trigger**: Confirmation sequence starts but inference log has no entries (all topics fully covered by user input).
**Recovery**: Omit the "Assumptions and Inferences" section entirely from summaries. No assumptions to show is a good outcome.
**Prevention**: N/A -- this is a valid and desirable state.

### E-005: Depth Guidance Not Found for Topic

**Severity**: Low
**Trigger**: A topic file is missing or has no `depth_guidance` block.
**Recovery**: Roundtable uses standard depth behavior as default (probe with follow-ups, validate assumptions). The depth sensing still works -- it just lacks topic-specific calibration for that topic.
**Prevention**: All 6 existing topic files have depth_guidance. New topic files should include it as part of the topic file template.

### E-006: --light Flag Used After Full Deprecation

**Severity**: Low
**Trigger**: User passes `--light` after the flag has been removed in a future release.
**Recovery**: Flag is ignored. Roundtable operates normally with dynamic depth sensing and scope recommendation.
**Prevention**: Deprecation notice during transition period warns users. Documentation updated.

---

## 2. Graceful Degradation Strategy

All errors in this feature are recoverable because:

1. **Depth sensing is LLM behavior** -- it cannot "crash". It can only be less optimal. The worst case is the roundtable defaults to standard depth for all topics, which is the current behavior.
2. **Inference tracking is best-effort** -- missing inferences mean the confirmation shows fewer assumptions, which is conservative (not dangerous). The user sees less, not incorrect information.
3. **Scope recommendation is user-confirmed** -- even a wrong recommendation is caught by the explicit "Agreed?" step. The user always has final say.

The feature follows a **fail-to-current-behavior** pattern: any failure mode degrades to today's roundtable behavior (standard depth, no assumptions section, no scope recommendation).
