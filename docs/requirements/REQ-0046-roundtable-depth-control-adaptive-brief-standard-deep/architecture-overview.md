# Architecture Overview — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. Architecture Decisions

### ADR-001: LLM-Judged Depth vs Rule-Based Depth

**Context**: The roundtable needs to adapt its probing depth per topic based on user signals.

**Option A: Rule-based signal word detection** (draft approach)
- Pros: Deterministic, repeatable, testable with unit tests
- Cons: Brittle (fixed keyword lists miss nuance), binary (brief or standard, no gradient), can't sense fatigue or engagement shifts mid-conversation
- Alignment: Contradicts the invisible framework principle -- feels mechanical

**Option B: LLM-judged dynamic sensing** (selected)
- Pros: Reads nuance (tone, answer length, engagement level), adapts continuously per topic, matches how humans read conversational cues, zero runtime code
- Cons: Less deterministic across sessions (mitigated by topic file calibration and future memory layer GH-113), harder to test
- Alignment: Consistent with invisible framework principle; leverages LLM's core strength

**Decision**: Option B. The LLM reads user signals and calibrates depth dynamically. Topic file `depth_guidance` provides behavioral calibration (what brief/standard/deep looks like per topic) rather than prescriptive rules. The trade-off of reduced determinism is acceptable because: (1) assumption tracking ensures transparency, (2) confirmation sequence provides a safety net, (3) future memory layer (GH-113) will add cross-session consistency.

### ADR-002: Scope Recommendation as Analysis Output vs Input Flag

**Context**: The `--light` flag currently sets scope (skip architecture/design) before analysis begins. With dynamic depth sensing, scope should emerge from the conversation.

**Option A: Keep --light as input, add depth sensing alongside**
- Pros: No breaking change, backward compatible
- Cons: Two mechanisms for related concerns (flag for scope, LLM for depth), user still needs to know about flags

**Option B: Deprecate --light, scope as roundtable output** (selected)
- Pros: Single mechanism (conversation), invisible to user, scope informed by actual analysis rather than upfront guess
- Cons: Requires transition period, build workflow needs to read recommended_scope from meta.json

**Decision**: Option B with transition period. The `--light` flag is deprecated but continues to function as a "starting suggestion" during transition. The roundtable always produces a `recommended_scope` in meta.json. Build workflow consumes `recommended_scope` in addition to (and eventually instead of) `effective_intensity` from `sizing_decision`.

### ADR-003: Assumption Tracking -- Internal Log vs Artifact Metadata

**Context**: Inferences made during accelerated analysis need to be tracked for surfacing during confirmation.

**Option A: Embed assumptions in artifact metadata headers**
- Pros: Persisted with artifacts, visible in files
- Cons: Clutters artifact headers, assumptions are conversation-specific (not artifact-specific), hard to aggregate across domains for confirmation

**Option B: Internal inference log aggregated at confirmation** (selected)
- Pros: Clean artifacts, assumptions aggregated per domain at confirmation time, topic-level and FR-level views are presentation concerns not storage concerns
- Cons: Log exists only in LLM context window (not persisted until summary files are written)

**Decision**: Option B. The roundtable maintains an internal inference log during the conversation. At confirmation time, the log is aggregated per domain into the "Assumptions and Inferences" section of each summary. The persisted summary files (requirements-summary.md, etc.) include the assumptions section for post-session reference.

---

## 2. Technology Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Depth sensing implementation | Prompt instructions in roundtable-analyst.md | Runtime code in hooks, separate depth-sensing agent | Zero runtime code aligns with the roundtable's existing prompt-only architecture. No new scripts needed. |
| Assumption persistence | Summary files during confirmation | Separate assumptions.json file, meta.json assumptions field | Summary files are already written during confirmation; adding an assumptions section is the minimal change. |
| Scope recommendation storage | `recommended_scope` field in meta.json | Separate scope.json file, state.json field | meta.json is the roundtable's designated output file. Adding a field is consistent with existing patterns. |
| Topic file format | Keep YAML frontmatter, change content only | New YAML keys, separate calibration files | Changing content within existing keys avoids parse breakage. |

---

## 3. Integration Points

| Integration Point | Current State | Required Change |
|-------------------|---------------|-----------------|
| roundtable-analyst.md <-> topic files | Static depth table maps tier to exchange count | Dynamic: roundtable reads behavioral descriptions as calibration |
| roundtable-analyst.md <-> confirmation sequence | Summaries have content + Accept/Amend | Add Assumptions section to each summary |
| roundtable-analyst.md <-> meta.json | Writes phases_completed, topics_covered | Add recommended_scope field |
| isdlc.md <-> meta.json | Reads sizing_decision for phase skipping | Also read recommended_scope (fallback to sizing_decision) |
| isdlc.md <-> --light flag | Flag sets effective_intensity directly | Flag deprecated; sets starting suggestion only |
| ANTIGRAVITY.md <-> analyze protocol | References --light for analyze-item.cjs | Remove depth references; add scope recommendation guidance |

---

## 4. Data Flow

```
User conversational signals
    |
    v
Roundtable LLM (dynamic depth sensing per topic)
    |
    +---> Depth calibration (references topic file depth_guidance)
    |
    +---> Inference log (internal, per assumption)
    |         |
    |         v
    |     Confirmation summaries (Assumptions section)
    |         |
    |         +---> Topic-level view (default)
    |         +---> FR-level view (on demand)
    |
    +---> Scope recommendation
              |
              v
         meta.json { recommended_scope: { scope, rationale, user_confirmed } }
              |
              v
         Build workflow (reads recommended_scope for phase selection)
```

---

## 5. Risk Assessment

| Risk | Architecture Mitigation |
|------|------------------------|
| LLM inconsistency across sessions | Topic file behavioral descriptions provide guardrails; future memory layer (GH-113) adds learning |
| Assumptions missed during tracking | Confirmation sequence is the safety net; any Medium/Low confidence item not in the log is a roundtable prompt quality issue, fixable by refining instructions |
| Scope recommendation conflicts with existing sizing | Transition period: both paths coexist. recommended_scope is additive, not replacing, during transition |
| Prompt size increase in roundtable-analyst.md | Net neutral: removing static depth table + adding dynamic instructions is roughly same size; inference tracking is behavioral, not verbose |
