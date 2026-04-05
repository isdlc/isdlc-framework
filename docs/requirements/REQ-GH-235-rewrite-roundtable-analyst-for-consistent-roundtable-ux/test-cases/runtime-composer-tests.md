# Test Cases — Runtime Composer Tests

**REQ**: REQ-GH-235
**Scope**: Unit tests for `src/core/roundtable/runtime-composer.js`
**Test Runner**: `node:test` (ESM)
**Location**: `tests/core/roundtable/runtime-composer.test.js` (NEW)
**Priority**: P0
**Traces**: FR-005, AC-005-01 through AC-005-06
**ATDD State**: skip (RED)

Public API under test (from `interface-spec.md` §1):
- `composeEffectiveStateMachine(defaultStateMachine, personaFiles)`
- `validatePromotionFrontmatter(frontmatter)`
- `detectInsertionConflicts(personaFiles)`

---

## TC-CM-001: validatePromotionFrontmatter — Valid Primary (AC-005-03)

**Given** frontmatter with `role_type: primary`, `owns_state: "data_architecture"`, `template: "data-architecture.template.json"`, `inserts_at: "after:architecture"`
**When** `validatePromotionFrontmatter(frontmatter)` is called
**Then** returns `{ valid: true, errors: [] }`

---

## TC-CM-002: validatePromotionFrontmatter — Missing owns_state (AC-005-03)

**Given** frontmatter with `role_type: primary`, `template`, `inserts_at` but no `owns_state`
**When** validator called
**Then** returns `{ valid: false, errors: [<mentions owns_state>] }`

---

## TC-CM-003: validatePromotionFrontmatter — Missing template (AC-005-03)

**Given** frontmatter with `role_type: primary`, `owns_state`, `inserts_at` but no `template`
**When** validator called
**Then** returns `{ valid: false, errors: [<mentions template>] }`

---

## TC-CM-004: validatePromotionFrontmatter — Missing inserts_at (AC-005-03)

**Given** frontmatter with `role_type: primary`, `owns_state`, `template` but no `inserts_at`
**When** validator called
**Then** returns `{ valid: false, errors: [<mentions inserts_at>] }`

---

## TC-CM-005: validatePromotionFrontmatter — Invalid owns_state format (AC-005-03)

**Given** `owns_state: "Data Architecture!"` (has caps/spaces/punctuation)
**When** validator called
**Then** returns `{ valid: false, errors: [<regex [a-z_]+ required>] }`

---

## TC-CM-006: validatePromotionFrontmatter — Invalid template extension (AC-005-03)

**Given** `template: "data-architecture.json"` (missing `.template.json` suffix)
**When** validator called
**Then** returns `{ valid: false, errors: [<must end with .template.json>] }`

---

## TC-CM-007: validatePromotionFrontmatter — Invalid inserts_at format (AC-005-03)

**Given** `inserts_at: "wherever"` (not matching `(before|after):(requirements|architecture|design|tasks)`)
**When** validator called
**Then** returns `{ valid: false, errors: [<invalid inserts_at format>] }`

---

## TC-CM-008: validatePromotionFrontmatter — Contributing passes without promotion fields (AC-005-01)

**Given** frontmatter with `role_type: contributing` and no promotion fields
**When** validator called
**Then** returns `{ valid: true, errors: [] }` (contributing has no promotion requirements)

---

## TC-CM-009: validatePromotionFrontmatter — Invalid rendering_contribution value

**Given** `rendering_contribution: "invalid-value"` on promoted persona
**When** validator called
**Then** returns `{ valid: false, errors: [<must be ownership or rendering-only>] }`

---

## TC-CM-010: validatePromotionFrontmatter — Defaults rendering_contribution to "ownership"

**Given** promoted persona with no `rendering_contribution` field
**When** validator called
**Then** returns `{ valid: true }` (field is optional, defaults to "ownership")

---

## TC-CM-011: composeEffectiveStateMachine — Contributing personas don't create states (AC-005-02)

**Given** `defaultStateMachine` with 4 states (REQ, ARCH, DES, TASKS) and 3 contributing personas
**When** `composeEffectiveStateMachine(default, contributingPersonas)` called
**Then**:
- `result.effectiveStateMachine.states.length === 4` (unchanged)
- `result.conflicts === []`
- `result.warnings === []`

---

## TC-CM-012: composeEffectiveStateMachine — Single promoted persona inserts new state (AC-005-04)

**Given** default 4-state machine + 1 promoted persona with `inserts_at: after:architecture`, `owns_state: data_architecture`, `template: data-architecture.template.json`
**When** composer called
**Then**:
- `result.effectiveStateMachine.states.length === 5`
- State at index 2 has `name === "PRESENTING_DATA_ARCHITECTURE"` (or `owns_state` uppercased with PRESENTING_ prefix)
- Inserted state has `template === "data-architecture.template.json"`
- Order preserved: REQ, ARCH, DATA_ARCH, DES, TASKS

---

## TC-CM-013: composeEffectiveStateMachine — Before insertion point (AC-005-04)

**Given** promoted persona with `inserts_at: before:requirements`
**When** composer called
**Then** new state is at index 0, REQ at index 1

---

## TC-CM-014: composeEffectiveStateMachine — Multiple promoted personas at distinct points

**Given** 2 promoted personas: one at `after:architecture`, one at `after:tasks`
**When** composer called
**Then**:
- `result.effectiveStateMachine.states.length === 6`
- Both insertions applied in declared order
- No conflicts

---

## TC-CM-015: detectInsertionConflicts — Two personas same point first-wins (AC-005-05)

**Given** 2 promoted personas both with `inserts_at: after:architecture`
- persona-A declared first in file order
- persona-B declared second
**When** `detectInsertionConflicts(personaFiles)` called
**Then**:
- Returns 1 conflict with `{ insertion_point: "after:architecture", personas: ["persona-A", "persona-B"], resolution: "first-wins", chosen: "persona-A" }`

---

## TC-CM-016: composeEffectiveStateMachine — Conflict records warning and uses first-wins (AC-005-05)

**Given** 2 conflicting promoted personas
**When** composer called
**Then**:
- `result.effectiveStateMachine.states.length === 5` (only first-wins insertion applied)
- `result.warnings` contains entry for persona-B with `reason` mentioning conflict
- `result.conflicts.length === 1`

---

## TC-CM-017: composeEffectiveStateMachine — Invalid promoted persona falls back to contributing (AC-005-01)

**Given** persona with `role_type: primary` but missing `owns_state`
**When** composer called
**Then**:
- `result.effectiveStateMachine.states.length === 4` (unchanged, invalid primary skipped)
- `result.warnings` contains `{ persona: "persona-X", reason: /missing.*owns_state/ }`
- No throw

---

## TC-CM-018: composeEffectiveStateMachine — Unknown extension point warns (AC-005-05)

**Given** promoted persona with `inserts_at: after:unknown_state`
**When** composer called
**Then**:
- `result.warnings` contains entry with reason matching `unknown_extension_point` or `unknown extension point`
- Persona is skipped (not inserted)
- No throw

---

## TC-CM-019: composeEffectiveStateMachine — Never throws (fail-open)

**Given** malformed personaFiles input (mix of valid/invalid/null fields)
**When** composer called
**Then**:
- Does not throw
- Returns valid `ComposeResult` structure with `effectiveStateMachine` intact (fallback to default)

---

## TC-CM-020: composeEffectiveStateMachine — 4 existing contributing personas zero-touch (AC-005-06)

**Given** the 4 existing contributing persona frontmatters loaded from project:
- persona-security-reviewer.md
- persona-data-architect.md
- persona-domain-expert.md (if contributing)
- persona-ux-lead.md (if contributing)
**When** composer called
**Then**:
- All 4 validate as valid contributing (no errors)
- `result.effectiveStateMachine.states.length === 4` (no new states added)
- `result.warnings === []`

---

## TC-CM-021: composeEffectiveStateMachine — Pure function, no side effects

**Given** a frozen `defaultStateMachine` object
**When** composer called twice with identical inputs
**Then**:
- Both calls return structurally equal results
- Input `defaultStateMachine` unchanged (no mutation)
- Input `personaFiles` unchanged

---

## TC-CM-022: composeEffectiveStateMachine — Empty personaFiles returns default

**Given** `personaFiles: []`
**When** composer called
**Then**: `result.effectiveStateMachine === defaultStateMachine` (structurally equal)

---

## Shared Test Infrastructure

```javascript
// tests/core/roundtable/runtime-composer.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  composeEffectiveStateMachine,
  validatePromotionFrontmatter,
  detectInsertionConflicts
} from '../../../src/core/roundtable/runtime-composer.js';

const DEFAULT_STATE_MACHINE = {
  states: [
    { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'requirements.template.json', sections: [], allowed_responses: ['Accept','Amend'] },
    { name: 'PRESENTING_ARCHITECTURE',  presenter: 'Alex', template: 'architecture.template.json',  sections: [], allowed_responses: ['Accept','Amend'] },
    { name: 'PRESENTING_DESIGN',        presenter: 'Jordan', template: 'design.template.json',       sections: [], allowed_responses: ['Accept','Amend'] },
    { name: 'PRESENTING_TASKS',         presenter: 'Jordan', template: 'traceability.template.json', sections: [], allowed_responses: ['Accept','Amend'] }
  ],
  transitions: []
};

const VALID_PROMOTED_PERSONA = {
  path: '/fake/persona-data-architect.md',
  frontmatter: {
    name: 'persona-data-architect',
    role_type: 'primary',
    domain: 'data_architecture',
    owns_state: 'data_architecture',
    template: 'data-architecture.template.json',
    inserts_at: 'after:architecture',
    rendering_contribution: 'ownership'
  },
  body: ''
};

describe('runtime-composer: validatePromotionFrontmatter', () => {
  it.skip('accepts valid primary frontmatter', () => {
    const result = validatePromotionFrontmatter(VALID_PROMOTED_PERSONA.frontmatter);
    assert.equal(result.valid, true);
    assert.deepEqual(result.errors, []);
  });
  // ... 9 more validator tests
});

describe('runtime-composer: composeEffectiveStateMachine', () => {
  it.skip('contributing personas produce no state changes', () => {
    const result = composeEffectiveStateMachine(DEFAULT_STATE_MACHINE, [
      { path: '/p1.md', frontmatter: { name: 'p1', role_type: 'contributing' }, body: '' }
    ]);
    assert.equal(result.effectiveStateMachine.states.length, 4);
    assert.deepEqual(result.warnings, []);
  });
  // ... 11 more compose tests
});

describe('runtime-composer: detectInsertionConflicts', () => {
  it.skip('first-wins on same insertion point', () => {
    // ... fixture with 2 conflicting primaries
  });
});
```

---

## Coverage Target

- **Lines**: ≥ 90%
- **Branches**: ≥ 90%
- **Functions**: 100% (all 3 public APIs tested)

---

## Phase 06 Implementation Notes

- Scaffold file `tests/core/roundtable/runtime-composer.test.js` ships in Phase 05 with all tests as `it.skip(...)` — RED state
- Phase 06 task T014 removes `.skip` → tests fail (module doesn't exist yet)
- Phase 06 task T013 implements `src/core/roundtable/runtime-composer.js` → tests pass → GREEN
- Phase 06 task T017 defines extension-point taxonomy in `roundtable-analyst.md` (input to composer)
- Quality loop (Phase 16) verifies all 22 composer tests pass with ≥90% coverage
