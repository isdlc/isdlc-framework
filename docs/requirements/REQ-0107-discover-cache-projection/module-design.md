# Module Design: REQ-0107 — Discover Cache/Projection Refresh

## projection-chain.js
Frozen trigger chain array with 4 steps. Each step marks whether it's provider-neutral or provider-specific.

Exports: getProjectionChain(), getProviderNeutralSteps(), getProviderSpecificSteps()

~40 lines.
