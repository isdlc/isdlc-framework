# Smooth embeddings UX: discover → generation → server → search wiring should be seamless by default

**Source**: GitHub Issue #252
**Type**: Enhancement

## Summary

The flow from `/discover` → embeddings generation → embedding server → search wiring is not smooth today. After `/discover` completes, users often find that (a) embeddings weren't actually generated, (b) the embedding server isn't running, or (c) code searches still use lexical backends even when embeddings exist.

## Observed Problem

On a fresh install of the harness on a new project (Java 8 + Enactor, 2,264 files, 1,221 process definitions), after running `/discover`:

1. User asks "what about embeddings?"
2. Response: *"the embedding pipeline isn't configured for this project — `docs/.embeddings/` doesn't exist, so the code embeddings refresh step was skipped silently per the discovery spec."*

So discover appeared to complete successfully, but semantic search isn't set up. The user has no clear path to enable it without reading the code.

## Root Causes (three independent gaps)

### Gap 1: Discover → Generation is fragile and silent

**Location**: `src/claude/agents/discover-orchestrator.md` Step 7.9 + finalize refresh (`src/core/finalize/refresh-code-embeddings.js`)

- Step 7.9 invokes `npx isdlc-embedding generate .` but if the command fails, it logs the error and continues — embedding generation is optional and should not block discovery completion
- No upfront dependency check (`@huggingface/transformers` installed? enough memory? model download reachable?)
- No verification after generation that `docs/.embeddings/*.emb` actually exists
- Failures are logged to stderr and invisible to the user — discover says it completed even when generation silently failed
- Related: GH-250 (opt-in gap — generate runs unconditionally even when user opted out)

### Gap 2: Embedding server does not auto-start on session start

**Location**: embedding server lifecycle (`lib/embedding/server/lifecycle.js`), Claude Code session start hooks (`src/claude/hooks/`)

- Config has `auto_start: true` but that only fires when something calls the server API
- On a fresh Claude Code session, nothing proactively calls the server, so it's not running unless the user manually runs `isdlc-embedding server start`
- `.isdlc/state.json` stores embedding metadata but no health check runs at session start
- Partially addressed: GH-244 (status line), GH-245 (crash auto-restart), GH-246 (launchd/systemd reboot survival), GH-241 (port collision false success). None cover the session-start auto-probe gap.

### Gap 3: Tool-router does NOT route to the embedding MCP

**Location**: `src/claude/hooks/tool-router.cjs`

The `isdlc-embedding` MCP server IS registered in `src/claude/settings.json` and exposes:
- `isdlc_embedding_semantic_search`
- `isdlc_embedding_list_modules`
- `isdlc_embedding_add_content`

But `tool-router.cjs` only checks for `code-index-mcp` availability and routes Grep/Glob/Read to code-index tools. It has zero awareness of the `isdlc-embedding` MCP server. Even when embeddings are generated AND the server is running AND the MCP bridge is registered, agents continue using code-index (lexical) search for all Grep calls.

## Proposed Work

### Part A — Discover → Generation (hardening)

- Pre-flight dependency check in Step 7.9
- Visible progress during generation
- Post-generation verification
- Respect opt-in (GH-250)
- Surface failures in the discover completion banner

### Part B — Embedding server lifecycle at session start

- SessionStart hook for auto-start
- Health probe and status recording
- Fail-open behavior
- Status line in session cache

### Part C — Tool-router → isdlc-embedding MCP wiring

- Extend `inferEnvironmentRules()` for isdlc-embedding MCP
- Route conceptual queries to semantic search
- Preserve lexical routing for exact symbols/patterns
- Heuristic for lexical vs semantic classification

## Acceptance Criteria (from issue)

- A1: After `/discover` completes with embeddings opted-in, `.emb` exists OR banner shows clear failure
- A2: Missing dependencies reported BEFORE generation attempts
- A3: Session start auto-starts embedding server if configured and present
- A4: Tool-router routes eligible Grep calls to semantic search
- A5: Exact-symbol and literal-pattern Grep stays on lexical search
- A6: Session-start status line shows SEMANTIC SEARCH status
- A7: Tests cover three failure modes, all fail-open

## Out of Scope

- Auto-starting server at OS boot (GH-246)
- Memory calibration correctness (GH-248)
- fp16 graph optimization re-enable (GH-249)
- Incremental refresh automation (GH-247)
