# Data Flow — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 85%

---

## 1. Dynamic Depth Sensing Flow

```
Source: User's response text
  |
  v
Roundtable LLM assessment (per exchange)
  - Reads: answer length, detail level, engagement cues, explicit language
  - Reads: topic file depth_guidance behavioral descriptions (calibration)
  - Reads: conversation history (trend detection: is user getting more/less engaged?)
  |
  v
Per-topic depth decision (internal, not persisted)
  - Output: effective depth for current topic (brief/standard/deep gradient)
  - Used by: next response generation (question selection, probing level)
  |
  v
Response generation
  - Brief depth: accept user framing, fill gaps with inferences, log inferences
  - Standard depth: probe with follow-up, validate assumptions
  - Deep depth: challenge assumptions, seek examples, minimize inference
```

## 2. Inference Tracking Flow

```
Source: Roundtable fills a gap (doesn't ask, infers instead)
  |
  v
Inference entry created (in LLM context)
  - assumption: text of what was assumed
  - trigger: why (user signal or codebase evidence)
  - confidence: Medium or Low
  - topic_id: affected topic
  - fr_ids: affected FRs (populated when known)
  |
  v
Inference log accumulates during conversation
  (maintained in LLM context window, not persisted to disk)
  |
  v
At confirmation time: aggregated per domain
  |
  +---> Requirements summary: inferences affecting FRs
  +---> Architecture summary: inferences affecting architecture decisions
  +---> Design summary: inferences affecting module/interface specifications
```

## 3. Tiered Assumption View Flow

```
Source: Inference log (aggregated per domain)
  |
  v
Topic-level view (DEFAULT presentation)
  - Group inferences by topic_id
  - Show count + one-line summary per topic
  - Present as part of domain summary
  |
  v
User reads topic-level view
  |
  +---> User says "Accept" --> proceed to next domain
  |
  +---> User asks for detail --> FR-level expansion
  |       |
  |       v
  |     FR-level view (ON DEMAND)
  |       - Show individual inference entries
  |       - Include confidence, rationale, affected FRs
  |       - User can Accept or Amend specific inferences
  |
  +---> User says "Amend" --> amendment conversation
          |
          v
        Re-engage all personas
        Update inference log (remove/revise amended inferences)
        Restart confirmation from requirements
```

## 4. Scope Recommendation Flow

```
Source: Overall conversation signals + coverage tracker state
  |
  v
Roundtable assesses complexity (after analysis coverage substantially complete)
  - Inputs: depth used per topic, inference count, file count from codebase scan,
    user engagement level, number of cross-cutting concerns identified
  |
  v
Scope recommendation generated
  - trivial: single file, config-only, all topics brief
  - light: few files, well-understood, architecture/design not warranted
  - standard: multiple files/modules, moderate complexity
  - epic: many files, cross-cutting concerns, deep engagement throughout
  |
  v
Presented to user: "This looks like a [scope] change -- [rationale]. Agreed?"
  |
  +---> User agrees --> scope confirmed
  |
  +---> User overrides --> original recorded as user_override
  |
  v
Written to meta.json as recommended_scope
  |
  v
Consumed by build workflow (isdlc.md / ANTIGRAVITY.md)
  - Determines which phases to include in workflow
  - Replaces --light flag as scope input
```

## 5. --light Flag Deprecation Flow

```
Source: User passes --light flag to analyze or build command
  |
  v
Flag detected at isdlc.md sizing pre-check
  |
  v
Deprecation notice emitted to user
  |
  v
Flag converted to starting suggestion: recommended_scope.scope = "light"
  (NOT a hard constraint -- roundtable can override based on conversation)
  |
  v
Roundtable runs with "light" as initial calibration hint
  |
  v
At analysis completion: roundtable's recommended_scope may differ from "light"
  - If roundtable agrees: scope = "light", user_confirmed = true
  - If roundtable disagrees: scope = roundtable's assessment, user decides
  |
  v
Final scope written to meta.json (same as normal flow)
```

## 6. End-to-End Data Flow Summary

```
                    --light flag (deprecated)
                         |
                         v
User input ---------> Roundtable session
                         |
                    +----+----+----+
                    |    |    |    |
                    v    v    v    v
                 Depth  Inf  Scope Coverage
                 Sense  Track Rec  Tracker
                    |    |    |    |
                    v    v    v    v
                 Topic  Log  meta  meta
                 files       .json .json
                 (read)      (write)(write)
                    |    |
                    v    v
              Confirmation Sequence
                    |
              +-----+-----+
              |     |     |
              v     v     v
           Req   Arch   Design
           Summary Summary Summary
           + Assumptions sections
                    |
                    v
              User Accept/Amend
                    |
                    v
              Summary files persisted
              meta.json finalized
                    |
                    v
              Build workflow reads recommended_scope
```
