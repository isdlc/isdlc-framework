---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Data Flow: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. End-to-End Data Flow

### 1.1 Pre-Dispatch Pipeline (isdlc.md)

```
User command: /isdlc analyze #42
                |
                v
        +-- Parse Phase --+
        | Extract flags    |
        | Detect input type|
        | (external ref)   |
        +---------+--------+
                  |
                  v
   +====== Group 1 (T=0, all parallel) ======+
   |                                          |
   |  gh issue view 42     Grep GH-42        |
   |  --> issueData        --> existingMatch  |
   |                                          |
   |  Glob REQ-*/BUG-*     Read personas(3)  |
   |  --> folderList        --> personaContent |
   |                                          |
   |  Glob topics/**/*.md                     |
   |  --> topicPaths                          |
   +==========================================+
                  |
                  v
   +====== Group 2 (needs Group 1) ==========+
   |                                          |
   |  [if !existingMatch]   Read topics(6)   |
   |  add(issueData)        --> topicContent  |
   |  --> slug, dir,                          |
   |     meta, draft                          |
   |                                          |
   |  [if existingMatch]                      |
   |  Read draft.md                           |
   |  (meta already in memory)               |
   +==========================================+
                  |
                  v
        +-- Dispatch Phase --+
        | Compose prompt:    |
        |   SLUG             |
        |   META_CONTEXT     |
        |   DRAFT_CONTENT    |
        |   PERSONA_CONTEXT  |
        |   TOPIC_CONTEXT    |
        |   SIZING_INFO      |
        +--------+-----------+
                 |
                 v
        Task tool --> roundtable-analyst
```

### 1.2 Roundtable Startup (roundtable-analyst.md)

```
Dispatch prompt received
        |
        v
+-- Context Loading --+
| Parse PERSONA_CONTEXT|
| (or read files)      |
| Parse TOPIC_CONTEXT  |
| (or glob+read files) |
+----------+-----------+
           |
           v
+-- Exchange 1 --+
| Maya speaks    |
| (draft-based)  |
+-------+--------+
        |
        v
   RETURN (wait for user)
        |
        v [user responds]
        |
+-- Exchange 2 Processing --+
| Run codebase scan          |
| (Grep/Glob keywords)      |
| Process user's reply       |
| Maya continues             |
| Alex contributes findings  |
+----------------------------+
        |
        v
   RETURN (wait for user)
        |
   ... (conversation continues)
```

## 2. State Mutation Points

| Mutation | When | Writer | Readers |
|----------|------|--------|---------|
| `docs/requirements/{slug}/` directory created | Group 2 (add handler) | `isdlc.md` via add handler | roundtable-analyst (artifact writes) |
| `docs/requirements/{slug}/draft.md` created | Group 2 (add handler) | `isdlc.md` via add handler | roundtable-analyst (draft content -- but inlined in dispatch) |
| `docs/requirements/{slug}/meta.json` created | Group 2 (add handler) | `isdlc.md` via add handler | roundtable-analyst (meta context -- but inlined in dispatch) |
| `BACKLOG.md` updated | Group 2 (add handler) | `isdlc.md` via add handler | Not read during this flow |
| Analysis artifacts written | During roundtable conversation | roundtable-analyst | Post-dispatch steps in isdlc.md |
| `meta.json` updated (phases, topics) | During roundtable conversation | roundtable-analyst | Post-dispatch steps in isdlc.md |
| `meta.json` finalized (status, hash) | Post-dispatch step 7.8 | isdlc.md | Future commands (build, status) |

## 3. Data Transformations

| Stage | Input | Transformation | Output |
|-------|-------|----------------|--------|
| Input parsing | `"#42"` | Regex match, flag extraction | `{ input: "#42", inputType: "github", lightFlag: false }` |
| Issue fetch | Issue number `42` | `gh issue view 42 --json title,labels,body` | `{ title: "...", labels: [...], body: "..." }` |
| Slug generation | Issue title | `generateSlug(title)` | URL-safe slug string |
| Sequence numbering | Folder list from Glob | Extract highest NNNN, increment | Next sequence number (zero-padded) |
| Persona inlining | 3 file contents | Wrap with `--- persona-{name} ---` delimiters | PERSONA_CONTEXT string |
| Topic inlining | 6 file contents | Wrap with `--- topic: {id} ---` delimiters | TOPIC_CONTEXT string |
| Dispatch composition | All above | String interpolation into prompt template | Complete dispatch prompt |

## 4. Persistence Boundaries

| Data | Persistence | Lifetime |
|------|-------------|----------|
| `issueData` (pre-fetched) | In-memory only | Current analyze invocation |
| `existingMatch` result | In-memory only | Current analyze invocation |
| `personaContent` | In-memory, then serialized into dispatch prompt | Current analyze invocation |
| `topicContent` | In-memory, then serialized into dispatch prompt | Current analyze invocation |
| `draft.md` | Disk (created by add handler) | Permanent |
| `meta.json` | Disk (created by add handler, updated by roundtable) | Permanent |
| `BACKLOG.md` | Disk (updated by add handler) | Permanent |
| Analysis artifacts | Disk (written by roundtable) | Permanent |
| Codebase scan results | In-memory (within roundtable session) | Current roundtable session |

## 5. Concurrency Considerations

### 5.1 Group 1 Operations

All Group 1 operations are fully independent:
- `gh issue view` reads from GitHub API (external, no local state)
- Grep reads from `docs/requirements/*/meta.json` (read-only)
- Glob reads from `docs/requirements/` (read-only)
- Persona file reads are to static files (read-only)
- Topic path glob reads from static directory (read-only)

No shared state. No race conditions possible.

### 5.2 Group 2 Operations

Group 2 operations are independent of each other but depend on Group 1:
- `add` handler writes to a new directory (no conflict with topic reads)
- Topic file reads are to static files (no conflict with `add` handler)

The `add` handler's BACKLOG.md write and the topic file reads touch different files. No conflict.

### 5.3 Roundtable Codebase Scan

The scan runs during exchange 2 processing, which is single-threaded (one LLM turn). Multiple Grep/Glob calls within that turn can be parallelized as tool calls, but they are all read-only against the codebase. No write conflicts.
