# GH-218: Support bug-specific roundtable analysis in analyze command

**Source**: github
**Source ID**: GH-218
**URL**: https://github.com/vihang-hub/isdlc-framework/issues/218

## Problem

When a ticket is classified as a bug, the analyze command uses the `bug-gather-analyst` inline protocol — a lightweight Q&A flow that produces `bug-report.md` and `requirements-spec.md`. Feature tickets get the full roundtable conversation (Maya/Alex/Jordan) with rich multi-domain analysis.

Bugs deserve a similar depth of analysis but with different outputs tailored to diagnosis rather than design.

## Proposed Change

Add a bug-specific roundtable that mirrors the feature roundtable's conversational structure but produces bug-appropriate artifacts:

- **Maya (Business Analyst)**: Impact assessment, affected user journeys, severity classification, reproduction steps
- **Alex (Solutions Architect)**: Affected modules, blast radius, root cause hypotheses, regression risk
- **Jordan (System Designer)**: Fix approach options, interface/contract implications, test gap analysis

### Outputs (different from feature roundtable)
- `bug-report.md` — structured bug report with reproduction steps, severity, impact
- `root-cause-analysis.md` — hypotheses ranked by likelihood, affected code paths
- `fix-strategy.md` — proposed fix approaches with tradeoffs, regression risk assessment

### Flow
1. Bug classification gate (existing step 6.5) identifies the ticket as a bug
2. Instead of the lightweight bug-gather protocol, launch the bug roundtable
3. Same conversational loop as feature roundtable (open as Maya, codebase scan by Alex, etc.)
4. Different topic coverage and artifact templates
5. Fix handoff gate remains the same ("Should I fix it?")

## Context

- Current bug-gather protocol: `src/claude/agents/bug-gather-analyst.md`
- Feature roundtable protocol: `src/claude/agents/roundtable-analyst.md`
- Analyze command handler: `src/claude/commands/isdlc.md` (step 6.5)
- Roundtable personas: `src/claude/agents/personas/`
- Topic definitions: `src/claude/hooks/config/topics/`
