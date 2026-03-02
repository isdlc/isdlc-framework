# Data Flow & State Management: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Draft
**Confidence**: High
**Last Updated**: Design phase
**Coverage**: All data sources, sinks, state mutations, and synchronization documented.

---

## 1. Data Sources

| # | Source | Type | When Read | Reader | Content |
|---|--------|------|-----------|--------|---------|
| DS-1 | Dispatch prompt | Text (inline) | Once, at lead startup | Lead | slug, artifact folder, meta context, draft content, sizing info |
| DS-2 | Persona files (x3) | Markdown | Once, at lead startup | Lead (single-agent) or Task spawner (agent teams) | Identity, principles, voice rules, artifact responsibilities |
| DS-3 | Topic files | Markdown + YAML | Once at startup, on-demand during conversation | Lead (coverage criteria), Personas (analytical knowledge) | coverage_criteria, analytical questions, validation rules, artifact instructions |
| DS-4 | User input | Text (conversational) | Each turn | Lead (routes to personas) | Answers to questions, feedback, depth preferences, completion signals |
| DS-5 | Codebase | Files (Grep, Glob, Read) | During first processing turn (silent scan) | Alex | Keyword hits, file counts, module distribution, patterns |
| DS-6 | Existing artifacts | Markdown/JSON/CSV | On resume; during cross-check | Lead, Personas | Previously written analysis artifacts |
| DS-7 | meta.json | JSON | Once at startup; on resume | Lead | Progress state, phases_completed, topics_covered, steps_completed |
| DS-8 | Teammate messages | JSON | Async during conversation (agent teams only) | Lead | Progress reports, findings, completion signals |

## 2. Data Sinks

| # | Sink | Type | When Written | Writer | Content |
|---|------|------|-------------|--------|---------|
| DK-1 | requirements-spec.md | Markdown | Progressive (multiple writes) | Maya | Business context, stakeholders, user journeys, FRs, ACs, MoSCoW |
| DK-2 | user-stories.json | JSON | Progressive | Maya | User story array with traces |
| DK-3 | traceability-matrix.csv | CSV | Once, near end | Maya | FR-to-AC-to-story mapping |
| DK-4 | impact-analysis.md | Markdown | Progressive | Alex | Blast radius, entry points, risk zones, implementation order |
| DK-5 | architecture-overview.md | Markdown | Progressive | Alex | Options, ADRs, technology decisions, integration architecture |
| DK-6 | module-design.md | Markdown | Progressive | Jordan | Module boundaries, responsibilities, data structures |
| DK-7 | interface-spec.md | Markdown | Progressive | Jordan | Interface contracts, signatures, examples |
| DK-8 | data-flow.md | Markdown | Progressive | Jordan | Data flow, state management |
| DK-9 | error-taxonomy.md | Markdown | Progressive | Jordan | Error codes, recovery strategies |
| DK-10 | design-summary.md | Markdown | Once, at finalization | Jordan | Executive summary of design decisions |
| DK-11 | quick-scan.md | Markdown | Once, after codebase scan | Lead | Scope, keywords, file count |
| DK-12 | meta.json | JSON | Multiple checkpoints | Lead (sole writer) | Progress tracking state |

## 3. End-to-End Data Flow

### 3.1 Single-Agent Mode

```
Turn 0 (Startup):
  isdlc.md ──[dispatch prompt]──> Lead
  Lead ──[Read]──> persona-business-analyst.md ──> Lead memory (Maya identity)
  Lead ──[Read]──> persona-solutions-architect.md ──> Lead memory (Alex identity)
  Lead ──[Read]──> persona-system-designer.md ──> Lead memory (Jordan identity)
  Lead ──[Glob+Read]──> analysis-topics/**/*.md ──> Lead memory (coverage registry)
  Lead ──[Read]──> meta.json (from dispatch) ──> Lead memory (prior progress)
  Lead: Initialize coverage tracker, artifact readiness, conversation state
  Lead (as Maya): Present opening to user

Turn 1 (User responds, first processing cycle):
  User input ──> Lead memory (conversation history)
  Lead (as Maya): Process user response, probe further
  Lead (as Alex, silent): Codebase scan
    Alex ──[Grep]──> codebase ──> Alex findings (keyword hits, file paths)
    Alex ──[Glob]──> codebase ──> Alex findings (file counts, structure)
  Lead: Batch Alex's findings for next natural break
  Lead: Update coverage tracker (problem-discovery criteria)
  Lead: Evaluate artifact readiness thresholds
  IF quick-scan threshold met:
    Lead ──[Write]──> quick-scan.md (DK-11)
    Lead: Update meta.json (phases_completed += "00-quick-scan")
    Lead ──[Write]──> meta.json (DK-12)

Turn 2..N (Conversation continues):
  User input ──> Lead memory
  Lead: Route to appropriate persona based on conversation context
  Lead (as active persona): Engage user
  Lead (as other personas): Queue observations if relevant
  Lead: At natural break, present batched persona contributions
  Lead: Update coverage tracker after each turn
  Lead: Evaluate artifact readiness after each turn
  IF artifact threshold met:
    Persona ──[Read]──> existing artifact (if exists)
    Persona: Self-validate content
    Persona ──[Write]──> artifact file (DK-1..DK-10)
    Lead: Update meta.json (phases_completed, topics_covered, steps_completed)
    Lead ──[Write]──> meta.json (DK-12)

Turn N+1 (Coverage complete):
  Lead: All topics covered, all artifact thresholds met
  Lead: Announce cross-check to user
  Lead: Read all artifacts, verify cross-persona consistency
  IF inconsistencies found:
    Owning persona: Correct artifact
    Persona ──[Write]──> corrected artifact
  Lead: Report corrections to user
  Lead: Suggest completion with artifact summary

Turn N+2 (Finalization):
  User: Confirms completion (or requests deeper exploration)
  IF confirmed:
    Lead: Final meta.json write (analysis_status: "partial")
    Lead ──[Write]──> meta.json (DK-12)
    Lead: Return control to isdlc.md
  IF deeper exploration requested:
    Lead: Route to relevant persona, continue from Turn 2..N pattern
```

### 3.2 Agent Teams Mode

```
Turn 0 (Startup):
  isdlc.md ──[dispatch prompt]──> Lead
  Lead ──[Glob+Read]──> analysis-topics/**/*.md ──> Lead memory (coverage registry)
  Lead ──[Read]──> meta.json (from dispatch) ──> Lead memory (prior progress)
  Lead: Prepare context briefs for each persona

  Lead ──[Spawn]──> Alex (persona file + brief + codebase scan summary)
  Lead ──[Spawn]──> Maya (persona file + brief)
  Lead ──[Spawn]──> Jordan (persona file + brief)

  Alex (teammate): Begins codebase scan immediately
  Maya (teammate): Begins preparing opening questions
  Jordan (teammate): Waits for sufficient context from Alex and Maya

Turn 1 (Parallel processing):
  Maya ──[finding message]──> Lead: Opening question for user
  Alex ──[finding message]──> Lead: Codebase scan results
  Lead: Present Maya's opening to user (Alex works in background)

  User input ──> Lead
  Lead ──[task assignment]──> Maya: User's response
  Lead ──[task assignment]──> Alex: User's response (for context)

Turn 2..N (Parallel conversation):
  Maya ──[finding message]──> Lead: Follow-up question or observation
  Alex ──[finding message]──> Lead: Technical finding
  Alex ──[progress message]──> Lead: impact-analysis.md written
  Lead: Batch and present at natural break

  Lead: Update coverage tracker from teammate findings
  Lead: Update meta.json at checkpoints
  Lead ──[Write]──> meta.json (DK-12)

  Each persona writes their own artifacts directly:
  Maya ──[Write]──> requirements-spec.md, user-stories.json
  Alex ──[Write]──> impact-analysis.md, architecture-overview.md
  Jordan ──[Write]──> design artifacts

  Each persona sends progress messages after writes:
  Maya ──[progress message]──> Lead
  Alex ──[progress message]──> Lead
  Jordan ──[progress message]──> Lead

Turn N+1 (Cross-check):
  Lead ──[cross-check task]──> Maya, Alex, Jordan
  Maya ──[cross-check response]──> Lead
  Alex ──[cross-check response]──> Lead
  Jordan ──[cross-check response]──> Lead
  Lead: Report to user

Turn N+2 (Finalization):
  (Same as single-agent mode)
```

## 4. State Mutation Points

### 4.1 Coverage Tracker State

The coverage tracker is the lead's central state structure. It exists only in the lead's working memory during a session.

```
LIFECYCLE:

  Initialize (Turn 0)
    Source: Topic files (coverage_criteria from YAML frontmatter)
    Action: Create TopicCoverage entry for each topic, all criteria unmet
    State: { topic_id, coverage_pct: 0, confidence: "low",
             last_discussed_turn: 0, criteria_met: [], criteria_total: [...] }

  Update (Each turn, after processing)
    Source: Conversation history + persona contributions
    Action: Lead evaluates each topic's criteria against conversation so far
    Mutator: Lead only (single writer)
    State change: coverage_pct increases, confidence may upgrade,
                  last_discussed_turn updated, criteria_met grows

  Checkpoint (On meta.json write)
    Source: Coverage tracker state
    Action: Covered topics (100% criteria met) appended to meta.topics_covered
    Sink: meta.json
    Note: Only the topic_id is persisted, not the full TopicCoverage structure

  Destroy (Session end)
    Granular state lost. On resume, reconstructed from meta.topics_covered
    (binary: covered or not covered, no per-criterion detail)
```

**Race condition analysis**: None. Single writer (lead) in both modes. In agent teams mode, teammates report findings to the lead; the lead is the sole mutator of coverage state.

### 4.2 Artifact Readiness State

Tracks when each artifact type has enough information to be written.

```
LIFECYCLE:

  Initialize (Turn 0)
    Source: Artifact ownership table + topic-to-artifact mapping
    Action: Create ArtifactReadiness entry for each artifact type
    State: { artifact_type, owner, status: "pending", threshold_met: false,
             write_count: 0, last_write_turn: 0, blocking_topics: [...] }

  Evaluate (Each turn, after coverage update)
    Source: Coverage tracker state
    Action: Check if blocking_topics are all in topics with sufficient coverage
    Mutator: Lead only
    State change: threshold_met flips to true when blocking criteria satisfied

  Trigger Write (When threshold_met becomes true)
    Action: Signal owning persona to write artifact
    State change: status -> "ready"

  Record Write (After persona writes artifact)
    Source: Persona write confirmation (or progress message in agent teams)
    Action: Update write count and status
    State change: status -> "written" (first) or "updated" (subsequent),
                  write_count++, last_write_turn = current turn

  Finalize (During cross-check)
    Action: Status upgraded after cross-check passes
    State change: status -> "finalized"
```

**Blocking topics per artifact type**:

| Artifact | Blocking Topics | Rationale |
|----------|----------------|-----------|
| quick-scan.md | (none -- written from codebase scan alone) | Lead writes immediately after scan |
| requirements-spec.md | problem-discovery (partial) | Need at least business context and one user type before first write |
| user-stories.json | requirements-definition (partial) | Need FRs defined before stories |
| traceability-matrix.csv | requirements-definition (full) | Need complete FR/AC/story set |
| impact-analysis.md | technical-analysis (partial) | Need codebase scan and initial blast radius |
| architecture-overview.md | technical-analysis (partial), architecture (partial) | Need impact assessment and at least one architecture option |
| module-design.md | architecture (full) | Need architecture decisions firm |
| interface-spec.md | specification (partial) | Need module boundaries defined |
| data-flow.md | specification (partial) | Need module boundaries and interfaces |
| error-taxonomy.md | specification (partial) | Need interfaces defined (errors flow from interfaces) |
| design-summary.md | specification (full) | Needs all other design artifacts |

### 4.3 Conversation State

```
LIFECYCLE:

  Initialize (Turn 0)
    State: { turn_number: 0, active_persona: "business-analyst",
             pending_contributions: [], user_expertise_signal: "unknown",
             completion_suggested: false, early_exit: false }

  Per Turn:
    turn_number: Incremented by 1 per processing cycle
    active_persona: Set by lead based on conversation context
    pending_contributions: Populated by non-active personas, flushed at natural breaks
    user_expertise_signal: Updated based on user's responses (technical detail = "technical",
                          business focus = "business", mixed = "balanced")
    completion_suggested: Set to true when all topics covered and artifacts written
    early_exit: Set to true when user signals early termination
```

### 4.4 Meta.json State

```
LIFECYCLE:

  Read (Turn 0)
    Source: META_CONTEXT in dispatch prompt
    Action: Parse JSON, extract progress fields
    Used by: Lead for resume detection, coverage initialization

  Checkpoint Writes (Turns 1..N)
    Triggers: After codebase scan, after each artifact first write,
              after each topic covered, on early exit
    Mutator: Lead only
    Fields mutated: phases_completed, steps_completed, topics_covered,
                    codebase_hash, analysis_status

  Final Write (Finalization)
    Trigger: User confirms completion or early exit
    Fields mutated: analysis_status -> "partial"
    Note: isdlc.md upgrades to "analyzed" after return using deriveAnalysisStatus()
```

**State transitions for analysis_status**:

```
"raw" ──[first artifact written]──> "partial" ──[isdlc.md post-return]──> "analyzed"
                                         ^                                      |
                                         |──────[resume, more work]─────────────+
```

**State transitions for phases_completed** (progressive population):

```
[] ──[quick-scan written]──> ["00-quick-scan"]
   ──[requirements-spec first write]──> [..., "01-requirements"]
   ──[impact-analysis first write]──> [..., "02-impact-analysis"]
   ──[architecture-overview first write]──> [..., "03-architecture"]
   ──[design artifacts first write]──> [..., "04-design"]
```

Phases may be added out of order. Alex may write impact-analysis.md before Maya writes requirements-spec.md if Alex's codebase scan completes first and his threshold is met. The phases_completed array reflects artifact existence, not conversation order.

## 5. Data Transformations

### 5.1 Draft Content -> Conversation Context

```
INPUT:  Raw draft.md content (from intake -- may be a GitHub issue body,
        Jira ticket description, or manually written summary)
TRANSFORM: Lead distills into:
  - Item summary (for persona spawn briefs in agent teams mode)
  - Known facts (what the draft already answers)
  - Open questions (what the draft does NOT address)
USED BY: Maya (to avoid re-asking what's in the draft)
         Alex (to identify keywords for codebase scan)
         Jordan (to note any design hints)
```

### 5.2 Codebase Scan -> Structured Findings

```
INPUT:  Raw Grep/Glob results (keyword hits, file paths, line counts)
TRANSFORM: Alex structures into:
  - Keyword hit table: keyword, hit_count, key_files
  - Module distribution: which directories/modules are affected
  - Pattern identification: naming conventions, integration patterns
  - Scope estimate: file count breakdown (new, modify, test)
OUTPUT: quick-scan.md (Lead writes)
        impact-analysis.md blast radius section (Alex writes)
ALSO:   Findings shared with Maya (requirement implications)
        and Jordan (design constraints)
```

### 5.3 Conversation -> Coverage Criteria Evaluation

```
INPUT:  Conversation history (all turns)
        Topic coverage_criteria (from topic files)
TRANSFORM: Lead evaluates each criterion against conversation content:
  - Criterion is a natural language condition (e.g., "Business problem
    articulated in user impact terms")
  - Lead uses judgment to determine if the condition is satisfied
  - No regex matching or keyword detection -- this is LLM reasoning
OUTPUT: TopicCoverage state update (coverage_pct, criteria_met)
```

### 5.4 Coverage State -> Artifact Trigger

```
INPUT:  TopicCoverage array (current state)
        ArtifactReadiness array (blocking_topics per artifact)
TRANSFORM: For each artifact:
  - Check if all blocking_topics have sufficient coverage
  - "Sufficient" = coverage_pct > 0 for "partial" blocking,
                   coverage_pct == 100 for "full" blocking
OUTPUT: ArtifactReadiness.threshold_met = true (triggers write)
```

### 5.5 Conversation + Persona Knowledge -> Artifact Content

```
INPUT:  Conversation history (relevant portions)
        Persona analytical approach (from persona file)
        Topic analytical knowledge (from topic files)
        Existing artifact content (if progressive update)
TRANSFORM: Persona synthesizes analysis into structured artifact content:
  - Follows artifact section structure from persona file
  - Applies self-validation protocol before writing
  - Assigns confidence indicators per section
  - Marks pending sections
  - Flags assumptions
OUTPUT: Complete artifact file (Write tool)
```

### 5.6 Topics Covered -> Steps Completed (Backward Compat Mapping)

```
INPUT:  topic_id newly covered
        Topic file source_step_files field
TRANSFORM: Look up source_step_files for the covered topic.
           Append each step_id to meta.steps_completed.
OUTPUT: meta.steps_completed array (backward compatible with
        deriveAnalysisStatus())

MAPPING TABLE:
  problem-discovery     -> [00-01, 01-01, 01-02, 01-03]
  requirements-definition -> [01-04, 01-05, 01-06, 01-07, 01-08]
  technical-analysis    -> [00-02, 00-03, 02-01, 02-02, 02-03, 02-04]
  architecture          -> [03-01, 03-02, 03-03, 03-04]
  specification         -> [04-01, 04-02, 04-03, 04-04, 04-05]
  security              -> (no mapping -- new topic, no legacy steps)
```

## 6. State Synchronization (Agent Teams Mode)

### 6.1 Shared Resources

| Resource | Concurrent Readers | Concurrent Writers | Conflict Risk |
|----------|-------------------|-------------------|---------------|
| meta.json | Lead | Lead only | None -- single writer |
| requirements-spec.md | Alex, Jordan (for context) | Maya only | None -- single writer |
| impact-analysis.md | Maya, Jordan (for context) | Alex only | None -- single writer |
| architecture-overview.md | Maya, Jordan (for context) | Alex only | None -- single writer |
| Design artifacts | Maya, Alex (for context) | Jordan only | None -- single writer |
| quick-scan.md | All personas | Lead only | None -- single writer |

### 6.2 Write Ordering Guarantees

No ordering guarantees between teammates. Each persona writes independently to their owned artifacts. The file system provides atomic file replacement (each Write tool call replaces the entire file).

Potential scenario:
```
T=1: Alex writes impact-analysis.md v1
T=2: Jordan reads impact-analysis.md v1 for context
T=3: Alex writes impact-analysis.md v2 (updated)
T=4: Jordan writes interface-spec.md based on v1 data
```

This is acceptable because:
- Jordan's interface-spec.md is based on correct-at-time-of-read data
- The cross-check (FR-012) catches any inconsistencies at finalization
- Progressive writes mean v2 is a superset of v1 (additive, not contradictory)

### 6.3 Message Ordering

Agent teams messages are asynchronous. The lead processes them in arrival order, which may not match send order. This is acceptable because:
- Progress messages are idempotent (same artifact status reported multiple times is harmless)
- Finding messages are context-independent (each finding is self-contained)
- Completion messages are terminal (processed once per persona)

### 6.4 Failure and Recovery Data Flow

```
SCENARIO: Alex crashes after writing impact-analysis.md but before completion.

Lead detects: Alex teammate is no longer responding.

Recovery data flow:
  Lead ──[Read]──> impact-analysis.md
  Lead: Parse metadata header (Status, Coverage fields)
  Lead: Determine what Alex covered (from Coverage field and Pending Sections)
  Lead: Continue Alex's work in single-agent mode
  Lead (as Alex) ──[Read]──> existing impact-analysis.md
  Lead (as Alex): Complete uncovered sections
  Lead (as Alex) ──[Write]──> impact-analysis.md (updated)
  Lead: Update meta.json
```

The self-describing document rules (metadata header, Pending Sections, Assumption markers) are the recovery mechanism. No separate crash log or checkpoint file is needed.

## 7. Session Persistence Boundary

### 7.1 What Persists Across Sessions

| Data | Storage | Granularity |
|------|---------|-------------|
| Topics covered | meta.json `topics_covered` | Topic-level (binary: covered or not) |
| Steps completed | meta.json `steps_completed` | Step-level (backward compat) |
| Phases completed | meta.json `phases_completed` | Phase-level (artifact-triggered) |
| Artifact content | Artifact files in `docs/requirements/{slug}/` | Full content, self-describing |
| Codebase hash | meta.json `codebase_hash` | Single hash value |
| Depth overrides | meta.json `depth_overrides` | Per-phase/topic depth preference |

### 7.2 What Is Lost on Session End

| Data | Impact | Mitigation |
|------|--------|------------|
| Coverage tracker (TopicCoverage array) | Per-criterion granularity lost | Reconstructed as binary (covered/not) from meta.topics_covered |
| Artifact readiness state | Write counts, thresholds lost | Reconstructed from artifact file existence and metadata headers |
| Conversation state | Turn number, active persona, pending contributions lost | Resume starts fresh conversation from uncovered topics |
| Pending persona contributions | Undelivered observations lost | Not critical -- new session generates fresh observations |
| User expertise signal | Adaptive behavior hint lost | Lead re-detects from user's responses in new session |

### 7.3 Resume Reconstruction Flow

```
On resume (meta.topics_covered is non-empty):

  1. Read meta.json -> extract topics_covered, phases_completed
  2. Read each existing artifact file -> extract Status and Coverage from metadata header
  3. Initialize coverage tracker:
     - Topics in meta.topics_covered -> coverage_pct: 100, all criteria marked met
     - Topics NOT in meta.topics_covered -> coverage_pct: 0 (fresh start for these)
  4. Initialize artifact readiness:
     - Artifacts that exist with Status != "Draft" -> status: "written"
     - Artifacts that don't exist -> status: "pending"
  5. Present resume greeting with summary of covered topics and existing artifacts
  6. Continue from first uncovered topic
```

## 8. Data Flow Diagram (Summary)

```
                    +-----------+
                    | isdlc.md  |
                    +-----+-----+
                          |
                   [Dispatch Prompt]
                   (slug, meta, draft,
                    sizing, constraints)
                          |
                          v
                  +-------+--------+
                  | roundtable-lead |
                  |  (orchestrator) |
                  +--+----+----+---+
                     |    |    |
         +-----------+    |    +------------+
         |                |                 |
         v                v                 v
   +-----+------+  +-----+------+  +-------+------+
   | Maya (BA)  |  | Alex (SA)  |  | Jordan (SD)  |
   +-----+------+  +-----+------+  +-------+------+
         |                |                 |
         |          [Codebase Scan]         |
         |          Grep/Glob/Read          |
         |                |                 |
         v                v                 v
   +-----+------+  +-----+------+  +-------+------+
   | req-spec   |  | impact-    |  | module-      |
   | stories    |  | analysis   |  | design       |
   | matrix     |  | arch-      |  | interface    |
   |            |  | overview   |  | data-flow    |
   +-----+------+  +-----+------+  | error-tax    |
         |                |         | design-sum   |
         +--------+-------+--------+-------+------+
                  |                         |
                  v                         v
           +-----+------+          +-------+------+
           | meta.json  |          | quick-scan   |
           | (Lead only)|          | (Lead only)  |
           +------------+          +--------------+
```

Arrows represent data flow direction. Each persona writes only to their owned artifacts. The lead writes meta.json and quick-scan.md. No shared write targets.
