# REQ-0056: Adaptive Process Complexity (Rippable Phases)

## 1. Business Context

**Problem**: iSDLC ships fixed phase sequences per workflow type. The `-light` flag is the only override — a binary, framework-imposed opinion that skips architecture and design. Developers cannot tailor the phase sequence to their project's needs without forking the framework.

**Stakeholders**:
- **Framework users (primary)**: Developers using iSDLC in their projects who want control over which phases run
- **Framework maintainers**: Need the override mechanism to be simple and not create support burden

**Success Metric**: A developer can customize their workflow phase sequence by editing a single config file, with zero framework code changes.

**Driving Factor**: Hackability roadmap — making the harness the developer's own, not a rigid prescription.

## 2. Stakeholders and Personas

### Developer (Primary)
- **Role**: Uses iSDLC in their project for day-to-day development
- **Goals**: Ship features/fixes efficiently without unnecessary ceremony
- **Pain points**: Forced through phases that don't add value for their project type or team workflow
- **Proficiency**: Comfortable editing JSON config files

## 3. User Journeys

### Journey 1: First-time customization
- **Entry**: Developer decides their project doesn't need architecture/design phases for features
- **Flow**: Copies template from `src/isdlc/templates/process.json` → `.isdlc/process.json` → edits feature phase array → runs next workflow
- **Exit**: Workflow runs with customized phase sequence, skipped phases visible in output

### Journey 2: Ongoing workflow execution
- **Entry**: Developer runs a feature workflow with process.json configured
- **Flow**: Framework reads config → prints visual phase list with skip markers → executes non-skipped phases → records skipped phases in state.json
- **Exit**: Workflow completes with only the configured phases executed

### Journey 3: Adding a phase to a workflow
- **Entry**: Developer wants `07-testing` in their fix workflow (not in default)
- **Flow**: Edits `.isdlc/process.json` → adds `07-testing` to fix array → runs next fix workflow
- **Exit**: Fix workflow now includes integration testing phase

## 4. Technical Context

**Existing Infrastructure**:
- `workflow-init.cjs`: Creates active_workflow with phase array. Already filters phases for `--light` flag (lines 119-121)
- `phase-advance.cjs`: Validates gate, advances to next phase in array
- `common.cjs`: `applySizingDecision()` filters phases for light sizing — snapshots, filters, rollbacks on failure
- `workflows.json`: Defines default phase sequences per workflow type
- Phase statuses: `pending`, `in_progress`, `completed` — needs `skipped` added

**Constraints**:
- Must not break existing `--light` flag behavior (backward compatible)
- Must not interfere with sizing system (`applySizingDecision`)
- Phase array locked at init — mid-workflow config changes do not affect running workflows
- CommonJS context (hooks and antigravity scripts)

**Integration Points**:
- `workflow-init.cjs` reads config at init
- `phase-advance.cjs` skips over `"skipped"` phases when advancing
- `state.json` records skipped phases with status and reason
- Visual output at workflow start

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Simplicity | Critical | Config is a flat JSON object with workflow-type keys mapping to phase arrays |
| Backward compatibility | Critical | Existing workflows unchanged when no config file exists |
| Traceability | High | Skipped phases recorded in state.json with reason (Article VII) |
| Fail-safe | High | Invalid config → warn and fall back to defaults (Article X) |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Developer skips critical phases and ships broken code | Medium | Medium | Developer is fully trusted — no guardrails. Template includes comments explaining phase purposes |
| Config conflicts with `--light` flag | Low | Low | `--light` applies first, then process.json overrides. Document precedence |
| Unknown phase names in config | Medium | Low | Warn and ignore unknown phases at init |

## 6. Functional Requirements

### FR-001: Config File Override
**Confidence**: High
- The framework SHALL read `.isdlc/process.json` at workflow init time
- If the file exists and contains a key matching the current workflow type, that phase array SHALL override the built-in default

**AC-001-01**: Given `.isdlc/process.json` exists with `"feature": ["01-requirements", "06-implementation"]`, When a feature workflow is initialized, Then the active_workflow.phases array contains only those two phases plus skipped entries for the rest.

**AC-001-02**: Given `.isdlc/process.json` does not exist, When any workflow is initialized, Then the built-in default phase array is used unchanged.

**AC-001-03**: Given `.isdlc/process.json` exists but does not contain the current workflow type, When that workflow is initialized, Then the built-in default phase array is used for that type.

### FR-002: Per-Workflow-Type Phase Arrays
**Confidence**: High
- Each key in the config file SHALL be a workflow type (`feature`, `fix`, `upgrade`, `test-run`, `test-generate`)
- The value SHALL be an array of phase identifiers

**AC-002-01**: Given a config with `"fix": ["01-requirements", "06-implementation", "16-quality-loop"]`, When a fix workflow is initialized, Then only those three phases are active.

**AC-002-02**: Given a config with both `"feature"` and `"fix"` keys, When a feature workflow runs, Then only the feature config is applied; fix config is ignored.

### FR-003: Skipped Phase Recording
**Confidence**: High
- Phases from the built-in default that are NOT in the config array SHALL be included in state.json with `status: "skipped"` and a `reason` field
- Skipped phases SHALL appear in the phases array for audit trail (Article VII)

**AC-003-01**: Given a feature workflow with architecture and design removed from config, When the workflow is initialized, Then state.json contains `"03-architecture": { "status": "skipped", "reason": "process.json override" }`.

**AC-003-02**: Given a completed workflow with skipped phases, When state.json is inspected, Then all skipped phases have `status: "skipped"` and a non-empty `reason`.

### FR-004: Visual Phase List
**Confidence**: High
- At workflow start, the framework SHALL print all phases (active and skipped) with visual markers
- Active phases shown as `[ ]`, skipped phases shown as `[x]` with reason

**AC-004-01**: Given a feature workflow with architecture skipped, When the workflow starts, Then the output includes `[x] 03-architecture (skipped: process.json override)`.

**AC-004-02**: Given a workflow with no skipped phases, When the workflow starts, Then all phases show `[ ]` markers.

### FR-005: Phase Array Locking
**Confidence**: High
- The phase array SHALL be determined at workflow init and SHALL NOT change if the config file is modified mid-workflow

**AC-005-01**: Given a running workflow, When `.isdlc/process.json` is modified, Then the running workflow continues with the original phase array.

### FR-006: Phase Recomposition
**Confidence**: High
- The developer SHALL be able to add any built-in phase to any workflow type, not just remove phases
- Unknown phase names SHALL be warned and ignored

**AC-006-01**: Given a fix workflow config that includes `"07-testing"` (not in default fix phases), When the fix workflow is initialized, Then `07-testing` is included in the active phase array.

**AC-006-02**: Given a config with phase name `"99-nonexistent"`, When the workflow is initialized, Then a warning is printed and the unknown phase is ignored.

### FR-007: Fallback to Defaults
**Confidence**: High
- When no config file exists OR the config is malformed, the framework SHALL use built-in defaults
- Malformed config SHALL produce a warning, not a failure

**AC-007-01**: Given a `.isdlc/process.json` with invalid JSON, When a workflow is initialized, Then a warning is printed and built-in defaults are used.

### FR-008: Template
**Confidence**: High
- A well-commented template SHALL be shipped at `src/isdlc/templates/process.json`
- The template SHALL show all workflow types with their default phase arrays and comments explaining each phase

**AC-008-01**: Given the template file, When a developer reads it, Then each phase has a comment explaining its purpose.

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Custom workflow types (spike, hotfix) | Covered by #102 | #102 |
| Custom phases with user-defined agents | Covered by #102 | #102 |
| Condition-based skip logic (`skip_when`) | Adds complexity without clear value — static arrays are sufficient | None |
| `--strict` flag to force full process | Not needed — absence of config file = full process | None |
| Abbreviated phase mode | Binary skip/run is sufficient; iteration budgets tunable separately | None |
| Template scaffolded by `/discover` | Developer copies manually when ready | None |
| Guardrails preventing skip of certain phases | Developer is fully trusted | None |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Config file override | Must Have | Core capability |
| FR-002 | Per-workflow-type phase arrays | Must Have | Core capability |
| FR-003 | Skipped phase recording | Must Have | Article VII traceability |
| FR-007 | Fallback to defaults | Must Have | Article X fail-safe |
| FR-004 | Visual phase list | Should Have | Developer experience |
| FR-005 | Phase array locking | Should Have | Predictability |
| FR-006 | Phase recomposition | Should Have | Full hackability |
| FR-008 | Template | Should Have | Discoverability |

## Pending Sections

None — all sections complete.
