# Architecture Overview: Configurable Session Cache Token Budget

**REQ-0067** | **Status**: Accepted | **Generated**: 2026-03-16

---

## 1. Blast Radius

### Tier 1 — Direct Changes

| File | Module | Change Type | Traces |
|------|--------|-------------|--------|
| `src/claude/hooks/lib/common.cjs` | hooks/lib | MODIFY | FR-002, FR-003, FR-004, FR-005, FR-006, FR-007 |
| `bin/rebuild-cache.js` | CLI | MODIFY | FR-008 |
| `.isdlc/config` | config (new) | CREATE | FR-001, FR-006 |

### Tier 2 — Transitive Impact

| File | Impact |
|------|--------|
| `src/claude/hooks/clear.js` (SessionStart) | No change — reads generated cache file, unaffected by how it's built |
| `src/claude/hooks/tests/` | New tests needed for readConfig and budget allocation |

### Tier 3 — Side Effects

| Area | Potential Impact |
|------|-----------------|
| Session cache content | Lower-priority sections may be truncated or skipped for projects with tight budgets |
| External skill injection | Skill content limits change from fixed 5K to budget-derived |

**Summary**: 2 files modified, 1 new file, 0 transitive changes. Low risk.

## 2. Architecture Decisions

### ADR-001: Budget Allocation Algorithm

- **Status**: Accepted
- **Context**: Need to fit N sections into a configurable token budget with user-defined priorities
- **Decision**: Priority-queue fill — sort sections by priority (ascending), accumulate token estimates, truncate last partial section at line boundary, skip remaining
- **Rationale**: Simple, predictable, O(n) where n = number of sections (~9). No complex optimization needed for such a small set. User controls priority order.
- **Consequences**: Low-priority sections may be truncated/skipped on tight budgets. This is intentional — the user chose the budget and priorities.

### ADR-002: Config File Location and Format

- **Status**: Accepted
- **Context**: Need a project-level config file for cache budget and future configuration
- **Decision**: `.isdlc/config` — JSON format, no file extension
- **Rationale**: Keeps all framework runtime state in `.isdlc/`. JSON for consistency with state.json and other framework files. No extension signals "this is THE config file" (like `.gitconfig`). Extensible via top-level JSON keys for future namespacing.
- **Consequences**: `.isdlc/config` becomes the canonical project config file. Future config migrations (from process.json, etc.) land here in separate tickets.

### ADR-003: Token Estimation Without Tokenizer

- **Status**: Accepted
- **Context**: Need to convert character counts to token estimates for budget enforcement
- **Decision**: `Math.ceil(chars / 4)` — standard approximation for English text and code
- **Rationale**: No new dependencies (CON-001). Accuracy within ~10-20% is sufficient for a budget ceiling (not a billing meter). Real tokenizers (tiktoken) add 2MB+ and are model-specific.
- **Consequences**: Budget is approximate. A 100K token budget may produce ~80-120K real tokens. Acceptable for a ceiling use case.

## 3. Technology Decisions

| Decision | Choice | Rationale | Alternatives Considered |
|----------|--------|-----------|------------------------|
| Config format | JSON | Consistent with .isdlc/ conventions | INI/TOML (rejected: new parser dependency) |
| Token estimation | chars/4 | Zero dependencies, sufficient accuracy | tiktoken (rejected: 2MB+ dep, model-specific) |
| Caching strategy | Module-level variable | One file read per process | No cache (rejected: rebuild reads config multiple times) |

## 4. Integration Architecture

No external integrations. All changes are internal to the cache rebuild pipeline:

```
.isdlc/config → readConfig() → rebuildSessionCache() → .isdlc/session-cache.md
                                      ↑
                            buildSection() per section
                                      ↓
                            budget allocation loop
                            (sort by priority, fill, truncate/skip)
```

## 5. Summary

| Metric | Value |
|--------|-------|
| Files modified | 2 |
| Files created | 1 |
| New functions | 1 (`readConfig()`) |
| Functions modified | 1 (`rebuildSessionCache()`) |
| Risk level | Low |
| Estimated complexity | Small (~50 lines of new logic) |
