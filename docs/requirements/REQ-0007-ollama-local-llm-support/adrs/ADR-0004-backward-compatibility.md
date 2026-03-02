# ADR-0004: Backward Compatibility Strategy

## Status
Accepted

## Context
NFR-002 requires that existing Anthropic API users are not affected by Ollama enablement. The metric is: "All existing tests pass without modification."

The primary risk is that changes to `provider-utils.cjs` and `model-provider-router.cjs` could affect the provider routing for ALL users, not just those opting into Ollama.

## Decision
Preserve the existing **`hasProvidersConfig()` guard clause** in `model-provider-router.cjs` (line 54) as the backward compatibility mechanism.

```javascript
// model-provider-router.cjs, line 54
if (!hasProvidersConfig()) {
    debugLog('No providers.yaml found, using default Anthropic');
    process.exit(0);
    return;
}
```

This guard ensures that:
1. When no `.isdlc/providers.yaml` exists (all current users), the router exits immediately
2. Claude Code uses its built-in Anthropic connection (no interference from the provider system)
3. The `autoDetectProvider()` function is never called for these users
4. The `selectProvider()` function is never called for these users

The only code path that reaches the new auto-detection logic is:
```
hasProvidersConfig() === true
  --> loadProvidersConfig()
    --> selectProvider()
      --> (may call autoDetectProvider() if provider is 'ollama')
```

This code path is only activated when:
- The user ran the new installer and selected a provider (creating `.isdlc/providers.yaml`)
- OR the user manually created `.isdlc/providers.yaml`
- OR the user ran `/provider init`

### Additional Safeguards

1. **Router fail-open**: The router's top-level catch block (lines 146-155) always calls `process.exit(0)`, allowing the operation to proceed on any error
2. **Config loader fallback**: `loadProvidersConfig()` returns `getMinimalDefaultConfig()` (Anthropic-only) if config loading fails
3. **No changes to existing function signatures**: `selectProvider()`, `selectWithFallback()`, and `getEnvironmentOverrides()` retain their existing signatures and behavior
4. **New function only**: The only new export is `autoDetectProvider()`, which does not affect any existing callers

### Test Verification

NFR-002 is verified by running the full test suite (`npm test`) after implementation. The test suite must pass without modification, confirming that the existing behavior is unchanged.

## Consequences

**Positive:**
- Zero risk to existing users who have not opted into multi-provider
- The guard clause is a simple, well-understood mechanism (boolean check)
- No conditional logic spread across multiple files -- the guard is in one place
- The router's fail-open design provides a second safety net

**Negative:**
- Users must explicitly opt in to multi-provider (by running the new installer or creating providers.yaml)
- The guard means that `autoDetectProvider()` only works for users who have gone through the install step
- This is intentional: it prevents accidental provider switching for users who expect Anthropic

## Alternatives Considered

### Feature flag in state.json
- Pro: More granular control
- Con: Adds complexity; `model-provider-router.cjs` would need to read `state.json` before the existing guard clause
- Rejected because: The existing guard is sufficient and simpler

### Environment variable opt-in
- Pro: No file system check needed
- Con: Requires users to set an env var, which contradicts NFR-001 (zero-config)
- Rejected because: Adds manual configuration step

## Traces
- NFR-002: Backward compatibility (all existing tests pass)
- Article X: Fail-safe defaults (router fails open)
- Article XIV: Backward-compatible installation
