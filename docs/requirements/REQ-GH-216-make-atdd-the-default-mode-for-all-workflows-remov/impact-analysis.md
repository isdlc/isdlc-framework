# Impact Analysis: REQ-GH-216

## 1. Blast Radius

### Tier 1 — Direct Modifications

| File | Module | Change Type | Requirement Traces |
|------|--------|-------------|---------------------|
| src/core/config/config-service.js | core/config | MODIFY (add getAtdd() method) | FR-003 |
| src/core/bridge/config.cjs | core/bridge | MODIFY (CJS passthrough) | FR-003 |
| src/claude/hooks/lib/common.cjs | hooks/lib | MODIFY (add readAtddConfig helper) | FR-003 |
| src/isdlc/config/workflows.json | config | MODIFY (remove _when_atdd_mode, atdd_mode option) | FR-001, FR-004 |
| src/isdlc/config/iteration-requirements.json | config | MODIFY (remove when: atdd_mode guards) | FR-004 |
| src/claude/hooks/atdd-completeness-validator.cjs | hooks | MODIFY (config gating) | FR-005, FR-008 |
| src/claude/hooks/test-watcher.cjs | hooks | MODIFY (track_red_green gating) | FR-006 |
| src/claude/hooks/dispatchers/post-bash-dispatcher.cjs | hooks/dispatchers | MODIFY (enabled gating) | FR-008 |
| src/core/validators/checkpoint-router.js | core/validators | MODIFY (enforce_priority_order gating) | FR-007 |
| src/claude/agents/04-test-design-engineer.md | agents/phase | MODIFY (conditional removal) | FR-004, FR-005 |
| src/claude/agents/05-software-developer.md | agents/phase | MODIFY (conditional removal) | FR-004, FR-006, FR-007 |
| src/claude/agents/06-integration-tester.md | agents/phase | MODIFY (conditional removal) | FR-004 |
| src/claude/agents/discover-orchestrator.md | agents/discover | MODIFY (flag check → config check) | FR-002, FR-008 |
| src/claude/agents/discover/atdd-bridge.md | agents/discover | MODIFY (skip condition) | FR-002, FR-008 |
| src/claude/agents/discover/feature-mapper.md | agents/discover | MODIFY (flag reference removal) | FR-002 |
| src/claude/agents/discover/artifact-integration.md | agents/discover | MODIFY (flag reference removal) | FR-002 |
| src/claude/commands/discover.md | commands | MODIFY (flag docs removal) | FR-002 |
| src/claude/commands/isdlc.md | commands | MODIFY (phase-loop injection for atdd.*) | FR-003, FR-004 |
| CLAUDE.md | docs | MODIFY (config-driven docs) | FR-009 |
| docs/ARCHITECTURE.md | docs | MODIFY | FR-009 |
| docs/HOOKS.md | docs | MODIFY | FR-009 |
| docs/AGENTS.md | docs | MODIFY | FR-009 |

**Tier 1 summary**: 22 direct modifications.

### Tier 2 — Transitive Modifications

| File | Module | Impact | Change Type |
|------|--------|--------|-------------|
| src/claude/hooks/tests/atdd-completeness-validator.test.cjs | tests/hooks | Update expectations for config-driven gating | MODIFY |
| src/claude/hooks/tests/test-post-bash-dispatcher.test.cjs | tests/hooks | Update for enabled-gated dispatching | MODIFY |
| src/claude/hooks/tests/test-common.test.cjs | tests/hooks | Add readAtddConfig helper coverage | MODIFY |
| src/claude/hooks/tests/gate-requirements-injector.test.cjs | tests/hooks | Update for atdd.* injection block | MODIFY |
| src/claude/hooks/tests/cross-hook-integration.test.cjs | tests/hooks | Update for hook interaction | MODIFY |
| src/claude/hooks/tests/prune-functions.test.cjs | tests/hooks | Update for config-gated branches | MODIFY |
| tests/core/validators/checkpoint-router.test.js | tests/core | Update for enforce_priority_order gating | MODIFY |
| tests/core/state/paths.test.js | tests/core | Verify no regression from atdd paths | MODIFY |

**Tier 2 summary**: ~8 test files require expectation updates.

### Tier 3 — Potential Side Effects

| Area | Potential Impact | Risk Level |
|------|------------------|------------|
| Phase 05/06 delegation prompts | GATE REQUIREMENTS INJECTION gains an atdd.* block — prompt size grows by ~5 lines per delegation | Low |
| Existing `.isdlc/config.json` files in consumer projects | Missing `atdd` section is handled by defaults — no migration required | Low |
| atdd-checklist.json lifecycle | Now created unconditionally (was conditional on --atdd) — may create unexpected artifacts in workflows that didn't use ATDD | Low |
| discover performance | Sub-phase 1d runs by default on existing-project discovery — adds one more agent invocation per discover run | Low |

## 2. Entry Points

**Recommended starting point**: `src/core/config/config-service.js` — implement `getAtdd()` first, because it is the foundation every other change depends on.

**Rationale**: ConfigService access is the mechanism through which all hooks, agents, and the phase-loop controller will read `atdd.*` values. Implementing it first unblocks all tier-2 changes.

## 3. Implementation Order

| Order | Tasks | Description | Risk | Parallel | Depends On |
|-------|-------|-------------|------|----------|------------|
| 1 | T005, T008, T009, T016–T022, T024 | ConfigService.getAtdd() + config file edits + discover flow edits + docs (parallel tier 0) | Low | Yes | — |
| 2 | T006, T015 | CJS bridge + getAtdd unit tests | Low | Yes | T005 |
| 3 | T007, T010, T011, T012, T013, T014 | common.cjs helper + hook gating + checkpoint-router + phase-loop injection | Medium | Yes | T006 |
| 4 | T023 | Codex parity verification | Low | No | T008 |
| 5 | Phase 16 quality loop | Test execution + Claude/Codex parity | Medium | No | All tier 3 |
| 6 | Phase 08 code review | Constitutional review + dual-file check | Low | No | Phase 16 |

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|----|------|------|------------|--------|------------|
| R1 | ConfigService change breaks existing callers | core/config | Low | High | Use additive method (`getAtdd()`); do not modify existing accessors. Unit test existing accessors for regression. |
| R2 | Hook fails to fail-open on ConfigService error | hooks | Medium | High | Explicit try/catch with default-return in each hook; test error path for each hook. |
| R3 | atdd-checklist.json created in workflows that didn't expect it | per-feature folders | Medium | Low | Acceptable — checklist is small, informative, and consistent with ATDD-always-on model. |
| R4 | Phase 05 hard-block on non-GWT ACs breaks existing analyses that produced fuzzy ACs | Phase 05 | Medium | Medium | Documented escape hatch: `atdd.require_gwt: false`. Roundtable-analyst should enforce GWT in confirmation phase going forward. |
| R5 | Test-suite updates miss edge cases (16-state knob matrix) | tests | Medium | Medium | New integration tests explicitly cover knob-interaction matrix core states. |
| R6 | Documentation drift after refactor lands | docs | Low | Medium | Phase 08 dual-file check includes doc grep for stale `--atdd` references. |

## 5. Test Coverage Assessment

| Affected Module | Current Coverage | Post-Refactor Target |
|-----------------|------------------|----------------------|
| src/core/config/ (ConfigService) | ~85% | ~88% (add getAtdd() unit tests) |
| src/claude/hooks/ (atdd-aware hooks) | ~90% | ~90% (update expectations; no new coverage gaps) |
| src/core/validators/checkpoint-router.js | High | High (update existing tests) |
| Integration (knob matrix) | N/A | New test file: 16-state core coverage |

## 6. Summary

| Metric | Count |
|--------|-------|
| Tier 1 direct modifications | 22 |
| Tier 2 transitive modifications | 8 |
| Tier 3 side-effect areas | 4 |
| **Total files affected** | **34** |
| New files | 1 (integration test) |
| New modules | 0 |
| Risk zones identified | 6 |
| Overall risk level | **Medium** |

**Key concerns**: R1 (ConfigService regression), R2 (hook fail-open on error), R4 (AC quality tightening).

**Go/no-go**: **Go**. Scope is bounded, risks are mitigable, and the refactor directly addresses a known traceability gap (every AC has a corresponding test). The config-driven model provides escape hatches for edge cases.
