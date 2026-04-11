# Root Cause Analysis: BUG-GH-250

**Slug**: BUG-GH-250-embeddings-opt-in-gap
**Analysis Phase**: 02-tracing
**Analyzed**: 2026-04-11
**Confidence**: HIGH
**Severity**: Medium-High
**Estimated Complexity**: LOW

---

## Hypotheses (Ranked)

### H1 — Primary (HIGH confidence)

**`hasUserEmbeddingsConfig()` was added as part of REQ-GH-239 (FR-006) but adoption was incomplete. Only the two finalize-path call sites were retrofitted; the four pre-existing embedding entry points continued using the legacy `cfg?.embeddings || {}` defensive-read idiom inherited from before FR-006 was specified.**

**Evidence**:
1. The guard function `hasUserEmbeddingsConfig(projectRoot)` exists at `src/core/config/config-service.js:262` with a JSDoc comment explicitly citing FR-006 and Article X (lines 256-257).
2. Two call sites use it: `src/core/finalize/refresh-code-embeddings.js:211-220` (async F0009) and `src/core/finalize/finalize-utils.js:181-220` (sync F0009 adapter, inline raw-read equivalent).
3. Four call sites do not: `bin/isdlc-embedding.js:231-243`, `src/claude/agents/discover-orchestrator.md:2566`, `bin/isdlc-embedding-server.js:43`, `bin/isdlc-embedding-mcp.js:32-47`.
4. All four violating sites share the exact same code pattern: `const embConfig = config.embeddings || {}` or `cfg?.embeddings || {}`. This is the pre-FR-006 way of reading embedding config — when defaults-merge was the contract and absence meant "use defaults", not "opt out".
5. The `|| {}` idiom is semantically incompatible with FR-006. Under FR-006, the difference between `cfg.embeddings === undefined` and `cfg.embeddings === {}` is load-bearing — the former is opt-out, the latter is opt-in-with-defaults. The `|| {}` fall-through erases that distinction at the source.
6. No hook, lint rule, or grep guard exists to catch new instances of this pattern.

### H2 — Rejected (LOW confidence)

**The opt-in check belongs inside the embedding engine library (`lib/embedding/engine/index.js`), not at entry points.**

**Rejected because**:
- Would push policy into library code, making per-caller decisions (interactive vs programmatic) harder to express
- Would complicate finalize's `{status:'skipped', reason:'opted_out'}` reporting pattern
- Policy belongs at the orchestration layer, which is the entry point

### H3 — Rejected (LOW confidence)

**The install prompt should write `embeddings: null` on opt-out instead of omitting the key.**

**Rejected because**:
- FR-006 explicitly specifies that *absent key* IS the opt-out signal (`config-service.js:252`)
- The raw-read function already handles both `undefined` and `null` correctly
- Changing the install writer would paper over the real problem (call sites not checking)

---

## Affected Code Paths

### Violation 1 — `bin/isdlc-embedding.js:231-243` (generate CLI)

**Call chain**:
```
User: isdlc-embedding generate . (or npx isdlc-embedding generate .)
  -> bin/isdlc-embedding.js main() dispatch -> runGenerate()
  -> line 234: configPath = join(workingCopy, '.isdlc', 'config.json')
  -> line 237-243: if (existsSync(configPath)) { embConfig = cfg?.embeddings || {}; provider = embConfig.provider || 'jina-code'; }
  -> [MISSING GUARD: no hasUserEmbeddingsConfig() call]
  -> line 247+: createAdapter -> chunkFile -> embed -> buildPackage
  -> writes docs/.embeddings/*.emb
```

**Guard gap**: lines 237-243 read config defensively but never distinguish "key absent" (opt-out) from "key present but partial" (opted in with defaults). `cfg?.embeddings || {}` collapses both to `{}`.

### Violation 2 — `src/claude/agents/discover-orchestrator.md:2566` (discover Step 7.9)

**Call chain**:
```
User: /discover
  -> discover-orchestrator agent -> Step 7 walkthrough -> Step 7.9
  -> unconditional bash: npx isdlc-embedding generate .
  -> (inherits Violation 1)
```

**Guard gap**: no pre-check in the agent prompt. The markdown has zero reference to `hasUserEmbeddingsConfig`, FR-006, or REQ-GH-239. Documentation/prompt-level miss that propagates into the child CLI call.

### Violation 3 — `bin/isdlc-embedding-server.js:43` (server start)

**Call chain**:
```
User: isdlc-embedding server start (or daemon invocation)
  -> main() -> reads .isdlc/config.json (lines 34-41)
  -> line 43: const embConfig = config.embeddings || {}
  -> line 47: provider = embConfig.provider || 'jina-code'
  -> line 49-53: prints startup banner
  -> [MISSING GUARD]
  -> line 57+: imports embedding engine, starts HTTP listener on 7777
```

**Guard gap**: identical pattern to Violation 1 — `config.embeddings || {}` treats opt-out as "use defaults".

### Violation 4 — `bin/isdlc-embedding-mcp.js:32-47` (MCP stdio bridge)

**Call chain**:
```
Claude Code session starts
  -> reads src/claude/settings.json -> mcpServers.isdlc-embedding
  -> spawns: node $CLAUDE_PROJECT_DIR/bin/isdlc-embedding-mcp.js
  -> top-level: loadServerConfig() (lines 32-45)
  -> line 35: if (!existsSync(configPath)) return DEFAULTS
  -> line 37: srv = cfg?.embeddings?.server || {}
  -> line 47: serverConfig = loadServerConfig() (module-level, runs on import)
  -> MCP JSON-RPC handlers initialize, bridge attempts HTTP calls to localhost:7777
```

**Guard gap**: two distinct fallback paths (missing file, missing `embeddings` key) both silently resolve to `DEFAULTS`. Module structure requires the check to happen *before* `serverConfig` is assigned at line 47, or the MCP handshake needs to exit cleanly after a logged skip notice.

**Note**: the initial bug report cited `bin/isdlc-embedding-mcp.js:34-37` — the actual `loadServerConfig` function spans lines 32-45 and the module-level call is at line 47. The guard must be added at the module top-level, before line 47.

### Compliant Reference Paths

- **`src/core/finalize/refresh-code-embeddings.js:211-220`** — async variant. Uses `_hasUser` DI hook (`hasUserEmbeddingsConfig`). Returns `{status: 'skipped', reason: 'opted_out'}` on false. Textbook correct.
- **`src/core/finalize/finalize-utils.js:181-220`** — sync F0009 adapter. Inline raw-read opt-in check (lines 184-198) + bootstrap guard (lines 203-220). Returns `{success: true, skipped: true, message: 'embeddings not configured'}`. Duplicates logic from refresh-code-embeddings.js but semantically aligned.

---

## Blast Radius

### Tier 1 — Direct Changes

| File | Lines | Change |
|------|-------|--------|
| `bin/isdlc-embedding.js` | ~15 | Import guard; add opt-in check at `runGenerate()` entry; add interactive readline prompt (TTY) or skip+exit 0 (non-TTY) |
| `src/claude/agents/discover-orchestrator.md` | ~10 | Step 7.9 pre-check bash block; skip + banner note when opted out |
| `bin/isdlc-embedding-server.js` | ~8 | Import guard; `main()` guard; refuse-to-start + exit 1 when opted out |
| `bin/isdlc-embedding-mcp.js` | ~8 | Import guard; module top-level guard; clean exit 0 when opted out |

**Total**: ~41 new lines across 4 files.

### Tier 2 — Transitive Impact

**None**. Guards are purely additive. Existing opted-in happy path code is untouched at all 4 sites.

### Tier 3 — Side Effects

| Area | Impact |
|------|--------|
| Test suite | 4 new test files (`tests/bin/isdlc-embedding.test.js`, `tests/bin/isdlc-embedding-server.test.js`, `tests/bin/isdlc-embedding-mcp.test.js`, `tests/claude/hooks/tests/discover-step79-optin.test.cjs`) |
| Install scripts | No changes — `install.sh` and `install.ps1` already write the correct config shape (absent key = opt-out) |
| `src/claude/settings.json:430` | No changes — fix #4 uses clean-exit pattern rather than conditional MCP registration (simpler, keeps policy in the binary) |

---

## Evidence Summary

**Systemic cause**: legacy `cfg?.embeddings || {}` fall-through idiom used in place of canonical `hasUserEmbeddingsConfig()` guard. The pattern pre-dates FR-006 and was never retrofitted.

**Root cause confidence**: HIGH — mechanical, verifiable by direct code inspection. No ambiguity.

**Complexity**: LOW — guards are additive, ~6 lines each, pattern already proven in the two compliant sites.

**Out of scope** (confirmed during tracing):
- `lib/memory-embedder.js` — session record embeddings, different data flow. Flagged for separate follow-up.

**Optional hardening** (surfaced by tracing, not required for GH-250 closure):
- Add an ESLint rule or pre-commit grep forbidding `config.embeddings || {}` outside `src/core/config/` to prevent regression.
- Consider collapsing `src/core/finalize/finalize-utils.js:184-198` inline raw-read into a direct `hasUserEmbeddingsConfig` call (duplication cleanup).

---

## Tracing Metadata

- **Tracing sub-agents**: T1 (symptom-analyzer), T2 (execution-path-tracer), T3 (root-cause-identifier) — executed in parallel via tracing-orchestrator
- **Analysis mode**: true
- **Violation count**: 4
- **Compliant count**: 2
- **Initial scan accuracy**: fully validated by tracing; only nit is MCP bridge line range (32-47 vs original bug report's 34-37)
