# Requirements Specification: REQ-GH-252

## 1. Business Context

### Problem Statement
The embedding pipeline has three independent gaps that produce a single broken user experience: after running `/discover`, semantic search doesn't work even though the components exist. Discover reports success when generation silently fails, the server doesn't auto-start, and the tool-router has zero awareness of the isdlc-embedding MCP.

### Stakeholders
- **Primary**: iSDLC framework users who want semantic code search
- **Secondary**: Framework developers maintaining the embedding pipeline

### Success Metrics
- After `/discover` with embeddings opted-in, semantic search either works or the user knows exactly why it doesn't
- Tool-router automatically routes conceptual queries to semantic search with zero user configuration
- All failure modes surface visibly — no silent failures

### Driving Factors
- Users on fresh installs report "embeddings don't work" despite the pipeline existing (observed on Java 8 + Enactor, 2,264 files)
- Three gaps identified: silent discover failure, no tool-router wiring, no health signal

## 2. Stakeholders and Personas

### Framework User
- **Role**: Developer using iSDLC on their project
- **Goals**: Semantic code search works after discover without manual steps
- **Pain Points**: Discover reports success when embeddings silently fail; tool-router ignores semantic search even when available
- **Proficiency**: Varies — from first-time users to experienced framework contributors

## 3. User Journeys

### Happy Path
1. User runs `/discover` on a project with embeddings opted-in
2. Step 7.9 validates dependencies, generates embeddings, verifies output
3. Banner shows `✓ Embeddings: {N} chunks generated`
4. User starts the embedding server manually
5. Grep calls route to semantic search automatically
6. Routing messages show `[Semantic search]` — user knows it's working

### Failure Path (discover)
1. User runs `/discover` with embeddings opted-in but missing dependency
2. Step 7.9 pre-flight detects missing `@huggingface/transformers`
3. Banner shows `✗ Embeddings: @huggingface/transformers not installed`
4. User installs dependency, re-runs discover

### Failure Path (server down)
1. User starts a session, embedding server is not running
2. Grep call fires — tool-router probes PID, finds server inactive
3. Routing message: `[Lexical fallback: server unavailable]`
4. User sees the message and knows to start the server manually

## 4. Technical Context

### Existing Infrastructure
- Embedding pipeline: `bin/isdlc-embedding.js` (CLI), `lib/embedding/` (engine, server, worker)
- Server lifecycle: `lib/embedding/server/lifecycle.js` (start, stop, status)
- Tool-router: `src/claude/hooks/tool-router.cjs` (PreToolUse hook, 4-source rule merge)
- Discover: `src/claude/agents/discover-orchestrator.md` (Step 7.9 embedding generation)
- MCP registration: `src/claude/settings.json` (`isdlc-embedding` server configured)
- Opt-in guard: `hasUserEmbeddingsConfig()` at 4 entry points (GH-250 completed)

### Constraints
- Tool-router hooks are CJS (synchronous execution model)
- Health probe must be <50ms to stay within tool-router's <100ms budget
- All fail-open per Article X — embedding features never block workflows
- Must work for both Claude Code and Codex providers

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Reliability | Critical | All paths fail-open per Article X |
| Latency | High | Health probe <50ms, pre-flight <3s |
| Debuggability | High | All fail-open paths log with `[embedding]` prefix |
| Portability | High | Core modules provider-neutral |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Query classifier misclassifies a pattern | Medium | Low | User overrides in tool-routing.json |
| PID check says alive but server unresponsive | Low | Low | #244 adds full HTTP health check later |
| Discover pre-flight blocks on slow network | Low | Medium | Timeout on model reachability check |

## 6. Functional Requirements

### FR-001: Discover Embedding Generation Hardening
**Confidence**: High

Pre-flight dependency check in discover Step 7.9 — verify `@huggingface/transformers` is importable, model is downloadable, and sufficient disk space exists BEFORE attempting generation. Post-generation verification confirms `.emb` output. Visible outcome in discover completion banner.

**AC-001-01**: Given embeddings opted-in and dependencies present, When `/discover` completes, Then `docs/.embeddings/*.emb` exists with >0 chunks
**AC-001-02**: Given embeddings opted-in but `@huggingface/transformers` not installed, When Step 7.9 runs, Then the user sees the missing dependency BEFORE generation is attempted
**AC-001-03**: Given generation fails (OOM, network, model error), When discover completes, Then the banner shows `✗` with the failure reason — not `✓`
**AC-001-04**: Given embeddings opted-out, When Step 7.9 runs, Then generation is skipped and banner shows `⊘` with opt-out message

### FR-002: Tool-Router Semantic Search Integration
**Confidence**: High

Extend `inferEnvironmentRules()` in `tool-router.cjs` to detect `isdlc-embedding` MCP and generate routing rules. Aggressive-first bias: ALL Grep calls route to semantic search when server is alive. Exemptions fall back to lexical for exact symbols/regex. Visible routing path shows `[Semantic search]` or `[Lexical fallback: {reason}]`. Inline PID-based health probe for routing decisions. Provider-aware: Claude uses hook enforcement, Codex uses instruction projection.

**AC-002-01**: Given `isdlc-embedding` MCP registered and server healthy, When a Grep call fires with a natural-language query, Then it routes to `isdlc_embedding_semantic_search`
**AC-002-02**: Given server healthy, When a Grep call fires with an exact symbol pattern (e.g., `inferEnvironmentRules`), Then it falls back to lexical with reason shown
**AC-002-03**: Given server not running, When a Grep call fires, Then inline probe returns `"inactive"`, routing falls back to lexical with `[Lexical fallback: server unavailable]`
**AC-002-04**: Given any routing decision, When the tool-router emits its message, Then the message includes either `[Semantic search]` or `[Lexical fallback: {reason}]`
**AC-002-05**: Given inline probe times out (>200ms), When tool-router evaluates routing, Then it treats status as `"failed"` and falls back to lexical — no blocking

### FR-003: Fail-Open Error Handling (Cross-cutting)
**Confidence**: High

All parts follow Article X fail-open principle. No embedding feature may block workflows, discover completion, or tool calls.

**AC-003-01**: Given embedding generation fails during discover, When Step 7.9 completes, Then discover continues to finalize — generation never blocks discovery
**AC-003-02**: Given health probe times out or errors, When tool-router evaluates, Then routing falls back to lexical — probe never blocks tool calls
**AC-003-03**: Given `isdlc-embedding` MCP is registered but server is down, When semantic search MCP call fails, Then the agent naturally falls back to Grep — no crash, no infinite retry

## 7. Out of Scope

| Item | Reason | Tracked |
|------|--------|---------|
| Claude Code status line UI | Separate feature | #244 |
| Periodic health monitor + configurable interval | Moved to #244 | #244 |
| Server auto-start at session start | User decision: manual lifecycle | — |
| OS-level daemon (launchd/systemd) | Future enhancement | #246 |
| Memory calibration / graph optimization | Separate issues | #248, #249 |
| Incremental refresh automation | Separate concern | #247 |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Discover generation hardening | Must Have | Core UX gap — discover silently fails today |
| FR-002 | Tool-router semantic integration | Must Have | Main user-facing payoff — aggressive semantic routing |
| FR-003 | Fail-open error handling | Must Have | Constitutional (Article X), cross-cutting |
