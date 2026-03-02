# Quick Scan: REQ-0014 Multi-Agent Requirements Team

**Feature**: Creator/Critic/Refiner debate loop for Phase 01 requirements elicitation
**Backlog Item**: 4.1 (Phase 01 specifically)
**Scanned**: 2026-02-14T17:10:00Z

---

## Scope Estimate

**Sizing**: STANDARD (not light, not epic)
- Estimated files modified: 8-12
- Estimated files created: 2-4 (new agent prompts for Critic/Refiner roles)
- Risk level: MEDIUM (core Phase 01 behavior changes, but pattern precedent exists in Inception Party)

## Affected Files (Estimated)

### Primary Impact (must change)
1. `src/claude/agents/01-requirements-analyst.md` -- Add Creator role awareness, debate loop entry point, round tracking
2. `src/claude/agents/00-sdlc-orchestrator.md` -- Update Phase 01 delegation to support debate mode, add debate loop orchestration
3. `src/claude/commands/isdlc.md` -- Add `--debate` / `--no-debate` flag parsing, pass debate config to orchestrator
4. `.isdlc/config/workflows.json` -- Add debate configuration to feature workflow agent_modifiers for 01-requirements

### New Files (must create)
5. `src/claude/agents/01-requirements-critic.md` -- New Critic agent for Phase 01 debate
6. `src/claude/agents/01-requirements-refiner.md` -- New Refiner agent for Phase 01 debate

### Secondary Impact (likely changes)
7. `src/claude/hooks/config/iteration-requirements.json` -- May need debate-aware validation rules
8. `src/claude/CLAUDE.md.template` -- Document debate mode in framework capabilities
9. `docs/AGENTS.md` -- Update agent count and document new Critic/Refiner agents
10. `docs/ARCHITECTURE.md` -- Document debate loop architecture pattern

### Test Coverage
11. `tests/` -- New tests for debate loop convergence, flag parsing, round tracking, artifact versioning

## Keyword Matches

| Keyword | Files Found | Relevance |
|---------|-------------|-----------|
| `Creator/Critic/Refiner` | BACKLOG.md only | Pattern not yet implemented |
| `inception.party` / `InceptionParty` | 6 files (discover/) | Precedent for multi-agent debate in discovery |
| `party-personas.json` | 1 file | Existing persona pattern to follow |
| `debate` / `--debate` | 18 files (mostly docs, discover/) | Flag pattern established in discover |
| `requirements-analyst` | Agent file + all agents referencing Phase 01 | Primary agent to modify |

## Precedent Analysis

The Inception Party in `/discover --new` uses a similar multi-agent debate pattern:
- `src/claude/agents/discover/party-personas.json` -- defines debate participants
- `src/claude/agents/discover-orchestrator.md` -- orchestrates debate rounds
- Key difference: Inception Party runs during discovery (before SDLC), this runs during Phase 01 (within SDLC workflow)
- Key similarity: propose-critique-refine cycle, convergence criteria, configurable engagement

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Debate loop doesn't converge (infinite loop) | LOW | HIGH | Max 3 rounds hard limit + convergence criteria |
| Breaking existing Phase 01 (single-agent mode) | MEDIUM | HIGH | `-light` and `--no-debate` bypass debate entirely |
| Over-engineering for Phase 01 only | LOW | MEDIUM | Design for extensibility but implement for Phase 01 only |
| User confusion during debate rounds | LOW | MEDIUM | Transparent round tracking, user sees only refined output |
| Hook false positives during debate rounds | MEDIUM | MEDIUM | Ensure iteration-requirements.json compatible with multi-round debate |

## Recommendations

1. **Standard workflow** (not light) -- 8-12 files, new agent definitions, moderate architectural change
2. **Follow Inception Party precedent** -- reuse debate patterns from discover/
3. **Phase 01 ONLY** -- do not extend to other phases in this feature
4. **Backward compatible** -- single-agent mode (current behavior) preserved for -light and --no-debate
