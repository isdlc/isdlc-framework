/**
 * CJS Bridge for src/core/validators/checkpoint-router.js
 *
 * REQ-0093: Extract dispatcher routing to core
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

'use strict';

let _routerModule;

async function loadRouter() {
  if (!_routerModule) _routerModule = await import('../validators/checkpoint-router.js');
  return _routerModule;
}

let _syncRouter = null;

// =========================================================================
// Sync wrappers with inline fallbacks
// =========================================================================

function routeCheckpoint(hookType, toolName, context) {
  if (_syncRouter) return _syncRouter.routeCheckpoint(hookType, toolName, context);
  // Fallback: return empty routing (dispatcher uses its own hardcoded list)
  return { validators: [], guards: [], observers: [] };
}

function getKnownHookTypes() {
  if (_syncRouter) return _syncRouter.getKnownHookTypes();
  return [];
}

function getRoutingTable(hookType) {
  if (_syncRouter) return _syncRouter.getRoutingTable(hookType);
  return null;
}

// =========================================================================
// Preload
// =========================================================================

async function preload() {
  _syncRouter = await loadRouter();
}

module.exports = {
  routeCheckpoint,
  getKnownHookTypes,
  getRoutingTable,
  preload
};
