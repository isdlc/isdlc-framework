/**
 * Shared Content Classification Schema
 *
 * Defines the classification types and portability levels used by all
 * content classification modules (agents, skills, commands, topics).
 * Pure data — no runtime logic.
 *
 * Requirements: REQ-0099 FR-001 (AC-001-02)
 * @module src/core/content/content-model
 */

/** Classification type: what kind of content a section contains */
export const CLASSIFICATION_TYPES = Object.freeze({
  ROLE_SPEC: 'role_spec',
  RUNTIME_PACKAGING: 'runtime_packaging',
  MIXED: 'mixed'
});

/** Portability level: how portable a section is across providers */
export const PORTABILITY = Object.freeze({
  FULL: 'full',
  PARTIAL: 'partial',
  NONE: 'none'
});

const VALID_TYPES = new Set(Object.values(CLASSIFICATION_TYPES));
const VALID_PORTABILITY = new Set(Object.values(PORTABILITY));

/**
 * Create a frozen section classification entry.
 *
 * @param {string} name - Section name identifier
 * @param {string} type - One of CLASSIFICATION_TYPES values
 * @param {string} portability - One of PORTABILITY values
 * @returns {Readonly<{name: string, type: string, portability: string}>}
 * @throws {Error} If type or portability is invalid
 */
export function createSectionEntry(name, type, portability) {
  if (!VALID_TYPES.has(type)) {
    throw new Error(`Invalid classification type: "${type}". Valid: ${[...VALID_TYPES].join(', ')}`);
  }
  if (!VALID_PORTABILITY.has(portability)) {
    throw new Error(`Invalid portability: "${portability}". Valid: ${[...VALID_PORTABILITY].join(', ')}`);
  }
  return Object.freeze({ name, type, portability });
}
