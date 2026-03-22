/**
 * CJS Bridge for src/core/skills/injection-planner.js
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM
 * skill injection planner via dynamic import(). Bridge-first-with-fallback
 * pattern: if ESM load fails, returns empty plan (fail-open per Article X).
 *
 * Requirements: REQ-0126 (bridge)
 */

let _module;

async function load() {
  if (!_module) _module = await import('../skills/injection-planner.js');
  return _module;
}

module.exports = {
  /**
   * Compute the skill injection plan for a phase delegation.
   * @param {string} workflow - Workflow type
   * @param {string} phase - Phase key
   * @param {string} agent - Agent name
   * @param {Object} [options] - Optional overrides
   * @returns {Promise<{builtIn: Array, external: Array, merged: Array}>}
   */
  async computeInjectionPlan(workflow, phase, agent, options) {
    const m = await load();
    return m.computeInjectionPlan(workflow, phase, agent, options);
  }
};
