---
Status: Complete
Confidence: High
Last Updated: 2026-02-22
Coverage: All sections written
---

# Module Design: REQ-0037 -- Optimize Analyze Flow (Parallelize and Defer)

## 1. Module Overview

This change modifies two existing modules (prompt files). No new modules are created.

### Module 1: Analyze Handler (`isdlc.md`, lines 608-741)

- **Responsibility**: Orchestrate the pre-dispatch pipeline for `/isdlc analyze`, including item resolution, folder creation, context gathering, and dispatch to the roundtable-analyst
- **Change**: Restructure from sequential steps to dependency groups; add auto-add fast path for external refs; add persona/topic pre-reading
- **Dependencies**: `add` handler (same file), `roundtable-analyst.md` (dispatch target), `three-verb-utils.cjs` (conceptual reference for utility functions)
- **Estimated size**: ~150 lines of restructured instructions (replacing current ~135 lines)

### Module 2: Roundtable Startup (`roundtable-analyst.md`, Sections 1.1, 2.1, 3.1)

- **Responsibility**: Initialize the roundtable conversation -- load persona identities, load topic registry, run codebase scan, deliver Maya's opening message
- **Change**: Accept optional inlined context from dispatch prompt; defer codebase scan to after first exchange
- **Dependencies**: Persona files (read-only, fallback only), topic files (read-only, fallback only), `docs/requirements/{slug}/` (artifact writes)
- **Estimated size**: ~30 lines modified across 3 sections

## 2. Module 1: Analyze Handler -- Detailed Design

### 2.1 Current Structure (Sequential)

```
Step 1: Parse flags
Step 2: (reserved)
Step 2.5: Parse -light flag
Step 3: resolveItem(input)
Step 4: Read meta.json
Step 5: Check completed analysis
Step 6: Sizing pre-check
Step 7: Read draft, dispatch to roundtable, relay loop
Step 7.5-7.8: Post-dispatch (sizing, tier, finalize)
Step 8-9: Display results, label sync
```

### 2.2 Proposed Structure (Dependency Groups)

```
Parse Phase:
  - Parse flags (-light, etc.)
  - Detect input type (external ref vs slug vs number vs description)

[If input is external ref (#N or PROJECT-N)]:

  Group 1 (T=0, all parallel):
    - gh issue view N (or Jira fetch) --> issueData
    - Grep "{source_id}" in docs/requirements/*/meta.json --> existingMatch
    - Glob docs/requirements/{TYPE}-* --> folderList (for sequence number)
    - Read 3 persona files --> personaContent
    - Glob analysis-topics/**/*.md --> topicPaths

  Group 2 (needs Group 1, all parallel):
    - If no existingMatch: invoke add handler with pre-fetched issueData
    - Read topic files from topicPaths --> topicContent
    - Read meta.json (if existingMatch found, use its meta; if just created by add, use in-memory)

  Read draft.md (if existingMatch, read from disk; if just created, use in-memory)

  Check completed analysis (same logic as today, using meta)
  Sizing pre-check (same logic as today)

  Dispatch to roundtable with:
    SLUG, SOURCE, SOURCE_ID, ARTIFACT_FOLDER,
    META_CONTEXT, DRAFT_CONTENT, SIZING_INFO,
    PERSONA_CONTEXT (new), TOPIC_CONTEXT (new)

[If input is NOT external ref]:

  Existing flow preserved:
    resolveItem(input) --> standard resolution chain
    If no match: prompt user to add (existing behavior)
    Proceed with current sequential flow
    (Persona/topic pre-reading still applies for dispatch optimization)

Post-dispatch:
  Re-read meta.json, sizing trigger, tier computation, finalize (unchanged)
  Label sync (unchanged, stays at end)
```

### 2.3 Data Structures

**issueData** (pre-fetched, passed to add handler):
```
{
  title: string,       // Issue title for slug generation
  labels: string[],    // Labels for REQ/BUG detection
  body: string         // Issue body for draft content
}
```

**personaContent** (inlined in dispatch):
```
PERSONA_CONTEXT:
--- persona-business-analyst ---
{full file content}
--- persona-solutions-architect ---
{full file content}
--- persona-system-designer ---
{full file content}
```

**topicContent** (inlined in dispatch):
```
TOPIC_CONTEXT:
--- topic: problem-discovery ---
{full file content}
--- topic: requirements-definition ---
{full file content}
--- topic: technical-analysis ---
{full file content}
--- topic: architecture ---
{full file content}
--- topic: specification ---
{full file content}
--- topic: security ---
{full file content}
```

### 2.4 Add Handler Interface Extension

The `add` handler (lines 536-604 of `isdlc.md`) gains one conditional at step 3a:

```
3. Parse input to identify source type:
   a. GitHub issue (#N pattern): source = "github", source_id = "GH-N".
      If pre-fetched issueData is available:
        Use issueData.title, issueData.labels instead of fetching.
      Else:
        Fetch the issue title using gh issue view N --json title,labels -q '.title'.
      Check labels: if "bug" label present, item_type = "BUG", else item_type = "REQ".
   b. Jira ticket (PROJECT-N pattern): [same conditional for pre-fetched data]
   ...
```

No other changes to the `add` handler. Steps 4-11 remain identical.

## 3. Module 2: Roundtable Startup -- Detailed Design

### 3.1 Section 1.1 (Single-Agent Mode) Changes

Current:
```
1. Read all three persona files at startup using the Read tool
2. Incorporate all three persona identities
```

Proposed:
```
1. Check if PERSONA_CONTEXT is present in the dispatch prompt
   - If present: parse persona content from the inlined field
   - If absent: Read all three persona files using the Read tool (fallback)
2. Incorporate all three persona identities
```

### 3.2 Section 2.1 (Opening) Changes

Current:
```
1. Parse dispatch prompt
2. Read persona files (or spawn teammates)
3. Initiate silent codebase scan
4. Open conversation as Maya
5. STOP and RETURN
```

Proposed:
```
1. Parse dispatch prompt (now includes PERSONA_CONTEXT, TOPIC_CONTEXT)
2. Load personas from inlined context (or read files as fallback)
3. Load topics from inlined context (or glob+read as fallback)
4. Open conversation as Maya (from draft knowledge, no scan needed)
5. STOP and RETURN

On resume with user's first reply:
6. Run codebase scan (keywords extracted from draft)
7. Compose response: Maya continues + Alex contributes scan findings
```

### 3.3 Section 3.1 (Topic Registry Initialization) Changes

Current:
```
- Read analysis-topics/**/*.md using Glob tool
- Parse each topic file's YAML frontmatter
```

Proposed:
```
- Check if TOPIC_CONTEXT is present in the dispatch prompt
  - If present: parse topic content from the inlined field
  - If absent: Read analysis-topics/**/*.md using Glob tool (fallback)
- Parse each topic's YAML frontmatter (same logic regardless of source)
```

### 3.4 Codebase Scan Exception Removal

Current (line 298):
```
Exception: The initial codebase scan runs silently before the first exchange.
```

Proposed:
```
(Line removed. The scan now runs during exchange 2 processing, within the normal flow.)
```

## 4. Dependency Map

```
isdlc.md analyze handler
  |
  |-- reads --> persona files (Group 1, parallel)
  |-- reads --> topic files (Group 2, parallel)
  |-- invokes --> add handler (Group 2, with pre-fetched data)
  |-- dispatches --> roundtable-analyst.md (after Group 2)
  |
  |-- conceptual ref --> three-verb-utils.cjs (resolveItem, generateSlug, etc.)
  |     (no changes to this file)

roundtable-analyst.md
  |
  |-- reads (fallback) --> persona files
  |-- reads (fallback) --> topic files
  |-- writes --> docs/requirements/{slug}/ artifacts
  |-- writes --> meta.json
```

No circular dependencies. All dependencies are unidirectional.
