# Quick Scan: Elaboration Mode — Multi-Persona Roundtable Discussions

**Generated**: 2026-02-19T21:15:00Z
**Feature**: Elaboration mode — multi-persona roundtable discussions (GitHub Issue #21)
**Phase**: 00-quick-scan
**Analysis Mode**: Research-only (no state.json writes, no branches)

---

## Scope Estimate

**Estimated Scope**: MEDIUM (~12-18 files)
**File Count Estimate**: 15-18 files to create/modify
**Confidence**: MEDIUM-HIGH
**Complexity Assessment**: MEDIUM (interactive multi-agent orchestration, persona management, menu integration)

---

## Feature Context

This feature enables a multi-persona roundtable discussion mode during the `/isdlc analyze` workflow. At any step, users can select `[E] Elaboration Mode` to bring three personas (Business Analyst, Solutions Architect, System Designer) into a focused discussion on the current topic. Personas debate and cross-reference each other's insights; the user participates as an equal. Exit returns to the step workflow with enriched context applied to artifacts.

**Prerequisite**: Issue #20 (Roundtable agent with named personas) must be completed first.

---

## Keyword Matches & Codebase Analysis

### Domain Keywords

| Keyword | Matches | Files | Notes |
|---------|---------|-------|-------|
| analyze | 47 | 8 files | `/isdlc analyze` handler in isdlc.md, Phase 00-04 agents |
| roundtable | 0 (new) | — | Not yet implemented; #20 creates the agent |
| persona | 3 | 2 files | Party personas defined in `party-personas.json`, used in discover phase |
| debate | 12 | 8 files | DEBATE_CONTEXT protocol in requirements-analyst, solution-architect, test-design-engineer, critic/refiner agents |
| elaboration | 0 (new) | — | Feature being designed |
| discuss/discussion | 5 | 4 files | General references in agent descriptions |
| menu | 15+ | 3 files | Menu patterns in isdlc.md and requirements-analyst.md (`[A] Adjust [R] Refine [C] Continue`) |
| step | 42 | 8 files | Phase steps in analyze handler (00-04 sequence) |

### Technical Keywords

| Keyword | Matches | Files | Notes |
|---------|---------|-------|-------|
| DEBATE_CONTEXT | 18 | 8 files | Existing multi-agent debate protocol in Phase 01, 03, 04, 05 agents |
| multi-agent | 8 | 4 files | Critic/Refiner debate teams, cross-validation (REQ-0015) |
| Task tool | 120+ | 12 files | Used for agent delegation throughout framework |
| SendMessage | 2 | 1 file | Mentioned in backlog for cross-pollination (#31) but not yet implemented |
| handler | 25 | 3 files | Analyze handler (inline, no orchestrator), build handler, feature handler |
| orchestration | 30+ | 4 files | SDLC orchestrator, phase-loop controller, debate orchestration patterns |
| state.json | 200+ | Multiple | Project state, workflow tracking, iteration requirements |

---

## Affected Architecture & Key Locations

### 1. ANALYZE HANDLER — Interactive Flow Entry Point
**File**: `/src/claude/commands/isdlc.md` (lines 563-600)

The analyze command runs inline (no orchestrator, no state.json writes). It sequences through phases 00-04:
- Phase 00 (quick-scan)
- Phase 01 (requirements)
- Phase 02 (impact-analysis)
- Phase 03 (architecture)
- Phase 04 (design)

**Current flow**:
```
1. Resolve backlog item
2. For each phase: delegate to agent, update meta.json
3. At each phase boundary: "Phase {N} complete. Continue to Phase {N+1}? [Y/n]"
```

**What changes for elaboration**:
- At each phase boundary menu, add `[E] Elaboration Mode` option alongside `[Y]/[n]`
- If user selects `[E]`: trigger elaboration mode (stays in analyze, doesn't break workflow)
- Return to menu when elaboration exits

**Estimated lines changed**: ~20-30 lines in analyze handler

---

### 2. ROUNDTABLE AGENT (Dependency: Issue #20)
**New file**: `/src/claude/agents/roundtable-analyst.md` (to be created by #20)

This agent wears three persona hats:
- **Business Analyst** (Phases 00-01, requirements discovery)
- **Solutions Architect** (Phases 02-03, impact analysis and architecture)
- **System Designer** (Phase 04, design decisions)

**For elaboration mode**:
- Agent activates a "discussion mode" within the roundtable capability
- Personas engage in cross-talk (explicit references to each other's points)
- User participates as an equal, can address specific personas or the group
- Maintains topic focus (no freeform debate, stays on current analysis step)
- Exit returns enriched context to the step workflow

**Estimated new content**: None (roundtable agent already handles persona interaction)
**Note**: Elaboration mode is a configuration/invocation pattern within roundtable-analyst, not a separate agent

---

### 3. PERSONA DEFINITIONS & INTERACTION PATTERNS
**File**: `/src/claude/agents/discover/party-personas.json` (lines 1-156)

Already defines personas with communication styles and debate focus:
- Nadia (Product Analyst) — empathetic, user-focused
- Oscar (Domain Researcher) — thorough, evidence-based
- Tessa (Technical Scout) — pragmatic, trend-aware
- Liam (Solution Architect) — structured, trade-off focused
- Zara (Security Advisor) — risk-aware, principle-driven
- Felix (DevOps Pragmatist) — opinionated, cost-conscious
- architect (Architecture Designer) — systematic, pattern-driven
- data_modeler (Data Model Designer) — precise, relationship-aware
- test_strategist (Test Strategist) — quality-focused, coverage-driven

**Phases defined** (lines 114-155):
- Phase 1: Vision Council (Nadia, Oscar, Tessa) — question-broadcast-debate
- Phase 2: Stack & Architecture Debate (Liam, Zara, Felix) — propose-critique-converge
- Phase 3: Blueprint Assembly (architect, data_modeler, test_strategist) — produce-cross-review-finalize
- Phase 4-5: Sequential (no personas)

**What changes for elaboration**:
- Map analyze phases (00-04) to persona groupings:
  - Phase 00-01 (requirements): Activate Vision Council personas (Nadia, Oscar, Tessa)
  - Phase 02-03 (architecture): Activate Stack & Architecture personas (Liam, Zara, Felix)
  - Phase 04 (design): Activate Blueprint Assembly personas (architect, data_modeler, test_strategist)
- Add elaboration mode configuration to persona interaction (already supports multi-persona discussion, just needs explicit invocation)

**Estimated changes**: ~15 lines (add elaboration mode mappings, if not already in party-personas structure)

---

### 4. DEBATE CONTEXT PROTOCOL — Existing Multi-Agent Infrastructure
**Referenced in**: 8 agent files (requirements-analyst, solution-architect, test-design-engineer, requirements-critic, architecture-critic, design-critic, test-strategy-critic, test-strategy-refiner)

The framework already supports multi-agent debate via `DEBATE_CONTEXT` blocks:
- Round tracking: `DEBATE_CONTEXT.round` = current round number
- Creator role: single agent produces artifacts (Phase 01/02/03/04)
- Critic role: review agent identifies defects (requirements-critic, architecture-critic, etc.)
- Refiner role: improvement agent enhances based on critique
- Protocol: creador → critic review → refiner improvement → next round or exit

**What elaboration mode leverages**:
- Same DEBATE_CONTEXT pattern but with **all personas engaged simultaneously** (not sequential rounds)
- Personas cross-reference instead of waiting for round-robin critique
- No explicit "Critic" or "Refiner" phase — interaction is organic discussion

**Impact**: Elaboration mode is essentially debate mode with synchronized personas + user participation. Can reuse:
- DEBATE_CONTEXT structure
- Round labeling
- Artifact optimization
- Menu patterns

---

### 5. MENU SYSTEM & USER INTERACTION PATTERNS
**Files**: `/src/claude/commands/isdlc.md`, `/src/claude/agents/01-requirements-analyst.md`

Existing menu patterns used throughout:
```
[A] Adjust — Make changes
[R] Refine — Drill deeper
[C] Continue — Move to next step
[X] Exit — Stop and save
```

The analyze handler already offers phase boundary menus:
```
Phase {N} complete. Continue to Phase {N+1}? [Y/n]
```

**What changes for elaboration**:
- Extend analyze phase-boundary menu to add `[E] Elaboration Mode` option
- After elaboration exits, return to the same menu for `[Y]/[n]` selection
- No change to existing A/R/C patterns — elaboration is a peer option at phase boundaries

---

## Relevant Features & Existing Multi-Agent Infrastructure

### Feature #20: Roundtable Analyst (Dependency)
**Status**: Not yet implemented
**Scope**: Medium
**Description**: Single agent that wears three personas during analyze. Each persona has identity, communication style, principles. Runs analysis steps for Phases 00-04 with conversational engagement and persona-driven menus.

**Brings to elaboration**:
- Named personas with distinct voices and expertise
- Multi-phase persona coverage (BA → architect → designer)
- Step-file architecture (progress tracked in meta.json, resumable)
- Persona interaction protocol

---

### Feature REQ-0015: Impact Analysis Cross-Validation
**Status**: Completed
**Scope**: 3 agents (Impact Analyzer, Entry Point Finder, Risk Assessor) + 1 Verifier agent
**Files**: 
- `/src/claude/agents/02-cross-validation-verifier.md`
- 3-tier fail-open, 33 tests

**Brings to elaboration**:
- Pattern for coordinating multiple agents on same task
- Cross-reference validation (agents aware of each other's findings)
- Fail-open error handling for optional agents

---

### Existing Debate Teams (Phases 01, 03, 04, 05)
**Files**: 8 agent files (analyst, architect, test-design-engineer + critics/refiners)

**Brings to elaboration**:
- DEBATE_CONTEXT protocol (round tracking, artifact labeling, review cycles)
- Creator/Critic/Refiner interaction pattern
- Multi-round convergence logic
- Round labeling in artifacts

---

### Existing Persona System (Discover Party Mode)
**File**: `/src/claude/agents/discover/party-personas.json`, Multiple discovery agents

**Brings to elaboration**:
- Named personas (Nadia, Liam, Zara, etc.) with communication styles
- Persona groupings by phase
- Debate interaction types (question-broadcast-debate, propose-critique-converge, produce-cross-review-finalize)
- Party mode orchestration patterns

---

## Implementation Scope Breakdown

### Phase 1: Feature #20 (Prerequisite)
- Create roundtable-analyst.md with persona hats for phases 00-04
- Define step-file architecture under src/claude/skills/analysis-steps/
- Add persona interaction protocol
- Extend party-personas.json with analyze-phase mappings
- Estimated: 6-8 files

### Phase 2: Feature #21 (Elaboration Mode)
- **Analyze handler changes** (`isdlc.md`): ~30 lines to add `[E]` menu option at phase boundaries
- **Elaboration orchestration**: New orchestration sub-protocol for multi-persona discussion
  - Invoke all 3 personas simultaneously for current topic
  - Implement cross-talk (personas reference each other)
  - User interaction protocol (address by name or group)
  - Topic focus enforcement
  - Exit logic and context enrichment
- **Estimated new files**: 1-2 (elaboration protocol/orchestration logic)
- **Estimated modified files**: 4-6 (isdlc.md, roundtable-analyst.md config, possibly persona-interaction utilities)
- **Estimated total**: 5-8 files

---

## Complexity Assessment

### Scoring Dimensions

| Dimension | Assessment | Notes |
|-----------|-----------|-------|
| **Novelty** | MEDIUM | Multi-agent debate exists (REQ-0015, phases 01/03/04). Elaboration adds simultaneous engagement + user participation. Not entirely new pattern. |
| **Orchestration** | MEDIUM | Must coordinate 3 personas + user concurrently. DEBATE_CONTEXT already handles async reviews; elaboration needs sync discussion. New but not radical. |
| **Menu Integration** | LOW | Analyze handler already has phase boundaries. Adding `[E]` option is straightforward. ~30 lines. |
| **Agent Changes** | MEDIUM-LOW | Roundtable agent (#20) handles persona interaction. Elaboration is a configuration/invocation pattern, not a new agent. Some config changes needed. |
| **State Management** | LOW | Elaboration runs within analyze (no state.json). Meta.json unchanged. Simpler than workflow phases. |
| **Error Handling** | MEDIUM | Need graceful exit from elaboration if a persona fails. Fallback to non-elaborated step. Fail-open pattern. |
| **Testing** | MEDIUM | Need to test: multi-persona discussion flow, cross-talk accuracy, topic focus, exit logic, artifact enrichment. ~8-12 test scenarios. |

---

## Questions for Requirements Phase

After this quick scan, the Requirements Analyst should clarify:

1. **Persona Selection for Elaboration**:
   - At a given step, which persona subset activates? (E.g., during Phase 01 requirements, do all 3 BA/Architect/Designer engage, or just BA + Architect?)
   - Should elaboration mode always include all 3, or be step-dependent?

2. **Cross-Talk Protocol**:
   - How should personas reference each other? Natural speech ("As the Architect mentioned...") or explicit citations?
   - Should there be a character limit or turn-count to prevent runaway discussion?

3. **User Participation**:
   - Can the user interrupt mid-discussion, or do they wait for natural breaks?
   - Can they ask off-topic questions, or must they stay focused on the current analysis step?

4. **Context Enrichment**:
   - What exactly gets "enriched" and fed back to artifacts after elaboration? (E.g., new acceptance criteria discovered during discussion?)
   - Is there a manual approval step, or are enrichments auto-applied?

5. **Exit and Resumption**:
   - When elaboration exits, does the user return to the phase-boundary menu, or continue to the next phase?
   - If elaboration modifies artifacts, are those changes persistent (saved to draft artifacts) or ephemeral (used for discussion only)?

6. **Tone and Focus**:
   - Should elaboration be conversational and informal, or structured (like a meeting agenda)?
   - How do we prevent elaboration from becoming a freeform chat (out of scope)?

---

## Files Likely to Be Affected

### Creation (New)
- `.isdlc/skills/analysis-steps/` — step files (if #20 needs them)
- Elaboration orchestration module (if extracted as separate file)

### Modification
- `/src/claude/commands/isdlc.md` — analyze handler (add `[E]` menu, elaboration invocation logic)
- `/src/claude/agents/roundtable-analyst.md` — add elaboration mode configuration
- `/src/claude/agents/discover/party-personas.json` — add elaboration mode phase mappings (if not already present)
- `/src/claude/agents/roundtable-analyst-elaboration.md` or similar — elaboration orchestration (NEW if needed, else inline)
- Possibly: utilities for persona cross-talk, user interaction parsing

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-19T21:15:00Z",
  "scan_duration_ms": 1200,
  "keywords_searched": 12,
  "domain_keywords_matched": 8,
  "technical_keywords_matched": 9,
  "files_matched": 18,
  "scope_estimate": "medium",
  "file_count_estimate": 15,
  "confidence": "medium-high",
  "complexity_assessment": "medium",
  "prerequisite_status": "NOT STARTED (#20 required)",
  "related_features": [
    "REQ-0015 (cross-validation)",
    "Phase 01-04 debate infrastructure",
    "Discover party mode (personas)",
    "Feature #20 (roundtable agent)"
  ],
  "phase_gates_impacted": [
    "GATE-00-QUICK-SCAN (this gate)",
    "GATE-01-REQUIREMENTS (analyze handler logic)",
    "No workflow gates — feature runs in analyze inline mode"
  ]
}
```

---

## Summary for Requirements Analyst

**Scope**: Medium (~15-18 files to touch/create)
**Complexity**: Medium (multi-agent orchestration, but leverages existing debate and persona infrastructure)
**Dependencies**: Issue #20 must be completed first

**Key Implementation Areas**:
1. Extend analyze handler menu with `[E] Elaboration Mode` option (~30 lines)
2. Implement multi-persona discussion orchestration (leverage DEBATE_CONTEXT + party-personas patterns)
3. Add cross-talk protocol so personas reference each other
4. Implement user participation and topic focus enforcement
5. Define context enrichment and artifact updates from elaboration output

**Architecture Fit**: 
- Reuses existing DEBATE_CONTEXT protocol, party-persona definitions, and debate teams
- Adds simultaneous engagement + user participation (new aspect)
- No workflow state changes — inline to analyze command
- Fail-open error handling (optional, non-blocking)

**Risk**: Low-medium. Leverages well-tested multi-agent patterns; main novelty is synchronized multi-persona discussion. Recommend starting with 2-3 test scenarios for cross-talk accuracy.
