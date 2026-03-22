/**
 * ProviderRuntime Interface Contract
 *
 * Defines the contract between provider-neutral orchestration and
 * provider-specific execution adapters. Each provider (Claude Code,
 * Codex, Antigravity) implements this interface in its own runtime.js.
 *
 * Requirements: FR-001 (AC-001-01..02), FR-002 (AC-002-01..03),
 *   FR-003..FR-006, FR-007 (AC-007-01..03), FR-008 (AC-008-01..02)
 * Source: GitHub #194 (CODEX-059)
 * Dependencies: REQ-0094 (team spec model), REQ-0114 (Codex adapter)
 *
 * @module src/core/orchestration/provider-runtime
 */

// ---------------------------------------------------------------------------
// Constants — all frozen per AC-001-01
// ---------------------------------------------------------------------------

/**
 * Interface definition listing all required methods and their signatures.
 * Every provider runtime adapter must implement these methods.
 *
 * @type {Readonly<Object>}
 */
export const PROVIDER_RUNTIME_INTERFACE = Object.freeze({
  methods: Object.freeze([
    'executeTask',
    'executeParallel',
    'presentInteractive',
    'readUserResponse',
    'validateRuntime'
  ]),
  executeTask: Object.freeze({
    params: Object.freeze(['phase', 'agent', 'context']),
    returns: 'TaskResult'
  }),
  executeParallel: Object.freeze({
    params: Object.freeze(['tasks']),
    returns: 'TaskResult[]'
  }),
  presentInteractive: Object.freeze({
    params: Object.freeze(['prompt']),
    returns: 'string'
  }),
  readUserResponse: Object.freeze({
    params: Object.freeze(['options']),
    returns: 'string'
  }),
  validateRuntime: Object.freeze({
    params: Object.freeze([]),
    returns: 'ValidationResult'
  })
});

/**
 * Required fields in a TaskResult object returned by executeTask/executeParallel.
 * AC-002-02: { status, output, duration_ms, error? }
 *
 * @type {Readonly<string[]>}
 */
export const TASK_RESULT_FIELDS = Object.freeze([
  'status',
  'output',
  'duration_ms',
  'error'
]);

/**
 * Known provider names that the framework supports out of the box.
 * AC-007-02: claude, codex, antigravity.
 *
 * @type {Readonly<string[]>}
 */
export const KNOWN_PROVIDERS = Object.freeze([
  'claude',
  'codex',
  'antigravity'
]);

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Validate that a runtime object implements all required interface methods.
 * AC-008-01: Checks all required methods exist and are functions.
 * AC-008-02: Returns { valid: boolean, missing: string[] }.
 *
 * @param {*} runtime - Object to validate
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateProviderRuntime(runtime) {
  const methods = PROVIDER_RUNTIME_INTERFACE.methods;
  const missing = [];

  for (const method of methods) {
    if (!runtime || typeof runtime !== 'object' || typeof runtime[method] !== 'function') {
      missing.push(method);
    }
  }

  return { valid: missing.length === 0, missing };
}

/**
 * Create a provider runtime by dynamically importing the provider adapter.
 *
 * AC-007-01: Returns a runtime implementing the interface.
 * AC-007-02: Throws on unknown provider name with available providers listed.
 * AC-007-03: Lazy-loads provider adapters via dynamic import.
 *
 * @param {string} providerName - Provider identifier (e.g. 'claude', 'codex')
 * @param {Object} config - Configuration to pass to the provider adapter
 * @returns {Promise<Object>} Validated provider runtime
 * @throws {Error} ERR-RUNTIME-001 for unknown provider or import failure
 * @throws {Error} ERR-RUNTIME-002 for invalid runtime (missing methods)
 */
export async function createProviderRuntime(providerName, config) {
  // Validate provider name is known
  if (!providerName || !KNOWN_PROVIDERS.includes(providerName)) {
    const available = KNOWN_PROVIDERS.join(', ');
    throw new Error(
      `ERR-RUNTIME-001: Unknown provider "${providerName}". Available: ${available}`
    );
  }

  // Dynamic import of the provider's runtime module
  let providerModule;
  try {
    providerModule = await import(`../../providers/${providerName}/runtime.js`);
  } catch (importError) {
    throw new Error(
      `ERR-RUNTIME-001: Failed to load runtime for provider "${providerName}". ` +
      `Ensure src/providers/${providerName}/runtime.js exists and exports a ` +
      `createRuntime function or default export. Original error: ${importError.message}`
    );
  }

  // Get the runtime from the module (prefer createRuntime, fall back to default)
  const factory = providerModule.createRuntime || providerModule.default;
  if (typeof factory !== 'function') {
    throw new Error(
      `ERR-RUNTIME-002: Provider "${providerName}" module does not export ` +
      `a createRuntime function or default export.`
    );
  }

  const runtime = await factory(config);

  // Validate the returned runtime implements the interface
  const validation = validateProviderRuntime(runtime);
  if (!validation.valid) {
    throw new Error(
      `ERR-RUNTIME-002: Provider "${providerName}" runtime missing methods: ` +
      `${validation.missing.join(', ')}`
    );
  }

  return runtime;
}

/**
 * Get a copy of the known providers array.
 * Returns a fresh copy so callers cannot mutate the internal list.
 *
 * @returns {string[]} Copy of KNOWN_PROVIDERS
 */
export function getKnownProviders() {
  return [...KNOWN_PROVIDERS];
}
