# Design Summary: REQ-GH-253

**7 new modules** in src/core/roundtable/: state-machine.js, definition-loader.js, state-card-composer.js, task-card-composer.js, rolling-state.js, trailer-parser.js, markers/ (6 extractors + index).

**3 definition files** in src/isdlc/config/roundtable/: core.json (shared invariants), analyze.json (analyze state graph), bug-gather.json (bug state graph). Plus state-cards/ and task-cards/ template directories. All overridable per REQ-GH-213 ADR-007.

**Handler restructure**: isdlc.md analyze step 7 and bug-gather step 6.5d restructured to drive composition loop. Fail-open fallback to prose protocol preserved.

**State card cadence**: one card at state boundary (conversation/confirmation sub-states/finalization); optional lightweight rolling header within long conversation phase.

**Task card composition**: queries existing REQ-0022 manifest, applies user-configurable max_skills_total budget (default 8, stored in .isdlc/config.json), renders per delivery_type.

**Existing modules changed**: compliance/engine.cjs (gains bucket-2 rules), config-service.js (getRoundtableConfig), config.cjs bridge, skill manifest schema (additive field), Claude + Codex runtimes (card string consumer). Phase-loop controller unchanged.

**External delegation**: declarative external_delegation field on state transitions handles bug-gather tracing dispatch.
