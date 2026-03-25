/**
 * Phase Validation Entry Point
 * ==============================
 * Single entry point that both Claude hooks (via CJS bridge) and Codex runtime
 * call to run all applicable validators for a phase.
 *
 * BUG-0057: Gate-blocker traceability verification (FR-007)
 * AC-007-01 through AC-007-05
 *
 * @module src/core/validators/validate-phase
 */

import { validateRequirementsToTests } from './traceability-validator.js';
import { validateTestImplementation } from './test-implementation-validator.js';
import { validateTestExecution } from './test-execution-validator.js';
import { validateCoveragePresence } from './coverage-presence-validator.js';
import { validateConstitutionalCompliance } from './constitutional-validator.js';

/**
 * Phase-to-validator mapping.
 * Defines which validators run for each phase.
 */
const PHASE_VALIDATORS = {
  '05-test-strategy': ['traceability', 'constitutional'],
  '06-implementation': ['testImplementation', 'coveragePresence', 'constitutional'],
  '07-testing': ['testExecution', 'coveragePresence', 'constitutional']
};

/**
 * Run all applicable validators for a phase.
 *
 * @param {string} phaseKey - e.g., "05-test-strategy", "06-implementation"
 * @param {object} inputs - Content strings for all artifacts
 * @param {object} [options={}] - Provider-specific options
 * @returns {Promise<{ pass: boolean, failures: object[], details: object, validator_errors: string[] }>}
 */
export async function validatePhase(phaseKey, inputs = {}, options = {}) {
  const applicableValidators = PHASE_VALIDATORS[phaseKey] || [];
  const validator_errors = [];

  const details = {
    traceability: null,
    testImplementation: null,
    testExecution: null,
    coveragePresence: null,
    constitutional: null
  };

  // Run validators 1-4 via Promise.all
  const fastValidators = [];

  if (applicableValidators.includes('traceability')) {
    fastValidators.push(
      runSafe('traceability', () =>
        validateRequirementsToTests(
          inputs.requirementsSpec || null,
          inputs.testStrategy || null
        ), validator_errors
      )
    );
  }

  if (applicableValidators.includes('testImplementation')) {
    fastValidators.push(
      runSafe('testImplementation', () =>
        validateTestImplementation(
          inputs.testStrategy || null,
          inputs.testFiles || null,
          inputs.modifiedFiles || null
        ), validator_errors
      )
    );
  }

  if (applicableValidators.includes('testExecution')) {
    fastValidators.push(
      runSafe('testExecution', () =>
        validateTestExecution(
          inputs.testStrategy || null,
          inputs.testExecutionOutput || null
        ), validator_errors
      )
    );
  }

  if (applicableValidators.includes('coveragePresence')) {
    fastValidators.push(
      runSafe('coveragePresence', () =>
        validateCoveragePresence(
          inputs.testExecutionOutput || null,
          {
            required: options.coverageRequired !== false,
            threshold: options.coverageThreshold || null
          }
        ), validator_errors
      )
    );
  }

  const fastResults = await Promise.all(fastValidators);

  for (const { name, result } of fastResults) {
    if (result) details[name] = result;
  }

  // Run validator 5 (constitutional) — supports agent teams or Promise.all
  if (applicableValidators.includes('constitutional')) {
    try {
      const constitutionalResult = await validateConstitutionalCompliance(
        inputs.constitution || null,
        inputs.articleIds || null,
        inputs.artifactContents || null,
        {
          useAgentTeams: options.useAgentTeams || false,
          maxFileLines: options.maxFileLines || 500,
          priorPhaseGates: inputs.priorPhaseGates || [],
          ...(options.constitutionalOptions || {})
        }
      );
      details.constitutional = constitutionalResult;
    } catch (err) {
      validator_errors.push(`constitutional: ${err.message}`);
    }
  }

  // Merge results
  const failures = [];
  let pass = true;

  for (const [validatorName, result] of Object.entries(details)) {
    if (result && result.pass === false) {
      pass = false;
      failures.push({ validator: validatorName, result });
    }
  }

  return {
    pass,
    failures,
    details,
    validator_errors
  };
}

/**
 * Run a validator safely with error catching.
 *
 * @param {string} name - Validator name
 * @param {Function} fn - Validator function
 * @param {string[]} errors - Error accumulator
 * @returns {Promise<{ name: string, result: object|null }>}
 */
async function runSafe(name, fn, errors) {
  try {
    const result = fn();
    // Handle both sync and async validators
    const resolved = result instanceof Promise ? await result : result;
    return { name, result: resolved };
  } catch (err) {
    errors.push(`${name}: ${err.message}`);
    return { name, result: null };
  }
}
