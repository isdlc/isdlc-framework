/**
 * CJS Bridge for src/core/teams/instance-registry.js
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM
 * team instance registry via dynamic import(). Bridge-first-with-fallback
 * pattern: if ESM load fails, returns null / empty array (fail-open
 * per Article X).
 *
 * Requirements: REQ-0095, REQ-0096, REQ-0097 (shared bridge)
 */

let _module;

async function load() {
  if (!_module) _module = await import('../teams/instance-registry.js');
  return _module;
}

module.exports = {
  /**
   * Get the team instance config for a given instance ID.
   * @param {string} instanceId
   * @returns {Promise<Object|null>} Frozen instance config or null on bridge failure
   */
  async getTeamInstance(instanceId) {
    const m = await load();
    return m.getTeamInstance(instanceId);
  },

  /**
   * List all registered team instance ID strings.
   * @returns {Promise<string[]>} Array of instance IDs, or [] on bridge failure
   */
  async listTeamInstances() {
    const m = await load();
    return m.listTeamInstances();
  },

  /**
   * Get all team instances matching a phase key.
   * @param {string} phase
   * @returns {Promise<Object[]>} Array of frozen instance configs, or [] on bridge failure
   */
  async getTeamInstancesByPhase(phase) {
    const m = await load();
    return m.getTeamInstancesByPhase(phase);
  }
};
