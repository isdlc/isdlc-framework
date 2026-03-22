# Module Design: REQ-0128 — ProviderRuntime Interface

## provider-runtime.js

### Constants

PROVIDER_RUNTIME_INTERFACE — frozen object:
- methods: ['executeTask', 'executeParallel', 'presentInteractive', 'readUserResponse', 'validateRuntime']
- executeTask: { params: ['phase', 'agent', 'context'], returns: 'TaskResult' }
- executeParallel: { params: ['tasks'], returns: 'TaskResult[]' }
- presentInteractive: { params: ['prompt'], returns: 'string' }
- readUserResponse: { params: ['options'], returns: 'string' }
- validateRuntime: { params: [], returns: 'ValidationResult' }

TASK_RESULT_FIELDS — frozen: ['status', 'output', 'duration_ms', 'error']

KNOWN_PROVIDERS — frozen: ['claude', 'codex', 'antigravity']

### Functions

createProviderRuntime(providerName, config):
1. Validate providerName is in KNOWN_PROVIDERS (or extensible via config.custom_providers)
2. Dynamic import: await import(`../../providers/${providerName}/runtime.js`)
3. Call the module's default export or createRuntime(config) function
4. Validate the returned object with validateProviderRuntime()
5. Return the validated runtime
Throws: ERR-RUNTIME-001 (unknown provider), ERR-RUNTIME-002 (invalid runtime)

validateProviderRuntime(runtime):
1. Check runtime is non-null object
2. For each method in PROVIDER_RUNTIME_INTERFACE.methods: check typeof runtime[method] === 'function'
3. Return { valid: boolean, missing: string[] }

getKnownProviders():
Returns [...KNOWN_PROVIDERS]

### Error Taxonomy
- ERR-RUNTIME-001: Unknown provider "{name}". Available: [...]
- ERR-RUNTIME-002: Provider runtime missing methods: [...]

## bridge/orchestration.cjs
Bridge-first-with-fallback: createProviderRuntime, validateProviderRuntime, getKnownProviders, PROVIDER_RUNTIME_INTERFACE.

~30 lines.
