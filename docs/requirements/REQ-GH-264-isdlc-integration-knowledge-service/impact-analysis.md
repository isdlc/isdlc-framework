# Impact Analysis: iSDLC Integration with Knowledge Service (GH-264)

## 1. Blast Radius

### Tier 1 — Direct Modifications

| File | Module | Change Type | Traces |
|---|---|---|---|
| src/core/config/config-service.js | Config | MODIFY | FR-002 |
| src/core/bridge/config.cjs | Config bridge | MODIFY | FR-002 |
| bin/init-project.sh | Installer | MODIFY | FR-001 |
| src/core/finalize/finalize-utils.js | Finalize | MODIFY | FR-004 |
| src/claude/agents/discover-orchestrator.md | Discover | MODIFY | FR-005 |
| bin/rebuild-cache.js | Session cache | MODIFY | FR-007 |
| .mcp.json (template) | MCP config | MODIFY | FR-003 |

### Tier 2 — Transitive

| File | Impact |
|---|---|
| src/claude/hooks/lib/common.cjs | May need knowledge service URL resolution helpers |
| src/isdlc/config/templates/ | Config schema template update |
| src/claude/hooks/config/finalize-steps.md | New finalize step entry |

### Tier 3 — Side Effects

| Area | Potential Impact |
|---|---|
| Existing local embedding pipeline | Must continue working when no knowledge service configured |
| Status line hooks | New polling behavior |
| Discover workflow | Skip path must not break existing flow |

## 2. Entry Points

1. **Config service** (FR-002) — start here, everything else reads from it
2. **Install script** (FR-001) — second, sets up the config
3. **MCP routing** (FR-003) — third, depends on config
4. **Finalize step** (FR-004) — independent of 1-3
5. **Discover skip** (FR-005) — independent of 1-3
6. **Status line + cache** (FR-006, FR-007) — last, depends on config

## 3. Risk Zones

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Breaking local embedding mode | Medium | High | Every change must check `knowledge.url` — if not set, preserve current behavior exactly |
| Install script platform differences | Low | Medium | Test on macOS (primary dev platform) |
| Finalize step timeout | Low | Medium | Fail-open with 5s timeout on add_content call |

## 4. Summary

| Metric | Count |
|---|---|
| Direct modifications | 7 |
| Transitive | 3 |
| New files | 0 |
| Risk level | Low |
