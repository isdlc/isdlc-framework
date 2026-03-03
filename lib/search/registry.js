/**
 * Search Backend Registry
 *
 * Maintains the registry of available search backends with their capabilities,
 * health status, and priority ordering. The grep-glob backend is always registered
 * as a baseline and cannot be removed.
 *
 * REQ-0041 / FR-002: Search Backend Registry
 * @module lib/search/registry
 */

/** @typedef {'lexical'|'structural'|'semantic'|'indexed'|'lsp'} Modality */
/** @typedef {'healthy'|'degraded'|'unavailable'} HealthStatus */

const VALID_MODALITIES = new Set(['lexical', 'structural', 'semantic', 'indexed', 'lsp']);
const VALID_HEALTH = new Set(['healthy', 'degraded', 'unavailable']);
const BASELINE_ID = 'grep-glob';

/**
 * @typedef {Object} BackendDescriptor
 * @property {string} id - Unique identifier
 * @property {Modality} modality - Primary modality
 * @property {number} priority - Priority within modality (higher = preferred)
 * @property {HealthStatus} health - Current health status
 * @property {Object} adapter - The backend implementation with search() and healthCheck()
 */

/**
 * Create a new backend registry instance.
 * @returns {Object} Registry API
 */
export function createRegistry() {
  /** @type {Map<string, BackendDescriptor>} */
  const backends = new Map();

  /**
   * Register a search backend.
   * Duplicate IDs replace the existing registration.
   *
   * @param {BackendDescriptor} descriptor
   * @throws {Error} If descriptor is missing required fields
   */
  function registerBackend(descriptor) {
    if (!descriptor || !descriptor.id) {
      throw new Error('Backend descriptor must have an id');
    }
    if (!VALID_MODALITIES.has(descriptor.modality)) {
      throw new Error(`Invalid modality: ${descriptor.modality}. Must be one of: ${[...VALID_MODALITIES].join(', ')}`);
    }
    if (typeof descriptor.priority !== 'number') {
      throw new Error('Backend descriptor must have a numeric priority');
    }

    const entry = {
      id: descriptor.id,
      modality: descriptor.modality,
      priority: descriptor.priority,
      health: descriptor.health || 'healthy',
      adapter: descriptor.adapter || null,
      displayName: descriptor.displayName || descriptor.id,
      requiresMcp: descriptor.requiresMcp || false,
    };

    backends.set(descriptor.id, entry);
  }

  /**
   * Get the best available (healthy) backend for a given modality.
   * Returns the highest-priority healthy backend.
   * For modality 'any', returns the highest-priority healthy backend across all modalities.
   *
   * @param {Modality|'any'} modality
   * @returns {BackendDescriptor|null}
   */
  function getBestBackend(modality) {
    let candidates;

    if (modality === 'any') {
      candidates = [...backends.values()];
    } else {
      candidates = [...backends.values()].filter(b => b.modality === modality);
    }

    // Filter to healthy only
    const healthy = candidates.filter(b => b.health === 'healthy');

    if (healthy.length === 0) return null;

    // Sort by priority descending, pick first
    healthy.sort((a, b) => b.priority - a.priority);
    return healthy[0];
  }

  /**
   * Get all backends for a given modality, sorted by priority descending.
   * Includes unhealthy backends.
   *
   * @param {Modality|'any'} modality
   * @returns {BackendDescriptor[]}
   */
  function getBackendsForModality(modality) {
    let candidates;

    if (modality === 'any') {
      candidates = [...backends.values()];
    } else {
      candidates = [...backends.values()].filter(b => b.modality === modality);
    }

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates;
  }

  /**
   * Update health status for a backend.
   * The grep-glob backend cannot be made unhealthy.
   *
   * @param {string} backendId
   * @param {HealthStatus} status
   * @throws {Error} If status is invalid
   */
  function updateHealth(backendId, status) {
    if (!VALID_HEALTH.has(status)) {
      throw new Error(`Invalid health status: ${status}. Must be one of: ${[...VALID_HEALTH].join(', ')}`);
    }

    const backend = backends.get(backendId);
    if (!backend) return; // No-op for non-existent

    // Invariant: grep-glob is always healthy
    if (backendId === BASELINE_ID) return;

    backend.health = status;
  }

  /**
   * Get all registered backends.
   * @returns {BackendDescriptor[]}
   */
  function listBackends() {
    return [...backends.values()];
  }

  /**
   * Remove a backend from the registry.
   * The grep-glob backend cannot be removed.
   *
   * @param {string} backendId
   * @returns {boolean} True if removed
   */
  function removeBackend(backendId) {
    if (backendId === BASELINE_ID) return false;
    return backends.delete(backendId);
  }

  /**
   * Populate registry from project search configuration.
   * Re-registers backends based on config. Always ensures grep-glob is present.
   *
   * @param {import('./config.js').SearchConfig} config
   * @param {Object<string, Object>} [adapterMap] - Map of backend ID to adapter implementation
   */
  function loadFromConfig(config, adapterMap = {}) {
    // Preserve grep-glob if already registered
    const grepGlob = backends.get(BASELINE_ID);

    // Clear registry
    backends.clear();

    // Always re-register grep-glob
    if (grepGlob) {
      backends.set(BASELINE_ID, grepGlob);
    } else {
      registerBackend({
        id: BASELINE_ID,
        modality: 'lexical',
        priority: 0,
        health: 'healthy',
        displayName: 'Grep/Glob (built-in)',
        requiresMcp: false,
        adapter: adapterMap[BASELINE_ID] || null,
      });
    }

    // Register backends from config
    if (config && Array.isArray(config.activeBackends)) {
      for (const backendId of config.activeBackends) {
        if (backendId === BASELINE_ID) continue; // Already registered

        const backendConfig = config.backendConfigs?.[backendId] || {};
        if (backendConfig.enabled === false) continue;

        const adapter = adapterMap[backendId] || null;
        const modality = backendConfig.modality || inferModality(backendId);
        const priority = backendConfig.priority ?? inferPriority(backendId);

        registerBackend({
          id: backendId,
          modality,
          priority,
          health: 'healthy',
          adapter,
          displayName: backendConfig.displayName || backendId,
          requiresMcp: backendConfig.requiresMcp ?? true,
        });
      }
    }
  }

  /**
   * Check if any enhanced (non-baseline) backends are available and healthy.
   * @returns {boolean}
   */
  function hasEnhancedBackends() {
    for (const [id, backend] of backends) {
      if (id !== BASELINE_ID && backend.health === 'healthy') {
        return true;
      }
    }
    return false;
  }

  return {
    registerBackend,
    getBestBackend,
    getBackendsForModality,
    updateHealth,
    listBackends,
    removeBackend,
    loadFromConfig,
    hasEnhancedBackends,
  };
}

/**
 * Infer modality from backend ID (well-known mappings).
 * @param {string} backendId
 * @returns {Modality}
 */
function inferModality(backendId) {
  const map = {
    'ast-grep': 'structural',
    'probe': 'lexical',
    'zoekt': 'indexed',
    'code-index': 'indexed',
  };
  return map[backendId] || 'lexical';
}

/**
 * Infer priority from backend ID (well-known defaults).
 * @param {string} backendId
 * @returns {number}
 */
function inferPriority(backendId) {
  const map = {
    'ast-grep': 10,
    'probe': 10,
    'zoekt': 10,
    'code-index': 10,
  };
  return map[backendId] ?? 5;
}
