---
Status: Draft
Confidence: High
Last Updated: 2026-03-08
Coverage: architecture-options 100%, decisions 100%
---

# Architecture Overview: Full Persona Override

## 1. Architecture Options

### Decision 1: Mode Selection Placement

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: In analyze verb (before roundtable dispatch) | Mode question asked in analyze-item.cjs / three-verb-utils, result passed to roundtable | Clean separation; roundtable receives a decided mode; no conditional logic in roundtable startup | Adds questions before the roundtable agent is "alive" — the Antigravity flow has the orchestrator ask these | Aligns with current flag handling (--silent, --personas already processed pre-dispatch) | **Selected** |
| B: In roundtable-analyst.md (first turn) | Roundtable agent asks mode question as part of its opening | All questions in one place; roundtable owns its configuration | Roundtable would need a "don't start yet" mode; adds complexity to already-large agent file; no-persona mode means roundtable starts only to immediately not-roundtable | Breaks current pattern where roundtable always starts in persona mode | Eliminated |

### Decision 2: No-Persona Analysis Path

| Option | Summary | Pros | Cons | Pattern Alignment | Verdict |
|--------|---------|------|------|-------------------|---------|
| A: Roundtable agent with personas disabled | Same agent, mode flag controls whether personas are loaded | Single code path; reuses existing artifact production | Conceptually confusing — "roundtable" without a roundtable; agent file gets more conditional | Current silent mode works this way | Eliminated |
| B: Separate analysis path that skips roundtable | Analyze verb produces artifacts directly using topic files without invoking roundtable agent | Clean separation; no-persona = no roundtable agent; simpler mental model | New code path to maintain; artifact production logic duplicated | Similar to how build phases produce artifacts without roundtable | **Selected** |

**Rationale for B**: The roundtable agent is inherently about multi-persona conversation. "No personas" means no roundtable — the analyze verb should produce artifacts directly. This avoids further bloating roundtable-analyst.md and keeps the mental model clean. The topic files (`src/claude/skills/analysis-topics/`) already contain the analytical knowledge needed to produce artifacts without persona mediation.

## 2. Selected Architecture

### ADR-001: Mode Selection in Analyze Verb

- **Status**: Accepted
- **Context**: Users need to choose analysis mode before any analysis work begins
- **Decision**: Mode selection (personas/no-personas, verbosity, roster) happens in the analyze verb flow, before roundtable dispatch. Results are passed as context fields.
- **Rationale**: Keeps roundtable agent focused on what it does well (multi-persona conversation). Analyze verb already handles item resolution, staleness checks, and flag processing — mode selection fits naturally here.
- **Consequences**: `analyze-item.cjs` gains mode selection logic. Roundtable dispatch includes `analysis_mode` and `active_roster` fields. The Antigravity analyze protocol (CLAUDE.md) gains mode selection steps.

### ADR-002: No-Persona = No Roundtable

- **Status**: Accepted
- **Context**: When user chooses "no personas", we need to decide whether to invoke the roundtable agent in a degraded mode or skip it entirely
- **Decision**: No-persona mode skips the roundtable agent entirely. The analyze verb produces artifacts directly using topic analytical knowledge.
- **Rationale**: The roundtable agent is 800+ lines of persona orchestration logic. Running it without personas adds complexity for no benefit. Topic files contain all the analytical knowledge needed. Silent mode (personas loaded internally, no conversation) remains a roundtable feature for users who want persona depth without dialogue.
- **Consequences**: Analyze verb needs an artifact production path that doesn't go through roundtable-analyst.md. Topic files become the primary knowledge source for no-persona analysis.

### ADR-003: Primaries as Recommended Defaults

- **Status**: Accepted
- **Context**: The three primary personas are currently hardcoded as always-present in roundtable-analyst.md and persona-loader.cjs
- **Decision**: Remove hardcoding. Primary personas are recommended in roster proposal but can be removed by the user like any other persona.
- **Rationale**: User control principle — no hidden mandatory behavior. The infrastructure already supports dynamic rosters (trigger matching, user add/remove). The only gap is the `PRIMARY_PERSONAS` constant forcing inclusion.
- **Consequences**: `persona-loader.cjs` stops force-including primaries. `roundtable-analyst.md` replaces all "three personas" references with "active personas". Confirmation sequence adapts dynamically. Users may run analyses without Maya/Alex/Jordan if they choose.

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| No new dependencies | — | All changes are to existing markdown agent files and CJS modules | — |
| Topic files as analytical knowledge source | Existing | Already contain the domain knowledge for all 5 analysis topics; used by roundtable today | Extracting analytical knowledge into a separate module (over-engineering for this scope) |

## 4. Integration Architecture

### Data Flow

```
User input → analyze verb
  → Mode selection (personas? verbosity? roster?)
  → If no-personas: direct artifact production using topic knowledge → artifacts
  → If with-personas: roundtable dispatch with mode + roster context
    → roundtable-analyst.md (dynamic persona loading from roster)
    → conversation per verbosity mode
    → artifacts
```

### Integration Points

| Source | Target | Interface | Data Format | Error Handling |
|--------|--------|-----------|-------------|----------------|
| Analyze verb | Roundtable agent | Dispatch context | JSON fields: analysis_mode, verbosity, active_roster, persona_paths | Missing fields → fall back to recommend-all |
| Analyze verb | Topic files | File read | Markdown with YAML frontmatter | Missing topics → produce artifact without that domain's depth |
| Roundtable config | Analyze verb | YAML config read | roundtable.yaml | Missing/malformed → sensible defaults for pre-population |
| Persona loader | Analyze verb | Function call | { paths, driftWarnings, skippedFiles } | Errors → proceed with available personas only |

## 5. Summary

| Decision | Choice | Key Trade-off |
|----------|--------|---------------|
| Mode selection placement | In analyze verb, pre-dispatch | Separation of concerns vs. single-location config |
| No-persona path | Skip roundtable entirely | Clean mental model vs. new code path to maintain |
| Primary persona treatment | Recommended defaults, not forced | User control vs. analysis quality safety net |
| New dependencies | Zero | Existing infrastructure is sufficient |
