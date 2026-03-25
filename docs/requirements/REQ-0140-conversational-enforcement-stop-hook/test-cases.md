# Test Cases: REQ-0140 — Conversational Enforcement via Stop Hook

**Requirement**: REQ-0140
**Phase**: 05 - Test Strategy & Design
**Date**: 2026-03-25

---

## 1. Compliance Engine — `loadRules()` (FR-001)

### TC-001: Load valid rule definitions
- **Requirement**: FR-001, AC-001-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: `conversational-rules.json` exists with 3 valid rule objects
- **Input**: Path to valid rules file
- **Expected**: Returns array of 3 Rule objects, each with `id`, `name`, `trigger_condition`, `check`, `corrective_guidance`, `severity`, `provider_scope`
- **Validation**: Assert array length === 3, assert each rule has all required fields

### TC-002: Skip invalid rules with warning
- **Requirement**: FR-001, AC-001-04
- **Type**: negative
- **Priority**: P0
- **Precondition**: Rules file contains 2 valid rules and 1 rule missing `id` field
- **Input**: Path to file with mixed valid/invalid rules
- **Expected**: Returns array of 2 valid rules; invalid rule skipped; warning logged to stderr
- **Validation**: Assert array length === 2, assert stderr contains warning about skipped rule

### TC-003: Missing rules file returns empty set
- **Requirement**: FR-001, AC-001-05
- **Type**: negative
- **Priority**: P0
- **Precondition**: No `conversational-rules.json` exists at the specified path
- **Input**: Path to non-existent file
- **Expected**: Returns empty array `[]`, no error thrown
- **Validation**: Assert array length === 0, assert no exceptions

### TC-004: Malformed JSON in rules file
- **Requirement**: FR-001, AC-001-04
- **Type**: negative
- **Priority**: P1
- **Precondition**: Rules file contains invalid JSON (`{broken`)
- **Input**: Path to malformed file
- **Expected**: Returns empty array, warning logged (fail-open)
- **Validation**: Assert empty array, assert warning logged

### TC-005: Rule with all optional fields populated
- **Requirement**: FR-001, AC-001-01
- **Type**: positive
- **Priority**: P2
- **Precondition**: Rule definition includes threshold, scope, description in check object
- **Input**: Fully-specified rule
- **Expected**: All fields preserved in parsed Rule object
- **Validation**: Assert check.threshold, check.scope, check.description present

---

## 2. Compliance Engine — Rule Filtering (FR-001, FR-005)

### TC-006: Filter rules by provider_scope — claude only
- **Requirement**: FR-001, AC-001-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rules array has 1 claude-only, 1 codex-only, 1 both rule
- **Input**: provider = "claude"
- **Expected**: 2 rules evaluated (claude-only + both); codex-only skipped
- **Validation**: Assert evaluated rule IDs exclude the codex-only rule

### TC-007: Filter rules by provider_scope — codex only
- **Requirement**: FR-001, AC-001-03, FR-006, AC-006-05
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rules array has 1 claude-only, 1 codex-only, 1 both rule
- **Input**: provider = "codex"
- **Expected**: 2 rules evaluated (codex-only + both); claude-only skipped
- **Validation**: Assert evaluated rule IDs exclude the claude-only rule

### TC-008: Filter rules by trigger_condition — config match
- **Requirement**: FR-001, AC-001-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rule has `trigger_condition: { config: "verbosity", value: "bulleted" }`
- **Input**: config `{ verbosity: "bulleted" }`
- **Expected**: Rule is evaluated
- **Validation**: Assert rule appears in evaluation results

### TC-009: Filter rules by trigger_condition — config mismatch
- **Requirement**: FR-001, AC-001-02
- **Type**: negative
- **Priority**: P0
- **Precondition**: Rule has `trigger_condition: { config: "verbosity", value: "bulleted" }`
- **Input**: config `{ verbosity: "conversational" }`
- **Expected**: Rule is skipped (not evaluated)
- **Validation**: Assert no violation from this rule

### TC-010: Filter rules by trigger_condition — workflow mismatch
- **Requirement**: FR-001, AC-001-02
- **Type**: negative
- **Priority**: P1
- **Precondition**: Rule has `trigger_condition: { workflow: "analyze" }`
- **Input**: Workflow context is "build"
- **Expected**: Rule is skipped
- **Validation**: Assert no violation

### TC-011: State-dependent rule skipped when roundtable state is null
- **Requirement**: FR-005, AC-005-05
- **Type**: negative
- **Priority**: P0
- **Precondition**: Rule requires `confirmation_state` to be present; roundtableState is null
- **Input**: roundtableState = null
- **Expected**: State-dependent rule skipped, non-state rules still evaluated
- **Validation**: Assert state-dependent rule not in violations list

---

## 3. Compliance Engine — Bulleted Format Check (FR-005)

### TC-012: Response with 100% bullet lines passes
- **Requirement**: FR-005, AC-005-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: `verbosity: bulleted`, bulleted-format rule active
- **Input**: Response where every non-empty line starts with `- ` or `* `
- **Expected**: No violation
- **Validation**: Assert verdict.violation === false

### TC-013: Response with >30% prose lines triggers violation
- **Requirement**: FR-005, AC-005-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: `verbosity: bulleted`, bulleted-format rule active
- **Input**: Response with 50% prose paragraphs, 50% bullets
- **Expected**: Violation detected, severity "block", corrective guidance includes bullet formatting instructions
- **Validation**: Assert violation === true, rule_id === "bulleted-format"

### TC-014: Response with exactly 30% prose lines is borderline — no violation
- **Requirement**: FR-005, AC-005-01
- **Type**: boundary
- **Priority**: P1
- **Precondition**: `verbosity: bulleted`, threshold = 0.3
- **Input**: Response with exactly 30% prose lines (e.g., 3 prose out of 10 non-empty)
- **Expected**: No violation (threshold is "more than 30%", so 30% exactly passes)
- **Validation**: Assert verdict.violation === false

### TC-015: Response with 31% prose lines triggers violation
- **Requirement**: FR-005, AC-005-01
- **Type**: boundary
- **Priority**: P1
- **Precondition**: `verbosity: bulleted`, threshold = 0.3
- **Input**: Response with 31% prose lines
- **Expected**: Violation detected
- **Validation**: Assert verdict.violation === true

### TC-016: Headings excluded from prose count
- **Requirement**: FR-005, AC-005-01
- **Type**: positive
- **Priority**: P1
- **Precondition**: `verbosity: bulleted`
- **Input**: Response with `## Heading` lines, bullet lines, no prose
- **Expected**: No violation (headings are not counted as prose)
- **Validation**: Assert violation === false

### TC-017: Code blocks excluded from prose count
- **Requirement**: FR-005, AC-005-01
- **Type**: positive
- **Priority**: P1
- **Precondition**: `verbosity: bulleted`
- **Input**: Response with ``` delimited code block containing prose-like lines
- **Expected**: No violation (code block lines excluded)
- **Validation**: Assert violation === false

### TC-018: Table rows excluded from prose count
- **Requirement**: FR-005, AC-005-01
- **Type**: positive
- **Priority**: P1
- **Precondition**: `verbosity: bulleted`
- **Input**: Response with `| col1 | col2 |` table rows
- **Expected**: No violation (table rows excluded)
- **Validation**: Assert violation === false

### TC-019: Numbered list items excluded from prose count
- **Requirement**: FR-005, AC-005-01
- **Type**: positive
- **Priority**: P2
- **Precondition**: `verbosity: bulleted`
- **Input**: Response with `1. Item` numbered list lines
- **Expected**: No violation
- **Validation**: Assert violation === false

### TC-020: Empty response — no violation
- **Requirement**: FR-005, AC-005-01
- **Type**: boundary
- **Priority**: P2
- **Precondition**: `verbosity: bulleted`
- **Input**: Empty string response
- **Expected**: No violation (0 lines, nothing to check)
- **Validation**: Assert violation === false

---

## 4. Compliance Engine — Sequential Domain Confirmation (FR-005)

### TC-021: Single-domain confirmation passes
- **Requirement**: FR-005, AC-005-02, AC-005-04
- **Type**: positive
- **Priority**: P0
- **Precondition**: roundtableState = `{ confirmation_state: "PRESENTING_REQUIREMENTS" }`
- **Input**: Response containing only Requirements domain confirmation (no Architecture/Design)
- **Expected**: No violation
- **Validation**: Assert violation === false

### TC-022: Collapsed three-domain confirmation triggers violation
- **Requirement**: FR-005, AC-005-02, AC-005-04
- **Type**: positive
- **Priority**: P0
- **Precondition**: roundtableState = `{ confirmation_state: "PRESENTING_REQUIREMENTS" }`
- **Input**: Response containing Requirements + Architecture + Design confirmations in one message
- **Expected**: Violation detected, severity "block", corrective guidance says "present one domain at a time"
- **Validation**: Assert violation === true, rule_id === "sequential-domain-confirmation"

### TC-023: Two-domain collapse also triggers violation
- **Requirement**: FR-005, AC-005-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: roundtableState = `{ confirmation_state: "PRESENTING_REQUIREMENTS" }`
- **Input**: Response containing Requirements + Architecture (but not Design)
- **Expected**: Violation detected — any multi-domain in one message is a violation
- **Validation**: Assert violation === true

### TC-024: Architecture confirmation when state is PRESENTING_ARCHITECTURE passes
- **Requirement**: FR-005, AC-005-05
- **Type**: positive
- **Priority**: P1
- **Precondition**: roundtableState = `{ confirmation_state: "PRESENTING_ARCHITECTURE" }`
- **Input**: Response containing only Architecture domain confirmation
- **Expected**: No violation
- **Validation**: Assert violation === false

### TC-025: Architecture confirmation when state is PRESENTING_REQUIREMENTS triggers violation
- **Requirement**: FR-005, AC-005-05
- **Type**: negative
- **Priority**: P1
- **Precondition**: roundtableState = `{ confirmation_state: "PRESENTING_REQUIREMENTS" }`
- **Input**: Response presenting Architecture (skipping Requirements confirmation)
- **Expected**: Violation — output does not match expected state
- **Validation**: Assert violation === true

### TC-026: Confirmation check skipped when state is IDLE
- **Requirement**: FR-005, AC-005-05
- **Type**: positive
- **Priority**: P1
- **Precondition**: roundtableState = `{ confirmation_state: "IDLE" }`
- **Input**: Any response content
- **Expected**: Sequential-domain-confirmation rule not triggered (IDLE is not a PRESENTING_* state)
- **Validation**: Assert no sequential-domain violation

---

## 5. Compliance Engine — Elicitation-First Check (FR-005)

### TC-027: Response with elicitation question passes
- **Requirement**: FR-005, AC-005-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: roundtableState = `{ confirmation_state: "IDLE" }` or null (first exchange)
- **Input**: Response containing "What are your thoughts on..." question
- **Expected**: No violation
- **Validation**: Assert violation === false

### TC-028: "Analysis complete" without question triggers violation
- **Requirement**: FR-005, AC-005-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: roundtableState = null or `{ confirmation_state: "IDLE" }`
- **Input**: Response declaring finished analysis without any question
- **Expected**: Violation detected, severity "block", corrective guidance says "ask elicitation question first"
- **Validation**: Assert violation === true, rule_id === "elicitation-first"

### TC-029: Response with both question and analysis — passes
- **Requirement**: FR-005, AC-005-03
- **Type**: positive
- **Priority**: P1
- **Precondition**: First exchange in roundtable
- **Input**: Response containing analysis points AND ending with a question
- **Expected**: No violation (question present)
- **Validation**: Assert violation === false

### TC-030: Elicitation check skipped when state is PRESENTING_* (not first exchange)
- **Requirement**: FR-005, AC-005-03
- **Type**: positive
- **Priority**: P1
- **Precondition**: roundtableState = `{ confirmation_state: "PRESENTING_REQUIREMENTS" }`
- **Input**: Response without a question
- **Expected**: No elicitation-first violation (rule only applies to first exchange)
- **Validation**: Assert no elicitation-first violation

---

## 6. Compliance Engine — Verdict Construction

### TC-031: No violations returns clean verdict
- **Requirement**: FR-003, AC-003-01
- **Type**: positive
- **Priority**: P0
- **Input**: Response that passes all rules
- **Expected**: `{ violation: false, rule_id: null, severity: null, corrective_guidance: null, all_violations: [] }`

### TC-032: Single block violation returns verdict with guidance
- **Requirement**: FR-003, AC-003-02
- **Type**: positive
- **Priority**: P0
- **Input**: Response that violates one block rule
- **Expected**: `{ violation: true, rule_id: "...", severity: "block", corrective_guidance: "...", all_violations: [1 item] }`

### TC-033: Multiple violations — highest severity wins
- **Requirement**: FR-003, AC-003-04
- **Type**: positive
- **Priority**: P0
- **Input**: Response that violates one warn rule and one block rule
- **Expected**: Primary verdict shows block rule; all_violations contains both

### TC-034: Multiple warn violations — first encountered is primary
- **Requirement**: FR-003, AC-003-03
- **Type**: positive
- **Priority**: P2
- **Input**: Response that violates two warn rules
- **Expected**: Primary verdict shows first warn rule; all_violations contains both

---

## 7. Stop Hook — Stdin/Stdout Contract (FR-003)

### TC-035: Valid stop hook input processed correctly
- **Requirement**: FR-003, AC-003-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rules loaded, sidecar file exists
- **Input**: `{ "stop_hook_active": true, "assistant_response": "..." }` on stdin
- **Expected**: Hook evaluates rules and returns appropriate decision on stdout
- **Validation**: Assert exit code 0, stdout is valid JSON (or empty)

### TC-036: Malformed stdin — fail-open
- **Requirement**: FR-003
- **Type**: negative
- **Priority**: P0
- **Precondition**: Hook registered
- **Input**: `{broken json` on stdin
- **Expected**: Hook exits 0 with empty stdout (fail-open, allow through)
- **Validation**: Assert exit code 0, assert stdout empty

### TC-037: Block decision returns correct JSON
- **Requirement**: FR-003, AC-003-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rules loaded; response violates a block-severity rule
- **Input**: Response text that triggers bulleted-format violation
- **Expected**: stdout = `{ "decision": "block", "reason": "<corrective_guidance>" }`
- **Validation**: Parse stdout JSON, assert decision === "block", assert reason is non-empty string

### TC-038: Allow decision returns empty stdout
- **Requirement**: FR-003, AC-003-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rules loaded; response passes all rules
- **Input**: Compliant response text
- **Expected**: stdout is empty or `{ "decision": "allow" }`
- **Validation**: Assert exit code 0

### TC-039: Warn violation logged but allowed through
- **Requirement**: FR-003, AC-003-03
- **Type**: positive
- **Priority**: P1
- **Precondition**: Rule with `severity: "warn"`
- **Input**: Response that violates the warn rule
- **Expected**: stdout empty (allow), stderr contains warning log
- **Validation**: Assert empty stdout, assert stderr contains rule_id

### TC-040: stop_hook_active is false — allow through
- **Requirement**: FR-003
- **Type**: negative
- **Priority**: P1
- **Precondition**: Hook receives input with `stop_hook_active: false`
- **Input**: `{ "stop_hook_active": false, "assistant_response": "violating text" }`
- **Expected**: Hook exits 0 with empty stdout (no evaluation)

---

## 8. Stop Hook — Auto-Retry Counter (FR-004)

### TC-041: First violation blocks with corrective guidance
- **Requirement**: FR-004, AC-004-01, AC-004-04
- **Type**: positive
- **Priority**: P0
- **Input**: Response violating bulleted-format for the first time
- **Expected**: Block returned with corrective guidance specific enough for self-correction
- **Validation**: Assert decision === "block", assert reason contains formatting instructions

### TC-042: Second consecutive violation of same rule — still blocks
- **Requirement**: FR-004, AC-004-01
- **Type**: positive
- **Priority**: P0
- **Precondition**: Same rule violated twice in sequence
- **Input**: Two sequential hook invocations with same violation
- **Expected**: Both return block decisions
- **Note**: In-process retry counter — this tests the counter persistence within a conversation turn

### TC-043: Third retry triggers escalation — allow with warning
- **Requirement**: FR-004, AC-004-02, AC-004-05
- **Type**: positive
- **Priority**: P0
- **Precondition**: Same rule violated 3 times
- **Input**: Fourth invocation with same violation
- **Expected**: Response allowed through (not blocked), warning banner appended
- **Validation**: Assert decision is allow (or empty stdout), assert warning in response

### TC-044: Retry counter resets on successful response
- **Requirement**: FR-004, AC-004-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rule violated once, then next response passes
- **Input**: Passing response after one failure
- **Expected**: Counter reset; next violation starts at count 1 again

### TC-045: Retry counter resets when different rule violated
- **Requirement**: FR-004, AC-004-03
- **Type**: positive
- **Priority**: P1
- **Precondition**: Rule A violated, then Rule B violated
- **Input**: Response violating different rule
- **Expected**: Counter for Rule A reset; Rule B starts at count 1

### TC-046: Auto-retry is invisible to user
- **Requirement**: FR-004, AC-004-06
- **Type**: positive
- **Priority**: P1
- **Input**: Block decision returned by hook
- **Expected**: No user-facing prompt or question in hook output; just block + reason
- **Validation**: Assert stdout contains only the block decision JSON, no interactive prompts

---

## 9. Stop Hook — Fail-Open Behavior (FR-003, Article X)

### TC-047: Missing rules file — allow through
- **Requirement**: FR-001, AC-001-05
- **Type**: negative
- **Priority**: P0
- **Precondition**: No conversational-rules.json in .isdlc/config/
- **Input**: Any response text
- **Expected**: Hook exits 0, empty stdout (no enforcement)

### TC-048: Missing roundtable-state.json — state-dependent rules skipped
- **Requirement**: FR-005
- **Type**: negative
- **Priority**: P0
- **Precondition**: No .isdlc/roundtable-state.json file
- **Input**: Response that would violate sequential-domain-confirmation
- **Expected**: State-dependent rules skipped; response allowed through
- **Validation**: Assert exit code 0, assert no block

### TC-049: Unparseable roundtable-state.json — treated as missing
- **Requirement**: FR-005
- **Type**: negative
- **Priority**: P0
- **Precondition**: .isdlc/roundtable-state.json contains `{broken`
- **Input**: Any response
- **Expected**: roundtableState = null, state-dependent rules skipped

### TC-050: Missing roundtable.yaml — config-dependent rules skipped
- **Requirement**: FR-001, AC-001-02
- **Type**: negative
- **Priority**: P1
- **Precondition**: No .isdlc/roundtable.yaml
- **Input**: Response with prose paragraphs
- **Expected**: Bulleted-format rule skipped (trigger condition not met)

### TC-051: Engine throws unexpected error — allow through
- **Requirement**: FR-003, AC-003-05
- **Type**: negative
- **Priority**: P0
- **Precondition**: Compliance engine throws an exception during evaluation
- **Input**: Specially crafted input that causes engine error (e.g., rule with invalid regex)
- **Expected**: Hook catches error, exits 0, empty stdout

### TC-052: Timeout approaching — short-circuit and allow
- **Requirement**: FR-003, AC-003-05
- **Type**: negative
- **Priority**: P1
- **Precondition**: Simulated slow evaluation (>4s)
- **Input**: Response under evaluation when timeout threshold reached
- **Expected**: Evaluation aborted, response allowed through

---

## 10. Rule Extraction from Prose (FR-002)

### TC-053: Extract rules from CLAUDE.md behavioral instructions
- **Requirement**: FR-002, AC-002-01
- **Type**: positive
- **Priority**: P1
- **Precondition**: CLAUDE.md contains "Analysis Completion Rules" section with MUST/NEVER keywords
- **Input**: Path to CLAUDE.md
- **Expected**: Returns candidate rules with `id`, `trigger_condition`, `check` pattern, `corrective_guidance`
- **Validation**: Assert non-empty array returned, each candidate has required fields

### TC-054: Extract sequence rules from agent state machine
- **Requirement**: FR-002, AC-002-02
- **Type**: positive
- **Priority**: P1
- **Precondition**: Agent file contains state machine transition descriptions
- **Input**: Path to roundtable-analyst.md
- **Expected**: Sequence rules extracted (e.g., "PRESENTING_REQUIREMENTS must precede PRESENTING_ARCHITECTURE")

### TC-055: Manual rule takes precedence over extracted rule with same ID
- **Requirement**: FR-002, AC-002-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Manual rule exists with `id: "bulleted-format"`; extracted rule also has same ID
- **Input**: Both rule sources loaded
- **Expected**: Manual rule used, extracted rule discarded

### TC-056: Low-confidence extracted rules default to warn severity
- **Requirement**: FR-002, AC-002-05
- **Type**: positive
- **Priority**: P1
- **Precondition**: Extractor identifies a candidate with low confidence
- **Input**: Prose with ambiguous behavioral constraint
- **Expected**: Generated rule has `severity: "warn"` (not "block")

### TC-057: Extract rules from AGENTS.md
- **Requirement**: FR-002, AC-002-04
- **Type**: positive
- **Priority**: P2
- **Precondition**: AGENTS.md contains behavioral constraints
- **Input**: Path to AGENTS.md
- **Expected**: Rules extracted from AGENTS.md

### TC-058: No behavioral keywords found — empty result
- **Requirement**: FR-002
- **Type**: negative
- **Priority**: P2
- **Precondition**: File contains no MUST/NEVER/ALWAYS/CRITICAL keywords
- **Input**: Path to a plain text file
- **Expected**: Empty array returned

---

## 11. Codex Provider Integration (FR-006)

### TC-059: Codex output validation detects bulleted-format violation
- **Requirement**: FR-006, AC-006-01, AC-006-07
- **Type**: positive
- **Priority**: P0
- **Precondition**: Rules loaded, `verbosity: bulleted`, provider_scope includes codex
- **Input**: Codex output with prose paragraphs
- **Expected**: Violation detected, severity "block"

### TC-060: Codex output re-invoked with corrective guidance on block
- **Requirement**: FR-006, AC-006-02
- **Type**: positive
- **Priority**: P0
- **Precondition**: Block violation detected
- **Input**: Output that violates bulleted-format
- **Expected**: Codex re-invoked with corrective guidance prepended to prompt

### TC-061: Codex retry limit — escalation after 3 attempts
- **Requirement**: FR-006, AC-006-03
- **Type**: positive
- **Priority**: P0
- **Precondition**: Same violation on 3 consecutive Codex invocations
- **Input**: Persistently non-compliant output
- **Expected**: Output accepted after 3 retries with violation warning

### TC-062: Codex reads state.json for context
- **Requirement**: FR-006, AC-006-04
- **Type**: positive
- **Priority**: P1
- **Precondition**: state.json exists with workflow context
- **Input**: Codex output during analyze workflow
- **Expected**: State context used for rule evaluation (workflow, phase)

### TC-063: Codex-only rule not evaluated in Claude hook
- **Requirement**: FR-006, AC-006-05
- **Type**: negative
- **Priority**: P1
- **Precondition**: Rule with `provider_scope: "codex"`
- **Input**: Run through Claude Stop hook
- **Expected**: Rule skipped

### TC-064: Codex validates output via runtime-side inspection
- **Requirement**: FR-006, AC-006-06, AC-006-10
- **Type**: positive
- **Priority**: P0
- **Precondition**: Codex runtime adapter configured
- **Input**: Codex process output
- **Expected**: validateOutput() called after process returns (not via hook)

### TC-065: Codex blocks collapsed domain confirmation
- **Requirement**: FR-006, AC-006-08
- **Type**: positive
- **Priority**: P0
- **Precondition**: roundtableState = PRESENTING_REQUIREMENTS
- **Input**: Codex output with all three domain confirmations
- **Expected**: Violation detected, re-invocation triggered

### TC-066: Codex blocks analysis without elicitation question
- **Requirement**: FR-006, AC-006-09
- **Type**: positive
- **Priority**: P0
- **Precondition**: First analyze exchange
- **Input**: Codex output declaring finished analysis, no question
- **Expected**: Violation detected, re-invocation triggered

### TC-067: Codex fail-open on parsing error
- **Requirement**: FR-006, AC-006-11
- **Type**: negative
- **Priority**: P0
- **Precondition**: Compliance engine throws during Codex validation
- **Input**: Output that causes engine error
- **Expected**: Output accepted, warning logged

### TC-068: Codex fail-open on state lookup failure
- **Requirement**: FR-006, AC-006-11
- **Type**: negative
- **Priority**: P0
- **Precondition**: state.json missing or corrupt
- **Input**: Any Codex output
- **Expected**: Output accepted, warning logged

### TC-069: Codex validation — no violation passes through
- **Requirement**: FR-006, AC-006-06
- **Type**: positive
- **Priority**: P1
- **Precondition**: Rules loaded, compliant output
- **Input**: Well-formatted bulleted Codex output
- **Expected**: Output accepted, no re-invocation

### TC-070: Codex automated tests cover retry/correction
- **Requirement**: FR-006, AC-006-12
- **Type**: positive
- **Priority**: P1
- **Note**: This AC requires that automated tests exist for retry/correction. Fulfilled by TC-060, TC-061, TC-065, TC-066.

---

## 12. Integration Tests

### TC-071: Hook chain — delegation-gate allows, compliance blocks
- **Requirement**: FR-003, AC-003-01
- **Type**: positive (integration)
- **Priority**: P0
- **Precondition**: Both hooks registered in Stop chain; response violates bulleted-format
- **Input**: Stop hook input with non-compliant response
- **Expected**: delegation-gate allows (no pending delegation), conversational-compliance blocks
- **Validation**: Assert final decision is block

### TC-072: Hook chain — both hooks allow
- **Requirement**: FR-003
- **Type**: positive (integration)
- **Priority**: P1
- **Precondition**: Both hooks registered; compliant response
- **Input**: Compliant response
- **Expected**: Both hooks allow, response passes through

### TC-073: End-to-end bulleted format enforcement
- **Requirement**: FR-005, AC-005-01, FR-003, FR-004
- **Type**: positive (integration)
- **Priority**: P0
- **Precondition**: Rules file with bulleted-format rule, roundtable.yaml with verbosity: bulleted
- **Input**: Prose response piped through full hook
- **Expected**: Block returned with corrective guidance about bullet formatting

### TC-074: End-to-end domain confirmation enforcement
- **Requirement**: FR-005, AC-005-02, AC-005-04
- **Type**: positive (integration)
- **Priority**: P0
- **Precondition**: Sidecar file with `PRESENTING_REQUIREMENTS` state
- **Input**: Response with collapsed three-domain confirmation
- **Expected**: Block returned with corrective guidance

### TC-075: End-to-end elicitation-first enforcement
- **Requirement**: FR-005, AC-005-03
- **Type**: positive (integration)
- **Priority**: P0
- **Precondition**: No sidecar file (first exchange) or sidecar with IDLE state
- **Input**: Response declaring "Here is the complete analysis" without question
- **Expected**: Block returned

---

## 13. Performance Tests

### TC-076: Rule loading completes within 50ms
- **Type**: performance
- **Priority**: P1
- **Input**: 3 built-in rules file
- **Expected**: `loadRules()` completes in < 50ms
- **Measurement**: `performance.now()` around loadRules() call

### TC-077: Rule evaluation completes within 200ms
- **Type**: performance
- **Priority**: P1
- **Input**: 500-line response, 3 rules
- **Expected**: `evaluateRules()` completes in < 200ms
- **Measurement**: `performance.now()` around evaluateRules() call

### TC-078: Total hook execution within 500ms
- **Type**: performance
- **Priority**: P1
- **Input**: Full hook invocation via runHook()
- **Expected**: Total wall time < 500ms (generous: < 1000ms for CI)
- **Note**: Process spawn overhead adds ~100-200ms

### TC-079: Evaluation with 10 rules stays under 1s
- **Type**: performance (scalability)
- **Priority**: P2
- **Input**: 10-rule definitions, standard response
- **Expected**: Total evaluation < 1s

### TC-080: Large response (2000 lines) evaluation stays under 500ms
- **Type**: performance (scalability)
- **Priority**: P2
- **Input**: 2000-line response, 3 rules
- **Expected**: Evaluation < 500ms

---

## 14. Security Tests

### TC-081: Malformed stdin does not crash hook
- **Type**: security
- **Priority**: P0
- **Input**: `{not valid json!!!` on stdin
- **Expected**: Hook exits 0, no crash, no stack trace in stdout

### TC-082: Oversized response does not cause OOM
- **Type**: security
- **Priority**: P1
- **Input**: 2MB response text
- **Expected**: Hook completes or times out gracefully, exit code 0

### TC-083: Regex denial-of-service in rule pattern
- **Type**: security
- **Priority**: P1
- **Input**: Rule with catastrophic backtracking pattern; adversarial response text
- **Expected**: Evaluation short-circuits at timeout threshold, response allowed through

### TC-084: Sidecar file with unexpected JSON schema
- **Type**: security
- **Priority**: P2
- **Input**: Sidecar file containing `{ "confirmation_state": 12345 }` (number instead of string)
- **Expected**: Treated as unparseable, state-dependent rules skipped

### TC-085: Path traversal in rulesPath parameter
- **Type**: security
- **Priority**: P2
- **Input**: `rulesPath: "../../etc/passwd"`
- **Expected**: File read fails safely (no sensitive data exposed), empty rule set returned
