# REQ-0128: ProviderRuntime Interface Contract

**GitHub**: #194 (CODEX-059)
**Workstream**: G — Provider Abstraction
**Phase**: 10
**Dependencies**: REQ-0094 (team spec model), REQ-0114 (Codex adapter)

## Summary

Define the contract that all provider adapters (Claude, Codex, Cursor, Windsurf) must implement. A factory function creates the right adapter based on provider name. Follows the `spawnAgent(role, context)` callback pattern proven by the Codex adapter's implementation-loop-runner.

The ProviderRuntime interface sits between provider-neutral orchestration (`src/core/orchestration/`) and provider-specific execution (`src/providers/{name}/runtime.js`). Core orchestrators depend only on the interface — adding a new provider means implementing five methods.
