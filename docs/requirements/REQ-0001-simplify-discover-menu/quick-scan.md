# Quick Scan: Simplify /discover Command Menu

**Generated**: 2026-02-08T12:10:00Z
**Feature**: Simplify /discover command menu from 4 options to 3 (New Project, Existing Project Analysis, Chat/Explore)
**Phase**: 00-quick-scan

---

## Scope Estimate

**Estimated Scope**: Small (~5 files)
**File Count Estimate**: ~5 primary files, ~4 secondary references
**Confidence**: High

This is a UX/menu restructuring change concentrated in 2 primary markdown files (command definition and orchestrator agent). The change removes options, simplifies branching, and adds a new Chat/Explore mode. No runtime code (JS/CJS) changes required.

---

## Keyword Matches

### Domain Keywords
| Keyword | File Matches |
|---------|--------------|
| discover | 65 files (agents, skills, commands, hooks) |
| Discovery Mode Selection | 2 files (command + orchestrator) |
| auto-detect | 2 files (command + orchestrator) |
| Scoped Analysis | 2 files (command + orchestrator) |

### Technical Keywords
| Keyword | File Matches |
|---------|--------------|
| --scope / --target | 6 files (command, orchestrator, 4 sub-agents) |
| menu / selection | 2 files (command + orchestrator) |

---

## Relevant Modules

Based on discovery report and keyword search:

### Primary (must change)
- `src/claude/commands/discover.md` -- Command definition with 4-option menu, options table, examples
- `src/claude/agents/discover-orchestrator.md` -- Menu presentation, selection mapping, Option [4] follow-up, fast path check

### Secondary (may need updates)
- `src/claude/agents/discover/feature-mapper.md` -- References --scope/--target options
- `src/claude/agents/discover/characterization-test-generator.md` -- References --scope options
- `src/claude/agents/discover/artifact-integration.md` -- References --scope options
- `src/claude/agents/discover/atdd-bridge.md` -- References --scope options

### Unaffected
- `src/claude/agents/00-sdlc-orchestrator.md` -- References /discover but not the menu options
- `lib/cli.js`, `lib/installer.js` -- Runtime JS, references discover but not menu structure
- All other discover sub-agents (D1-D8) -- Not menu-aware

---

## Change Summary

1. **Remove**: Option [1] "Discover (auto-detect)" and Option [4] "Scoped Analysis"
2. **Renumber**: New Project becomes [1], Existing Project becomes [2]
3. **Add**: Option [3] "Chat / Explore" -- new conversational mode
4. **Simplify**: Remove --scope, --target, --priority CLI options (or deprecate)
5. **Preserve**: Auto-detect logic can run behind the scenes for "Recommended" badge

---

## Notes for Requirements

The following questions may help clarify scope:

1. Should the --scope, --target, and --priority CLI flags be removed entirely, or kept as hidden/advanced options?
2. What capabilities should Chat/Explore mode have? (read-only analysis, or can it modify state?)
3. Should auto-detect still run to pre-highlight the recommended option with a badge?
4. Does "Existing Project Analysis" need a "(Recommended)" suffix when an existing project is detected?

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-08T12:10:30Z",
  "keywords_searched": 6,
  "files_matched": 9,
  "scope_estimate": "small"
}
```
