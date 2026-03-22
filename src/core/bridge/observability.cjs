/**
 * CJS Bridge for src/core/observability/ modules
 *
 * REQ-0092: Extract observability hooks to core
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

'use strict';

let _observabilityModule;

async function loadObservability() {
  if (!_observabilityModule) _observabilityModule = await import('../observability/index.js');
  return _observabilityModule;
}

let _syncObservability = null;

// =========================================================================
// Sync wrappers with inline fallbacks
// =========================================================================

function logEvent(category, event, details) {
  if (_syncObservability) return _syncObservability.logEvent(category, event, details);
  return { logged: true, entry: { timestamp: new Date().toISOString(), category, event, ...details } };
}

function trackMenuInteraction(activity, elicitState) {
  if (_syncObservability) return _syncObservability.trackMenuInteraction(activity, elicitState);
  return { elicitState, outputMessage: '' };
}

function trackWalkthrough(state) {
  if (_syncObservability) return _syncObservability.trackWalkthrough(state);
  return { shouldWarn: false, message: '' };
}

function checkReviewReminder(state) {
  if (_syncObservability) return _syncObservability.checkReviewReminder(state);
  return { shouldRemind: false, message: '' };
}

function detectPermissionAsking(text) {
  if (_syncObservability) return _syncObservability.detectPermissionAsking(text);
  return { found: false, pattern: '' };
}

function detectMenuHaltViolation(text) {
  if (_syncObservability) return _syncObservability.detectMenuHaltViolation(text);
  return { violation: false, menuType: '', extraChars: 0 };
}

function extractPriorityResults(output) {
  if (_syncObservability) return _syncObservability.extractPriorityResults(output);
  return { p0Pass: 0, p0Fail: 0, p0Skip: 0, p1Pass: 0, p1Fail: 0, p1Skip: 0, p2Pass: 0, p2Fail: 0, p2Skip: 0, p3Pass: 0, p3Fail: 0, p3Skip: 0 };
}

function checkPriorityViolations(results) {
  if (_syncObservability) return _syncObservability.checkPriorityViolations(results);
  return [];
}

// =========================================================================
// Preload
// =========================================================================

async function preload() {
  _syncObservability = await loadObservability();
}

module.exports = {
  logEvent,
  trackMenuInteraction,
  trackWalkthrough,
  checkReviewReminder,
  detectPermissionAsking,
  detectMenuHaltViolation,
  extractPriorityResults,
  checkPriorityViolations,
  preload
};
