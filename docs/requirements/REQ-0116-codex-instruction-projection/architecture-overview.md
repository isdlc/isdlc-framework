# Architecture Overview: Codex Instruction Projection Service

**Item**: REQ-0116 | **GitHub**: #180 | **CODEX**: CODEX-047

---

## 1. Architecture Options

| Option | Summary | Pros | Cons | Verdict |
|--------|---------|------|------|---------|
| A: Extend projection.js | Add projectInstructions() to the existing projection.js from REQ-0114 | Single file for all projection logic, no new files | File grows from ~50 to ~150 lines | **Selected** |
| B: Separate instruction-builder.js | New file for the instruction projection service | Separation of concerns | Extra file, extra import, REQ-0114 already owns projection.js | Eliminated |

## 2. Selected Architecture

### ADR-CODEX-022: Instruction Projection in projection.js

- **Status**: Accepted
- **Context**: REQ-0114 creates `src/providers/codex/projection.js` (~50 lines) with `getCodexConfig()` and `getProjectionPaths()`. The full instruction projection service is a natural extension — it uses the config and paths to assemble instruction bundles.
- **Decision**: Add `projectInstructions(phase, agent, options)` to `src/providers/codex/projection.js`, growing it to ~150 lines.
- **Rationale**: Projection (paths) and projection (instructions) are the same concern — "what does Codex need to see?" Keeping them together avoids import indirection and keeps the provider module count low.
- **Consequences**: projection.js becomes the largest file in the Codex provider (~150 lines), but still well under the Claude equivalent.

## 3. Technology Decisions

| Technology | Rationale |
|-----------|----------|
| ES modules (`.js`) | Consistent with `src/providers/` convention |
| Template literals | Markdown assembly via tagged template strings |
| No external dependencies | Pure data assembly, no markdown library needed |

## 4. Integration Architecture

### File Layout

```
src/providers/codex/
  projection.js   (EXTENDED — ~150 lines total)
    - getCodexConfig()          (from REQ-0114)
    - getProjectionPaths()      (from REQ-0114)
    - projectInstructions()     (NEW — this item)
```

### Integration Points

| Source | Target | Interface | Data Format |
|--------|--------|-----------|-------------|
| projectInstructions() | core/team/team-spec.js | getTeamSpec() | Frozen team spec object |
| projectInstructions() | core/team/team-instance.js | getTeamInstance(phase) | Frozen instance object |
| projectInstructions() | core/content/classification.js | getAgentClassification(agent) | role_spec sections |
| projectInstructions() | core/skills/injection.js | computeInjectionPlan(agent, phase) | Skill list + content |
| projectInstructions() | Codex task runner (isdlc-codex repo) | Return value | { content, metadata } |

## 5. Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module location | `src/providers/codex/projection.js` | Extends existing file |
| Assembly strategy | Template literal markdown | Simple, no dependencies |
| Size estimate | ~150 lines total (50 existing + 100 new) | Assembly + fail-open logic |
