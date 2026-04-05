# Test Strategy — REQ-GH-235

**Slug**: REQ-GH-235-rewrite-roundtable-analyst-for-consistent-roundtable-ux
**Last Updated**: 2026-04-05
**Phase**: 05 — Test Strategy & Design
**ATDD Mode**: Enabled (generate_skipped_tests: true)
**Workflow Type**: feature (build)

---

## 1. Existing Infrastructure

Detected via project conventions (no test-evaluation report required — infrastructure is well-established):

| Layer | Framework | Location | Convention |
|---|---|---|---|
| Unit tests (ESM core) | `node:test` + `node:assert/strict` | `tests/**/*.test.js` | `.test.js` suffix |
| Hook tests (CommonJS) | `node:test` + `node:assert/strict` | `src/claude/hooks/tests/**/*.test.cjs` | `.test.cjs` suffix |
| Prompt verification | `node:test` + `node:assert/strict` | `tests/prompt-verification/*.test.js` | Reads `.md` files, asserts content patterns |
| Test runner | `node --test` via `npm test` | `package.json` | Glob-discovered |

**Strategy**: Extend existing test suite. No new frameworks. Follow established patterns verbatim.

---

## 2. Test Pyramid

This REQ is primarily a **prompt contract rewrite** with a small runtime module and enforcement hooks. The pyramid is inverted from typical app testing — prompt-verification tests dominate because the primary artifact under test is a markdown prompt contract.

```
                  ┌──────────────────────────────────┐
                  │ E2E (manual dogfooding)           │  Manual /isdlc analyze run
                  │ 1 journey: analyze → 4 confirms   │
                  └──────────────────────────────────┘
             ┌──────────────────────────────────────────┐
             │ Integration (composer ↔ analyze handler)  │  ~3 tests
             │ prompt-verification suite — 8 new + 8 upd │  16 tests
             └──────────────────────────────────────────┘
       ┌────────────────────────────────────────────────────┐
       │ Unit (runtime-composer + 3 new hooks + 4 updated)   │  ~25 tests
       │ composer: ~12 tests, hooks: ~13 tests               │
       └────────────────────────────────────────────────────┘
```

**Rationale**:
- Prompt-verification is the primary correctness mechanism (Article II Test-First + Article XI Test Quality Beyond Coverage)
- Runtime composer is pure-function ESM → fast, deterministic unit tests (node:test)
- Hooks are spawnSync-isolated CJS processes → unit-test with stdin/stdout contract
- Manual E2E only: running `/isdlc analyze` on a real backlog item to verify the staged confirmation demo UX

---

## 3. Coverage Targets

| Module | Target | Rationale |
|---|---|---|
| `src/core/roundtable/runtime-composer.js` | ≥ 90% lines/branches | Pure function, testable with fixtures |
| `src/claude/hooks/tasks-as-table-validator.cjs` | ≥ 85% lines | Hook subprocess with stdin fixtures |
| `src/claude/hooks/participation-gate-enforcer.cjs` | ≥ 85% lines | Hook subprocess with stdin fixtures |
| `src/claude/hooks/persona-extension-composer-validator.cjs` | ≥ 85% lines | Hook subprocess with stdin fixtures |
| Updated hooks (conversational-compliance, output-format-validator, menu-halt-enforcer, +1 from audit) | ≥ 80% (existing) | Maintain existing coverage, no regression |
| Prompt-verification suite | 100% pass rate | Contract enforcement — any failure blocks merge |

**Coverage tool**: existing `node --experimental-test-coverage` or `c8` (project convention). No new tooling.

---

## 4. Test Data and Fixtures Strategy

### Runtime Composer Fixtures

Location: `tests/core/roundtable/fixtures/`

| Fixture | Purpose | Example |
|---|---|---|
| `default-state-machine.json` | Baseline 4-state protocol (Req→Arch→Design→Tasks) | Standard state list from parsed `roundtable-analyst.md` |
| `persona-contributing-valid.md` | Existing `role_type: contributing` persona (zero-touch) | security-reviewer, data-architect as contributing |
| `persona-promoted-valid.md` | Valid primary persona with full promotion frontmatter | data-architect promoted with `inserts_at: after:architecture` |
| `persona-promoted-missing-fields.md` | Invalid promotion (missing `owns_state`) | Should trigger warning, fall back to contributing |
| `persona-promoted-bad-insertion.md` | Invalid `inserts_at` format | Triggers `unknown_extension_point` warning |
| `persona-conflict-a.md` / `persona-conflict-b.md` | Two primaries targeting same insertion point | Triggers first-wins conflict |

### Hook Stdin Fixtures

Location: `src/claude/hooks/tests/fixtures/REQ-GH-235/`

| Fixture | Purpose |
|---|---|
| `stdin-tasks-table-valid.json` | Last assistant turn contains pipe-delimited traceability table (4+ cols) |
| `stdin-tasks-bullets-invalid.json` | Last assistant turn contains bullet list (should WARN) |
| `stdin-participation-complete.json` | Transcript shows Maya scope + Alex evidence + Jordan design implication |
| `stdin-participation-shortcut.json` | Transcript shows Maya → confirmation directly (should WARN) |
| `stdin-persona-valid.json` | Persona files with valid frontmatter |
| `stdin-persona-conflict.json` | Persona files with insertion conflict |

### Prompt-Verification Inputs

Read directly from source under test:
- `src/claude/agents/roundtable-analyst.md` (rewritten, Phase 06 output)
- `src/claude/agents/bug-roundtable-analyst.md` (rewritten)
- `src/claude/agents/persona-*.md` (8 existing files — zero-touch compat check)

---

## 5. Flaky Test Mitigation

All tests are **synchronous and deterministic**:
- Prompt-verification: `readFileSync` + regex/substring assertions (no I/O races)
- Runtime composer: pure functions, no timers, no network, no filesystem side effects
- Hook tests: `spawnSync` with explicit `timeout: 5000`, isolated tmp dirs via `fs.mkdtempSync`

**No sources of flakiness expected.** If flakiness emerges during Phase 06:
- Quarantine to `tests/quarantine/` for triage (existing convention)
- Do not retry/mask — diagnose root cause per Article XI

---

## 6. Traceability Summary

Every AC maps to at least one test. See `traceability-matrix.csv` (updated in this phase) for the full AC → Test mapping.

| FR | ACs | Test Files | Test Count |
|---|---|---|---|
| FR-001 Rewrite structure | 3 | prompt-verification (structural + preservation) | 3 |
| FR-002 State-local templates | 3 | `state-local-template-binding.test.js` | 3 |
| FR-003 Anti-shortcut contract | 4 | `anti-shortcut-enforcement.test.js`, `participation-gate.test.js`, `tasks-render-as-table.test.js`, new hooks | 6 |
| FR-004 Rendering modes | 3 | `rendering-mode-invariants.test.js` | 3 |
| FR-005 Persona extensibility | 6 | `runtime-composer.test.js`, `persona-extension-composition.test.js`, `persona-extension-composer-validator.test.cjs` | 12 |
| FR-006 Appendix moves | 3 | prompt-verification (structural) | 3 |
| FR-007 7 new tests ship | 7 | all 7 new prompt-verification files exist and pass | 7 |
| FR-008 Hook audit + new hooks | 4 | 3 new hook tests + 8 updated existing tests | 13 |
| FR-009 Bug roundtable rewrite | 4 | `bug-roundtable-rewritten-contract.test.js` | 4 |
| FR-010 Documentation | 3 | structural doc checks (manual in Phase 08) | N/A (docs) |

**Total**: 40 ACs covered by ~54 assertions across 12 new/updated test files.

---

## 7. Performance Test Plan

Not applicable — this REQ has no runtime performance concerns:
- Runtime composer runs **once per analyze invocation** (<1ms for 8-15 persona files)
- Hooks run on tool boundaries (milliseconds, existing framework SLA)
- Prompt files grow/shrink but do not execute

**No load, stress, or benchmark tests required.**

---

## 8. ATDD Checklist: AC → Test Mapping with P0–P3 Priorities

Priority assignment rubric:
- **P0** (critical, blocks merge): contract/enforcement that prevents regression on anti-shortcut, template binding, or persona composition correctness
- **P1** (important): structural correctness, rendering modes, provider neutrality
- **P2** (medium): appendix organization, documentation alignment
- **P3** (low): cosmetic content checks

| AC ID | Description | Priority | Test File | Test Name | Status |
|---|---|---|---|---|---|
| AC-001-01 | Snapshot preserved | P0 | existing snapshot file | N/A (file exists check) | pre-existing |
| AC-001-02 | Rewrite materially smaller, layered | P1 | `rewritten-prompt-structure.test.js` | `structural: ≤700 lines, 12 main sections` | skip |
| AC-001-03 | §2-7 behaviors preserved verbatim | P0 | `rewritten-prompt-structure.test.js` | `preservation: all inventory markers present` | skip |
| AC-002-01 | Templates inline per PRESENTING state | P0 | `state-local-template-binding.test.js` | `each PRESENTING_* state names its template` | skip |
| AC-002-02 | On-screen Tasks uses traceability template | P0 | `state-local-template-binding.test.js` | `PRESENTING_TASKS binds traceability.template.json` | skip |
| AC-002-03 | Written tasks.md uses tasks template | P0 | `state-local-template-binding.test.js` | `written tasks.md binds tasks.template.json` | skip |
| AC-003-01 | No clarification→artifact collapse | P0 | `anti-shortcut-enforcement.test.js` | `contract forbids shortcut to artifact gen` | skip |
| AC-003-02 | 3 primary contributions before first confirm | P0 | `participation-gate.test.js` | `gate requires Maya+Alex+Jordan before PRESENTING_REQS` | skip |
| AC-003-03 | Tasks renders as table, not bullets/prose | P0 | `tasks-render-as-table.test.js` | `PRESENTING_TASKS asserts table format` | skip |
| AC-003-04 | No writes before confirmations | P0 | `anti-shortcut-enforcement.test.js` | `no-write-before-finalize rule present` | skip |
| AC-004-01 | Three rendering modes defined early | P1 | `rendering-mode-invariants.test.js` | `modes declared in §5` | skip |
| AC-004-02 | Mode changes don't alter protocol | P0 | `rendering-mode-invariants.test.js` | `shared invariants enumerated` | skip |
| AC-004-03 | Silent mode: internal-only gates | P1 | `rendering-mode-invariants.test.js` | `silent mode suppresses persona-name cues` | skip |
| AC-005-01 | Contributing default for added personas | P0 | `persona-extension-composition.test.js` | `added persona defaults to contributing` | skip |
| AC-005-02 | Contributing don't create templates/states | P0 | `runtime-composer.test.js` | `contributing folds, no new state emitted` | skip |
| AC-005-03 | Promotion frontmatter required fields | P0 | `runtime-composer.test.js` | `validatePromotionFrontmatter: reject missing fields` | skip |
| AC-005-04 | Composer runs at analyze dispatch | P0 | `runtime-composer.test.js` | `composeEffectiveStateMachine: insert at point` | skip |
| AC-005-05 | First-wins conflict resolution | P0 | `runtime-composer.test.js` | `detectInsertionConflicts: first-declared wins + warn` | skip |
| AC-005-06 | Zero-touch for 4 contributing personas | P0 | `runtime-composer.test.js` | `existing contributing personas unchanged` | skip |
| AC-006-01 | Agent Teams → Appendix A | P2 | `appendix-structure.test.js` | `Agent Teams content in Appendix A` | skip |
| AC-006-02 | Search wiring, schemas → Appendix B/C | P2 | `appendix-structure.test.js` | `search internals in Appendix B/C` | skip |
| AC-006-03 | Runtime resume single reference | P2 | `appendix-structure.test.js` | `resume semantics collapsed to single ref` | skip |
| AC-007-01 | anti-shortcut test exists | P0 | `anti-shortcut-enforcement.test.js` | (file exists + passes) | skip |
| AC-007-02 | state-local-template-binding test exists | P0 | `state-local-template-binding.test.js` | (file exists + passes) | skip |
| AC-007-03 | confirmation-sequencing-v2 test exists | P0 | `confirmation-sequencing-v2.test.js` | (file exists + passes) | skip |
| AC-007-04 | rendering-mode-invariants test exists | P0 | `rendering-mode-invariants.test.js` | (file exists + passes) | skip |
| AC-007-05 | persona-extension-composition test exists | P0 | `persona-extension-composition.test.js` | (file exists + passes) | skip |
| AC-007-06 | participation-gate test exists | P0 | `participation-gate.test.js` | (file exists + passes) | skip |
| AC-007-07 | tasks-render-as-table test exists | P0 | `tasks-render-as-table.test.js` | (file exists + passes) | skip |
| AC-008-01 | Hook audit report produced | P1 | (artifact check in Phase 08) | hook-audit-report.md exists | N/A |
| AC-008-02 | Drifting hooks updated | P1 | updated hook tests pass | existing hook test files | skip |
| AC-008-03 | 3 new hooks shipped | P0 | new hook tests pass | `tasks-as-table-validator.test.cjs`, `participation-gate-enforcer.test.cjs`, `persona-extension-composer-validator.test.cjs` | skip |
| AC-008-04 | All hook + prompt-verif tests pass | P0 | `npm test` exit 0 | (aggregate) | skip |
| AC-009-01 | Bug prompt uses same structure | P1 | `bug-roundtable-rewritten-contract.test.js` | `bug prompt has 12-section skeleton` | skip |
| AC-009-02 | Bug prompt shares modes/persona/templates | P1 | `bug-roundtable-rewritten-contract.test.js` | `modes + extensibility + template binding present` | skip |
| AC-009-03 | Bug-specific template bindings inline | P0 | `bug-roundtable-rewritten-contract.test.js` | `BUG_SUMMARY→bug-summary.template.json etc.` | skip |
| AC-009-04 | Bug prompt test exists | P0 | `bug-roundtable-rewritten-contract.test.js` | (file exists + passes) | skip |
| AC-010-01 | CLAUDE.md updated | P2 | manual review Phase 08 | docs currency check | N/A |
| AC-010-02 | docs/AGENTS.md regenerated | P2 | manual review Phase 08 | docs currency check | N/A |
| AC-010-03 | persona-authoring-guide updated | P2 | manual review Phase 08 | docs currency check | N/A |

---

## 9. Task-to-Test Traceability

Phase 05 tasks (this phase) to Phase 06 implementation tasks they unblock:

| Phase 05 Task | Scope | Test Scaffolds Produced | Phase 06 Tasks Unblocked |
|---|---|---|---|
| T001 test-strategy-rewritten-prompt | 8 new prompt-verification tests | `anti-shortcut-enforcement.test.js`, `state-local-template-binding.test.js`, `confirmation-sequencing-v2.test.js`, `rendering-mode-invariants.test.js`, `persona-extension-composition.test.js`, `participation-gate.test.js`, `tasks-render-as-table.test.js`, `bug-roundtable-rewritten-contract.test.js` | T023-T030 |
| T002 test-strategy-hook-audit-and-extensions | 3 new hook tests | `tasks-as-table-validator.test.cjs`, `participation-gate-enforcer.test.cjs`, `persona-extension-composer-validator.test.cjs` | T032, T041 |
| T003 test-strategy-runtime-composer | composer unit tests | `tests/core/roundtable/runtime-composer.test.js` | T014 |

---

## 10. ATDD RED→GREEN Workflow

All test scaffolds written in Phase 05 are `test.skip()` with ATDD RED state:
- Phase 06 task executor removes `.skip()` → test fails (RED)
- Executor implements minimum code to pass → test passes (GREEN)
- Quality loop (Phase 16) runs full suite → must be all green before merge

Tracked in `docs/requirements/REQ-GH-235-rewrite-roundtable-analyst-for-consistent-roundtable-ux/atdd-checklist.json` (see below).

---

## 11. GATE-05 Validation Checklist

- [x] Test strategy covers unit, integration, prompt-verification, hooks (no perf needed)
- [x] Test cases exist for all 40 ACs across 10 FRs
- [x] Traceability matrix complete (100% coverage, every AC → ≥1 test)
- [x] Coverage targets defined (composer ≥90%, hooks ≥85%, prompt-verif 100% pass)
- [x] Test data/fixtures strategy documented (§4)
- [x] Critical paths identified (P0 tags on anti-shortcut, template binding, composer correctness)
- [x] ATDD checklist generated with 40 ACs mapped to tests

---

## 12. Constitutional Compliance

| Article | How Satisfied |
|---|---|
| II Test-First | All tests designed BEFORE Phase 06 implementation. RED-state scaffolds shipped now. |
| V Simplicity | No new frameworks, no new test infrastructure. Extends existing node:test suite. |
| VII Traceability | 40 ACs → tests mapped in `traceability-matrix.csv` and §8 above. Zero orphan tests. |
| XI Test Quality Beyond Coverage | P0-P3 priorities prevent coverage-gaming. Prompt-verification tests assert behavior, not structure. Deterministic assertions only. |
