# Interface Specification: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Draft
**Traces**: ADR-001, ADR-002, ADR-003, ADR-005, ADR-006, FR-001 through FR-017

---

## 1. Dispatch Prompt Interface (IP-1: isdlc.md -> roundtable-lead.md)

### 1.1 Contract

The single entry point into the roundtable analysis system. Replaces the per-phase delegation loop with a single Task delegation.

**Caller**: `isdlc.md` (analyze section)
**Callee**: `roundtable-lead.md` (via Task tool)
**Invocation**: One-time, at analyze start
**Replaces**: Lines 607-630 of current `isdlc.md` (per-phase loop with roundtable routing check)

### 1.2 Dispatch Prompt Format

```
Analyze '{slug}' using concurrent roundtable analysis.

ARTIFACT_FOLDER: docs/requirements/{slug}/
SLUG: {slug}
SOURCE: {source}
SOURCE_ID: {source_id}

META_CONTEXT:
{JSON.stringify(meta, null, 2)}

DRAFT_CONTENT:
{full contents of docs/requirements/{slug}/draft.md}

SIZING_INFO:
  light_flag: {true|false}
  sizing_decision: {JSON.stringify(meta.sizing_decision) || "null"}

ANALYSIS_MODE: No state.json writes, no branch creation.
```

### 1.3 Field Specifications

| Field | Type | Required | Description | Source |
|-------|------|----------|-------------|--------|
| SLUG | string | Yes | Kebab-case item identifier | meta.slug |
| ARTIFACT_FOLDER | string | Yes | Relative path to artifact directory | Derived from slug |
| SOURCE | string | Yes | Origin system: "github", "jira", "manual" | meta.source |
| SOURCE_ID | string | Yes | Origin identifier: "GH-63", "PROJ-123" | meta.source_id |
| META_CONTEXT | JSON string | Yes | Full meta.json content, pretty-printed | readMetaJson() |
| DRAFT_CONTENT | string | Yes | Full contents of draft.md, always inline (ADR-005). If draft.md does not exist, this field contains: "(No draft available)" | File read of draft.md |
| SIZING_INFO.light_flag | boolean | Yes | Whether -light flag was passed | CLI flag parsing |
| SIZING_INFO.sizing_decision | JSON or null | Yes | Prior sizing decision if exists | meta.sizing_decision |
| ANALYSIS_MODE | string | Yes | Constraint marker (literal string) | Hardcoded |

### 1.4 Task Description Format

The Task tool's `description` parameter (shown in UI) uses:

```
Concurrent analysis for {slug}
```

This replaces the per-phase `Phase {N}/{total} for {slug}` format.

### 1.5 Return Protocol

The lead returns control to `isdlc.md` when:
- User confirms completion (natural completion)
- User exits early ("that's enough", "I'm done")
- All topics covered and cross-check complete

On return, `isdlc.md`:
1. Reads updated meta.json from artifact folder
2. Populates `phases_completed` with any phases the lead added
3. Runs sizing trigger (Section 7.5 in current isdlc.md) if not already run
4. Runs tier computation (Section 7.6 in current isdlc.md)
5. Updates analysis_status, codebase_hash, BACKLOG.md marker

### 1.6 Error Handling

| Error Condition | isdlc.md Behavior |
|-----------------|-------------------|
| Lead Task fails/crashes | Display error to user. meta.json preserves progress from last write. User re-invokes analyze to resume. |
| Lead returns without writing meta.json | Read existing meta.json. If unchanged from dispatch, treat as no progress. Warn user. |
| Draft.md missing | Include "(No draft available)" in DRAFT_CONTENT. Lead proceeds with user conversation only. |

### 1.7 Example: Valid Dispatch

```
Analyze 'REQ-0032-concurrent-phase-execution-in-roundtable-analyze' using concurrent roundtable analysis.

ARTIFACT_FOLDER: docs/requirements/REQ-0032-concurrent-phase-execution-in-roundtable-analyze/
SLUG: REQ-0032-concurrent-phase-execution-in-roundtable-analyze
SOURCE: github
SOURCE_ID: GH-63

META_CONTEXT:
{
  "source": "github",
  "source_id": "GH-63",
  "slug": "REQ-0032-concurrent-phase-execution-in-roundtable-analyze",
  "created_at": "2026-02-21T00:00:00.000Z",
  "analysis_status": "raw",
  "phases_completed": [],
  "steps_completed": [],
  "topics_covered": [],
  "codebase_hash": "4775a76",
  "depth_overrides": {}
}

DRAFT_CONTENT:
# Concurrent Phase Execution in Roundtable Analyze
(full draft content here...)

SIZING_INFO:
  light_flag: false
  sizing_decision: null

ANALYSIS_MODE: No state.json writes, no branch creation.
```

---

## 2. Persona File Read Interface (IP-2: Lead -> Persona Files, Single-Agent Mode)

### 2.1 Contract

In single-agent mode, the lead reads all three persona files at startup to load their identity, principles, voice rules, and artifact responsibilities into its context.

**Caller**: roundtable-lead.md
**Callee**: persona-*.md files (passive -- file read)
**Invocation**: Once at startup, all three files read sequentially
**Tool**: Read tool

### 2.2 File Paths

```
src/claude/agents/persona-business-analyst.md
src/claude/agents/persona-solutions-architect.md
src/claude/agents/persona-system-designer.md
```

### 2.3 Expected File Structure

Each persona file follows the section layout defined in module-design.md (Sections 3.3, 4.3, 5.3). The lead expects:

1. **YAML frontmatter** with `name` and `description` fields
2. **Section 1: Identity** -- persona name, role, communication style
3. **Section 3: Voice Integrity Rules** -- DO/DO NOT lists for anti-blending enforcement
4. **Section 5: Interaction Style** -- how the persona interacts with user and other personas
5. **Section 6: Artifact Responsibilities** -- which artifacts this persona owns and writes

The lead does NOT parse these sections programmatically. It reads the full file content and incorporates it into its behavior as supplemental instructions.

### 2.4 Error Handling

| Error Condition | Lead Behavior |
|-----------------|---------------|
| Persona file missing | Log warning: "Persona file {path} not found. Continuing without {persona_name}." Continue with remaining personas. Degraded coverage -- artifacts owned by missing persona will not be written. |
| Persona file empty | Same as missing. |
| Persona file malformed (no frontmatter) | Read content as-is. Log warning. Best-effort interpretation. |

---

## 3. Agent Teams Spawn Interface (IP-3: Lead -> Persona Files, Agent Teams Mode)

### 3.1 Contract

In agent teams mode, the lead spawns each persona as a separate Claude Code teammate. The persona file content becomes the spawn prompt, augmented with a context brief from the lead.

**Caller**: roundtable-lead.md
**Callee**: persona-*.md files (active -- spawned as teammates)
**Invocation**: Once at startup, up to three teammates spawned
**Tool**: Task tool (agent teams variant)

### 3.2 Spawn Prompt Format

```
{full persona file content}

---

CONTEXT BRIEF FROM LEAD:

ARTIFACT_FOLDER: {artifact_folder}
SLUG: {slug}
SOURCE_ID: {source_id}

ITEM SUMMARY:
{lead's 3-5 sentence distillation of the draft content, focusing on:
  - What the item is about (one sentence)
  - Key stakeholders/users (one sentence)
  - Known technical constraints (one sentence)
  - Scope estimate if available from quick-scan (one sentence)
  - Any prior analysis context from meta.json (one sentence if applicable)}

CODEBASE SCAN SUMMARY (Alex only):
{For Alex's spawn only: lead includes initial codebase scan results --
  keyword hits, file counts, key file paths. For Maya and Jordan, this
  section is omitted.}

YOUR TASK:
- Conduct analysis from your persona's perspective
- Write your owned artifacts to the artifact folder as information thresholds are met
- Report progress to the lead using the message protocol (see below)
- Do NOT write meta.json -- the lead handles all meta.json writes

MESSAGE PROTOCOL:
Report progress as JSON: { "type": "progress", "persona": "{persona_key}", "artifact": "{filename}", "status": "written|updated|finalized", "coverage_summary": "{one-line summary of what's covered}" }
Report findings as JSON: { "type": "finding", "persona": "{persona_key}", "topic": "{topic_id}", "content": "{observation or recommendation}", "confidence": "high|medium|low" }
Report completion as JSON: { "type": "complete", "persona": "{persona_key}", "artifacts_written": ["{filename}", ...], "open_questions": ["{question}", ...] }

ANALYSIS_MODE: No state.json writes, no branch creation.
```

### 3.3 Context Brief Specifications

| Field | Max Length | Content Rules |
|-------|-----------|---------------|
| ITEM SUMMARY | 5 sentences | Lead distills draft.md. No raw dump. Focus on what personas need to start working. |
| CODEBASE SCAN SUMMARY | ~50 lines | Alex only. Keyword hit table, key file paths, module distribution. Omit for Maya and Jordan. |

### 3.4 Spawn Order

1. **Alex first** -- needs to start codebase scan immediately (FR-002)
2. **Maya second** -- opens user conversation while Alex scans
3. **Jordan last** -- needs architecture context that emerges from Alex and Maya's work

### 3.5 Error Handling

| Error Condition | Lead Behavior |
|-----------------|---------------|
| Teammate spawn fails | Log warning. Fall back to single-agent mode for that persona's work. Continue conversation. |
| Teammate crashes mid-analysis | Read whatever artifacts the failed teammate has written (ADR-006). Continue in single-agent mode for that persona's remaining work. |
| Agent teams feature not available | Detect at startup (check for feature flag). Use single-agent mode entirely. No error -- this is the default path. |

---

## 4. Agent Teams Message Interface (IP-3b: Teammate -> Lead)

### 4.1 Contract

Teammates communicate findings, progress, and completion to the lead via structured JSON messages through the agent teams messaging system.

**Caller**: Persona teammates (Maya, Alex, Jordan)
**Callee**: roundtable-lead.md
**Direction**: Teammate -> Lead (one-way reports; lead coordinates via task assignments)

### 4.2 Message Types

#### 4.2.1 Progress Message

Sent when a persona writes or updates an artifact.

```json
{
  "type": "progress",
  "persona": "business-analyst",
  "artifact": "requirements-spec.md",
  "status": "written",
  "coverage_summary": "Business context, stakeholders, and 12 FRs with ACs defined. User journeys pending."
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| type | string | Yes | "progress" |
| persona | string | Yes | "business-analyst", "solutions-architect", "system-designer" |
| artifact | string | Yes | Filename of artifact written |
| status | string | Yes | "written" (first write), "updated" (subsequent), "finalized" (cross-check complete) |
| coverage_summary | string | Yes | One-line description of what the artifact currently covers |

#### 4.2.2 Finding Message

Sent when a persona discovers something relevant to the conversation or other personas.

```json
{
  "type": "finding",
  "persona": "solutions-architect",
  "topic": "technical-analysis",
  "content": "The isdlc.md dispatch loop spans lines 607-674 with 6 integration points. Sizing logic at lines 633-658 must be relocated.",
  "confidence": "high"
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| type | string | Yes | "finding" |
| persona | string | Yes | Persona key |
| topic | string | Yes | topic_id from topic files |
| content | string | Yes | The finding -- observation, recommendation, or flag |
| confidence | string | Yes | "high", "medium", "low" |

#### 4.2.3 Completion Message

Sent when a persona has finished all their analysis work.

```json
{
  "type": "complete",
  "persona": "system-designer",
  "artifacts_written": ["module-design.md", "interface-spec.md", "data-flow.md", "error-taxonomy.md"],
  "open_questions": ["Should the coverage tracker persist across sessions?"]
}
```

| Field | Type | Required | Values |
|-------|------|----------|--------|
| type | string | Yes | "complete" |
| persona | string | Yes | Persona key |
| artifacts_written | string[] | Yes | List of artifact filenames produced |
| open_questions | string[] | Yes | Unresolved questions (may be empty array) |

### 4.3 Message Ordering

Messages are asynchronous. The lead processes them at natural conversation breaks. No guaranteed ordering between teammates. The lead batches findings from multiple personas and presents them together when contextually appropriate.

### 4.4 Error Handling

| Error Condition | Lead Behavior |
|-----------------|---------------|
| Malformed JSON message | Log warning. Attempt natural-language interpretation of the message content. |
| Missing required field | Log warning. Process available fields. |
| Unexpected message type | Log warning. Ignore the message. |

---

## 5. Topic File Consumption Interface (IP-4: Lead/Personas -> Topic Files)

### 5.1 Contract

The lead and personas read topic files for analytical guidance and coverage criteria. Topic files are passive reference documents.

**Caller**: roundtable-lead.md (for coverage tracking), persona files (for analytical knowledge)
**Callee**: analysis-topics/**/*.md (passive -- file read)
**Tool**: Glob tool (discovery) + Read tool (content)

### 5.2 Discovery Protocol

#### Mode 1 (Interim): Step Files

```
Path pattern: src/claude/skills/analysis-steps/{phase_key}/*.md
Discovery: Glob tool with pattern above
Content interpretation: Read body sections for analytical knowledge. Ignore step_id, depends_on, skip_if.
Coverage criteria: Derived from Validation section of each step file.
```

#### Mode 2 (Final): Topic Files

```
Path pattern: src/claude/skills/analysis-topics/**/*.md
Discovery: Glob tool with pattern above
Content interpretation: Read YAML frontmatter for coverage_criteria. Read body for analytical knowledge.
Coverage criteria: Explicit in frontmatter coverage_criteria array.
```

### 5.3 Topic File YAML Frontmatter Schema

```yaml
---
topic_id: string          # Required. Unique identifier. e.g., "problem-discovery"
topic_name: string        # Required. Human-readable name. e.g., "Problem Discovery"
primary_persona: string   # Required. Persona key who leads this topic.
contributing_personas:    # Optional. Other personas who may contribute.
  - string
coverage_criteria:        # Required. List of conditions that define "adequately covered".
  - string                # Each string is a testable condition.
artifact_sections:        # Required. Maps this topic to artifact file sections.
  - artifact: string      # Artifact filename
    sections:             # Sections in that artifact fed by this topic
      - string
depth_guidance:           # Optional. Hints for brief/standard/deep modes.
  brief: string
  standard: string
  deep: string
source_step_files:        # Required. Traceability to original step files.
  - string                # step_id values
---
```

### 5.4 Coverage Criteria Evaluation

The lead evaluates each criterion in `coverage_criteria` as a boolean: met or not met. A topic is "adequately covered" when ALL criteria are met.

```typescript
// Lead's evaluation logic (pseudocode, executed as reasoning, not code)
function evaluateTopicCoverage(topic: TopicFile, conversationHistory: Turn[]): TopicCoverage {
  const criteria_met: string[] = [];
  for (const criterion of topic.coverage_criteria) {
    if (criterionSatisfiedByConversation(criterion, conversationHistory)) {
      criteria_met.push(criterion);
    }
  }
  return {
    topic_id: topic.topic_id,
    topic_name: topic.topic_name,
    coverage_pct: (criteria_met.length / topic.coverage_criteria.length) * 100,
    confidence: deriveConfidence(criteria_met, conversationHistory),
    last_discussed_turn: findLastRelevantTurn(topic, conversationHistory),
    coverage_criteria_met: criteria_met,
    coverage_criteria_total: topic.coverage_criteria
  };
}
```

### 5.5 Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| Topic directory does not exist | Log warning. Proceed with built-in knowledge. |
| Topic file missing YAML frontmatter | Log warning. Read body content only. No coverage tracking for this topic. |
| Topic file missing coverage_criteria | Log warning. Topic cannot be tracked. Lead uses judgment for coverage. |
| Glob returns no files | Log warning. Proceed with built-in knowledge. |

---

## 6. Artifact Write Interface (IP-5: Lead/Personas -> Artifact Files)

### 6.1 Contract

Personas write artifacts progressively throughout the conversation. Each write produces a complete, self-describing file. The lead coordinates timing via information thresholds.

**Caller**: Personas (Maya, Alex, Jordan) for their owned artifacts; Lead for meta.json and quick-scan.md
**Target**: docs/requirements/{slug}/*.md, *.json, *.csv
**Tool**: Write tool
**Mode**: Complete file replacement on each write (not append)

### 6.2 Standard Metadata Header Block

Every artifact file (except meta.json) begins with a standard metadata header:

```markdown
# {Artifact Title}

**Source**: {source_id}
**Date**: {YYYY-MM-DD}
**Status**: {Draft | In Progress | Complete}
**Confidence**: {High | Medium | Low | Mixed}
**Last Updated**: Turn {N}
**Coverage**: {one-line summary of what's covered and what remains}

---
```

| Field | Type | Values | Description |
|-------|------|--------|-------------|
| Source | string | source_id from dispatch | Traceability to origin |
| Date | string | ISO date | Date of first write |
| Status | string | "Draft" (first write), "In Progress" (updated), "Complete" (finalized) | Artifact lifecycle stage |
| Confidence | string | "High", "Medium", "Low", "Mixed" | Overall confidence. "Mixed" when sections vary. |
| Last Updated | string | "Turn {N}" | Conversation turn number of last write |
| Coverage | string | Free text | Self-describing: what's covered and what's not. e.g., "Business context and 12 FRs defined. User journeys and MoSCoW pending." |

### 6.3 Progressive Write Protocol

```
WRITE SEQUENCE:
1. Persona determines information threshold is met for an artifact (or section)
2. Persona runs self-validation (Gate 1) against its validation protocol
3. If validation passes:
   a. Read existing artifact file (if exists) using Read tool
   b. Merge new content with existing content (preserve sections not being updated)
   c. Update metadata header (Status, Confidence, Last Updated, Coverage)
   d. Write complete file using Write tool
   e. In agent teams mode: send progress message to lead
4. If validation fails:
   a. Continue conversation to gather missing information
   b. Re-attempt write when threshold re-evaluated
```

### 6.4 Self-Describing Document Rules

Every artifact must be readable by someone who has no context about the conversation:

1. **Sections not yet written**: Listed explicitly at the bottom of the file under a "## Pending Sections" heading. Removed when those sections are written.
2. **Low-confidence sections**: Marked with `**Confidence**: Low -- {reason}` immediately after the section heading.
3. **Assumptions**: Flagged inline with `> **Assumption**: {assumption}. Flagged for validation.`
4. **TBD markers**: Used in tables for cells where analysis is incomplete. Format: `TBD -- {what's needed}`.

### 6.5 Artifact Ownership Enforcement

| Artifact | Owner | Other Personas |
|----------|-------|----------------|
| requirements-spec.md | Maya | Alex may flag technical concerns via lead. Jordan may request precision via lead. Neither writes directly. |
| user-stories.json | Maya | Read-only for others. |
| traceability-matrix.csv | Maya | Read-only for others. |
| impact-analysis.md | Alex | Read-only for others. |
| architecture-overview.md | Alex | Read-only for others. |
| module-design.md / module-design-{name}.md | Jordan | Read-only for others. |
| interface-spec.md | Jordan | Read-only for others. |
| data-flow.md | Jordan | Read-only for others. |
| error-taxonomy.md | Jordan | Read-only for others. |
| design-summary.md | Jordan | Read-only for others. |
| quick-scan.md | Lead | Written once at start from codebase scan results. |
| meta.json | Lead | Personas report progress; only lead writes. |

### 6.6 Cross-Persona Contribution Protocol

When a persona needs to contribute content to another persona's artifact:

1. The contributing persona communicates the content to the lead (via conversation in single-agent mode, or via finding message in agent teams mode)
2. The lead relays the content to the owning persona
3. The owning persona decides how to incorporate it and writes the update
4. The contributing persona NEVER writes to another persona's artifact directly

### 6.7 Error Handling

| Error Condition | Behavior |
|-----------------|----------|
| Write fails (file system error) | Retry once. On second failure, warn user. Previous file version preserved (write is atomic replacement). |
| Existing file cannot be read before merge | Write new content as-is (treat as first write). Log warning. |
| Artifact folder does not exist | Create it using Bash mkdir. Then write. |

---

## 7. Meta.json Read/Write Interface (IP-6: Lead -> meta.json)

### 7.1 Contract

The lead is the sole writer of meta.json. It reads on startup, updates progressively during the conversation, and writes a final version on completion.

**Caller**: roundtable-lead.md (sole writer)
**Target**: docs/requirements/{slug}/meta.json
**Tool**: Read tool + Write tool

### 7.2 Schema (Mode 1 -- Interim, Dual Fields)

```json
{
  "source": "github",
  "source_id": "GH-63",
  "slug": "REQ-0032-concurrent-phase-execution-in-roundtable-analyze",
  "created_at": "2026-02-21T00:00:00.000Z",
  "analysis_status": "partial",
  "phases_completed": ["00-quick-scan", "01-requirements"],
  "steps_completed": ["00-01", "00-02", "00-03", "01-01"],
  "topics_covered": ["problem-discovery", "requirements-definition"],
  "codebase_hash": "4775a76",
  "depth_overrides": {
    "01-requirements": "deep"
  },
  "sizing_decision": null,
  "recommended_tier": null
}
```

### 7.3 Field Specifications

| Field | Type | Required | Writable By | Description |
|-------|------|----------|-------------|-------------|
| source | string | Yes | isdlc.md (at creation) | Origin system |
| source_id | string | Yes | isdlc.md (at creation) | Origin identifier |
| slug | string | Yes | isdlc.md (at creation) | Kebab-case item identifier |
| created_at | string (ISO-8601) | Yes | isdlc.md (at creation) | Timestamp of meta.json creation |
| analysis_status | string | Yes | Lead + isdlc.md | "raw", "partial", "analyzed". Lead sets "partial" during analysis. isdlc.md sets final value via deriveAnalysisStatus(). |
| phases_completed | string[] | Yes | Lead | 5-phase array: ["00-quick-scan", "01-requirements", "02-impact-analysis", "03-architecture", "04-design"]. Lead appends progressively as artifact types are written. Preserved for backward compatibility with deriveAnalysisStatus(). |
| steps_completed | string[] | Yes | Lead | Step IDs completed. Populated in Mode 1 for backward compatibility. Maps topic completion to equivalent step IDs. |
| topics_covered | string[] | No (new field) | Lead | Topic IDs adequately covered. New field for concurrent model. Populated alongside steps_completed in Mode 1. |
| codebase_hash | string | Yes | Lead + isdlc.md | Git HEAD short SHA at time of analysis |
| depth_overrides | object | No | Lead | Per-phase or per-topic depth overrides from user |
| sizing_decision | object or null | No | isdlc.md | Sizing decision (written by isdlc.md, not lead) |
| recommended_tier | string or null | No | isdlc.md | Tier computation result (written by isdlc.md, not lead) |

### 7.4 phases_completed Population Rules

The lead populates `phases_completed` progressively based on artifact writes, NOT based on conversation phases (which no longer exist):

| Trigger | Phase Added | Condition |
|---------|-------------|-----------|
| quick-scan.md written | "00-quick-scan" | Codebase scan results documented |
| requirements-spec.md first write | "01-requirements" | Core FRs with ACs defined (Maya's threshold) |
| impact-analysis.md first write | "02-impact-analysis" | Blast radius and risk zones documented (Alex's threshold) |
| architecture-overview.md first write | "03-architecture" | Architecture options evaluated, ADRs written (Alex's threshold) |
| design artifacts first write | "04-design" | Module design and interface contracts specified (Jordan's threshold) |

### 7.5 topics_covered Population Rules

The lead appends a topic_id to `topics_covered` when ALL coverage criteria for that topic are met:

```typescript
// Pseudocode -- lead's reasoning, not executable code
if (allCriteriaMet(topic.coverage_criteria, conversationHistory)) {
  meta.topics_covered.push(topic.topic_id);
}
```

### 7.6 steps_completed Backward-Compat Mapping (Mode 1)

When a topic is covered, the lead also appends the equivalent step_ids to `steps_completed` using the topic file's `source_step_files` field:

| Topic Covered | Step IDs Appended |
|---------------|-------------------|
| problem-discovery | 00-01, 01-01, 01-02, 01-03 |
| requirements-definition | 01-04, 01-05, 01-06, 01-07, 01-08 |
| technical-analysis | 00-02, 00-03, 02-01, 02-02, 02-03, 02-04 |
| architecture | 03-01, 03-02, 03-03, 03-04 |
| specification | 04-01, 04-02, 04-03, 04-04, 04-05 |
| security | (no equivalent step IDs -- new topic) |

### 7.7 Write Checkpoints

The lead writes meta.json at these points:

1. **After codebase scan**: phases_completed += "00-quick-scan", codebase_hash set
2. **After each artifact first write**: phases_completed updated per Section 7.4
3. **After each topic covered**: topics_covered and steps_completed updated
4. **On early exit**: Current state preserved
5. **On finalization**: analysis_status set to "partial" (isdlc.md upgrades to "analyzed" after return)

### 7.8 Error Handling

| Error Condition | Lead Behavior |
|-----------------|---------------|
| meta.json read fails at startup | Treat as fresh analysis. Create default meta.json: { source, source_id, slug from dispatch, analysis_status: "raw", phases_completed: [], steps_completed: [], topics_covered: [], codebase_hash: current HEAD } |
| meta.json write fails | Retry once. On second failure, warn user: "Progress tracking may be incomplete. Analysis continues but session may not be fully resumable." Continue analysis. |
| meta.json contains unexpected fields | Preserve all existing fields. Add new fields. Never delete fields not owned by the lead. |

---

## 8. Cross-Check Interface (FR-012: Lead -> All Personas)

### 8.1 Contract

Before finalization, the lead triggers a cross-persona consistency check. In single-agent mode, the lead performs this internally. In agent teams mode, the lead sends a cross-check task to each active teammate.

### 8.2 Cross-Check Protocol

```
SEQUENCE:
1. Lead announces to user: "Before we wrap up, I'm having Alex and Jordan verify their artifacts are consistent with the final requirements."
2. Lead reads all artifacts from artifact folder
3. For each persona's artifacts:
   a. Check that FRs referenced in impact/architecture/design exist in requirements-spec.md
   b. Check that integration points in architecture match interfaces in interface-spec.md
   c. Check that module boundaries in module-design.md align with architecture-overview.md
   d. Check that confidence indicators are consistent (an FR marked "high" in requirements should not have "low" confidence in the architecture that implements it)
4. For each inconsistency found:
   a. The owning persona corrects their artifact
   b. The lead notes the correction
5. Lead reports corrections to user: "Found {N} inconsistencies. {brief description of each}. All corrected."
6. If zero inconsistencies: "All artifacts are consistent. Ready to finalize."
```

### 8.3 Agent Teams Cross-Check Task

In agent teams mode, the lead sends each teammate a cross-check task:

```
CROSS-CHECK: Review your artifacts for consistency with the final requirements.

REQUIREMENTS (current):
{requirements-spec.md content summary -- FR list with ACs}

YOUR ARTIFACTS:
{list of artifact filenames this persona owns}

CHECK FOR:
- FR references that don't exist in requirements
- Integration points that don't match other artifacts
- Confidence indicators that are inconsistent
- Any sections still marked TBD or Pending

RESPOND WITH:
{ "type": "cross-check", "persona": "{key}", "inconsistencies_found": N, "corrections_made": ["{description}"], "status": "clean|corrected" }
```

### 8.4 Cross-Check Response Message

```json
{
  "type": "cross-check",
  "persona": "solutions-architect",
  "inconsistencies_found": 1,
  "corrections_made": ["Updated ADR-003 to reference FR-009 AC-009-04 (was missing security topic reference)"],
  "status": "corrected"
}
```

---

## 9. Resumability Interface

### 9.1 Contract

When the lead is dispatched with a meta.json that has existing progress (topics_covered is non-empty or phases_completed is non-empty), it resumes from where the previous session left off.

### 9.2 Resume Detection

```typescript
// Lead's startup logic (pseudocode)
const meta = parseMeta(META_CONTEXT);
const isResume = meta.topics_covered?.length > 0 || meta.steps_completed?.length > 0;
const isFresh = !isResume;
```

### 9.3 Resume Protocol

```
IF isResume:
  1. Read all existing artifacts from artifact folder
  2. Determine which topics are already covered (from meta.topics_covered or meta.steps_completed)
  3. Determine which artifacts already exist and their status (from metadata headers)
  4. Open conversation with resume greeting:
     "Welcome back. Last time we covered {list of topics_covered}.
      Your artifacts so far: {list of existing artifacts with status}.
      Let's pick up from {first uncovered topic}."
  5. Continue conversation from uncovered topics
  6. Do NOT re-ask questions about covered topics unless user provides new information

IF isFresh:
  1. Start conversation from the beginning
  2. Maya opens naturally per persona instructions
```

### 9.4 Artifact Recovery (Agent Teams, ADR-006)

When a teammate fails mid-analysis and the lead recovers:

```
RECOVERY SEQUENCE:
1. Read all artifacts in artifact folder
2. For each artifact owned by failed persona:
   a. Read the artifact's metadata header (Status, Coverage fields)
   b. Determine what has been covered from the Coverage field
   c. Determine what remains from the Pending Sections list
3. Continue the failed persona's work in single-agent mode, starting from uncovered sections
4. Update the artifact (progressive write) with new content merged with existing
```

This is why the self-describing document rules (Section 6.4) are critical -- the lead must be able to determine coverage from the artifact alone, without any context about the conversation that produced it.
