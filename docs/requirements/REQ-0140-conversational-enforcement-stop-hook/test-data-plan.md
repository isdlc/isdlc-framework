# Test Data Plan: REQ-0140 — Conversational Enforcement via Stop Hook

**Requirement**: REQ-0140
**Phase**: 05 - Test Strategy & Design
**Date**: 2026-03-25

---

## 1. Rule Definition Fixtures

### 1.1 Valid Built-in Rules (3 rules)

```json
[
  {
    "id": "bulleted-format",
    "name": "Bulleted Output Format",
    "trigger_condition": { "config": "verbosity", "value": "bulleted", "workflow": "analyze" },
    "check": {
      "type": "pattern",
      "pattern": "^(?!\\s*[-*]|\\s*\\d+\\.|#{1,6}\\s|\\|.*\\||```|---)",
      "scope": "line",
      "threshold": 0.3,
      "description": "More than 30% of non-empty lines are prose"
    },
    "corrective_guidance": "Your response must use bullet-point formatting. Rewrite all prose paragraphs as bulleted lists.",
    "severity": "block",
    "provider_scope": "both"
  },
  {
    "id": "sequential-domain-confirmation",
    "name": "Sequential Domain Confirmation",
    "trigger_condition": { "state": "confirmation_state", "matches": "PRESENTING_*", "workflow": "analyze" },
    "check": {
      "type": "structural",
      "detect": ["Requirements", "Architecture", "Design"],
      "max_domains_per_message": 1,
      "description": "Only one domain confirmation per message"
    },
    "corrective_guidance": "You must present domain confirmations one at a time. Present only the current domain (Requirements, Architecture, or Design). Wait for user acceptance before proceeding to the next.",
    "severity": "block",
    "provider_scope": "both"
  },
  {
    "id": "elicitation-first",
    "name": "Elicitation Before Analysis",
    "trigger_condition": { "state": "confirmation_state", "matches": "IDLE", "workflow": "analyze" },
    "check": {
      "type": "state-match",
      "requires_question": true,
      "blocks_phrases": ["analysis complete", "here is the complete", "finished analysis", "final analysis"],
      "description": "First exchange must contain an elicitation question"
    },
    "corrective_guidance": "You must ask at least one elicitation question before presenting analysis. Open with a focused question to gather user context.",
    "severity": "block",
    "provider_scope": "both"
  }
]
```

### 1.2 Invalid Rule Fixtures

```json
[
  {
    "name": "Missing ID Rule",
    "trigger_condition": { "config": "verbosity", "value": "bulleted" },
    "check": { "type": "pattern", "pattern": ".*" },
    "severity": "block"
  },
  {
    "id": "missing-check",
    "name": "Rule Missing Check",
    "trigger_condition": { "config": "verbosity", "value": "bulleted" },
    "severity": "block"
  }
]
```

### 1.3 Provider-Scoped Rule Fixtures

```json
[
  { "id": "claude-only-rule", "provider_scope": "claude", "severity": "warn", "trigger_condition": {}, "check": { "type": "pattern", "pattern": "test" }, "name": "Claude Only", "corrective_guidance": "Fix it" },
  { "id": "codex-only-rule", "provider_scope": "codex", "severity": "warn", "trigger_condition": {}, "check": { "type": "pattern", "pattern": "test" }, "name": "Codex Only", "corrective_guidance": "Fix it" },
  { "id": "both-providers-rule", "provider_scope": "both", "severity": "block", "trigger_condition": {}, "check": { "type": "pattern", "pattern": "test" }, "name": "Both Providers", "corrective_guidance": "Fix it" }
]
```

---

## 2. Response Content Samples

### 2.1 Compliant Bulleted Response

```
**Requirements**:
- The system must validate user input at all boundaries
- Authentication tokens expire after 24 hours
- Password complexity requires minimum 12 characters

What specific authentication mechanism are you considering?
```

### 2.2 Non-Compliant Prose Response (>30% prose)

```
The system needs to handle authentication carefully. We should consider multiple factors when designing the login flow. Security is paramount and we need to ensure all credentials are properly hashed.

- One bullet point here
- Another bullet point

Overall, the architecture should be modular and extensible. This allows for future growth and maintenance. The team should focus on clean interfaces.
```

### 2.3 Borderline Response (exactly 30% prose — 3 prose lines out of 10 non-empty)

```
- Bullet point one
- Bullet point two
- Bullet point three
This is a prose line that should be counted.
- Bullet point four
- Bullet point five
This is another prose line.
- Bullet point six
- Bullet point seven
One more prose line here.
```

### 2.4 Response with Mixed Formatting (headings, tables, code blocks)

```
## Section Heading

- Point one about the feature
- Point two about the design

| Column A | Column B |
|----------|----------|
| Value 1  | Value 2  |

```javascript
function example() { return true; }
```

- Final bullet point
```

### 2.5 Collapsed Three-Domain Confirmation

```
## Requirements Summary

**Requirements**:
- FR-001: Rule definition schema
- FR-002: Rule extraction

Do you accept or want to amend?

## Architecture Summary

**Architecture**:
- Shared compliance engine
- Stop hook integration

Do you accept or want to amend?

## Design Summary

**Design**:
- Module layout as specified
- CJS compliance engine

Do you accept or want to amend?
```

### 2.6 Single-Domain Confirmation (Compliant)

```
## Requirements Summary

**Requirements**:
- FR-001: Rule definition schema must support id, name, trigger_condition, check, corrective_guidance, severity, provider_scope
- FR-002: Rule extraction from CLAUDE.md and agent files

Accept or amend?
```

### 2.7 Analysis Complete Without Question (Non-Compliant)

```
Here is the complete analysis for this feature:

**Requirements**:
- The feature needs a compliance engine
- Stop hook integration is required
- Codex support via runtime inspection

**Architecture**:
- Shared engine consumed by two surfaces

This analysis covers all aspects of the requirement.
```

### 2.8 First Exchange with Elicitation Question (Compliant)

```
**Requirements**:
- I see this feature involves conversational rule enforcement
- The scope covers bulleted format, domain confirmation, and elicitation

Before I proceed with the full analysis, what is your primary use case — are you mainly concerned with the bulleted format enforcement, or is the three-domain confirmation sequence the bigger pain point?
```

---

## 3. Roundtable State Fixtures

### 3.1 Valid State Files

```json
{ "confirmation_state": "IDLE", "updated_at": "2026-03-25T15:00:00.000Z" }
```

```json
{ "confirmation_state": "PRESENTING_REQUIREMENTS", "updated_at": "2026-03-25T15:05:00.000Z" }
```

```json
{ "confirmation_state": "PRESENTING_ARCHITECTURE", "updated_at": "2026-03-25T15:10:00.000Z" }
```

```json
{ "confirmation_state": "PRESENTING_DESIGN", "updated_at": "2026-03-25T15:15:00.000Z" }
```

```json
{ "confirmation_state": "FINALIZING", "updated_at": "2026-03-25T15:20:00.000Z" }
```

### 3.2 Invalid/Edge Case State Files

**Unparseable JSON**:
```
{broken json content
```

**Wrong type for confirmation_state**:
```json
{ "confirmation_state": 12345, "updated_at": "2026-03-25T15:00:00.000Z" }
```

**Missing confirmation_state**:
```json
{ "updated_at": "2026-03-25T15:00:00.000Z" }
```

**Empty object**:
```json
{}
```

---

## 4. Boundary Values

### 4.1 Prose Threshold Boundaries

| Scenario | Total Non-Empty Lines | Prose Lines | Prose % | Expected |
|----------|----------------------|-------------|---------|----------|
| All bullets | 10 | 0 | 0% | Pass |
| Below threshold | 10 | 2 | 20% | Pass |
| At threshold | 10 | 3 | 30% | Pass (threshold is ">30%") |
| Just above threshold | 100 | 31 | 31% | Fail |
| Half prose | 10 | 5 | 50% | Fail |
| All prose | 10 | 10 | 100% | Fail |
| Empty response | 0 | 0 | N/A | Pass |
| Single bullet line | 1 | 0 | 0% | Pass |
| Single prose line | 1 | 1 | 100% | Fail |

### 4.2 Retry Counter Boundaries

| Scenario | Retry Count | Expected Behavior |
|----------|-------------|-------------------|
| First violation | 0 -> 1 | Block with guidance |
| Second violation (same rule) | 1 -> 2 | Block with guidance |
| Third violation (same rule) | 2 -> 3 | Block with guidance |
| Fourth violation (same rule) | 3 (limit reached) | Allow with warning |
| Reset after success | N -> 0 | Counter cleared |
| Reset on different rule | N -> 0 (old), 0 -> 1 (new) | New counter started |

### 4.3 Response Size Boundaries

| Scenario | Size | Expected |
|----------|------|----------|
| Empty response | 0 bytes | Pass (no lines to check) |
| Minimal response | 10 bytes (1 line) | Evaluated normally |
| Typical response | 2KB (~50 lines) | Evaluated within 200ms |
| Large response | 50KB (~500 lines) | Evaluated within 200ms |
| Very large response | 200KB (~2000 lines) | Evaluated within 500ms |
| Oversized response | 2MB | Completes or times out gracefully |

---

## 5. Invalid Inputs

### 5.1 Hook Stdin Invalid Inputs

| Input | Description | Expected Behavior |
|-------|-------------|-------------------|
| `{broken` | Malformed JSON | Exit 0, empty stdout (fail-open) |
| `""` | Empty string | Exit 0, empty stdout |
| `null` | Null value | Exit 0, empty stdout |
| `[]` | Array instead of object | Exit 0, empty stdout |
| `{ "stop_hook_active": "yes" }` | String instead of boolean | Treated as truthy, evaluation proceeds |
| `{ "stop_hook_active": true }` | Missing assistant_response | Evaluate with empty response, no violation |
| `{ "stop_hook_active": true, "assistant_response": 12345 }` | Non-string response | Coerce to string or skip evaluation |

### 5.2 Rule Definition Invalid Inputs

| Input | Description | Expected Behavior |
|-------|-------------|-------------------|
| Missing `id` | Rule without identifier | Skipped with warning |
| Missing `check` | Rule without check definition | Skipped with warning |
| Missing `severity` | Rule without severity | Skipped with warning (or default to warn) |
| Invalid `check.type` | `type: "unknown"` | Skipped with warning |
| Invalid `provider_scope` | `provider_scope: "antigravity"` | Rule not matched to any provider, effectively skipped |
| Empty `corrective_guidance` | `corrective_guidance: ""` | Rule evaluates but block reason is empty string |
| Invalid regex in pattern | `pattern: "([unclosed"` | Rule evaluation fails, caught and skipped (fail-open) |

### 5.3 Sidecar File Invalid Inputs

| Input | Description | Expected Behavior |
|-------|-------------|-------------------|
| File missing | No roundtable-state.json | roundtableState = null, state rules skipped |
| Empty file | 0 bytes | JSON parse fails, treated as null |
| Invalid JSON | `{broken` | Parse fails, treated as null |
| Valid JSON, wrong shape | `{ "foo": "bar" }` | Missing confirmation_state, treated as null |
| Number in state field | `{ "confirmation_state": 42 }` | Type mismatch, treated as invalid |
| Array value | `{ "confirmation_state": ["IDLE"] }` | Type mismatch, treated as invalid |

---

## 6. Maximum-Size Inputs

### 6.1 Maximum Response Size

- **2MB response text**: Generated as repeated lines of compliant bullet content. Verifies no OOM and hook completes within timeout.
- **Generator**: `'- Bullet line ' + i + '\n'` repeated to fill 2MB

### 6.2 Maximum Rules Count

- **50 rules**: All valid, mixed severity. Verifies evaluation completes within acceptable time.
- **Generator**: Loop creating rules with unique IDs, varying trigger conditions

### 6.3 Maximum Sidecar File Age

- **Stale sidecar**: `updated_at` set to 24 hours ago. Verifies compliance engine handles stale state gracefully (no crash; may optionally warn about stale state).

---

## 7. Configuration Fixtures

### 7.1 roundtable.yaml Variants

**Bulleted verbosity**:
```yaml
verbosity: bulleted
```

**Conversational verbosity**:
```yaml
verbosity: conversational
```

**Silent verbosity**:
```yaml
verbosity: silent
```

**Missing verbosity key**:
```yaml
# empty or other config
depth: standard
```

### 7.2 Stop Hook Input Variants

**Standard input (compliant response)**:
```json
{
  "stop_hook_active": true,
  "assistant_response": "- Bullet one\n- Bullet two\n\nWhat do you think?"
}
```

**Standard input (non-compliant response)**:
```json
{
  "stop_hook_active": true,
  "assistant_response": "This is a prose paragraph that violates the bulleted format rule. It contains multiple sentences in paragraph form. The response should use bullets instead."
}
```

**Inactive hook**:
```json
{
  "stop_hook_active": false,
  "assistant_response": "any content"
}
```

---

## 8. Test Data Generation Strategy

All test data is **static fixtures** defined in the test files themselves (no external generation needed). This ensures:

1. **Determinism**: Same data every run, no randomness
2. **Readability**: Test data visible alongside test assertions
3. **Independence**: No external file dependencies beyond the fixture rules JSON
4. **Article XIII compliance**: All data created in temp directories, no writes to project tree

For performance tests, response content is generated programmatically at test time using simple string repetition (`'- Line N\n'.repeat(count)`).

For boundary tests, exact threshold values are calculated from the test data to ensure precision (e.g., 3 prose lines out of 10 total = exactly 30%).
