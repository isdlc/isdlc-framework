# iSDLC Hooks API Contract

**Version:** 1.0.0
**Date:** 2026-02-08
**Feature:** REQ-0003-hooks-api-contract

This document defines the formal API contract between iSDLC hooks and Claude Code. It covers stdin/stdout formats, state.json subsystem schemas, and canonical field names.

---

## 1. Hook Registry

All hooks are registered in `src/claude/settings.json` and copied to `.claude/settings.json` at install time.

### 1.1 PreToolUse Hooks

| Hook | Matcher | File | Timeout | Purpose |
|------|---------|------|---------|---------|
| Model Provider Router | Task | `model-provider-router.cjs` | 10s | Route to optimal LLM provider based on phase |
| Iteration Corridor | Task, Skill | `iteration-corridor.cjs` | 10s | Enforce iteration boundaries (min/max per phase) |
| Skill Validator | Task | `skill-validator.cjs` | 10s | Log skill usage for observability (never blocks) |
| Gate Blocker | Task, Skill | `gate-blocker.cjs` | 10s | Block gate advancement unless all requirements met |
| Constitution Validator | Task | `constitution-validator.cjs` | 10s | Initialize constitutional validation tracking |

### 1.2 PostToolUse Hooks

| Hook | Matcher | File | Timeout | Purpose |
|------|---------|------|---------|---------|
| Log Skill Usage | Task | `log-skill-usage.cjs` | 5s | Record skill invocations to state.json audit log |
| Menu Tracker | Task | `menu-tracker.cjs` | 5s | Track A/R/C menu interactions for elicitation |
| Skill Delegation Enforcer | Skill | `skill-delegation-enforcer.cjs` | 5s | Write pending_delegation marker when /isdlc or /discover loaded |
| Test Watcher | Bash | `test-watcher.cjs` | 10s | Track test execution results and iteration counts |
| Review Reminder | Bash | `review-reminder.cjs` | 5s | Warn on git commit when code review phase not completed |

### 1.3 Stop Hooks

| Hook | File | Timeout | Purpose |
|------|------|---------|---------|
| Delegation Gate | `delegation-gate.cjs` | 5s | Verify orchestrator delegation occurred after skill load |

---

## 2. Stdin Schemas

Claude Code sends JSON via stdin to hooks. The structure depends on the hook type.

### 2.1 PreToolUse Stdin

**Schema:** `hook-stdin-pretooluse.schema.json`

```json
{
  "tool_name": "Task",
  "tool_input": {
    "subagent_type": "software-developer",
    "prompt": "Implement feature...",
    "description": "Build auth system"
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_name` | string | Yes | Name of the tool being called (Task, Skill, Bash, etc.) |
| `tool_input` | object | No | Input parameters passed to the tool |
| `tool_input.command` | string | No | For Bash tool: the command string |
| `tool_input.subagent_type` | string | No | For Task tool: agent name |
| `tool_input.prompt` | string | No | For Task tool: task prompt |
| `tool_input.description` | string | No | For Task tool: task description |
| `tool_input.skill` | string | No | For Skill tool: skill name |
| `tool_input.args` | string | No | For Skill tool: arguments |

### 2.2 PostToolUse Stdin

**Schema:** `hook-stdin-posttooluse.schema.json`

```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "npm test" },
  "tool_result": "All tests passed"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `tool_name` | string | Yes | Name of the tool that was called |
| `tool_input` | object | No | Input parameters that were passed to the tool |
| `tool_result` | any | No | Result returned by the tool (string or object) |

### 2.3 Stop Stdin

**Schema:** `hook-stdin-stop.schema.json`

```json
{
  "stop_hook_active": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `stop_hook_active` | boolean | No | Whether the stop hook is being invoked |

Note: The Stop hook stdin format is minimal. Most Stop hooks read state.json directly rather than relying on stdin content.

---

## 3. Stdout Contracts

Hooks communicate back to Claude Code via stdout. The format depends on the hook's purpose.

### 3.1 Blocking Response (PreToolUse)

When a PreToolUse hook needs to block a tool call:

```json
{
  "decision": "block",
  "reason": "Gate requirements not met: constitutional validation incomplete"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `decision` | "block" | Signals Claude Code to reject the tool call |
| `reason` | string | Human-readable explanation of why the call was blocked |

### 3.2 Allow Response (PreToolUse)

When a PreToolUse hook allows the action, it outputs nothing (empty stdout) or exits with code 0.

### 3.3 Model Override (PreToolUse - model-provider-router)

```json
{
  "model": "claude-sonnet-4-20250514"
}
```

Only output when an actual model override is needed. No output means use the default model.

### 3.4 Stop Hook Response

When the Stop hook needs to block conversation end:

```json
{
  "decision": "block",
  "reason": "Orchestrator delegation required but not completed"
}
```

---

## 4. State.json Subsystem Schemas

Hooks read and write specific subsystems of `.isdlc/state.json`. Each subsystem has a canonical schema.

### 4.1 Constitutional Validation

**Schema:** `constitutional-validation.schema.json`
**Location in state.json:** `phases[*].constitutional_validation`
**Used by:** gate-blocker, constitution-validator, iteration-corridor

```json
{
  "completed": true,
  "status": "compliant",
  "iterations_used": 1,
  "max_iterations": 5,
  "articles_checked": ["I", "IV", "VII", "IX", "XII"],
  "history": [
    {
      "iteration": 1,
      "timestamp": "2026-02-08T17:00:00Z",
      "violations": [],
      "result": "COMPLIANT"
    }
  ]
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `completed` | boolean | **Yes** | true/false | Whether validation is finished |
| `status` | string | **Yes** | "pending", "iterating", "compliant", "escalated" | Current validation status |
| `iterations_used` | integer | **Yes** | >= 0 | Number of iterations performed |
| `max_iterations` | integer | No | >= 1 | Maximum iterations allowed |
| `articles_checked` | string[] | No | Roman numerals | Constitutional articles validated |
| `history` | object[] | No | | Iteration history entries |
| `history[].iteration` | integer | No | | Iteration number |
| `history[].timestamp` | string | No | ISO-8601 | When this iteration ran |
| `history[].violations` | array | No | | Violations found |
| `history[].result` | string | No | | Iteration result |

**Gate-blocker reads:** `completed` must be `true` AND `iterations_used` must be >= 1.

**DEPRECATED field names (do NOT use):**
- ~~`final_status`~~ -- use `status`
- ~~`total_iterations`~~ -- use `iterations_used`

### 4.2 Interactive Elicitation

**Schema:** `interactive-elicitation.schema.json`
**Location in state.json:** `phases[*].iteration_requirements.interactive_elicitation`
**Used by:** gate-blocker, menu-tracker

```json
{
  "required": true,
  "completed": true,
  "menu_interactions": 3,
  "selections": ["initial", "clarification", "edge-cases"],
  "steps_completed": ["Step 1", "Step 2", "Step 3"],
  "started_at": "2026-02-08T16:50:00Z",
  "last_menu_at": "2026-02-08T17:10:00Z",
  "final_selection": "continue"
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `completed` | boolean | **Yes** | true/false | Whether elicitation is finished |
| `menu_interactions` | integer | **Yes** | >= 0 | Count of A/R/C menu interactions |
| `final_selection` | string | No | "save", "continue", "exit" | The terminal menu selection |
| `selections` | array | No | | History of all selections |
| `steps_completed` | string[] | No | | List of completed step names |

**Gate-blocker reads:** `completed` must be `true`, `menu_interactions` must be >= the minimum required (from iteration-requirements.json), and `final_selection` must be present and one of "save" or "continue".

### 4.3 Test Iteration

**Schema:** `test-iteration.schema.json`
**Location in state.json:** `phases[*].iteration_requirements.test_iteration`
**Used by:** gate-blocker, test-watcher, iteration-corridor

```json
{
  "completed": true,
  "status": "success",
  "current_iteration": 2,
  "max_iterations": 10,
  "last_test_result": "passed",
  "history": [
    {
      "iteration": 1,
      "timestamp": "2026-02-08T17:00:00Z",
      "command": "npm test",
      "result": "FAILED"
    },
    {
      "iteration": 2,
      "timestamp": "2026-02-08T17:05:00Z",
      "command": "npm test",
      "result": "PASSED"
    }
  ]
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `completed` | boolean | **Yes** | true/false | Whether iteration is finished |
| `status` | string | No | "success", "escalated" | Final status when completed |
| `current_iteration` | integer | **Yes** | >= 0 | Current iteration count |
| `max_iterations` | integer | No | >= 1 | Maximum iterations allowed |
| `last_test_result` | string | No | "passed", "failed" | Most recent test outcome |
| `history` | object[] | No | | Iteration history entries |

**Gate-blocker reads:** `completed` must be `true` AND `current_iteration` must be >= 1.

### 4.4 Skill Usage Log Entry

**Schema:** `skill-usage-entry.schema.json`
**Location in state.json:** `skill_usage_log[]`
**Used by:** log-skill-usage

```json
{
  "timestamp": "2026-02-08T17:00:00Z",
  "agent": "sdlc-orchestrator",
  "agent_phase": "all",
  "current_phase": "01-requirements",
  "description": "Start feature workflow",
  "status": "executed",
  "reason": "authorized-orchestrator",
  "enforcement_mode": "observe"
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `timestamp` | string | **Yes** | ISO-8601 | When the skill was invoked |
| `agent` | string | **Yes** | | Agent name |
| `agent_phase` | string | No | | Agent's designated phase |
| `current_phase` | string | No | | Current workflow phase |
| `description` | string | No | | Action description |
| `status` | string | **Yes** | "executed", "observed", "warned", "audited" | Execution status |
| `reason` | string | No | | Reason for the status |
| `enforcement_mode` | string | No | | Active enforcement mode |

### 4.5 Pending Delegation

**Schema:** `pending-delegation.schema.json`
**Location in state.json:** `pending_delegation`
**Used by:** skill-delegation-enforcer (writes), delegation-gate (reads)

```json
{
  "skill": "sdlc",
  "required_agent": "sdlc-orchestrator",
  "invoked_at": "2026-02-08T17:00:00Z",
  "args": "feature \"Build auth\""
}
```

| Field | Type | Required | Values | Description |
|-------|------|----------|--------|-------------|
| `skill` | string | **Yes** | "sdlc", "discover" | Skill name |
| `required_agent` | string | **Yes** | | Agent that must be delegated to |
| `invoked_at` | string | **Yes** | ISO-8601 | When the skill was invoked |
| `args` | string | No | | Arguments passed to the skill |

---

## 5. Schema Validation

### 5.1 Shared Validator

The `validateSchema(data, schemaId)` function in `common.cjs` provides lightweight inline JSON Schema validation.

**Usage:**
```javascript
const { validateSchema } = require('./lib/common.cjs');

const result = validateSchema(stateData, 'constitutional-validation');
if (!result.valid) {
    debugLog('Schema errors:', result.errors);
}
```

**Return type:**
```javascript
{ valid: true }
// or
{ valid: false, errors: ["(root): missing required field 'completed'", ...] }
```

### 5.2 Supported Validations

The inline validator supports:
- `type` checking (string, boolean, integer, number, object, array, null)
- `required` fields
- `enum` values
- `minimum` for numbers/integers
- `properties` (recursive validation of nested objects)
- `items` (validation of array elements)

**Not supported:** `$ref`, `allOf`, `oneOf`, `anyOf`, `patternProperties`, `format`, `pattern`, `maxLength`, `maxItems`.

### 5.3 Fail-Open Behavior

Schema validation is designed to fail-open:
- Missing schema file: returns `{ valid: true }`
- Malformed schema file: returns `{ valid: true }`
- Validator internal error: returns `{ valid: true }`
- Schema validation failure: returns `{ valid: false, errors: [...] }` (logged, not blocking)

Hooks log validation failures via `debugLog()` and continue processing. Schema validation never blocks a legitimate operation.

### 5.4 Schema File Locations

Schemas are stored in `src/claude/hooks/config/schemas/` (source) and copied to both:
- `.claude/hooks/config/schemas/` (runtime, Claude Code project dir)
- `.isdlc/config/schemas/` (runtime, iSDLC project dir)

The `loadSchema()` function searches both locations with `.claude/` taking priority.

---

## 6. Hook-by-Hook Contract Details

### 6.1 gate-blocker.cjs (v3.0.0)

**Type:** PreToolUse
**Matchers:** Task, Skill
**Intercepts:** Task calls with "advance"/"gate-check"/"gate" in prompt; Skill calls with /isdlc advance

**Stdin:** `hook-stdin-pretooluse` schema
**Stdout:** Blocking response or empty (allow)

**State reads:**
- `phases[current_phase].constitutional_validation` -- validates against `constitutional-validation` schema
- `phases[current_phase].iteration_requirements.interactive_elicitation` -- validates against `interactive-elicitation` schema
- `phases[current_phase].iteration_requirements.test_iteration` -- validates against `test-iteration` schema
- `active_workflow.current_phase` and `active_workflow.phases`

**Checks (in order):**
1. Constitutional validation complete (completed=true, iterations_used>=1)
2. Interactive elicitation complete (completed=true, menu_interactions>=min, final_selection present)
3. Test iteration complete (completed=true, current_iteration>=1)
4. Agent delegation requirement (phase agent was delegated via Task tool)

### 6.2 constitution-validator.cjs

**Type:** PreToolUse
**Matcher:** Task
**Intercepts:** Task calls to agents for phases that require constitutional validation

**Stdin:** `hook-stdin-pretooluse` schema
**Stdout:** Empty (never blocks -- initializes tracking only)

**State writes:**
- `phases[target_phase].constitutional_validation` -- initializes with `completed: false, status: "pending", iterations_used: 0`

### 6.3 iteration-corridor.cjs

**Type:** PreToolUse
**Matchers:** Task, Skill
**Intercepts:** Task calls to determine if iteration is within corridor boundaries

**Stdin:** `hook-stdin-pretooluse` schema
**Stdout:** Blocking response or empty

**State reads:**
- `phases[current_phase].iteration_requirements.test_iteration`
- `phases[current_phase].constitutional_validation`

### 6.4 skill-validator.cjs

**Type:** PreToolUse
**Matcher:** Task
**Purpose:** Observability only -- logs skill usage, never blocks

**Stdin:** `hook-stdin-pretooluse` schema
**Stdout:** Always empty (exits 0)

### 6.5 model-provider-router.cjs

**Type:** PreToolUse
**Matcher:** Task
**Purpose:** Route to optimal LLM provider based on phase/complexity

**Stdin:** `hook-stdin-pretooluse` schema
**Stdout:** Model override JSON or empty (no override)

### 6.6 log-skill-usage.cjs

**Type:** PostToolUse
**Matcher:** Task
**Purpose:** Record skill invocations to audit log

**Stdin:** `hook-stdin-posttooluse` schema
**Stdout:** Empty

**State writes:**
- Appends to `skill_usage_log[]` -- entries conform to `skill-usage-entry` schema

### 6.7 menu-tracker.cjs

**Type:** PostToolUse
**Matcher:** Task
**Purpose:** Track A/R/C menu interactions for interactive elicitation

**Stdin:** `hook-stdin-posttooluse` schema
**Stdout:** Empty

**State writes:**
- `phases[current_phase].iteration_requirements.interactive_elicitation` -- updates `menu_interactions`, `selections`, `final_selection`

**Guards:** Exits silently when no `active_workflow` in state.json.

### 6.8 skill-delegation-enforcer.cjs

**Type:** PostToolUse
**Matcher:** Skill
**Purpose:** Write pending_delegation marker when /isdlc or /discover loaded

**Stdin:** `hook-stdin-posttooluse` schema
**Stdout:** Empty

**State writes:**
- `pending_delegation` -- conforms to `pending-delegation` schema

### 6.9 test-watcher.cjs

**Type:** PostToolUse
**Matcher:** Bash
**Purpose:** Track test execution results and iteration counts

**Stdin:** `hook-stdin-posttooluse` schema
**Stdout:** Empty

**State writes:**
- `phases[current_phase].iteration_requirements.test_iteration` -- updates `current_iteration`, `last_test_result`, `history`

**Guards:** Exits silently when no `active_workflow` in state.json.

### 6.10 review-reminder.cjs

**Type:** PostToolUse
**Matcher:** Bash
**Purpose:** Warn on git commit when code review phase not completed

**Stdin:** `hook-stdin-posttooluse` schema
**Stdout:** Empty (logs warnings to stderr)

### 6.11 delegation-gate.cjs

**Type:** Stop
**Purpose:** Verify orchestrator delegation occurred after skill load

**Stdin:** `hook-stdin-stop` schema
**Stdout:** Blocking response or empty

**State reads:**
- `pending_delegation` -- checks if delegation was completed and clears marker

---

## 7. Schema File Inventory

All schema files are stored in `src/claude/hooks/config/schemas/`:

| File | Schema ID | Subsystem |
|------|-----------|-----------|
| `constitutional-validation.schema.json` | `constitutional-validation` | `phases[*].constitutional_validation` |
| `interactive-elicitation.schema.json` | `interactive-elicitation` | `phases[*].iteration_requirements.interactive_elicitation` |
| `test-iteration.schema.json` | `test-iteration` | `phases[*].iteration_requirements.test_iteration` |
| `skill-usage-entry.schema.json` | `skill-usage-entry` | `skill_usage_log[]` |
| `pending-delegation.schema.json` | `pending-delegation` | `pending_delegation` |
| `hook-stdin-pretooluse.schema.json` | `hook-stdin-pretooluse` | stdin for PreToolUse hooks |
| `hook-stdin-posttooluse.schema.json` | `hook-stdin-posttooluse` | stdin for PostToolUse hooks |
| `hook-stdin-stop.schema.json` | `hook-stdin-stop` | stdin for Stop hooks |

---

## 8. Deprecated Field Names

The following field names were used historically but are **no longer valid**. Hooks and agents must use the canonical names listed in Section 4.

| Deprecated Name | Canonical Name | Subsystem |
|-----------------|---------------|-----------|
| `final_status` | `status` | constitutional_validation |
| `total_iterations` | `iterations_used` | constitutional_validation |

These deprecated names will cause gate-blocker to not recognize the field values, resulting in false gate blocks.
