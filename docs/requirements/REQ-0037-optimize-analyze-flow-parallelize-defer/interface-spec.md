---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Interface Specification: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Dispatch Prompt Interface (isdlc.md -> roundtable-analyst.md)

### 1.1 Current Contract

```
"Analyze '{slug}' using concurrent roundtable analysis.

 ARTIFACT_FOLDER: docs/requirements/{slug}/
 SLUG: {slug}
 SOURCE: {meta.source}
 SOURCE_ID: {meta.source_id}

 META_CONTEXT:
 {JSON.stringify(meta, null, 2)}

 DRAFT_CONTENT:
 {draftContent}

 SIZING_INFO:
   light_flag: {lightFlag}
   sizing_decision: {JSON.stringify(meta.sizing_decision) || "null"}

 ANALYSIS_MODE: No state.json writes, no branch creation."
```

### 1.2 Extended Contract (New Fields)

```
"Analyze '{slug}' using concurrent roundtable analysis.

 ARTIFACT_FOLDER: docs/requirements/{slug}/
 SLUG: {slug}
 SOURCE: {meta.source}
 SOURCE_ID: {meta.source_id}

 META_CONTEXT:
 {JSON.stringify(meta, null, 2)}

 DRAFT_CONTENT:
 {draftContent}

 SIZING_INFO:
   light_flag: {lightFlag}
   sizing_decision: {JSON.stringify(meta.sizing_decision) || "null"}

 PERSONA_CONTEXT:
 --- persona-business-analyst ---
 {personaBA content}
 --- persona-solutions-architect ---
 {personaSA content}
 --- persona-system-designer ---
 {personaSD content}

 TOPIC_CONTEXT:
 --- topic: problem-discovery ---
 {topic content}
 --- topic: requirements-definition ---
 {topic content}
 --- topic: technical-analysis ---
 {topic content}
 --- topic: architecture ---
 {topic content}
 --- topic: specification ---
 {topic content}
 --- topic: security ---
 {topic content}

 ANALYSIS_MODE: No state.json writes, no branch creation."
```

### 1.3 Parsing Rules (Roundtable Side)

- **PERSONA_CONTEXT**: If present, split on `--- persona-{name} ---` delimiters. Each segment is the full file content for that persona. Use directly instead of reading from disk.
- **TOPIC_CONTEXT**: If present, split on `--- topic: {topic_id} ---` delimiters. Each segment is the full file content for that topic. Use directly instead of globbing and reading from disk.
- **Absence**: If either field is missing, fall back to file reads (existing behavior). This ensures backward compatibility with any external invocations that use the old dispatch format.

### 1.4 Validation

- Both fields are optional (backward compatible)
- If PERSONA_CONTEXT is present, it must contain exactly 3 persona sections
- If TOPIC_CONTEXT is present, it must contain at least 1 topic section (number may vary as topics are added/removed)
- Delimiter format must match exactly: `--- persona-{name} ---` or `--- topic: {topic_id} ---`

## 2. Pre-Fetched Issue Data Interface (analyze handler -> add handler)

### 2.1 Current Interface

The analyze handler invokes the `add` handler with only the user's input string:
```
run add handler with the input
```

### 2.2 Extended Interface

The analyze handler invokes the `add` handler with optional pre-fetched data:
```
run add handler with the input
  pre-fetched issue data (optional):
    title: "{issue title}"
    labels: ["{label1}", "{label2}", ...]
    body: "{issue body text}"
```

### 2.3 Add Handler Conditional

```
If pre-fetched issue data is provided:
  Use data.title for slug generation
  Use data.labels for REQ/BUG detection
  Use data.body for draft content
  Skip gh issue view / Jira fetch
Else:
  Fetch as today (existing behavior)
```

### 2.4 Validation

- Pre-fetched data is optional; absence triggers existing fetch behavior
- When present, `title` must be a non-empty string
- When present, `labels` must be an array (may be empty)
- When present, `body` must be a string (may be empty)
- The add handler validates these fields and falls back to fetching if they are malformed

## 3. Dependency Group Interface (Internal to isdlc.md)

### 3.1 Group 1 Inputs and Outputs

**Inputs**: User input string (e.g., "#42"), project root path

**Operations** (all parallel):

| Operation | Input | Output | Error |
|-----------|-------|--------|-------|
| `gh issue view N --json title,labels,body` | Issue number | `issueData: { title, labels, body }` | Fail fast: "Could not fetch issue #N: {error}" |
| `Grep "{source_id}" docs/requirements/*/meta.json` | Source ID (e.g., "GH-42") | `existingMatch: { slug, dir, meta } or null` | Silent: treat as no match |
| `Glob docs/requirements/{TYPE}-*` | Item type prefix | `folderList: string[]` | Silent: treat as empty (start at 0001) |
| Read 3 persona files | File paths (hardcoded) | `personaContent: { ba, sa, sd }` | Fail fast: "Could not read persona file: {path}" |
| `Glob analysis-topics/**/*.md` | Directory path (hardcoded) | `topicPaths: string[]` | Silent: fall back to step files |

### 3.2 Group 2 Inputs and Outputs

**Inputs**: All Group 1 outputs

**Operations** (all parallel):

| Operation | Input | Output | Error |
|-----------|-------|--------|-------|
| `add` handler (conditional) | `issueData`, `folderList` | `{ slug, dir, meta, draft }` | Fail fast: propagate add handler errors |
| Read topic files | `topicPaths` | `topicContent: { [topic_id]: content }` | Silent: proceed with topics that were read successfully |

### 3.3 Dispatch Inputs

**Required** (from Group 1 + Group 2):
- `slug` (from existingMatch or add handler)
- `meta` (from existingMatch or add handler, in-memory)
- `draft` (from existingMatch disk read or add handler, in-memory)
- `personaContent` (from Group 1 reads)
- `topicContent` (from Group 2 reads)
- `lightFlag` (from parse phase)
- `sizingDecision` (from meta or sizing pre-check)

## 4. Error Handling at Boundaries

| Boundary | Error Condition | Behavior |
|----------|-----------------|----------|
| Group 1: `gh issue view` | Network error, issue not found, auth failure | Fail fast with error message. Do not proceed to Group 2. |
| Group 1: Persona file read | File not found | Fail fast. Persona files are required. |
| Group 1: Grep for existing ref | Grep fails or returns unexpected format | Treat as no match. Proceed to Group 2 with `existingMatch = null`. |
| Group 1: Glob for folders | Glob fails | Treat as empty list. Sequence number starts at 0001. |
| Group 1: Glob for topic paths | Glob fails | Fall back to step file discovery in roundtable (via fallback path). |
| Group 2: Add handler | Any add handler error | Fail fast with add handler's error message. |
| Group 2: Topic file read | Individual file read fails | Proceed with successfully read topics. Roundtable handles missing topics gracefully. |
| Dispatch: Roundtable fails | Task tool error | Propagate error to user. |
