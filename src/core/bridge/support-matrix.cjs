'use strict';

/**
 * CJS Bridge — Provider Support Matrix (REQ-0122 FR-004)
 *
 * Re-exports ESM support-matrix.js for CommonJS consumers (hooks, CLI).
 * Lazy-loads the ESM module on first call.
 *
 * @module src/core/bridge/support-matrix
 */

let _module;

async function load() {
  if (!_module) {
    _module = await import('../providers/support-matrix.js');
  }
  return _module;
}

module.exports.getProviderSupportMatrix = async () => (await load()).getProviderSupportMatrix();
module.exports.getGovernanceDeltas = async () => (await load()).getGovernanceDeltas();
module.exports.getKnownLimitations = async () => (await load()).getKnownLimitations();
