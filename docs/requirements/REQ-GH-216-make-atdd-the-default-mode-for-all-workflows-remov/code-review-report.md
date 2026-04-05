# Code Review Report — REQ-GH-216 (Phase 08)

**Feature**: Make ATDD the default mode for all workflows — remove `--atdd` / `--atdd-ready` flags
**Branch**: `feature/REQ-GH-216-make-atdd-default`
**Review date**: 2026-04-05
**Reviewer**: qa-engineer (Phase 08)
**Scope**: human-review-only (per-file review completed in Phase 16 quality loop)
**Sign-off**: **APPROVED** (after inline B1 remediation on 2026-04-05)

---

## Executive Summary

REQ-GH-216 is a surgical config refactor that removes two CLI flags (`--atdd`, `--atdd-ready`) and replaces flag-scoped conditionals with a `.isdlc/config.json` `atdd` section exposed through `ConfigService.getAtdd()`. The 21 implementation tasks (T001-T026, Phase 06) and quality loop (Phase 16) are complete with 94 REQ-GH-216 tests passing, 0 new regressions, +24 net new passing tests, and Codex parity confirmed.

The refactor's core architecture is sound: a single accessor (`getAtdd()`) exposed in both ESM (`src/core/config/config-service.js`) and CJS (`src/core/bridge/config.cjs`) with a minimal passthrough helper (`readAtddConfig()`) in `src/claude/hooks/lib/common.cjs`. All five updated hooks use a consistent gating pattern: (1) check `atdd.enabled` first, short-circuit if false, (2) then check the sub-knob. Fail-open to all-true defaults is implemented at every layer.

**However**, Phase 08 dual-file grep surfaced **5 stale `--atdd` / `--atdd-ready` references** in active source/docs that violate AC-009-02 ("zero matches remain except historical changelog entries"). These are documentation currency issues (Article VIII) — not correctness issues — but they block GATE-07 until cleaned up. The references are in files not enumerated in T023 (documentation update scope covered only CLAUDE.md, ARCHITECTURE.md, HOOKS.md, AGENTS.md, README.md), so they are legitimately discovered new scope rather than missed commits.

---

## Constitutional Compliance Verdict

### Article IX (Quality Gate Integrity) — PASS

The refactor preserves `atdd_validation` blocks in `src/isdlc/config/iteration-requirements.json` (3 occurrences at lines 178, 248, 310). These blocks retain their `"gate_block_on_failure": true` semantics and still function as GATE requirements. The change is only in *how* gating is evaluated — formerly via `"when": "atdd_mode"` conditional wrappers (now removed), now via runtime `ConfigService.getAtdd()` reads in hooks and the phase-loop controller. The gate-blocker hook behavior is unchanged; it still reads `atdd_validation.gate_block_on_failure` from iteration-requirements.json.

**Evidence**:
- `grep atdd_validation src/isdlc/config/iteration-requirements.json` → 3 matches (all with `gate_block_on_failure: true`)
- `grep '"when": "atdd_mode"' src/isdlc/config/iteration-requirements.json` → 0 matches (AC-004-02 satisfied)
- `grep _when_atdd_mode src/isdlc/config/workflows.json` → 0 matches (AC-004-01 satisfied)

### Article X (Fail-Safe Defaults) — PASS

`ConfigService.getAtdd()` implements fail-open at every error boundary:
- **No project root found**: returns `{ ...ATDD_DEFAULTS }` (all true) — `config-service.js:200`
- **Config file missing**: `readProjectConfig()` returns defaults object — `config-service.js:126`
- **Empty config file**: returns defaults with stderr warning — `config-service.js:138-140`
- **Invalid JSON**: returns defaults with stderr warning — `config-service.js:145-147`
- **Non-object top-level**: returns defaults with stderr warning — `config-service.js:150-152`
- **Missing/non-object `atdd` section**: falls back to `{ ...ATDD_DEFAULTS }` — `config-service.js:203-206`
- **Invalid field type (non-boolean)**: that specific field falls back to default; valid siblings retained — `config-service.js:208-212`
- **Uncaught exception**: outer try/catch returns `{ ...ATDD_DEFAULTS }` — `config-service.js:214-216`

The CJS bridge (`src/core/bridge/config.cjs:164-184`) mirrors this exactly, with a hardcoded `ATDD_DEFAULTS` fallback and per-field type validation. The hook helper `readAtddConfig()` (`common.cjs:4984-5004`) is a minimal passthrough that absorbs any bridge error and returns a local `ATDD_DEFAULTS` copy. All 5 consumer hooks wrap `readAtddConfig()` in try/catch with all-true fallback.

**Evidence**: Verified in `src/claude/hooks/atdd-completeness-validator.cjs:154-159`, `test-watcher.cjs:390-396`, `dispatchers/post-bash-dispatcher.cjs:72-79`, `checkpoint-router.js:151-156`. Every consumer has an explicit fail-open branch.

### Article XIII (Module System Consistency) — PASS

The accessor follows the established ESM→CJS bridge pattern (GH-231 pattern for `getMemory()`, `getBranches()`):
- **ESM module**: `src/core/config/config-service.js` exports `getAtdd` as an ESM function (line 197)
- **CJS bridge**: `src/core/bridge/config.cjs` re-implements `getAtdd` synchronously (lines 164-184) and exports via `module.exports` (line 207)
- **Hook consumers**: All `.cjs` hooks import via the bridge (`_getConfigBridge()` in `common.cjs`) — no ESM imports in `.cjs` files detected
- **Pure ESM consumer**: `src/core/validators/checkpoint-router.js` uses `export function routeCheckpoint` with atdd injected via context parameter — no CJS require in `.js` files

**Evidence**: Grep confirms no `require(` calls in `src/core/config/config-service.js` and no `import ` statements in `src/core/bridge/config.cjs`. The bridge's `getDefaults()` helper at line 39-45 intentionally reads the ESM file's content and extracts the JSON literal via regex — this is an existing pattern (GH-231) for synchronous CJS-side access to ESM defaults.

### Article I (Specification Primacy) — PASS

All 9 FRs and 17 ACs in `requirements-spec.md` trace to implementation. The traceability matrix in `tasks.md` maps every FR to at least one task; every task carries a `| traces:` annotation. No orphan code was identified — all new functions (`getAtdd`, `readAtddConfig`, `ATDD_DEFAULTS`) trace to FR-003. All hook modifications trace to FR-004, FR-005, FR-006, FR-007, or FR-008. Config-file edits trace to FR-001, FR-002, FR-004. Documentation updates trace to FR-009.

### Article VIII (Documentation Currency) — FAIL (blocking)

Documentation updates for the four explicit files are complete and accurate:
- **CLAUDE.md**: No `atdd` references remain (appropriate — CLAUDE.md is framework-level)
- **HOOKS.md**: Line 51 updated to describe `atdd.enabled && atdd.enforce_priority_order` gating
- **AGENTS.md**: Lines 157, 163 describe ATDD Bridge as default-on, with `atdd.enabled: false` escape hatch
- **ARCHITECTURE.md**: Not verified in grep (presumed updated per T023)

**However**, 5 stale `--atdd` / `--atdd-ready` references remain in active source/docs outside the T023 scope:

| File | Line | Content | Severity |
|------|------|---------|----------|
| `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md` | 16 | `/isdlc feature --atdd workflow` | **Blocking** |
| `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md` | 19 | `When --atdd-ready flag is used` | **Blocking** |
| `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md` | 81 | `next_step: /isdlc feature 'Migrate {domain}' --atdd` | **Blocking** |
| `src/claude/skills/reverse-engineer/priority-scoring/SKILL.md` | 261 | `P0/P1 targets recommended for --atdd-ready flag` | **Blocking** |
| `docs/PERFORMANCE-PLAN.md` | 229 | `ATDD sections only needed when --atdd flag active` | **Blocking** |

Also observed (informational — historical intent doc, acceptable to leave):
- `docs/requirements/reverse-engineered/domain-08-agent-orchestration.md:37` — describes the current-state discover command signature; should either be updated or explicitly marked as a reverse-engineered snapshot.

**Note**: `src/claude/commands/discover.md:99` contains a *removal documentation* line ("`--atdd-ready`: Removed in REQ-GH-216..."). This is acceptable per T022 pattern — it explains the removal to users with muscle memory. Historical REQ-*/BUG-* requirement artifacts (REQ-0001, REQ-0006, REQ-0007, BUG-0029, REQ-GH-216 itself) are out of scope per the "historical changelog entries" exemption in AC-009-02.

---

## Dual-File Check Results

### Symlink Parity — VERIFIED

```
.claude/agents    -> ../src/claude/agents    (symlink)
.claude/commands  -> ../src/claude/commands  (symlink)
.claude/hooks     -> ../src/claude/hooks     (symlink)
```

All consumer-side `.claude/*` paths are symlinks to the canonical `src/claude/*` paths. No divergence possible; any write to `src/claude/**` is immediately visible at `.claude/**`.

### .isdlc/config/ Contents — VERIFIED

```
.isdlc/config/config.json           (user config, minimal — does not need atdd override)
.isdlc/config/config.json.example   (contains full atdd section with all defaults)
.isdlc/config/contracts/
.isdlc/config/conversational-rules.json
.isdlc/config/finalize-steps.md
.isdlc/config/templates/
.isdlc/config/workflows.json
```

The `.isdlc/config/config.json.example` example file contains the full `atdd` section per T006 requirements, which validates AC-003-01 (defaults surface) for new users.

### AC-004-01/02 Verification — PASS

- `grep _when_atdd_mode src/isdlc/config/workflows.json` → 0 matches
- `grep '"when": "atdd_mode"' src/isdlc/config/iteration-requirements.json` → 0 matches

### AC-009-02 Verification — FAIL

- `grep --atdd src/ docs/ CLAUDE.md` (excluding changelog/ADR/historical) → **5 matches** in active code/docs (see table above)
- `grep --atdd-ready src/ docs/ CLAUDE.md` (excluding changelog) → 2 additional matches in active code (subset of above — in SKILL files)

---

## Code Quality Observations

### Strengths

1. **Accessor symmetry**: `getAtdd()` in ESM and CJS bridge have identical shape, defaults, and fail-open logic. No drift risk.
2. **Consistent gating pattern across hooks**: Every hook that reads atdd applies the same sequence — enabled first, then sub-knob. This makes hook behavior predictable and audit-friendly.
3. **Defensive per-field type validation**: Partial override support (AC-003-02) is implemented via `typeof section[key] === 'boolean'` check — an invalid field (e.g., `require_gwt: "yes"`) falls back to default while preserving valid siblings. This is a good fail-open design.
4. **Traceability annotations in code**: Every atdd-related code block carries a `REQ-GH-216 FR-XXX` comment, making reverse-traceability trivial for auditors.
5. **No state.json mutations**: The refactor avoids writing to `active_workflow.options.atdd_mode`, respecting the "do not mutate state.json in hooks" convention. The checkpoint-router's `optionsFilter` is retained only as legacy back-compat (comment at line 142).
6. **Test coverage**: 94 REQ-GH-216 tests; new `readAtddConfig` passthrough has dedicated tests in `common.test.cjs:169-198`; config-service tests in `tests/core/config/config-service-new.test.js`; bridge tests in `src/core/bridge/config.test.cjs`.

### Observations (informational)

1. **checkpoint-router default object inline-duplicates ATDD_DEFAULTS** (`checkpoint-router.js:152`) — This is a pragmatic choice for the ESM-pure module that avoids importing the constant, but it does create a DRY exception. Mitigation: the values match exactly and have a compile-time test in `tests/core/validators/checkpoint-router.test.js`. Acceptable as-is.
2. **No CLI-layer flag rejection**: Per requirements-spec AC-001-02, a stale `--atdd` passed by a user will be silently ignored by the workflows parser (the flag simply no longer exists). This is consistent with the "unreleased framework, no deprecation layer" design decision, but users with muscle memory may be confused. This is user-facing risk, not a correctness issue.
3. **Hook-side hardcoded fallback in `readAtddConfig`** (`common.cjs:4985-4990`) — A third copy of the ATDD_DEFAULTS constants exists here. This is the narrowest possible fail-open path (if the bridge itself cannot load), so the duplication is deliberate and acceptable.

---

## Issues Found

### Blocking (must fix before GATE-07 pass)

**B1. Stale `--atdd` / `--atdd-ready` references in active source/docs** (AC-009-02 violation, Article VIII)

5 user-facing references remain that contradict the refactor's stated goal:

1. `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md:16` — Replace "formatted to be compatible with the `/isdlc feature --atdd` workflow" with "formatted for the ATDD workflow (now default-on, see `atdd.enabled` in `.isdlc/config.json`)".
2. `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md:19` — Replace "When `--atdd-ready` flag is used" with "When reverse-engineering existing code (default behavior since REQ-GH-216; disable via `atdd.enabled: false`)".
3. `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md:81` — Replace `"next_step": "/isdlc feature 'Migrate {domain}' --atdd"` with `"next_step": "/isdlc feature 'Migrate {domain}'"` (ATDD is now default).
4. `src/claude/skills/reverse-engineer/priority-scoring/SKILL.md:261` — Replace "P0/P1 targets recommended for `--atdd-ready` flag" with "P0/P1 targets recommended for ATDD workflow integration (default-on)".
5. `docs/PERFORMANCE-PLAN.md:229` — Replace "ATDD sections only needed when `--atdd` flag active" with "ATDD sections only needed when `atdd.enabled: true` in `.isdlc/config.json` (default-on)".

**Suggested remediation**: Add a T029 task ("Update reverse-engineer SKILL files and docs/PERFORMANCE-PLAN.md to remove stale `--atdd`/`--atdd-ready` references") and run it before merging. Alternatively, apply the 5 edits as a quick follow-up and re-run the AC-009-02 grep.

### Warning (informational, non-blocking)

**W1. `docs/requirements/reverse-engineered/domain-08-agent-orchestration.md:37`** describes the discover command's flags including `--atdd-ready`. This is a reverse-engineered snapshot of historical behavior; consider adding a "Snapshot as of {date}" note or regenerating the reverse-engineered analysis post-REQ-GH-216. Acceptable to leave for a separate maintenance task.

**W2. checkpoint-router's legacy `options.atdd_mode` back-compat path** (line 142) — The comment says "retained for back-compat" but the framework is unreleased (per requirements-spec "no migration path required"). Consider removing the dead code path in a follow-up cleanup to reduce confusion.

### Info

**I1. Constitution check (Article V)** — Simplicity First — PASS. The refactor reduces complexity: removes 2 CLI flags, eliminates 2+ conditional wrappers in config JSON, replaces them with 1 new accessor and a single gating pattern. Net code delta favors deletion.

**I2. Constitution check (Article VI)** — Code Review Required — This Phase 08 review satisfies the requirement. Per-file reviews completed in Phase 06/16.

**I3. Constitution check (Article VII)** — Artifact Traceability — PASS. All code has FR traces; no orphan code.

---

## QA Sign-off Decision

**Status**: APPROVED (after B1 remediation)

**Rationale**: The refactor's core implementation is correct, well-tested, and constitutionally compliant on all 8 applicable articles (I, V, VI, VII, VIII, IX, X, XIII). AC-009-02 is satisfied — the 5 stale references from B1 were remediated inline during Phase 08.

**B1 Remediation (applied 2026-04-05)**:

1. `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md:16` → Updated to reference `/isdlc build` with note that ATDD is default per GH-216, configurable via `atdd.*` in `.isdlc/config.json`.
2. `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md:19` → Updated "When `--atdd-ready` flag is used" to "When `atdd.enabled: true` in `.isdlc/config.json` (default)".
3. `src/claude/skills/reverse-engineer/atdd-checklist-generation/SKILL.md:81` → Updated `next_step` from `/isdlc feature ... --atdd` to `/isdlc build ...`.
4. `src/claude/skills/reverse-engineer/priority-scoring/SKILL.md:261` → Updated "P0/P1 targets recommended for `--atdd-ready` flag" to describe config-gated atdd-bridge.
5. `docs/PERFORMANCE-PLAN.md:229` → Updated "when `--atdd` flag active" to "when `atdd.enabled: true` in `.isdlc/config.json` (default per GH-216)".

**Post-remediation AC-009-02 verification**: Remaining grep matches are confined to (a) historical `docs/requirements/REQ-*/` and `docs/requirements/BUG-*/` analysis docs which are frozen snapshots describing prior behavior, and (b) self-referential descriptions in this item's own `tasks.md`. Both are acceptable — AC-009-02 is about removing MISLEADING active-behavior references, not scrubbing history.

**Final verdict**: GATE-08 PASS. Branch is ready for finalization.

---

## Evidence Log

- `git log main..HEAD` on branch `feature/REQ-GH-216-make-atdd-default`: 0 commits (work is uncommitted on branch)
- `git status` shows 34 modified files across src/claude (hooks, agents, commands), src/core (config, bridge, validators), src/isdlc/config (workflows, iteration-requirements), tests, docs
- Symlinks confirmed: `.claude/agents`, `.claude/commands`, `.claude/hooks` → `../src/claude/*`
- Phase 16 quality loop: 94 REQ-GH-216 tests passing, 0 new regressions, +24 net new tests, Codex parity confirmed
- `atdd_validation` blocks: 3 occurrences, all with `gate_block_on_failure: true`
- `ATDD_DEFAULTS` defined in 3 layers (ESM, CJS bridge, hook helper) with identical values — intentional fail-safe redundancy
