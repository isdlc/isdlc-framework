# Data Flow: Improve Search Capabilities for Claude Effectiveness

**Status**: Draft
**Confidence**: Medium
**Last Updated**: 2026-03-02
**Coverage**: Setup Flow (high), Search Flow (high), Degradation Flow (high)

---

## 1. Setup Flow: Search Detection and Installation

```
User runs `isdlc init` or `/discover`
  |
  v
[lib/search/detection.js] detectSearchCapabilities(projectRoot)
  |
  +-- Count project files -> scaleTier ('small' | 'medium' | 'large')
  |
  +-- Check installed tools:
  |     ast-grep: `ast-grep --version` -> installed? version?
  |     Probe:    `probe --version`    -> installed? version?
  |     Zoekt:    `zoekt-index --help`  -> installed? version?
  |
  +-- Check package managers:
  |     npm:   `npm --version`
  |     cargo: `cargo --version`
  |     brew:  `brew --version`
  |
  +-- Check existing MCP config:
  |     Read .claude/settings.json -> mcpServers keys
  |
  v
DetectionResult { scaleTier, fileCount, tools[], recommendations[], existingMcpServers[] }
  |
  v
[lib/installer.js] Present recommendations to user
  |
  +-- "Your project has ~{fileCount} files ({scaleTier} scale)."
  +-- "Recommended: {tool1} ({reason1}), {tool2} ({reason2})"
  +-- "Install recommended tools? (Y/n/select)"
  |
  +-- User accepts all    --> installTool() for each recommendation
  +-- User selects subset --> installTool() for selected tools only
  +-- User declines       --> skip installation, record opt-out
  |
  v
[lib/search/install.js] For each accepted tool:
  |
  +-- Run install command (e.g., `npm install -g @ast-grep/cli`)
  |     +-- Success -> record installed version
  |     +-- Failure -> report error, try next install method, ultimately skip
  |
  v
[lib/search/install.js] configureMcpServers(installedBackends, settingsPath)
  |
  +-- Read .claude/settings.json
  +-- Merge new mcpServers entries (preserve existing)
  +-- Write updated .claude/settings.json
  |
  v
[lib/search/config.js] writeSearchConfig(projectRoot, config)
  |
  +-- Write .isdlc/search-config.json with enabled backends, scale tier, preferences
  |
  v
Setup continues with remaining steps (unchanged)
```

## 2. Search Request Flow: Agent to Result

```
Agent (e.g., quick-scan-agent)
  |
  | SearchRequest { query, modality, scope, tokenBudget }
  v
[lib/search/router.js] search(request, options?)
  |
  +-- Load search config (if not cached)
  |
  +-- Resolve modality:
  |     'any' -> use config.preferredModality
  |     specific -> use as-is
  |
  +-- [lib/search/registry.js] getBestBackend(modality)
  |     |
  |     +-- Filter backends by modality
  |     +-- Sort by priority (descending)
  |     +-- Filter by health == 'healthy'
  |     +-- Return highest priority healthy backend
  |     +-- If none healthy -> return null (triggers fallback)
  |
  +-- If backend found:
  |     |
  |     +-- backend.search(request) -> RawSearchHit[]
  |     |     +-- Success -> continue to ranking
  |     |     +-- Failure -> updateHealth('degraded'), try next backend
  |     |
  |     v
  |   [lib/search/ranker.js] rankAndBound(rawHits, { tokenBudget, deduplicate })
  |     |
  |     +-- Score: use backend-provided score, or BM25 fallback
  |     +-- Deduplicate: remove identical file+line matches
  |     +-- Rank: sort by relevanceScore descending
  |     +-- Bound: truncate to tokenBudget from lowest-relevance end
  |     |
  |     v
  |   SearchResult { hits[], meta { backendUsed, modalityUsed, degraded: false, ... } }
  |
  +-- If no backend found (all unhealthy or none registered for modality):
        |
        +-- Fall back to 'grep-glob' backend (always available)
        +-- Emit degradation notification (once per session)
        +-- SearchResult { hits[], meta { ..., degraded: true } }
  |
  v
Agent receives SearchResult
  |
  +-- Uses hits[] for analysis (file paths, context snippets, AST metadata)
  +-- Checks meta.degraded to note reduced precision in output
```

## 3. Degradation Flow

```
Agent calls search(request)
  |
  v
Router selects backend (e.g., ast-grep)
  |
  v
backend.search(request) THROWS or TIMES OUT
  |
  v
Router catches error
  |
  +-- registry.updateHealth('ast-grep', 'unavailable')
  |
  +-- Try next backend in modality priority list
  |     +-- If Probe available -> try Probe
  |     +-- If Probe also fails -> fall back to grep-glob
  |
  +-- If fallback to grep-glob:
  |     +-- Emit SearchNotification {
  |     |     type: 'degradation',
  |     |     message: 'Enhanced search unavailable (...). Falling back to standard search.',
  |     |     severity: 'warning',
  |     |     once: true
  |     | }
  |     +-- Set degradationNotified = true (session flag)
  |
  v
Return SearchResult with meta.degraded = true
  |
  v
Agent continues with degraded results (never blocked)
```

## 4. Health Check Flow

```
On router initialization (session start):
  |
  v
For each registered backend:
  |
  +-- backend.healthCheck() with 2000ms timeout
  |     +-- 'healthy'     -> registry.updateHealth(id, 'healthy')
  |     +-- 'degraded'    -> registry.updateHealth(id, 'degraded')
  |     +-- timeout/error -> registry.updateHealth(id, 'unavailable')
  |
  v
Registry populated with current health status
  |
  v
(Health re-checked on failure during search -- see Degradation Flow)
```

## 5. Configuration Update Flow

```
User requests configuration change (opt-out, add backend, reset)
  |
  v
[lib/search/config.js] readSearchConfig(projectRoot)
  |
  v
Apply changes:
  +-- Opt-out: set enabled = false
  +-- Add backend: append to activeBackends, configure MCP
  +-- Reset: revert to { enabled: true, activeBackends: ['grep-glob'] }
  |
  v
[lib/search/config.js] writeSearchConfig(projectRoot, updatedConfig)
  |
  v
[lib/search/install.js] configureMcpServers() -- update .claude/settings.json
  |
  v
[lib/search/registry.js] reload from updated config
```
