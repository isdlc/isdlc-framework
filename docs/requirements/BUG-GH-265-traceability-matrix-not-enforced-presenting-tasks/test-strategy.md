# Test Strategy: BUG-GH-265

**Project**: iSDLC Framework
**Bug**: BUG-GH-265 — Traceability matrix not enforced at PRESENTING_TASKS (composers under-render; rolling state lacks payload accumulator)
**Phase**: 05 — Test Strategy
**Author**: Test Design Engineer
**Date**: 2026-04-25
**Owner of fix**: Jordan (System Designer) — A1 inline-references approach
**Reads**: bug-report.md, root-cause-analysis.md, fix-strategy.md, tasks.md

---

## 1. Overview

### 1.1 Purpose

Define the test contract for BUG-GH-265 (composer under-rendering + rolling-state payload accumulator gap). The 8 test-design tasks (T001–T008 in `docs/isdlc/tasks.md`) are the design contract; this document specifies, per task and per FR/AC, the exact assertions Phase 06 must implement when it produces the production code alongside the test code in TDD red-green form (T010–T018).

### 1.2 Scope

- **Unit tests** for `state-card-composer.js` (T001, T002, T004, T007), `task-card-composer.js` (T003, T004, T007), `rolling-state.js` (T005).
- **Integration tests** for `bridge/roundtable.cjs composeForTurn` payload propagation (T006).
- **Provider parity test** for Claude bridge ↔ Codex projection composer output (T008).
- **Regression** focus on Article X (fail-open) preservation across every new file read.

### 1.3 Out of scope

- Build-workflow injection (REQ-GH-253 boundary excludes build phases).
- `tasks-as-table-validator.cjs` resurrection (separate follow-up).
- Source JSON schema changes (`state-cards/*.card.json`, `task-cards/*.task-card.json`, `templates/*.template.json` are correct as-is).
- E2E `/isdlc analyze` flow (provider parity test is the integration ceiling for this fix).
- Performance/load testing — covered by NFR budget regression test inside T004.

### 1.4 References

- Bug report: `docs/requirements/BUG-GH-265-traceability-matrix-not-enforced-presenting-tasks/bug-report.md`
- Root cause: `docs/requirements/BUG-GH-265-traceability-matrix-not-enforced-presenting-tasks/root-cause-analysis.md`
- Fix strategy: `docs/requirements/BUG-GH-265-traceability-matrix-not-enforced-presenting-tasks/fix-strategy.md`
- Task plan: `docs/isdlc/tasks.md`
- Source under test: `src/core/roundtable/state-card-composer.js`, `src/core/roundtable/task-card-composer.js`, `src/core/roundtable/rolling-state.js`, `src/core/bridge/roundtable.cjs`, `src/providers/codex/projection.js`
- Source data (read-only fixtures): `src/isdlc/config/roundtable/state-cards/*.card.json` (×9), `src/isdlc/config/roundtable/task-cards/*.task-card.json` (×6), `src/isdlc/config/templates/*.template.json`

---

## 2. Test Levels

| Level | Where | Scope for this bug |
|-------|-------|--------------------|
| Unit | `tests/core/roundtable/composers/`, `tests/core/roundtable/rolling-state/` | Composer rendering, content inlining, soft-budget conversion, rolling-state CRUD |
| Integration | `tests/core/bridge/` | `composeForTurn` payload propagation through the bridge `context.acceptedPayloads` shim |
| Parity | `tests/parity/` | Claude bridge vs Codex projection invocation produces byte-identical composer output |

### 2.1 Test runner and conventions

- All tests use `node:test` (ESM, Article XIII). Existing files already use `import { describe, it } from 'node:test'` and `assert from 'node:assert/strict'`.
- New `.test.cjs` files use the CommonJS variant (matches the bridge module type).
- `.test.js` files in `tests/core/roundtable/composers/` and `tests/core/roundtable/rolling-state/` are MODIFIED — append new `it(...)` cases to the existing `describe('REQ-GH-253 ...')` block. Do not delete the existing skipped cases; convert them where their intent overlaps with new content (note in test header comment).
- New file `tests/core/bridge/roundtable-payload-propagation.test.cjs` is CREATED.
- New file `tests/parity/roundtable-composer-parity.test.js` is CREATED (`tests/parity/` directory will be created as needed).

### 2.2 Test data philosophy

- **Source JSON is the test fixture.** Do not duplicate `presenting-tasks.card.json`, `traceability.template.json`, etc. into in-test literals — load them from `src/isdlc/config/roundtable/...` directly. This keeps tests anchored to the same file the runtime reads, so a card-source schema change surfaces here first.
- **Mock the file system only when simulating Article X failures.** Use Node's `fs.promises` mocking (or a small `readFileWithFallback` indirection that the production code already exposes) — see T007.
- **Skill body fixtures** for T003 use real skill IDs from `src/claude/skills/` (e.g., `code-search`, `blast-radius`). Skill body files are short markdown; loading them per test is < 5 ms.

---

## 3. Per-FR Test Cases

Eight functional requirements were derived in fix-strategy.md and codified by tasks.md:

| FR | Description | Phase 05 task | Phase 06 task |
|----|-------------|---------------|---------------|
| FR-001 | renderCard inlines `rendering_mandate` + `content_coverage` + `template_ref` body | T001 | T010, T011 |
| FR-002 | renderCard inlines accepted prior-stage payloads from `context.acceptedPayloads` | T002 | T012 |
| FR-003 | renderTaskCard inlines skill body per `delivery_type` (context, instruction, reference) | T003 | T014 |
| FR-004 | Soft per-section budget replaces hard 40-line cap; truncation pointer when over | T004 | T013 |
| FR-005 | rolling-state `accepted_payloads` field + `applyAcceptedPayload` writer + defensive migration | T005 | T015 |
| FR-006 | Bridge `composeForTurn` propagates `accepted_payloads` via `context.acceptedPayloads` | T006, T008 | T016 |
| FR-007 | Article X fail-open preserved on every new file read (template, card, skill) | T007 | T018 |
| FR-008 | `isdlc.md:757, 905` prose description aligned with renderer behavior | (none — doc-touch only) | T017 |

Below, each FR section enumerates concrete test cases with input shape, expected output, and edge-case coverage. Test case IDs use prefix `SC-` for state-card composer, `TC-` for task-card composer, `RS-` for rolling-state, `BP-` for bridge propagation, `PP-` for parity, and `FX-` for Article X fail-open. Where new IDs append to existing test files, they continue from the highest existing ID (state-card-composer.test.js currently uses SC-01..SC-04; new cases start at SC-10 to leave room).

---

### FR-001 — renderCard inlines rendering_mandate, content_coverage, template_ref body

**Task**: T001 (file: `tests/core/roundtable/composers/state-card-composer.test.js`, MODIFY)
**Production target**: `src/core/roundtable/state-card-composer.js renderCard()` (lines 111-200), modified by T010, T011

**Acceptance criteria coverage**: AC-001-01 (rendering_mandate inline), AC-001-02 (content_coverage inline), AC-001-03 (template_ref body inline)

#### SC-10 — PRESENTING_TASKS card includes 4_column_traceability_table mandate (canary, AC-001-01)

This is the canary symptom referenced in the bug report. If this test passes, the on-screen artifact at PRESENTING_TASKS will follow the format mandate.

- **Input**: `state = { name: 'PRESENTING_TASKS', presenter: 'Lead', template: 'traceability.template.json' }`, full real card source loaded from `src/isdlc/config/roundtable/state-cards/presenting-tasks.card.json`, minimal `context` with empty `acceptedPayloads`.
- **Expected output** (substrings present, in order is not asserted):
  - `"Rendering mandate:"` header line
  - `"4_column_traceability_table"` (the format value)
  - `"pipe_delimited"` (the style value)
  - `"bans:"` followed by each of `bullets`, `prose_only`, `narrative_summary` on one or multiple lines
  - The 4 column names from the source card's `rendering_mandate.columns` array (verbatim — Phase 06 reads the literal strings from JSON; do not hard-code them in the test, load from the same JSON the runtime reads).
- **Negative assertion**: card MUST NOT contain the bare line `Template: traceability.template.json` without any inlined body (the broken behavior). If `Template:` appears, it MUST be followed by columns/rendering/content_guidance content within 20 lines.
- **Edge cases**:
  - Card source missing `rendering_mandate` (other PRESENTING_* states like PRESENTING_REQUIREMENTS): no mandate header emitted, no exception thrown.
  - `rendering_mandate.bans` empty array: header emitted but no bans line.

#### SC-11 — PRESENTING_REQUIREMENTS card includes content_coverage list (AC-001-02)

- **Input**: `state = { name: 'PRESENTING_REQUIREMENTS', presenter: 'Maya', template: 'requirements.template.json' }`, real card source.
- **Expected output**:
  - `"Content coverage:"` header line
  - Each item from `content_coverage` array as a bulleted line — typical items (load from JSON): `FRs with IDs and MoSCoW`, `key acceptance criteria`, `references`, `confidence levels`.
- **Negative assertion**: card MUST NOT silently drop content_coverage when present.
- **Edge cases**:
  - Card source missing `content_coverage`: no header emitted (e.g., CONVERSATION state).
  - `content_coverage` value is a string (not array): wrap in single-item list.

#### SC-12 — PRESENTING_TASKS card inlines traceability.template.json body (AC-001-03)

- **Input**: same as SC-10.
- **Expected output**:
  - `format.columns` array values present as inlined column-list (e.g., `Tasks | Files | Traces | Skills` or per-row column block depending on Phase 06's chosen format — assert presence of each column name).
  - `rendering.table_style: ascii_box` value present as a literal substring.
  - `rendering.cell_wrap`, `rendering.row_separator`, `rendering.empty_cell` values each present.
  - At least one `content_guidance` per-column block present (substring match on a stable phrase from the source JSON, e.g., the `narrative` example from the first column).
  - The `example` block from the template, if present in source, inlined under an `Example:` header.
- **Edge cases**:
  - `template_ref` filename does not resolve to a file (e.g., card references a non-existent template): falls back to `[reference: <filename>]`, does not throw. Crosses with FR-007 / SC-21.
  - `template_ref` resolves to a JSON without `format.columns`: emits whatever subset is present, does not throw on missing keys.

#### SC-13 — Negative: states without confirmation templates are unchanged (regression guard)

- **Input**: `state = { name: 'CONVERSATION', presenter: null, template: null }` and `state = { name: 'AMENDING', presenter: null, template: null }`.
- **Expected output**: card composes successfully; existing fields (Personas, Active, Rendering, valid_transitions, accept_amend_prompt) all present; no `Rendering mandate:` / `Content coverage:` / template-body sections injected.
- **Rationale**: protect against accidental over-inlining on non-confirmation states.

---

### FR-002 — renderCard inlines accepted prior-stage payloads from context.acceptedPayloads

**Task**: T002 (file: `tests/core/roundtable/composers/state-card-composer.test.js`, MODIFY)
**Production target**: `state-card-composer.js renderCard()`, modified by T012
**Acceptance criteria coverage**: AC-002-01 (analyze flow propagation), AC-002-02 (bug-gather flow propagation)

#### SC-14 — Feature flow: PRESENTING_TASKS card includes prior REQUIREMENTS, ARCHITECTURE, DESIGN (AC-002-01)

- **Input**:
  - `state = { name: 'PRESENTING_TASKS', ... }`
  - `context.acceptedPayloads = { PRESENTING_REQUIREMENTS: '<sample requirements text — 50 lines, includes FR-001 and AC-001-01>', PRESENTING_ARCHITECTURE: '<sample arch text>', PRESENTING_DESIGN: '<sample design text>' }`
- **Expected output**:
  - Card includes a `Prior accepted content:` (or similar) header section.
  - Each of the three prior payloads present, each preceded by an identifier of which stage it came from (e.g., `=== PRESENTING_REQUIREMENTS ===`).
  - Substring assertions: a stable token from each fixture appears in the rendered card (e.g., `'FR-001'` appears, `'<sample arch text>'` first 30 chars appear, etc.).
- **Edge cases**:
  - Only one prior payload non-null (e.g., PRESENTING_REQUIREMENTS accepted, ARCHITECTURE/DESIGN still null): only that one inlined; no empty headers emitted.
  - All prior payloads null (PRESENTING_REQUIREMENTS itself, no priors): no `Prior accepted content:` header emitted.
  - `context.acceptedPayloads` missing entirely (older callers): treated as `{}`, no exception.

#### SC-15 — Bug-gather flow: PRESENTING_TASKS card includes BUG_SUMMARY, ROOT_CAUSE, FIX_STRATEGY (AC-002-02)

- **Input**: same as SC-14 but `acceptedPayloads = { PRESENTING_BUG_SUMMARY, PRESENTING_ROOT_CAUSE, PRESENTING_FIX_STRATEGY }`.
- **Expected output**: same structural assertions as SC-14, but with the bug-flow stage names.
- **Edge cases**: mixed feature + bug keys present (defensive — should not happen in practice but composer must not throw): all non-null entries inlined; ordering by the keys' definition order in `rolling-state.create()` initial accumulator (T015 establishes that order).

#### SC-16 — Stage-ordering guard: each PRESENTING_* state only inlines payloads from strictly prior stages

- **Input matrix** (one test case per row):

  | Current state | acceptedPayloads non-null keys | Expected inlined |
  |---|---|---|
  | PRESENTING_REQUIREMENTS | (none) | (none) |
  | PRESENTING_ARCHITECTURE | REQUIREMENTS | REQUIREMENTS |
  | PRESENTING_DESIGN | REQUIREMENTS, ARCHITECTURE | REQUIREMENTS, ARCHITECTURE |
  | PRESENTING_TASKS | REQUIREMENTS, ARCHITECTURE, DESIGN | all three |
  | PRESENTING_BUG_SUMMARY | (none) | (none) |
  | PRESENTING_ROOT_CAUSE | BUG_SUMMARY | BUG_SUMMARY |
  | PRESENTING_FIX_STRATEGY | BUG_SUMMARY, ROOT_CAUSE | BUG_SUMMARY, ROOT_CAUSE |

- **Expected output** per row: only the listed keys' content appears in the rendered card; no future-stage keys appear even if present in `acceptedPayloads`.
- **Rationale**: protects against accidental forward-leak (e.g., FIX_STRATEGY content appearing in a re-render of ROOT_CAUSE if the user amends).

---

### FR-003 — renderTaskCard inlines skill body per delivery_type

**Task**: T003 (file: `tests/core/roundtable/composers/task-card-composer.test.js`, MODIFY)
**Production target**: `task-card-composer.js renderTaskCard()` (lines 203-276) and `renderSkillLine` (lines 188-193), modified by T014
**Acceptance criteria coverage**: AC-003-01 (delivery_type=context full inline), AC-003-02 (delivery_type=instruction key-rules extract), AC-003-03 (delivery_type=reference unchanged pointer-only)

#### TC-10 — delivery_type=context inlines full skill body (AC-003-01)

- **Input**:
  - `subTask = { id: 'codebase_scan', preferred_tools: [...], expected_output: '...', completion_marker: 'scan_complete' }`
  - `manifestContext.available_skills = [{ id: 'code-search', delivery_type: 'context', bindings: { sub_tasks: ['codebase_scan'] }, source: 'src/claude/skills/code-search.md', priority: 1 }]`
- **Setup**: skill source file (a real file, e.g., `src/claude/skills/code-search.md` — load via `fs.readFileSync` in the test fixture setup); body length ~30-80 lines.
- **Expected output**:
  - Card includes a section header for the skill (e.g., `Skill: code-search [FULL]`).
  - The full skill body appears verbatim under that header (assert: stable substring from the skill body, e.g., the first non-blank line after the YAML frontmatter).
  - `[REF]` does NOT appear for this skill.
- **Edge cases**:
  - Skill body is < 5 lines: still inlined fully.
  - Skill body file does not exist: falls back to `[reference: <skill.source>]` (FR-007 crossover, see FX-31).
  - Two `delivery_type=context` skills bound to same sub-task: both inlined, in priority order.

#### TC-11 — delivery_type=instruction inlines key-rules extract (AC-003-02)

- **Input**:
  - `manifestContext.available_skills = [{ id: 'blast-radius', delivery_type: 'instruction', source: 'src/claude/skills/blast-radius.md', ... }]`
- **Expected output**:
  - Card includes section header `Skill: blast-radius [RULES]`.
  - A key-rules extract is present — heuristic: lines that match a "Rules:" / "Must:" / "Do not:" pattern from the source skill, OR the section between specific markers (Phase 06 implementation detail). The test asserts:
    - At least one "rule-flavored" line is present (substring matching one of: `MUST`, `Rule:`, `Do not`).
    - The full body is NOT present (line count of inlined block < line count of source skill body).
- **Edge cases**:
  - Skill body has no extractable rules (no MUST/Rule/Do not pattern): falls back to inlining the first 10 lines or the skill summary block; never throws.
  - Skill body file missing: `[reference: <source>]` (FR-007 crossover).

#### TC-12 — delivery_type=reference remains pointer-only (AC-003-03)

- **Input**:
  - `manifestContext.available_skills = [{ id: 'dependency-check', delivery_type: 'reference', source: 'src/claude/skills/dependency-check.md', ... }]`
- **Expected output**:
  - Card includes line of the form `Skill: dependency-check [REF] (src/claude/skills/dependency-check.md)`.
  - The skill body is NOT inlined (no substring match to known content of the file).
  - File system is NOT read for this skill (assert via spy/mock — see Mock Strategy below).
- **Rationale**: this is the only mode where pointer-only is correct; protects against accidental over-inlining.

#### TC-13 — Mixed delivery types in one task card

- **Input**: sub-task with three skills bound — one each of `context`, `instruction`, `reference`.
- **Expected output**: card contains all three sections, each with the rendering rule above; section ordering follows priority field in manifest.

#### TC-14 — Sub-task description surfaced when template missing

- **Input**: sub-task with explicit `description: 'Probe the failing path...'` field but the task-card template file does not exist (simulate read failure).
- **Expected output**: `description` value present in the rendered card under a `Sub-task:` or `Purpose:` header. The current minimal-card path drops it; this is the regression we're testing for.
- Crosses with FR-007 (FX-32).

---

### FR-004 — Soft per-section budget and truncation pointer

**Task**: T004 (files: both composer test files, MODIFY)
**Production target**: both composers, modified by T013
**Acceptance criteria coverage**: AC-004-01 (within budget = inline full content), AC-004-02 (over budget = truncate with explicit pointer)

#### SC-17 — Largest expected card stays within configured budget (AC-004-01)

- **Input**:
  - `state = PRESENTING_TASKS` with three prior payloads of realistic size (REQUIREMENTS ~80 lines, ARCHITECTURE ~120 lines, DESIGN ~100 lines — load from sample fixtures in `tests/fixtures/payloads/`).
  - Template body (`traceability.template.json`) loaded from real source (~80-120 lines).
- **Expected output**:
  - Total card line count (or token count, whichever Phase 06 picks) ≤ configured cap.
  - Configured cap is read via `getRoundtableConfig` (default placeholder per fix-strategy.md: 200 lines per payload digest, ~1000 lines total ceiling — Phase 06 sets the actual value during T013).
  - All four content blocks present (template body + three prior payloads), at least in summary form.

#### SC-18 — Per-payload soft cap with truncation pointer (AC-004-02)

- **Input**: synthetic prior payload of 500 lines (over the per-payload soft cap of 200).
- **Expected output**:
  - First N lines of the payload present (where N = soft cap).
  - Last line of inlined block is followed by literal pointer of form `[truncated; full text at <ARTIFACT_FOLDER>/<file>.md after Accept]`.
  - Pointer's `<ARTIFACT_FOLDER>/<file>.md` placeholder is filled — value comes from `context.artifactFolder` and the stage-to-file mapping (e.g., `PRESENTING_REQUIREMENTS` → `requirements-spec.md`). The mapping is Phase 06 implementation detail; test asserts the pointer is well-formed (regex match) and includes a non-empty path.
  - `context` is empty / artifactFolder unset: pointer falls back to `[truncated; see prior accepted content in the conversation history]`.
- **Edge cases**:
  - Payload exactly equal to soft cap: no truncation, no pointer.
  - Payload one line over cap: truncation kicks in (do not silently allow N+1).

#### TC-15 — Task card budget regression

- **Input**: task card with one `delivery_type=context` skill body of 800 lines (oversize).
- **Expected output**: skill body truncated at the per-skill soft cap; pointer of form `[truncated; full skill at <skill.source>]` appended; rest of card composes normally.
- **Rationale**: skill bodies can be long (e.g., `claude-api` skill); per-skill cap prevents one huge skill from blowing the whole card.

#### SC-19 — Budget conversion is soft, not hard (regression guard)

- **Input**: real card composition that previously fit under the 40-line hard cap (e.g., CONVERSATION state) but would have been truncated by it.
- **Expected output**: card length is whatever the new soft budget yields — the old `MAX_TOTAL_LINES = 40` constant is no longer the truncation gate. Assertion: card line count for CONVERSATION state may exceed 40 (informational), but no truncation pointer appears unless content actually exceeds the new cap.

---

### FR-005 — rolling-state accepted_payloads CRUD and migration

**Task**: T005 (file: `tests/core/roundtable/rolling-state/rolling-state.test.js`, MODIFY)
**Production target**: `rolling-state.js create()` (lines 49-70), `update()` (lines 84-113), modified by T015
**Acceptance criteria coverage**: AC-005-01 (create initializes the field), AC-005-02 (writer applies a payload), AC-005-03 (defensive init for sessions started before fix)

#### RS-10 — create() initializes accepted_payloads with all stage keys (AC-005-01)

- **Input**: `create(MINIMAL_DEF)`.
- **Expected output**: returned state has `accepted_payloads` object with the seven keys from fix-strategy.md exactly:
  - `PRESENTING_REQUIREMENTS`, `PRESENTING_ARCHITECTURE`, `PRESENTING_DESIGN`, `PRESENTING_TASKS`, `PRESENTING_BUG_SUMMARY`, `PRESENTING_ROOT_CAUSE`, `PRESENTING_FIX_STRATEGY`.
- **Each key**: initial value `null`.
- **Negative assertion**: no other keys (defends against accidentally adding stages without updating the test).

#### RS-11 — applyAcceptedPayload(state, stageName, payload) writes the payload (AC-005-02)

- **Input**: state from create(); call `applyAcceptedPayload(state, 'PRESENTING_REQUIREMENTS', '<some text>')`.
- **Expected output**:
  - State's `accepted_payloads.PRESENTING_REQUIREMENTS === '<some text>'`.
  - Other six keys remain `null`.
  - State is returned (writer either mutates in place or returns updated copy — Phase 06 design choice; test accommodates both via reading back the field after the call).
- **Edge cases**:
  - Calling with an unknown stage name (e.g., `'PRESENTING_FOO'`): no-op (no exception, no state mutation). Or alternatively documented behavior of throwing — Phase 06 decides; the test should assert the documented contract from T015's implementation. **Default contract for the test**: silent no-op (consistent with the rest of rolling-state's permissive style).
  - Calling twice on the same stage (re-amend): second call overwrites first.
  - `payload` is empty string: stored as `''` (distinct from null — null = never accepted, '' = accepted-with-empty-content). Asserts on both states.

#### RS-12 — update() defensively initializes accepted_payloads when missing (migration, AC-005-03)

- **Input**: a state object missing `accepted_payloads` entirely (simulating sessions that started before the fix shipped).
- **Setup**: `const state = { coverage_by_topic: {}, scan_complete: false, ... }` — note no `accepted_payloads` key.
- **Action**: call `update(state, ...)` with any normal update payload.
- **Expected output**:
  - After update, `state.accepted_payloads` exists and is the seven-key initial object.
  - Update completes without throwing.
  - Other state fields update normally.
- **Rationale**: rolling state is in-memory only (per `rolling-state.js:1-6`), so this only matters for sessions that span the deploy boundary, but the defense is cheap and prevents NPEs on any path that calls `applyAcceptedPayload`.

#### RS-13 — snapshot() includes accepted_payloads

- **Input**: state with two stages accepted, snapshot taken.
- **Expected output**: snapshot's serialized form includes the `accepted_payloads` field with the same values.
- **Rationale**: snapshot is used for debug logs; if it omits the new field, post-mortem debugging on payload propagation issues is harder.

---

### FR-006 — bridge composeForTurn payload propagation

**Task**: T006 (file: `tests/core/bridge/roundtable-payload-propagation.test.cjs`, CREATE)
**Production target**: `src/core/bridge/roundtable.cjs composeForTurn` (lines 180-234), modified by T016
**Acceptance criteria coverage**: AC-006-01 (acceptedPayloads from rolling state reaches state-card composer)

#### BP-01 — composeForTurn passes accepted_payloads through context (AC-006-01)

- **Input**:
  - Initialize a state machine via `initializeRoundtable(workflow='analyze', mode='analyze')`.
  - Build a rolling state with `accepted_payloads.PRESENTING_REQUIREMENTS = '<requirements text>'` and `PRESENTING_ARCHITECTURE = '<arch text>'`.
  - Drive the state machine to `PRESENTING_DESIGN` (via the appropriate transitions).
  - Call `composeForTurn(machine, rollingState, baseContext, manifestContext)`.
- **Expected output** — the composed state card string:
  - Contains a stable substring from `<requirements text>` (e.g., a unique marker like `__REQ_FIXTURE_MARKER__`).
  - Contains a stable substring from `<arch text>` (`__ARCH_FIXTURE_MARKER__`).
  - Does NOT contain any DESIGN/TASKS forward-payload (rolling state has only REQUIREMENTS and ARCHITECTURE non-null).
- **Verification level**: integration — exercises the bridge → state-card-composer wire end-to-end. Uses the real composer, not a mock, so the test fails if the bridge wires the field but the composer does not consume it.
- **Edge cases**:
  - Rolling state has zero accepted payloads (cold start at PRESENTING_REQUIREMENTS): card composes; no prior-payload section appears.
  - Rolling state's `accepted_payloads` is undefined entirely (caller passed an old shape): bridge defensively passes `{}` to the composer; no throw.
  - Bridge is called with `rollingState=null` (defensive path that already exists in `composeForTurn`): existing fail-safe behavior preserved (returns minimal composition or null per existing contract — assert no regression).

#### BP-02 — composeForTurn does not mutate rolling state during composition

- **Input**: rolling state with two accepted payloads.
- **Action**: call `composeForTurn` and capture the rolling state snapshot before and after.
- **Expected output**: snapshots are equal — composition is read-only with respect to rolling state.
- **Rationale**: prevents subtle bugs where re-rendering a state amends the accumulator.

---

### FR-007 — Article X fail-open regression across new file reads

**Task**: T007 (files: both composer test files, MODIFY)
**Production target**: both composers, audited by T018 (every new file read wrapped in try/catch with `referenceFallback` helper)
**Acceptance criteria coverage**: AC-007-01 (template/skill/card read failure → reference fallback, no throw), AC-007-02 (partial success — some reads work, others fail — best-effort composition)

#### FX-30 — template_ref read failure falls back to reference pointer (AC-007-01)

- **Input**:
  - `state = PRESENTING_TASKS` with `template_ref = 'nonexistent.template.json'` (overridden card source).
  - Or: real card source but mock `fs.readFileSync` for that one path to throw `ENOENT`.
- **Expected output**:
  - Card composes successfully (no exception bubbles).
  - Card includes line of form `[reference: nonexistent.template.json]` (or whatever Phase 06 chooses for the fallback marker — the test asserts presence of `nonexistent.template.json` substring AND that the surrounding section structure is intact).
  - All other card sections (Personas, Active, Rendering, accept_amend_prompt, etc.) compose normally.
- **Implementation note**: T018's `referenceFallback` helper centralizes the fallback string format. Test should match that helper's output, not hard-code the format independently.

#### FX-31 — skill body read failure falls back to reference pointer

- **Input**:
  - `manifestContext.available_skills` includes a skill with `delivery_type='context'` and `source='src/claude/skills/nonexistent-skill.md'` (or mock fs to throw).
- **Expected output**:
  - Task card composes; skill section emits `[reference: src/claude/skills/nonexistent-skill.md]`.
  - Other skills in the same task card (with valid sources) inline successfully — partial-success path (AC-007-02).
- **Negative**: composer does NOT throw, does NOT log a fatal error, does NOT skip the entire task card.

#### FX-32 — card source read failure falls back to minimal card

- **Input**: state name that maps to a card file that does not exist (e.g., `state.name = 'NONEXISTENT_STATE'`).
- **Expected output**:
  - Existing `buildMinimalCard` fallback engaged.
  - Returned string is non-empty, includes the state name, and includes accept_amend_prompt.
  - No exception thrown.
- **Rationale**: this path already exists in current code; we are testing that the new template/payload inlining additions did not regress the existing fail-open path.

#### FX-33 — Mixed failure: template missing, payloads present, skills mixed

- **Input**: full PRESENTING_TASKS composition where:
  - `traceability.template.json` read fails.
  - `accepted_payloads` for REQUIREMENTS, ARCHITECTURE, DESIGN are all populated.
  - One context skill body file is readable, another is not.
- **Expected output**:
  - Card composes (no throw).
  - Template section shows `[reference: traceability.template.json]`.
  - All three prior payloads inline normally.
  - Readable skill body inlines; unreadable skill body emits reference fallback.
  - At least one assertion that the rendering_mandate (from the card source itself, not the template_ref) IS present — defends against the failure cascading and dropping unrelated content.

---

### FR-008 — Doc-touch (no test design needed)

`isdlc.md:757, 905` is a one-line prose update tracked by T017. No automated test is appropriate; the orchestration agent at code-review (T021) verifies the prose change manually against the renderer's actual output. Listed here for completeness; **no Phase 05 task** under FR-008.

---

## 4. Provider Parity Strategy

**Task**: T008 (file: `tests/parity/roundtable-composer-parity.test.js`, CREATE)
**Production target**: `src/providers/codex/projection.js` (no changes — inherits via shared ESM imports), `src/core/bridge/roundtable.cjs` (modified by T016)
**Acceptance criteria coverage**: AC-006-02 (provider parity)

### Parity contract

Codex projection imports the same ESM composers (`state-card-composer.js`, `task-card-composer.js`) used by the Claude bridge. The fix is provider-neutral by construction. The parity test enforces this by-construction guarantee at runtime so future Codex projection refactors cannot silently diverge.

#### PP-01 — Identical state-card output across providers

- **Input**:
  - Same `state`, `context` (including `acceptedPayloads`), and `manifestContext` passed to both:
    - Claude path: `composeForTurn` from `src/core/bridge/roundtable.cjs` (CommonJS bridge that requires the ESM composer through the bridge cache).
    - Codex path: the projection function from `src/providers/codex/projection.js` that produces the equivalent composition.
  - Choose a representative non-trivial state — `PRESENTING_TASKS` with three populated `acceptedPayloads`.
- **Expected output**:
  - Both paths return the composed state card as a string.
  - The two strings are exactly equal (`assert.strictEqual(claude, codex)`).
- **Rationale**: byte-equality is the strongest contract that can hold here because composers are pure given equal inputs. Any divergence (truncation, reformatting, ordering) signals a projection-side modification.

#### PP-02 — Identical task-card output across providers

- **Input**: same sub-task, same manifestContext, both paths.
- **Expected output**: byte-equal task-card strings.

#### PP-03 — Same fail-open behavior across providers

- **Input**: a setup that triggers fallback (e.g., missing `template_ref`).
- **Expected output**: both paths return the same fallback content (same `[reference: ...]` marker, same surrounding structure).
- **Rationale**: ensures the fix-strategy mitigation "Codex projection inherits via shared ESM imports" holds even on the error path.

### What parity tests do NOT cover

- Codex's own delegation/dispatch logic outside the composer call.
- Codex projection bundling (T022 verifies the projection bundle ships the right composer code).
- Provider-specific tools or hooks called outside the composer.

---

## 5. Test Data and Fixtures

### 5.1 Fixture sources

| Fixture | Source | Used by |
|---------|--------|---------|
| State card sources | `src/isdlc/config/roundtable/state-cards/*.card.json` (read-only at test time) | T001, T002, T004, T006, T007, T008 |
| Task card sources | `src/isdlc/config/roundtable/task-cards/*.task-card.json` | T003, T004, T007, T008 |
| Templates | `src/isdlc/config/templates/{requirements,architecture,design,traceability,bug-summary,root-cause-analysis,fix-strategy}.template.json` | T001, T004, T006, T007, T008 |
| Skill bodies | `src/claude/skills/<id>.md` (real files for delivery_type=context/instruction) | T003, T007 |
| Synthetic prior payloads | `tests/fixtures/payloads/{requirements,architecture,design,bug-summary,root-cause,fix-strategy}.fixture.md` (NEW) | T002, T004, T006 |

### 5.2 New fixture files

`tests/fixtures/payloads/` (CREATE) — six markdown files each ~50-150 lines representing a realistic accepted payload from each PRESENTING_* state. Each fixture contains:

- A unique marker token at the top (e.g., `__REQ_FIXTURE_MARKER_8a3f__`) — used in substring assertions to confirm propagation without depending on full-text equality.
- Realistic structure (FRs/ACs for requirements; layers/ports for architecture; etc.) — drawn from anonymized iSDLC docs.

For SC-18's oversize test, generate the 500-line synthetic payload at test-time (don't commit it as a fixture): `'__OVERSIZE_MARKER__\n' + 'lorem ipsum line\n'.repeat(499)`.

### 5.3 Mock strategy

| Test bucket | Mock | Why |
|-------------|------|-----|
| Happy-path composer tests (SC-10..16, TC-10..15) | None — load real source JSON | Anchors tests to runtime data shape |
| Article X fail-open tests (FX-30..33) | Mock `fs.readFileSync`/`fs.promises.readFile` for one specific path; pass through for others | Surgical failure injection |
| Parity tests (PP-01..03) | None for I/O; isolate Claude bridge call via `require()` and Codex via direct `import()` | Production paths exercised end-to-end |
| Bridge propagation (BP-01..02) | None — use real `initializeRoundtable` + real composers | Integration coverage at the seam |

For Article X tests, use Node's `mock.method` (built-in to `node:test`) rather than a sinon-style framework:

```js
import { mock } from 'node:test';
import * as fs from 'node:fs';
const restore = mock.method(fs, 'readFileSync', (path) => {
  if (path.endsWith('traceability.template.json')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  return originalReadFileSync(path);
});
// ... test ...
restore.mock.restore();
```

---

## 6. Risk-Based Prioritization

| Priority | Test cases | Why |
|----------|-----------|-----|
| **P0 — Canary** | SC-10 (PRESENTING_TASKS rendering_mandate inline), BP-01 (payload propagation through bridge), FX-30..33 (fail-open across all new reads) | SC-10 is the original bug symptom; BP-01 confirms the second leg of the fix landed; FX-30..33 protect Article X (constitutional) |
| **P1 — Core** | SC-11..16, TC-10..14, RS-10..13 | Direct FR coverage for inlining and accumulator |
| **P2 — Budget regression** | SC-17, SC-18, TC-15, SC-19 | New soft-budget logic; protects against token blowup |
| **P3 — Parity** | PP-01..03 | High-confidence-already (shared ESM imports) but worth runtime enforcement |

Recommended Phase 06 ordering: P0 first (canary catches the most regressions), then P1 (FR-by-FR), then P2 (budget tuning likely to need iteration), then P3 (cleanup verification).

---

## 7. Coverage Targets

This bug touches four modules. Coverage targets are scoped to the changed surface:

| Module | Line coverage target | Branch coverage target |
|--------|----------------------|------------------------|
| `state-card-composer.js renderCard` and helpers | 90%+ | 85%+ |
| `task-card-composer.js renderTaskCard` and `renderSkillLine` | 90%+ | 85%+ |
| `rolling-state.js create/update/applyAcceptedPayload` | 95%+ | 90%+ |
| `bridge/roundtable.cjs composeForTurn` (delta only) | 100% of new lines | 100% of new branches |

Whole-project coverage targets (Article X, etc.) are unchanged — this fix is additive.

**Requirement coverage**: 8/8 FRs covered (FR-001 through FR-008). 18/18 ACs covered or explicitly out-of-scope (FR-008 has no automated test). 100% of FRs trace to at least one Phase 05 test design task.

---

## 8. Traceability Matrix Summary

| FR | AC | Phase 05 Tasks | Test Cases | Phase 06 Tasks |
|----|-----|----------------|-----------|----------------|
| FR-001 | AC-001-01 | T001 | SC-10, SC-13 | T010 |
| FR-001 | AC-001-02 | T001 | SC-11, SC-13 | T010 |
| FR-001 | AC-001-03 | T001 | SC-12, SC-13 | T011 |
| FR-002 | AC-002-01 | T002 | SC-14, SC-16 | T012 |
| FR-002 | AC-002-02 | T002 | SC-15, SC-16 | T012 |
| FR-003 | AC-003-01 | T003 | TC-10, TC-13 | T014 |
| FR-003 | AC-003-02 | T003 | TC-11, TC-13 | T014 |
| FR-003 | AC-003-03 | T003 | TC-12, TC-13 | T014 |
| FR-004 | AC-004-01 | T004 | SC-17, SC-19 | T013 |
| FR-004 | AC-004-02 | T004 | SC-18, TC-15 | T013 |
| FR-005 | AC-005-01 | T005 | RS-10, RS-13 | T015 |
| FR-005 | AC-005-02 | T005 | RS-11 | T015 |
| FR-005 | AC-005-03 | T005 | RS-12 | T015 |
| FR-006 | AC-006-01 | T006 | BP-01, BP-02 | T016 |
| FR-006 | AC-006-02 | T008 | PP-01, PP-02, PP-03 | T016 |
| FR-007 | AC-007-01 | T007 | FX-30, FX-31, FX-32 | T018 |
| FR-007 | AC-007-02 | T007 | FX-31, FX-33 | T018 |
| FR-008 | AC-008-01 | (no test) | (manual review) | T017 |

Coverage: 100% of FRs and ACs traced to a test case or explicit non-test rationale.

---

## 9. Entry / Exit Criteria

### 9.1 Entry (Phase 06 begins implementing)

- [x] This document exists.
- [x] Per-FR test cases specified with input shape, expected output, edge cases.
- [x] Fixtures inventory complete.
- [x] Mock strategy specified.
- [x] Traceability matrix complete (8/8 FRs, 18/18 ACs).

### 9.2 Exit (Phase 16 quality loop closes)

- [ ] All test cases SC-10..19, TC-10..15, RS-10..13, BP-01..02, PP-01..03, FX-30..33 implemented (Phase 06 T010..T018).
- [ ] All new tests pass (red-green TDD: red first when paired prod task is incomplete; green when paired prod task lands).
- [ ] Coverage targets in §7 met for changed modules.
- [ ] Existing test suite has no new failures.
- [ ] T020 parity verification confirms Claude/Codex byte-equality.

---

## 10. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Snapshot brittleness for inlined content | Medium | Tests assert structural substrings, not full-text equality (per fix-strategy.md flaky-test note) |
| Fixture drift if source JSON changes | Low | Tests load source JSON at runtime, so card-source schema changes surface the test failure at the schema-change PR, not later |
| Token-budget cap is a moving target | Medium | T013 makes the cap configurable via `getRoundtableConfig`; test SC-17 asserts ≤ cap, not a fixed number |
| Article X regression sneaks past tests | High | FX-30..33 cover all three new file-read paths (template, skill, card); T018 audit ensures every new fs call has a test |
| Codex projection diverges over time | Low | PP-01..03 enforce byte-equality; T020 verifies before merge |

---

## 11. GATE-05 Validation Checklist

- [x] Test strategy covers unit, integration, parity (no E2E/security/performance — out of scope for this bug)
- [x] Test cases exist for all FRs (FR-001..FR-007 — FR-008 doc-touch only)
- [x] Traceability matrix complete (100% FR and AC coverage)
- [x] Coverage targets defined per module
- [x] Test data and fixture strategy documented
- [x] Critical paths identified (P0 set in §6)
- [x] Existing test infrastructure used (`node:test`, ESM, existing test directories)
- [x] Provider parity strategy specified (§4)

---

## 12. Existing Test Infrastructure

This project's test infrastructure (per `package.json`, `tests/` layout):

- **Framework**: `node:test` (Node built-in) — Article XIII compliant (ESM-first).
- **Assertion library**: `node:assert/strict`.
- **Test directories**: `tests/core/`, `tests/parity/` (created by T008), `tests/fixtures/` (extended by §5.2).
- **Naming conventions**: `*.test.js` (ESM) or `*.test.cjs` (CommonJS, used by bridge).
- **Run command**: `npm test` (per `package.json`).

This strategy extends the existing infrastructure — no new framework, no new tooling. All seven Phase 05 deliverables fit into the established patterns.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-25 | Test Design Engineer | Initial test strategy for BUG-GH-265 (8 FRs, 18 ACs, 30 test cases across 5 test files) |
