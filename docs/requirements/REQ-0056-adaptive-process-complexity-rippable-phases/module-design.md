# REQ-0056: Module Design

## 1. Module Overview

| Module | Responsibility | Change Type |
|--------|---------------|-------------|
| `workflow-init.cjs` | Read process.json, compute phase array, print visual list | Modify |
| `phase-advance.cjs` | Skip over skipped phases when advancing | Modify |
| `common.cjs` | Add `skipped` to valid phase statuses, add config reader | Modify |
| `process.json` template | Reference template for developers | New |

## 2. Module: workflow-init.cjs

**Responsibility**: Read `.isdlc/process.json` at init, merge with defaults, mark skipped phases, print visual phase list.

### Public Interface

No new exports — modifications to existing `main()` function.

### Changes

**New function: `readProcessConfig(projectRoot)`**
```
Parameters: projectRoot (string) — absolute path to project root
Returns: object | null — parsed process.json contents, or null if not found/invalid
Side effects: prints warning to stderr on malformed JSON
```

**New function: `computePhaseArray(workflowType, configPhases, defaultPhases)`**
```
Parameters:
  workflowType (string) — e.g. "feature", "fix"
  configPhases (string[] | null) — phase array from process.json, or null
  defaultPhases (string[]) — built-in default phases for this workflow type
Returns: { phases: string[], phaseStatus: object, skippedPhases: string[] }
  phases — ordered array of all phase names (active + skipped)
  phaseStatus — map of phase name → "pending" | "in_progress" | "skipped"
  skippedPhases — array of phase names that were skipped with reasons
```

**New function: `printPhaseList(phases, phaseStatus, skippedReasons)`**
```
Parameters:
  phases (string[]) — ordered phase array
  phaseStatus (object) — phase name → status
  skippedReasons (object) — phase name → reason string
Returns: void
Side effects: prints to stdout
```

### Logic

```
1. After determining workflow type and default phases:
2. Read process.json via readProcessConfig()
3. If config has key for workflow type:
   a. Validate each phase name against PHASE_LIBRARY
   b. Warn and discard unknown names
   c. Call computePhaseArray() to merge
4. Else if --light flag:
   a. Apply existing light filtering (backward compat)
5. Else:
   a. Use defaults unchanged
6. Print visual phase list via printPhaseList()
7. Write to state.json as before
```

### Phase Library Constant

```javascript
const PHASE_LIBRARY = [
  '00-quick-scan', '01-requirements', '02-impact-analysis', '02-tracing',
  '03-architecture', '04-design', '05-test-strategy', '06-implementation',
  '07-testing', '08-code-review', '11-local-testing',
  '15-upgrade-plan', '15-upgrade-execute', '16-quality-loop'
];
```

## 3. Module: phase-advance.cjs

**Responsibility**: When advancing, skip over phases with `status: "skipped"`.

### Changes

**Modified: phase advancement logic (lines 132-140)**

Current behavior:
```
nextIndex = currentIndex + 1
nextPhase = phases[nextIndex]
```

New behavior:
```
nextIndex = currentIndex + 1
while nextIndex < phases.length AND phaseStatus[phases[nextIndex]] === "skipped":
  nextIndex++
if nextIndex >= phases.length:
  → WORKFLOW_COMPLETE
nextPhase = phases[nextIndex]
```

No new functions. ~10 lines changed in `main()`.

## 4. Module: common.cjs

**Responsibility**: Add `skipped` as valid phase status.

### Changes

- `validateSizingInvariants()` (line ~3487): accept `"skipped"` in phase_status values
- Any phase status validation: include `"skipped"` in valid set alongside `"pending"`, `"in_progress"`, `"completed"`

### New Export: `readProcessConfig(projectRoot)`

Shared reader so both `workflow-init.cjs` and future consumers can read the config consistently.

```
Parameters: projectRoot (string)
Returns: object | null
Logic:
  1. path.join(projectRoot, '.isdlc', 'process.json')
  2. If not exists → return null
  3. Try JSON.parse
  4. On parse error → stderr warning, return null
  5. Return parsed object
```

## 5. Module: Template (src/isdlc/templates/process.json)

**Responsibility**: Reference template showing all configurable options.

### Content Structure

```json
{
  "_comment": "iSDLC Process Configuration — copy to .isdlc/process.json to customize",
  "_docs": "Each key is a workflow type. Value is the phase array that will run.",
  "_phases": "Available phases: 00-quick-scan, 01-requirements, 02-impact-analysis, 02-tracing, 03-architecture, 04-design, 05-test-strategy, 06-implementation, 07-testing, 08-code-review, 11-local-testing, 15-upgrade-plan, 15-upgrade-execute, 16-quality-loop",

  "feature": [
    "00-quick-scan",
    "01-requirements",
    "02-impact-analysis",
    "03-architecture",
    "04-design",
    "05-test-strategy",
    "06-implementation",
    "16-quality-loop",
    "08-code-review"
  ],
  "fix": [
    "01-requirements",
    "02-tracing",
    "05-test-strategy",
    "06-implementation",
    "16-quality-loop",
    "08-code-review"
  ],
  "upgrade": [
    "15-upgrade-plan",
    "15-upgrade-execute",
    "08-code-review"
  ],
  "test-run": [
    "11-local-testing",
    "07-testing"
  ],
  "test-generate": [
    "05-test-strategy",
    "06-implementation",
    "16-quality-loop",
    "08-code-review"
  ]
}
```

## 6. Dependencies

```
workflow-init.cjs → common.cjs (readProcessConfig)
workflow-init.cjs → workflows.json (default phases — existing)
phase-advance.cjs → state.json (phase_status — existing)
common.cjs → fs (existing)
```

No circular dependencies. No new external dependencies.

## 7. Error Handling

| Error | Trigger | Recovery |
|-------|---------|----------|
| process.json not found | File doesn't exist | Return null, use defaults (silent) |
| process.json malformed | Invalid JSON | Warn to stderr, use defaults |
| Unknown phase name | Developer typo | Warn to stderr, ignore that entry |
| Empty phase array | Developer error | Warn to stderr, use defaults |
| Config key not a string array | Wrong type | Warn to stderr, use defaults for that workflow type |

All errors fail-safe to built-in defaults per Article X.

## Pending Sections

None — all sections complete.
