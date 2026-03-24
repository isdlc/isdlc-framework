# Codex session cache re-priming after clear/resume

## Source
- GitHub Issue: #204
- Created by: Codex (local repo analysis validating parity)

## Description
Claude Code restores session cache after context clears because SessionStart re-runs inject-session-cache.cjs. Codex has no equivalent runtime re-priming surface. After clear/resume, Codex loses constitution/workflow/skills/roundtable context that Claude gets automatically.

## Existing Machinery
- Cache builder: `rebuildSessionCache()` in common.cjs
- Manual rebuild CLI: `bin/rebuild-cache.js` (54 lines)
- Claude injector: `src/claude/hooks/inject-session-cache.cjs` (25 lines — reads .isdlc/session-cache.md, outputs to stdout)
- Antigravity priming helper: `src/antigravity/prime-session.cjs` (70 lines — rebuild + output)
- Cache artifact: `.isdlc/session-cache.md`

## What's Missing
Codex-side equivalent of: trigger on session start/resume/clear → read cache → re-project into context.
