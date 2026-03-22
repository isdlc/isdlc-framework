/**
 * CJS Bridge for src/core/discover/index.js
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM
 * discover module via dynamic import(). Bridge-first-with-fallback
 * pattern per ADR-CODEX-006.
 *
 * Requirements: REQ-0103..0107 (CJS bridge)
 */

let _module;

async function load() {
  if (!_module) _module = await import('../discover/index.js');
  return _module;
}

module.exports = {
  async getDiscoverMode(modeId) {
    const m = await load();
    return m.getDiscoverMode(modeId);
  },

  async getAgentGroup(groupId) {
    const m = await load();
    return m.getAgentGroup(groupId);
  },

  async listDiscoverModes() {
    const m = await load();
    return m.listDiscoverModes();
  },

  async listAgentGroups() {
    const m = await load();
    return m.listAgentGroups();
  },

  async getMenu(menuId) {
    const m = await load();
    return m.getMenu(menuId);
  },

  async getWalkthrough(modeId) {
    const m = await load();
    return m.getWalkthrough(modeId);
  },

  async getDistillationConfig() {
    const m = await load();
    return m.getDistillationConfig();
  },

  async getReconciliationRules() {
    const m = await load();
    return m.getReconciliationRules();
  },

  async getProjectionChain() {
    const m = await load();
    return m.getProjectionChain();
  },

  async getProviderNeutralSteps() {
    const m = await load();
    return m.getProviderNeutralSteps();
  },

  async getProviderSpecificSteps() {
    const m = await load();
    return m.getProviderSpecificSteps();
  },

  async createInitialDiscoverState(mode, depth) {
    const m = await load();
    return m.createInitialDiscoverState(mode, depth);
  },

  async computeResumePoint(state) {
    const m = await load();
    return m.computeResumePoint(state);
  },

  async isDiscoverComplete(state) {
    const m = await load();
    return m.isDiscoverComplete(state);
  },

  async markStepComplete(state, stepId) {
    const m = await load();
    return m.markStepComplete(state, stepId);
  }
};
