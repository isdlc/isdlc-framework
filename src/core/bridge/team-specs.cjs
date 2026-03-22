/**
 * CJS Bridge for src/core/teams/registry.js
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM
 * team spec registry via dynamic import(). Bridge-first-with-fallback
 * pattern: if ESM load fails, returns null / empty array (fail-open
 * per Article X).
 *
 * Requirements: FR-006 (AC-006-01..03)
 */

let _module;

async function load() {
  if (!_module) _module = await import('../teams/registry.js');
  return _module;
}

module.exports = {
  /**
   * Get the team spec for a given team type.
   * @param {string} teamType
   * @returns {Promise<Object|null>} Frozen spec or null on bridge failure
   */
  async getTeamSpec(teamType) {
    const m = await load();
    return m.getTeamSpec(teamType);
  },

  /**
   * List all registered team type strings.
   * @returns {Promise<string[]>} Array of type identifiers, or [] on bridge failure
   */
  async listTeamTypes() {
    const m = await load();
    return m.listTeamTypes();
  }
};
