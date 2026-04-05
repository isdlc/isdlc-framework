# Test Cases — Prompt Verification Tests

**REQ**: REQ-GH-235
**Scope**: 8 new prompt-verification tests covering AC-007-01 through AC-007-07 + AC-009-04
**Test Runner**: `node:test` (ESM)
**Location**: `tests/prompt-verification/*.test.js`
**Pattern**: Read `.md` files, assert content patterns (substring/regex)

---

## TC-PV-001: Anti-Shortcut Enforcement (AC-007-01, AC-003-01, AC-003-04)

**File**: `tests/prompt-verification/anti-shortcut-enforcement.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, FR-003, AC-007-01, AC-003-01, AC-003-04
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `roundtable-analyst.md`
**When** parsing its behavior contract section
**Then** it MUST contain an explicit anti-shortcut rule forbidding direct transition from clarification to artifact generation
**And** it MUST contain a no-write-before-confirmations rule (except explicit early exit)

### Assertions
1. `content.includes('no collapse from clarification to artifact')` OR equivalent contract phrase
2. `content.includes('no artifact writes before staged confirmations')` OR equivalent
3. `content.match(/early exit/i)` — early exit exception is explicitly named
4. Rule appears in §1 Purpose & Non-Negotiables OR §2 Behavior Contract (first 200 lines)

---

## TC-PV-002: State-Local Template Binding (AC-007-02, AC-002-01, AC-002-02, AC-002-03)

**File**: `tests/prompt-verification/state-local-template-binding.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, FR-002, AC-007-02, AC-002-01, AC-002-02, AC-002-03
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `roundtable-analyst.md`
**When** reading the §7 State Machine section
**Then** each PRESENTING_* state MUST name its governing template inline on a `Template:` line
**And** PRESENTING_TASKS on-screen MUST bind `traceability.template.json`
**And** written `tasks.md` MUST bind `tasks.template.json` with explicit separation from on-screen template

### Assertions
1. For each state `['PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']`:
   - Matches regex `new RegExp(${state}[\\s\\S]*?Template:\\s*[a-z-]+\\.template\\.json)`
2. `content.match(/PRESENTING_TASKS[\s\S]*?Template:\s*traceability\.template\.json/)`
3. `content.includes('tasks.template.json')` AND context mentions "written" or "finalize"
4. Templates NOT centralized: no single "Templates" section > 50 lines listing all bindings

---

## TC-PV-003: Confirmation Sequencing V2 (AC-007-03)

**File**: `tests/prompt-verification/confirmation-sequencing-v2.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, AC-007-03
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten state machine
**When** tracing the transition table
**Then** sequence MUST be `IDLE → PRESENTING_REQUIREMENTS → PRESENTING_ARCHITECTURE → PRESENTING_DESIGN → PRESENTING_TASKS → FINALIZING → COMPLETE`
**And** Accept/Amend transitions MUST be explicit for every PRESENTING_* state
**And** light tier allows `PRESENTING_REQUIREMENTS → PRESENTING_DESIGN` bypass

### Assertions
1. All 4 PRESENTING_* states referenced in transition order
2. `content.match(/Accept\s*->\s*PRESENTING_/g).length >= 4`
3. `content.includes('Amend') && content.includes('AMENDING')`
4. Light-tier bypass path exists: matches `PRESENTING_REQUIREMENTS[\s\S]*?light tier[\s\S]*?PRESENTING_DESIGN`
5. FINALIZING appears after PRESENTING_TASKS in document order

---

## TC-PV-004: Rendering Mode Invariants (AC-007-04, AC-004-01, AC-004-02, AC-004-03)

**File**: `tests/prompt-verification/rendering-mode-invariants.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, FR-004, AC-007-04, AC-004-01, AC-004-02, AC-004-03
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `roundtable-analyst.md`
**When** reading §5 Rendering Modes
**Then** all three modes MUST be defined: `bulleted`, `conversational`, `silent`
**And** shared invariants MUST enumerate: confirmation order, Accept/Amend gating, template binding, anti-shortcut, A&I handling, write timing, tier applicability
**And** silent mode MUST be marked as "internal-only" for participation gates (no persona-name cues)

### Assertions
1. All three mode names `bulleted`, `conversational`, `silent` in §5
2. `content.includes('shared invariants')` OR `content.includes('Shared Invariants')`
3. Each of 7 invariants listed: confirmation order, Accept/Amend, template binding, anti-shortcut, A&I, write timing, tier
4. `content.match(/silent[\s\S]*?internal-only/i)` OR equivalent
5. §5 appears before §7 State Machine (modes declared first-class, early)

---

## TC-PV-005: Persona Extension Composition (AC-007-05, AC-005-01, AC-005-02, AC-005-06)

**File**: `tests/prompt-verification/persona-extension-composition.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, FR-005, AC-007-05, AC-005-01, AC-005-02, AC-005-06
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `roundtable-analyst.md` and existing persona files
**When** inspecting §4 Persona Model and persona frontmatter schemas
**Then** the prompt MUST declare contributing-default rule
**And** promotion schema MUST require `role_type: primary`, `owns_state`, `template`, `inserts_at`
**And** all 4 existing contributing personas (security-reviewer, data-architect, domain-expert, ux-lead) MUST remain schema-valid without modification

### Assertions
1. `content.includes('default to contributing')` OR `content.includes('contributing by default')`
2. Required promotion fields listed in prompt: `role_type`, `owns_state`, `template`, `inserts_at`
3. For each of 4 contributing personas, frontmatter parses and has `role_type: contributing`
4. Extension-point taxonomy listed: `before:requirements`, `after:requirements`, `after:architecture`, `after:design`, `after:tasks`
5. Rule: contributing personas don't create new templates/domains/states

---

## TC-PV-006: Participation Gate (AC-007-06, AC-003-02)

**File**: `tests/prompt-verification/participation-gate.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, FR-003, AC-007-06, AC-003-02
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `roundtable-analyst.md`
**When** reading pre-confirmation rules
**Then** it MUST declare 3 primary persona contributions required before PRESENTING_REQUIREMENTS: Maya scope + Alex codebase evidence + Jordan design implication
**And** silent mode MUST enforce this gate via internal semantic markers (no persona-name surface cues)

### Assertions
1. `content.match(/Maya[\s\S]*?scope/i)` AND `content.match(/Alex[\s\S]*?(codebase|evidence)/i)` AND `content.match(/Jordan[\s\S]*?(design|implication)/i)`
2. Rule appears before §7 State Machine (context: pre-confirmation)
3. `content.match(/internal-only[\s\S]*?silent/i)` OR inverse
4. Explicit: 3 contributions required, not 1 or 2

---

## TC-PV-007: Tasks Render as Table (AC-007-07, AC-003-03)

**File**: `tests/prompt-verification/tasks-render-as-table.test.js` (NEW)
**Priority**: P0
**Traces**: FR-007, FR-003, AC-007-07, AC-003-03
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `roundtable-analyst.md` PRESENTING_TASKS contract
**When** reading §8 Domain Confirmation Contracts for TASKS
**Then** the on-screen Tasks confirmation MUST render as a traceability table
**And** MUST explicitly forbid bullets and prose-only rendering

### Assertions
1. `content.includes('traceability table')` OR `content.match(/render[s]?\s+as.*table/i)` in TASKS contract
2. `content.includes('| FR | Requirement |')` OR equivalent 4-column header template reference
3. `content.match(/never bullets|not bullets|no bullets/i)` in TASKS contract
4. `content.match(/not prose|never prose|no prose/i)` in TASKS contract

---

## TC-PV-008: Bug Roundtable Rewritten Contract (AC-009-04, AC-009-01, AC-009-02, AC-009-03)

**File**: `tests/prompt-verification/bug-roundtable-rewritten-contract.test.js` (NEW)
**Priority**: P0
**Traces**: FR-009, AC-009-04, AC-009-01, AC-009-02, AC-009-03
**ATDD State**: skip (RED)

### Scenarios

**Given** the rewritten `bug-roundtable-analyst.md`
**When** comparing structure to `roundtable-analyst.md`
**Then** it MUST follow the identical 12-section skeleton
**And** bug-specific confirmation states MUST exist: PRESENTING_BUG_SUMMARY, PRESENTING_ROOT_CAUSE, PRESENTING_FIX_STRATEGY, PRESENTING_TASKS
**And** each state MUST bind its template inline: bug-summary, root-cause, fix-strategy, traceability

### Assertions
1. Bug prompt contains sections: Purpose, Behavior Contract, Operating Model, Persona Model, Rendering Modes, Conversation Rendering Rules, State Machine, Confirmation Contracts, Ask/Infer, Scope/Tier, Early Exit, Finalization
2. All 4 bug states present: `PRESENTING_BUG_SUMMARY`, `PRESENTING_ROOT_CAUSE`, `PRESENTING_FIX_STRATEGY`, `PRESENTING_TASKS`
3. Each bug state binds its template inline:
   - `PRESENTING_BUG_SUMMARY[\s\S]*?bug-summary\.template\.json`
   - `PRESENTING_ROOT_CAUSE[\s\S]*?root-cause\.template\.json`
   - `PRESENTING_FIX_STRATEGY[\s\S]*?fix-strategy\.template\.json`
   - `PRESENTING_TASKS[\s\S]*?traceability\.template\.json`
4. Bug prompt includes same rendering modes section (§5): bulleted, conversational, silent
5. Bug prompt references same persona model (§4) with promotion schema

---

## Shared Test Infrastructure

```javascript
// All 8 tests use this scaffold pattern:
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
const BUG_ROUNDTABLE_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'bug-roundtable-analyst.md');

function readPrompt(path) {
  return readFileSync(path, 'utf8');
}

describe('REQ-GH-235: <test name>', () => {
  it.skip('<scenario>', () => {
    const content = readPrompt(ROUNDTABLE_ANALYST_PATH);
    assert.ok(/* assertion */);
  });
});
```

---

## Phase 06 Implementation Notes

- All scaffolds ship with `it.skip(...)` — RED state
- Phase 06 task T023-T030 removes `.skip` and the test immediately fails (prompt doesn't have the content yet)
- Phase 06 tasks T004-T011 write the prompt content to satisfy the assertions → GREEN
- Quality loop (Phase 16) runs full `npm test` and verifies all 8 tests pass
