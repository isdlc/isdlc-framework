# Error Taxonomy: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Draft
**Confidence**: High
**Last Updated**: Design phase
**Coverage**: All error conditions, severity model, recovery strategies, validation rules, and degradation modes documented.

---

## 1. Severity Model

All errors use a four-level severity scale. Each level has a defined behavior that applies consistently across the system.

| Level | Code | Behavior | User Notification | Analysis Continues? | Artifact Impact |
|-------|------|----------|-------------------|---------------------|-----------------|
| INFO | I | Logged internally. No user-visible effect. | None | Yes | None |
| WARNING | W | Logged internally. User notified with brief system message. | System message: "Warning: {description}" | Yes, with noted limitation | May produce incomplete artifacts |
| ERROR | E | Logged internally. User notified with description and impact. Recovery attempted. | System message: "Error: {description}. Impact: {impact}. Recovery: {action taken}." | Yes, in degraded mode | Affected artifacts may be missing or incomplete |
| FATAL | F | Logged internally. User notified. Analysis cannot continue. | System message: "Fatal: {description}. Analysis cannot continue. {resolution guidance}." | No -- session terminates | No further artifacts written. Previous writes preserved. |

### Severity Assignment Rules

- **INFO**: Condition is expected in normal operation (e.g., no prior analysis on fresh item)
- **WARNING**: Condition is unexpected but recoverable with no user action (e.g., missing optional file, retry succeeds)
- **ERROR**: Condition requires degraded operation or user awareness (e.g., persona missing, teammate crash)
- **FATAL**: Condition makes analysis impossible (e.g., artifact folder cannot be created, dispatch prompt malformed)

---

## 2. Error Code Registry

### 2.1 Dispatch and Startup Errors (RT-1xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-100 | FATAL | Dispatch prompt missing SLUG | SLUG field absent or empty in dispatch prompt | None -- cannot proceed without item identifier | "Fatal: Dispatch prompt missing SLUG field. Analysis cannot continue. Re-invoke analyze with a valid item identifier." |
| RT-101 | FATAL | Dispatch prompt missing ARTIFACT_FOLDER | ARTIFACT_FOLDER field absent or empty | None -- cannot write artifacts without target path | "Fatal: Dispatch prompt missing ARTIFACT_FOLDER. Analysis cannot continue. Re-invoke analyze." |
| RT-102 | WARNING | Dispatch prompt missing DRAFT_CONTENT | DRAFT_CONTENT field is "(No draft available)" or absent | Proceed without draft. Maya opens with broader discovery questions. | "Warning: No draft content available. Analysis will start from scratch without prior intake context." |
| RT-103 | INFO | Fresh analysis (no prior progress) | META_CONTEXT has empty phases_completed and topics_covered | Normal path -- initialize all state from scratch | (none) |
| RT-104 | INFO | Resumed analysis (prior progress exists) | META_CONTEXT has non-empty topics_covered or steps_completed | Resume from uncovered topics | (none) |
| RT-105 | WARNING | META_CONTEXT parse failure | META_CONTEXT field is not valid JSON | Treat as fresh analysis. Create default meta state. | "Warning: Could not parse prior progress data. Starting fresh analysis. Previous progress may need to be re-covered." |
| RT-106 | WARNING | Codebase hash mismatch on resume | meta.codebase_hash differs from current git HEAD | Continue analysis. Note that codebase has changed. Existing artifacts may reference stale code. | "Warning: Codebase has changed since last analysis session ({N} commits). Existing artifacts may reference stale code." |

### 2.2 Persona File Errors (RT-2xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-200 | ERROR | Persona file not found | Glob/Read for persona-*.md returns no result | Continue without this persona. Lead covers the missing persona's work in degraded mode (less specialized voice, reduced artifact depth). | "Error: {persona_file} not found. Impact: {persona_name}'s analysis will be limited. Recovery: Lead will cover {persona_name}'s responsibilities directly." |
| RT-201 | WARNING | Persona file empty | File exists but has no content | Same as RT-200 | "Warning: {persona_file} is empty. Lead will cover {persona_name}'s responsibilities directly." |
| RT-202 | WARNING | Persona file missing frontmatter | File exists but has no YAML frontmatter block | Read content as-is. Use file content as best-effort persona instructions. | "Warning: {persona_file} has no frontmatter. Proceeding with best-effort interpretation." |
| RT-203 | INFO | All persona files loaded successfully | All three files read without error | Normal path | (none) |

### 2.3 Topic File Errors (RT-3xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-300 | WARNING | Topic directory not found | Glob for analysis-topics/ or analysis-steps/ returns no results | Proceed with built-in analytical knowledge. Coverage tracking disabled (lead uses judgment only). | "Warning: Topic files not found. Analysis will proceed using built-in knowledge. Coverage tracking will rely on lead judgment." |
| RT-301 | WARNING | Topic file missing coverage_criteria | YAML frontmatter exists but coverage_criteria field is absent | Topic cannot be tracked. Exclude from coverage tracker. Lead uses judgment for this topic. | "Warning: Topic file {filename} has no coverage_criteria. This topic will not be tracked." |
| RT-302 | WARNING | Topic file missing frontmatter | File exists but no YAML block | Read body content for analytical knowledge. No coverage tracking for this topic. | "Warning: Topic file {filename} has no frontmatter. Using body content only." |
| RT-303 | INFO | All topic files loaded successfully | All files read and parsed without error | Normal path | (none) |
| RT-304 | WARNING | Topic file YAML parse error | YAML frontmatter is malformed | Skip this topic file entirely. Log which file failed. | "Warning: Could not parse {filename} frontmatter. Skipping this topic file." |

### 2.4 Agent Teams Errors (RT-4xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-400 | INFO | Agent teams not available | Feature flag not set or agent teams capability not detected at startup | Use single-agent mode. This is the default path. | (none) |
| RT-401 | ERROR | Teammate spawn failure | Task tool spawn for a persona returns error or times out | Fall back to single-agent mode for this persona's work. Other teammates (if any) continue. | "Error: Could not spawn {persona_name} as teammate. Impact: {persona_name}'s work will run in single-agent mode. Recovery: Analysis continues with reduced parallelism." |
| RT-402 | ERROR | Teammate crash mid-analysis | Teammate stops responding or returns error after initial activity | Read existing artifacts from crashed teammate (ADR-006). Continue in single-agent mode for remaining work. | "Error: {persona_name} teammate stopped responding. Impact: Recovering from written artifacts. Recovery: Continuing {persona_name}'s remaining work in single-agent mode." |
| RT-403 | WARNING | Teammate message malformed | Received message is not valid JSON or missing required fields | Log warning. Attempt natural-language interpretation. If uninterpretable, discard. | "Warning: Received malformed message from {persona_name}. Message discarded." |
| RT-404 | WARNING | Teammate message unexpected type | JSON parsed but type field not recognized | Log warning. Ignore message. | (none -- internal only) |
| RT-405 | ERROR | All teammates failed | All three teammate spawns fail or crash | Fall back to full single-agent mode. | "Error: All teammates unavailable. Recovery: Switching to single-agent mode. Analysis continues at reduced speed." |
| RT-406 | WARNING | Teammate progress message for unknown artifact | Progress message references an artifact not in ownership table | Log warning. Ignore message. Possible persona file misconfiguration. | (none -- internal only) |

### 2.5 Artifact Write Errors (RT-5xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-500 | WARNING | Artifact read failure before merge | Read tool fails when reading existing artifact for progressive update | Treat as first write. Write new content without merge. | "Warning: Could not read existing {filename}. Writing as new file." |
| RT-501 | ERROR | Artifact write failure (first attempt) | Write tool returns error | Retry once. | (none -- retry is transparent) |
| RT-502 | ERROR | Artifact write failure (retry failed) | Write tool fails on retry | Skip this artifact write. Warn user. Artifact from previous session (if any) preserved. Lead notes the failure for cross-check. | "Error: Could not write {filename}. Impact: This artifact will be missing or outdated. Recovery: Previous version preserved. Retry on next write trigger." |
| RT-503 | ERROR | Artifact folder does not exist | Write target path has no parent directory | Create directory using Bash mkdir. Then retry write. | (none if mkdir succeeds) |
| RT-504 | FATAL | Artifact folder creation fails | mkdir fails (permissions, disk full) | Cannot write any artifacts. Analysis terminates. | "Fatal: Cannot create artifact folder {path}. Analysis cannot continue. Check file system permissions and disk space." |
| RT-505 | WARNING | Self-validation failure | Persona's self-validation protocol detects issues before write | Do not write. Continue conversation to gather missing information. Re-attempt when threshold re-evaluated. | (none -- internal quality gate) |
| RT-506 | INFO | Artifact write successful | Write tool completes without error | Normal path. Update artifact readiness state. | (none) |

### 2.6 Meta.json Errors (RT-6xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-600 | WARNING | Meta.json read failure at startup | Read tool fails for meta.json in artifact folder | Create default meta.json from dispatch prompt fields. | "Warning: Could not read prior progress file. Starting with fresh progress tracking." |
| RT-601 | WARNING | Meta.json write failure (first attempt) | Write tool returns error | Retry once. | (none -- retry is transparent) |
| RT-602 | ERROR | Meta.json write failure (retry failed) | Write tool fails on retry | Continue analysis. Progress tracking is degraded -- session may not be fully resumable. | "Error: Could not save progress. Impact: If this session is interrupted, progress may not be fully resumable. Recovery: Analysis continues. Will retry on next checkpoint." |
| RT-603 | WARNING | Meta.json contains unexpected fields | Fields present that the lead does not recognize | Preserve all existing fields. Add/update only lead-owned fields. Never delete unknown fields. | (none -- transparent preservation) |
| RT-604 | INFO | Meta.json write successful | Write tool completes without error | Normal path | (none) |

### 2.7 Cross-Check Errors (RT-7xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-700 | WARNING | Cross-check cannot read artifact | An artifact file cannot be read during cross-check | Skip this artifact in cross-check. Note in report. | "Warning: Could not read {filename} during cross-check. Skipping consistency verification for this artifact." |
| RT-701 | INFO | Cross-check found inconsistencies | Inconsistencies detected between artifacts | Owning persona corrects. Normal cross-check flow. | "Found {N} inconsistencies. {descriptions}. All corrected." |
| RT-702 | INFO | Cross-check clean | No inconsistencies found | Normal completion path. | "All artifacts are consistent. Ready to finalize." |
| RT-703 | ERROR | Cross-check correction write fails | Persona attempts to correct artifact but write fails (RT-502) | Note the uncorrected inconsistency. Report to user. Finalize with known issue. | "Error: Could not correct inconsistency in {filename}. Known issue documented. Proceed with caution during implementation." |
| RT-704 | WARNING | Teammate cross-check timeout (agent teams) | Teammate does not respond to cross-check task within reasonable time | Lead performs cross-check for that persona's artifacts in single-agent mode. | "Warning: {persona_name} did not respond to cross-check. Lead verifying {persona_name}'s artifacts directly." |

### 2.8 Conversation Flow Errors (RT-8xx)

| Code | Severity | Description | Trigger | Recovery | User Message |
|------|----------|-------------|---------|----------|--------------|
| RT-800 | INFO | User requests early exit | User says "that's enough", "I'm done", or similar | Write partial artifacts with honest confidence indicators. Flag uncovered topics. Update meta.json. | (Handled in-conversation, not as error message) |
| RT-801 | INFO | User requests deeper exploration | User asks for more depth after completion suggestion | Route to relevant persona. Continue from current state. | (Handled in-conversation) |
| RT-802 | WARNING | Coverage tracker stalled | 5+ turns pass with no coverage progress on any topic | Lead gently steers conversation: "We've been discussing {current topic} -- shall we continue here or move on to {uncovered topic}?" | (Handled in-conversation as natural steering) |
| RT-803 | INFO | Depth override detected | User says "go deeper", "brief", "keep it short", etc. | Update depth preference. Adjust conversation approach. | (Acknowledged in-conversation) |

---

## 3. Error Propagation Strategy

### 3.1 Propagation Rules

```
RULE 1: Errors at INFO and WARNING levels are handled locally.
  - The component that encounters the error handles it.
  - INFO: No propagation. Logged only.
  - WARNING: Logged + user notification (if applicable). No escalation.

RULE 2: Errors at ERROR level propagate to the lead.
  - In single-agent mode: Lead handles directly (it IS the component).
  - In agent teams mode: Teammate reports error in next message to lead.
    Error message format: { "type": "error", "persona": "{key}",
                            "code": "RT-xxx", "description": "...",
                            "recovery_taken": "..." }
  - Lead decides whether to inform user based on user impact.

RULE 3: Errors at FATAL level terminate the session.
  - Lead writes whatever progress has been made to meta.json.
  - Lead informs user with resolution guidance.
  - Control returns to isdlc.md.

RULE 4: Errors never propagate upward past isdlc.md.
  - isdlc.md sees either: successful return (artifacts written)
    or failed return (Task tool error). It does not parse error codes.
  - isdlc.md reads meta.json after return to determine actual progress.
```

### 3.2 Error Accumulation

Errors accumulate during a session. The lead maintains an internal error log:

```typescript
interface ErrorLogEntry {
  code: string;        // RT-xxx
  severity: "INFO" | "WARNING" | "ERROR" | "FATAL";
  timestamp: string;   // Turn number
  component: string;   // "lead", "maya", "alex", "jordan"
  description: string;
  recovery_taken: string;
  resolved: boolean;
}
```

This log is NOT persisted to meta.json. It exists only in the lead's working memory during the session. It is used during the cross-check phase to flag known issues.

On finalization, if any unresolved ERROR-level entries exist, the lead summarizes them:

```
"Analysis complete with {N} known issues:
  - {RT-xxx}: {description} ({recovery_taken})
These are documented in the affected artifacts."
```

---

## 4. Input Validation Rules

### 4.1 Dispatch Prompt Validation (Lead, at startup)

| Field | Validation Rule | On Failure |
|-------|----------------|------------|
| SLUG | Non-empty string, kebab-case pattern `[a-z0-9-]+` | RT-100 (FATAL) |
| ARTIFACT_FOLDER | Non-empty string, starts with `docs/requirements/` | RT-101 (FATAL) |
| SOURCE | One of: "github", "jira", "manual" | Default to "manual". RT-105 level warning. |
| SOURCE_ID | Non-empty string | Default to "unknown". Warning logged. |
| META_CONTEXT | Valid JSON | RT-105 (WARNING). Create default meta. |
| DRAFT_CONTENT | Any string (may be empty or "(No draft available)") | RT-102 (WARNING) if empty/placeholder. |
| SIZING_INFO.light_flag | Boolean | Default to false. |
| SIZING_INFO.sizing_decision | Valid JSON or null | Default to null. |

### 4.2 Persona File Validation (Lead, at startup)

| Check | Validation Rule | On Failure |
|-------|----------------|------------|
| File exists | Glob returns match for expected path | RT-200 (ERROR) |
| File non-empty | Read returns non-empty content | RT-201 (WARNING) |
| Frontmatter present | Content contains `---` delimiters | RT-202 (WARNING) |
| Name field | Frontmatter contains `name` field | Best-effort. No specific error -- use filename as identifier. |

### 4.3 Topic File Validation (Lead, at startup)

| Check | Validation Rule | On Failure |
|-------|----------------|------------|
| Directory exists | Glob returns at least one .md file | RT-300 (WARNING) |
| Frontmatter present | File contains `---` delimiters | RT-302 (WARNING) |
| YAML parseable | Frontmatter parses as valid YAML | RT-304 (WARNING) |
| topic_id present | Parsed YAML contains topic_id | Skip file. Logged as part of RT-304. |
| coverage_criteria present | Parsed YAML contains coverage_criteria array | RT-301 (WARNING) |
| coverage_criteria non-empty | Array has at least one entry | RT-301 (WARNING) |

### 4.4 Agent Teams Message Validation (Lead, per message)

| Check | Validation Rule | On Failure |
|-------|----------------|------------|
| JSON parseable | Message content parses as JSON | RT-403 (WARNING) |
| type field present | Parsed JSON contains `type` field | RT-403 (WARNING) |
| type field recognized | type is one of: "progress", "finding", "complete", "cross-check", "error" | RT-404 (WARNING) |
| persona field present | Parsed JSON contains `persona` field | RT-403 (WARNING) |
| persona field recognized | persona is one of: "business-analyst", "solutions-architect", "system-designer" | RT-403 (WARNING) |
| Required fields per type | progress: artifact, status, coverage_summary. finding: topic, content, confidence. complete: artifacts_written, open_questions. | RT-403 (WARNING) for missing fields. Process available fields. |

### 4.5 Artifact Content Validation (Personas, before write -- Gate 1)

**Maya (requirements-spec.md)**:

| Check | Validation Rule | On Failure |
|-------|----------------|------------|
| FRs have IDs | Every FR has a unique FR-NNN identifier | Do not write. Continue gathering. |
| FRs have ACs | Every FR has at least one AC-NNN-NN | Do not write. Continue gathering. |
| ACs are testable | ACs describe observable behavior, not implementation | Flag vague ACs. Attempt to refine. Write with WARNING confidence. |
| Priorities assigned | Every FR has a MoSCoW priority | Acceptable for first write if priorities pending. Mark as "Pending" in Coverage. |
| Confidence indicators | Every FR has high/medium/low confidence | Assign based on source (user-stated = high, inferred = medium, extrapolated = low). |

**Alex (impact-analysis.md)**:

| Check | Validation Rule | On Failure |
|-------|----------------|------------|
| Blast radius has 3 tiers | Tier 1, 2, and 3 sections present | Acceptable for first write with TBD markers on missing tiers. |
| At least 2 options per decision | Architecture decisions have >= 2 options | Do not write architecture-overview.md until options explored. |
| Risks have mitigations | Every risk entry has a mitigation field | Flag unmitigated risks. Write with WARNING on those entries. |
| ADR statuses set | Each ADR has Status field | "Proposed" acceptable for first write. Must be "Accepted" at finalization. |

**Jordan (design artifacts)**:

| Check | Validation Rule | On Failure |
|-------|----------------|------------|
| Modules have single responsibility | Each module's responsibility is one sentence | Split modules that do too many things. |
| No circular dependencies | Dependency graph is acyclic | Redesign before writing. |
| Interfaces have concrete types | Parameters and returns specify types, not "any" | Do not write until types are concrete. |
| Error paths specified | Each interface lists error conditions | Acceptable for first write with TBD. Must be complete at finalization. |

---

## 5. Graceful Degradation Specification

### 5.1 Degradation Levels

The system operates at one of four degradation levels, determined by the most severe active error condition:

| Level | Trigger | Capabilities | Artifact Quality |
|-------|---------|-------------|-----------------|
| **Full** | No errors or INFO only | All 3 personas active. All artifacts produced. Full coverage tracking. | Complete, high confidence |
| **Reduced Persona** | One persona file missing (RT-200) or one teammate crashed (RT-402) | 2 personas active. Lead covers missing persona's work. Missing persona's artifacts written with lower quality. | Complete but mixed confidence. Affected artifacts marked "Confidence: Low -- produced without dedicated {persona} analysis." |
| **Single Agent Fallback** | All teammates failed (RT-405) or agent teams unavailable (RT-400) | Single-agent mode. All work done sequentially by lead. | Complete. Quality comparable to current sequential model. |
| **Minimal** | Topic files missing (RT-300) AND persona file(s) missing (RT-200) | Lead operates with built-in knowledge only. Reduced coverage tracking. | Partial. Coverage gaps flagged. Confidence indicators reflect limitations. |

### 5.2 Degradation Transitions

```
Full ──[RT-200 one persona]──> Reduced Persona
Full ──[RT-402 one teammate]──> Reduced Persona
Full ──[RT-405 all teammates]──> Single Agent Fallback
Full ──[RT-400 no agent teams]──> Single Agent Fallback (not degradation -- this is default)
Full ──[RT-300 no topic files]──> Minimal (if also persona missing)

Reduced Persona ──[RT-200 second persona]──> Minimal
Reduced Persona ──[problem resolved]──> Full (only in agent teams: re-spawn)

Any level ──[RT-504 no artifact folder]──> FATAL (session terminates)
Any level ──[RT-100/RT-101 bad dispatch]──> FATAL (session terminates)
```

### 5.3 Per-Persona Degradation Coverage

When a persona is missing, the lead covers their responsibilities with reduced depth:

| Missing Persona | Lead Covers | Reduced Capability | Artifacts Affected |
|----------------|-------------|--------------------|--------------------|
| Maya | Problem discovery, requirements, user stories | Less probing of user needs. Requirements may be surface-level. No MoSCoW challenge ("What happens if we ship without this?"). | requirements-spec.md (lower confidence), user-stories.json (basic), traceability-matrix.csv (may be skipped) |
| Alex | Codebase scan, impact analysis, architecture | Less thorough blast radius. Architecture options may be limited. No ADR rigor. | impact-analysis.md (lower confidence), architecture-overview.md (fewer options, less rigorous ADRs) |
| Jordan | Module design, interfaces, data flow, error handling | Less precise specifications. May use prose where concrete signatures are expected. Error handling may be incomplete. | All design artifacts (lower confidence, less precision) |

---

## 6. Error Handling by Phase of Conversation

### 6.1 Startup Phase (Turn 0)

```
VALIDATION ORDER:
1. Validate dispatch prompt fields (RT-100, RT-101, RT-102, RT-105)
   - FATAL errors terminate immediately
   - WARNINGs noted, processing continues

2. Read persona files (RT-200, RT-201, RT-202)
   - ERRORs noted, degradation level assessed
   - If all 3 missing: still proceed (lead has built-in knowledge)

3. Read topic files (RT-300, RT-301, RT-302, RT-304)
   - WARNINGs noted, coverage tracking adjusted

4. Detect agent teams availability (RT-400)
   - INFO if unavailable (default path)

5. Spawn teammates if agent teams mode (RT-401)
   - ERRORs trigger per-persona fallback

6. Assess overall degradation level
   - If FATAL encountered: terminate
   - If ERROR(s): report degradation to user, continue
   - If WARNING(s) only: note and continue
   - If clean: proceed at Full level
```

### 6.2 Conversation Phase (Turns 1..N)

```
PER-TURN ERROR HANDLING:
1. Process user input
   - No validation errors possible (all user input is valid natural language)

2. Persona analysis
   - Self-validation before artifact writes (RT-505)
   - Failures are internal quality gates, not user-visible errors

3. Artifact writes
   - RT-500 through RT-506 handled per error table
   - Retries are transparent to user
   - Persistent write failures reported to user (RT-502)

4. Meta.json checkpoint
   - RT-601, RT-602 handled per error table
   - Analysis continues even if meta.json write fails

5. Agent teams messages (if applicable)
   - RT-403, RT-404, RT-406 handled per error table
   - Malformed messages discarded, not fatal

6. Teammate health check (if applicable)
   - RT-402 detected when teammate stops responding
   - Recovery via ADR-006 (read existing artifacts, continue in single-agent)
```

### 6.3 Cross-Check Phase (Turn N+1)

```
CROSS-CHECK ERROR HANDLING:
1. Read all artifacts for consistency check
   - RT-700 if any artifact unreadable (skip that artifact)

2. Check consistency
   - RT-701 if inconsistencies found (correct and report)
   - RT-702 if clean (proceed to finalization)

3. Write corrections
   - RT-703 if correction write fails (document known issue)

4. Teammate cross-check (agent teams)
   - RT-704 if teammate times out (lead checks manually)
```

### 6.4 Finalization Phase (Turn N+2)

```
FINALIZATION ERROR HANDLING:
1. Final meta.json write
   - RT-602 if write fails (warn user, analysis results still in artifacts)

2. Return to isdlc.md
   - No errors possible (Task tool return is the mechanism)
   - isdlc.md reads meta.json independently to assess progress
```

---

## 7. Error Recovery Decision Tree

```
Error occurs
  |
  +-- Is it FATAL? ──[Yes]──> Write meta.json (best effort) -> Inform user -> Terminate
  |
  +-- [No] Is it ERROR? ──[Yes]──> Can it be retried? ──[Yes]──> Retry once
  |                                      |                            |
  |                                      |                     [Success]──> Continue (INFO logged)
  |                                      |                            |
  |                                      |                     [Failure]──> Degrade + inform user
  |                                      |
  |                                      +── [No retry possible] ──> Degrade + inform user
  |
  +-- [No] Is it WARNING? ──[Yes]──> Log + notify user (if user-impacting) -> Continue
  |
  +-- [No] INFO ──> Log only -> Continue
```

---

## 8. Error Message Style Guide

All user-facing error messages follow this format:

```
{Severity}: {What happened}. Impact: {What this means for the user}. Recovery: {What the system is doing about it}.
```

Rules:
- **Voice**: System voice. Never in-persona. No persona names in the message except to identify whose work is affected.
- **Tone**: Factual, not apologetic. State the condition, impact, and recovery action.
- **Length**: One to three sentences maximum.
- **Actionable**: If the user needs to do something, state it explicitly. If the system is handling it, say so.
- **No jargon**: Avoid internal terms (coverage tracker, artifact readiness, threshold). Use "analysis", "artifacts", "progress" instead.

Examples:
- Good: "Error: Could not spawn Alex Rivera as teammate. Impact: Architecture analysis will run in single-agent mode. Recovery: Analysis continues with reduced parallelism."
- Bad: "Oops! Alex seems to have gone missing. Let me try to pick up his work..."
- Bad: "RT-401: AgentTeamsSpawnFailure for persona-solutions-architect.md. Falling back to single-agent mode per ADR-002."
