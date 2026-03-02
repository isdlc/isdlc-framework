---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Requirements Specification: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Business Context

### Problem Statement

When a user runs `/isdlc analyze #N`, approximately 90 seconds elapse before Maya's first conversational message appears. This latency destroys the conversational feel of the roundtable analysis and makes the framework feel slow and unresponsive. The root cause is that the inline handler and roundtable startup execute ~75 tool calls across ~40 sequential round-trips, most of which have no dependency on each other and could run in parallel.

### Stakeholders

| Stakeholder | Role | Interest |
|-------------|------|----------|
| Framework user (developer) | Primary user | Faster, more responsive analyze experience |
| Framework maintainer | Secondary | Clean prompt architecture expressing parallelism |

### Success Metrics

- First-message latency drops from ~90s to ~11s (8x improvement)
- Measured by user feel -- no instrumentation required
- Conversation quality and artifact quality remain identical to today

### Driving Factors

- Current latency makes the roundtable feel broken rather than conversational
- All optimizations exploit existing parallelism -- no new capabilities needed
- Two-file change with no new runtime dependencies

## 2. Stakeholders and Personas

### 2.1 Framework User (Primary)

- **Role**: Developer using iSDLC to analyze requirements for GitHub or Jira issues
- **Goals**: Run `/isdlc analyze #N` and immediately enter a productive conversation with Maya
- **Pain Points**: 90-second wait before any response; feels like the tool is hung or broken
- **Proficiency**: Familiar with the framework's commands and conventions
- **Key Tasks**: Invoke analyze, converse with roundtable personas, receive analysis artifacts

## 3. User Journeys

### 3.1 Analyze a New GitHub Issue (Primary Journey)

**Entry point**: User runs `/isdlc analyze #42` for an issue not yet in the backlog.

**Current flow** (~90s to first message):
1. `resolveItem` scans all folders serially, finds no match (~5s)
2. Analyze asks "Add to backlog?" -- user confirms (~3s + wait)
3. `add` handler fetches `gh issue view` (~3s)
4. `add` handler creates folder, writes draft, meta, updates BACKLOG.md (~3s)
5. Analyze re-reads meta.json and draft.md just written (~2s)
6. Analyze dispatches to roundtable (~1s)
7. Roundtable reads 3 persona files (~3s)
8. Roundtable discovers and reads 6 topic files (~7s)
9. Roundtable runs 18-20 codebase scan calls (~40s)
10. Maya speaks

**Optimized flow** (~11s to first message):
1. Parallel Group 1 fires: `gh issue view`, Grep for existing ref, Glob for sequence number, read 3 persona files, Glob topic paths (~3s)
2. Parallel Group 2 fires: `add` handler (with pre-fetched issue data), read 6 topic files (~3s)
3. Dispatch to roundtable with all context inlined (~5s to Maya's first message)
4. Codebase scan runs after first exchange, during exchange 2 processing
5. Alex joins conversation at exchange 2 with codebase evidence

**Exit point**: Analysis complete, artifacts written, meta.json updated.

### 3.2 Analyze an Already-Added Item

**Entry point**: User runs `/isdlc analyze #42` for an issue already in the backlog.

**Flow**: `resolveItem` finds the existing folder via Grep in Group 1. The `add` handler is skipped. Persona files, topic files, and dispatch proceed as in 3.1. No behavioral change from today except faster execution through parallelism.

## 4. Technical Context

### Constraints

- Changes limited to two prompt files: `src/claude/commands/isdlc.md` and `src/claude/agents/roundtable-analyst.md`
- No changes to executable code (`three-verb-utils.cjs`, hooks, or scripts)
- No new files or runtime dependencies
- Backward compatible: roundtable-analyst must fall back to file reads when inlined context is absent
- The `add` handler remains the sole owner of folder creation logic

### Conventions

- Prompt instructions use dependency group notation to express parallelism
- LLM interprets groups as "fire all calls in this group simultaneously"
- Sequential dependency between groups is expressed by group ordering

### Integration Points

- `isdlc.md` analyze handler dispatches to `roundtable-analyst.md` via Task tool
- `isdlc.md` analyze handler invokes `add` handler logic inline (same file)
- `roundtable-analyst.md` reads from `docs/requirements/{slug}/` for artifacts

## 5. Quality Attributes and Risks

### Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Responsiveness | Critical | First message under ~15s for external refs |
| Conversation quality | Critical | Identical to current roundtable quality |
| Backward compatibility | High | Existing dispatch prompts without inlined context still work |
| Maintainability | High | Dependency groups are easier to reason about than serial lists |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LLM ignores parallelism hints and serializes anyway | Medium | Medium | Use explicit dependency group notation with clear "fire in parallel" language; test empirically |
| Pre-fetched issue data passed to `add` handler gets out of sync with `add`'s expectations | Low | Medium | `add` handler validates input; pre-fetched data uses same field names |
| Codebase scan deferral means Alex misses context in exchange 1 | Low (by design) | Low | Accepted trade-off: Maya carries exchange 1, Alex joins at exchange 2 |
| Large inlined persona/topic content inflates dispatch prompt size | Low | Low | ~1100 lines added to dispatch prompt; well within context limits |

## 6. Functional Requirements

### FR-001: Dependency Group Execution in Analyze Handler

**Description**: The analyze handler in `isdlc.md` must restructure its pre-dispatch pipeline from sequential numbered steps to dependency groups that express which operations can run in parallel.

**Confidence**: High

**Acceptance Criteria**:

- **AC-001-01**: When `/isdlc analyze #N` is invoked, the handler fires Group 1 operations (issue fetch, existing-ref check, sequence number glob, persona reads, topic path glob) as parallel tool calls in a single response.
- **AC-001-02**: Group 2 operations (add handler invocation with pre-fetched data, topic file reads) fire only after Group 1 results are available, also as parallel tool calls.
- **AC-001-03**: Dispatch to roundtable fires only after Group 2 completes, with all context inlined in the prompt.
- **AC-001-04**: The dependency group structure applies equally to `#N` (GitHub) and `PROJECT-N` (Jira) external references.

### FR-002: Auto-Add for External References

**Description**: When the analyze handler receives a `#N` or `PROJECT-N` input that does not match an existing backlog item, it must automatically invoke the `add` handler without prompting the user for confirmation.

**Confidence**: High

**Acceptance Criteria**:

- **AC-002-01**: For `#N` inputs where no existing folder is found, the `add` handler is invoked automatically without an "Add to backlog?" prompt.
- **AC-002-02**: For `PROJECT-N` inputs where no existing folder is found, the same auto-add behavior applies.
- **AC-002-03**: For non-external-ref inputs (slugs, item numbers, descriptions), the existing behavior is preserved -- prompt for confirmation if no match found.
- **AC-002-04**: The auto-add behavior only fires when `resolveItem` (or equivalent parallel check) finds no existing folder for the reference.

### FR-003: Pre-Fetched Issue Data Passthrough

**Description**: The analyze handler must pass pre-fetched issue data (title, labels, body) to the `add` handler so it does not re-fetch from GitHub/Jira.

**Confidence**: High

**Acceptance Criteria**:

- **AC-003-01**: When the `add` handler is invoked from the analyze fast path, it receives pre-fetched issue data and uses it instead of calling `gh issue view` or equivalent.
- **AC-003-02**: When the `add` handler is invoked directly via `/isdlc add`, it fetches issue data as today (no behavioral change).
- **AC-003-03**: The `add` handler remains the sole owner of folder creation logic (slug generation, sequence numbering, collision checking, meta.json schema).

### FR-004: Eliminate Re-Read After Write

**Description**: After the `add` handler creates meta.json and draft.md, the analyze handler must reuse the in-memory objects rather than re-reading the files from disk.

**Confidence**: High

**Acceptance Criteria**:

- **AC-004-01**: The analyze handler does not issue Read tool calls for meta.json or draft.md after the `add` handler has just written them.
- **AC-004-02**: The dispatch prompt is composed from the in-memory meta and draft objects returned/produced by the `add` handler invocation.

### FR-005: Inlined Context in Roundtable Dispatch

**Description**: The analyze handler must pre-read persona files and topic files and include their content in the roundtable dispatch prompt as new fields.

**Confidence**: High

**Acceptance Criteria**:

- **AC-005-01**: The dispatch prompt includes a `PERSONA_CONTEXT` field containing the full content of all 3 persona files.
- **AC-005-02**: The dispatch prompt includes a `TOPIC_CONTEXT` field containing the full content of all 6 topic files.
- **AC-005-03**: Both fields are structured with clear delimiters so the roundtable-analyst can parse them.

### FR-006: Roundtable Accepts Inlined Context

**Description**: The roundtable-analyst must accept optional `PERSONA_CONTEXT` and `TOPIC_CONTEXT` fields in the dispatch prompt and skip file reads when they are present.

**Confidence**: High

**Acceptance Criteria**:

- **AC-006-01**: When `PERSONA_CONTEXT` is present in the dispatch prompt, the roundtable-analyst does not issue Read tool calls for persona files.
- **AC-006-02**: When `TOPIC_CONTEXT` is present, the roundtable-analyst does not issue Glob or Read tool calls for topic files.
- **AC-006-03**: When these fields are absent (backward compatibility), the roundtable-analyst falls back to reading files as today.

### FR-007: Deferred Codebase Scan

**Description**: The roundtable-analyst must defer its codebase scan from before Maya's first message to after the first user exchange.

**Confidence**: High

**Acceptance Criteria**:

- **AC-007-01**: Maya's first message is composed from draft content alone, without waiting for codebase scan results.
- **AC-007-02**: The codebase scan runs when the roundtable is resumed with the user's first reply, before composing the second exchange.
- **AC-007-03**: Alex's first contribution (exchange 2 or later) includes codebase evidence from the completed scan.
- **AC-007-04**: If the scan completes during the processing of the user's first reply, Alex contributes in exchange 2. If the scan is particularly slow, Maya continues solo and Alex joins when ready.

### FR-008: Error Handling Unchanged

**Description**: All error conditions (network failures, missing issues, `gh` CLI unavailable, authentication failures) must produce the same error messages and fail-fast behavior as today.

**Confidence**: High

**Acceptance Criteria**:

- **AC-008-01**: If `gh issue view` fails in Group 1, the analyze handler surfaces the error and stops, using the same error messaging as today.
- **AC-008-02**: If the `add` handler fails in Group 2, the same error behavior applies.
- **AC-008-03**: No new error codes or error paths are introduced.

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Codebase scan optimization (fewer keywords, smarter extraction) | Separate optimization concern | Could be REQ-0038 |
| Timing instrumentation or telemetry | User measures by feel | None |
| Label sync deferral | Already non-blocking at end of flow | None |
| Changes to `three-verb-utils.cjs` | No executable code changes needed | None |
| Background process / async scanner script | Simplest approach chosen (Alex joins exchange 2) | None |
| Changes to `add` handler beyond accepting pre-fetched data | `add` retains full ownership of its logic | None |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Dependency Group Execution | Must Have | Core of the optimization -- without this, no latency improvement |
| FR-002 | Auto-Add for External Refs | Must Have | Eliminates confirmation round-trip for the primary use case |
| FR-003 | Pre-Fetched Issue Data | Must Have | Eliminates duplicate `gh issue view` call |
| FR-004 | Eliminate Re-Read After Write | Must Have | Eliminates unnecessary file reads |
| FR-005 | Inlined Context in Dispatch | Must Have | Eliminates persona/topic file reads from roundtable startup |
| FR-006 | Roundtable Accepts Inlined Context | Must Have | Companion to FR-005; roundtable must honor the inlined data |
| FR-007 | Deferred Codebase Scan | Must Have | Unblocks Maya's first message from scan latency |
| FR-008 | Error Handling Unchanged | Must Have | No regression in error behavior |

## Pending Sections

None -- all sections complete.
