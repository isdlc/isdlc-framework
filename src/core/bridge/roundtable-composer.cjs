/**
 * CJS Bridge for Roundtable Runtime Composer
 *
 * Provides an async CJS-callable interface to the ESM runtime-composer module.
 * CJS consumers (hooks, analyze handler) await this bridge, which lazily
 * imports the ESM module via dynamic import() and caches it between calls.
 *
 * Fail-safe: All error paths return a safe default result (Article X).
 *   - ESM import failure          → { effectiveStateMachine: defaultStateMachine, conflicts: [], warnings: [{reason}] }
 *   - composeEffectiveStateMachine throws → same safe default
 *   - Invalid inputs              → delegated to ESM module's own fail-open logic
 *
 * REQ-GH-235 FR-005, AC-005-04
 * Traces: FR-005 AC-005-04 — Runtime composes effective protocol at dispatch time
 * @module src/core/bridge/roundtable-composer
 * @version 1.0.0
 */

'use strict';

let _composerModule = null;

/**
 * Lazily load and cache the ESM runtime-composer module.
 * @returns {Promise<object|null>} The imported module, or null on import failure.
 */
async function getComposer() {
  if (_composerModule) return _composerModule;
  try {
    _composerModule = await import('../roundtable/runtime-composer.js');
    return _composerModule;
  } catch {
    return null;
  }
}

/**
 * Compose the effective roundtable state machine from defaults + persona declarations.
 *
 * Bridges to composeEffectiveStateMachine() in the ESM runtime-composer module.
 * On any failure, returns the default state machine unchanged with a warning
 * (fail-open per Article X — roundtable proceeds with defaults).
 *
 * @param {object} defaultStateMachine - { states: State[], transitions?: Transition[] }
 * @param {Array<object>} personaFiles - loaded persona files with frontmatter
 * @returns {Promise<{effectiveStateMachine: object, conflicts: Array, warnings: Array}>}
 */
async function composeEffectiveStateMachine(defaultStateMachine, personaFiles) {
  const fallback = {
    effectiveStateMachine: defaultStateMachine || { states: [], transitions: [] },
    conflicts: [],
    warnings: [{ persona: '<bridge>', reason: 'runtime-composer ESM module unavailable; using default state machine' }]
  };

  const mod = await getComposer();
  if (!mod || typeof mod.composeEffectiveStateMachine !== 'function') {
    return fallback;
  }

  try {
    return mod.composeEffectiveStateMachine(defaultStateMachine, personaFiles);
  } catch {
    return fallback;
  }
}

/**
 * Validate promotion frontmatter for a persona file.
 *
 * Bridges to validatePromotionFrontmatter() in the ESM runtime-composer module.
 * On failure, returns { valid: false, errors: ['bridge unavailable'] }.
 *
 * @param {object} frontmatter - Persona frontmatter object
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
async function validatePromotionFrontmatter(frontmatter) {
  const mod = await getComposer();
  if (!mod || typeof mod.validatePromotionFrontmatter !== 'function') {
    return { valid: false, errors: ['runtime-composer ESM module unavailable'] };
  }

  try {
    return mod.validatePromotionFrontmatter(frontmatter);
  } catch {
    return { valid: false, errors: ['validatePromotionFrontmatter threw unexpectedly'] };
  }
}

/**
 * Detect personas targeting the same insertion point.
 *
 * Bridges to detectInsertionConflicts() in the ESM runtime-composer module.
 * On failure, returns empty array (fail-open).
 *
 * @param {Array<object>} personaFiles - loaded persona files with frontmatter
 * @returns {Promise<Array<object>>}
 */
async function detectInsertionConflicts(personaFiles) {
  const mod = await getComposer();
  if (!mod || typeof mod.detectInsertionConflicts !== 'function') {
    return [];
  }

  try {
    return mod.detectInsertionConflicts(personaFiles);
  } catch {
    return [];
  }
}

module.exports = {
  composeEffectiveStateMachine,
  validatePromotionFrontmatter,
  detectInsertionConflicts
};
