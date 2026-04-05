# Test Cases — Hook Tests

**REQ**: REQ-GH-235
**Scope**: 3 new hooks + 4 updated existing hooks
**Test Runner**: `node:test` (CommonJS via spawnSync)
**Location**: `src/claude/hooks/tests/*.test.cjs`
**Pattern**: spawn hook subprocess with stdin JSON, assert on stdout + exit code

Covers ACs: AC-008-01 through AC-008-04

---

## TC-HK-001: tasks-as-table-validator (NEW hook)

**File**: `src/claude/hooks/tests/tasks-as-table-validator.test.cjs` (NEW)
**Hook**: `src/claude/hooks/tasks-as-table-validator.cjs` (NEW, Phase 06)
**Matcher**: `PostToolUse` with `tool_name: "Write"|"Edit"`
**Priority**: P0
**Traces**: FR-008, AC-008-03, FR-003, AC-003-03
**ATDD State**: skip (RED)

### Scenarios

**TC-HK-001-A: Valid traceability table passes**
**Given** confirmation state is `PRESENTING_TASKS`
**When** last assistant message contains a 4+ column pipe-delimited table with header `| FR | Requirement | ... |`
**Then** hook outputs empty (silent pass), exit code 0

**TC-HK-001-B: Bullet list triggers WARN**
**Given** confirmation state is `PRESENTING_TASKS`
**When** last assistant message contains bullet list (lines starting with `- `) and no table markers
**Then** hook outputs `WARN: Tasks confirmation must render traceability table, not bullets/prose`
**And** exit code is 0 (fail-open)

**TC-HK-001-C: Prose-only response triggers WARN**
**Given** confirmation state is `PRESENTING_TASKS`
**When** last assistant message contains paragraph prose with no pipe characters
**Then** hook outputs WARN
**And** exit code is 0

**TC-HK-001-D: Non-TASKS state passes silently**
**Given** confirmation state is `PRESENTING_REQUIREMENTS`
**When** last assistant message is bullet list
**Then** hook outputs empty, exit code 0 (hook only enforces TASKS state)

**TC-HK-001-E: Table with <4 columns triggers WARN**
**Given** confirmation state is `PRESENTING_TASKS`
**When** last assistant message has `| Task | Status |` (2 columns)
**Then** hook outputs WARN (requires ≥4 columns per traceability template)
**And** exit code is 0

**TC-HK-001-F: Missing state context passes silently (fail-open)**
**Given** stdin has no `context.confirmation_state`
**When** hook runs
**Then** hook outputs empty, exit code 0 (Article X fail-open)

### Fixtures
- `stdin-tasks-table-valid.json`: state=PRESENTING_TASKS, message has 4-col pipe table
- `stdin-tasks-bullets.json`: state=PRESENTING_TASKS, message is bullets
- `stdin-tasks-prose.json`: state=PRESENTING_TASKS, message is prose
- `stdin-non-tasks-state.json`: state=PRESENTING_REQUIREMENTS, message is bullets
- `stdin-tasks-2col-table.json`: state=PRESENTING_TASKS, 2-col table

---

## TC-HK-002: participation-gate-enforcer (NEW hook)

**File**: `src/claude/hooks/tests/participation-gate-enforcer.test.cjs` (NEW)
**Hook**: `src/claude/hooks/participation-gate-enforcer.cjs` (NEW, Phase 06)
**Matcher**: `Stop` hook
**Priority**: P0
**Traces**: FR-008, AC-008-03, FR-003, AC-003-02
**ATDD State**: skip (RED)

### Scenarios

**TC-HK-002-A: All 3 contributions present passes**
**Given** transcript contains semantic markers for Maya scope + Alex codebase evidence + Jordan design implication
**When** conversation reaches pre-first-confirmation boundary
**Then** hook outputs empty, exit 0

**TC-HK-002-B: Maya-only shortcut triggers WARN**
**Given** transcript contains only Maya scope, no Alex/Jordan contributions
**When** first PRESENTING_REQUIREMENTS reached
**Then** hook outputs `WARN: Pre-confirmation participation gate not met (Maya scope + Alex evidence + Jordan design implication required)`
**And** exit code 0

**TC-HK-002-C: Missing Alex evidence triggers WARN**
**Given** transcript has Maya + Jordan but no Alex codebase evidence
**When** first confirmation approached
**Then** WARN output naming missing persona(s)

**TC-HK-002-D: Missing Jordan design implication triggers WARN**
**Given** transcript has Maya + Alex but no Jordan
**When** first confirmation approached
**Then** WARN output naming Jordan

**TC-HK-002-E: Silent mode uses semantic markers only**
**Given** rendering_mode=silent
**When** transcript contains contributions without persona-name attributions
**Then** hook checks semantic markers (scope statement, codebase reference, design implication) not persona names
**And** passes if all 3 semantic markers present even without "Maya:" / "Alex:" / "Jordan:" prefixes

**TC-HK-002-F: Post-first-confirmation gate doesn't re-check**
**Given** conversation is past first PRESENTING_REQUIREMENTS Accept
**When** hook runs on subsequent Stop
**Then** hook outputs empty (gate only applies before first confirmation)

### Fixtures
- `stdin-participation-all-three.json`: complete contributions
- `stdin-participation-maya-only.json`: shortcut
- `stdin-participation-no-alex.json`: missing evidence
- `stdin-participation-no-jordan.json`: missing design
- `stdin-participation-silent-mode.json`: semantic markers, no persona names
- `stdin-post-confirmation.json`: gate already passed

---

## TC-HK-003: persona-extension-composer-validator (NEW hook)

**File**: `src/claude/hooks/tests/persona-extension-composer-validator.test.cjs` (NEW)
**Hook**: `src/claude/hooks/persona-extension-composer-validator.cjs` (NEW, Phase 06)
**Matcher**: `PreToolUse` with `tool_name: "Task"` (subagent dispatch for analyze)
**Priority**: P0
**Traces**: FR-008, AC-008-03, FR-005
**ATDD State**: skip (RED)

### Scenarios

**TC-HK-003-A: All personas valid passes silently**
**Given** persona files loaded, all contributing OR valid primaries
**When** analyze Task dispatched
**Then** hook outputs empty, exit 0

**TC-HK-003-B: Missing promotion fields triggers WARN**
**Given** persona has `role_type: primary` but missing `owns_state`
**When** analyze Task dispatched
**Then** hook outputs `WARN: Persona 'persona-X' missing required promotion fields: owns_state`
**And** exit 0 (never blocks)

**TC-HK-003-C: Invalid inserts_at format triggers WARN**
**Given** persona has `inserts_at: wherever`
**When** analyze dispatched
**Then** WARN: invalid extension point

**TC-HK-003-D: Conflict at same insertion point triggers WARN**
**Given** 2 promoted personas both with `inserts_at: after:architecture`
**When** analyze dispatched
**Then** `WARN: Insertion conflict at 'after:architecture': first-wins -> persona-A`
**And** exit 0

**TC-HK-003-E: Non-analyze Task passes silently**
**Given** Task dispatched for a non-analyze subagent
**When** hook runs
**Then** hook outputs empty, exit 0

**TC-HK-003-F: Never blocks (always exit 0)**
**Given** ANY input
**When** hook runs
**Then** exit code is always 0 (fail-open per Article X)

### Fixtures
- `stdin-personas-all-valid.json`: mix of contributing + valid primaries
- `stdin-persona-missing-fields.json`: incomplete promotion
- `stdin-persona-bad-inserts-at.json`: invalid format
- `stdin-persona-conflict.json`: two primaries same point
- `stdin-non-analyze-task.json`: unrelated Task dispatch

---

## TC-HK-004: Updated Hooks Regression Tests (FR-008, AC-008-02, AC-008-04)

**Priority**: P1
**Traces**: FR-008, AC-008-02, AC-008-04
**ATDD State**: existing tests updated, skip for new assertions only

### conversational-compliance.cjs (UPDATE)
**File**: `src/claude/hooks/tests/conversational-compliance.test.cjs` (MODIFY existing)
- Update assertions that reference old `§2.2 conversation flow rules` to reference new `§6 Conversation Rendering Rules`
- Existing test cases must continue to pass unchanged
- NEW assertion: hook correctly parses §6 section location in rewritten prompt

### output-format-validator.cjs (UPDATE)
**File**: `src/claude/hooks/tests/output-format-validator.test.cjs` (MODIFY existing)
- Update to state-local template refs (no longer reads centralized §2.5.5)
- NEW assertion: hook finds template binding at each PRESENTING_* state
- Existing tests unchanged

### menu-halt-enforcer.cjs (UPDATE)
**File**: `src/claude/hooks/tests/menu-halt-enforcer.test.cjs` (MODIFY existing)
- Update rule location reference to §6
- Existing tests unchanged

### (audit-driven, 1 TBD hook from T032)
**File**: TBD from hook-audit-report.md produced in T032
- Phase 06 T037 updates existing test file for the hook discovered during audit

---

## Shared Test Infrastructure

```javascript
// All new hook tests follow this CJS scaffold pattern:
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HOOK_PATH = path.join(__dirname, '..', '<hook-name>.cjs');

function runHook(tmpDir, stdinJson) {
    const result = spawnSync('node', [HOOK_PATH], {
        cwd: tmpDir,
        input: JSON.stringify(stdinJson),
        env: { ...process.env, CLAUDE_PROJECT_DIR: tmpDir, PATH: process.env.PATH },
        encoding: 'utf8',
        timeout: 5000
    });
    return { stdout: result.stdout, stderr: result.stderr, exit: result.status };
}

describe('<hook-name>.cjs', () => {
    it.skip('<scenario>', () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'req-gh-235-'));
        const result = runHook(tmpDir, { /* fixture */ });
        assert.equal(result.exit, 0);
        assert.match(result.stdout, /* expected */);
    });
});
```

---

## Audit Report Validation (AC-008-01)

**Task**: T032 `audit-7-relevant-hooks-align-with-rewrite`
**Deliverable**: `docs/requirements/REQ-GH-235-rewrite-roundtable-analyst-for-consistent-roundtable-ux/hook-audit-report.md`

### Required audit report contents (validated in Phase 08 code review):
1. List of 7 relevant hooks audited (names + paths)
2. For each hook: current assertions vs rewritten prompt alignment status
3. Drift findings: which hooks reference outdated sections/rules
4. Required updates per hook
5. New hooks identified (confirmed: 3)

### 7 relevant hooks (from module-design §6):
1. `conversational-compliance.cjs`
2. `output-format-validator.cjs`
3. `menu-halt-enforcer.cjs`
4. `template-confirmation-enforcer.cjs` (likely from GH-234)
5. `participation-gate-enforcer.cjs` (NEW — this REQ)
6. `tasks-as-table-validator.cjs` (NEW — this REQ)
7. `persona-extension-composer-validator.cjs` (NEW — this REQ)

(Final list confirmed by T032 audit task.)

---

## Phase 06 Implementation Notes

- All new hook test scaffolds ship with `it.skip(...)` — RED state
- Phase 06 task T041 removes `.skip` → tests fail (hooks don't exist yet)
- Phase 06 tasks T038/T039/T040 implement hooks → tests pass → GREEN
- Phase 06 T042 registers hooks in `.claude/settings.json`
- Phase 06 T037 updates existing hook tests for alignment with rewritten prompt
