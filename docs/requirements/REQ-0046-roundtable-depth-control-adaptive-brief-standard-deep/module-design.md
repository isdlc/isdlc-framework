# Module Design — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 90%

---

## 1. Module Overview

This feature has no new runtime modules. All changes are to existing prompt/instruction files and one utility library. The "modules" below are logical units of change within existing files.

---

## 2. Module Definitions

### M1: Dynamic Depth Sensing Engine (roundtable-analyst.md)

**Responsibility**: Replace the static sizing-tier-to-depth mapping with LLM-judged dynamic depth instructions.

**Location**: `src/claude/agents/roundtable-analyst.md`, Section 3.4 (Steering Strategy)

**Changes**:
- Remove the static depth-aware sufficiency table (current lines 354-362)
- Add dynamic depth sensing protocol:
  - Read user signals per exchange: answer length, detail level, engagement cues, explicit language
  - Calibrate depth per topic independently using topic file `depth_guidance` behavioral descriptions
  - Support bidirectional adjustment (deepen on engagement, accelerate on fatigue)
  - Never announce depth changes to the user
- Add minimum coverage guardrail: even at brief depth, each topic must have at least one coverage criterion addressed (prevents complete topic skip)

**Boundary**: This module only affects the roundtable's internal behavior. It does not change artifact formats, confirmation flow, or meta.json output.

### M2: Inference Tracker (roundtable-analyst.md)

**Responsibility**: Track every inference the roundtable makes when filling gaps rather than receiving explicit user input.

**Location**: `src/claude/agents/roundtable-analyst.md`, new section within Coverage Tracker (Section 3)

**Changes**:
- Add inference logging protocol: after each exchange where the roundtable fills a gap (infers an answer rather than asking), log:
  - `assumption`: what was assumed (text)
  - `trigger`: why (e.g., "user gave 1-sentence answer on error handling", "no user input -- inferred from codebase patterns")
  - `confidence`: Medium (inferred from user + codebase) or Low (codebase only)
  - `topic_id`: which topic this relates to
  - `fr_ids`: which FR(s) this affects (if known at logging time; may be populated later during artifact writing)
- Integrate with existing confidence indicator assignment (Section 5.4): inference log entries directly inform the High/Medium/Low assignment on FRs

**Boundary**: Internal tracking only. Does not write to disk during conversation. Feeds into M3 at confirmation time.

### M3: Tiered Assumption Views (roundtable-analyst.md)

**Responsibility**: Present inferences to the user during the confirmation sequence at two levels of detail.

**Location**: `src/claude/agents/roundtable-analyst.md`, Section 2.5 (Confirmation Sequence)

**Changes**:
- Modify summary presentation protocol (Section 2.5.5) for each domain:
  - After main content, add "Assumptions and Inferences" section
  - Default view: group by topic, show count + one-line summary per topic
  - Example: "**Error Handling** (3 assumptions): Inferred standard error propagation from codebase patterns. See details?"
- Add expansion protocol: when user requests detail, expand the topic to show individual inference entries with confidence and rationale
- Tiered view is conversational -- the persona responds naturally to user's request for more detail

**Boundary**: Presentation only. Does not modify artifact content or meta.json. Reads from M2's inference log.

### M4: Scope Recommender (roundtable-analyst.md)

**Responsibility**: Produce a scope recommendation (trivial/light/standard/epic) as an output of analysis.

**Location**: `src/claude/agents/roundtable-analyst.md`, new subsection before confirmation sequence

**Changes**:
- After coverage tracking indicates analysis is substantially complete, the roundtable assesses overall complexity:
  - Trivial: single file, config-only, user consistently brief across all topics
  - Light: few files, well-understood change, user brief on architecture/design topics
  - Standard: multiple files/modules, some complexity, user engaged on most topics
  - Epic: many files, cross-cutting concerns, user deeply engaged, significant assumptions
- Present recommendation to user: "This looks like a [scope] change -- [rationale]. Agreed?"
- Record in meta.json: `recommended_scope: { scope, rationale, user_confirmed, user_override }`

**Boundary**: Produces meta.json output. Does not modify build workflow behavior directly (that's a downstream consumer).

### M5: Topic File Calibration (6 topic files)

**Responsibility**: Restructure `depth_guidance` from prescriptive exchange counts to behavioral descriptions.

**Location**: All 6 files in `src/claude/skills/analysis-topics/`

**Changes per file**:
- Replace exchange count prescriptions (e.g., "1-2 questions max") with behavioral descriptions (e.g., "Accept the user's framing at face value. Fill gaps from codebase analysis. Do not probe for edge cases unless the user raises them.")
- Maintain YAML key structure (`depth_guidance.brief`, `depth_guidance.standard`, `depth_guidance.deep`) for backward compatibility
- Each level describes: probing behavior, acceptance threshold, inference policy, edge case treatment

**Boundary**: Content-only changes within existing YAML structure. No structural changes to frontmatter format.

### M6: --light Flag Deprecation (isdlc.md, ANTIGRAVITY.md)

**Responsibility**: Deprecate `--light` as a depth/scope input mechanism.

**Location**: `src/claude/commands/isdlc.md` (Step 6 sizing pre-check), `ANTIGRAVITY.md` (Analyze Protocol)

**Changes**:
- isdlc.md: When `--light` is passed, emit deprecation notice. Set `recommended_scope` starting suggestion to "light" but allow roundtable to override based on conversation.
- isdlc.md: At sizing decision point (Step 3e), check for `meta.recommended_scope` as alternative to flag-based sizing.
- ANTIGRAVITY.md: Remove `--light` references from depth control. Update analyze protocol to reference dynamic depth sensing.
- three-verb-utils.cjs: Update `applySizingDecision` to accept `recommended_scope` from meta.json.

**Boundary**: Transition period: both paths coexist. Flag pre-sets suggestion, roundtable has final say.

---

## 3. Module Dependencies

```
M5 (Topic File Calibration)
    |
    v
M1 (Dynamic Depth Sensing) --- reads calibration descriptions from M5
    |
    v
M2 (Inference Tracker) --- logs inferences from M1's depth decisions
    |
    v
M3 (Tiered Assumption Views) --- reads M2's inference log at confirmation

M4 (Scope Recommender) --- independent of M2/M3, parallel to depth sensing
    |
    v
M6 (--light Deprecation) --- consumes M4's recommended_scope output
```

---

## 4. No Circular Dependencies

- M1 reads from M5 (topic files) -- one direction
- M2 is fed by M1 -- one direction
- M3 reads from M2 -- one direction
- M4 is independent of M1/M2/M3 (reads overall conversation state, not inference log)
- M6 consumes M4 output -- one direction
- No module reads from a module that reads from it
