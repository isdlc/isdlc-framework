# Impact Analysis: Simplify /discover Command Menu

**ID**: REQ-0001
**Phase**: 02 - Impact Analysis
**Generated**: 2026-02-08
**Scope Estimate**: Small (3 files changed, 1 example-only update)

---

## 1. Change Summary

| Change Type | Count | Risk |
|-------------|-------|------|
| Menu replacement (4 -> 3 options) | 2 files | Low |
| CLI flag removal (--scope, --target, --priority) | 2 files | Low |
| New flow addition (Chat/Explore) | 2 files | Low |
| Sub-agent parameter cleanup | 1 file | Low |
| Example-only update | 1 file | None |

## 2. Affected Files (Definitive)

### Must Change

| # | File | Lines Affected | Change Description |
|---|------|---------------|-------------------|
| 1 | `src/claude/commands/discover.md` | ~60 lines | Replace menu (L20-40), remove --scope/--target/--priority from options table (L63-65), remove scope examples (L84-93), update implementation note (L170) |
| 2 | `src/claude/agents/discover-orchestrator.md` | ~60 lines | Replace menu presentation (L106-123), update selection mapping table (L127-132), remove Option [4] follow-up (L134-151), add Chat/Explore flow section, update NO-ARGUMENT MENU guard (L97) |
| 3 | `src/claude/agents/discover/feature-mapper.md` | ~3 lines | Remove --scope/--target filtering note (L279), remove --scope/--target/--priority from command inventory example (L337) |

### Verified Unaffected

| File | Reason Verified |
|------|----------------|
| `src/claude/agents/discover/characterization-test-generator.md` | Grep: no --scope/--target references |
| `src/claude/agents/discover/artifact-integration.md` | Grep: no --scope/--target references |
| `src/claude/agents/discover/atdd-bridge.md` | Grep: no --scope/--target references |
| `.isdlc/config/workflows.json` | reverse-engineer workflow scope/target/priority: PRESERVE (AC-6.5) |
| `src/claude/agents/00-sdlc-orchestrator.md` | References /discover generically, not menu |
| `lib/cli.js`, `lib/installer.js` | Runtime JS, not menu-aware |
| All D1-D8 sub-agents (except D6) | Not menu-aware |

## 3. Dependency Graph

```
src/claude/commands/discover.md
  └── Defines: menu structure, CLI options, examples
  └── References: discover-orchestrator agent

src/claude/agents/discover-orchestrator.md
  └── Implements: menu presentation + selection routing
  └── Routes to: NEW PROJECT FLOW, EXISTING PROJECT FLOW, [NEW] CHAT/EXPLORE
  └── Delegates to: D1-D8 sub-agents (unchanged)

src/claude/agents/discover/feature-mapper.md
  └── Receives: --scope/--target from orchestrator (to be removed)
  └── All other behavior: unchanged
```

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Chat/Explore mode undefined behavior | Medium | Low | Define strict read-only boundary in orchestrator |
| --scope removal breaks reverse-engineer workflow | None | High | AC-6.5 explicitly preserves workflows.json reverse-engineer options |
| Menu numbering mismatch between command and orchestrator | Low | Medium | Single implementation pass, grep verification |
| Auto-detect logic disrupted | None | None | Auto-detect logic is in FAST PATH CHECK, downstream of menu -- untouched |

## 5. New Component: Chat / Explore Flow

This is the only net-new functionality. It requires a new section in the discover-orchestrator:

**Entry**: Menu Option [3]
**Behavior**: Conversational mode -- agent reads project artifacts on demand, answers questions
**Constraints**: Read-only (no state.json writes, no constitution generation, no skill installation)
**Exit**: User says "exit", "done", "back to menu", or starts a new /discover or /sdlc command
**Available context**: discovery report, constitution, state.json, CLAUDE.md, codebase files, workflow history

## 6. Testing Impact

Since all changes are markdown agent definitions (not runtime code):
- No unit tests to write or modify (markdown is not executed by test runner)
- Verification is structural: grep for old menu text, grep for removed flags
- E2E validation: invoke /discover and verify menu renders correctly (manual or future E2E)

## 7. Conclusion

This is a low-risk, small-scope change concentrated in 3 files. The blast radius is well-contained. No runtime code changes. The reverse-engineer workflow's scope/target/priority options are explicitly preserved.
