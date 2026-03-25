/**
 * CJS Bridge for src/core/validators/ modules
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM validator modules.
 * Synchronous functions load the ESM module via dynamic import and cache it.
 *
 * REQ-0081: Extract ValidatorEngine
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

'use strict';

let _gateLogicModule;
let _profileLoaderModule;
let _gateRequirementsModule;
let _validatePhaseModule;

// =========================================================================
// Lazy loaders
// =========================================================================

async function loadGateLogic() {
  if (!_gateLogicModule) _gateLogicModule = await import('../validators/gate-logic.js');
  return _gateLogicModule;
}

async function loadProfileLoader() {
  if (!_profileLoaderModule) _profileLoaderModule = await import('../validators/profile-loader.js');
  return _profileLoaderModule;
}

async function loadGateRequirements() {
  if (!_gateRequirementsModule) _gateRequirementsModule = await import('../validators/gate-requirements.js');
  return _gateRequirementsModule;
}

// BUG-0057: Lazy loader for validate-phase ESM module
async function loadValidatePhase() {
  if (!_validatePhaseModule) _validatePhaseModule = await import('../validators/validate-phase.js');
  return _validatePhaseModule;
}

// =========================================================================
// Sync preload cache
// =========================================================================

let _syncGateLogic = null;
let _syncProfileLoader = null;
let _syncGateRequirements = null;
let _syncValidatePhase = null;

// =========================================================================
// Gate Logic functions
// =========================================================================

function mergeRequirements(base, overrides) {
  if (_syncGateLogic) return _syncGateLogic.mergeRequirements(base, overrides);
  return _mergeRequirementsSync(base, overrides);
}

function isGateAdvancementAttempt(input, helpers) {
  if (_syncGateLogic) return _syncGateLogic.isGateAdvancementAttempt(input, helpers);
  return false; // fail-open before preload
}

function checkTestIterationRequirement(phaseState, phaseRequirements) {
  if (_syncGateLogic) return _syncGateLogic.checkTestIterationRequirement(phaseState, phaseRequirements);
  return { satisfied: true, reason: 'bridge_not_loaded' };
}

function checkConstitutionalRequirement(phaseState, phaseRequirements) {
  if (_syncGateLogic) return _syncGateLogic.checkConstitutionalRequirement(phaseState, phaseRequirements);
  return { satisfied: true, reason: 'bridge_not_loaded' };
}

function checkElicitationRequirement(phaseState, phaseRequirements) {
  if (_syncGateLogic) return _syncGateLogic.checkElicitationRequirement(phaseState, phaseRequirements);
  return { satisfied: true, reason: 'bridge_not_loaded' };
}

function checkAgentDelegationRequirement(phaseState, phaseRequirements, state, currentPhase, manifest, helpers) {
  if (_syncGateLogic) return _syncGateLogic.checkAgentDelegationRequirement(phaseState, phaseRequirements, state, currentPhase, manifest, helpers);
  return { satisfied: true, reason: 'bridge_not_loaded' };
}

function checkArtifactPresenceRequirement(phaseState, phaseRequirements, state, currentPhase, helpers) {
  if (_syncGateLogic) return _syncGateLogic.checkArtifactPresenceRequirement(phaseState, phaseRequirements, state, currentPhase, helpers);
  return { satisfied: true, reason: 'bridge_not_loaded' };
}

function check(ctx) {
  if (_syncGateLogic) return _syncGateLogic.check(ctx);
  return { decision: 'allow' }; // fail-open
}

// BUG-0057: Async traceability check via core validators
async function checkTraceabilityRequirement(phaseState, phaseRequirements, inputs) {
  if (_syncGateLogic) return _syncGateLogic.checkTraceabilityRequirement(phaseState, phaseRequirements, inputs);
  return { satisfied: true, reason: 'bridge_not_loaded' };
}

// BUG-0057: Async validatePhase via core validators
async function validatePhase(phaseKey, inputs, options) {
  try {
    const mod = await loadValidatePhase();
    return mod.validatePhase(phaseKey, inputs, options);
  } catch (err) {
    return { pass: true, failures: [], details: {}, validator_errors: ['bridge_error: ' + err.message] };
  }
}

// =========================================================================
// Profile Loader functions
// =========================================================================

function resolveProfileOverrides(profileName, currentPhase, registry) {
  if (_syncProfileLoader) return _syncProfileLoader.resolveProfileOverrides(profileName, currentPhase, registry);
  return null;
}

function loadAllProfiles(projectRoot) {
  if (_syncProfileLoader) return _syncProfileLoader.loadAllProfiles(projectRoot);
  return { profiles: new Map(), sources: { builtin: [], project: [], personal: [] } };
}

function validateProfile(filePath) {
  if (_syncProfileLoader) return _syncProfileLoader.validateProfile(filePath);
  return { valid: false, errors: [{ field: '_file', message: 'bridge_not_loaded' }], suggestions: [] };
}

function healProfile(filePath, fixes) {
  if (_syncProfileLoader) return _syncProfileLoader.healProfile(filePath, fixes);
  return false;
}

function resolveProfile(name, registry) {
  if (_syncProfileLoader) return _syncProfileLoader.resolveProfile(name, registry);
  return null;
}

function matchProfileByTrigger(input, registry) {
  if (_syncProfileLoader) return _syncProfileLoader.matchProfileByTrigger(input, registry);
  return null;
}

function checkThresholdWarnings(profile) {
  if (_syncProfileLoader) return _syncProfileLoader.checkThresholdWarnings(profile);
  return [];
}

// =========================================================================
// Gate Requirements functions
// =========================================================================

function buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot, phases, state, resolveCoverage) {
  if (_syncGateRequirements) return _syncGateRequirements.buildGateRequirementsBlock(phaseKey, artifactFolder, workflowType, projectRoot, phases, state, resolveCoverage);
  return '';
}

function formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers, isIntermediatePhase, state, resolveCoverage) {
  if (_syncGateRequirements) return _syncGateRequirements.formatBlock(phaseKey, phaseReq, resolvedPaths, articleMap, workflowModifiers, isIntermediatePhase, state, resolveCoverage);
  return '';
}

function buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediatePhase, state, resolveCoverage) {
  if (_syncGateRequirements) return _syncGateRequirements.buildCriticalConstraints(phaseKey, phaseReq, workflowModifiers, isIntermediatePhase, state, resolveCoverage);
  return [];
}

function buildConstraintReminder(constraints) {
  if (_syncGateRequirements) return _syncGateRequirements.buildConstraintReminder(constraints);
  if (!Array.isArray(constraints) || constraints.length === 0) return '';
  return 'REMINDER: ' + constraints.join(' ');
}

// =========================================================================
// Inline sync fallback for mergeRequirements (always needed synchronously)
// =========================================================================

function _mergeRequirementsSync(base, overrides) {
  if (!base) return overrides;
  if (!overrides) return base;
  const merged = JSON.parse(JSON.stringify(base));
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      merged[key] = _mergeRequirementsSync(merged[key] || {}, value);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

// =========================================================================
// Preload
// =========================================================================

async function preload() {
  const [gl, pl, gr, vp] = await Promise.all([
    loadGateLogic(), loadProfileLoader(), loadGateRequirements(), loadValidatePhase()
  ]);
  _syncGateLogic = gl;
  _syncProfileLoader = pl;
  _syncGateRequirements = gr;
  _syncValidatePhase = vp;
}

module.exports = {
  // Gate Logic
  mergeRequirements,
  isGateAdvancementAttempt,
  checkTestIterationRequirement,
  checkConstitutionalRequirement,
  checkElicitationRequirement,
  checkAgentDelegationRequirement,
  checkArtifactPresenceRequirement,
  checkTraceabilityRequirement,
  check,

  // BUG-0057: Phase validation
  validatePhase,

  // Profile Loader
  resolveProfileOverrides,
  loadAllProfiles,
  validateProfile,
  healProfile,
  resolveProfile,
  matchProfileByTrigger,
  checkThresholdWarnings,

  // Gate Requirements
  buildGateRequirementsBlock,
  formatBlock,
  buildCriticalConstraints,
  buildConstraintReminder,

  // Optimization
  preload
};
