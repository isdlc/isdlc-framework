# Impact Analysis: Indexed Search Backend

**Status**: Draft
**Confidence**: High
**Last Updated**: 2026-03-03
**Coverage**: Blast Radius (high), Entry Points (high), Implementation Order (high), Risk Zones (high)

---

## 1. Blast Radius

### Tier 1: Direct Changes

| File | Change Type | Description |
|------|------------|-------------|
| `lib/search/detection.js` | Modify | Add code-index-mcp to KNOWN_TOOLS array; add pip/python to PACKAGE_MANAGERS detection |
| `lib/search/install.js` | Modify | Add code-index-mcp entry to MCP_CONFIGS |
| `lib/search/registry.js` | Modify | Add 'code-index' mappings to inferModality() and inferPriority() |
| `lib/search/backends/indexed.js` | New | Backend adapter for the indexed modality via MCP transport |
| `lib/search/backends/indexed.test.js` | New | Tests for the indexed backend adapter |
| `lib/search/detection.test.js` | Modify | Add test cases for code-index-mcp detection and Python/pip detection |
| `lib/search/install.test.js` | Modify | Add test cases for code-index-mcp installation and MCP configuration |
| `lib/search/registry.test.js` | Modify | Add test cases for code-index modality/priority inference |

### Tier 2: Transitive Impact

| File | Impact | Description |
|------|--------|-------------|
| `lib/setup-search.js` | None (automatic) | Already orchestrates detection and installation; picks up new KNOWN_TOOLS entries without code changes |
| `lib/search/router.js` | None (automatic) | Already routes 'indexed' modality; no changes needed |
| `lib/search/config.js` | None (automatic) | Already reads/writes activeBackends including any new backend IDs |
| `lib/search/ranker.js` | None (automatic) | Already ranks and bounds results from any backend |
| `lib/setup-search.test.js` | Minor | May want integration test verifying code-index flows through setup pipeline |
| `src/claude/agents/quick-scan/quick-scan-agent.md` | Modify | Add indexed modality guidance to Enhanced Search section |
| `src/claude/agents/impact-analysis/impact-analyzer.md` | Modify | Add indexed modality guidance |
| `src/claude/agents/impact-analysis/entry-point-finder.md` | Modify | Add indexed modality guidance |

### Tier 3: Potential Side Effects

| Area | Risk | Description |
|------|------|-------------|
| `.claude/settings.json` | Low | New mcpServers entry added; existing entries preserved by configureMcpServers() |
| `.isdlc/search-config.json` | Low | New backend ID added to activeBackends array; existing config fields unchanged |
| Installer flow timing | Low | pip install adds time to setup pipeline; bounded by existing 120s timeout in safeExecInstall |
| Disk usage | Low | Index stored outside project tree by default; user machines gain index storage |

## 2. Entry Points

### Recommended Starting Point: `lib/search/detection.js`

**Rationale**: The detection module is the entry point for the entire flow. Adding code-index-mcp to KNOWN_TOOLS triggers the cascade: detection recommends it, install.js installs it, configureMcpServers writes the MCP entry, and the registry picks it up from search-config.json.

### Implementation Sequence

1. **detection.js** -- Add tool definition and Python/pip detection
2. **install.js** -- Add MCP_CONFIGS entry
3. **registry.js** -- Add inferModality/inferPriority mappings
4. **backends/indexed.js** -- Create the backend adapter
5. **Agent markdown updates** -- Add indexed modality guidance to high-impact agents
6. **Tests** -- Add/update test files for each modified module

## 3. Implementation Order

| Phase | Files | Dependency |
|-------|-------|-----------|
| 1 | `detection.js`, `detection.test.js` | None -- standalone |
| 2 | `install.js`, `install.test.js` | Phase 1 (detection produces recommendations consumed by install) |
| 3 | `registry.js`, `registry.test.js` | None -- standalone, can parallel with Phase 1-2 |
| 4 | `backends/indexed.js`, `backends/indexed.test.js` | Phase 3 (adapter registered via registry) |
| 5 | Agent markdown files | Phase 4 (agents reference indexed modality) |
| 6 | Integration testing | All phases complete |

## 4. Risk Zones

| Risk ID | Description | Affected Area | Likelihood | Impact | Mitigation |
|---------|-------------|---------------|-----------|--------|------------|
| RZ-01 | Python detection false positive (python2 vs python3) | detection.js | Medium | Low | Check `python3 --version` first, fall back to `python --version` with version parsing to confirm 3.8+ |
| RZ-02 | pip install requires --user flag on some systems | install.js | Medium | Low | Try `pip install` first; if permission denied, retry with `pip install --user`; classify error via existing classifyInstallError() |
| RZ-03 | MCP server start command varies by platform | install.js MCP_CONFIGS | Low | Medium | Test MCP config on all three platforms; use `code-index-mcp` as the command (should be in PATH after pip install) |
| RZ-04 | Backend adapter MCP transport compatibility | backends/indexed.js | Low | Medium | Follow the same MCP communication pattern used by ast-grep and probe backends |
| RZ-05 | File watcher resource limits on large codebases (inotify limit on Linux) | Runtime | Medium | Low | Document OS-level tuning for inotify watches; the MCP server handles this internally |

## 5. Test Coverage Assessment

### Existing Test Coverage

| Module | Test File | Current Coverage | Impact |
|--------|-----------|-----------------|--------|
| detection.js | detection.test.js | High | Needs new tests for pip/python detection and code-index-mcp tool definition |
| install.js | install.test.js | High | Needs new tests for code-index-mcp installation and MCP config |
| registry.js | registry.test.js | High | Needs new tests for code-index modality/priority mapping |
| router.js | router.test.js | High | No changes needed -- already tests indexed modality routing |
| config.js | config.test.js | High | No changes needed |
| ranker.js | ranker.test.js | High | No changes needed |

### New Test Coverage Required

| Test File | Tests Needed |
|-----------|-------------|
| `backends/indexed.test.js` | Adapter creation, search normalization, health check, MCP failure handling, empty result handling |
| `detection.test.js` | Python/pip detection (present, absent, wrong version), code-index-mcp recommendation logic by scale tier |
| `install.test.js` | code-index-mcp install success/failure, MCP config writing |
| `registry.test.js` | code-index modality inference, priority inference |

## 6. File Count Summary

| Category | Count |
|----------|-------|
| New files | 2 (indexed.js, indexed.test.js) |
| Modified files | 6 (detection.js, detection.test.js, install.js, install.test.js, registry.js, registry.test.js) |
| Agent files modified | 3 (quick-scan-agent.md, impact-analyzer.md, entry-point-finder.md) |
| Config files affected | 2 (.claude/settings.json, .isdlc/search-config.json -- at runtime) |
| **Total** | **13** |

## 7. Summary

This is a **moderate-scope, low-risk** change. The search abstraction layer was designed for exactly this kind of extension -- adding a new backend into pre-built sockets. The blast radius is narrow (6 modified library files, 2 new files, 3 agent markdown updates), and every integration point has existing test coverage to build upon. The fail-open design inherited from REQ-0041 means backend failures never propagate to users.

The highest-risk area is the Python/pip detection and installation path, which introduces a new package manager category. This is mitigated by following the same patterns already established for npm, cargo, and brew in the detection and installation modules.
