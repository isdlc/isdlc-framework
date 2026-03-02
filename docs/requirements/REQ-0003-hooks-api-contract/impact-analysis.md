# Impact Analysis: REQ-0003 Hooks API Contract

## Affected Files

### Primary Changes (will be modified)
| File | Change Type | Risk |
|------|-------------|------|
| `src/claude/hooks/lib/common.cjs` | Add `validateSchema()`, `loadSchema()` | Medium -- core shared lib |
| `src/claude/hooks/gate-blocker.cjs` | Add schema validation calls, verify canonical fields | High -- gate enforcement |
| `src/claude/hooks/constitution-validator.cjs` | Add schema validation call | Low |
| `src/claude/hooks/iteration-corridor.cjs` | Add schema validation call | Low |
| `src/claude/hooks/menu-tracker.cjs` | Add schema validation call | Low |
| `src/claude/hooks/test-watcher.cjs` | Add schema validation call | Low |

### New Files
| File | Purpose |
|------|---------|
| `src/claude/hooks/config/schemas/constitutional-validation.schema.json` | Schema for constitutional_validation subsystem |
| `src/claude/hooks/config/schemas/interactive-elicitation.schema.json` | Schema for interactive_elicitation subsystem |
| `src/claude/hooks/config/schemas/test-iteration.schema.json` | Schema for test_iteration subsystem |
| `src/claude/hooks/config/schemas/skill-usage-entry.schema.json` | Schema for skill_usage_log entries |
| `src/claude/hooks/config/schemas/pending-delegation.schema.json` | Schema for pending_delegation |
| `src/claude/hooks/config/schemas/hook-stdin-pretooluse.schema.json` | Schema for PreToolUse stdin |
| `src/claude/hooks/config/schemas/hook-stdin-posttooluse.schema.json` | Schema for PostToolUse stdin |
| `src/claude/hooks/config/schemas/hook-stdin-stop.schema.json` | Schema for Stop hook stdin |
| `src/claude/hooks/tests/schema-validation.test.cjs` | Tests for schema validator |
| `docs/isdlc/hooks-api-contract.md` | API contract documentation |

### Documentation Updates
| File | Change |
|------|--------|
| `src/claude/agents/sdlc/sdlc.md` | Update state.json field name examples |

## Blast Radius

- **Hook subsystem only** -- no changes to CLI (bin/isdlc.js, lib/), installer, or agents beyond sdlc.md
- **CJS only** -- all hook files are .cjs, no ESM changes
- **No config format changes** -- iteration-requirements.json and workflows.json unchanged
- **No settings.json changes** -- hook registrations unchanged

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| gate-blocker regression | Medium | High | Comprehensive test coverage, existing 24 tests as baseline |
| common.cjs size increase | Low | Low | validateSchema is ~50 lines, well within limits |
| Schema file loading performance | Low | Low | Cached after first load, < 1ms |
| Agent writes wrong field names | Low | Medium | Schema validation + fail-open + clear docs |
