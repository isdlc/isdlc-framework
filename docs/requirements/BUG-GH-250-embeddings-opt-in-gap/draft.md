# BUG-GH-250: FR-006 opt-in gap — isdlc-embedding generate and discover Step 7.9 ignore hasUserEmbeddingsConfig()

**Source**: github
**Source ID**: GH-250
**Type**: BUG
**Created**: 2026-04-11
**GitHub**: https://github.com/vihang-hub/isdlc-framework/issues/250

---

## Summary

FR-006 (REQ-GH-239) specifies embeddings opt-in via presence of the `embeddings` key in `.isdlc/config.json`. Two code paths currently bypass this contract and run unconditionally, silently bootstrapping embeddings even when the user opted out at install.

## Affected Code Paths

1. **`bin/isdlc-embedding.js:231-243`** (`generate` command)
   - Reads `.isdlc/config.json` but does NOT check `hasUserEmbeddingsConfig()`
   - If the `embeddings` block is absent, defaults to `provider: 'jina-code'` and proceeds
   - Should short-circuit with a skip message when opt-in is absent

2. **`src/claude/agents/discover-orchestrator.md:2566`** (Step 7.9: Execute EMBEDDING GENERATION)
   - Unconditionally invokes `npx isdlc-embedding generate .` during `/discover`
   - No check for `hasUserEmbeddingsConfig()` before running
   - Should gate Step 7.9 on the opt-in flag

## Expected Behavior

Both code paths should:
1. Call `hasUserEmbeddingsConfig(projectRoot)` from `src/core/config/config-service.js`
2. If it returns `false`: skip with an informational message pointing at `isdlc-embedding configure`
3. If it returns `true`: proceed as today

## Reference (Correct Implementation)

`src/core/finalize/refresh-code-embeddings.js:202` already respects the flag correctly via the `_hasUser` DI hook. That pattern should be mirrored in the two affected paths.

## Impact

- Users who opt out at install get embeddings silently bootstrapped anyway during `/discover`
- Violates Article X (Fail-Safe Defaults — opt-out via silence) and FR-006 contract
- May cause unexpected CPU/memory usage on first `/discover` run for users who explicitly declined

## Acceptance Criteria

- [ ] `isdlc-embedding generate` short-circuits with a skip message when `hasUserEmbeddingsConfig()` returns false
- [ ] `/discover` Step 7.9 checks the opt-in flag before invoking generate
- [ ] Skip messages point users at `isdlc-embedding configure` to enable later
- [ ] Existing opt-in behavior (when config is present) is unchanged
- [ ] Tests cover both code paths for opt-out and opt-in scenarios
