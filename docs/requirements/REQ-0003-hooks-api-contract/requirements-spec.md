# Requirements Specification: REQ-0003 Hooks API Contract

**Version:** 1.0
**Date:** 2026-02-08
**Status:** Approved
**Workflow:** Feature (REQ-0003-hooks-api-contract)

---

## 1. Overview

Formalize the implicit API contract between iSDLC hooks and Claude Code by:
1. Defining explicit JSON schemas for stdin/stdout communication per hook type
2. Fixing the gate-blocker field name mismatch that causes false gate blocks
3. Building runtime schema validation so hooks reject malformed input/output

## 2. Problem Statement

### 2.1 Field Name Mismatch (Bug)

`gate-blocker.cjs` expects these state.json fields:
- `constitutional_validation.completed` (boolean)
- `constitutional_validation.iterations_used` (number)
- `interactive_elicitation.final_selection` (string: "save" | "continue")

But orchestrator agents (the LLM) sometimes write:
- `constitutional_validation.final_status` instead of `status`
- `constitutional_validation.total_iterations` instead of `iterations_used`
- Omit `interactive_elicitation.final_selection` entirely

This causes false gate blocks where the hook rejects valid phase completions.

### 2.2 Implicit Contracts

All 11 hooks have undocumented stdin/stdout contracts. There is no schema file, no validation, and no documentation for what JSON structure each hook expects on stdin or produces on stdout. This makes it fragile for agents to write correct state and for contributors to understand hook behavior.

## 3. Functional Requirements

### FR-01: Canonical Schema Definitions

Define JSON Schema files for every state.json subsystem that hooks read/write:

| Schema ID | Subsystem | Used By |
|-----------|-----------|---------|
| `constitutional-validation.schema.json` | `phases[*].constitutional_validation` | gate-blocker, constitution-validator, iteration-corridor |
| `interactive-elicitation.schema.json` | `phases[*].iteration_requirements.interactive_elicitation` | gate-blocker, menu-tracker |
| `test-iteration.schema.json` | `phases[*].iteration_requirements.test_iteration` | gate-blocker, test-watcher, iteration-corridor |
| `skill-usage-entry.schema.json` | `skill_usage_log[*]` | log-skill-usage |
| `pending-delegation.schema.json` | `pending_delegation` | skill-delegation-enforcer, delegation-gate |
| `hook-stdin-pretooluse.schema.json` | stdin for PreToolUse hooks | All PreToolUse hooks |
| `hook-stdin-posttooluse.schema.json` | stdin for PostToolUse hooks | All PostToolUse hooks |
| `hook-stdin-stop.schema.json` | stdin for Stop hooks | delegation-gate |

### FR-02: Fix Field Name Mismatch (Clean Break)

Update all hooks and agent documentation to use ONE canonical field name set. No backward compatibility aliases -- clean break.

**Canonical field names for `constitutional_validation`:**
- `completed` (boolean) -- whether validation is finished
- `status` (string: "pending" | "iterating" | "compliant" | "escalated") -- current status
- `iterations_used` (number) -- count of iterations performed
- `max_iterations` (number) -- maximum allowed
- `articles_checked` (string[]) -- articles that were validated
- `history` (array) -- iteration history entries

**Canonical field names for `interactive_elicitation`:**
- `completed` (boolean) -- whether elicitation is finished
- `menu_interactions` (number) -- count of A/R/C menu interactions
- `final_selection` (string: "save" | "continue" | "exit") -- the terminal selection
- `selections` (array) -- history of all selections
- `steps_completed` (array) -- list of completed step names

**Canonical field names for `test_iteration`:**
- `completed` (boolean) -- whether iteration is finished
- `status` (string: "success" | "escalated") -- final status
- `current_iteration` (number) -- current iteration count
- `max_iterations` (number) -- maximum allowed
- `last_test_result` (string: "passed" | "failed") -- most recent test outcome
- `history` (array) -- iteration history entries

### FR-03: Shared Schema Validator in common.cjs

Add a `validateSchema(data, schemaId)` function to `common.cjs` that:
1. Loads the JSON schema file by ID from `src/claude/hooks/config/schemas/`
2. Validates the data against the schema
3. Returns `{ valid: boolean, errors: string[] }`
4. Uses lightweight inline validation (no external dependencies like Ajv)

### FR-04: Per-Hook Validation Integration

Each hook that reads state.json subsystems must validate before processing:
- `gate-blocker.cjs`: validate constitutional_validation, interactive_elicitation, test_iteration before checking
- `constitution-validator.cjs`: validate constitutional_validation before checking status
- `iteration-corridor.cjs`: validate test_iteration and constitutional_validation before determining corridor
- `menu-tracker.cjs`: validate interactive_elicitation before updating
- `test-watcher.cjs`: validate test_iteration before updating

Validation failures are logged (debugLog) and cause the hook to **fail-open** (allow the action). Schema validation must never block a legitimate operation.

### FR-05: Per-Hook Validation of stdout

Hooks that produce structured stdout must validate their output before emitting:
- `model-provider-router.cjs`: validate provider_selection output
- `delegation-gate.cjs`: validate block decision output
- `review-reminder.cjs`: validate warning output

### FR-06: Agent Documentation Update

Update the orchestrator agent (sdlc.md) and all phase agent instructions to reference the canonical field names. Remove any references to deprecated field names (`final_status`, `total_iterations`).

### FR-07: Schema Documentation File

Create `docs/isdlc/hooks-api-contract.md` documenting:
- All 11 hooks with their trigger type, matcher, stdin schema, stdout schema
- All state.json subsystem schemas with field-by-field descriptions
- Examples of valid state for each subsystem

## 4. Non-Functional Requirements

### NFR-01: Zero External Dependencies
Schema validation must use inline JavaScript only. No npm packages (no Ajv, no json-schema, no external validators). The hooks run in a minimal Node.js environment.

### NFR-02: Performance Budget
Schema validation must add < 5ms overhead per hook invocation. Hooks have a 5-10 second timeout but validation should be near-instantaneous.

### NFR-03: Fail-Open on Validation Errors
If schema validation itself throws an error (malformed schema file, missing file, etc.), the hook must fail-open: log the error via debugLog and allow the action to proceed.

### NFR-04: Constitution Compliance
- Article I: Schemas serve as source of truth for hook contracts
- Article II: Tests written before implementation
- Article VII: Full traceability from schemas to hooks to tests
- Article VIII: Documentation current with code
- Article IX: Gate integrity maintained
- Article X: Fail-safe defaults (fail-open validation)

### NFR-05: Test Coverage
- 100% of schema validation paths tested
- 100% of field name changes tested in gate-blocker
- Regression tests for all existing hook behavior

## 5. Out of Scope

- Schema validation for the top-level state.json structure (only subsystems)
- Auto-migration of existing state.json files (clean break, no migration)
- External tooling for schema generation
- OpenAPI/Swagger specs for hooks (hooks are not HTTP APIs)
- Changes to Claude Code's hook protocol itself (stdin/stdout format is fixed by Claude Code)

## 6. Acceptance Criteria

### AC-01: Schema Files Exist
JSON schema files exist at `src/claude/hooks/config/schemas/` for all subsystems listed in FR-01.

### AC-02: Gate-Blocker Bug Fixed
gate-blocker.cjs reads canonical field names (`completed`, `iterations_used`, `final_selection`) and correctly validates states written by orchestrator agents. No false gate blocks.

### AC-03: Shared Validator Works
`validateSchema()` in common.cjs correctly validates data against all schema files. Returns `{ valid: true }` for valid data and `{ valid: false, errors: [...] }` for invalid data.

### AC-04: Hooks Validate State Reads
gate-blocker, constitution-validator, iteration-corridor, menu-tracker, and test-watcher call `validateSchema()` before processing state data. Invalid data is logged and the hook fails-open.

### AC-05: All Existing Tests Pass
All 641 existing tests continue to pass after changes.

### AC-06: New Schema Validation Tests
New tests exist for: validateSchema function, each schema file, gate-blocker with canonical fields, gate-blocker with missing fields (fail-open).

### AC-07: Documentation Complete
`docs/isdlc/hooks-api-contract.md` exists and documents all hook contracts.

### AC-08: Agent Instructions Updated
Orchestrator agent (sdlc.md) references canonical field names. No references to deprecated names remain in agent files.
