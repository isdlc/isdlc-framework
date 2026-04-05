# Hook Audit Report — REQ-GH-235

**Audit Date**: 2026-04-05
**Task**: T032 (FR-008 AC-008-01)
**Source file under change**: `src/claude/agents/roundtable-analyst.md` (rewritten — T004)

## Summary

- Hooks audited: 9 (7 from task spec + 2 additional roundtable-specific hooks discovered during audit)
- Hooks needing updates: 0
- Hooks passing as-is: 9

**Conclusion**: All audited hooks align with the rewritten roundtable-analyst.md. The rewrite preserved every protocol contract the hooks depend on (state names, template filenames, confirmation-state machine, semantic markers, domain labels). No hook references the old section numbering (`§2.2`, `§2.5.1`, `§2.5.5`) or any removed concept. No code changes are required in subsequent tasks T033-T036 for hook alignment — they can focus on other enforcement concerns.

## New Structure Reference (rewritten roundtable-analyst.md)

The rewritten agent file uses numbered sections `§1`-`§12` plus Appendices A, B, C. The hook-relevant contracts are:

- **State names** (§7.1): `IDLE`, `PRESENTING_REQUIREMENTS`, `PRESENTING_ARCHITECTURE`, `PRESENTING_DESIGN`, `PRESENTING_TASKS`, `AMENDING`, `TRIVIAL_SHOW`, `FINALIZING`, `COMPLETE`
- **Template files** (§7, §8): `requirements.template.json`, `architecture.template.json`, `design.template.json`, `traceability.template.json` (on-screen tasks), `tasks.template.json` (written artifact)
- **Rendering modes** (§5): `conversational`, `bulleted` (default), `silent`
- **Primary personas** (§4.1): Maya, Alex, Jordan
- **Participation gate** (§1.1 rule 3): Maya scope + Alex codebase evidence + Jordan design implication before first confirmation
- **Tasks rendering contract** (§8.4): MUST render 4-column traceability table `FR | Requirement | Design / Blast Radius | Related Tasks`
- **Accept/Amend vocabulary** (§7.4): documented canonical indicators
- **No-write rule** (§2.2): meta.json only during conversation
- **No-menu rule** (§6 rule 5): roundtable never presents menu-style bracketed options

---

## Per-Hook Analysis

### 1. conversational-compliance.cjs

- **Purpose**: Stop-hook that validates assistant responses against conversational rules loaded from `.isdlc/config/conversational-rules.json`. Enforces bulleted format, sequential domain confirmation, elicitation-first behavior, and template section order.
- **Current assumptions**:
  - Reads `.isdlc/roundtable-state.json` sidecar with `confirmation_state` field
  - Uses state name prefix `PRESENTING_*` and `IDLE` (via engine.cjs)
  - Delegates rule evaluation to `src/core/compliance/engine.cjs`
- **Alignment status**: **PASS**
- **Required changes**: none. Does not reference section numbers from roundtable-analyst.md. All state names and template-filename references match the rewritten file.

### 2. output-format-validator.cjs

- **Purpose**: PostToolUse[Write/Edit] hook that validates written artifacts conform to their template schemas (requirements-spec.md, architecture-overview.md, module-design.md, tasks.md, traceability-matrix.csv, user-stories.json, test-strategy.md, ADRs).
- **Current assumptions**:
  - Reads templates from `.isdlc/config/templates/{domain}.template.json`
  - Enforces `section_order` arrays defined in each template
  - Scopes template-backed validation to files inside `docs/requirements/*/`
  - References template filenames: `requirements`, `architecture`, `design`, `tasks`, `traceability`
- **Alignment status**: **PASS**
- **Required changes**: none. All template references match §7 and §8 of the rewritten file. The hook enforces section contracts via the template JSON files (not the agent file), so the rewrite does not impact it.

### 3. menu-halt-enforcer.cjs

- **Purpose**: PostToolUse[Task] hook that detects when an agent presents a menu (`[A]/[R]/[C]`, numbered menus, backlog pickers) but continues generating >200 characters of output instead of halting.
- **Current assumptions**:
  - Pattern-based detection of menu structures, not agent-specific
  - Activates on any Task tool output
- **Alignment status**: **PASS**
- **Required changes**: none. The rewritten roundtable-analyst §6 rule 5 explicitly bans menus, so this hook serves as a defensive safety net. Its detection patterns do not reference any roundtable-analyst.md structure.

### 4. menu-tracker.cjs

- **Purpose**: PostToolUse hook that tracks A/R/C menu interactions for the **legacy Phase 01 requirements elicitation** (non-roundtable workflow).
- **Current assumptions**:
  - Only fires when `state.active_workflow.current_phase === '01-requirements'`
  - Tracks step completion patterns (`project_discovery`, `user_personas`, `core_features`, `nfr`, `user_stories`, `prioritization`, `finalization`)
  - Updates `state.phases['01-requirements'].iteration_requirements.interactive_elicitation`
- **Alignment status**: **PASS**
- **Required changes**: none. This hook is scoped to the legacy step-based requirements phase, not the analyze roundtable. The analyze workflow uses `docs/requirements/.../` artifacts and state-machine states from `roundtable-state.json`, not `current_phase='01-requirements'`. No collision with the rewritten roundtable protocol.
- **Note**: The hook's step patterns (`project_discovery`, etc.) are legacy labels for the non-roundtable elicitation flow and are unrelated to the roundtable's topic IDs (§9.5, Appendix C.4). No action needed.

### 5. atdd-completeness-validator.cjs

- **Purpose**: PostToolUse[Bash] hook that monitors test command output during ATDD mode for P0/P1/P2/P3 priority-ordering violations.
- **Current assumptions**:
  - Fires on test command patterns (`npm test`, `pytest`, `go test`, etc.)
  - Reads `atdd` config from `.isdlc/config.json`
  - Requires `state.active_workflow` to be set
- **Alignment status**: **PASS**
- **Required changes**: none. ATDD is orthogonal to the roundtable protocol — operates on test output during implementation phases, not during analyze. No references to roundtable-analyst.md structure.

### 6. plan-surfacer.cjs

- **Purpose**: PreToolUse[Task] hook that blocks delegation to implementation+ phases when `docs/isdlc/tasks.md` has not been generated.
- **Current assumptions**:
  - Early phases (00, 01, 02, 02-tracing, 03, 04) do not require tasks.md
  - Validates Phase 06 section existence, file-level annotations, traceability annotations, dependency cycles
- **Alignment status**: **PASS**
- **Required changes**: none. Operates on project-level tasks.md plan format (`docs/isdlc/tasks.md`), distinct from the roundtable's on-screen traceability rendering (§8.4). The roundtable writes its own `tasks.md` per-feature under `docs/requirements/{slug}/tasks.md` via `tasks.template.json` (§12.3), which this hook does not read.

### 7. participation-gate-enforcer.cjs (additional)

- **Purpose**: Stop-hook that verifies the roundtable transcript contains Maya scope + Alex codebase evidence + Jordan design implication before the first confirmation (§1.1 rule 3).
- **Current assumptions**:
  - Reads `confirmation_state` from hook input
  - Fires when state is `PRE_FIRST_CONFIRMATION` or `PRESENTING_REQUIREMENTS`
  - Detects semantic markers: "scope", "codebase"/"grep"/file paths, "design implication"/"interface"/"module boundaries"/"specification"
  - Works in silent mode via internal-only markers (no persona name required)
- **Alignment status**: **PASS**
- **Required changes**: none. Created explicitly for REQ-GH-235 and already aligned with the rewritten §1.1 rule 3 and §5 silent-mode semantics.

### 8. persona-extension-composer-validator.cjs (additional)

- **Purpose**: PreToolUse hook that validates promoted persona frontmatter schemas (role_type, owns_state, template, inserts_at, rendering_contribution) and detects insertion-point conflicts.
- **Current assumptions**:
  - Fires when Task dispatches `roundtable-analyst` or `bug-roundtable-analyst`
  - Pattern: `inserts_at: (before|after):(requirements|architecture|design|tasks)`
  - Template filename pattern: ends with `.template.json`
  - `rendering_contribution` values: `ownership`, `rendering-only`
  - First-wins conflict resolution
- **Alignment status**: **PASS**
- **Required changes**: none. Matches §4.3 promotion schema exactly (extension points, conflict resolution, required fields).

### 9. tasks-as-table-validator.cjs (additional)

- **Purpose**: PostToolUse hook that validates the PRESENTING_TASKS confirmation message contains a pipe-delimited table with 4 column keywords (FR, Requirement, Design, Task).
- **Current assumptions**:
  - Fires only when `confirmation_state === 'PRESENTING_TASKS'`
  - Requires 4 pipe-delimited cells matching keyword sequence
  - Fail-open (WARN only, never blocks)
- **Alignment status**: **PASS**
- **Required changes**: none. Implements §8.4 rendering contract exactly. Created for REQ-GH-235.

---

## Conversational Rules Audit (`.isdlc/config/conversational-rules.json`)

This JSON is loaded by conversational-compliance.cjs and drives its behavior. Audited separately because it encodes the rules the compliance engine evaluates.

- **Rule `bulleted-format`**: enforces bullets/headings/tables when verbosity=bulleted. Aligns with §5.1 bulleted mode.
- **Rule `sequential-domain-confirmation`**: detects collapsed domain confirmations. Domains listed: `["Requirements", "Architecture", "Design"]`. Aligns with §5.2 shared invariant (staged confirmation order).
- **Rule `elicitation-first`**: detects completion declarations without questions. `completion_indicators` includes "Accept or Amend" — aligns with §7.4 Accept/Amend vocabulary.
- **Rule `template-section-order`**: references templates at `.isdlc/config/templates/*.template.json`. Description lists section orders matching §8.1-§8.4 exactly:
  - requirements: functional_requirements → assumptions → non_functional_requirements → out_of_scope → prioritization ✓
  - architecture: architecture_options → selected_architecture → technology_decisions → integration_architecture ✓
  - design: module_overview → module_design → changes_to_existing → wiring_summary ✓
  - tasks: 4-column traceability table (FR | Requirement | Design / Blast Radius | Related Tasks) ✓

**Alignment status**: **PASS**. All rule descriptions and column names match the rewritten agent file precisely.

---

## Compliance Engine Audit (`src/core/compliance/engine.cjs`)

Referenced by conversational-compliance.cjs. Audited because it contains state-name logic.

- **State references**: `PRESENTING_` prefix filter (line 194), `IDLE` (line 198)
- **CONFIRMATION_TO_DOMAIN mapping** (lines 375-378):
  - `PRESENTING_REQUIREMENTS` → `requirements` ✓
  - `PRESENTING_ARCHITECTURE` → `architecture` ✓
  - `PRESENTING_DESIGN` → `design` ✓
  - `PRESENTING_TASKS` → `traceability` ✓

**Alignment status**: **PASS**. All state mappings match §7.1 definitions.

---

## Recommended Update Actions

**No update actions required.** All 9 hooks and their supporting config/engine files align with the rewritten roundtable-analyst.md.

**For downstream tasks T033-T036**:
- T033-T036 do not need to modify any hooks for alignment with the roundtable-analyst rewrite.
- If T033-T036 are independently scoped to add NEW enforcement (e.g., new semantic markers, expanded ban-list patterns, conversational-rules additions), they may proceed without fear of conflicting with the rewrite.
- Recommend T033-T036 verify any hook-behavior changes they introduce still respect the §2 behavior contract (stop/wait, no-write rule) and §5.2 shared invariants (confirmation order, template binding, anti-shortcut, artifact write timing).

---

## Audit Methodology

1. Read the rewritten roundtable-analyst.md (§1-§12, Appendices A-C) to extract the hook-relevant contracts: state names, template filenames, personas, rendering modes, semantic markers, participation gate, table rendering rules.
2. Read each of the 7 hooks specified in the task prompt (conversational-compliance, output-format-validator, menu-halt-enforcer, menu-tracker, atdd-completeness-validator, plan-surfacer).
3. Discovered additional roundtable-specific hooks via `grep roundtable` on `src/claude/hooks/`: participation-gate-enforcer.cjs, persona-extension-composer-validator.cjs, tasks-as-table-validator.cjs. Audited these as well.
4. Audited supporting files: `.isdlc/config/conversational-rules.json`, `src/core/compliance/engine.cjs`.
5. Verified template directory contents at `.isdlc/config/templates/`.
6. Grepped for old section references (`§2.2`, `§2.5.1`, `§2.5.5`, etc.) and confirmed no hook references old roundtable-analyst section numbering.
