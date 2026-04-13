# Impact Analysis: REQ-GH-252

## Blast Radius

### Tier 1 — Direct Changes

| File | Change Type | FR |
|------|-----------|-----|
| `src/core/embedding/query-classifier.cjs` | NEW | FR-002 |
| `lib/embedding/server/health-probe.cjs` | NEW | FR-002 |
| `src/claude/hooks/tool-router.cjs` | MODIFY | FR-002 |
| `bin/isdlc-embedding.js` | MODIFY | FR-001 |
| `src/claude/agents/discover-orchestrator.md` | MODIFY | FR-001 |

### Tier 2 — Transitive Impact

| File | Impact Reason |
|------|--------------|
| `src/claude/hooks/tests/test-tool-router*.test.cjs` | Existing tool-router tests may need updates for new rules |
| `tests/bin/isdlc-embedding.test.js` | Existing CLI tests need cases for new exit codes |
| Codex projection generator (`src/providers/codex/`) | Needs semantic search instruction injection |
| `src/core/embedding/query-classifier.test.cjs` | NEW test file |
| `lib/embedding/server/health-probe.test.cjs` | NEW test file |
| `tests/integration/embedding-fail-open.test.js` | NEW test file |

### Tier 3 — Potential Side Effects

| Area | Risk | Mitigation |
|------|------|------------|
| Existing tool-router rules (code-index-mcp) | Rule evaluation order change could affect existing routing | New semantic rule uses different `operation` key; no conflict with existing rules |
| Discover completion flow | Banner generation changes | Exit code mapping is additive; existing success path unchanged |
| Tool-router performance budget (<100ms) | Health probe adds latency | Probe only fires for semantic-eligible queries (~5ms PID check) |

## Entry Points

| Entry Point | Chain | FR |
|-------------|-------|-----|
| `isdlc-embedding generate` CLI | preflight() → chunk → embed → post-verify | FR-001 |
| tool-router PreToolUse hook | inferEnvironmentRules() → evaluateRule() → classifyQuery() → probeEmbeddingHealth() | FR-002 |
| discover-orchestrator Step 7.9 | exec CLI → read exit code → map to banner | FR-001 |
| Codex projection generator | inject routing instruction | FR-002 |

## Risk Zones

| Zone | Risk Level | Reason | Mitigation |
|------|-----------|--------|------------|
| Query classifier heuristic | Medium | False positives/negatives in pattern classification | User overrides in tool-routing.json |
| Tool-router performance | Low | Health probe adds ~5ms per semantic-eligible Grep | PID check is fast; only fires after exemption check |
| CLI exit code contract | Low | Consumers must map exit codes correctly | Well-defined contract (0/1/2/3), tested |

## Summary

| Metric | Count |
|--------|-------|
| Direct modifications | 3 |
| New files | 2 |
| New test files | 4 |
| Transitive modifications | 3 |
| Total affected | 12 |
| Risk level | Medium |
| Estimated scope | Standard |
