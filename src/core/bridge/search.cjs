/**
 * CJS Bridge for src/core/search/ modules
 *
 * REQ-0084: Extract search/memory service boundaries
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

'use strict';

let _searchModule;

async function loadSearch() {
  if (!_searchModule) _searchModule = await import('../search/index.js');
  return _searchModule;
}

let _syncSearch = null;

// =========================================================================
// Search Setup functions
// =========================================================================

function buildSearchConfig(detection, installResults) {
  if (_syncSearch) return _syncSearch.SearchSetupService.buildSearchConfig(detection, installResults);
  return _buildSearchConfigSync(detection, installResults);
}

// Inline sync fallback
function _buildSearchConfigSync(detection, installResults) {
  const scaleTier = (detection && detection.scaleTier) ? detection.scaleTier : 'small';
  const activeBackends = ['grep-glob'];
  const backendConfigs = {};
  if (Array.isArray(installResults)) {
    for (const result of installResults) {
      if (result.success && result.tool) {
        activeBackends.push(result.tool);
        backendConfigs[result.tool] = { enabled: true };
      }
    }
  }
  return { enabled: true, activeBackends, preferredModality: 'lexical', cloudAllowed: false, scaleTier, backendConfigs };
}

// =========================================================================
// Preload
// =========================================================================

async function preload() {
  const s = await loadSearch();
  _syncSearch = s;
}

module.exports = {
  buildSearchConfig,
  preload
};
