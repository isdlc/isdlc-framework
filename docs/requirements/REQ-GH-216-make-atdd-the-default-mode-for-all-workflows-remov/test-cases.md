# Test Cases: REQ-GH-216

ATDD-as-default refactor. Tests cover the new `ConfigService.getAtdd()` accessor, hook config gating for 5 consumers, and the integration matrix of 4 knobs in their canonical states.

All acceptance criteria in requirements-spec.md are Given/When/Then formatted. Test cases below mirror that structure.

## Test Strategy Summary

| Tier | Scope | Location | Framework |
|------|-------|----------|-----------|
| Unit | ConfigService.getAtdd() accessor | `src/core/config/config-service.test.js` (CREATE) | node:test |
| Unit | 5 hooks gated on atdd knobs (per-hook fixtures) | `src/claude/hooks/tests/*.test.cjs` (extend existing) | node:test (cjs) |
| Integration | Knob-interaction matrix (4 knobs, core subset of 16 states) | `tests/integration/atdd-config-knobs.test.js` (CREATE per tasks.md T025) | node:test |

**Coverage targets**:
- ConfigService.getAtdd: 100% branch coverage (5 branches: missing section, empty section, partial config, full config, read error).
- Hook gating: each hook has at least one test per knob state it reads (binary — enabled/disabled for master, and its specific sub-knob).
- Integration: 8 of 16 knob states exercised as the "core subset" — full-default, full-disabled, each sub-knob flipped individually (4 states), and two combined overrides (`enabled:false` with sub-knobs true, `enabled:true` with all sub-knobs false).

**Test data**:
- In-memory config fixtures passed through a mockable config reader (no disk I/O in unit tests).
- Integration tests write temporary `.isdlc/config.json` fixtures under a sandbox directory and assert hook/agent behavior end-to-end.

---

## T001: ConfigService.getAtdd() unit tests (unit tier)

**Task**: T001 — Design test cases for ConfigService.getAtdd (defaults, partial merge, error fail-open).
**Traces**: FR-003, AC-003-01, AC-003-02.
**Test file**: `src/core/config/config-service.test.js` (extends existing if present; otherwise CREATE).

### TC-T001-01: Missing atdd section returns all-true defaults

- **Test ID**: TC-T001-01
- **Test type**: Positive / unit
- **Trace**: FR-003, AC-003-01
- **Given** a cached `.isdlc/config.json` with no `atdd` key at all (fixture: `{ "branches": { ... } }` — any unrelated config, no `atdd`).
- **When** `configService.getAtdd()` is called.
- **Then** the returned object deep-equals `{ enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }`.
- **And** all four fields are present (no undefined values).
- **Preconditions**: ConfigService initialized with the fixture above; cache populated.
- **Expected outcome**: Exact defaults object returned.

### TC-T001-02: Empty atdd section returns all-true defaults

- **Test ID**: TC-T001-02
- **Test type**: Positive / unit
- **Trace**: FR-003, AC-003-01
- **Given** a cached `.isdlc/config.json` with `"atdd": {}` (empty object).
- **When** `configService.getAtdd()` is called.
- **Then** the returned object equals `{ enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }`.
- **Expected outcome**: Empty section is treated identically to a missing section; defaults applied.

### TC-T001-03: Partial atdd section — single field override

- **Test ID**: TC-T001-03
- **Test type**: Positive / unit (partial merge)
- **Trace**: FR-003, AC-003-02
- **Given** a cached `.isdlc/config.json` containing `"atdd": { "require_gwt": false }`.
- **When** `configService.getAtdd()` is called.
- **Then** the returned object equals `{ enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: true }`.
- **And** the `require_gwt` override is preserved.
- **And** the other three fields are filled with defaults (`true`).
- **Expected outcome**: Partial merge — user override wins, missing fields defaulted.

### TC-T001-04: Partial atdd section — multi-field override

- **Test ID**: TC-T001-04
- **Test type**: Positive / unit (partial merge)
- **Trace**: FR-003, AC-003-02
- **Given** `.isdlc/config.json` contains `"atdd": { "require_gwt": false, "enforce_priority_order": false }`.
- **When** `configService.getAtdd()` is called.
- **Then** the returned object equals `{ enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: false }`.
- **Expected outcome**: Both overrides preserved; `enabled` and `track_red_green` defaulted to `true`.

### TC-T001-05: Full explicit config — all false

- **Test ID**: TC-T001-05
- **Test type**: Positive / unit (full override)
- **Trace**: FR-003
- **Given** `.isdlc/config.json` contains `"atdd": { "enabled": false, "require_gwt": false, "track_red_green": false, "enforce_priority_order": false }`.
- **When** `configService.getAtdd()` is called.
- **Then** the returned object equals `{ enabled: false, require_gwt: false, track_red_green: false, enforce_priority_order: false }`.
- **Expected outcome**: All user-specified values preserved exactly; no default merge happens when a field is explicitly set.

### TC-T001-06: Config read error fails open to defaults

- **Test ID**: TC-T001-06
- **Test type**: Negative / error path
- **Trace**: FR-003 (error handling per Article X)
- **Given** the underlying config reader throws an error on access (fixture: mocked reader that throws `Error('ENOENT: no such file')` when cache is accessed).
- **When** `configService.getAtdd()` is called.
- **Then** the method does NOT throw.
- **And** the returned object equals `{ enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true }`.
- **Expected outcome**: Fail-open — Article X fail-safe defaults.

### TC-T001-07: Invalid field type fails open for that field only

- **Test ID**: TC-T001-07
- **Test type**: Negative / robustness (non-boolean value)
- **Trace**: FR-003 (per interface-spec.md invalid-values clause)
- **Given** `.isdlc/config.json` contains `"atdd": { "enabled": "yes", "require_gwt": false }`.
- **When** `configService.getAtdd()` is called.
- **Then** the returned object equals `{ enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: true }`.
- **And** the invalid `enabled` value falls back to its default (`true`).
- **And** the valid `require_gwt: false` override is retained.
- **Expected outcome**: Per-field fail-open — invalid types use defaults; valid overrides untouched.

### TC-T001-08: Idempotency / caching

- **Test ID**: TC-T001-08
- **Test type**: Positive / unit (caching)
- **Trace**: FR-003, NFR performance (<5ms)
- **Given** ConfigService is initialized with a valid atdd section.
- **When** `configService.getAtdd()` is called twice in the same process.
- **Then** both calls return equivalent objects.
- **And** the underlying config file is read at most once (verified via spy on the file-system reader).
- **Expected outcome**: Cached read — the method is idempotent within a process.

### TC-T001-09: CJS bridge passthrough parity

- **Test ID**: TC-T001-09
- **Test type**: Positive / integration between ESM and CJS bridge
- **Trace**: FR-003 (interface-spec.md "CJS bridge: getAtdd")
- **Given** a fixture config with `"atdd": { "track_red_green": false }`.
- **When** `require('src/core/bridge/config.cjs').getAtdd()` is called from a CJS consumer.
- **Then** the returned object equals `{ enabled: true, require_gwt: true, track_red_green: false, enforce_priority_order: true }`.
- **And** the object deep-equals what `ConfigService.getAtdd()` returns from the ESM path.
- **Expected outcome**: CJS bridge is a faithful passthrough — zero semantic drift between ESM and CJS callers.

### TC-T001-10: common.cjs::readAtddConfig passthrough parity

- **Test ID**: TC-T001-10
- **Test type**: Positive / unit (CJS helper)
- **Trace**: FR-003 (interface-spec.md "common.cjs::readAtddConfig")
- **Given** a fixture config with `"atdd": { "enabled": false }`.
- **When** `require('src/claude/hooks/lib/common.cjs').readAtddConfig()` is called from a hook.
- **Then** the returned object equals `{ enabled: false, require_gwt: true, track_red_green: true, enforce_priority_order: true }`.
- **Expected outcome**: Hook-helper passthrough is identical to the bridge result.

---

## T002: Hook config gating tests (unit tier, per-hook)

**Task**: T002 — Design test cases for hook config gating (5 hooks across knob states).
**Traces**: FR-005, FR-006, FR-007, FR-008, AC-005-01, AC-006-01, AC-007-01, AC-008-01.
**Test files**: extend existing per-hook test files in `src/claude/hooks/tests/` and `tests/core/validators/`.

### Hook 1: `atdd-completeness-validator.cjs`

Reads: `enabled`, `require_gwt`. Test file: `src/claude/hooks/tests/atdd-completeness-validator.test.cjs` (MODIFY).

#### TC-T002-01: Validator blocks on non-GWT AC when enabled and require_gwt are both true

- **Test ID**: TC-T002-01
- **Test type**: Positive / unit (blocking path)
- **Trace**: FR-005, AC-005-01
- **Given** `atdd = { enabled: true, require_gwt: true, ... }`.
- **And** a fixture `requirements-spec.md` containing an AC written as a bullet point without Given/When/Then structure (e.g., "AC-042-01: the system logs errors").
- **When** `atdd-completeness-validator.cjs` runs at Phase 05 entry.
- **Then** it exits with a block signal (non-zero exit code or structured block message per hooks-api-contract).
- **And** the error message names the offending AC id and explains the GWT requirement.
- **Expected outcome**: Phase 05 entry is blocked; user is told which AC to fix.

#### TC-T002-02: Validator passes through when enabled=true but require_gwt=false

- **Test ID**: TC-T002-02
- **Test type**: Positive / unit (soft-mode path)
- **Trace**: FR-005, AC-005-02
- **Given** `atdd = { enabled: true, require_gwt: false, ... }`.
- **And** the same non-GWT AC fixture from TC-T002-01.
- **When** the validator runs.
- **Then** it exits successfully (pass signal).
- **And** no block is emitted.
- **Expected outcome**: Soft-mode — non-GWT AC is tolerated when `require_gwt: false`.

#### TC-T002-03: Validator short-circuits when enabled=false (regardless of require_gwt)

- **Test ID**: TC-T002-03
- **Test type**: Positive / unit (kill switch)
- **Trace**: FR-008, AC-008-01
- **Given** `atdd = { enabled: false, require_gwt: true, ... }`.
- **And** the same non-GWT AC fixture.
- **When** the validator runs.
- **Then** it exits successfully without inspecting ACs.
- **And** no GWT check is performed (verified: the AC-parsing code path is not entered — use spy or coverage marker).
- **Expected outcome**: Master kill switch wins over sub-knob; validator is a no-op when disabled.

#### TC-T002-04: Validator passes when all ACs are GWT-formatted

- **Test ID**: TC-T002-04
- **Test type**: Positive / unit (happy path)
- **Trace**: FR-005
- **Given** `atdd = { enabled: true, require_gwt: true, ... }`.
- **And** a `requirements-spec.md` fixture where every AC follows the Given/When/Then structure.
- **When** the validator runs.
- **Then** it exits successfully.
- **Expected outcome**: Happy path — validator approves.

#### TC-T002-05: Validator fails open on config read error

- **Test ID**: TC-T002-05
- **Test type**: Negative / unit (fail-open)
- **Trace**: FR-008 (Article X)
- **Given** `readAtddConfig()` throws an error.
- **When** the validator is invoked.
- **Then** it falls back to defaults `{ enabled: true, require_gwt: true, ... }` and runs the GWT validation.
- **Expected outcome**: On config-read failure, validator behaves as if defaults were set (strict mode).

### Hook 2: `test-watcher.cjs`

Reads: `enabled`, `track_red_green`. Test file: `src/claude/hooks/tests/test-watcher.test.cjs` (MODIFY — or create if absent).

#### TC-T002-06: Watcher records RED→GREEN transition when enabled and track_red_green are both true

- **Test ID**: TC-T002-06
- **Test type**: Positive / unit
- **Trace**: FR-006, AC-006-01
- **Given** `atdd = { enabled: true, track_red_green: true, ... }`.
- **And** a test transitions from failing to passing (fixture: watcher input describes a test id moving from `failed` → `passed`).
- **When** test-watcher processes the transition event.
- **Then** one entry is appended to `atdd-checklist.json` with the transition timestamp and the test id.
- **And** the entry marks the transition as RED→GREEN.
- **Expected outcome**: Transition logged as expected.

#### TC-T002-07: Watcher skips transition logging when track_red_green=false (enabled=true)

- **Test ID**: TC-T002-07
- **Test type**: Positive / unit (sub-knob off)
- **Trace**: FR-006, AC-006-02
- **Given** `atdd = { enabled: true, track_red_green: false, ... }`.
- **And** a RED→GREEN transition event.
- **When** test-watcher processes the event.
- **Then** `atdd-checklist.json` is NOT written to (no new entry, file unchanged if it exists).
- **Expected outcome**: Transition-logging block is skipped.

#### TC-T002-08: Watcher skips all tracking when enabled=false

- **Test ID**: TC-T002-08
- **Test type**: Positive / unit (kill switch)
- **Trace**: FR-008, AC-008-03
- **Given** `atdd = { enabled: false, track_red_green: true, ... }`.
- **And** a RED→GREEN transition event.
- **When** test-watcher processes the event.
- **Then** no entry is written regardless of `track_red_green`.
- **Expected outcome**: Kill switch wins; sub-knob ignored.

### Hook 3: `post-bash-dispatcher.cjs`

Reads: `enabled`. Test file: `src/claude/hooks/tests/test-post-bash-dispatcher.test.cjs` (MODIFY).

#### TC-T002-09: Dispatcher invokes atdd-related dispatches when enabled=true

- **Test ID**: TC-T002-09
- **Test type**: Positive / unit
- **Trace**: FR-008 (reciprocal — dispatcher on)
- **Given** `atdd = { enabled: true, ... }`.
- **And** a post-bash event that would normally trigger an ATDD dispatch (fixture: bash output matching the existing dispatch trigger).
- **When** the dispatcher runs.
- **Then** the atdd-related dispatch fires (verified via spy or dispatch-log capture).
- **Expected outcome**: Default-on behavior — dispatcher forwards atdd events.

#### TC-T002-10: Dispatcher skips atdd dispatches when enabled=false

- **Test ID**: TC-T002-10
- **Test type**: Positive / unit (kill switch)
- **Trace**: FR-008, AC-008-01
- **Given** `atdd = { enabled: false, ... }`.
- **And** the same triggering bash event from TC-T002-09.
- **When** the dispatcher runs.
- **Then** the atdd dispatch is NOT invoked.
- **And** non-atdd dispatches (if any) continue to fire normally.
- **Expected outcome**: Kill switch disables atdd dispatching only; other dispatches unaffected.

### Hook 4: `checkpoint-router.js`

Reads: `enabled`, `enforce_priority_order`. Test file: `tests/core/validators/checkpoint-router.test.js` (MODIFY).

#### TC-T002-11: Router blocks out-of-order test pass when enforce_priority_order=true

- **Test ID**: TC-T002-11
- **Test type**: Positive / unit (blocking)
- **Trace**: FR-007, AC-007-01
- **Given** `atdd = { enabled: true, enforce_priority_order: true, ... }`.
- **And** a checkpoint state where a P1 test is passing but a P0 test is still failing.
- **When** `checkpoint-router.js` evaluates progress.
- **Then** it returns a block result.
- **And** the block message names the out-of-order violation (P1 passing before P0).
- **Expected outcome**: Priority order enforced; P0-before-P1 rule violated → blocked.

#### TC-T002-12: Router accepts any order when enforce_priority_order=false

- **Test ID**: TC-T002-12
- **Test type**: Positive / unit (soft-mode)
- **Trace**: FR-007, AC-007-02
- **Given** `atdd = { enabled: true, enforce_priority_order: false, ... }`.
- **And** the same out-of-order state from TC-T002-11 (P1 passing, P0 failing).
- **When** checkpoint-router evaluates progress.
- **Then** it returns an accept result.
- **Expected outcome**: Priority enforcement disabled; any order works.

#### TC-T002-13: Router accepts any order when enabled=false (regardless of enforce_priority_order)

- **Test ID**: TC-T002-13
- **Test type**: Positive / unit (kill switch)
- **Trace**: FR-008, AC-008-03
- **Given** `atdd = { enabled: false, enforce_priority_order: true, ... }`.
- **And** the same out-of-order state.
- **When** checkpoint-router evaluates progress.
- **Then** it returns accept.
- **Expected outcome**: Master kill switch disables priority enforcement; sub-knob ignored.

#### TC-T002-14: Router accepts P0→P1→P2→P3 canonical order when enforce_priority_order=true

- **Test ID**: TC-T002-14
- **Test type**: Positive / unit (happy path)
- **Trace**: FR-007
- **Given** `atdd = { enabled: true, enforce_priority_order: true, ... }`.
- **And** a state where P0 passes first, then P1, then P2, then P3.
- **When** checkpoint-router evaluates at each step.
- **Then** it accepts at every step.
- **Expected outcome**: Canonical ordering is always accepted.

### Hook 5: `common.cjs::readAtddConfig` passthrough

Reads: the atdd config object via the bridge. Test file: `src/claude/hooks/tests/test-common.test.cjs` (MODIFY).

#### TC-T002-15: readAtddConfig returns bridge result unchanged

- **Test ID**: TC-T002-15
- **Test type**: Positive / unit (helper parity)
- **Trace**: FR-003 (interface contract: common.cjs is a thin passthrough)
- **Given** `getAtdd()` from the bridge returns `{ enabled: true, require_gwt: false, track_red_green: true, enforce_priority_order: true }`.
- **When** a hook calls `readAtddConfig()` from `common.cjs`.
- **Then** the returned object is identical to the bridge result.
- **And** no fields are mutated or shadowed.
- **Expected outcome**: Helper is a pure passthrough.

#### TC-T002-16: readAtddConfig does not throw on bridge error

- **Test ID**: TC-T002-16
- **Test type**: Negative / unit (fail-open helper)
- **Trace**: FR-008 (Article X)
- **Given** the bridge `getAtdd()` throws an error.
- **When** a hook calls `readAtddConfig()`.
- **Then** the call does NOT throw.
- **And** the returned object is the all-true defaults.
- **Expected outcome**: Helper absorbs bridge errors and returns defaults (defense-in-depth).

---

## T003: Knob-interaction integration tests (integration tier)

**Task**: T003 — Design test cases for knob-interaction integration matrix (4 knobs × 2 states, core subset).
**Traces**: FR-005, FR-006, FR-007, FR-008, AC-005-02, AC-006-02, AC-007-02, AC-008-02, AC-008-03.
**Test file**: `tests/integration/atdd-config-knobs.test.js` (CREATE per tasks.md T025).

The full matrix is 2⁴ = 16 combinations. We test the 8-combination "core subset" below: all-default, all-disabled, four single-flipped states, and two combined-override states. Other combinations are redundant (combinations of already-tested knob pairs).

### Matrix coverage

| State | enabled | require_gwt | track_red_green | enforce_priority_order | Test ID |
|-------|---------|-------------|-----------------|------------------------|---------|
| S1 (all-default) | true | true | true | true | TC-T003-01 |
| S2 (master off) | false | true | true | true | TC-T003-02 |
| S3 (gwt off) | true | false | true | true | TC-T003-03 |
| S4 (tracking off) | true | true | false | true | TC-T003-04 |
| S5 (priority off) | true | true | true | false | TC-T003-05 |
| S6 (all sub-knobs off, master on) | true | false | false | false | TC-T003-06 |
| S7 (master off, sub-knobs on — precedence) | false | true | true | true | TC-T003-07 |
| S8 (all off) | false | false | false | false | TC-T003-08 |

### TC-T003-01: S1 — all defaults (canonical ATDD-on)

- **Test ID**: TC-T003-01
- **Test type**: Positive / integration (happy path)
- **Trace**: FR-005, FR-006, FR-007 (default behavior)
- **Given** `.isdlc/config.json` has no `atdd` section (or `atdd: {}`).
- **And** Phase 01 produced a `requirements-spec.md` with all GWT ACs.
- **And** a test suite with P0, P1, P2, P3 tests is run end-to-end.
- **When** Phase 05 → Phase 06 executes.
- **Then** atdd-completeness-validator passes (GWT ACs present).
- **And** atdd-checklist.json is created by Phase 05 and updated during Phase 06.
- **And** RED→GREEN transitions are recorded in atdd-checklist.json.
- **And** checkpoint-router blocks when tests are out-of-order.
- **Expected outcome**: All ATDD behaviors active — canonical path.

### TC-T003-02: S2 — master kill switch (enabled=false)

- **Test ID**: TC-T003-02
- **Test type**: Positive / integration (kill-switch)
- **Trace**: FR-008, AC-008-01, AC-008-02, AC-008-03
- **Given** `.isdlc/config.json` has `"atdd": { "enabled": false }`.
- **And** a requirements-spec.md fixture (contents irrelevant — validator should not inspect).
- **When** Phase 05 runs.
- **Then** no `atdd-checklist.json` file is created.
- **And** no ATDD scaffolds are generated.
- **And** discover sub-phase 1d (atdd-bridge) is skipped if discover is invoked.
- **And** test-watcher skips RED→GREEN tracking.
- **And** checkpoint-router accepts any test order.
- **Expected outcome**: All ATDD behaviors disabled regardless of sub-knob values that remain at defaults.

### TC-T003-03: S3 — require_gwt off, other knobs on

- **Test ID**: TC-T003-03
- **Test type**: Positive / integration (soft-mode GWT)
- **Trace**: FR-005, AC-005-02
- **Given** `.isdlc/config.json` has `"atdd": { "require_gwt": false }`.
- **And** requirements-spec.md contains at least one non-GWT AC.
- **When** Phase 05 runs.
- **Then** atdd-completeness-validator does NOT block.
- **And** a best-effort scaffold is generated for the non-GWT AC.
- **And** the scaffold is flagged as `non_gwt: true` in atdd-checklist.json.
- **And** other ATDD behaviors (tracking, priority-order) remain active at their defaults.
- **Expected outcome**: Soft GWT — Phase 05 proceeds, flag recorded.

### TC-T003-04: S4 — track_red_green off, other knobs on

- **Test ID**: TC-T003-04
- **Test type**: Positive / integration
- **Trace**: FR-006, AC-006-02
- **Given** `.isdlc/config.json` has `"atdd": { "track_red_green": false }`.
- **And** tests transition RED→GREEN during Phase 06.
- **When** Phase 06 runs.
- **Then** no RED→GREEN transition entries are written to atdd-checklist.json.
- **And** Phase 05 still creates atdd-checklist.json with scaffolds.
- **And** priority-order enforcement remains active at its default (checkpoint-router still blocks out-of-order).
- **And** GWT validation remains active at its default.
- **Expected outcome**: Tracking disabled selectively; other behaviors intact.

### TC-T003-05: S5 — enforce_priority_order off, other knobs on

- **Test ID**: TC-T003-05
- **Test type**: Positive / integration
- **Trace**: FR-007, AC-007-02
- **Given** `.isdlc/config.json` has `"atdd": { "enforce_priority_order": false }`.
- **And** tests pass in non-canonical order (P1 before P0).
- **When** Phase 06 runs and checkpoint-router evaluates.
- **Then** checkpoint-router accepts the state.
- **And** atdd-checklist.json is still created and updated.
- **And** RED→GREEN tracking is still recorded (default-on).
- **And** GWT validation still active at its default.
- **Expected outcome**: Priority enforcement off; other behaviors intact.

### TC-T003-06: S6 — all sub-knobs off, master on

- **Test ID**: TC-T003-06
- **Test type**: Positive / integration (combined override)
- **Trace**: FR-005, FR-006, FR-007, AC-005-02, AC-006-02, AC-007-02
- **Given** `.isdlc/config.json` has `"atdd": { "enabled": true, "require_gwt": false, "track_red_green": false, "enforce_priority_order": false }`.
- **And** a mix of GWT and non-GWT ACs in requirements-spec.md.
- **And** tests run with out-of-order transitions.
- **When** the full Phase 05 → Phase 06 flow executes.
- **Then** atdd-completeness-validator does NOT block on non-GWT ACs (soft GWT).
- **And** no RED→GREEN transitions are written (tracking off).
- **And** checkpoint-router accepts any test order (priority off).
- **And** atdd-checklist.json IS still created (because `enabled: true`) but contains only scaffolds, no transition log.
- **Expected outcome**: Master-on, all sub-knobs off — ATDD infrastructure active but all runtime checks relaxed.

### TC-T003-07: S7 — master off, sub-knobs on (precedence rule)

- **Test ID**: TC-T003-07
- **Test type**: Positive / integration (precedence verification)
- **Trace**: FR-008, AC-008-03
- **Given** `.isdlc/config.json` has `"atdd": { "enabled": false, "require_gwt": true, "track_red_green": true, "enforce_priority_order": true }`.
- **And** a fixture identical to TC-T003-01 (GWT ACs, P0-P3 tests).
- **When** the full Phase 05 → Phase 06 flow executes.
- **Then** no atdd-checklist.json is created (enabled wins).
- **And** no scaffolds are generated.
- **And** RED→GREEN tracking is skipped (enabled wins over `track_red_green: true`).
- **And** checkpoint-router accepts any test order (enabled wins over `enforce_priority_order: true`).
- **And** discover sub-phase 1d is skipped if invoked.
- **Expected outcome**: Precedence verified — `enabled: false` overrides every sub-knob, even when sub-knobs are explicitly true.

### TC-T003-08: S8 — all off (explicit full-disable)

- **Test ID**: TC-T003-08
- **Test type**: Positive / integration (equivalent to S2 with explicit zeros)
- **Trace**: FR-008
- **Given** `.isdlc/config.json` has all four knobs explicitly false.
- **When** the flow executes with arbitrary fixtures.
- **Then** behavior is identical to TC-T003-02 (S2 kill switch).
- **And** no new artifacts are created, no tracking occurs, no order enforced.
- **Expected outcome**: Redundant-but-explicit full-disable — behaves identically to master-off.

### Integration-tier cross-cutting concerns

#### TC-T003-09: Config reload across process boundaries

- **Test ID**: TC-T003-09
- **Test type**: Positive / integration
- **Trace**: FR-003 (cache behavior)
- **Given** a config with `atdd.enabled: true`, and a running Phase 05 process that has cached the config.
- **And** the config file is modified mid-run to `atdd.enabled: false`.
- **When** Phase 06 is invoked as a fresh process.
- **Then** Phase 06 reads the new config and observes `enabled: false`.
- **Expected outcome**: Cache is per-process; cross-process config changes are picked up.

#### TC-T003-10: ATDD_CONFIG injection into delegation prompts

- **Test ID**: TC-T003-10
- **Test type**: Positive / integration (prompt injection contract)
- **Trace**: FR-004, AC-004-03
- **Given** a config with `"atdd": { "require_gwt": false, "track_red_green": true, "enforce_priority_order": false }`.
- **When** the phase-loop-controller builds the Phase 05 delegation prompt.
- **Then** the prompt contains an `ATDD_CONFIG` block with `enabled: true`, `require_gwt: false`, `track_red_green: true`, `enforce_priority_order: false`.
- **And** the same values are injected into the Phase 06 delegation prompt.
- **Expected outcome**: Injection contract verified — agents receive exact config values without drift.

---

## Traceability

| FR | ACs | Tests |
|----|-----|-------|
| FR-003 | AC-003-01, AC-003-02 | TC-T001-01, -02, -03, -04, -05, -06, -07, -08, -09, -10 |
| FR-004 | AC-004-03 | TC-T003-10 |
| FR-005 | AC-005-01, AC-005-02 | TC-T002-01, TC-T002-02, TC-T003-03, TC-T003-06 |
| FR-006 | AC-006-01, AC-006-02 | TC-T002-06, TC-T002-07, TC-T003-04, TC-T003-06 |
| FR-007 | AC-007-01, AC-007-02 | TC-T002-11, TC-T002-12, TC-T002-14, TC-T003-05, TC-T003-06 |
| FR-008 | AC-008-01, AC-008-02, AC-008-03 | TC-T002-03, TC-T002-08, TC-T002-10, TC-T002-13, TC-T003-02, TC-T003-07, TC-T003-08 |

**Coverage summary**: 36 test cases total — 10 unit (T001) + 16 unit (T002) + 10 integration (T003). Every AC in requirements-spec.md is traced to at least one test case; every FR that declares behavior is covered by at least one unit test and at least one integration test (except FR-003 which is unit-only by design — integration coverage is indirect through TC-T003-10).
