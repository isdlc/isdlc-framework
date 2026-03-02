# Requirements Specification: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Draft
**Complexity**: Large / High

---

## 1. Business Context

The roundtable analyze workflow currently runs five phases sequentially (00-quick-scan through 04-design). Each phase is dispatched as a separate agent invocation, with visible phase headers, step numbers, handover announcements, and structured question lists presented to the user. This creates three problems:

- **Redundancy**: Phase 00 (quick-scan) gathers business context, then Phase 01 opens by asking the same business context questions again. Users are forced to repeat themselves.
- **Artificiality**: The sequential phase model exposes internal implementation structure to the user. Phase boundaries, step menus, and handover messages make the experience feel like navigating a bureaucratic process rather than having a productive conversation with analysts.
- **Slowness**: Phases 02-04 (impact analysis, architecture, design) are entirely agent-driven with no user interaction, yet they run sequentially after Phase 01 completes. There is no technical reason they can't begin producing artifacts as soon as sufficient information is available during the Phase 01 conversation.

The business opportunity is to transform the analyze experience from a structured, phase-gated questionnaire into a seamless, multi-persona conversation that produces all artifacts concurrently.

**Stakeholders**:
- Framework users (developers, team leads, architects, product owners) who invoke analyze to prepare work items for implementation
- The build verb, which consumes analyze artifacts as input for implementation

**Success Metrics**:
- All visible phase structure eliminated from the user experience (no phase headers, step numbers, menus, or handover announcements)
- All three personas engage from the first exchange
- Artifacts from all phases produced by the end of a single conversation
- Confidence indicators on every functional requirement reflecting the depth of analysis

**Driving Factors**:
- Only 2 active users, so backward compatibility with the sequential model is not required
- The build verb consumes the artifacts, so artifact format and quality must remain compatible with build expectations

## 2. Stakeholders and Personas

### 2.1 Developer

- **Role**: Uses analyze to prepare their own feature requests and bug fixes for implementation
- **Goals**: Get thorough, implementation-ready analysis quickly; avoid repeating information the system already has
- **Pain Points**: Redundant questions across phases; visible phase machinery feels like overhead; waiting for sequential phases 02-04 when the agent could be working on them already
- **Technical Proficiency**: High -- comfortable with architecture and design discussions
- **Key Tasks**: Invoke analyze on a GitHub/Jira issue, answer questions about the problem and users, review produced artifacts, hand off to build verb

### 2.2 Team Lead

- **Role**: Prepares features and bugs for developers to implement; may not implement themselves
- **Goals**: Produce a complete handoff package (requirements, architecture, design) so developers can start implementing without a discovery phase
- **Pain Points**: Sequential phases make the process longer than necessary; the rigid structure doesn't adapt to what the team lead knows vs doesn't know
- **Technical Proficiency**: Medium to high -- understands architecture at a system level, may not know implementation details
- **Key Tasks**: Analyze tickets, review and refine produced artifacts, hand off to development team

### 2.3 Architect

- **Role**: Uses analyze to explore technical implications of proposed changes
- **Goals**: Get thorough impact analysis and architecture options; validate their own thinking against the system's analysis
- **Pain Points**: Has to sit through business context and user needs questions when their interest is primarily technical; agents don't leverage their technical expertise
- **Technical Proficiency**: Very high -- wants to engage with Alex and Jordan at a deep technical level
- **Key Tasks**: Analyze proposed changes, review architecture options and recommendations, provide technical direction

### 2.4 Product Owner

- **Role**: Defines features and priorities; prepares work items for development teams
- **Goals**: Produce clear requirements with acceptance criteria; get a preliminary architecture and design even without deep technical knowledge
- **Pain Points**: Technical questions from Alex and Jordan that they can't answer; feeling lost during architecture and design phases
- **Technical Proficiency**: Low to medium -- strong on business requirements, limited on technical implementation
- **Key Tasks**: Describe business problems, define user needs, prioritize requirements, review produced artifacts at a business level

## 3. User Journeys

### 3.1 Primary Journey: Analyze an Existing Item

**Entry Point**: User invokes `analyze` on an existing item (GitHub issue, Jira ticket, or BACKLOG.md entry that has been intaked).

**Flow**:
1. User invokes analyze (e.g., `analyze GH-63`)
2. System loads the existing draft from the artifact folder (if present from prior intake)
3. System silently initiates codebase scan (keyword searches, file counts, scope estimation) during its first processing turn
4. Maya opens the conversation naturally, acknowledging what she already knows from the draft, and asks about the problem -- not as a numbered list, but as a natural opening question
5. User responds. As the conversation progresses:
   - Maya probes the problem, users, needs, and priorities through organic dialogue
   - Alex contributes observations from the codebase scan as findings become available ("I can see from the codebase that this touches the hook dispatcher...")
   - Jordan flags design considerations when the conversation reaches sufficient specificity
   - Alex and Jordan present options with recommendations and reasoning when decisions surface, rather than asking open technical questions
   - All persona contributions are batched at natural conversation breaks -- never interrupting the current thread
6. Artifacts are written progressively throughout the conversation as information thresholds are met
7. When the lead determines all topics have been adequately covered, it suggests completion: "I believe we've covered everything. Here's a summary of what we've produced."
8. Before finalizing, the lead announces: "Before we wrap up, I'm having Alex and Jordan verify their artifacts are consistent with the final requirements."
9. Cross-check runs, inconsistencies are corrected
10. User confirms completion, or requests deeper exploration of specific topics

**Exit Point**: User confirms they're satisfied. All artifacts are written to the artifact folder with confidence indicators.

### 3.2 Early Exit Journey

**Entry Point**: Same as primary journey.

**Flow**: User ends the conversation before full topic coverage (e.g., "that's enough" or "I think we're done").

1. Lead acknowledges the early exit
2. Artifacts are written based on what has been covered
3. Uncovered topics are flagged in the artifacts
4. Confidence indicators reflect the gaps (e.g., requirements: high, architecture: low with flagged assumptions)

**Exit Point**: Partial artifacts with honest confidence indicators.

### 3.3 User Pushes Deeper

**Entry Point**: Lead suggests completion, but user wants more depth.

**Flow**: User says "I want to dig more into error handling" or "go deeper on the architecture options."

1. Relevant persona takes the lead on the deeper exploration
2. Artifacts are updated with the additional depth
3. Lead re-evaluates coverage and suggests completion again when ready

**Exit Point**: Same as primary journey, with enhanced depth in requested areas.

## 4. Technical Context

### 4.1 Current Architecture

- **Phase loop**: `src/claude/commands/isdlc.md` dispatches sequential per-phase delegations to the roundtable analyst
- **Agent instructions**: `src/claude/agents/roundtable-analyst.md` (single monolithic file, ~700 lines) contains all three persona definitions, step execution engine, elaboration mode, menu system, and artifact protocol
- **Step files**: 30 markdown files across 5 phase directories under `src/claude/skills/analysis-steps/`, each with YAML frontmatter defining step_id, dependencies, depth, and outputs
- **Progress tracking**: `meta.json` in the artifact folder tracks steps_completed, phases_completed, depth_overrides
- **Artifacts**: Written to `docs/requirements/{slug}/` per phase

### 4.2 Constraints

- **Claude Code single-threaded execution**: One agent thread processes one turn at a time. True background parallelism requires agent teams (experimental feature).
- **Agent teams experimental**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` must be enabled. Known limitations: no session resumption for teammates, task status can lag, one team per session, no nested teams.
- **Artifact format compatibility**: The build verb consumes analyze artifacts. Output format must remain compatible.
- **No state.json writes**: Analysis operates outside the workflow machinery. Progress tracked in meta.json only.
- **No backward compatibility required**: Only 2 active users. The sequential model is replaced, not preserved alongside.

### 4.3 Key Integration Points

- `src/claude/commands/isdlc.md` -- Phase loop to be replaced with single dispatch
- `src/claude/agents/roundtable-analyst.md` -- To be split into 4 files (lead + 3 personas)
- `src/claude/skills/analysis-steps/**/*.md` -- 30 step files to be restructured from phase-based to topic-based
- `docs/requirements/{slug}/meta.json` -- Progress tracking model changes
- Build verb artifact consumption -- output format must remain compatible

## 5. Quality Attributes and Risks

### 5.1 Prioritized Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Usability | Critical | User experiences a seamless conversation with no visible phase structure, step headers, menus, or handover announcements |
| Maintainability | High | Persona files independently editable. Topic files independently addable/modifiable. Lead orchestration logic separated from persona behavior. |
| Reliability | High | Artifacts written progressively so partial work is never lost. Early exit produces usable partial artifacts. |
| Testability | High | Each persona file testable in isolation. Coverage tracker verifiable against known topic sets. |
| Performance | Medium | Single-agent mode: no slower than current sequential model. Agent teams mode: faster due to parallelism. |
| Token Efficiency | Medium | Single-agent mode: comparable to current token usage. Agent teams mode: ~3x tokens (acknowledged tradeoff for speed/depth). |

### 5.2 Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent teams instability (experimental feature) | Medium | High | Agent teams is opt-in. Single-agent mode is the default and delivers the same UX. Agent teams failures don't affect the default experience. |
| Voice blending in single-agent mode | Medium | Medium | Separate persona files with strict voice integrity rules. Anti-blending rule: if a persona has nothing distinct to add, they stay silent rather than echo. |
| Information threshold miscalibration | Medium | Medium | Topic files include coverage criteria in frontmatter. Lead checks criteria rather than relying purely on judgment. Iterative tuning based on usage. |
| Artifacts written too early (insufficient info) | Low | High | Confidence indicators flag low-confidence sections. Cross-check before finalization catches inconsistencies. |
| Loss of analytical thoroughness | Medium | High | Invisible coverage tracker ensures all topics are addressed. Topic files preserve the hard-won knowledge from current step files. Security considerations added as new topic. |
| Build verb incompatibility | Low | Critical | Artifact output format unchanged. Only the production process changes, not the output schema. |

## 6. Functional Requirements

### FR-001: Unified Conversation Model
**Description**: The system shall conduct analysis as a single seamless conversation with all three personas (Maya/Business Analyst, Alex/Solutions Architect, Jordan/System Designer) engaging from the first exchange, with no visible phase boundaries, step headers, numbered question lists, or handover announcements.
**Confidence**: High
**Acceptance Criteria**:
- AC-001-01: No phase headers (e.g., "Phase 01: Requirements") are displayed to the user at any point during analysis
- AC-001-02: No step headers (e.g., "Step 01-01: Business Context Discovery") are displayed to the user
- AC-001-03: No structured question lists (numbered lists of 3+ questions) are presented in a single turn
- AC-001-04: No handover announcements (e.g., "Handing off to Alex Rivera") are displayed
- AC-001-05: No step boundary menus ([E], [C], [S] options) are presented
- AC-001-06: All three personas contribute to the conversation within the first 3 exchanges

### FR-002: Silent Codebase Scan
**Description**: The system shall perform codebase analysis (keyword searches, file counts, scope estimation) silently during the agent's processing time after the user's first response, without displaying scan progress or results as a separate phase to the user.
**Confidence**: High
**Acceptance Criteria**:
- AC-002-01: No "scanning codebase" or "Phase 00" messaging is displayed to the user
- AC-002-02: Codebase scan results are available to Alex and Jordan by the second agent response at the latest
- AC-002-03: Maya engages the user immediately upon analyze invocation without waiting for the scan to complete
- AC-002-04: In agent teams mode, the codebase scan runs as a teammate task concurrent with the opening conversation

### FR-003: Progressive Artifact Production
**Description**: The system shall write artifacts for all phases (requirements, impact analysis, architecture, design) progressively throughout the conversation as information thresholds are met, rather than waiting for phase boundaries.
**Confidence**: High
**Acceptance Criteria**:
- AC-003-01: Artifacts are written to the artifact folder during the conversation, not only at the end
- AC-003-02: Each artifact write is triggered by an information threshold (sufficient data gathered), not by a phase transition signal
- AC-003-03: If the conversation ends early, all artifacts written up to that point are preserved in the artifact folder
- AC-003-04: Artifacts are updated (not overwritten) as the conversation adds new information

### FR-004: Information Threshold Engine
**Description**: The system shall determine when sufficient information has been gathered to begin writing each artifact type, based on coverage criteria defined in topic files, without requiring user direction or explicit phase transitions.
**Confidence**: Medium
**Acceptance Criteria**:
- AC-004-01: The lead orchestration logic evaluates coverage criteria from topic files to determine artifact readiness
- AC-004-02: No user input is required to trigger artifact writing (the system recognizes readiness autonomously)
- AC-004-03: Different artifact types may reach their information threshold at different points in the conversation
- AC-004-04: The user can influence artifact production indirectly by providing more or less detail on specific topics

### FR-005: Invisible Coverage Tracker
**Description**: The system shall maintain an internal checklist of all analysis topics (derived from topic files) and track which topics have been adequately covered during the conversation, using this to steer the conversation toward uncovered areas organically.
**Confidence**: Medium
**Acceptance Criteria**:
- AC-005-01: The coverage tracker is never displayed to the user
- AC-005-02: The lead steers the conversation toward uncovered topics without announcing the steering (e.g., no "Now let's talk about error handling")
- AC-005-03: All topics are covered before the lead suggests completion (unless the user exits early)
- AC-005-04: Each topic file includes coverage criteria that define "adequately covered"

### FR-006: Dual Execution Modes
**Description**: The system shall support two execution modes -- single-agent (default) and agent teams (opt-in) -- that deliver an identical user experience but differ in speed, analysis depth, and token cost.
**Confidence**: High
**Acceptance Criteria**:
- AC-006-01: Single-agent mode is the default when agent teams is not enabled
- AC-006-02: Agent teams mode activates when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled and the user opts in
- AC-006-03: The user-visible conversation experience is identical in both modes (same persona voices, same conversation flow, same artifact types)
- AC-006-04: Agent teams mode produces artifacts faster due to genuine parallelism
- AC-006-05: Agent teams mode can produce deeper analysis due to each persona having its own full context window

### FR-007: Agent Teams Orchestration
**Description**: In agent teams mode, the system shall spawn Maya as team lead and Alex and Jordan as teammates, with each teammate running as a separate Claude Code instance that communicates findings via the agent teams messaging system.
**Confidence**: Medium
**Acceptance Criteria**:
- AC-007-01: Maya is spawned as the team lead and manages all user interaction
- AC-007-02: Alex is spawned as a teammate with his persona file as the spawn prompt
- AC-007-03: Jordan is spawned as a teammate with her persona file as the spawn prompt
- AC-007-04: Teammates communicate findings to the lead via the agent teams messaging system
- AC-007-05: The lead weaves teammate findings into the user conversation at natural breaks
- AC-007-06: Teammates write their own phase artifacts directly to the artifact folder

### FR-008: Persona File Split
**Description**: The system shall split the monolithic `roundtable-analyst.md` into four separate files: lead orchestration, business analyst persona, solutions architect persona, and system designer persona.
**Confidence**: High
**Acceptance Criteria**:
- AC-008-01: `roundtable-lead.md` contains orchestration logic, information thresholds, conversation flow, coverage tracking, and artifact coordination
- AC-008-02: `persona-business-analyst.md` contains Maya's identity, principles, question style, and artifact responsibilities
- AC-008-03: `persona-solutions-architect.md` contains Alex's identity, principles, codebase research approach, and artifact responsibilities
- AC-008-04: `persona-system-designer.md` contains Jordan's identity, principles, specification style, and artifact responsibilities
- AC-008-05: In single-agent mode, the lead reads all four files
- AC-008-06: In agent teams mode, each persona file is used as the teammate spawn prompt

### FR-009: Topic-Based Step File Restructuring
**Description**: The system shall restructure the 30 phase-based step files into topic-based reference files organized by knowledge domain, usable as internal guidance by any persona at any point in the conversation.
**Confidence**: High
**Acceptance Criteria**:
- AC-009-01: Step files are reorganized from phase directories (`00-quick-scan/`, `01-requirements/`, etc.) to topic directories (`problem-discovery/`, `technical-analysis/`, `architecture/`, `specification/`)
- AC-009-02: Each topic file retains the analytical knowledge from the original step file (questions to ask, validation criteria, artifact instructions)
- AC-009-03: Topic files include coverage criteria in frontmatter defining what "adequately covered" means
- AC-009-04: A new security considerations topic file is created to fill the identified gap
- AC-009-05: Phase-specific sequencing metadata (step_id, depends_on, phase ordering) is removed from frontmatter
- AC-009-06: Any persona can reference any topic file regardless of the original phase association

### FR-010: Organic Persona Interaction
**Description**: Alex and Jordan shall contribute observations, insights, and flags based on codebase findings and conversation context, without asking the user open-ended technical questions. When decisions surface, they shall present options with a stated recommendation and reasoning.
**Confidence**: High
**Acceptance Criteria**:
- AC-010-01: Alex and Jordan do not ask the user open-ended technical design questions (e.g., "What integration pattern do you prefer?")
- AC-010-02: When a technical decision surfaces, the relevant persona presents options with a recommendation and reasoning
- AC-010-03: The user can accept the recommendation, choose a different option, or ask for more detail
- AC-010-04: If the user provides no input on a recommendation, the persona proceeds with the recommended option
- AC-010-05: Persona contributions are batched at natural conversation breaks, never interrupting the current thread between Maya and the user

### FR-011: Confidence Indicators
**Description**: The system shall assign a confidence level (high, medium, low) to each functional requirement in the produced artifacts, reflecting the depth and source of the information behind it.
**Confidence**: High
**Acceptance Criteria**:
- AC-011-01: Every FR in the output requirements-spec.md has a confidence indicator (high, medium, or low)
- AC-011-02: High confidence indicates the requirement was directly stated or confirmed by the user
- AC-011-03: Medium confidence indicates the requirement was inferred from user input combined with codebase analysis
- AC-011-04: Low confidence indicates the requirement was extrapolated from codebase analysis alone, with assumptions flagged
- AC-011-05: Confidence indicators are machine-readable (consistent format, not just prose)

### FR-012: Artifact Cross-Check Before Finalization
**Description**: Before declaring analysis complete, the system shall have all personas verify their artifacts are consistent with the final requirements, correcting any inconsistencies introduced by progressive updates during the conversation.
**Confidence**: High
**Acceptance Criteria**:
- AC-012-01: The lead announces the cross-check to the user: "Before we wrap up, I'm having Alex and Jordan verify their artifacts are consistent with the final requirements."
- AC-012-02: Each persona reviews their artifacts against the final requirements for inconsistencies
- AC-012-03: Inconsistencies are corrected before the artifacts are declared final
- AC-012-04: The user is informed of any significant corrections made during cross-check

### FR-013: Conversation Completion Model
**Description**: The system shall support three completion scenarios: natural completion (lead suggests, user confirms), early exit (user ends before full coverage), and deeper exploration (user requests more depth after lead suggests completion).
**Confidence**: High
**Acceptance Criteria**:
- AC-013-01: When all topics are covered and artifacts written, the lead suggests completion with a summary of produced artifacts
- AC-013-02: The user can end the conversation at any time; partial artifacts are preserved with appropriate confidence indicators
- AC-013-03: The user can request deeper exploration after the lead suggests completion; the relevant persona continues
- AC-013-04: On early exit, uncovered topics are flagged in the artifacts

### FR-014: Single Dispatch from isdlc.md
**Description**: The phase loop in `isdlc.md` shall be replaced with a single dispatch to the lead orchestrator, which owns the entire analysis lifecycle (codebase scan, conversation, artifact production, cross-check, finalization).
**Confidence**: High
**Acceptance Criteria**:
- AC-014-01: `isdlc.md` dispatches once to the lead orchestrator for the entire analysis
- AC-014-02: The per-phase delegation loop is removed from `isdlc.md`
- AC-014-03: Inter-phase gate checks are replaced by a single validation at the end (all required artifacts present and internally consistent)
- AC-014-04: The lead orchestrator manages all progress tracking via meta.json

### FR-015: Adaptive Artifact Depth by User Type
**Description**: The system shall adapt the depth and balance of produced artifacts based on what the user brings to the conversation, producing stronger artifacts in domains where the user provides rich input and lighter artifacts (with flagged assumptions) where the user provides limited input.
**Confidence**: Medium
**Acceptance Criteria**:
- AC-015-01: When the user provides rich business context but limited technical input (product owner pattern), requirements artifacts are high confidence while architecture/design artifacts are lighter with flagged assumptions
- AC-015-02: When the user provides rich technical context (architect pattern), architecture and design artifacts are high confidence
- AC-015-03: Alex works from codebase analysis to fill gaps when the user cannot provide technical input, and flags his assumptions explicitly
- AC-015-04: The system does not require the user to provide input outside their expertise to produce artifacts

### FR-016: Elaboration Mode Removal
**Description**: The system shall remove the elaboration mode ([E] menu option) and all associated multi-persona discussion machinery, as the concurrent model makes it redundant.
**Confidence**: High
**Acceptance Criteria**:
- AC-016-01: No [E] elaboration mode option is presented to the user
- AC-016-02: The elaboration handler, synthesis engine, and state tracker code are removed
- AC-016-03: The elaboration_config and elaborations array in meta.json are no longer written

### FR-017: Menu System Removal
**Description**: The system shall remove all step boundary menus ([E], [C], [S]) and phase boundary menus, as the conversation model eliminates discrete step and phase boundaries.
**Confidence**: High
**Acceptance Criteria**:
- AC-017-01: No step boundary menus are presented during analysis
- AC-017-02: No phase boundary menus are presented during analysis
- AC-017-03: User controls the conversation through natural language ("go deeper", "let's move on", "I think we're done") rather than menu commands

## 7. Out of Scope

The following items are explicitly excluded from this feature and tracked as separate work items:

| Item | Reason | Dependency |
|------|--------|------------|
| **Raw text entry point**: Invoking analyze with plain text (e.g., "analyze 'make analyze parallel'") with fuzzy matching against BACKLOG.md | Entry point refinement -- separate concern from the concurrent analysis experience | None |
| **Issue tracker configuration during install**: Configuring GitHub/Jira/multi-tracker settings during install phase | Prerequisite for raw text entry point but not for concurrent model | Prerequisite for raw text entry point |
| **Backward compatibility with sequential model**: Preserving the ability to run the old sequential phase model | Only 2 active users; not needed | None |
| **Discover command concurrent model**: Applying the concurrent model to the `/discover --new` pipeline | Different agents, orchestrator, and artifacts; noted in quick-scan as follow-on | This feature (pattern established first) |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Unified Conversation Model | Must Have | Core of the feature -- without this, nothing changes |
| FR-002 | Silent Codebase Scan | Must Have | Eliminates Phase 00 visibility; required for seamless experience |
| FR-003 | Progressive Artifact Production | Must Have | Fundamental behavior change -- artifacts during conversation, not after |
| FR-004 | Information Threshold Engine | Must Have | Enables FR-003; determines when to write artifacts |
| FR-005 | Invisible Coverage Tracker | Must Have | Ensures analytical thoroughness without visible structure |
| FR-008 | Persona File Split | Must Have | Architectural prerequisite for both single-agent and agent teams modes |
| FR-009 | Topic-Based Step File Restructuring | Must Have | Preserves analytical knowledge in new structure; enables coverage tracking |
| FR-010 | Organic Persona Interaction | Must Have | Defines how Alex/Jordan participate -- options with recommendations |
| FR-014 | Single Dispatch from isdlc.md | Must Have | Architectural change that enables the unified conversation |
| FR-016 | Elaboration Mode Removal | Must Have | Removes redundant feature; simplifies agent instructions |
| FR-017 | Menu System Removal | Must Have | Removes visible step structure; completes UX transformation |
| FR-011 | Confidence Indicators | Should Have | Valuable for build verb consumption and multi-user-type support |
| FR-012 | Artifact Cross-Check | Should Have | Quality safeguard; important but analysis is still useful without it |
| FR-013 | Conversation Completion Model | Should Have | Three completion scenarios are important UX refinement |
| FR-015 | Adaptive Artifact Depth | Should Have | Enhances multi-user-type support; system works without it (just less gracefully) |
| FR-006 | Dual Execution Modes | Should Have | Single-agent is the core; agent teams is the acceleration layer |
| FR-007 | Agent Teams Orchestration | Could Have | Depends on experimental feature stability; single-agent delivers the full UX |
