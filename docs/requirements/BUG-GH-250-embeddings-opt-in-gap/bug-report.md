# Bug Report: FR-006 opt-in contract enforced inconsistently across embedding subsystem

**Slug**: BUG-GH-250-embeddings-opt-in-gap
**Source**: github GH-250
**Reported**: 2026-04-11
**Status**: Analysis in progress

---

## Severity

**Medium-High**

- No crash, no data corruption, no security vulnerability.
- Systemic contract violation: FR-006 (REQ-GH-239) is respected in 2 code paths and bypassed in 4+ others.
- Wastes CPU/memory for users who explicitly opted out at install time.
- Undermines Article X (Fail-Safe Defaults — opt-out via silence).
- Breaks user trust: the installer asks `Enable code embeddings? [y/N]`, saving "N" should mean "off everywhere," not "off in finalize but on everywhere else."

## Symptoms

1. User installs iSDLC harness and selects **N** at the embeddings opt-in prompt (`install.sh:1019` / `install.ps1:1120`).
2. `.isdlc/config.json` is written **without** an `embeddings` block (per `lib/install/embeddings-prompt.js:178-203`).
3. User runs `/discover`. Step 7.9 (`src/claude/agents/discover-orchestrator.md:2566`) invokes `npx isdlc-embedding generate .` unconditionally.
4. The `generate` CLI (`bin/isdlc-embedding.js:231-243`) reads the config, finds no `embeddings` block, defaults to `provider: 'jina-code'`, downloads the model, chunks the codebase, and writes `.emb` packages — despite the user explicitly declining.
5. The embedding server (`bin/isdlc-embedding-server.js:43`) and MCP bridge (`bin/isdlc-embedding-mcp.js:34-37`) also boot with defaults when the `embeddings` block is missing, further compounding the silent activation.

## Reproduction Steps

1. Fresh install: `./install.sh` in a clean project → answer **N** at the embeddings prompt.
2. Verify `.isdlc/config.json` does **not** contain an `embeddings` key:
   ```bash
   node -e 'const c = JSON.parse(require("fs").readFileSync(".isdlc/config.json","utf8")); console.log("embeddings key present:", "embeddings" in c);'
   # → embeddings key present: false
   ```
3. Run `/discover` → walk through the flow → reach Step 7.9.
4. Observe `docs/.embeddings/*.emb` gets created despite the opt-out.
5. Alternatively, run the CLI directly:
   ```bash
   node bin/isdlc-embedding.js generate .
   ```
   Observe generation proceeds with `provider: jina-code` defaults, no warning.

## Affected Area

Six code paths across the embedding subsystem, split into compliance groups:

### ✓ Respect FR-006 (correct)

1. **`src/core/finalize/refresh-code-embeddings.js:202-220`** — async F0009 path
   - Uses `_hasUser` DI hook → calls `hasUserEmbeddingsConfig(projectRoot)`
   - Returns `{status: 'skipped', reason: 'opted_out'}`
   - Article X compliant (fail-open)

2. **`src/core/finalize/finalize-utils.js:181-220`** — sync F0009 adapter
   - Inline raw-read opt-in check (lines 184-198)
   - Bootstrap guard — skips on missing `docs/.embeddings/*.emb`
   - Returns `{success: true, skipped: true, message: 'embeddings not configured'}`
   - Duplicates logic from refresh-code-embeddings.js but semantically aligned

### ❌ Violate FR-006

3. **`bin/isdlc-embedding.js:231-243`** (`generate` subcommand)
   - Reads `.isdlc/config.json` but does NOT call `hasUserEmbeddingsConfig()`
   - When `embeddings` block is absent, defaults to `'jina-code'` and proceeds
   - **Expected behavior per GH-250 decision**: when run interactively from the CLI, prompt the user to opt in first. When invoked programmatically by another framework path, hard-skip with informational message.

4. **`src/claude/agents/discover-orchestrator.md:2566`** (Step 7.9)
   - Unconditionally invokes `npx isdlc-embedding generate .`
   - No opt-in check before invocation
   - **Expected behavior**: skip silently when opted out, display a one-line note in the discover completion banner pointing at `isdlc-embedding configure`.

5. **`bin/isdlc-embedding-server.js:43`** (`server start`)
   - `const embConfig = config.embeddings || {}` — falls back to empty object
   - Server boots regardless, loads `.emb` packages if present
   - **Expected behavior**: refuse to start with a clear message when `hasUserEmbeddingsConfig()` returns false. User can run `isdlc-embedding configure` to opt in.

6. **`bin/isdlc-embedding-mcp.js:34-37`** (MCP stdio bridge)
   - Reads config, falls back to `DEFAULTS = { host: 'localhost', port: 7777 }`
   - Registered unconditionally in `src/claude/settings.json:430` — spawns in every Claude Code session
   - **Expected behavior**: at startup, check `hasUserEmbeddingsConfig()`. When opted out, log a one-line skip notice and exit cleanly (the MCP handshake will fail gracefully from the Claude Code side).

### Out of scope (flagged for follow-up)

- **`lib/memory-embedder.js`** — embeds roundtable session records (not code). Called from `src/claude/commands/isdlc.md:785` after every analyze. This uses a different data flow and may warrant a separate opt-in. Tracked as future work, not GH-250.

## Affected Users

- Users who selected **N** at install — any of them running `/discover` or direct `isdlc-embedding generate` get embeddings silently bootstrapped.
- Users on memory-constrained hardware (24GB Macs, CI runners) — the ~30-60 min generation eats CPU/memory unexpectedly.
- Users who explicitly want lexical-only search — the MCP bridge spawns every session even when opted out.

## Contract Reference

**FR-006** (REQ-GH-239): Opt-in via config presence. The `embeddings` key in raw `.isdlc/config.json` (before the defaults-merge layer) signals opt-in. Absent key = opted out. Explicit `null` = opted out.

**Correct implementation pattern** (from `src/core/finalize/refresh-code-embeddings.js:211-220`):
```javascript
let optedIn = false;
try {
  optedIn = _hasUser(projectRoot);
} catch {
  optedIn = false;
}
if (!optedIn) {
  return { status: 'skipped', reason: 'opted_out' };
}
```

## Behavioral Decision (from analysis)

**Interactive vs programmatic invocation (per user direction):**

| Entry point | Invocation context | Behavior when opted out |
|---|---|---|
| `isdlc-embedding generate` (direct CLI) | Interactive TTY | **Prompt** user to opt in first; warn that without opt-in, embeddings won't be consumed by /discover, finalize, or search. If user confirms opt-in, write the config block and proceed. If user declines, abort. |
| `/discover` Step 7.9 | Programmatic (unattended) | Hard-skip with informational note in the discover completion banner |
| `finalize` F0009 | Programmatic | Hard-skip (already correct) |
| `isdlc-embedding server start` | Interactive or daemon | Refuse to start with a clear message; point at `isdlc-embedding configure` |
| `isdlc-embedding-mcp.js` | Session start (unattended) | Log skip notice to stderr, exit cleanly |
