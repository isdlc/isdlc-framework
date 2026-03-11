# Module Design: Bug-Aware Analyze Flow

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-11
**Coverage**: 100%

---

## Module 1: Bug Classification Gate (in Analyze Handler)

**Responsibility**: Determine whether the subject of an analyze command is a bug or a feature, and route accordingly.

**Location**: `src/claude/commands/isdlc.md` -- new step between item resolution (step 3/4) and roundtable dispatch (step 7).

**Public Interface**:

This is a prompt-level decision, not a coded function. The analyze handler instructions include:

```
classifySubject(issueDescription, issueLabels) -> { classification: "bug" | "feature", reasoning: string }
```

- **Input**: Full issue description text, labels array (supplementary)
- **Output**: Classification ("bug" or "feature") with human-readable reasoning
- **Logic**: LLM reads description content, infers based on: symptoms described, error messages, unexpected behavior, regression language vs. new capability, enhancement, improvement language. Labels are supplementary evidence.

**Internal State**: None (stateless classification per invocation)

**Dependencies**: Issue description from step 3a Group 1 fetch

**Estimated Size**: ~30-40 lines of handler instructions added to `isdlc.md`

---

## Module 2: Bug-Gather Agent

**Responsibility**: For bug subjects, replace the roundtable with a lightweight gather-confirm-produce flow.

**Location**: `src/claude/agents/bug-gather-analyst.md` (new file)

**Public Interface**:

Dispatched via Task tool with prompt containing:
```
{
  SLUG: string,
  ARTIFACT_FOLDER: string,
  SOURCE: string,
  SOURCE_ID: string,
  DRAFT_CONTENT: string,       // Issue description
  META_CONTEXT: object,        // meta.json content
  DISCOVERY_CONTEXT?: string   // Project discovery if available
}
```

Returns: Text output with structured playback + "Should I fix it?" gate. Artifacts written to disk.

**Stages**:

1. **Parse**: Extract symptoms, error messages, reproduction steps, expected vs actual from issue description
2. **Scan**: Search codebase using keywords from the bug description (Grep, Glob tools)
3. **Understand**: Map affected files, identify likely code areas, assess scope
4. **Playback**: Present structured understanding to user; ask for additional context
5. **Confirm**: User says "done" / adds more context (conversation loop)
6. **Produce**: Write `bug-report.md` and `requirements-spec.md` to artifact folder
7. **Handoff**: Ask "Should I fix it?" and return result

**Internal State**: Bug context (symptoms, affected files, reproduction steps) -- held in memory during conversation

**Dependencies**:
- Grep/Glob tools for codebase scanning
- Write tool for artifact production
- Read tool for existing file analysis

**Estimated Size**: ~200-300 lines (agent markdown file)

---

## Module 3: Fix Handoff Logic (in Analyze Handler)

**Responsibility**: After bug-gather agent completes and user confirms "fix it", invoke the fix workflow.

**Location**: `src/claude/commands/isdlc.md` -- new step after bug-gather agent returns.

**Public Interface**:

```
handleFixHandoff(slug, userConfirmed) -> void
```

- **Input**: Item slug, user's response to "Should I fix it?"
- **Output**: If confirmed, invokes `/isdlc fix {slug}`. If declined, returns control to user.
- **Logic**: Parse user response for confirmation intent. If confirmed, invoke fix handler with the slug. The fix handler's auto-detection (REQ-0026 `computeStartPhase`) detects existing Phase 01 artifacts and starts from Phase 02 (tracing).

**Internal State**: None

**Dependencies**: Fix handler in `isdlc.md`, `computeStartPhase` from `three-verb-utils.cjs`

**Estimated Size**: ~15-20 lines of handler instructions added to `isdlc.md`

---

## Module Dependencies

```
Analyze Handler
  ├── Bug Classification Gate (Module 1)
  │     └── Issue description + labels (from step 3a)
  ├── Bug-Gather Agent (Module 2)  [dispatched via Task tool]
  │     ├── Grep/Glob (codebase scan)
  │     ├── Write (artifact production)
  │     └── User conversation (playback + confirm)
  └── Fix Handoff Logic (Module 3)
        └── Fix Handler (existing)
              └── computeStartPhase (existing, REQ-0026)
                    └── Tracing Orchestrator (existing, Phase 02)
```

No circular dependencies. Module 1 feeds Module 2 (bug confirmed -> dispatch agent). Module 2 feeds Module 3 (artifacts produced -> offer fix). Module 3 invokes existing infrastructure.

---

## Data Structures

### Bug Context (in-memory, within bug-gather agent)

```typescript
interface BugContext {
  description: string;          // Full issue description
  source_id: string;            // e.g., "GH-119"
  symptoms: string[];           // Observed symptoms
  error_messages: string[];     // Error messages / stack traces
  reproduction_steps: string[]; // Steps to reproduce
  expected_behavior: string;    // What should happen
  actual_behavior: string;      // What actually happens
  affected_files: string[];     // Files identified from codebase scan
  affected_modules: string[];   // Modules/areas identified
  user_additions: string[];     // Additional context from user
  severity: "low" | "medium" | "high" | "critical";
}
```

### Bug Report Artifact (bug-report.md)

```markdown
# Bug Report: {description}

**Source**: {source} {source_id}
**Severity**: {severity}
**Generated**: {timestamp}

## Expected Behavior
{expected_behavior}

## Actual Behavior
{actual_behavior}

## Symptoms
{symptoms as bullet list}

## Error Messages
{error_messages in code blocks}

## Reproduction Steps
{reproduction_steps as numbered list}

## Affected Area
- **Files**: {affected_files}
- **Modules**: {affected_modules}

## Additional Context
{user_additions}
```
