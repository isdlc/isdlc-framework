# Task Plan: SLUG BUG-GH-265-traceability-matrix-not-enforced-presenting-tasks

## Progress Summary

| Phase | Tasks | Completed | Percentage |
| --- | --- | --- | --- |
| 05-test-strategy | 8 | 8 | 100% |
| 06-implementation | 9 | 9 | 100% |
| 16-quality-loop | 2 | 2 | 100% |
| 08-code-review | 2 | 2 | 100% |
| TOTAL | 21 | 21 | 100% |

---

## Phase 05: Test Strategy -- COMPLETE

- [X] T001 Test design — state-card composer renderCard inlining tests | traces: FR-001
  files: tests/core/roundtable/composers/state-card-composer.test.js (MODIFY)
- [X] T002 Test design — state-card composer accepted_payloads inlining tests | traces: FR-002
  files: tests/core/roundtable/composers/state-card-composer.test.js (MODIFY)
- [X] T003 Test design — task-card composer skill-body inlining tests per delivery_type | traces: FR-003
  files: tests/core/roundtable/composers/task-card-composer.test.js (MODIFY)
- [X] T004 Test design — soft per-section budget and truncation pointer tests | traces: FR-004
  files: tests/core/roundtable/composers/state-card-composer.test.js (MODIFY)
- [X] T005 Test design — rolling-state accepted_payloads CRUD and migration tests | traces: FR-005
  files: tests/core/roundtable/rolling-state/rolling-state.test.js (MODIFY)
- [X] T006 Test design — bridge composeForTurn payload propagation test | traces: FR-006
  files: tests/core/bridge/roundtable-payload-propagation.test.cjs (CREATE)
- [X] T007 Test design — Article X fail-open regression tests | traces: FR-007
  files: tests/core/roundtable/composers/state-card-composer.test.js (MODIFY)
- [X] T008 Test design — provider parity test | traces: FR-006
  files: tests/parity/roundtable-composer-parity.test.js (CREATE)

---

## Phase 06: Implementation -- COMPLETE

- [X] T010 Implement renderCard rendering_mandate + content_coverage inlining | traces: FR-001
  files: src/core/roundtable/state-card-composer.js (MODIFY)
- [X] T011 Implement renderCard template_ref body inlining | traces: FR-001
  files: src/core/roundtable/state-card-composer.js (MODIFY)
- [X] T012 Implement renderCard accepted_payloads inlining from context | traces: FR-002
  files: src/core/roundtable/state-card-composer.js (MODIFY)
- [X] T013 Convert MAX_TOTAL_LINES hard cap to soft per-section budget | traces: FR-004
  files: src/core/roundtable/state-card-composer.js (MODIFY)
- [X] T014 Implement renderTaskCard skill-body inlining per delivery_type | traces: FR-003
  files: src/core/roundtable/task-card-composer.js (MODIFY)
- [X] T015 Implement rolling-state accepted_payloads field + applyAcceptedPayload writer | traces: FR-005
  files: src/core/roundtable/rolling-state.js (MODIFY)
- [X] T016 Implement bridge composeForTurn passing accepted_payloads via context | traces: FR-006
  files: src/core/bridge/roundtable.cjs (MODIFY)
- [X] T017 Update isdlc.md prose description of card contents | traces: FR-008
  files: src/claude/commands/isdlc.md (MODIFY)
- [X] T018 Article X fail-open audit | traces: FR-007
  files: src/core/roundtable/state-card-composer.js (MODIFY), src/core/roundtable/task-card-composer.js (MODIFY)

---

## Phase 16: Quality Loop -- COMPLETE

- [X] T019 Run full test suite | traces: FR-001..FR-007
  Results: 199 active tests passing, 0 failures, 16 pre-existing scope-blocked skips
- [X] T020 Provider parity verification | traces: FR-006
  Results: parity tests pass; Codex projection inherits via shared ESM imports

---

## Phase 08: Code Review -- COMPLETE

- [X] T021 Constitutional review | traces: FR-007
  Results: APPROVED. Article X (fail-open) verified, Article XIII (ESM) verified, Article I/II/VII verified, no source JSON schema changes
- [X] T022 Dual-file check | traces: FR-006
  Results: .claude/commands/ symlink reflects automatically; Codex projection inherits via shared ESM composer imports

---

## Coverage

8/8 FRs, 18/18 ACs, all phases — 100%.
