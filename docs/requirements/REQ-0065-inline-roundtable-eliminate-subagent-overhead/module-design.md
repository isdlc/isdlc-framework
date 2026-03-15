# Module Design: REQ-0065 — Inline Roundtable Analysis

---

## 1. Changes to `src/claude/commands/isdlc.md`

### 1.1 Step 7a-7b Replacement (Roundtable)

**Current** (remove):
```
7a. Delegate to roundtable-analyst agent via Task tool with dispatch prompt containing:
    - PERSONA_CONTEXT (3 persona files serialized)
    - TOPIC_CONTEXT (6 topic files serialized)
    - DISCOVERY_CONTEXT
    - MEMORY_CONTEXT
    - META_CONTEXT, DRAFT_CONTENT, SIZING_INFO, SLUG, ARTIFACT_FOLDER

7b. Relay-and-resume loop:
    WHILE not ROUNDTABLE_COMPLETE:
      - Output agent text verbatim
      - Wait for user response
      - Resume agent with user's exact response
```

**New** (replace with):
```
7a. Read src/claude/agents/roundtable-analyst.md using Read tool.
    This is a protocol reference — do NOT spawn it as an agent.

7b. Execute roundtable conversation protocol inline:

    CONTEXT (already in memory — no reads needed):
      - slug, artifact_folder: from step 3 resolution
      - meta: from step 4 readMetaJson()
      - draftContent: from step 6.5 draft read
      - discoveryContent: from step 6.5 discovery extraction
      - memoryContextBlock: from step 3a Group 1 memory read
      - lightFlag, sizing_decision: from step 2.5 / step 6
      - Personas, topics, constitution: in session cache (ROUNDTABLE_CONTEXT)

    PROTOCOL (from roundtable-analyst.md):
      1. Follow Section 2.1 Opening:
         - Open as Maya from draft content
         - Ask a single opening question
         - STOP and wait for user reply (natural conversation turn — no Task resume)
      2. On user's first reply, follow Section 2.1 "On resume":
         - Run codebase scan (Alex's deferred task)
         - Compose response with Maya continuing + Alex contributing scan evidence
      3. For each subsequent exchange, follow Sections 2.2-2.5:
         - Conversation flow rules, persona contribution batching, natural steering
         - Topic coverage tracking (Section 3)
         - Depth adaptation (Section 4)
      4. When coverage is complete, enter confirmation sequence (Section 2.5):
         - Sequential: PRESENTING_REQUIREMENTS → PRESENTING_ARCHITECTURE → PRESENTING_DESIGN
         - Each domain: present summary, wait for Accept/Amend
      5. On final Accept, execute artifact batch write (Section 5.5):
         - Write all artifacts to docs/requirements/{slug}/
         - Update meta.json with phases_completed, topics_covered, acceptance record
      6. Set confirmationState = COMPLETE (replaces ROUNDTABLE_COMPLETE signal)

    POST-COMPLETION (unchanged steps 7.5+):
      - Proceed to step 7.5 (re-read meta.json)
      - Step 7.5a (memory write-back): construct session record from in-memory
        conversation state and call writeSessionRecord() directly
      - Steps 7.6-9 unchanged
```

### 1.2 Step 6.5c-6.5d Replacement (Bug-Gather)

**Current** (remove):
```
6.5c. Delegate to bug-gather-analyst agent via Task tool with dispatch prompt
6.5d. Relay-and-resume loop:
    WHILE not BUG_GATHER_COMPLETE:
      - Output agent text verbatim
      - Wait for user response
      - Resume agent with user's exact response
```

**New** (replace with):
```
6.5c. Read src/claude/agents/bug-gather-analyst.md using Read tool.
      This is a protocol reference — do NOT spawn it as an agent.

6.5d. Execute bug-gather conversation protocol inline:

    CONTEXT (already in memory):
      - slug, meta, draftContent, discoveryContent: from earlier steps

    PROTOCOL (from bug-gather-analyst.md):
      1. Follow the bug-gather opening: acknowledge bug, present structured understanding
      2. Ask if user has additional context — STOP and wait for reply
      3. On reply: finalize bug report artifacts
      4. Proceed directly to step 6.5e (no BUG_GATHER_COMPLETE parsing)
```

### 1.3 Step 7.5a Modification (Memory Write-Back)

**Current**:
```
- Parse SESSION_RECORD JSON block from roundtable's final output
- Call writeSessionRecord(record, projectRoot, userMemoryDir)
```

**New**:
```
- Construct session record from in-memory conversation state:
  { topics_covered, depth_preferences_observed, overrides, session_timestamp }
- Call writeSessionRecord(record, projectRoot, userMemoryDir)
- Failures are non-blocking (unchanged)
```

### 1.4 Removed Code

- Dispatch prompt construction block in step 7a (PERSONA_CONTEXT, TOPIC_CONTEXT, DISCOVERY_CONTEXT, MEMORY_CONTEXT serialization)
- Task tool invocation in step 7a
- Relay-and-resume WHILE loop in step 7b
- ROUNDTABLE_COMPLETE signal check in step 7b
- Task tool invocation in step 6.5c
- Relay-and-resume WHILE loop in step 6.5d
- BUG_GATHER_COMPLETE signal check in step 6.5d
- SESSION_RECORD output parsing in step 7.5a

## 2. Changes to `src/claude/agents/roundtable-analyst.md`

Add protocol reference header after the frontmatter:

```markdown
> **Execution mode**: This file is a protocol reference document. The isdlc.md
> analyze handler reads this file once at analysis start and executes the
> conversation protocol inline — it is NOT spawned as a separate agent via
> Task tool. The conversation protocol, topic coverage rules, confirmation
> state machine, and artifact batch write specifications below are authoritative.
> Agent Teams mode (Section 1.2) remains available for direct agent spawn.
```

No other changes to the file content.

## 3. Changes to `src/claude/agents/bug-gather-analyst.md`

Add protocol reference header after the frontmatter:

```markdown
> **Execution mode**: This file is a protocol reference document. The isdlc.md
> analyze handler reads this file once at analysis start and executes the
> bug-gather protocol inline — it is NOT spawned as a separate agent via
> Task tool. The conversation protocol and artifact specifications below
> are authoritative.
```

No other changes to the file content.

## 4. Dependency Map

```
isdlc.md (step 7a-7b)
  ├── reads: roundtable-analyst.md (protocol reference)
  ├── uses: session cache (ROUNDTABLE_CONTEXT — personas, topics)
  ├── uses: in-memory variables (slug, meta, draftContent, discoveryContent, memoryContextBlock)
  └── calls: writeSessionRecord() from lib/memory.js (unchanged)

isdlc.md (step 6.5c-6.5d)
  ├── reads: bug-gather-analyst.md (protocol reference)
  └── uses: in-memory variables (slug, meta, draftContent, discoveryContent)
```

No circular dependencies. No new imports.
