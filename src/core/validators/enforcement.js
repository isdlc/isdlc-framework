/**
 * Enforcement Layering — Core module
 * ====================================
 * Wraps gate-logic check() with evidence production.
 * Establishes the enforcement layering pattern (REQ-0088):
 * hooks call core validateAndProduceEvidence(), get structured evidence back,
 * then decide whether to block.
 *
 * @module src/core/validators/enforcement
 */

import { check } from './gate-logic.js';

/**
 * Validate a checkpoint and produce structured evidence.
 *
 * This wraps the existing gate-logic check() function and adds
 * evidence production. Hooks call this instead of check() directly,
 * getting back a structured evidence object they can use for decisions.
 *
 * @param {string} checkpoint - The checkpoint name (e.g., 'gate-advancement')
 * @param {object} context - The validation context
 * @param {object} [context.input] - Hook input object
 * @param {object} [context.state] - Project state
 * @param {object} [context.requirements] - Iteration requirements
 * @param {object} [context.manifest] - Skills manifest
 * @param {object} [context.helpers] - Optional helper functions
 * @returns {{ valid: boolean, evidence: object, timestamp: string, checkpoint: string }}
 */
export function validateAndProduceEvidence(checkpoint, context) {
  const timestamp = new Date().toISOString();

  try {
    const result = check(context);

    const valid = result.decision !== 'block';

    return {
      valid,
      evidence: result,
      timestamp,
      checkpoint
    };
  } catch {
    // Fail-open (Article X): if validation itself fails, allow passage
    return {
      valid: true,
      evidence: { decision: 'allow', reason: 'enforcement_error' },
      timestamp,
      checkpoint
    };
  }
}
