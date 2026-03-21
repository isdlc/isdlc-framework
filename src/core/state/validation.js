/**
 * State Validation — REQ-0080 Group D
 *
 * Validation logic for state.json writes, extracted from state-logic.cjs.
 * Validates phase data for suspicious patterns (fail-open: warns but does not block).
 *
 * @module src/core/state/validation
 */

/**
 * Validate a single phase's state data for suspicious patterns.
 *
 * Rules checked:
 *   V1: constitutional_validation.completed requires iterations_used >= 1
 *   V2: interactive_elicitation.completed requires menu_interactions >= 1
 *   V3: test_iteration.completed requires current_iteration >= 1
 *
 * @param {string} phaseName - The phase key (e.g., '06-implementation')
 * @param {object} phaseData - The phase data object
 * @param {string} [filePath=''] - Optional file path for warning messages
 * @returns {string[]} Array of warning messages (empty if valid)
 */
export function validatePhase(phaseName, phaseData, filePath = '') {
  const warnings = [];

  if (!phaseData || typeof phaseData !== 'object') {
    return warnings;
  }

  // Rule V1: constitutional_validation
  const constVal = phaseData.constitutional_validation;
  if (constVal && constVal.completed === true) {
    const iters = constVal.iterations_used;
    if (iters === undefined || iters === null || iters < 1) {
      warnings.push(
        `[state-write-validator] WARNING: Suspicious state.json write detected.\n` +
        `  Phase: ${phaseName}\n` +
        `  Issue: constitutional_validation.completed is true but iterations_used is ${iters}\n` +
        `  Rule: A completed constitutional validation must have at least 1 iteration\n` +
        `  Path: ${filePath}`
      );
    }
  }

  // Rule V2: interactive_elicitation
  const elicit = phaseData.iteration_requirements?.interactive_elicitation;
  if (elicit && elicit.completed === true) {
    const menuCount = elicit.menu_interactions;
    if (menuCount === undefined || menuCount === null || menuCount < 1) {
      warnings.push(
        `[state-write-validator] WARNING: Suspicious state.json write detected.\n` +
        `  Phase: ${phaseName}\n` +
        `  Issue: interactive_elicitation.completed is true but menu_interactions is ${menuCount}\n` +
        `  Rule: A completed elicitation must have at least 1 menu interaction\n` +
        `  Path: ${filePath}`
      );
    }
  }

  // Rule V3: test_iteration
  const testIter = phaseData.iteration_requirements?.test_iteration;
  if (testIter && testIter.completed === true) {
    const iterCount = testIter.current_iteration;
    if (iterCount === undefined || iterCount === null || iterCount < 1) {
      warnings.push(
        `[state-write-validator] WARNING: Suspicious state.json write detected.\n` +
        `  Phase: ${phaseName}\n` +
        `  Issue: test_iteration.completed is true but current_iteration is ${iterCount}\n` +
        `  Rule: A completed test iteration must have at least 1 test run\n` +
        `  Path: ${filePath}`
      );
    }
  }

  return warnings;
}

/**
 * Validate the entire state object before writing.
 * Runs all validation rules across all phases.
 * Fail-open: returns warnings but does not block writes (Article X).
 *
 * @param {object|null} state - The full state object
 * @returns {string[]} Array of warning messages (empty if valid)
 */
export function validateStateWrite(state) {
  const warnings = [];

  if (!state || typeof state !== 'object') {
    return warnings;
  }

  const phases = state.phases;
  if (!phases || typeof phases !== 'object') {
    return warnings;
  }

  for (const [phaseName, phaseData] of Object.entries(phases)) {
    if (!phaseData || typeof phaseData !== 'object') continue;
    warnings.push(...validatePhase(phaseName, phaseData));
  }

  return warnings;
}
