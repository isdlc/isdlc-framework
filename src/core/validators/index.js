/**
 * Validators Module — Re-exports
 *
 * REQ-0081: Extract ValidatorEngine
 *
 * @module src/core/validators
 */

export {
  mergeRequirements,
  isGateAdvancementAttempt,
  checkTestIterationRequirement,
  checkConstitutionalRequirement,
  checkElicitationRequirement,
  checkAgentDelegationRequirement,
  checkArtifactPresenceRequirement,
  loadArtifactPaths,
  getArtifactPathsForPhase,
  resolveArtifactPaths,
  check
} from './gate-logic.js';

export {
  loadAllProfiles,
  resolveProfile,
  matchProfileByTrigger,
  resolveProfileOverrides,
  validateProfile,
  healProfile,
  checkThresholdWarnings,
  levenshtein,
  findClosestMatch,
  getBuiltinProfilesDir,
  getProjectProfilesDir,
  getPersonalProfilesDir,
  KNOWN_OVERRIDE_KEYS
} from './profile-loader.js';

export {
  buildGateRequirementsBlock,
  loadIterationRequirements as loadIterationRequirementsForInjector,
  loadArtifactPaths as loadArtifactPathsForInjector,
  parseConstitutionArticles,
  loadWorkflowModifiers,
  resolveTemplateVars,
  deepMerge as deepMergeInjector,
  formatBlock,
  buildCriticalConstraints,
  buildConstraintReminder
} from './gate-requirements.js';

export {
  validateAndProduceEvidence
} from './enforcement.js';
