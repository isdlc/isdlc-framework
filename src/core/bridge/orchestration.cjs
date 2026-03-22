/**
 * CJS Bridge for src/core/orchestration/provider-runtime.js
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM
 * orchestration module via dynamic import(). Bridge-first-with-fallback
 * pattern: if ESM load fails, returns sensible defaults (fail-open
 * per Article X).
 *
 * Requirements: FR-007 (bridge), FR-008 (bridge), FR-001 (bridge)
 */

'use strict';

let _module;

async function load() {
  if (!_module) _module = await import('../orchestration/provider-runtime.js');
  return _module;
}

module.exports = {
  async createProviderRuntime(providerName, config) {
    const m = await load();
    return m.createProviderRuntime(providerName, config);
  },

  async validateProviderRuntime(runtime) {
    const m = await load();
    return m.validateProviderRuntime(runtime);
  },

  async getKnownProviders() {
    const m = await load();
    return m.getKnownProviders();
  },

  async PROVIDER_RUNTIME_INTERFACE() {
    const m = await load();
    return m.PROVIDER_RUNTIME_INTERFACE;
  },

  async TASK_RESULT_FIELDS() {
    const m = await load();
    return m.TASK_RESULT_FIELDS;
  },

  async KNOWN_PROVIDERS() {
    const m = await load();
    return m.KNOWN_PROVIDERS;
  }
};
